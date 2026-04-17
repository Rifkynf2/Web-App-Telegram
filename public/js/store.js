import { supabase, resolveTenant } from './supabaseClient.js';

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

// Derive Shop Name from Bot ID (e.g. rnf_bot --> RNF BOT)
export const getShopName = () => {
    if (!currentBotId) return 'RNF BOT SYSTEM';
    return currentBotId.replace(/_/g, ' ').toUpperCase();
};

// Shop Branding Settings
export let shopSettings = {
    name: 'RNF BOT SYSTEM',
    description: 'Toko Digital Otomatis'
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
    
    const resolved = await resolveTenant(currentBotId);
    if (!resolved) {
        console.error('[Store] Failed to resolve tenant for bot_id:', currentBotId);
        return false;
    }
    
    console.log('[Store] ✅ Tenant initialized for bot_id:', currentBotId);
    return true;
}

export async function fetchShopSettings() {
    if (!supabase) return shopSettings;
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) return shopSettings;
    
    const settingsMap = {};
    data.forEach(s => settingsMap[s.key] = s.value);
    
    if (settingsMap['SHOP_NAME']) shopSettings.name = settingsMap['SHOP_NAME'];
    if (settingsMap['SHOP_DESCRIPTION']) shopSettings.description = settingsMap['SHOP_DESCRIPTION'];
    
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
    if (!supabase) return { users: 0, products: 0, orders: 0, revenue: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [uCount, pCount, oCount] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true })
        // Anda bisa menambah filter .gte('created_at', today.toISOString()) untuk order hari ini
    ]);

    return {
        users: uCount.count || 0,
        products: pCount.count || 0,
        orders: oCount.count || 0,
        revenue: 0 // Untuk revenue biasanya butuh kueri sum/RPC, kita set default dulu
    };
}

// Keep for legacy if needed, but we now use catalogData
export let mockData = [];
export let mockAdminData = [];
