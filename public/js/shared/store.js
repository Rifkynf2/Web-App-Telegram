import { supabase, resolveTenant, tenantInfo } from './supabaseClient.js';

export const urlParams = new URLSearchParams(window.location.search);
export const currentBotId = urlParams.get('bot_id');
export const isAdminParams = urlParams.get('admin') === 'true';

// Telegram WebApp Data (Dynamic and resilient to script load order)
export let tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
export let tgUser = tg?.initDataUnsafe?.user || null;
export let telegramUserId = tgUser?.id || null;

export function refreshTelegramData() {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        tg = window.Telegram.WebApp;
        tgUser = tg.initDataUnsafe?.user || null;
        telegramUserId = tgUser?.id || null;
    }
    return tg;
}

export function getTg() {
    return (typeof window !== 'undefined' && window.Telegram?.WebApp) || tg || null;
}

// User Identity from URL
export const userName = urlParams.get('name') || 'Guest User';
export const userUsername = urlParams.get('username') || '';
export const userPhoto = urlParams.get('photo') || '';

// Shop Name from API response (resolved from master DB)
export const getShopName = () => {
    // Use server-resolved name first, fallback to URL-based derivation
    if (tenantInfo?.shopName) return tenantInfo.shopName;
    if (!currentBotId) return 'RNF BOT SYSTEM';
    return currentBotId.replace(/_/g, ' ').toUpperCase();
};

export const getBotUsername = () => {
    return tenantInfo?.botUsername || null;
};

// Shop Branding Settings
export let shopSettings = {
    name: 'RNF BOT SYSTEM',
    description: 'Toko Digital Otomatis',
    logoUrl: ''
};

/**
 * STEP 1: Resolve tenant connection.
 * Harus dipanggil PERTAMA sebelum fungsi lain (fetchCatalog, fetchShopSettings, dll).
 * Fungsi ini menghubungkan Web App ke database penyewa yang tepat.
 * 
 * @returns {Promise<boolean>} true jika koneksi berhasil
 */
export async function initTenant() {
    if (!currentBotId) {
        console.error('[Store] No bot_id in URL parameters.');
        return false;
    }
    
    try {
        const resolved = await resolveTenant(currentBotId);
        if (!resolved) {
            console.error('[Store] Failed to resolve tenant for bot_id:', currentBotId);
            return false;
        }
        
        // Update shop name from server response
        if (tenantInfo?.shopName) {
            shopSettings.name = tenantInfo.shopName;
        }
        if (tenantInfo?.botPhotoUrl) {
            shopSettings.logoUrl = tenantInfo.botPhotoUrl;
        }
        
        console.log('[Store] ✅ Tenant initialized for bot_id:', currentBotId);
        return true;
    } catch (err) {
        console.error('[Store] Tenant init error:', err.message);
        throw err; // Re-throw for UI error handling
    }
}

let _shopSettingsCache = null;
let _shopSettingsPromise = null;

export async function fetchShopSettings(forceRefresh = false) {
    if (!supabase) return shopSettings;
    if (!forceRefresh && _shopSettingsCache) return _shopSettingsCache;
    if (_shopSettingsPromise) return _shopSettingsPromise;

    _shopSettingsPromise = (async () => {
        try {
            const { data, error } = await supabase.from('settings').select('key, value');
            if (error) return shopSettings;
            
            const settingsMap = {};
            data.forEach(s => settingsMap[s.key] = s.value);
            
            if (settingsMap['SHOP_NAME']) shopSettings.name = settingsMap['SHOP_NAME'];
            if (settingsMap['SHOP_DESCRIPTION']) shopSettings.description = settingsMap['SHOP_DESCRIPTION'];
            if (settingsMap['SHOP_LOGO_URL']) {
                shopSettings.logoUrl = settingsMap['SHOP_LOGO_URL'];
            } else if (tenantInfo?.botPhotoUrl) {
                shopSettings.logoUrl = tenantInfo.botPhotoUrl;
            }
            
            // Admin contact for help button (strip @ prefix if present)
            if (settingsMap['ADMIN_USERNAME']) {
                shopSettings.adminContact = settingsMap['ADMIN_USERNAME'].replace(/^@/, '');
            }
            
            _shopSettingsCache = shopSettings;
            return shopSettings;
        } finally {
            _shopSettingsPromise = null;
        }
    })();

    return _shopSettingsPromise;
}

