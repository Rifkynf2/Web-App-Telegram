import { tg, tgUser, currentBotId, catalogData, fetchCatalog, fetchShopSettings, fetchUserBalance, fetchUserTransactionCount, subscribeToInventoryChanges, userName, userUsername, userPhoto, shopSettings, getShopName, getBotUsername, initTenant, urlParams } from './store.js';
import { formatCurrency, hideLoading, getImageFallback, getLowestVariantPrice, formatRestockDate } from './utils.js';

// ── Mock Catalog (preview mode tanpa API) ──────────────────────────────────────
const MOCK_CATALOG = [
    {
        id: 'm1', name: 'Gsuite x Pay', description: 'Private Region UK. Hitungan durasi dimulai langsung saat transaksi sukses. PSC = PaysafeCard', image_url: '', category: 'GENERAL', stock_count: 3106,
        variants: [
            { id: 'mv1', name: '3D PSC UK', price: 630, stock: 2165, min_qty: 1, max_qty: 100, description: 'Private Region UK dengan PSC', total_sold: 18420, last_restock_at: new Date(Date.now() - 2*86400000).toISOString() },
            { id: 'mv2', name: '3D PSC FR', price: 650, stock: 941, min_qty: 1, max_qty: 100, description: 'Private Region FR dengan PSC', total_sold: 11958, last_restock_at: new Date(Date.now() - 5*86400000).toISOString() },
        ]
    },
    {
        id: 'm2', name: 'Mail Fresh', description: 'Email baru siap pakai, verified dan aman digunakan.', image_url: '', category: 'EMAIL', stock_count: 0,
        variants: [
            { id: 'mv3', name: 'Gmail Fresh', price: 1250, stock: 0, min_qty: 1, max_qty: 50, description: null, total_sold: 9341, last_restock_at: new Date(Date.now() - 14*86400000).toISOString() },
        ]
    },
    {
        id: 'm3', name: 'Alight Motion', description: 'Aplikasi edit video profesional dengan semua fitur premium unlocked.', image_url: '', category: 'APLIKASI', stock_count: 114,
        variants: [
            { id: 'mv4', name: 'Premium 1 Bulan', price: 2000, stock: 114, min_qty: 1, max_qty: 10, description: 'Akses penuh semua fitur selama 30 hari', total_sold: 4210, last_restock_at: new Date(Date.now() - 1*86400000).toISOString() },
        ]
    },
    {
        id: 'm4', name: 'Apple Music', description: 'Nikmati jutaan lagu tanpa iklan dengan kualitas audio lossless.', image_url: '', category: 'MUSIK', stock_count: 0,
        variants: [
            { id: 'mv5', name: 'Individual 3 Bulan', price: 5000, stock: 0, min_qty: 1, max_qty: 5, description: null, total_sold: 7892, last_restock_at: new Date(Date.now() - 20*86400000).toISOString() },
        ]
    },
    {
        id: 'm5', name: 'Netflix Premium', description: 'Streaming film dan serial tanpa batas di semua perangkat.', image_url: '', category: 'STREAMING', stock_count: 57,
        variants: [
            { id: 'mv6', name: '1 Bulan Sharing', price: 15000, stock: 32, min_qty: 1, max_qty: 5, description: 'Sharing screen, 1 profil aktif', total_sold: 3120, last_restock_at: new Date(Date.now() - 3*86400000).toISOString() },
            { id: 'mv7', name: '1 Bulan Private', price: 45000, stock: 25, min_qty: 1, max_qty: 3, description: 'Private screen, semua profil', total_sold: 890, last_restock_at: new Date(Date.now() - 3*86400000).toISOString() },
        ]
    },
    {
        id: 'm6', name: 'Spotify Premium', description: 'Dengarkan musik favoritmu tanpa iklan, bisa download offline.', image_url: '', category: 'MUSIK', stock_count: 200,
        variants: [
            { id: 'mv8', name: 'Individual 1 Bulan', price: 8000, stock: 200, min_qty: 1, max_qty: 10, description: null, total_sold: 12500, last_restock_at: new Date(Date.now() - 0.5*86400000).toISOString() },
        ]
    },
];

