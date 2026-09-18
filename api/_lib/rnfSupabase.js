const { createClient } = require('@supabase/supabase-js');

/**
 * RNF Shop Supabase Client — SERVER ONLY
 * 
 * Secure backend client that communicates with RNF Shop Database.
 * Runs strictly in Vercel serverless functions (Node.js).
 * NEVER exposed to or bundled in the browser.
 */
let _client = null;

function getRnfSupabase() {
    if (!_client) {
        const url = process.env.RNFSHOP_SUPABASE_URL;
        const key = process.env.RNFSHOP_SUPABASE_SERVICE_KEY || process.env.RNFSHOP_SUPABASE_ANON_KEY;

        if (!url || !key) {
            throw new Error('RNFSHOP_SUPABASE_URL and RNFSHOP_SUPABASE_SERVICE_KEY (or RNFSHOP_SUPABASE_ANON_KEY) must be set in environment variables');
        }

        _client = createClient(url, key, {
            auth: { persistSession: false }
        });
    }
    return _client;
}

module.exports = { getRnfSupabase };
