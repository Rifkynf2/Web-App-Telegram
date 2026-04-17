const { getMasterSupabase } = require('../_lib/masterSupabase');
const { verifyHMAC } = require('../_lib/hmacAuth');
const { success, error, unauthorized, serverError, handleCors } = require('../_lib/response');

/**
 * POST /api/tenant/validate
 * 
 * Bot tenant memanggil endpoint ini untuk cek apakah subscription masih aktif.
 * Auth: HMAC-SHA256 signature
 * 
 * Response:
 *   { active: true/false, expiryDate, planName, message? }
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return error(res, 'Method not allowed', 405);
    }

    // 1. Verify HMAC signature
    const body = JSON.stringify(req.body || {});
    const auth = verifyHMAC(req.headers, body);

    if (!auth.valid) {
        console.error('[API/tenant/validate] Auth failed:', auth.error);
        return unauthorized(res, auth.error);
    }

    const botId = auth.botId;

    try {
        const masterDb = getMasterSupabase();

        // 2. Fetch subscription with tenant status
        const { data, error: dbError } = await masterDb
            .from('subscriptions')
            .select('expiry_date, status, plan_id, plans(name), tenants!inner(status, shop_name)')
            .eq('bot_id', botId)
            .order('expiry_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (dbError) {
            console.error('[API/tenant/validate] DB error:', dbError.message);
            return serverError(res, 'Database error');
        }

        if (!data) {
            return success(res, {
                active: false,
                message: 'Bot tidak terdaftar di sistem pusat.'
            });
        }

        const expiryDate = new Date(data.expiry_date);
        const tenantStatus = data.tenants?.status;
        const now = new Date();

        // 3. Determine subscription status
        let result = {
            active: true,
            expiryDate: data.expiry_date,
            planName: data.plans?.name || 'Unknown',
            shopName: data.tenants?.shop_name
        };

        if (tenantStatus === 'BANNED') {
            result = {
                active: false,
                expiryDate: data.expiry_date,
                message: 'Bot ini telah DIBLOKIR oleh Administrator.'
            };
        } else if (tenantStatus === 'SUSPENDED') {
            result = {
                active: false,
                expiryDate: data.expiry_date,
                message: 'Bot ini telah dinonaktifkan oleh Developer.'
            };
        } else if (now > expiryDate) {
            result = {
                active: false,
                expiryDate: data.expiry_date,
                message: 'Masa sewa habis, silahkan hubungi Developer bot untuk perpanjang masa sewa.'
            };
        }

        // 4. Log access (non-blocking)
        masterDb.from('audit_logs').insert({
            bot_id: parseInt(botId),
            actor: 'bot',
            action: 'VALIDATE_SUBSCRIPTION',
            entity: 'subscriptions',
            detail: { active: result.active, ip: req.headers['x-forwarded-for'] || 'unknown' }
        }).then(() => {}).catch(() => {});

        return success(res, result);
    } catch (err) {
        console.error('[API/tenant/validate] Error:', err.message);
        return serverError(res);
    }
};