// ── DOM References ─────────────────────────────────────────────────────────────
const elGrid              = document.getElementById('product-grid');
const elHeaderUserName    = document.getElementById('header-user-name');
const elHeaderShopName    = document.getElementById('header-shop-name');
const elHeaderUserInitial = document.getElementById('header-user-initial');
const elHeaderUserAvatar  = document.getElementById('header-user-avatar');
const elProfName          = document.getElementById('prof-name');
const elProfId            = document.getElementById('prof-id');
const elProfInitial       = document.getElementById('prof-initial');
const elProfImg           = document.getElementById('prof-img');

// Detail Page Elements
const detailPage            = document.getElementById('detail-page');
const detailPageHeaderTitle = document.getElementById('detail-page-header-title');
const detailPageImage       = document.getElementById('detail-page-image');
const detailPageName        = document.getElementById('detail-page-name');
const detailPageDesc        = document.getElementById('detail-page-desc');
const detailPageSold        = document.getElementById('detail-page-sold');
const detailPageRestock     = document.getElementById('detail-page-restock');
const detailPageVariants    = document.getElementById('detail-page-variants');
const detailPagePrice       = document.getElementById('detail-page-price');
const detailPageStock       = document.getElementById('detail-page-stock');
const detailPageVariantDescBox  = document.getElementById('detail-page-variant-desc-box');
const detailPageVariantDesc     = document.getElementById('detail-page-variant-desc');
const btnBackCatalog        = document.getElementById('btn-back-catalog');

// Detail Bottom Bar (mobile)
const detailBottomBar      = document.getElementById('detail-bottom-bar');
const detailPageQty        = document.getElementById('detail-page-qty');
const detailPageTotal      = document.getElementById('detail-page-total');
const detailPageBtnMin     = document.getElementById('detail-page-btn-min');
const detailPageBtnPlus    = document.getElementById('detail-page-btn-plus');
const btnDetailCheckout    = document.getElementById('btn-detail-checkout');
const detailCheckoutText   = document.getElementById('detail-checkout-text');

// Detail Inline Controls (desktop)
const detailPageQtyDesk    = document.getElementById('detail-page-qty-desk');
const detailPageTotalDesk  = document.getElementById('detail-page-total-desk');
const detailPageBtnMinDesk = document.getElementById('detail-page-btn-min-desk');
const detailPageBtnPlusDesk= document.getElementById('detail-page-btn-plus-desk');
const btnDetailCheckoutDesk= document.getElementById('btn-detail-checkout-desk');
const detailCheckoutTextDesk=document.getElementById('detail-checkout-text-desk');

// Checkout Modal
const checkoutModal        = document.getElementById('checkout-modal');
const btnCloseModal        = document.getElementById('btn-close-modal');
const btnBackToBot         = document.getElementById('btn-back-to-bot');
const checkoutModalTitle   = checkoutModal?.querySelector('h3');
const checkoutModalDesc    = checkoutModal?.querySelector('p');

// Navigation
const navHome      = document.getElementById('nav-btn-home');
const navProfile   = document.getElementById('nav-btn-profile');
const profileView  = document.getElementById('profile-view');
const bottomNav    = document.getElementById('bottom-nav');
const telegramFallback = document.getElementById('telegram-fallback');

// ── Global State ───────────────────────────────────────────────────────────────
let activeProduct  = null;
let activeVariant  = null;
let currentQty     = 0;
let isCheckoutSubmitting = false;

