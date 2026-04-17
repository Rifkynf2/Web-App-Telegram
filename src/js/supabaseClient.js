import { CONFIG } from './config.js';

// Since we are using CDN in index.html, we grab it from window
// We initialize it once and export it
const supabase = window.supabase ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

export { supabase };
