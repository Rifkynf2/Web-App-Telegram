const { getMasterSupabase } = require('../../_lib/masterSupabase');
const { verifyHMAC } = require('../../_lib/hmacAuth');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('../../_lib/response');

/**
 * /api/tenant/subscription/[action]
 * Consolidated subscription sub-route handler.
 *
 * Handles: confirm-payment, update-qris-info
 * Auth: HMAC-SHA256 signature
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

    const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

    switch (action) {
        case 'confirm-payment':  return handleConfirmPayment(req, res);
        case 'mark-notified':    return handleMarkNotified(req, res);
        case 'update-qris-info': return handleUpdateQrisInfo(req, res);
        default:                 return error(res, `Unknown action: ${action}`, 404);
    }
};

// ── CONFIRM PAYMENT ───────────────────────────────────────────────────────────
// Used by the bot's renewal poller (src/handlers/rental.js) as a safety net
// when the Xoftware→Vercel webhook (api/webhook/xoftware-renewal.js) never
// arrives. Routes through the SAME atomic process_renewal_payment RPC the
// webhook uses (row-locked with FOR UPDATE), so a webhook delivery landing
// around the same time as a poller call can't double-extend a subscription.

async function handleConfirmPayment(req, res) {
    const body = JSON.stringify(req.body || {});
    const auth = verifyHMAC(req.headers, body);
    if (!auth.valid) return unauthorized(res, auth.error);

    const botId = parseInt(auth.botId);
    const { invoice_id, amount } = req.body;
    if (!invoice_id) return error(res, 'invoice_id is required');

    try {
        const masterDb = getMasterSupabase();

        // Ownership check before touching the RPC — process_renewal_payment is
        // scoped only by invoice id, it doesn't know which tenant is asking.
        const { data: inv, error: invError } = await masterDb
            .from('rental_invoices').select('id, bot_id').eq('id', invoice_id).single();
        if (invError || !inv) return notFound(res, 'Invoice not found');
        if (inv.bot_id !== botId) return error(res, 'Invoice does not belong to this bot', 403);

        const { data: rpcResult, error: rpcErr } = await masterDb
            .rpc('process_renewal_payment', { p_invoice_id: invoice_id, p_amount: amount });

        if (rpcErr) {
            console.error('[API/confirm-payment] RPC error:', rpcErr.message);
            return serverError(res, 'Payment processing failed');
        }

        if (rpcResult.status === 'not_found') return notFound(res, 'Invoice not found');
        if (rpcResult.status === 'invalid_status') {
            return error(res, `Invoice not in PENDING state (current: ${rpcResult.current_status})`, 409);
        }

        return success(res, {
            status: rpcResult.status,
            new_expiry: rpcResult.new_expiry,
            duration_days: rpcResult.duration_days,
            notification_sent: rpcResult.notification_sent,
            qris_deleted: rpcResult.qris_deleted,
        });
    } catch (err) {
        console.error('[API/confirm-payment] Error:', err.message);
        return serverError(res);
    }
}

// ── MARK NOTIFIED ──────────────────────────────────────────────────────────────
// Called by the bot's renewal poller right after it successfully sends the
// success message / deletes the QRIS photo itself, so a webhook delivery that
// arrives afterward sees notification_sent=true and skips sending it again.

async function handleMarkNotified(req, res) {
    const body = JSON.stringify(req.body || {});
    const auth = verifyHMAC(req.headers, body);
    if (!auth.valid) return unauthorized(res, auth.error);

    const botId = parseInt(auth.botId);
    const { invoice_id, qris_deleted } = req.body;
    if (!invoice_id) return error(res, 'invoice_id is required');

    try {
        const masterDb = getMasterSupabase();

        const { data: inv, error: invErr } = await masterDb
            .from('rental_invoices').select('id, bot_id, status').eq('id', invoice_id).single();
        if (invErr || !inv) return notFound(res, 'Invoice not found');
        if (inv.bot_id !== botId) return error(res, 'Invoice does not belong to this bot', 403);
        if (inv.status !== 'PAID') return error(res, 'Invoice not PAID yet', 409);

        const updatePayload = { notification_sent: true };
        if (qris_deleted) updatePayload.qris_deleted = true;

        const { error: updateErr } = await masterDb
            .from('rental_invoices').update(updatePayload).eq('id', invoice_id);
        if (updateErr) {
            console.error('[API/mark-notified] Update failed:', updateErr.message);
            return serverError(res, 'Failed to update notification flag');
        }

        return success(res, { message: 'Marked notified' });
    } catch (err) {
        console.error('[API/mark-notified] Error:', err.message);
        return serverError(res);
    }
}

// ── UPDATE QRIS INFO ──────────────────────────────────────────────────────────

async function handleUpdateQrisInfo(req, res) {
    const body = JSON.stringify(req.body || {});
    const auth = verifyHMAC(req.headers, body);
    if (!auth.valid) return unauthorized(res, auth.error);

    const botId = parseInt(auth.botId);
    const { invoice_id, qris_chat_id, qris_message_id } = req.body;

    if (!invoice_id) return error(res, 'invoice_id is required');
    if (!qris_chat_id || !qris_message_id) return error(res, 'qris_chat_id and qris_message_id are required');

    try {
        const masterDb = getMasterSupabase();

        const { data: inv, error: invErr } = await masterDb
            .from('rental_invoices').select('id, bot_id').eq('id', invoice_id).single();

        if (invErr || !inv) return notFound(res, 'Invoice not found');
        if (inv.bot_id !== botId) return error(res, 'Invoice does not belong to this bot', 403);

        const { error: updateErr } = await masterDb
            .from('rental_invoices')
            .update({ qris_chat_id: parseInt(qris_chat_id), qris_message_id: parseInt(qris_message_id) })
            .eq('id', invoice_id);

        if (updateErr) {
            console.error('[API/update-qris-info] Update failed:', updateErr.message);
            return serverError(res, 'Failed to update QRIS info');
        }

        return success(res, { message: 'QRIS info saved' });
    } catch (err) {
        console.error('[API/update-qris-info] Error:', err.message);
        return serverError(res);
    }
}