// ── Init ───────────────────────────────────────────────────────────────────────
export async function initBuyerApp() {
    console.log("[App] Version: 1.2.0-ui-overhaul");

    const isPreviewMode = urlParams.get('preview') === 'true';
    const hasBotId      = !!urlParams.get('bot_id');

    if (tg && tg.initData) {
        if (telegramFallback) telegramFallback.classList.add('hidden');
        tg.expand();
        tg.ready();
    } else if (isPreviewMode) {
        if (telegramFallback) telegramFallback.classList.add('hidden');
        console.log('[App] Preview mode active — Telegram check bypassed');
    } else {
        console.log("Not in Telegram environment.");
        return;
    }

    // Preview tanpa bot_id → pakai mock data, skip semua API/Supabase calls
    if (isPreviewMode && !hasBotId) {
        shopSettings.name = 'Preview Toko';
        populateUserIdentity();
        renderBuyerProducts(MOCK_CATALOG);
        bindDetailPageEvents();
        bindCheckoutModalEvents();
        bindNavEvents();
        hideLoading();
        console.log('[App] Running with MOCK data (no bot_id)');
        return;
    }

    const tenantResolved = await initTenant();
    if (!tenantResolved) {
        // Preview dengan bot_id tapi tenant gagal → tetap pakai mock
        if (isPreviewMode) {
            console.warn('[App] Tenant failed in preview mode, falling back to mock data');
            shopSettings.name = 'Preview Toko';
            populateUserIdentity();
            renderBuyerProducts(MOCK_CATALOG);
            bindDetailPageEvents();
            bindCheckoutModalEvents();
            bindNavEvents();
            hideLoading();
            return;
        }

        hideLoading();
        if (telegramFallback) telegramFallback.classList.add('hidden');
        const errorState   = document.getElementById('error-state');
        const errorTitle   = document.getElementById('error-title');
        const errorMessage = document.getElementById('error-message');
        if (errorState) errorState.classList.replace('hidden', 'flex');
        if (errorTitle) errorTitle.textContent = 'Konfigurasi Belum Lengkap';
        if (errorMessage) {
            const bId = urlParams.get('bot_id') || 'KOSONG';
            errorMessage.innerHTML = `Bot ID: <b>${bId}</b> belum terdaftar atau link tidak lengkap.<br><br>Pastikan URL di BotFather sudah menyertakan <b>?bot_id=...</b>`;
        }
        return;
    }

    await Promise.all([fetchShopSettings(), fetchCatalog()]);

    populateUserIdentity();
    renderBuyerProducts();
    subscribeToInventoryChanges(() => renderBuyerProducts());

    bindDetailPageEvents();
    bindCheckoutModalEvents();
    bindNavEvents();

    const botUsername = getBotUsername() || currentBotId;
    if (btnBackToBot && botUsername) {
        const telegramBotUrl = `https://t.me/${botUsername}`;
        btnBackToBot.href = telegramBotUrl;
        btnBackToBot.addEventListener('click', (event) => {
            event.preventDefault();
            try {
                if (tg?.openTelegramLink) tg.openTelegramLink(telegramBotUrl);
                else window.location.href = telegramBotUrl;
            } finally {
                if (tg?.close) setTimeout(() => tg.close(), 150);
            }
        });
    }

    hideLoading();
}

