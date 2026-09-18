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

    let actionName = action;
    const combinedParams = new URLSearchParams();

    // Parse if action itself contains query string (e.g. "overview?startDate=...")
    if (action.includes('?')) {
        const [act, qs] = action.split('?');
        actionName = act;
        new URLSearchParams(qs).forEach((val, key) => combinedParams.append(key, val));
    }

    if (options.params) {
        Object.entries(options.params).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== '') {
                combinedParams.append(key, val);
            }
        });
    }

    let url = `${RNFSHOP_CONFIG.apiBase}?action=${encodeURIComponent(actionName)}`;
    const qsString = combinedParams.toString();
    if (qsString) {
        url += `&${qsString}`;
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
    const data = await res.json().catch(() => ({ success: false, error: 'Respons server tidak valid' }));

    if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}: Terjadi kesalahan pada server RNF Shop`);
    }

    return {
        ok: true,
        ...data
    };
}
