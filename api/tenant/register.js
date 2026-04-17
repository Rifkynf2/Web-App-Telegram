const { getMasterSupabase } = require('../_lib/masterSupabase');
const { verifyHMAC } = require('../_lib/hmacAuth');
const { success, error, unauthorized, serverError, handleCors } = require('../_lib/response');

/**
 * POST /api/tenant/register
 * 
 * Auto-register / update tenant info saat bot startup.
 * Auth: HMAC-SHA256 signature
 * 
 * Body: { username, shop_name, owner_chat_id, db_url, db_anon_key, bot_token? }
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return error(res, 'Method not allowed', 405);
    }

    // 1. Verify HMAC
    const body = JSON.stringify(req.body || {});
    const auth = verifyHMAC(req.headers, body);

    if (!auth.valid) {
        return unauthorized(res, auth.error);
    }

    const botId = parseInt(auth.botId);
    const { username, shop_name, owner_chat_id, db_url, db_anon_key, bot_token, metadata } = req.body;

    if (!shop_name || !owner_chat_id) {
        return error(res, 'shop_name and owner_chat_id are required');
    }

    try {
        const masterDb = getMasterSupabase();
        const { data: existingTenant } = await masterDb
            .from('tenants')
            .select('metadata')
            .eq('bot_id', botId)
            .maybeSingle();

        // 2. Upsert tenant info
        const tenantData = {
            bot_id: botId,
            username: username || null,
            shop_name,
            owner_chat_id: parseInt(owner_chat_id),
            status: 'ACTIVE',
            db_url: db_url || null,
            db_anon_key: db_anon_key || null,
        };

        if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
            tenantData.metadata = {
                ...(existingTenant?.metadata || {}),
                ...metadata
            };
        }

        // Include bot_token if provided (needed for Telegram initData validation)
        if (bot_token) {
            tenantData.bot_token = bot_token;
        }

        const { error: tErr } = await masterDb
            .from('tenants')
            .upsert(tenantData, { onConflict: 'bot_id' });

        if (tErr) {
            console.error('[API/tenant/register] Tenant upsert failed:', tErr.message);
            return serverError(res, 'Failed to register tenant');
        }

        // 3. Upsert tenant_configs (DB credentials for web app lookup)
        if (db_url && db_anon_key) {
            const { error: tcErr } = await masterDb
                .from('tenant_configs')
                .upsert({
                    bot_id: botId,
                    supabase_url: db_url,
                    supabase_anon_key: db_anon_key,
                }, { onConflict: 'bot_id' });

            if (tcErr) {
                console.error('[API/tenant/register] Config upsert failed:', tcErr.message);
                // Non-fatal — continue
            }
        }

        // 4. Ensure subscription exists (create trial if new/expired)
        const { data: existingSub } = await masterDb
            .from('subscriptions')
            .select('bot_id, expiry_date, status')
            .eq('bot_id', botId)
            .order('expiry_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        const now = new Date();
        const isNew = !existingSub;
        const isExpired = existingSub && new Date(existingSub.expiry_date) < now;

        if (isNew) {
            // New tenant — create trial subscription
            const trialExpiry = new Date();
            trialExpiry.setDate(trialExpiry.getDate() + 1); // Trial 1 hari

            // Get Trial plan ID
            const { data: trialPlan } = await masterDb
                .from('plans')
                .select('id')
                .eq('name', 'Trial')
                .single();

            await masterDb.from('subscriptions').insert({
                bot_id: botId,
                plan_id: trialPlan?.id || null,
                start_date: now.toISOString(),
                expiry_date: trialExpiry.toISOString(),
                status: 'TRIAL'
            });

            console.log(`[API/tenant/register] New tenant: ${username} (Trial 1 Day)`);
        }

        // 5. Audit log
        await masterDb.from('audit_logs').insert({
            bot_id: botId,
            actor: 'bot',
            action: isNew ? 'TENANT_REGISTERED' : 'TENANT_UPDATED',
            entity: 'tenants',
            detail: { username, shop_name }
        });

        return success(res, {
            registered: true,
            isNew,
            message: isNew ? 'Tenant registered with trial' : 'Tenant info updated'
        });
    } catch (err) {
        console.error('[API/tenant/register] Error:', err.message);
        return serverError(res);
    }
};
