// public/js/rnfshop/supabaseClient.js
/**
 * DEPRECATED & SECURED:
 * Direct client-side Supabase connections for RNF Shop have been migrated to the
 * secure Serverless Gateway pattern via /api/admin/rnfshop (apiClient.js).
 * Database URL and API keys are stored strictly on the server (.env / Vercel).
 */
import { rnfFetch } from './apiClient.js';

export async function getRnfshopSupabase() {
    console.warn('[RNFSHOP] Direct Supabase access is deprecated. Use rnfFetch from apiClient.js instead.');
    throw new Error('Direct client-side Supabase access is disabled for security. Use rnfFetch() instead.');
}

