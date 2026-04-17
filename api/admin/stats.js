const { getMasterSupabase } = require('../_lib/masterSupabase');
const { success, unauthorized, serverError, handleCors } = require('../_lib/response');

/**
 * /api/admin/stats
 * 
 * GET — Dashboard statistics (total tenants, revenue, etc.)
 * Auth: X-Admin-Secret header
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const adminSecret = req.headers['x-admin-secret'];
    if (!adminSecret || adminSecret !== process.env.ADMIN_DASHBOARD_SECRET) {
        return unauthorized(res, 'Invalid admin credentials');
    }

    try {
        const masterDb = getMasterSupabase();

        // Call the RPC function we created in the schema
        const { data, error: rpcError } = await masterDb.rpc('get_master_stats');

        if (rpcError) {
            console.error('[API/admin/stats] RPC error:', rpcError.message);
            return serverError(res);
        }

        return success(res, { stats: data });
    } catch (err) {
        console.error('[API/admin/stats] Error:', err.message);
        return serverError(res);
    }
};
