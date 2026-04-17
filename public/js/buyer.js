import { tg, tgUser, currentBotId, catalogData, fetchCatalog, fetchShopSettings, fetchUserBalance, userName, userUsername, userPhoto, shopSettings, getShopName, initTenant } from './store.js';
import { formatCurrency, hideLoading, getImageFallback } from './utils.js';

// DOM Elements - Buyer
const elGrid = document.getElementById('product-grid');
const elHeaderUserName = document.getElementById('header-user-name');
const elHeaderShopName = document.getElementById('header-shop-name');
const elHeaderUserInitial = document.getElementById('header-user-initial');
const elHeaderUserAvatar = document.getElementById('header-user-avatar');
const elProfName = document.getElementById('prof-name');
const elProfId = document.getElementById('prof-id');
const elProfInitial = document.getElementById('prof-initial');
const elProfImg = document.getElementById('prof-img');

// Detail Modal Elements
const detailModal = document.getElementById('detail-modal');
const detailModalCard = document.getElementById('detail-modal-card');
const btnCloseDetail = document.getElementById('btn-close-detail');
const detailTitle = document.getElementById('detail-title');
const detailSoldCount = document.getElementById('detail-sold-count');
const detailVariantsContainer = document.getElementById('detail-variants-container');
const detailImage = document.getElementById('detail-image');
const detailPrice = document.getElementById('detail-price');
const detailQty = document.getElementById('detail-qty');
const btnMin = document.getElementById('detail-btn-min');
const btnPlus = document.getElementById('detail-btn-plus');
const btnCheckout = document.getElementById('btn-checkout');
const checkoutText = document.getElementById('checkout-text');
const elDetailDesc = document.getElementById('detail-desc');
const elVariantInfoBox = document.getElementById('variant-info-box');
const elVariantDesc = document.getElementById('variant-desc');

// Checkout Modal
const checkoutModal = document.getElementById('checkout-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnBackToBot = document.getElementById('btn-back-to-bot');

// Nav Elements
const navHome = document.getElementById('nav-btn-home');
const navProfile = document.getElementById('nav-btn-profile');
const profileView = document.getElementById('profile-view');
const bottomNav = document.getElementById('bottom-nav');
const telegramFallback = document.getElementById('telegram-fallback');

// Global State for Buyer
let activeProduct = null;
let activeVariant = null;
let currentQty = 0;

export async function initBuyerApp() {
    // 1. Check Technical Environment
    if (tg && tg.initData) {
        if (telegramFallback) telegramFallback.classList.add('hidden');
        tg.expand();
        tg.ready();
    } else {
        // Stop here and keep fallback visible if not in Telegram
        console.log("Not in Telegram environment.");
        return;
    }

    // 2. Resolve Tenant (connects to the correct tenant database)
    const tenantResolved = await initTenant();
    if (!tenantResolved) {
        hideLoading();
        const errorState = document.getElementById('error-state');
        const errorTitle = document.getElementById('error-title');
        const errorMessage = document.getElementById('error-message');
        if (errorState) errorState.classList.replace('hidden', 'flex');
        if (errorTitle) errorTitle.textContent = 'Toko Tidak Ditemukan';
        if (errorMessage) errorMessage.textContent = 'Bot ini belum terdaftar di sistem pusat.';
        return;
    }

    // 3. Fetch Live Data in Parallel (Super Irit & Cepat)
    await Promise.all([
        fetchShopSettings(),
        fetchCatalog()
    ]);
    
    populateUserIdentity();
    renderBuyerProducts();

    // Bind Detail Modal Buttons
    if (btnMin) btnMin.addEventListener('click', () => updateQty(-1));
    if (btnPlus) btnPlus.addEventListener('click', () => updateQty(1));
    if (btnCloseDetail) btnCloseDetail.addEventListener('click', closeDetailModal);
    if (btnCheckout) btnCheckout.addEventListener('click', handleCheckout);

    // Bind Checkout Modal Buttons
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            checkoutModal.classList.replace('flex', 'hidden');
            if (bottomNav) bottomNav.classList.remove('hidden');
        });
    }
    
    // Add backdrop-click to close
    if (detailModal) {
        detailModal.addEventListener('click', (e) => {
            if (e.target === detailModal) closeDetailModal();
        });
    }

    if (btnBackToBot && currentBotId) {
        btnBackToBot.href = `tg://resolve?domain=${currentBotId}`;
    }

    // Bind Navigation
    if (navHome) navHome.addEventListener('click', () => switchTab('home'));
    if (navProfile) navProfile.addEventListener('click', () => switchTab('profile'));

    hideLoading();
}

