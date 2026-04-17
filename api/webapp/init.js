const { getMasterSupabase } = require('../_lib/masterSupabase');
const { validateTelegramInitData } = require('../_lib/telegramAuth');
const { success, error, unauthorized, serverError, handleCors } = require('../_lib/response');
const crypto = require('crypto');

/**
 * POST /api/webapp/init
 * 
 * Initialize web app session. Validates Telegram initData and
 * creates a session record in master DB.
 * 
 * Body: { initData: string, bot_id: string }
 * 
 * Returns: session token + tenant config + user info
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return error(res, 'Method not allowed', 405);
    }

    const { initData, bot_id } = req.body || {};

    if (!initData || !bot_id) {
        return error(res, 'initData and bot_id are required');
    }

    try {
        // 1. Validate Telegram initData
        const tgAuth = await validateTelegramInitData(initData, bot_id);
        if (!tgAuth.valid) {
            return unauthorized(res, `Telegram auth failed: ${tgAuth.error}`);
        }

        const user = tgAuth.user;
        const masterDb = getMasterSupabase();

        // 2. Upsert telegram user
        await masterDb.from('telegram_users').upsert({
            telegram_id: user.id,
            username: user.username || null,
            first_name: user.first_name || null,
            last_name: user.last_name || null,
            language_code: user.language_code || 'id',
            last_seen_at: new Date().toISOString()
        }, { onConflict: 'telegram_id' });

        // 3. Create session (deduplicate by init_data_hash)
        const initDataHash = crypto
            .createHash('sha256')
            .update(initData)
            .digest('hex');

        // Check for existing session with same hash
        const { data: existingSession } = await masterDb
            .from('miniapp_sessions')
            .select('id, expires_at')
            .eq('init_data_hash', initDataHash)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();

        let sessionId;
        if (existingSession) {
            sessionId = existingSession.id;
        } else {
            const { data: newSession } = await masterDb
                .from('miniapp_sessions')
                .insert({
                    telegram_id: user.id,
                    bot_id: parseInt(bot_id),
                    init_data_hash: initDataHash,
                    device_info: {
                        platform: req.headers['sec-ch-ua-platform'] || 'unknown',
                        ua: req.headers['user-agent']?.substring(0, 200) || 'unknown'
                    }
                })
                .select('id')
                .single();

            sessionId = newSession?.id;
        }

        // 4. Get tenant config
        const { data: config } = await masterDb
            .from('tenant_configs')
            .select('supabase_url, supabase_anon_key')
            .eq('bot_id', bot_id)
            .single();

        const { data: tenant } = await masterDb
            .from('tenants')
            .select('shop_name, username, status')
            .eq('bot_id', bot_id)
            .single();

        return success(res, {
            session_id: sessionId,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                language_code: user.language_code
            },
            tenant: {
                shop_name: tenant?.shop_name,
                username: tenant?.username,
                status: tenant?.status
            },
            config: config ? {
                supabase_url: config.supabase_url,
                supabase_anon_key: config.supabase_anon_key
            } : null
        });
    } catch (err) {
        console.error('[API/webapp/init] Error:', err.message);
        return serverError(res);
    }
};
