/**
 * Voucher Validator Module for Web App (Direct Tenant DB Verification)
 * 
 * Replicates the authoritative business rules from the bot's
 * `src/services/voucherService.js` for standalone evaluation directly
 * against tenant database, eliminating cross-network HTTP relay failure points.
 */

/**
 * Validate voucher code format (Uppercase alphanumeric, hyphen, underscore, 3-20 chars)
 */
function validateVoucherCodeFormat(code) {
    if (!code || typeof code !== 'string') return false;
    return /^[A-Z0-9_-]{3,20}$/.test(code.trim().toUpperCase());
}

/**
 * Calculate discount based on voucher type and subtotal
 */
function calculateDiscount(voucher, subtotal) {
    if (!voucher || subtotal <= 0) return 0;
    if (voucher.type === 'FREE') {
        return subtotal;
    }
    const val = parseInt(voucher.discount_value, 10) || 0;
    return Math.min(val, subtotal);
}

/**
 * Pure evaluation of voucher rules against basket and user stats
 */
function evaluateVoucherEligibility(voucher, productId, variantId, subtotal = 0, qty = 1, userStats = {}) {
    if (!voucher) {
        return { valid: false, code: 'NOT_FOUND', reason: 'Voucher tidak ditemukan' };
    }

    if (!voucher.is_active) {
        return { valid: false, code: 'INACTIVE', reason: 'Voucher sedang tidak aktif' };
    }

    if (voucher.expires_at) {
        const expTime = new Date(voucher.expires_at).getTime();
        if (Date.now() > expTime) {
            return { valid: false, code: 'EXPIRED', reason: 'Masa berlaku voucher telah berakhir' };
        }
    }

    const purchaseQty = typeof qty === 'number' ? qty : 1;

    // Free voucher must not exceed qty = 1
    if (voucher.type === 'FREE' && purchaseQty > 1) {
        return { valid: false, code: 'FREE_QTY_EXCEEDED', reason: 'Voucher gratis hanya berlaku untuk pembelian 1 item' };
    }

    // Target Scope: VARIANT vs PRODUCT vs ALL
    if (voucher.target_scope === 'VARIANT') {
        const allowedVariantIds = Array.isArray(voucher.target_variant_ids) ? voucher.target_variant_ids : [];
        if (!variantId || !allowedVariantIds.map(String).includes(String(variantId))) {
            return { valid: false, code: 'VARIANT_NOT_ELIGIBLE', reason: 'Voucher tidak berlaku untuk varian ini' };
        }
    } else if (voucher.target_scope === 'PRODUCT' || (voucher.target_type === 'SPECIFIC' && voucher.target_scope === 'ALL')) {
        const allowedIds = Array.isArray(voucher.target_product_ids) ? voucher.target_product_ids : [];
        if (!allowedIds.map(String).includes(String(productId))) {
            return { valid: false, code: 'PRODUCT_NOT_ELIGIBLE', reason: 'Voucher tidak berlaku untuk produk ini' };
        }
    }

    // Customer Eligibility Evaluation
    if (voucher.eligibility_type === 'NEW_USER') {
        if (typeof userStats.paidOrderCount === 'number' && userStats.paidOrderCount > 0) {
            return { valid: false, code: 'NEW_USER_ONLY', reason: 'Voucher ini khusus untuk transaksi pertama pengguna baru' };
        }
    } else if (voucher.eligibility_type === 'MIN_ORDERS') {
        const minOrders = parseInt(voucher.eligibility_min_orders, 10) || 0;
        if (typeof userStats.paidOrderCount === 'number' && userStats.paidOrderCount < minOrders) {
            return {
                valid: false,
                code: 'MIN_ORDERS_NOT_MET',
                reason: `Voucher ini khusus untuk pelanggan setia (minimal ${minOrders} pesanan sukses)`,
                minOrders,
                currentOrders: userStats.paidOrderCount,
            };
        }
    } else if (voucher.eligibility_type === 'PAST_PURCHASE') {
        const requiredVariants = Array.isArray(voucher.eligibility_variant_ids) ? voucher.eligibility_variant_ids.map(String) : [];
        const pastVariants = Array.isArray(userStats.pastVariantIds) ? userStats.pastVariantIds.map(String) : [];
        const hasMatched = requiredVariants.some(id => pastVariants.includes(id));
        if (!hasMatched) {
            return {
                valid: false,
                code: 'PAST_PURCHASE_REQUIRED',
                reason: 'Voucher ini khusus untuk pembeli yang sebelumnya pernah membeli varian produk tertentu',
            };
        }
    }

    // Minimum spend check
    const minSpend = parseInt(voucher.min_spend, 10) || 0;
    if (subtotal < minSpend) {
        return {
            valid: false,
            code: 'MIN_SPEND_NOT_MET',
            reason: `Total belanja belum memenuhi syarat minimal Rp ${minSpend.toLocaleString('id-ID')}`,
            minSpend,
        };
    }

    // Global quota check
    const maxQuota = parseInt(voucher.max_quota_total, 10) || 0;
    const quotaUsed = parseInt(voucher.quota_used, 10) || 0;
    if (maxQuota > 0 && quotaUsed >= maxQuota) {
        return { valid: false, code: 'QUOTA_FULL', reason: 'Kuota voucher telah habis' };
    }

    // User limit check
    if (typeof userStats.userUsageCount === 'number') {
        const maxUserQuota = parseInt(voucher.max_quota_per_user, 10) || 1;
        if (userStats.userUsageCount >= maxUserQuota) {
            return {
                valid: false,
                code: 'USER_LIMIT_REACHED',
                reason: `Anda sudah mencapai batas maksimal penggunaan voucher ini (${maxUserQuota}x)`,
                maxQuota: maxUserQuota,
                userUsed: userStats.userUsageCount,
            };
        }
    }

    const discount = calculateDiscount(voucher, subtotal);
    return {
        valid: true,
        discount,
        voucher,
    };
}

