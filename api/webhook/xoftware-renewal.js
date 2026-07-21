const crypto = require('crypto');
const axios = require('axios');
const { getMasterSupabase } = require('../_lib/masterSupabase');
const { success, error, serverError, handleCors } = require('../_lib/response');

/**
 * POST /api/webhook/xoftware-renewal?token=SAAS_WEBHOOK_SECRET
 *
 * Centralized Xoftware Pay callback for SaaS subscription renewals.
 * Uses a dedicated Xoftware merchant account (XOFTWARE_MERCHANT_ID/API_KEY),
 * separate from any tenant's own shop account.
 *
 * SECURITY: FAIL-CLOSED
 *   All env vars mandatory. Missing = 500, not skip.
 *
 * IDEMPOTENCY: ATOMIC DATABASE TRANSACTION (RPC)
 *   All finalization runs inside process_renewal_payment() RPC.
 *   If any step fails → full rollback → invoice stays PENDING → retry works.
 *
 * NOTIFICATION DELIVERY: TRACKED + RETRIABLE
 *   notification_sent and qris_deleted booleans track delivery state.
 *   Duplicate callbacks retry notification/deletion if not yet completed.
 *   Both 'success' and 'already_processed' paths share the same delivery logic.
 *
 * NOTIFICATION TARGET: QRIS_CHAT_ID PRIORITY
 *   Notification sent to qris_chat_id first, fallback to owner_chat_id.
 *
 * ENV required on Vercel (ALL MANDATORY):
 *   - SAAS_WEBHOOK_SECRET
 *   - SAAS_XOFTWARE_WEBHOOK_SECRET
 *   - XOFTWARE_MERCHANT_ID
 *   - XOFTWARE_API_KEY
 *   - XOFTWARE_BASE_URL
 *   - MASTER_SUPABASE_URL + MASTER_SUPABASE_SERVICE_KEY
 */

// Vercel auto-parses JSON bodies by default, which discards the exact raw
// bytes received. HMAC verification below needs those exact bytes — a
// re-serialized JSON.stringify(req.body) can differ byte-for-byte from what
// Xoftware actually sent (key order, spacing, number formatting), which
// would make a genuinely valid signature look invalid.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function verifyWebhookSignature(rawBody, signature, webhookSecret) {
    if (!signature || !webhookSecret) return false;
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * HMAC-SHA256 request signing per Xoftware "Authentication & Signature" docs.
 */
function signRequest(apiKey, method, path, bodyString) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const message = `${timestamp}\n${method.toUpperCase()}\n${path}\n${bodyString}`;
    const signature = crypto.createHmac('sha256', apiKey).update(message, 'utf8').digest('base64');
    return { timestamp, signature };
}

