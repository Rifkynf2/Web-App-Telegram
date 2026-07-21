const { getMasterSupabase } = require('../_lib/masterSupabase');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('../_lib/response');

/**
 * /api/admin/[resource]
 * Consolidated admin handler — routes by [resource] dynamic segment.
 *
 * Handles: stats, subscriptions, tenants
 * Auth: X-Admin-Secret header
 */

// Best-effort push notification to the tenant's own bot server so it drops
// its cached subscription/status check immediately, instead of the tenant
// staying suspended/renewed-but-stale for up to an hour (masterDbService's
// CACHE_DURATION on the bot side). Mirrors the callback used by
// api/webhook/xoftware-renewal.js for automatic payments — this covers the
// manual admin actions (suspend/activate/ban/expire/delete/renew) that
// webhook doesn't touch.
async function notifyBotCacheInvalidate(botId, botApiBaseUrl) {
    const baseUrl = String(botApiBaseUrl || '').replace(/\/+$/, '');
    if (!baseUrl) return;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(`${baseUrl}/api/internal/renewal-callback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Api-Secret': process.env.INTERNAL_API_SECRET || '',
            },
            body: JSON.stringify({ action: 'invalidate_cache', bot_id: botId }),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
    } catch (err) {
        console.error(`[API/admin] Cache invalidation notify failed for bot ${botId}:`, err.message);
    }
}

async function getBotApiBaseUrl(botId) {
    const { data: tenant } = await getMasterSupabase()
        .from('tenants')
        .select('metadata')
        .eq('bot_id', botId)
        .single();
    return tenant?.metadata?.bot_api_base_url || null;
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const resource = Array.isArray(req.query.resource) ? req.query.resource[0] : req.query.resource;

    // Triggered by Vercel Cron (see vercel.json "crons"), which authenticates
    // via `Authorization: Bearer $CRON_SECRET` — not the X-Admin-Secret header
    // the dashboard uses — so it's routed before that gate below.
    if (resource === 'cron-expire') return handleCronExpire(req, res);

    const adminSecret = req.headers['x-admin-secret'];
    if (!adminSecret || adminSecret !== process.env.ADMIN_DASHBOARD_SECRET) {
        return unauthorized(res, 'Invalid admin credentials');
    }

    switch (resource) {
        case 'stats':         return handleStats(req, res);
        case 'subscriptions': return handleSubscriptions(req, res);
        case 'tenants':       return handleTenants(req, res);
        default:              return error(res, `Unknown resource: ${resource}`, 404);
    }
};

// ── CRON: EXPIRE STALE TENANTS ──────────────────────────────────────────────

async function handleCronExpire(req, res) {
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret) {
        console.error('[API/admin/cron-expire] FATAL: CRON_SECRET not configured.');
        return serverError(res, 'Server misconfiguration');
    }
    if (req.headers['authorization'] !== `Bearer ${expectedSecret}`) {
        return unauthorized(res, 'Invalid cron credentials');
    }

    try {
        const { data, error: rpcError } = await getMasterSupabase().rpc('sync_expired_tenants');
        if (rpcError) {
            console.error('[API/admin/cron-expire] RPC error:', rpcError.message);
            return serverError(res);
        }

        const flippedBotIds = (data || []).map((row) => row.bot_id);

        // Same as every other status-changing action: push a cache
        // invalidation to each affected tenant's bot server so it stops
        // responding immediately instead of waiting out its own cache TTL.
        await Promise.all(flippedBotIds.map(async (botId) => {
            const botApiBaseUrl = await getBotApiBaseUrl(botId);
            await notifyBotCacheInvalidate(botId, botApiBaseUrl);
        }));

        console.log(`[API/admin/cron-expire] Flipped ${flippedBotIds.length} tenant(s) to EXPIRED.`);
        return success(res, { updated: flippedBotIds.length, bot_ids: flippedBotIds });
    } catch (err) {
        console.error('[API/admin/cron-expire] Error:', err.message);
        return serverError(res);
    }
}

// ── STATS ────────────────────────────────────────────────────────────────────

async function handleStats(req, res) {
    if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

    try {
        const { data, error: rpcError } = await getMasterSupabase().rpc('get_master_stats');
        if (rpcError) {
            console.error('[API/admin/stats] RPC error:', rpcError.message);
            return serverError(res);
        }
        return success(res, { stats: data });
    } catch (err) {
        console.error('[API/admin/stats] Error:', err.message);
        return serverError(res);
    }
}

// ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────────

async function handleSubscriptions(req, res) {
    switch (req.method) {
        case 'GET':  return listSubscriptions(req, res);
        case 'PUT':  return updateSubscription(req, res);
        case 'POST': return manualRenew(req, res);
        default:     return error(res, 'Method not allowed', 405);
    }
}

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
            case 'expired':  query = query.lt('expiry_date', now); break;
            case 'active':   query = query.gte('expiry_date', now).eq('status', 'ACTIVE'); break;
            case 'trial':    query = query.eq('status', 'TRIAL'); break;
            case 'expiring_soon': {
                const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
                query = query.gte('expiry_date', now).lte('expiry_date', threeDays);
                break;
            }
        }

        const { data, count, error: dbError } = await query;
        if (dbError) {
            console.error('[API/admin/subscriptions] DB error:', dbError.message);
            return serverError(res);
        }

        const enriched = (data || []).map(s => {
            const expiry = new Date(s.expiry_date);
            return {
                ...s,
                remainingDays: Math.max(0, Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24))),
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

async function updateSubscription(req, res) {
    const { bot_id, expiry_date, status, plan_name } = req.body || {};
    if (!bot_id) return error(res, 'bot_id is required');

    try {
        const masterDb = getMasterSupabase();
        const updateData = {};
        if (expiry_date) updateData.expiry_date = expiry_date;
        if (status) updateData.status = status;
        if (plan_name) {
            const { data: plan } = await masterDb.from('plans').select('id').eq('name', plan_name).single();
            if (plan) updateData.plan_id = plan.id;
        }
        if (Object.keys(updateData).length === 0) return error(res, 'No fields to update');

        const { data, error: dbError } = await masterDb
            .from('subscriptions')
            .update(updateData)
            .eq('bot_id', bot_id)
            .select('id, bot_id, expiry_date, status')
            .single();

        if (dbError || !data) return notFound(res, 'Subscription not found');

        return success(res, { subscription: data });
    } catch (err) {
        console.error('[API/admin/subscriptions] Update error:', err.message);
        return serverError(res);
    }
}

async function manualRenew(req, res) {
    const { bot_id, days = 31 } = req.body || {};
    if (!bot_id) return error(res, 'bot_id is required');

    try {
        const masterDb = getMasterSupabase();

        const { data: current } = await masterDb
            .from('subscriptions').select('expiry_date').eq('bot_id', bot_id)
            .order('expiry_date', { ascending: false }).limit(1).maybeSingle();

        let baseDate = new Date();
        if (current && new Date(current.expiry_date) > baseDate) baseDate = new Date(current.expiry_date);
        const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

        const { data: plan } = await masterDb.from('plans').select('id').eq('name', 'Premium').single();

        const { data, error: dbError } = await masterDb
            .from('subscriptions')
            .upsert({
                bot_id: parseInt(bot_id), plan_id: plan?.id || null,
                expiry_date: newExpiry.toISOString(), status: 'ACTIVE',
                last_payment_at: new Date().toISOString()
            }, { onConflict: 'bot_id' })
            .select().single();

        if (dbError) {
            console.error('[API/admin/subscriptions] Renew error:', dbError.message);
            return serverError(res);
        }

        await masterDb.from('tenants').update({ status: 'ACTIVE' }).eq('bot_id', bot_id);

        const botApiBaseUrl = await getBotApiBaseUrl(bot_id);
        await notifyBotCacheInvalidate(bot_id, botApiBaseUrl);

        return success(res, {
            subscription: data,
            message: `Subscription extended by ${days} days until ${newExpiry.toLocaleDateString('id-ID')}`
        });
    } catch (err) {
        console.error('[API/admin/subscriptions] Renew error:', err.message);
        return serverError(res);
    }
}

// ── TENANTS ───────────────────────────────────────────────────────────────────

async function handleTenants(req, res) {
    switch (req.method) {
        case 'GET':    return listTenants(req, res);
        case 'PUT':    return updateTenant(req, res);
        case 'DELETE': return deleteTenant(req, res);
        default:       return error(res, 'Method not allowed', 405);
    }
}

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

        if (status) query = query.eq('status', status);
        if (search) {
            // Strip characters with special meaning in PostgREST's .or() filter
            // syntax (comma separates conditions, parens group them) so a
            // crafted search string can't inject extra filter clauses.
            const safeSearch = String(search).replace(/[,()]/g, '');
            if (safeSearch) query = query.or(`username.ilike.%${safeSearch}%,shop_name.ilike.%${safeSearch}%`);
        }

        const { data, count, error: dbError } = await query;
        if (dbError) {
            console.error('[API/admin/tenants] DB error:', dbError.message);
            return serverError(res);
        }

        const enriched = (data || []).map(t => {
            const sub = Array.isArray(t.subscriptions) ? t.subscriptions[0] : t.subscriptions;
            const expiry = sub?.expiry_date ? new Date(sub.expiry_date) : null;
            return {
                bot_id: t.bot_id, username: t.username, shop_name: t.shop_name,
                owner_chat_id: t.owner_chat_id, status: t.status,
                db_url: t.tenant_configs?.supabase_url || null,
                subscription: {
                    plan: sub?.plans?.name || 'None', expiryDate: sub?.expiry_date,
                    isExpired: expiry ? expiry < new Date() : true,
                    remainingDays: expiry ? Math.max(0, Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24))) : 0,
                    status: sub?.status
                },
                created_at: t.created_at
            };
        });

        return success(res, {
            tenants: enriched,
            pagination: {
                total: count || 0, page: parseInt(page),
                limit: parseInt(limit), totalPages: Math.ceil((count || 0) / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('[API/admin/tenants] Error:', err.message);
        return serverError(res);
    }
}

async function updateTenant(req, res) {
    const { bot_id, action } = req.body || {};
    if (!bot_id || !action) return error(res, 'bot_id and action are required');

    const statusMap = { activate: 'ACTIVE', suspend: 'SUSPENDED', ban: 'BANNED', expire: 'EXPIRED' };
    const newStatus = statusMap[action];
    if (!newStatus) return error(res, `Invalid action: ${action}. Use: activate, suspend, ban, expire`);

    try {
        const masterDb = getMasterSupabase();
        const { data, error: dbError } = await masterDb
            .from('tenants').update({ status: newStatus }).eq('bot_id', bot_id)
            .select('bot_id, username, status').single();

        if (dbError || !data) return notFound(res, 'Tenant not found');

        const botApiBaseUrl = await getBotApiBaseUrl(bot_id);
        await notifyBotCacheInvalidate(bot_id, botApiBaseUrl);

        return success(res, { tenant: data, message: `Tenant ${data.username || bot_id} has been ${action}d` });
    } catch (err) {
        console.error('[API/admin/tenants] Update error:', err.message);
        return serverError(res);
    }
}

async function deleteTenant(req, res) {
    const bot_id = req.query.bot_id;
    if (!bot_id) return error(res, 'bot_id query parameter is required');

    try {
        const masterDb = getMasterSupabase();
        const { data: tenant } = await masterDb
            .from('tenants').select('username, shop_name, metadata').eq('bot_id', bot_id).single();

        if (!tenant) return notFound(res, 'Tenant not found');

        const { error: delError } = await masterDb.from('tenants').delete().eq('bot_id', bot_id);
        if (delError) {
            console.error('[API/admin/tenants] Delete error:', delError.message);
            return serverError(res, 'Failed to delete tenant');
        }

        await notifyBotCacheInvalidate(bot_id, tenant.metadata?.bot_api_base_url);

        return success(res, { deleted: true, message: `Tenant ${tenant.username || bot_id} (${tenant.shop_name}) has been deleted` });
    } catch (err) {
        console.error('[API/admin/tenants] Delete error:', err.message);
        return serverError(res);
    }
}