// ── User Identity ──────────────────────────────────────────────────────────────
function populateUserIdentity() {
    const finalName  = tgUser?.first_name || userName;
    const initial    = finalName.charAt(0).toUpperCase();
    const finalPhoto = tgUser?.photo_url || userPhoto;

    if (elHeaderUserName)    elHeaderUserName.textContent  = finalName;
    if (elHeaderShopName)    elHeaderShopName.textContent  = shopSettings.name;
    if (elProfName)          elProfName.textContent        = finalName;

    const displayId = tgUser?.username
        ? `@${tgUser.username}`
        : (userUsername ? `@${userUsername}` : `ID: ${tgUser?.id || 'Anonymous'}`);
    if (elProfId) elProfId.textContent = displayId;

    if (finalPhoto) {
        if (elHeaderUserAvatar) { elHeaderUserAvatar.src = finalPhoto; elHeaderUserAvatar.classList.remove('hidden'); }
        if (elProfImg)          { elProfImg.src = finalPhoto; elProfImg.classList.remove('hidden'); }
    } else {
        if (elHeaderUserInitial) elHeaderUserInitial.textContent = initial;
        if (elProfInitial)       elProfInitial.textContent       = initial;
    }

    if (tgUser?.id) {
        fetchUserBalance(tgUser.id).then(balance => {
            const el = document.getElementById('prof-balance');
            if (el) el.textContent = formatCurrency(balance);
        });
        fetchUserTransactionCount(tgUser.id).then(count => {
            const el = document.getElementById('prof-total-trx');
            if (el) el.textContent = count;
        });
    }

    const btnContactAdmin = document.getElementById('btn-contact-admin');
    if (btnContactAdmin) {
        const adminUsername = shopSettings.adminContact || getBotUsername();
        if (adminUsername) {
            const adminUrl = `https://t.me/${adminUsername}`;
            btnContactAdmin.href = adminUrl;
            btnContactAdmin.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    if (tg?.openTelegramLink) tg.openTelegramLink(adminUrl);
                    else window.open(adminUrl, '_blank');
                } catch { window.open(adminUrl, '_blank'); }
            });
        }
    }
}

// ── Product Grid (2-col) ───────────────────────────────────────────────────────
function renderBuyerProducts(overrideData) {
    if (!elGrid) return;
    elGrid.innerHTML = '';

    const products = overrideData || catalogData;
    products.forEach(product => {
        const totalStock    = product.stock_count;
        const isOutOfStock  = totalStock === 0;
        const lowestPrice   = getLowestVariantPrice(product.variants);
        const hasMultiVariant = (product.variants || []).length > 1;
        const priceLabel    = formatCurrency(lowestPrice) + (hasMultiVariant ? ' +' : '');
        const imageUrl      = getImageFallback(product.image_url, product.name);

        const card = document.createElement('div');
        card.className = 'flex flex-col overflow-hidden cursor-pointer group transition-all active:scale-95';
        card.style.cssText = 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.25);';

        card.innerHTML = `
            <!-- Image -->
            <div class="relative overflow-hidden w-full shrink-0" style="aspect-ratio:4/3; background:#0d0d1f;">
                <img
                    src="${imageUrl}"
                    alt="${product.name}"
                    class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onerror="this.src='https://placehold.co/400x300/1e293b/white?text=${encodeURIComponent(product.name)}'">
                ${isOutOfStock ? `
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span class="text-white text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full" style="background:rgba(239,68,68,0.7);backdrop-filter:blur(4px);">Habis</span>
                </div>` : ''}
            </div>
            <!-- Info -->
            <div class="flex flex-col gap-2 p-3 flex-1">
                <h3 class="font-bold text-white text-sm line-clamp-2 leading-snug">${product.name}</h3>
                <div class="font-black text-blue-400 text-base tracking-wide">${priceLabel}</div>
                ${isOutOfStock
                    ? `<div class="text-[11px] text-red-400/80 font-bold">Stok Habis</div>`
                    : `<div class="flex items-center gap-1.5">
                          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                          <span class="text-[11px] text-emerald-400 font-bold">${totalStock.toLocaleString('id-ID')} stok</span>
                       </div>`
                }
                <button
                    class="w-full text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-between mt-auto transition-all active:scale-95"
                    style="${isOutOfStock
                        ? 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:rgba(107,114,128,1);cursor:not-allowed;'
                        : 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.2);color:white;'}"
                    ${isOutOfStock ? 'disabled' : ''}>
                    <span>${isOutOfStock ? 'Stok Habis' : 'Lihat Detail'}</span>
                    ${!isOutOfStock ? `<i class="fa-solid fa-arrow-right text-[10px] text-gray-400"></i>` : ''}
                </button>
            </div>
        `;

        if (!isOutOfStock) {
            card.addEventListener('click', () => openDetailPage(product));
        }

        elGrid.appendChild(card);
    });
}

