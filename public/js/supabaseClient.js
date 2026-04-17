import { CONFIG } from './config.js';

/**
 * Multi-Tenant Supabase Client
 * 
 * Master DB  → Digunakan HANYA untuk mencari data tenant (tenant_configs)
 * Tenant DB  → Dibuat secara dinamis setelah tenant ditemukan, dipakai untuk semua operasi data
 */

// 1. Master DB Client (Router - untuk lookup tenant)
const masterSupabase = window.supabase
    ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
    : null;

// 2. Tenant DB Client (Dinamis - diisi setelah resolveTenant dipanggil)
export let supabase = null;

/**
 * Resolve tenant berdasarkan bot_id.
 * Mencari kredensial database penyewa di tabel tenant_configs Master DB,
 * lalu membuat koneksi Supabase baru ke database penyewa tersebut.
 * 
 * @param {string|number} botId - Bot ID dari URL parameter
 * @returns {Promise<boolean>} true jika berhasil, false jika gagal
 */
export async function resolveTenant(botId) {
    if (!masterSupabase || !botId) {
        console.error('[Tenant] Master DB not available or no bot_id provided.');
        return false;
    }

    try {
        // Cari kredensial database penyewa di Master DB
        const { data, error } = await masterSupabase
            .from('tenant_configs')
            .select('supabase_url, supabase_anon_key')
            .eq('bot_id', botId)
            .single();

        if (error || !data) {
            console.error('[Tenant] Bot not found in tenant_configs:', error?.message);
            return false;
        }

        // Buat koneksi dinamis ke database penyewa
        supabase = window.supabase.createClient(data.supabase_url, data.supabase_anon_key);
        console.log('[Tenant] ✅ Connected to tenant DB for bot:', botId);
        return true;

    } catch (err) {
        console.error('[Tenant] Resolution failed:', err.message);
        return false;
    }
}

export { masterSupabase };