async function getXoftwareTransactionStatus(orderId) {
    const baseUrl = process.env.XOFTWARE_BASE_URL;
    const apiKey = process.env.XOFTWARE_API_KEY;
    const path = '/v1/api/transactions/status';
    const bodyString = JSON.stringify({ ref_id: orderId });
    const { timestamp, signature } = signRequest(apiKey, 'POST', path, bodyString);

    const response = await axios.post(`${baseUrl}${path}`, bodyString, {
        headers: {
            'X-API-Key': apiKey,
            'X-Timestamp': timestamp,
            'X-Signature': signature,
            'Content-Type': 'application/json',
        },
        timeout: 10000,
    });
    // Every Xoftware response is wrapped in a standard envelope
    // { code, error, message, data } — the actual payload is one level
    // deeper than it looks from the (unwrapped) examples in their docs.
    return response.data?.data;
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return error(res, 'Method not allowed', 405);
    }

    try {
        // ========== LAYER 0: Fail-Closed Env Guard ==========
        const expectedToken = process.env.SAAS_WEBHOOK_SECRET;
        // Xoftware's dashboard hasn't surfaced this account's Webhook Secret (HMAC)
        // yet (field is read-only and empty — provisioning gap on their side, still
        // being chased with support). Left unset, LAYER 2 below is skipped rather
        // than failing closed, so the webhook stays usable via the URL token +
        // reverse-verification layers alone. Once Xoftware provides the real
        // secret, set SAAS_XOFTWARE_WEBHOOK_SECRET and this layer re-activates
        // automatically — no code change needed.
        const webhookHmacSecret = process.env.SAAS_XOFTWARE_WEBHOOK_SECRET;
        const xoftwareMerchantId = process.env.XOFTWARE_MERCHANT_ID;
        const xoftwareApiKey = process.env.XOFTWARE_API_KEY;

        if (!expectedToken) {
            console.error('[Renewal-Webhook] FATAL: SAAS_WEBHOOK_SECRET not configured. Refusing to process.');
            return serverError(res, 'Server misconfiguration');
        }
        if (!webhookHmacSecret) {
            console.warn('[Renewal-Webhook] SAAS_XOFTWARE_WEBHOOK_SECRET not configured — skipping X-Signature verification (relying on URL token + reverse-verification only).');
        }
        if (!xoftwareMerchantId || !xoftwareApiKey) {
            console.error('[Renewal-Webhook] FATAL: XOFTWARE_MERCHANT_ID or XOFTWARE_API_KEY not configured. Refusing to process.');
            return serverError(res, 'Server misconfiguration');
        }

        // ========== LAYER 1: URL Secret Token (MANDATORY) ==========
        if (req.query.token !== expectedToken) {
            console.error('[Renewal-Webhook] Invalid or missing token');
            return error(res, 'Forbidden', 403);
        }

        const rawBody = await readRawBody(req);
        const signature = req.headers['x-signature'];

        // ========== LAYER 2: HMAC Signature (skipped if not yet configured — see note above) ==========
        if (webhookHmacSecret && !verifyWebhookSignature(rawBody, signature, webhookHmacSecret)) {
            console.error('[Renewal-Webhook] Invalid X-Signature');
            return error(res, 'Invalid signature', 403);
        }

        let body;
        try {
            body = JSON.parse(rawBody.toString('utf8') || '{}');
        } catch (parseErr) {
            return error(res, 'Invalid JSON body');
        }

        console.log('[Renewal-Webhook] Callback received from Xoftware');

        const eventId = req.headers['x-event-id'] || body.event_id;
        const orderId = body.order_id;
        const amount = parseInt(body.amount);
        const status = body.status; // "SUCCESS" / "FAILED"

        if (!orderId || !amount || isNaN(amount)) {
            return error(res, 'Missing or invalid order_id / amount');
        }

        if (status !== 'SUCCESS') {
            return success(res, { message: `Status ${status}, ignored` });
        }

        // ========== LAYER 3: Reverse Verification with Xoftware API (MANDATORY) ==========
        try {
            const txDetail = await getXoftwareTransactionStatus(orderId);
            if (!txDetail || txDetail.status !== 'SUCCESS') {
                console.error(`[Renewal-Webhook] Reverse verification FAILED for ${orderId}: status=${txDetail?.status}`);
                return error(res, 'Verification failed', 400);
            }
            console.log(`[Renewal-Webhook] Reverse verification PASSED for ${orderId}`);
        } catch (verifyErr) {
            console.error(`[Renewal-Webhook] Reverse verify error:`, verifyErr.message);
            return error(res, 'Verification error', 400);
        }

        // ========== LAYER 4: Atomic Payment Finalization (Single Transaction) ==========
        const masterDb = getMasterSupabase();

        const { data: rpcResult, error: rpcErr } = await masterDb
            .rpc('process_renewal_payment', {
                p_invoice_id: orderId,
                p_amount: amount,
            });

        if (rpcErr) {
            console.error(`[Renewal-Webhook] RPC error for ${orderId}:`, rpcErr.message);
            return serverError(res, 'Payment processing failed');
        }

        const result = rpcResult;

        // Terminal failures — no retry possible
        if (result.status === 'not_found') {
            console.error(`[Renewal-Webhook] Invoice not found: ${orderId}`);
            return error(res, 'Invoice not found', 404);
        }
        if (result.status === 'invalid_status') {
            console.error(`[Renewal-Webhook] Invoice ${orderId} has invalid status: ${result.current_status}`);
            return error(res, `Invoice not in PENDING state (current: ${result.current_status})`, 409);
        }

        // ========== LAYER 5: Notification & QRIS Cleanup (Tracked + Retriable) ==========
        // Both 'success' and 'already_processed' enter this path.
        // The tracking booleans determine what still needs to be done.
        //
        // Flow:
        //   'success'           → notification_sent=false, qris_deleted=false → do both
        //   'already_processed' → check actual tracking state → retry what's missing
        //   'already_processed' + both true → pure no-op (all done)

        if (result.status === 'success') {
            console.log(`[Renewal-Webhook] ✅ Invoice ${orderId} PAID atomically. Bot ${result.bot_id} extended to ${result.new_expiry}`);
        } else if (result.status === 'already_processed') {
            if (result.notification_sent && result.qris_deleted) {
                console.log(`[Renewal-Webhook] Invoice ${orderId} fully completed (duplicate callback), no-op`);
                return success(res, { message: 'Already processed' });
            }
            console.log(`[Renewal-Webhook] Invoice ${orderId} PAID but delivery incomplete (notif=${result.notification_sent}, qris_del=${result.qris_deleted}). Retrying...`);
        } else {
            console.error(`[Renewal-Webhook] Unexpected RPC result for ${orderId}:`, result);
            return serverError(res, 'Unexpected processing result');
        }

        // ── Shared delivery logic for both 'success' and incomplete 'already_processed' ──
        const { bot_id, new_expiry, duration_days,
                bot_token, owner_chat_id, bot_api_base_url } = result;
        // qris ids as let — may be overwritten by fallback query below
        let qris_chat_id = result.qris_chat_id;
        let qris_message_id = result.qris_message_id;
        const needsNotification = !result.notification_sent;

        // Race condition guard: RPC captures QRIS ids via RETURNING at the moment of the
        // UPDATE. If update-qris-info (called by bot after sending the photo) hasn't
        // committed yet, both values come back null. Re-query the row to get the
        // up-to-date values before deciding whether deletion is needed.
        if (!result.qris_deleted && (!qris_chat_id || !qris_message_id)) {
            console.warn(`[Renewal-Webhook] ⚠️ QRIS ids null from RPC for ${orderId} — race condition suspected, querying DB for current values...`);
            try {
                const { data: invRow, error: invFbErr } = await masterDb
                    .from('rental_invoices')
                    .select('qris_chat_id, qris_message_id')
                    .eq('id', orderId)
                    .single();
                if (invFbErr) {
                    console.error(`[Renewal-Webhook] DB fallback query error for ${orderId}:`, invFbErr.message);
                } else if (invRow?.qris_chat_id && invRow?.qris_message_id) {
                    qris_chat_id = invRow.qris_chat_id;
                    qris_message_id = invRow.qris_message_id;
                    console.log(`[Renewal-Webhook] ✅ DB fallback got QRIS ids for ${orderId}: chat=${qris_chat_id} msg=${qris_message_id}`);
                } else {
                    console.warn(`[Renewal-Webhook] DB fallback: still no QRIS ids for ${orderId} — QRIS message will not be deleted`);
                }
            } catch (fbErr) {
                console.error(`[Renewal-Webhook] DB fallback exception for ${orderId}:`, fbErr.message);
            }
        }

        const needsQrisDeletion = !result.qris_deleted && qris_chat_id && qris_message_id;

        // 4a. Send success notification
        if (needsNotification && bot_token) {
            const notifyChatId = qris_chat_id || owner_chat_id;

            if (notifyChatId) {
                const expiryFormatted = new Date(new_expiry).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric'
                });
                const now = new Date();
                const paidAtFormatted = now.toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false,
                });

                const message = `<b>✅ PEMBAYARAN SEWA BERHASIL</b>\n\n` +
                    `Produk: Perpanjang Sewa Bot (${duration_days} Hari)\n` +
                    `Status: <b>AKTIF</b>\n` +
                    `Dibayar pada: <code>${paidAtFormatted}</code>\n` +
                    `Aktif Sampai: <code>${expiryFormatted}</code>\n\n` +
                    `Terima kasih telah berlangganan! Bot Anda kini kembali aktif sepenuhnya.`;

                let notifSent = false;
                try {
                    await axios.post(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
                        chat_id: notifyChatId,
                        text: message,
                        parse_mode: 'HTML',
                    }, { timeout: 10000 });
                    notifSent = true;
                    console.log(`[Renewal-Webhook] 📨 Notification sent to chat ${notifyChatId}`);
                } catch (notifErr) {
                    console.error(`[Renewal-Webhook] Failed to notify chat ${notifyChatId}:`, notifErr.message);

                    // Fallback to owner if different
                    if (notifyChatId !== owner_chat_id && owner_chat_id) {
                        try {
                            await axios.post(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
                                chat_id: owner_chat_id,
                                text: message,
                                parse_mode: 'HTML',
                            }, { timeout: 10000 });
                            notifSent = true;
                            console.log(`[Renewal-Webhook] 📨 Fallback notification sent to owner ${owner_chat_id}`);
                        } catch (fallbackErr) {
                            console.error(`[Renewal-Webhook] Fallback notify also failed:`, fallbackErr.message);
                        }
                    }
                }

                // Track notification delivery
                if (notifSent) {
                    const { error: notifFlagErr } = await masterDb.from('rental_invoices')
                        .update({ notification_sent: true })
                        .eq('id', orderId);
                    if (notifFlagErr) console.error('[Renewal-Webhook] Failed to update notification_sent flag:', notifFlagErr.message);
                }
            }
        }

        // 4b. Delete QRIS message
        if (needsQrisDeletion && bot_token) {
            let qrisDeleted = false;
            try {
                await axios.post(`https://api.telegram.org/bot${bot_token}/deleteMessage`, {
                    chat_id: qris_chat_id,
                    message_id: qris_message_id,
                }, { timeout: 10000 });
                qrisDeleted = true;
                console.log(`[Renewal-Webhook] 🗑️ Deleted QRIS message ${qris_message_id} in chat ${qris_chat_id}`);
            } catch (delErr) {
                const tgDesc = delErr.response?.data?.description || delErr.message || '';
                const isAlreadyGone =
                    tgDesc.includes('message to delete not found') ||
                    tgDesc.includes("message can't be deleted");
                if (isAlreadyGone) {
                    qrisDeleted = true;
                    console.log(`[Renewal-Webhook] QRIS message already gone for ${orderId}: ${tgDesc}`);
                } else {
                    console.error(`[Renewal-Webhook] ❌ Could not delete QRIS message for ${orderId} (chat=${qris_chat_id} msg=${qris_message_id}): ${tgDesc}`);
                }
            }

            // Track QRIS deletion
            if (qrisDeleted) {
                const { error: qrisFlagErr } = await masterDb.from('rental_invoices')
                    .update({ qris_deleted: true })
                    .eq('id', orderId);
                if (qrisFlagErr) console.error('[Renewal-Webhook] Failed to update qris_deleted flag:', qrisFlagErr.message);
            }
        }

        // ========== LAYER 6: Notify Bot Instance to Invalidate Cache ==========
        // Best-effort, only on first successful finalization
        if (bot_api_base_url && (result.status === 'success' || needsQrisDeletion)) {
            try {
                const callbackResp = await axios.post(`${bot_api_base_url}/api/internal/renewal-callback`, {
                    action: 'invalidate_cache',
                    bot_id: bot_id,
                    invoice_id: orderId,
                    new_expiry: new_expiry,
                    qris_chat_id: qris_chat_id,
                    qris_message_id: qris_message_id,
                    qris_deleted: result.qris_deleted || false,
                }, {
                    headers: {
                        'X-Internal-Api-Secret': process.env.INTERNAL_API_SECRET || '',
                        'Content-Type': 'application/json',
                    },
                    timeout: 5000,
                });
                console.log(`[Renewal-Webhook] 🔄 Cache invalidation sent to ${bot_api_base_url}`);
                const fallbackDeleted = callbackResp.data?.qris_deleted === true;

                if (fallbackDeleted && !result.qris_deleted) {
                    const { error: fallbackFlagErr } = await masterDb.from('rental_invoices')
                        .update({ qris_deleted: true })
                        .eq('id', orderId);
                    if (fallbackFlagErr) console.error('[Renewal-Webhook] Failed to persist fallback qris_deleted flag:', fallbackFlagErr.message);
                }
            } catch (cacheErr) {
                console.log(`[Renewal-Webhook] Cache invalidation to bot failed (non-fatal): ${cacheErr.message}`);
            }
        }

        return success(res, {
            message: result.status === 'success' ? 'Payment processed successfully' : 'Delivery retried',
        });
    } catch (err) {
        console.error('[Renewal-Webhook] Critical error:', err.message);
        return serverError(res);
    }
};
