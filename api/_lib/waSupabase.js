const { createClient } = require('@supabase/supabase-js');

/**
 * WhatsApp Bot Supabase Client — SERVER ONLY
 *
 * Uses service_role key to bypass RLS.
 * Env vars: WA_SUPABASE_URL + WA_SUPABASE_SERVICE_KEY
 */
let _waClient = null;

function getWaSupabase() {
    if (!_waClient) {
        const url = process.env.WA_SUPABASE_URL;
        const key = process.env.WA_SUPABASE_SERVICE_KEY;

        if (!url || !key) {
            throw new Error('WA_SUPABASE_URL and WA_SUPABASE_SERVICE_KEY must be set in environment variables');
        }

        _waClient = createClient(url, key, {
            auth: { persistSession: false }
        });
    }
    return _waClient;
}

module.exports = { getWaSupabase };
