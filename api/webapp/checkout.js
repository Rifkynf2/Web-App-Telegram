const { getMasterSupabase } = require('../_lib/masterSupabase');
const { validateTelegramInitData } = require('../_lib/telegramAuth');
const { success, error, forbidden, notFound, serverError, handleCors } = require('../_lib/response');

/**
 * Shared by both handlers below: validate the buyer's Telegram initData and
 * resolve their tenant's bot server URL. Vercel Hobby is capped at 12
 * serverless functions, so GET (profile) and POST (checkout) share this one
 * file/route instead of each getting their own — see api/admin/[resource].js
 * for the same consolidation pattern.
 */
async function resolveBuyerContext(req) {
    const botId = req.method === 'GET' ? req.query?.bot_id : req.body?.bot_id;
    const initData = req.headers['x-telegram-init-data'];

    if (!botId) return { error: { status: 400, message: 'bot_id is required' } };
    if (!initData) return { error: { status: 403, message: 'Telegram initData is required' } };

    const tgAuth = await validateTelegramInitData(initData, botId);
    if (!tgAuth.valid || !tgAuth.user?.id) {
        return { error: { status: 403, message: tgAuth.error || 'Telegram auth failed' } };
    }

    const masterDb = getMasterSupabase();
    const { data: tenant, error: tenantError } = await masterDb
        .from('tenants')
        .select('status, metadata')
        .eq('bot_id', botId)
        .single();

    if (tenantError || !tenant) {
        return { error: { status: 404, message: 'Toko tidak ditemukan' } };
    }

    if (tenant.status !== 'ACTIVE') {
        const messages = {
            SUSPENDED: 'Toko sedang dinonaktifkan sementara',
            EXPIRED: 'Masa sewa toko telah habis',
            BANNED: 'Toko telah diblokir oleh administrator',
        };
        return { error: { status: 403, message: messages[tenant.status] || 'Toko tidak aktif' } };
    }

    const botApiBaseUrl = String(tenant.metadata?.bot_api_base_url || '').replace(/\/+$/, '');
    if (!botApiBaseUrl) {
        return { error: { status: 412, message: 'Bot server URL belum dikonfigurasi di metadata tenant' } };
    }

    return { botId, tenant, botApiBaseUrl, chatId: tgAuth.user.id, username: tgAuth.user.username || null };
}

function sendContextError(res, ctxError) {
    const { status, message } = ctxError;
    if (status === 404) return notFound(res, message);
    if (status === 403) return forbidden(res, message);
    return error(res, message, status);
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method === 'GET') return getBuyerProfile(req, res);
    if (req.method === 'POST') return createCheckout(req, res);
    return error(res, 'Method not allowed', 405);
};

/**
 * GET /api/webapp/checkout?bot_id=xxx
 * Header: X-Telegram-Init-Data
 *
 * Returns the requesting buyer's own balance + fulfilled transaction count.
 *
 * Relays to the tenant's own bot server (which holds that tenant's Supabase
 * service_role key) rather than having the browser query the tenant DB
 * directly with the anon key — the tenant DB's `users`/`transactions` RLS
 * used to grant anon unrestricted-by-row SELECT, so a direct client query
 * (as this replaces) could read any other buyer's balance/history, not just
 * the caller's own.
 */
async function getBuyerProfile(req, res) {
    try {
        const ctx = await resolveBuyerContext(req);
        if (ctx.error) return sendContextError(res, ctx.error);

        const relayResponse = await fetch(`${ctx.botApiBaseUrl}/api/internal/buyer/profile?chat_id=${encodeURIComponent(ctx.chatId)}`, {
            method: 'GET',
            headers: {
                'X-Internal-Api-Secret': process.env.INTERNAL_API_SECRET,
            },
        });

        const relayData = await relayResponse.json().catch(() => ({}));
        if (!relayResponse.ok) {
            return error(res, relayData.error || 'Gagal memuat profil', relayResponse.status);
        }

        return success(res, {
            balance: relayData.balance || 0,
            transaction_count: relayData.transaction_count || 0,
        });
    } catch (err) {
        console.error('[API/webapp/checkout:GET] Error:', err.message);
        return serverError(res);
    }
}

/**
 * POST /api/webapp/checkout
 * Body: { bot_id, variant_id, qty }
 * Header: X-Telegram-Init-Data
 */
async function createCheckout(req, res) {
    const variantId = req.body?.variant_id;
    const qty = parseInt(req.body?.qty, 10) || 0;

    if (!variantId || qty < 1) {
        return error(res, 'bot_id, variant_id, and qty are required');
    }

    try {
        const ctx = await resolveBuyerContext(req);
        if (ctx.error) return sendContextError(res, ctx.error);

        const { data: sub } = await getMasterSupabase()
            .from('subscriptions')
            .select('expiry_date')
            .eq('bot_id', ctx.botId)
            .order('expiry_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (sub && new Date(sub.expiry_date) < new Date()) {
            return forbidden(res, 'Masa sewa toko telah habis. Hubungi pemilik toko.');
        }

        const relayResponse = await fetch(`${ctx.botApiBaseUrl}/api/internal/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Api-Secret': process.env.INTERNAL_API_SECRET,
            },
            body: JSON.stringify({
                chat_id: ctx.chatId,
                username: ctx.username,
                variant_id: variantId,
                qty,
            }),
        });

        const relayData = await relayResponse.json().catch(() => ({}));
        if (!relayResponse.ok) {
            return error(res, relayData.error || 'Checkout relay failed', relayResponse.status);
        }

        return success(res, {
            trx_id: relayData.trx_id,
            total_amount: relayData.total_amount,
            qris_sent: relayData.qris_sent === true,
            telegram_message_id: relayData.telegram_message_id || null,
        });
    } catch (err) {
        console.error('[API/webapp/checkout:POST] Error:', err.message);
        return serverError(res);
    }
}
