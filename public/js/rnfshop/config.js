// public/js/rnfshop/config.js
/**
 * RNF Shop Client Configuration
 * All queries are routed securely through backend /api/admin/rnfshop.
 * Zero database credentials or Supabase keys in the browser!
 */

export const RNFSHOP_CONFIG = {
    apiBase: '/api/admin/rnfshop',
    // Stored in localStorage or default
    get sheetsWebhookUrl() {
        return localStorage.getItem('rnfshop_sheets_webhook') || 'https://script.google.com/macros/s/AKfycbz_example/exec';
    },
    set sheetsWebhookUrl(val) {
        if (val) localStorage.setItem('rnfshop_sheets_webhook', val.trim());
    }
};