// ── Detail Page ────────────────────────────────────────────────────────────────
function openDetailPage(product) {
    activeProduct = product;
    activeVariant = null;
    currentQty    = 0;

    // Populate header & image
    if (detailPageHeaderTitle) detailPageHeaderTitle.textContent = product.name;
    if (detailPageName)        detailPageName.textContent        = product.name;
    if (detailPageDesc)        detailPageDesc.textContent        = product.description || '';

    const imageUrl = getImageFallback(product.image_url, product.name);
    if (detailPageImage) {
        detailPageImage.style.backgroundImage = `url('${imageUrl}')`;
    }

    // Sold count (sum across all variants)
    if (detailPageSold) {
        const totalSold = (product.variants || []).reduce((sum, v) => sum + (parseInt(v.total_sold ?? 0, 10) || 0), 0);
        detailPageSold.textContent = totalSold.toLocaleString('id-ID');
    }

    // Render variant chips
    if (detailPageVariants) {
        detailPageVariants.innerHTML = '';
        (product.variants || []).forEach((v, index) => {
            const isOut = (v.stock || 0) === 0;
            const chip  = document.createElement('button');
            chip.className = 'variant-chip flex flex-col items-start px-4 py-3 rounded-xl transition-all active:scale-95';
            chip.style.cssText = isOut
                ? 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);opacity:0.5;cursor:not-allowed;'
                : 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);';
            chip.disabled = isOut;
            chip.innerHTML = `
                <span class="font-bold text-sm ${isOut ? 'text-gray-500' : 'text-white'}">${v.name}</span>
                <span class="text-[11px] mt-0.5 ${isOut ? 'text-red-400/60' : 'text-emerald-400/80'}">${isOut ? 'Habis' : `Stok: ${(v.stock || 0).toLocaleString('id-ID')}`}</span>
            `;
            if (!isOut) {
                chip.addEventListener('click', () => selectDetailVariant(v, chip));
            }
            detailPageVariants.appendChild(chip);

            // Auto-select first available
            if (!isOut && index === 0) {
                setTimeout(() => selectDetailVariant(v, chip), 0);
            }
        });
    }

    // Show detail page with slide-in animation
    if (detailPage) {
        detailPage.classList.remove('hidden');
        detailPage.scrollTop = 0;
        requestAnimationFrame(() => {
            detailPage.classList.add('active');
        });
    }
    if (detailBottomBar) detailBottomBar.classList.remove('hidden');
    if (bottomNav) bottomNav.classList.add('hidden');
}

function closeDetailPage() {
    if (detailPage) {
        detailPage.classList.remove('active');
        setTimeout(() => {
            detailPage.classList.add('hidden');
        }, 320);
    }
    if (detailBottomBar) detailBottomBar.classList.add('hidden');
    if (bottomNav) bottomNav.classList.remove('hidden');

    // Reset state
    activeProduct = null;
    activeVariant = null;
    currentQty    = 0;
}

function selectDetailVariant(variant, chipElement) {
    activeVariant = variant;
    currentQty    = variant.min_qty || 1;

    // Highlight chip
    const allChips = detailPageVariants?.querySelectorAll('.variant-chip');
    allChips?.forEach(c => {
        c.style.background = 'rgba(255,255,255,0.05)';
        c.style.border     = '1px solid rgba(255,255,255,0.12)';
        c.style.boxShadow  = 'none';
    });
    chipElement.style.background  = 'rgba(59,130,246,0.2)';
    chipElement.style.border      = '1px solid rgba(59,130,246,0.5)';
    chipElement.style.boxShadow   = '0 0 12px rgba(59,130,246,0.2)';

    // Update price & stock
    if (detailPagePrice) detailPagePrice.textContent = formatCurrency(variant.price);
    if (detailPageStock) {
        const stockVal = variant.stock || 0;
        detailPageStock.textContent = stockVal.toLocaleString('id-ID');
        detailPageStock.style.color = stockVal > 0 ? '#34d399' : '#f87171';
    }

    // Update restock date
    if (detailPageRestock) {
        const restockTime = variant.last_restock_at || variant.updated_at || null;
        detailPageRestock.textContent = formatRestockDate(restockTime);
    }

    // Variant description
    if (detailPageVariantDescBox && detailPageVariantDesc) {
        if (variant.description) {
            detailPageVariantDesc.textContent = variant.description;
            detailPageVariantDescBox.classList.remove('hidden');
        } else {
            detailPageVariantDescBox.classList.add('hidden');
        }
    }

    updateDetailQtyDisplay();
}