// Catalog Data (Products + Variants)
export let catalogData = [];

let _catalogCache = {
    data: null,
    timestamp: 0
};
const CATALOG_CACHE_TTL_MS = 60 * 1000; // 60s in-memory cache TTL for catalog browsing

export function clearCatalogCache() {
    _catalogCache.data = null;
    _catalogCache.timestamp = 0;
}

let _catalogInFlightPromise = null;

export async function fetchCatalog(forceRefresh = false) {
    if (!supabase) return [];

    const now = Date.now();
    if (!forceRefresh && _catalogCache.data && (now - _catalogCache.timestamp < CATALOG_CACHE_TTL_MS)) {
        catalogData = _catalogCache.data;
        return catalogData;
    }

    if (_catalogInFlightPromise) {
        return _catalogInFlightPromise;
    }

    _catalogInFlightPromise = (async () => {
        try {
            // Fetch active products, variants, and stock counts in PARALLEL (Max speed & minimal latency)
            const [pRes, vRes, sRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('*')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true })
                    .limit(500),
                supabase
                    .from('variants')
                    .select('*')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true })
                    .limit(2000),
                supabase
                    .from('inventory_items')
                    .select('variant_id, created_at')
                    .eq('status', 'AVAILABLE')
                    .limit(10000)
            ]);

            if (pRes.error) {
                console.error('[Store] Products fetch error:', pRes.error);
                return catalogData || [];
            }

            const products = pRes.data || [];
            const variants = vRes.data || [];
            const stocks = sRes.data || [];

            const variantStockMap = {};
            const variantRestockMap = {};

            stocks.forEach(s => {
                variantStockMap[s.variant_id] = (variantStockMap[s.variant_id] || 0) + 1;
                // Track latest created_at per variant (same as bot logic)
                if (!variantRestockMap[s.variant_id] || s.created_at > variantRestockMap[s.variant_id]) {
                    variantRestockMap[s.variant_id] = s.created_at;
                }
            });

            // Join variants to products and add stock info
            catalogData = products.map(p => {
                const productVariants = variants.filter(v => v.product_id === p.id).map(v => ({
                    ...v,
                    stock: variantStockMap[v.id] || 0,
                    last_restock_at: variantRestockMap[v.id] || v.last_restock_at || null
                }));
                
                const totalStock = productVariants.reduce((sum, v) => sum + v.stock, 0);

                return {
                    ...p,
                    stock_count: totalStock,
                    variants: productVariants
                };
            });

            // Default sort alfabet A-Z otomatis
            catalogData.sort((a, b) => {
                const nameA = (a.name || '').trim();
                const nameB = (b.name || '').trim();
                return nameA.localeCompare(nameB, 'id', { sensitivity: 'base', numeric: true });
            });

            _catalogCache = {
                data: catalogData,
                timestamp: Date.now()
            };

            return catalogData;
        } finally {
            _catalogInFlightPromise = null;
        }
    })();

    return _catalogInFlightPromise;
}

