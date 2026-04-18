const { getMasterSupabase } = require('../_lib/masterSupabase');
const { success, error, forbidden, notFound, serverError, handleCors } = require('../_lib/response');

async function getTenantBotApiBaseUrl(botId) {
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
        return { error: { status: 403, message: 'Toko tidak aktif' } };
    }

    const botApiBaseUrl = String(tenant.metadata?.bot_api_base_url || '').replace(/\/+$/, '');
    if (!botApiBaseUrl) {
        return { error: { status: 412, message: 'Bot server URL belum dikonfigurasi di metadata tenant' } };
    }

    return { botApiBaseUrl };
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const useQueryParams = req.method === 'GET' || req.method === 'DELETE';
    const botId = useQueryParams ? req.query.bot_id : req.body?.bot_id;
    const auth = useQueryParams ? req.query.auth : req.body?.auth;

    if (!botId || !auth) {
        return error(res, 'bot_id and auth are required');
    }

    try {
        const tenantLookup = await getTenantBotApiBaseUrl(botId);
        if (tenantLookup.error) {
            const { status, message } = tenantLookup.error;
            if (status === 404) return notFound(res, message);
            if (status === 403) return forbidden(res, message);
            return error(res, message, status);
        }

        const { botApiBaseUrl } = tenantLookup;
        const relayHeaders = {
            'Content-Type': 'application/json',
            'X-Internal-Api-Secret': process.env.INTERNAL_API_SECRET,
            'X-Admin-Auth': auth,
        };

        if (req.method === 'POST') {
            const relayResponse = await fetch(`${botApiBaseUrl}/api/internal/admin/products`, {
                method: 'POST',
                headers: relayHeaders,
                body: JSON.stringify(req.body),
            });
            const relayData = await relayResponse.json().catch(() => ({}));
            if (!relayResponse.ok) {
                return error(res, relayData.error || 'Gagal menyimpan produk', relayResponse.status);
            }
            return success(res, relayData);
        }

        if (req.method === 'GET') {
            const relayResponse = await fetch(`${botApiBaseUrl}/api/internal/admin/products?auth=${encodeURIComponent(auth)}`, {
                method: 'GET',
                headers: relayHeaders,
            });
            const relayData = await relayResponse.json().catch(() => ({}));
            if (!relayResponse.ok) {
                return error(res, relayData.error || 'Gagal memuat produk admin', relayResponse.status);
            }
            return success(res, relayData);
        }

        if (req.method === 'DELETE') {
            const productId = req.query.id;
            if (!productId) {
                return error(res, 'id is required');
            }

            const relayResponse = await fetch(`${botApiBaseUrl}/api/internal/admin/products/${productId}?auth=${encodeURIComponent(auth)}`, {
                method: 'DELETE',
                headers: relayHeaders,
            });
            const relayData = await relayResponse.json().catch(() => ({}));
            if (!relayResponse.ok) {
                return error(res, relayData.error || 'Gagal menghapus produk', relayResponse.status);
            }
            return success(res, relayData);
        }

        return error(res, 'Method not allowed', 405);
    } catch (err) {
        console.error('[API/webapp/admin-products] Error:', err.message);
        return serverError(res);
    }
};
