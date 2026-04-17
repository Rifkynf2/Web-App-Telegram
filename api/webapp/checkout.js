const { getMasterSupabase } = require('../_lib/masterSupabase');
const { validateTelegramInitData } = require('../_lib/telegramAuth');
const { success, error, forbidden, notFound, serverError, handleCors } = require('../_lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return error(res, 'Method not allowed', 405);
    }

    const botId = req.body?.bot_id;
    const variantId = req.body?.variant_id;
    const qty = parseInt(req.body?.qty, 10) || 0;
    const initData = req.headers['x-telegram-init-data'];

    if (!botId || !variantId || qty < 1) {
        return error(res, 'bot_id, variant_id, and qty are required');
    }

    if (!initData) {
        return forbidden(res, 'Telegram initData is required');
    }

    try {
        const tgAuth = await validateTelegramInitData(initData, botId);
        if (!tgAuth.valid || !tgAuth.user?.id) {
            return forbidden(res, tgAuth.error || 'Telegram auth failed');
        }

        const masterDb = getMasterSupabase();
        const { data: tenant, error: tenantError } = await masterDb
            .from('tenants')
            .select('status, metadata')
            .eq('bot_id', botId)
            .single();

        if (tenantError || !tenant) {
            return notFound(res, 'Toko tidak ditemukan');
        }

        if (tenant.status !== 'ACTIVE') {
            const messages = {
                SUSPENDED: 'Toko sedang dinonaktifkan sementara',
                EXPIRED: 'Masa sewa toko telah habis',
                BANNED: 'Toko telah diblokir oleh administrator',
            };
            return forbidden(res, messages[tenant.status] || 'Toko tidak aktif');
        }

        const { data: sub } = await masterDb
            .from('subscriptions')
            .select('expiry_date')
            .eq('bot_id', botId)
            .order('expiry_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (sub && new Date(sub.expiry_date) < new Date()) {
            return forbidden(res, 'Masa sewa toko telah habis. Hubungi pemilik toko.');
        }

        const botApiBaseUrl = String(tenant.metadata?.bot_api_base_url || '').replace(/\/+$/, '');
        if (!botApiBaseUrl) {
            return error(res, 'Bot server URL belum dikonfigurasi di metadata tenant', 412);
        }

        const relayResponse = await fetch(`${botApiBaseUrl}/api/internal/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Api-Secret': process.env.INTERNAL_API_SECRET,
            },
            body: JSON.stringify({
                chat_id: tgAuth.user.id,
                username: tgAuth.user.username || null,
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
        console.error('[API/webapp/checkout] Error:', err.message);
        return serverError(res);
    }
};
