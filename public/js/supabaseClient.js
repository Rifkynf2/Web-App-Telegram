/**
 * Multi-Tenant Supabase Client v2 — Secure Edition
 * 
 * BEFORE (INSECURE):
 *   Browser → Master DB (anon_key exposed in config.js)
 *   → Anyone could read tenant_configs including credentials
 * 
 * AFTER (SECURE):
 *   Browser → API Gateway (/api/webapp/tenant-config)
 *   → Server validates request, queries master DB with service_role
 *   → Returns ONLY anon_key (safe for browser)
 *   → Browser connects to tenant DB with anon_key
 * 
 * The master DB credentials (service_role key) NEVER leave the server.
 */

// Tenant DB Client — dynamically created after resolveTenant()
export let supabase = null;

// Resolved tenant info
export let tenantInfo = null;

// API base path (same domain = no CORS issues)
const API_BASE = '/api';

/**
 * Resolve tenant via secure API Gateway.
 * 
 * Calls /api/webapp/tenant-config with bot_id and optional Telegram initData.
 * The API validates the request server-side, checks tenant status & subscription,
 * then returns safe credentials (anon_key only).
 * 
 * @param {string|number} botId - Bot ID from URL parameter
 * @returns {Promise<boolean>} true if connection successful
 */
export async function resolveTenant(botId) {
    if (!botId) {
        console.error('[Tenant] No bot_id provided.');
        return false;
    }

    try {
        // Build request headers
        const headers = {};
        
        // Include Telegram initData if running inside Telegram WebApp
        const tg = window.Telegram?.WebApp;
        if (tg?.initData) {
            headers['X-Telegram-Init-Data'] = tg.initData;
        }

        // Call API Gateway (same domain — no CORS)
        const res = await fetch(`${API_BASE}/webapp/tenant-config?bot_id=${botId}`, {
            headers
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('[Tenant] API error:', err.error || res.status);
            
            // Provide user-friendly error messages
            if (res.status === 404) {
                throw new Error('Toko tidak ditemukan');
            } else if (res.status === 403) {
                throw new Error(err.error || 'Akses ditolak');
            }
            return false;
        }

        const config = await res.json();
        
        // Store tenant info
        tenantInfo = {
            shopName: config.shop_name,
            botUsername: config.bot_username,
            botPhotoUrl: config.bot_photo_url || null,
            telegramUser: config.telegram_user
        };

        // Create dynamic connection to tenant DB (anon_key = safe for browser)
        console.log('[Tenant] 🔗 Connecting to:', config.supabase_url);
        supabase = window.supabase.createClient(
            config.supabase_url,
            config.supabase_anon_key
        );
        console.log('[Tenant] ✅ Connected to tenant DB for bot:', botId);
        return true;

    } catch (err) {
        console.error('[Tenant] Resolution failed:', err.message);
        throw err; // Re-throw so UI can show specific error
    }
}

/**
 * Initialize full web app session with Telegram validation.
 * 
 * Calls /api/webapp/init which validates Telegram initData,
 * creates a server-side session, and returns tenant config.
 * 
 * Use this for authenticated flows (admin panel, user-specific data).
 * 
 * @param {string|number} botId - Bot ID
 * @returns {Promise<object|null>} Session data or null
 */
export async function initSession(botId) {
    const tg = window.Telegram?.WebApp;
    
    if (!tg?.initData) {
        console.warn('[Session] No Telegram initData available. Session init skipped.');
        return null;
    }

    try {
        const res = await fetch(`${API_BASE}/webapp/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                initData: tg.initData,
                bot_id: botId
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('[Session] Init failed:', err.error);
            return null;
        }

        const data = await res.json();
        
        // If we got tenant config, set up supabase client
        if (data.config && !supabase) {
            supabase = window.supabase.createClient(
                data.config.supabase_url,
                data.config.supabase_anon_key
            );
        }

        // Store tenant info
        tenantInfo = {
            shopName: data.tenant?.shop_name,
            botUsername: data.tenant?.username,
            botPhotoUrl: data.tenant?.bot_photo_url || null,
            telegramUser: data.user
        };

        console.log('[Session] ✅ Session initialized:', data.session_id);
        return data;
    } catch (err) {
        console.error('[Session] Error:', err.message);
        return null;
    }
}