function updateDetailQty(change) {
    if (!activeVariant) return;
    const min = activeVariant.min_qty || 1;
    const max = activeVariant.max_qty || Math.min(activeVariant.stock || 999, 999);
    currentQty = Math.min(Math.max(currentQty + change, min), max);
    updateDetailQtyDisplay();
}

function updateDetailQtyDisplay() {
    if (!activeVariant) return;

    const total       = formatCurrency(currentQty * parseInt(activeVariant.price));
    const canCheckout = currentQty > 0 && !isCheckoutSubmitting;
    const btnLabel    = currentQty > 0
        ? `Beli Sekarang — ${formatCurrency(currentQty * parseInt(activeVariant.price))}`
        : 'Pilih Varian Dulu';

    // Mobile controls
    if (detailPageQty)       detailPageQty.textContent        = currentQty;
    if (detailPageTotal)     detailPageTotal.textContent      = total;
    if (btnDetailCheckout)   { btnDetailCheckout.disabled     = !canCheckout; btnDetailCheckout.style.opacity = canCheckout ? '1' : '0.5'; }
    if (detailCheckoutText)  detailCheckoutText.textContent   = btnLabel;

    // Desktop controls (same values, different elements)
    if (detailPageQtyDesk)   detailPageQtyDesk.textContent    = currentQty;
    if (detailPageTotalDesk) detailPageTotalDesk.textContent  = total;
    if (btnDetailCheckoutDesk) { btnDetailCheckoutDesk.disabled = !canCheckout; btnDetailCheckoutDesk.style.opacity = canCheckout ? '1' : '0.5'; }
    if (detailCheckoutTextDesk) detailCheckoutTextDesk.textContent = btnLabel;
}

// ── Checkout ───────────────────────────────────────────────────────────────────
async function handleCheckout() {
    if (!activeVariant || currentQty < 1 || isCheckoutSubmitting) return;

    isCheckoutSubmitting = true;
    const loadingLabel = 'Membuat QRIS di Telegram...';
    if (btnDetailCheckout)    { btnDetailCheckout.disabled = true;    btnDetailCheckout.style.opacity = '0.6'; }
    if (detailCheckoutText)   detailCheckoutText.textContent   = loadingLabel;
    if (btnDetailCheckoutDesk){ btnDetailCheckoutDesk.disabled = true; btnDetailCheckoutDesk.style.opacity = '0.6'; }
    if (detailCheckoutTextDesk) detailCheckoutTextDesk.textContent = loadingLabel;

    try {
        const response = await fetch('/api/webapp/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': tg?.initData || ''
            },
            body: JSON.stringify({
                bot_id: currentBotId,
                variant_id: activeVariant.id,
                qty: currentQty
            })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Checkout gagal diproses');

        closeDetailPage();
        setTimeout(() => showCheckoutModal(
            'QRIS Terkirim ke Telegram',
            'Pesanan Anda sudah diteruskan ke bot. Silakan cek chat Telegram untuk melihat QRIS dan menyelesaikan pembayaran.'
        ), 350);

    } catch (err) {
        console.error('[Buyer] Checkout failed:', err.message);
        if (tg?.showAlert) {
            tg.showAlert(err.message || 'Checkout gagal diproses');
        } else {
            closeDetailPage();
            setTimeout(() => showCheckoutModal(
                'Checkout Gagal',
                err.message || 'Terjadi kesalahan saat membuat QRIS. Silakan coba lagi dari Mini App.'
            ), 350);
        }
    } finally {
        isCheckoutSubmitting = false;
        updateDetailQtyDisplay();
    }
}

