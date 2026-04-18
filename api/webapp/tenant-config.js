const { getMasterSupabase } = require('../_lib/masterSupabase');
const { validateTelegramInitData } = require('../_lib/telegramAuth');
const { success, error, notFound, forbidden, serverError, handleCors } = require('../_lib/response');

async function getBotProfilePhotoUrl(botToken) {
    if (!botToken) return null;

    try {
        const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const meJson = await meRes.json().catch(() => ({}));
        const botId = meJson?.result?.id;
        if (!meRes.ok || !botId) return null;

        const photosRes = await fetch(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${botId}&limit=1`);
        const photosJson = await photosRes.json().catch(() => ({}));
        const fileId = photosJson?.result?.photos?.[0]?.[0]?.file_id;
        if (!photosRes.ok || !fileId) return null;

        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
        const fileJson = await fileRes.json().catch(() => ({}));
        const filePath = fileJson?.result?.file_path;
        if (!fileRes.ok || !filePath) return null;

        return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    } catch (err) {
        console.error('[API/webapp/tenant-config] Bot photo lookup error:', err.message);
        return null;
    }
}

/**
 * GET /api/webapp/tenant-config?bot_id=xxx
 * 
 * Web Mini App calls this to get tenant DB credentials.
 * Returns ONLY anon_key (safe for browser) — NEVER service_role key.
 * 
 * Auth: Optional Telegram initData validation.
 *       Even without initData, only anon_key is returned (safe).
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return error(res, 'Method not allowed', 405);
    }

    const botId = req.query.bot_id;
    if (!botId) {
        return error(res, 'bot_id query parameter is required');
    }

    try {
        const masterDb = getMasterSupabase();

        // 1. Validate Telegram initData if present (optional but recommended)
        let telegramUser = null;
        const initData = req.headers['x-telegram-init-data'];
        if (initData) {
            const tgAuth = await validateTelegramInitData(initData, botId);
            if (tgAuth.valid) {
                telegramUser = tgAuth.user;

                // Upsert telegram user to master DB (non-blocking)
                masterDb.from('telegram_users').upsert({
                    telegram_id: tgAuth.user.id,
                    username: tgAuth.user.username || null,
                    first_name: tgAuth.user.first_name || null,
                    last_name: tgAuth.user.last_name || null,
                    language_code: tgAuth.user.language_code || 'id',
                    last_seen_at: new Date().toISOString()
                }, { onConflict: 'telegram_id' }).then(() => {}).catch(() => {});
            }
        }

        // 2. Check tenant exists and is active
        const { data: tenant, error: tErr } = await masterDb
            .from('tenants')
            .select('status, shop_name, username, bot_token')
            .eq('bot_id', botId)
            .single();

        if (tErr || !tenant) {
            return notFound(res, 'Toko tidak ditemukan');
        }

        if (tenant.status !== 'ACTIVE') {
            const messages = {
                'SUSPENDED': 'Toko sedang dinonaktifkan sementara',
                'EXPIRED': 'Masa sewa toko telah habis',
                'BANNED': 'Toko telah diblokir oleh administrator'
            };
            return forbidden(res, messages[tenant.status] || 'Toko tidak aktif');
        }

        // 3. Check subscription is still valid
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

        // 4. Get tenant DB credentials (anon_key ONLY)
        const { data: config, error: cErr } = await masterDb
            .from('tenant_configs')
            .select('supabase_url, supabase_anon_key')
            .eq('bot_id', botId)
            .single();

        if (cErr || !config) {
            return notFound(res, 'Konfigurasi toko tidak ditemukan');
        }

        const botPhotoUrl = await getBotProfilePhotoUrl(tenant.bot_token);

        // 5. Return safe credentials
        return success(res, {
            supabase_url: config.supabase_url,
            supabase_anon_key: config.supabase_anon_key,
            shop_name: tenant.shop_name,
            bot_username: tenant.username,
            bot_photo_url: botPhotoUrl,
            telegram_user: telegramUser
        });
    } catch (err) {
        console.error('[API/webapp/tenant-config] Error:', err.message);
        return serverError(res);
    }
};