function populateUserIdentity() {
    // Header
    if (elHeaderUserName) elHeaderUserName.textContent = tgUser?.first_name || userName;
    if (elHeaderShopName) elHeaderShopName.textContent = shopSettings.name;
    
    // Profile Tab
    if (elProfName) elProfName.textContent = tgUser?.first_name || userName;
    const displayId = tgUser?.username ? `@${tgUser.username}` : (userUsername ? `@${userUsername}` : `ID: ${tgUser?.id || 'Anonymous'}`);
    if (elProfId) elProfId.textContent = displayId;
    
    // Avatar Logic
    const finalName = tgUser?.first_name || userName;
    const initial = finalName.charAt(0).toUpperCase();
    const finalPhoto = tgUser?.photo_url || userPhoto;
    
    if (finalPhoto) {
        if (elHeaderUserAvatar) {
            elHeaderUserAvatar.src = finalPhoto;
            elHeaderUserAvatar.classList.remove('hidden');
        }
        if (elProfImg) {
            elProfImg.src = finalPhoto;
            elProfImg.classList.remove('hidden');
        }
    } else {
        if (elHeaderUserInitial) elHeaderUserInitial.textContent = initial;
        if (elProfInitial) elProfInitial.textContent = initial;
    }

    // Balance (Live fetch if possible)
    if (tgUser?.id) {
        fetchUserBalance(tgUser.id).then(balance => {
            const elBalance = document.getElementById('prof-balance');
            if (elBalance) elBalance.textContent = formatCurrency(balance);
        });
    }
}

function renderBuyerProducts() {
    if (!elGrid) return;
    elGrid.innerHTML = '';
    
    const products = catalogData;
    
    products.forEach(product => {
        const div = document.createElement('div');
        div.className = 'glass-panel p-3 flex flex-col gap-3 group cursor-pointer hover:bg-white/5 transition-all transform hover:-translate-y-1 !rounded-3xl';
        
        const totalStock = product.stock_count;
        const badgeColor = totalStock > 0 ? 'bg-green-500' : 'bg-red-500';
        const priceDisplay = formatCurrency(product.variants[0]?.price || 0);

        div.innerHTML = `
            <!-- Inner Logo Box -->
            <div class="w-full aspect-square rounded-2xl bg-white/5 flex items-center justify-center relative overflow-hidden group-hover:bg-white/10 transition-colors">
                <!-- Stock Badge -->
                <div class="absolute top-2 right-2 ${badgeColor} text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-lg z-20">
                    ${totalStock}
                </div>
                
                <!-- Logo -->
                <div class="w-2/3 h-2/3 rounded-full overflow-hidden shadow-2xl relative z-10">
                    <img src="${getImageFallback(product.image_url, product.name)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
                </div>
            </div>
            
            <!-- Product Info -->
            <div class="flex flex-col gap-1 px-1 pb-1">
                <h3 class="font-bold text-white text-sm line-clamp-1 group-hover:text-indigo-300 transition-colors uppercase tracking-tight">${product.name}</h3>
                <div class="text-blue-400 font-black text-sm tracking-wide">${priceDisplay}</div>
            </div>
        `;

        div.onclick = () => openDetailModal(product);
        elGrid.appendChild(div);
    });
}

function openDetailModal(product) {
    activeProduct = product;
    detailTitle.textContent = product.name;
    if (elDetailDesc) elDetailDesc.textContent = product.description || '';
    const finalImageUrl = getImageFallback(product.image_url, product.name);
    detailImage.style.backgroundImage = `url('${finalImageUrl}')`;
    
    // Set random-looking sold count for aesthetic
    if (detailSoldCount) {
        const baseSold = 1000 + (product.id * 123);
        detailSoldCount.textContent = `${baseSold.toLocaleString()} terjual`;
    }

    // Render Variants as Cards
    if (detailVariantsContainer) {
        detailVariantsContainer.innerHTML = '';
        product.variants.forEach((v, index) => {
            const card = document.createElement('div');
            card.className = 'variant-card glass-panel p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-white/5 transition-all border border-white/10 relative overflow-hidden group';
            
            // Stock info from variants (already calculated during fetchCatalog)
            const dummyStock = v.stock || 0;
            const isOutOfStock = dummyStock === 0;
            const statusColor = isOutOfStock ? '#ef4444' : '#10b981'; // Red vs Green
            const statusLabel = isOutOfStock ? 'habis' : 'tersedia';

            card.innerHTML = `
                <div class="flex flex-col gap-1 z-10 ${isOutOfStock ? 'opacity-50' : ''}">
                    <h4 class="font-bold text-white text-md group-hover:text-indigo-300 transition-colors">${v.name}</h4>
                    <p class="text-blue-400 font-black text-lg">${formatCurrency(v.price)}</p>
                </div>
                <div class="flex flex-col items-center justify-center z-10">
                    <span class="text-2xl font-black" style="color: ${statusColor};">${dummyStock}</span>
                    <span class="text-[8px] uppercase font-bold tracking-widest" style="color: ${statusColor}; opacity: 0.8;">${statusLabel}</span>
                </div>
                <!-- Selection Indicator -->
                <div class="absolute inset-y-0 left-0 w-1 bg-indigo-500 opacity-0 transition-opacity"></div>
            `;
            
            if (isOutOfStock) {
                card.classList.add('pointer-events-none', 'grayscale-[0.5]');
                card.title = "Stok Sedang Kosong";
            } else {
                card.onclick = () => selectVariant(v, card);
            }
            
            detailVariantsContainer.appendChild(card);
            
            // Auto select first variant
            if (index === 0) selectVariant(v, card);
        });
    }

    // Animate details in
    detailModal.classList.remove('hidden');
    detailModal.classList.add('flex');
    if (bottomNav) bottomNav.classList.add('hidden');
    setTimeout(() => {
        detailModalCard.classList.remove('translate-y-full');
    }, 10);
}