function showCheckoutModal(title, description) {
    if (checkoutModalTitle) checkoutModalTitle.textContent = title;
    if (checkoutModalDesc)  checkoutModalDesc.textContent  = description;
    checkoutModal?.classList.replace('hidden', 'flex');
    if (bottomNav) bottomNav.classList.add('hidden');
}

// ── Event Binding ──────────────────────────────────────────────────────────────
function bindDetailPageEvents() {
    if (btnBackCatalog)      btnBackCatalog.addEventListener('click', closeDetailPage);
    document.getElementById('btn-back-to-home')?.addEventListener('click', closeDetailPage);

    // Mobile controls
    if (detailPageBtnMin)    detailPageBtnMin.addEventListener('click', () => updateDetailQty(-1));
    if (detailPageBtnPlus)   detailPageBtnPlus.addEventListener('click', () => updateDetailQty(1));
    if (btnDetailCheckout)   btnDetailCheckout.addEventListener('click', handleCheckout);

    // Desktop controls
    if (detailPageBtnMinDesk)  detailPageBtnMinDesk.addEventListener('click', () => updateDetailQty(-1));
    if (detailPageBtnPlusDesk) detailPageBtnPlusDesk.addEventListener('click', () => updateDetailQty(1));
    if (btnDetailCheckoutDesk) btnDetailCheckoutDesk.addEventListener('click', handleCheckout);
}

function bindCheckoutModalEvents() {
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            checkoutModal?.classList.replace('flex', 'hidden');
            if (bottomNav) bottomNav.classList.remove('hidden');
        });
    }
}

function bindNavEvents() {
    if (navHome)    navHome.addEventListener('click', () => switchTab('home'));
    if (navProfile) navProfile.addEventListener('click', () => switchTab('profile'));
}

// ── Tab Switching ──────────────────────────────────────────────────────────────
function switchTab(tab) {
    if (!elGrid || !profileView || !navHome || !navProfile) return;

    // Close detail page if open
    if (detailPage && detailPage.classList.contains('active')) {
        closeDetailPage();
    }

    if (tab === 'home') {
        elGrid.classList.remove('hidden');
        profileView.classList.replace('flex', 'hidden');

        navHome.style.background = 'rgba(59,130,246,0.2)';
        navHome.querySelector('i').className    = 'fa-solid fa-house text-lg text-blue-400';
        navHome.querySelector('span').className = 'text-[9px] font-black uppercase tracking-widest text-blue-400';
        navHome.classList.add('nav-tab-active');
        navProfile.style.background = 'transparent';
        navProfile.querySelector('i').className    = 'fa-solid fa-user-astronaut text-lg text-gray-400';
        navProfile.querySelector('span').className = 'text-[9px] font-black uppercase tracking-widest text-gray-400';
        navProfile.classList.remove('nav-tab-active');
    } else {
        elGrid.classList.add('hidden');
        profileView.classList.replace('hidden', 'flex');

        navProfile.style.background = 'rgba(59,130,246,0.2)';
        navProfile.querySelector('i').className    = 'fa-solid fa-user-astronaut text-lg text-blue-400';
        navProfile.querySelector('span').className = 'text-[9px] font-black uppercase tracking-widest text-blue-400';
        navProfile.classList.add('nav-tab-active');
        navHome.style.background = 'transparent';
        navHome.querySelector('i').className    = 'fa-solid fa-house text-lg text-gray-400';
        navHome.querySelector('span').className = 'text-[9px] font-black uppercase tracking-widest text-gray-400';
        navHome.classList.remove('nav-tab-active');
    }
}