export async function fetchAdminCatalog(authToken) {
    if (!currentBotId || !authToken) return [];

    const response = await fetch(`/api/webapp/admin-products?bot_id=${encodeURIComponent(currentBotId)}&auth=${encodeURIComponent(authToken)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || 'Gagal memuat katalog admin');
    }

    return result.products || result.data?.products || [];
}

// Buyer balance/transaction count used to be fetched by querying the tenant
// DB's `users`/`transactions` tables directly from the browser with the
// anon key. Those tables' RLS only restricted by row *type* (is_active,
// status), not by "is this the requesting buyer's own row" — so any client
// could read every buyer's balance/history, not just their own. Now relayed
// through a server endpoint that validates Telegram initData first (see
// api/webapp/checkout.js GET handler). Both accessors share one in-flight
// fetch/cache since they're always called together on the profile view.
let buyerProfileCache = null;
let buyerProfileInFlight = null;

async function fetchBuyerProfile() {
    if (buyerProfileCache) return buyerProfileCache;
    if (buyerProfileInFlight) return buyerProfileInFlight;

    buyerProfileInFlight = (async () => {
        try {
            const response = await fetch(`/api/webapp/checkout?bot_id=${encodeURIComponent(currentBotId)}`, {
                headers: { 'X-Telegram-Init-Data': tg?.initData || '' },
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) throw new Error(result.error || 'Gagal memuat profil');

            buyerProfileCache = {
                balance: result.balance || 0,
                transactionCount: result.transaction_count || 0,
            };
            return buyerProfileCache;
        } catch (e) {
            console.error('[Store] fetchBuyerProfile error:', e.message);
            return { balance: 0, transactionCount: 0 };
        } finally {
            buyerProfileInFlight = null;
        }
    })();

    return buyerProfileInFlight;
}

export async function fetchUserBalance(chatId) {
    if (!chatId) return 0;
    const profile = await fetchBuyerProfile();
    return profile.balance;
}

export async function checkIsAdmin(chatId) {
    if (!supabase || !chatId) return false;
    const { data, error } = await supabase
        .from('admins')
        .select('id')
        .eq('chat_id', chatId)
        .eq('is_active', true)
        .maybeSingle();
    
    return !error && !!data;
}

/**
 * Super Efficient Dashboard Stats
 * Uses head: true to fetch counts ONLY (0 bytes data body)
 */
export async function fetchAdminStats() {
    const authToken = urlParams.get('auth') || '';
    if (!currentBotId || !authToken) {
        return { users: 0, products: 0, orders_today: 0, revenue_lifetime: 0, sold_lifetime: 0, stock_available: 0, logo_url: shopSettings.logoUrl || '' };
    }

    const response = await fetch(`/api/webapp/admin-dashboard?bot_id=${encodeURIComponent(currentBotId)}&auth=${encodeURIComponent(authToken)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || 'Gagal memuat statistik admin');
    }

    if (result.branding?.logo_url) {
        shopSettings.logoUrl = result.branding.logo_url;
    }

    return {
        users: result.stats?.users || 0,
        products: result.stats?.products || 0,
        orders_today: result.stats?.orders_today || 0,
        revenue_lifetime: result.stats?.revenue_lifetime || 0,
        sold_lifetime: result.stats?.sold_lifetime || 0,
        stock_available: result.stats?.stock_available || 0,
        logo_url: result.branding?.logo_url || shopSettings.logoUrl || ''
    };
}

export async function fetchUserTransactionCount(chatId) {
    if (!chatId) return 0;
    const profile = await fetchBuyerProfile();
    return profile.transactionCount;
}

export function subscribeToInventoryChanges(onUpdate, role = 'buyer') {
    // Supabase Free Tier Optimization:
    // Regular buyers do not need persistent WebSockets; only tenant admins need live updates.
    // This strictly preserves the Supabase Free Tier 200 concurrent connection limit
    // and eliminates thundering-herd re-fetch storms across buyer devices.
    if (!supabase || role !== 'admin') return null;

    return supabase
        .channel('inventory_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, async () => {
            clearCatalogCache();
            await fetchCatalog(true);
            onUpdate?.();
        })
        .subscribe();
}

// Keep for legacy if needed, but we now use catalogData
export let mockData = [];
export let mockAdminData = [];
