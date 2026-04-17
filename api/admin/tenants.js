const { getMasterSupabase } = require('../_lib/masterSupabase');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('../_lib/response');

/**
 * /api/admin/tenants
 * 
 * Master Admin Dashboard API untuk manage semua tenant.
 * Auth: X-Admin-Secret header (shared secret dengan admin dashboard)
 * 
 * GET    — List semua tenant (+ filter status, search)
 * PUT    — Update tenant (suspend, activate, ban, hapus)
 * DELETE — Hapus tenant beserta semua data terkait
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    // Admin authentication
    const adminSecret = req.headers['x-admin-secret'];
    if (!adminSecret || adminSecret !== process.env.ADMIN_DASHBOARD_SECRET) {
        return unauthorized(res, 'Invalid admin credentials');
    }

    switch (req.method) {
        case 'GET': return listTenants(req, res);
        case 'PUT': return updateTenant(req, res);
        case 'DELETE': return deleteTenant(req, res);
        default: return error(res, 'Method not allowed', 405);
    }
};

/**
 * GET /api/admin/tenants?status=ACTIVE&search=keyword&page=1&limit=20
 */
async function listTenants(req, res) {
    try {
        const masterDb = getMasterSupabase();
        const { status, search, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = masterDb
            .from('tenants')
            .select(`
                bot_id, username, shop_name, owner_chat_id, status, 
                created_at, updated_at,
                subscriptions(expiry_date, status, plans(name)),
                tenant_configs(supabase_url)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        // Filter by status
        if (status) {
            query = query.eq('status', status);
        }

        // Search by username or shop_name
        if (search) {
            query = query.or(`username.ilike.%${search}%,shop_name.ilike.%${search}%`);
        }

        const { data, count, error: dbError } = await query;

        if (dbError) {
            console.error('[API/admin/tenants] DB error:', dbError.message);
            return serverError(res);
        }

        // Enrich with subscription info
        const enriched = (data || []).map(t => {
            const sub = Array.isArray(t.subscriptions) ? t.subscriptions[0] : t.subscriptions;
            const expiry = sub?.expiry_date ? new Date(sub.expiry_date) : null;
            const isExpired = expiry ? expiry < new Date() : true;
            const remainingDays = expiry ? Math.max(0, Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24))) : 0;

            return {
                bot_id: t.bot_id,
                username: t.username,
                shop_name: t.shop_name,
                owner_chat_id: t.owner_chat_id,
                status: t.status,
                db_url: t.tenant_configs?.supabase_url || null,
                subscription: {
                    plan: sub?.plans?.name || 'None',
                    expiryDate: sub?.expiry_date,
                    isExpired,
                    remainingDays,
                    status: sub?.status
                },
                created_at: t.created_at
            };
        });

        return success(res, {
            tenants: enriched,
            pagination: {
                total: count || 0,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil((count || 0) / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('[API/admin/tenants] Error:', err.message);
        return serverError(res);
    }
}

/**
 * PUT /api/admin/tenants
 * Body: { bot_id, action: 'activate'|'suspend'|'ban' }
 */
async function updateTenant(req, res) {
    const { bot_id, action } = req.body || {};

    if (!bot_id || !action) {
        return error(res, 'bot_id and action are required');
    }

    const statusMap = {
        'activate': 'ACTIVE',
        'suspend': 'SUSPENDED',
        'ban': 'BANNED',
        'expire': 'EXPIRED'
    };

    const newStatus = statusMap[action];
    if (!newStatus) {
        return error(res, `Invalid action: ${action}. Use: activate, suspend, ban, expire`);
    }

    try {
        const masterDb = getMasterSupabase();

        const { data, error: dbError } = await masterDb
            .from('tenants')
            .update({ status: newStatus })
            .eq('bot_id', bot_id)
            .select('bot_id, username, status')
            .single();

        if (dbError || !data) {
            return notFound(res, 'Tenant not found');
        }

        // Audit log
        await masterDb.from('audit_logs').insert({
            bot_id: parseInt(bot_id),
            actor: 'admin',
            action: `TENANT_${action.toUpperCase()}`,
            entity: 'tenants',
            detail: { new_status: newStatus }
        });

        return success(res, {
            tenant: data,
            message: `Tenant ${data.username || bot_id} has been ${action}d`
        });
    } catch (err) {
        console.error('[API/admin/tenants] Update error:', err.message);
        return serverError(res);
    }
}

/**
 * DELETE /api/admin/tenants?bot_id=xxx
 * Hapus tenant beserta semua data terkait (cascade)
 */
async function deleteTenant(req, res) {
    const bot_id = req.query.bot_id;

    if (!bot_id) {
        return error(res, 'bot_id query parameter is required');
    }

    try {
        const masterDb = getMasterSupabase();

        // Get tenant info before deletion
        const { data: tenant } = await masterDb
            .from('tenants')
            .select('username, shop_name')
            .eq('bot_id', bot_id)
            .single();

        if (!tenant) {
            return notFound(res, 'Tenant not found');
        }

        // Delete (cascade will handle subscriptions, configs, invoices)
        const { error: delError } = await masterDb
            .from('tenants')
            .delete()
            .eq('bot_id', bot_id);

        if (delError) {
            console.error('[API/admin/tenants] Delete error:', delError.message);
            return serverError(res, 'Failed to delete tenant');
        }

        // Audit log (bot_id set to null since tenant is deleted)
        await masterDb.from('audit_logs').insert({
            actor: 'admin',
            action: 'TENANT_DELETED',
            entity: 'tenants',
            entity_id: bot_id.toString(),
            detail: { username: tenant.username, shop_name: tenant.shop_name }
        });

        return success(res, {
            deleted: true,
            message: `Tenant ${tenant.username || bot_id} (${tenant.shop_name}) has been deleted`
        });
    } catch (err) {
        console.error('[API/admin/tenants] Delete error:', err.message);
        return serverError(res);
    }
}
