const { createClient } = require('@supabase/supabase-js');

/**
 * Master Supabase Client — SERVER ONLY
 * 
 * Uses service_role key which bypasses all RLS.
 * This module ONLY runs in Vercel serverless functions (Node.js).
 * It is NEVER bundled or exposed to the browser.
 */
let _client = null;

function getMasterSupabase() {
    if (!_client) {
        const url = process.env.MASTER_SUPABASE_URL;
        const key = process.env.MASTER_SUPABASE_SERVICE_KEY;

        if (!url || !key) {
            throw new Error('MASTER_SUPABASE_URL and MASTER_SUPABASE_SERVICE_KEY must be set');
        }

        _client = createClient(url, key, {
            auth: { persistSession: false }
        });
    }
    return _client;
}

module.exports = { getMasterSupabase };