/**
 * Validate voucher directly against tenant database client
 * @param {object} params
 * @param {object} params.tenantDb - Supabase client connected to tenant DB
 * @param {string} params.code - Voucher code
 * @param {number|string} params.chatId - Telegram Chat ID
 * @param {string} params.productId - Product UUID
 * @param {string} params.variantId - Variant UUID
 * @param {number} params.subtotal - Basket subtotal
 * @param {number} params.qty - Quantity
 */
async function validateVoucherForTenant({ tenantDb, code, chatId, productId, variantId, subtotal = 0, qty = 1 }) {
    if (!code) {
        return {
            success: true,
            valid: false,
            code: 'EMPTY_CODE',
            reason: 'Kode voucher belum diisi',
            discount: 0,
            final_total: subtotal,
            voucher: null
        };
    }

    const cleanCode = String(code).trim().toUpperCase();
    if (!validateVoucherCodeFormat(cleanCode)) {
        return {
            success: true,
            valid: false,
            code: 'INVALID_FORMAT',
            reason: 'Format kode voucher tidak valid',
            discount: 0,
            final_total: subtotal,
            voucher: null
        };
    }

    if (!tenantDb) {
        throw new Error('Database tenant client is required for voucher validation');
    }

    const { data: voucher, error: vErr } = await tenantDb
        .from('vouchers')
        .select('*')
        .eq('code', cleanCode)
        .maybeSingle();

    if (vErr || !voucher) {
        return {
            success: true,
            valid: false,
            code: 'NOT_FOUND',
            reason: 'Kode voucher tidak ditemukan',
            discount: 0,
            final_total: subtotal,
            voucher: null
        };
    }

    const userStats = {
        paidOrderCount: 0,
        pastVariantIds: [],
        userUsageCount: 0
    };

    if (chatId) {
        const parsedChatId = parseInt(chatId, 10);
        if (parsedChatId) {
            // Check paid orders count
            const { count: paidCount } = await tenantDb
                .from('transactions')
                .select('id', { count: 'exact', head: true })
                .eq('chat_id', parsedChatId)
                .in('status', ['PAID', 'FULFILLED']);
            
            userStats.paidOrderCount = typeof paidCount === 'number' ? paidCount : 0;

            // Check past variants if required
            if (voucher.eligibility_type === 'PAST_PURCHASE') {
                const { data: pastTrx } = await tenantDb
                    .from('transactions')
                    .select('variant_id')
                    .eq('chat_id', parsedChatId)
                    .in('status', ['PAID', 'FULFILLED']);
                userStats.pastVariantIds = (pastTrx || []).map(t => t.variant_id).filter(Boolean);
            }

            // Check usage limit
            const { count: usageCount } = await tenantDb
                .from('voucher_usages')
                .select('id', { count: 'exact', head: true })
                .eq('voucher_id', voucher.id)
                .eq('chat_id', parsedChatId)
                .in('status', ['RESERVED', 'CONFIRMED', 'EXPIRED_BURNED', 'CANCELLED_BURNED']);
            
            userStats.userUsageCount = typeof usageCount === 'number' ? usageCount : 0;
        }
    }

    const validation = evaluateVoucherEligibility(
        voucher,
        productId,
        variantId,
        subtotal,
        qty,
        userStats
    );

    const discount = validation.valid ? validation.discount : 0;
    const finalTotal = Math.max(0, subtotal - discount);

    return {
        success: true,
        valid: validation.valid,
        code: validation.code || (validation.valid ? cleanCode : null),
        reason: validation.reason || null,
        discount,
        final_total: finalTotal,
        voucher: validation.voucher ? {
            code: validation.voucher.code,
            type: validation.voucher.type,
            discount_value: validation.voucher.discount_value,
            min_spend: validation.voucher.min_spend,
        } : null,
    };
}

module.exports = {
    validateVoucherCodeFormat,
    calculateDiscount,
    evaluateVoucherEligibility,
    validateVoucherForTenant
};
