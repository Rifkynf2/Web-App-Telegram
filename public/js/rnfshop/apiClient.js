// public/js/rnfshop/apiClient.js
import { RNFSHOP_CONFIG } from './config.js';

/**
 * Secure Backend API Client for RNF Shop
 * Transparently sends requests to /api/admin/rnfshop with Master Admin Secret.
 * Zero database URLs or keys exposed in frontend code!
 */

function getAdminSecret() {
    return localStorage.getItem('master_secret') || '';
}

export async function rnfFetch(action, options = {}) {
    const method = options.method || 'GET';
    const secret = getAdminSecret();

    let url = `${RNFSHOP_CONFIG.apiBase}?action=${encodeURIComponent(action)}`;
    if (options.params) {
        const queryParams = new URLSearchParams(options.params).toString();
        if (queryParams) url += `&${queryParams}`;
    }

    const headers = {
        'X-Admin-Secret': secret,
        ...(options.headers || {})
    };

    const fetchConfig = {
        method,
        headers,
        cache: 'no-store'
    };

    if (options.body && method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        fetchConfig.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, fetchConfig);
    const data = await res.json();

    if (!data.success) {
        throw new Error(data.error || 'Terjadi kesalahan pada server RNF Shop');
    }

    return data;
}
