import { supabase, resolveTenant, tenantInfo } from './supabaseClient.js';

export const urlParams = new URLSearchParams(window.location.search);
export const currentBotId = urlParams.get('bot_id');
export const isAdminParams = urlParams.get('admin') === 'true';

// Telegram WebApp Data
export const tg = window.Telegram?.WebApp;
export const tgUser = tg?.initDataUnsafe?.user;
export const telegramUserId = tgUser?.id || null;

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

export async function fetchShopSettings() {
    if (!supabase) return shopSettings;
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
    
    return shopSettings;
}

// Catalog Data (Products + Variants)
export let catalogData = [];

export async function fetchCatalog() {
    if (!supabase) return [];
    
    // Fetch active products
    const { data: products, error: pError } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
        
    if (pError) return [];

    // Fetch active variants for these products
    const { data: variants, error: vError } = await supabase
        .from('variants')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
        
    if (vError) return products;

    // Fetch Stock Counts via Inventory Table
    const { data: stocks, error: sError } = await supabase
        .from('inventory_items')
        .select('variant_id')
        .eq('status', 'AVAILABLE');

    const variantStockMap = {};
    const productStockMap = {};
    
    if (!sError && stocks) {
        stocks.forEach(s => {
            variantStockMap[s.variant_id] = (variantStockMap[s.variant_id] || 0) + 1;
        });
    }

    // Join variants to products and add stock info
    catalogData = products.map(p => {
        const productVariants = variants.filter(v => v.product_id === p.id).map(v => ({
            ...v,
            stock: variantStockMap[v.id] || 0
        }));
        
        const totalStock = productVariants.reduce((sum, v) => sum + v.stock, 0);

        return {
            ...p,
            stock_count: totalStock,
            variants: productVariants
        };
    });

    return catalogData;
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

export async function fetchUserBalance(chatId) {
    if (!supabase || !chatId) return 0;
    const { data, error } = await supabase
        .from('users')
        .select('balance')
        .eq('chat_id', chatId)
        .single();
    
    return error ? 0 : (data?.balance || 0);
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

// Keep for legacy if needed, but we now use catalogData
export let mockData = [];
export let mockAdminData = [];