function selectVariant(variant, cardElement) {
    activeVariant = variant;
    currentQty = variant.min_qty || 1;

    // Highlight current card
    const allCards = detailVariantsContainer.querySelectorAll('.variant-card');
    allCards.forEach(c => {
        c.classList.remove('border-indigo-500', 'bg-indigo-500/10', 'ring-1', 'ring-indigo-500/50');
        c.classList.add('border-white/10');
        c.querySelector('.absolute').classList.add('opacity-0');
        c.querySelector('.absolute').classList.remove('opacity-100');
    });

    cardElement.classList.remove('border-white/10');
    cardElement.classList.add('border-indigo-500', 'bg-indigo-500/10', 'ring-1', 'ring-indigo-500/50');
    cardElement.querySelector('.absolute').classList.remove('opacity-0');
    cardElement.querySelector('.absolute').classList.add('opacity-100');
    
    // Update Variant Description
    if (elVariantInfoBox && elVariantDesc) {
        if (variant.description) {
            elVariantDesc.textContent = variant.description;
            elVariantInfoBox.classList.remove('hidden');
        } else {
            elVariantInfoBox.classList.add('hidden');
        }
    }

    updateQtyDisplay();
}

function closeDetailModal() {
    detailModalCard.classList.add('translate-y-full');
    setTimeout(() => {
        detailModal.classList.remove('flex');
        detailModal.classList.add('hidden');
        if (bottomNav) bottomNav.classList.remove('hidden');
    }, 300);
}

function updateQty(change) {
    if (!activeVariant) return;
    
    const min = activeVariant.min_qty || 1;
    const max = activeVariant.max_qty || 999;

    let newQty = currentQty + change;
    
    if (newQty < min) newQty = min;
    if (newQty > max) newQty = max;
    
    currentQty = newQty;
    updateQtyDisplay();
}

function updateQtyDisplay() {
    if (!activeVariant) return;

    detailQty.textContent = currentQty;
    
    const price = parseInt(activeVariant.price);
    const total = currentQty * price;
    
    detailPrice.textContent = formatCurrency(total);
    
    btnCheckout.disabled = currentQty === 0;
    
    if (currentQty > 0) {
        checkoutText.textContent = `Checkout - ${formatCurrency(total)}`;
        btnCheckout.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        checkoutText.textContent = 'Pilih Jumlah Dulu';
        btnCheckout.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

function handleCheckout() {
    closeDetailModal();
    setTimeout(() => {
        checkoutModal.classList.remove('hidden');
        checkoutModal.classList.add('flex');
    }, 300);
}

function switchTab(tab) {
    if (!elGrid || !profileView || !navHome || !navProfile) return;

    if (tab === 'home') {
        elGrid.classList.remove('hidden');
        profileView.classList.replace('flex', 'hidden');
        
        navHome.classList.replace('text-gray-500', 'text-blue-400');
        navProfile.classList.replace('text-blue-400', 'text-gray-500');
        navProfile.classList.add('hover:text-white');
    } else {
        elGrid.classList.add('hidden');
        profileView.classList.replace('hidden', 'flex');
        
        navProfile.classList.replace('text-gray-500', 'text-blue-400');
        navProfile.classList.remove('hover:text-white');
        navHome.classList.replace('text-blue-400', 'text-gray-500');
    }
}
