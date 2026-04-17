const { getMasterSupabase } = require('../_lib/masterSupabase');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('../_lib/response');

/**
 * /api/admin/subscriptions
 * 
 * Master Admin API untuk manage subscriptions.
 * Auth: X-Admin-Secret header
 * 
 * GET  — List subscriptions (filter: expired, active, trial)
 * PUT  — Manual extend/modify subscription
 * POST — Manually renew a subscription (admin bypass)
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const adminSecret = req.headers['x-admin-secret'];
    if (!adminSecret || adminSecret !== process.env.ADMIN_DASHBOARD_SECRET) {
        return unauthorized(res, 'Invalid admin credentials');
    }

    switch (req.method) {
        case 'GET': return listSubscriptions(req, res);
        case 'PUT': return updateSubscription(req, res);
        case 'POST': return manualRenew(req, res);
        default: return error(res, 'Method not allowed', 405);
    }
};

/**
 * GET /api/admin/subscriptions?filter=expired|active|trial|all&page=1
 */
async function listSubscriptions(req, res) {
    try {
        const masterDb = getMasterSupabase();
        const { filter = 'all', page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = masterDb
            .from('subscriptions')
            .select(`
                id, bot_id, start_date, expiry_date, status, 
                last_payment_at, is_auto_off,
                plans(name, price),
                tenants(username, shop_name, status, owner_chat_id)
            `, { count: 'exact' })
            .order('expiry_date', { ascending: true })
            .range(offset, offset + parseInt(limit) - 1);

        const now = new Date().toISOString();

        switch (filter) {
            case 'expired':
                query = query.lt('expiry_date', now);
                break;
            case 'active':
                query = query.gte('expiry_date', now).eq('status', 'ACTIVE');
                break;
            case 'trial':
                query = query.eq('status', 'TRIAL');
                break;
            case 'expiring_soon':
                // Expiring within 3 days
                const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
                query = query.gte('expiry_date', now).lte('expiry_date', threeDays);
                break;
        }

        const { data, count, error: dbError } = await query;

        if (dbError) {
            console.error('[API/admin/subscriptions] DB error:', dbError.message);
            return serverError(res);
        }

        const enriched = (data || []).map(s => {
            const expiry = new Date(s.expiry_date);
            const remainingDays = Math.max(0, Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24)));

            return {
                ...s,
                remainingDays,
                isExpired: expiry < new Date(),
                tenant: s.tenants,
                plan: s.plans
            };
        });

        return success(res, {
            subscriptions: enriched,
            pagination: {
                total: count || 0,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil((count || 0) / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('[API/admin/subscriptions] Error:', err.message);
        return serverError(res);
    }
}

/**
 * PUT /api/admin/subscriptions
 * Body: { bot_id, expiry_date?, status?, plan_name? }
 */
async function updateSubscription(req, res) {
    const { bot_id, expiry_date, status, plan_name } = req.body || {};

    if (!bot_id) {
        return error(res, 'bot_id is required');
    }

    try {
        const masterDb = getMasterSupabase();

        const updateData = {};
        if (expiry_date) updateData.expiry_date = expiry_date;
        if (status) updateData.status = status;

        if (plan_name) {
            const { data: plan } = await masterDb
                .from('plans')
                .select('id')
                .eq('name', plan_name)
                .single();
            if (plan) updateData.plan_id = plan.id;
        }

        if (Object.keys(updateData).length === 0) {
            return error(res, 'No fields to update');
        }

        const { data, error: dbError } = await masterDb
            .from('subscriptions')
            .update(updateData)
            .eq('bot_id', bot_id)
            .select('id, bot_id, expiry_date, status')
            .single();

        if (dbError || !data) {
            return notFound(res, 'Subscription not found');
        }

        // Audit log
        await masterDb.from('audit_logs').insert({
            bot_id: parseInt(bot_id),
            actor: 'admin',
            action: 'SUBSCRIPTION_UPDATED',
            entity: 'subscriptions',
            detail: updateData
        });

        return success(res, { subscription: data });
    } catch (err) {
        console.error('[API/admin/subscriptions] Update error:', err.message);
        return serverError(res);
    }
}

/**
 * POST /api/admin/subscriptions
 * Manual renew by admin (bypass payment)
 * Body: { bot_id, days?: number (default 31) }
 */
async function manualRenew(req, res) {
    const { bot_id, days = 31 } = req.body || {};

    if (!bot_id) {
        return error(res, 'bot_id is required');
    }

    try {
        const masterDb = getMasterSupabase();

        // Get current subscription
        const { data: current } = await masterDb
            .from('subscriptions')
            .select('expiry_date')
            .eq('bot_id', bot_id)
            .order('expiry_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Calculate new expiry (extend from current if still active)
        let baseDate = new Date();
        if (current && new Date(current.expiry_date) > baseDate) {
            baseDate = new Date(current.expiry_date);
        }
        const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

        // Get Premium plan
        const { data: plan } = await masterDb
            .from('plans')
            .select('id')
            .eq('name', 'Premium')
            .single();

        // Upsert subscription
        const { data, error: dbError } = await masterDb
            .from('subscriptions')
            .upsert({
                bot_id: parseInt(bot_id),
                plan_id: plan?.id || null,
                expiry_date: newExpiry.toISOString(),
                status: 'ACTIVE',
                last_payment_at: new Date().toISOString()
            }, { onConflict: 'bot_id' })
            .select()
            .single();

        if (dbError) {
            console.error('[API/admin/subscriptions] Renew error:', dbError.message);
            return serverError(res);
        }

        // Also ensure tenant is active
        await masterDb.from('tenants')
            .update({ status: 'ACTIVE' })
            .eq('bot_id', bot_id);

        // Audit log
        await masterDb.from('audit_logs').insert({
            bot_id: parseInt(bot_id),
            actor: 'admin',
            action: 'SUBSCRIPTION_MANUAL_RENEW',
            entity: 'subscriptions',
            detail: { days, new_expiry: newExpiry.toISOString() }
        });

        return success(res, {
            subscription: data,
            message: `Subscription extended by ${days} days until ${newExpiry.toLocaleDateString('id-ID')}`
        });
    } catch (err) {
        console.error('[API/admin/subscriptions] Renew error:', err.message);
        return serverError(res);
    }
}
