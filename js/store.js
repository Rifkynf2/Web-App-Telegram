import { supabase } from './supabaseClient.js';

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

// Derive Shop Name from Bot ID (e.g. rnf_shopp -> RNF SHOPP)
export const getShopName = () => {
    if (!currentBotId) return 'RNF SHOP SYSTEM';
    return currentBotId.replace(/_/g, ' ').toUpperCase();
};

// Shop Branding Settings
export let shopSettings = {
    name: 'RNF SHOP SYSTEM',
    description: 'Toko Digital Otomatis'
};

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

// Keep for legacy if needed, but we now use catalogData
export let mockData = [];
export let mockAdminData = [];
