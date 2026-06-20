import { supabase } from './supabaseClient.js';
import { tg, tgUser, fetchShopSettings, shopSettings, checkIsAdmin, fetchAdminStats, fetchAdminCatalog, urlParams, initTenant, currentBotId } from './store.js';
import { formatCurrency, hideLoading, getImageFallback, getLowestVariantPrice, normalizeImageUrl } from './utils.js';
import { openStockModal, initAdminStock } from './adminStock.js';

// ── Mock Data (preview mode) ───────────────────────────────────────────────────
const MOCK_ADMIN_STATS = {
    products: 6, stock_available: 3591, sold_lifetime: 54331,
    users: 248, orders_today: 17, revenue_lifetime: 18750000, logo_url: ''
};

const MOCK_ADMIN_PRODUCTS = [
    {
        id: 'ma1', name: 'Gsuite x Pay', description: 'Private Region UK. PSC = PaysafeCard', image_url: '', is_active: true, stock_count: 3106, sort_order: 1,
        variants: [
            { id: 'mv1', name: '3D PSC UK', price: 630, is_active: true, stock: 2165, total_sold: 18420 },
            { id: 'mv2', name: '3D PSC FR', price: 650, is_active: true, stock: 941, total_sold: 11958 },
        ]
    },
    {
        id: 'ma2', name: 'Mail Fresh', description: 'Email baru siap pakai, verified dan aman.', image_url: '', is_active: false, stock_count: 0, sort_order: 2,
        variants: [
            { id: 'mv3', name: 'Gmail Fresh', price: 1250, is_active: true, stock: 0, total_sold: 9341 },
        ]
    },
    {
        id: 'ma3', name: 'Alight Motion', description: 'Aplikasi edit video premium unlocked.', image_url: '', is_active: true, stock_count: 114, sort_order: 3,
        variants: [
            { id: 'mv4', name: 'Premium 1 Bulan', price: 2000, is_active: true, stock: 114, total_sold: 4210 },
        ]
    },
    {
        id: 'ma4', name: 'Apple Music', description: 'Jutaan lagu tanpa iklan, audio lossless.', image_url: '', is_active: false, stock_count: 0, sort_order: 4,
        variants: [
            { id: 'mv5', name: 'Individual 3 Bulan', price: 5000, is_active: false, stock: 0, total_sold: 7892 },
        ]
    },
    {
        id: 'ma5', name: 'Netflix Premium', description: 'Streaming film dan serial tanpa batas.', image_url: '', is_active: true, stock_count: 57, sort_order: 5,
        variants: [
            { id: 'mv6', name: '1 Bulan Sharing', price: 15000, is_active: true, stock: 32, total_sold: 3120 },
            { id: 'mv7', name: '1 Bulan Private', price: 45000, is_active: true, stock: 25, total_sold: 890 },
        ]
    },
    {
        id: 'ma6', name: 'Spotify Premium', description: 'Musik tanpa iklan, bisa download offline.', image_url: '', is_active: true, stock_count: 200, sort_order: 6,
        variants: [
            { id: 'mv8', name: 'Individual 1 Bulan', price: 8000, is_active: true, stock: 200, total_sold: 12500 },
        ]
    },
];

const telegramFallback = document.getElementById('telegram-fallback');

// Elements
const elHeaderShopName = document.getElementById('header-shop-name');
const adminList = document.getElementById('admin-product-list');

// Admin Slide-In Pages
const adminProductSlide = document.getElementById('admin-product-slide');
const btnAddProduct = document.getElementById('btn-add-product');
const btnSaveProduct = document.getElementById('btn-save-product');
const btnAddVariant = document.getElementById('btn-add-variant');
const btnTutorialCdn = document.getElementById('btn-tutorial-cdn');
const adminVariantsContainer = document.getElementById('admin-variants-container');
const adminAuthToken = urlParams.get('auth') || '';

function getSwalTheme() {
    const isLight = document.documentElement.dataset.theme === 'light';
    return {
        background: isLight ? '#f5f3ff' : '#1e293b',
        color: isLight ? '#1e1d35' : '#fff',
    };
}
let adminCatalogData = [];
let latestAdminStats = null;
let deletedVariantIds = [];

function updateVariantStatusBadge(block) {
    const select = block.querySelector('.var-status');
    const badge = block.querySelector('.variant-status-badge');
    const isActive = select?.value === 'true';

    if (!badge) return;

    badge.textContent = isActive ? 'Aktif' : 'Nonaktif';
    badge.className = `variant-status-badge inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
        isActive
            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
            : 'border-amber-400/40 bg-amber-500/15 text-amber-200'
    }`;
}

export async function initAdminApp() {
    console.log("[App] Version: 1.1.0-tenant-resolver");
    const telegramFallback = document.getElementById('telegram-fallback');

    // 1. Technical & Environment Check
    const urlAuthToken  = urlParams.get('auth');
    const isPreviewMode = urlParams.get('preview') === 'true';

    if (tg && tg.initData) {
        if (telegramFallback) telegramFallback.classList.add('hidden');
        tg.expand();
        tg.ready();
    } else if (urlAuthToken) {
        if (telegramFallback) telegramFallback.classList.add('hidden');
        console.log("Accessing from browser with auth token.");
    } else if (isPreviewMode) {
        if (telegramFallback) telegramFallback.classList.add('hidden');
        console.log('[Admin] Preview mode active — auth bypassed');
    } else {
        console.log("Not in Telegram environment & no auth token.");
        return;
    }

    // 2. Resolve Tenant (CRITICAL)
    // Preview mode tanpa bot_id: skip semua API, render mock data langsung
    if (isPreviewMode && !urlParams.get('bot_id')) {
        hideLoading();
        if (elHeaderShopName) elHeaderShopName.textContent = 'Preview Toko';
        adminCatalogData = MOCK_ADMIN_PRODUCTS;
        renderAdminView(MOCK_ADMIN_STATS);
        initAdminStock();
        setupAdminModalListeners();
        console.log('[Admin] Preview mode — mock data loaded');
        return;
    }

    const tenantResolved = await initTenant();
    if (!tenantResolved) {
        // Preview dengan bot_id tapi gagal: tampilkan shell kosong
        if (isPreviewMode) {
            hideLoading();
            if (elHeaderShopName) elHeaderShopName.textContent = 'Preview Admin';
            console.warn('[Admin] Tenant failed in preview mode, showing empty shell');
            return;
        }
        hideLoading();
        if (telegramFallback) telegramFallback.classList.add('hidden');
        const errorState = document.getElementById('error-state');
        const errorTitle = document.getElementById('error-title');
        const errorMessage = document.getElementById('error-message');

        if (errorState) errorState.classList.replace('hidden', 'flex');
        if (errorTitle) errorTitle.textContent = 'Konfigurasi Tenant Gagal';
        if (errorMessage) {
            const bId = urlParams.get('bot_id') || 'KOSONG';
            errorMessage.innerHTML = `Bot ID: <b>${bId}</b>. Link Admin tidak lengkap atau bot belum terdaftar di Master DB.<br><br>Gunakan link /admin yang diberikan oleh bot.`;
        }
        return;
    }

    // 3. Security Gate (Token Verification - now reads from TENANT DB)
    let dbAuthToken = null;
    console.log("[Security] Validating token for URL:", urlAuthToken ? urlAuthToken.substring(0, 15) + "..." : "MISSING");

    try {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'ADMIN_AUTH_TOKEN')
            .maybeSingle();
        
        if (data) dbAuthToken = data.value;
        console.log("[Security] Database token found:", dbAuthToken ? dbAuthToken.substring(0, 15) + "..." : "NOT FOUND");
    } catch (e) {
        console.error("[Security] Database fetch failed", e);
    }

    // Validate Token
    if (!urlAuthToken || urlAuthToken !== dbAuthToken) {
        console.error("[Security] ❌ TOKEN MISMATCH!");
        hideLoading();
        Swal.fire({
            title: '🔐 Keamanan: Akses Ditolak',
            text: 'Token keamanan tidak valid atau sudah kedaluwarsa. Silakan ambil link baru dari bot.',
            icon: 'warning',
            confirmButtonText: 'Kembali Ke Bot',
            ...getSwalTheme(),
            allowOutsideClick: false
        }).then(() => {
            window.location.href = `https://t.me/rnf_shopp`;
        });
        return;
    }

    // 4. Identity Check (Admin Role)
    const isAdmin = await checkIsAdmin(tgUser?.id);
    
    // Keamanan Cerdas:
    // Jika di Telegram: Wajib terdaftar ID-nya.
    // Jika di Browser: Asalkan Token valid, boleh masuk (karena link token itu rahasia).
    if (!isAdmin && tgUser?.id) {
        hideLoading();
        Swal.fire({
            title: 'Akses Ditolak',
            text: 'ID Telegram Anda (' + tgUser.id + ') tidak terdaftar sebagai Admin.',
            icon: 'error',
            confirmButtonText: 'Tutup',
            ...getSwalTheme()
        }).then(() => {
            tg.close();
        });
        return;
    }

    if (!isAdmin && !tgUser?.id && !urlAuthToken) {
        // Jika tidak ada ID dan tidak ada token (akses ilegal langsung ke URL)
        hideLoading();
        return; 
    }

    // 5. Fetch Live Data in Parallel (Super Irit & Cepat)
    console.log("[Stats] Fetching data...");
    const [_, adminData] = await Promise.all([
        fetchShopSettings(),
        refreshAdminData()
    ]);
    console.log("[Stats] Received:", adminData?.stats);

    if (elHeaderShopName) elHeaderShopName.textContent = shopSettings.name;
    
    initAdminStock();
    setupAdminModalListeners();
    hideLoading();
}

export async function refreshAdminData() {
    const [stats, products] = await Promise.all([
        fetchAdminStats(),
        fetchAdminCatalog(adminAuthToken)
    ]);

    latestAdminStats = stats;
    adminCatalogData = products;
    renderAdminView(stats);
    return { stats, products };
}

function renderAdminView(stats = null) {
    stats = stats || latestAdminStats;
    const adminView = document.getElementById('admin-view');
    if (adminView) adminView.classList.remove('hidden');
    
    const products = adminCatalogData;

    // Live Stats injection
    const eProd = document.getElementById('admin-stat-products');
    const eStock = document.getElementById('admin-stat-stock');
    const eSold = document.getElementById('admin-stat-sold');
    const eUsers = document.getElementById('admin-stat-users');
    const eOrderToday = document.getElementById('admin-stat-orders-today');
    const eRevenue = document.getElementById('admin-stat-revenue');

    if (elHeaderShopName) elHeaderShopName.textContent = shopSettings.name;
    const logo = document.getElementById('shop-logo');
    const logoFallback = document.getElementById('shop-initial');
    const logoUrl = stats?.logo_url || shopSettings.logoUrl || '';
    if (logo) {
        if (logoUrl) {
            logo.src = logoUrl;
            logo.classList.remove('hidden');
            if (logoFallback) logoFallback.classList.add('hidden');
        } else {
            logo.removeAttribute('src');
            logo.classList.add('hidden');
            if (logoFallback) logoFallback.classList.remove('hidden');
        }
    }

    if(eProd) eProd.textContent = stats?.products ?? products.length;
    if(eStock) eStock.textContent = stats?.stock_available ?? products.reduce((sum, p) => sum + p.stock_count, 0);
    
    // Real Stats from Database (Highly optimized)
    if(stats) {
        if(eUsers) eUsers.textContent = stats.users;
        if(eOrderToday) eOrderToday.textContent = stats.orders_today;
        if(eRevenue) eRevenue.textContent = formatCurrency(stats.revenue_lifetime);
        if(eSold) eSold.textContent = stats.sold_lifetime;
    }

    if (adminList) {
        adminList.innerHTML = '';
        
        if (products.length === 0) {
            adminList.innerHTML = `
                <div class="glass-panel p-8 flex flex-col items-center justify-center py-10 opacity-50">
                    <i class="fa-solid fa-box-open text-4xl mb-3"></i>
                    <p class="text-sm">Belum ada produk</p>
                </div>
            `;
            return;
        }

        products.forEach(product => {
            const div = createAdminProductRow(product);
            adminList.appendChild(div);
        });
    }
}

function createAdminProductRow(product) {
    const div = document.createElement('div');
    div.className = 'glass-panel p-3 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors';
    
    const varCount = product.variants ? product.variants.length : 0;
    const activeVarCount = (product.variants || []).filter((variant) => variant.is_active !== false).length;
    const compactSubText = varCount > 0 ? `${activeVarCount}/${varCount} varian aktif` : 'Belum ada varian';
    const lowestPrice = getLowestVariantPrice((product.variants || []).filter((variant) => variant.is_active !== false));
    const productStatus = product.is_active === false ? 'Nonaktif' : 'Aktif';

    div.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-lg bg-white/5 overflow-hidden shrink-0">
                <img src="${getImageFallback(product.image_url, product.name)}" class="w-full h-full object-cover">
            </div>
            <div class="text-left w-full">
                <h4 class="text-xs font-bold text-white line-clamp-1">${product.name}</h4>
                <p class="text-[10px] text-gray-400 mt-1">${compactSubText} • ${product.stock_count} Stok</p>
                <p class="text-[9px] ${product.is_active === false ? 'text-red-400' : 'text-emerald-400'} mt-1 uppercase tracking-widest font-bold">${productStatus}</p>
            </div>
        </div>
        <div class="flex items-center gap-2">
            <button class="w-8 h-8 shrink-0 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white flex items-center justify-center btn-stock" title="Kelola Stok">
                <i class="fa-solid fa-box-open text-xs"></i>
            </button>
            <button class="w-8 h-8 shrink-0 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center btn-edit" title="Edit Produk">
                <i class="fa-solid fa-pen-to-square text-xs"></i>
            </button>
            <button class="w-8 h-8 shrink-0 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center btn-delete" title="Hapus Produk">
                <i class="fa-solid fa-trash text-xs"></i>
            </button>
        </div>
    `;

    const btnStock = div.querySelector('.btn-stock');
    if(btnStock) btnStock.onclick = () => openStockModal(product);
    
    const btnEdit = div.querySelector('.btn-edit');
    if(btnEdit) btnEdit.onclick = () => openAdminModal(product);
    
    const btnDelete = div.querySelector('.btn-delete');
    if(btnDelete) btnDelete.onclick = () => deleteProduct(product.id, product.name);

    return div;
}

function setupAdminModalListeners() {
    if (btnTutorialCdn) {
        btnTutorialCdn.addEventListener('click', () => {
            Swal.fire({
                title: 'Katalog Gambar (CDN)',
                html: `
                    <div class="text-xs text-gray-300 text-left space-y-4 leading-relaxed">
                        <p>Sistem kami tidak menyimpan file original foto untuk menjaga kecepatan web. Anda wajib menggunakan <b>Direct Link (URL)</b> gambar.</p>
                        
                        <div class="bg-white/5 p-3 rounded-lg border border-white/10">
                            <p class="font-bold text-white mb-2 underline">Metode 1: Upload ke Hosting (Rekomendasi)</p>
                            <ol class="list-decimal pl-4 space-y-1">
                                <li>Buka <b>Postimages.org</b> atau <b>ImgBB.com</b></li>
                                <li>Upload foto produk Anda</li>
                                <li>Cari bagian <b>"Direct Link"</b> (Link Langsung)</li>
                                <li>Copy dan Tempel link tersebut ke kolom URL.</li>
                            </ol>
                        </div>

                        <div class="bg-white/5 p-3 rounded-lg border border-white/10">
                            <p class="font-bold text-white mb-2 underline">Metode 2: Link Dari Internet</p>
                            <p>Anda bisa klik kanan gambar di internet, pilih <b>"Copy Image Address"</b>, lalu tempel di sini. Pastikan link berakhiran .jpg, .png, atau .webp.</p>
                        </div>

                        <div class="bg-white/5 p-3 rounded-lg border border-white/10">
                            <p class="font-bold text-white mb-2 underline">Contoh Copy Link yang Benar</p>
                            <p>Jika penyedia gambar memberi kode HTML atau BBCode, copy hanya link gambar langsungnya, bukan seluruh kodenya.</p>
                            <p class="mt-2"><b>Benar:</b><br><code>https://i.ibb.co.com/xxxx/namafile.png</code></p>
                            <p class="mt-2"><b>Salah:</b><br><code>https://ibb.co.com/xxxx</code></p>
                            <p class="mt-2"><b>Salah:</b><br><code>&lt;a href="..."&gt;&lt;img src="..."&gt;&lt;/a&gt;</code></p>
                        </div>
                    </div>
                `,
                icon: 'info',
                ...getSwalTheme(),
                confirmButtonColor: '#3b82f6',
                confirmButtonText: 'Saya Paham'
            });
        });
    }

    if (btnAddVariant) {
        btnAddVariant.addEventListener('click', () => addVariantBlock());
    }

    if (btnAddProduct) btnAddProduct.addEventListener('click', () => openAdminModal());

    document.getElementById('btn-back-admin-product')?.addEventListener('click', () => {
        adminProductSlide.classList.remove('active');
    });
    document.getElementById('btn-save-product-header')?.addEventListener('click', () => {
        btnSaveProduct.click();
    });
}

function addVariantBlock(variant = null) {
    const div = document.createElement('div');
    div.className = 'glass-panel p-4 flex flex-col gap-3 relative overflow-hidden bg-black/20';
    if (variant && variant.id) div.setAttribute('data-id', variant.id);
    
    const defaultData = variant || { name: '', price: '', fulfillment: '', description: '', min_qty: 1, max_qty: 999, qty_per_purchase: 1, snk: '', is_active: true };
    
    div.innerHTML = `
        <div class="absolute top-0 right-0 left-0 h-1 bg-indigo-500/50"></div>
        <button class="absolute top-3 right-3 text-red-400 hover:text-red-300 transition-colors btn-remove-variant" title="Hapus Varian">
            <i class="fa-solid fa-circle-minus"></i>
        </button>
        <div class="mt-1 flex items-center justify-between gap-2 pr-8">
            <div class="text-[10px] uppercase tracking-[0.25em] text-slate-400 font-bold">Varian</div>
            <span class="variant-status-badge inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"></span>
        </div>
        
        <div class="grid grid-cols-2 gap-3 mt-2">
            <div class="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                <label class="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Nama Varian (*)</label>
                <input type="text" value="${defaultData.name}" class="var-name bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500">
            </div>
            <div class="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                <label class="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Harga Rp (*)</label>
                <input type="number" value="${defaultData.price}" class="var-price bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500">
            </div>
        </div>
        
        <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
                <label class="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Fulfillment (Metode)</label>
                <button type="button" class="btn-tutorial-fulfill text-blue-400 hover:text-blue-300 transition-colors text-[10px] flex items-center gap-1 font-bold"><i class="fa-solid fa-circle-question"></i> Penjelasan</button>
            </div>
            <select class="var-fulfillment bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500 appearance-none">
                <option value="" disabled ${!defaultData.fulfillment ? 'selected' : ''} class="bg-slate-900">-- Pilih Opsi Fulfillment --</option>
                <option value="ACCOUNT" ${defaultData.fulfillment === 'ACCOUNT' ? 'selected' : ''} class="bg-slate-900">ACCOUNT (Kirim List Akun)</option>
                <option value="CODE" ${defaultData.fulfillment === 'CODE' ? 'selected' : ''} class="bg-slate-900">CODE (Kirim Kode Voucher)</option>
                <option value="LINK" ${defaultData.fulfillment === 'LINK' ? 'selected' : ''} class="bg-slate-900">LINK (Kirim Link Statis)</option>
            </select>
        </div>

        <div class="flex flex-col gap-1.5">
            <label class="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Deskripsi Varian (Dilihat Buyer)</label>
            <input type="text" value="${defaultData.description || ''}" placeholder="Misal: Durasi 30 Hari, Garansi Full..." class="var-desc bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500">
        </div>

        <div class="flex flex-col gap-1.5">
            <label class="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Syarat & Ketentuan (Template)</label>
            <button type="button" class="btn-manage-snk w-full py-2.5 bg-white/5 border border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/50 rounded-xl text-xs text-gray-300 hover:text-indigo-300 transition-all flex items-center justify-center gap-2">
                <i class="fa-solid fa-file-lines"></i>
                <span class="btn-snk-label">${defaultData.snk ? 'Edit SNK (Sudah Terisi)' : 'Tambah SNK (Kosong)'}</span>
            </button>
            <input type="hidden" class="var-snk" value="${(defaultData.snk || '').replace(/"/g, '&quot;')}">
        </div>

        <div class="grid grid-cols-3 gap-2">
            <div class="flex flex-col gap-1.5 col-span-3">
                <div class="flex items-center justify-between border-b border-white/5 pb-1">
                    <label class="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Aturan Pembelian</label>
                    <button type="button" class="btn-tutorial-qty text-blue-400 hover:text-blue-300 text-[10px] flex items-center gap-1 font-bold" title="Penjelasan Aturan Pembelian"><i class="fa-solid fa-circle-question"></i> Penjelasan</button>
                </div>
            </div>
            <div class="flex flex-col gap-1.5">
                <label class="text-[9px] text-gray-400">Min Qty</label>
                <input type="number" value="${defaultData.min_qty}" min="1" class="var-min bg-white/5 border border-indigo-500/30 rounded-lg px-2 py-1.5 text-center text-white text-xs">
            </div>
            <div class="flex flex-col gap-1.5">
                <label class="text-[9px] text-gray-400">Max Qty</label>
                <input type="number" value="${defaultData.max_qty}" min="1" class="var-max bg-white/5 border border-indigo-500/30 rounded-lg px-2 py-1.5 text-center text-white text-xs">
            </div>
            <div class="flex flex-col gap-1.5">
                <label class="text-[9px] text-gray-400">Bulk/Paket</label>
                <input type="number" value="${defaultData.qty_per_purchase}" min="1" class="var-qpp bg-white/5 border border-indigo-500/30 rounded-lg px-2 py-1.5 text-center text-white text-xs">
            </div>
            <div class="flex flex-col gap-1.5 col-span-3">
                <label class="text-[9px] text-gray-400">Status Varian</label>
                <select class="var-status bg-white/5 border border-indigo-500/30 rounded-lg px-2 py-2 text-white text-xs">
                    <option value="true" ${defaultData.is_active !== false ? 'selected' : ''} class="bg-slate-900">Aktif</option>
                    <option value="false" ${defaultData.is_active === false ? 'selected' : ''} class="bg-slate-900">Nonaktif</option>
                </select>
            </div>
        </div>
    `;

    updateVariantStatusBadge(div);

    div.querySelector('.btn-tutorial-fulfill').addEventListener('click', () => {
        Swal.fire({
            title: 'Metode Pengiriman',
            html: `
                <div class="text-xs text-gray-300 text-left space-y-4 leading-relaxed">
                    <p>Fulfillment menentukan bagaimana Bot bekerja saat pesanan dibayar.</p>
                    
                    <div class="space-y-3">
                        <div>
                            <b class="text-white block">• ACCOUNT (Otomatis)</b>
                            <p>Bot akan mengambil baris data dari stok (misal: email|pass) dan mengirimkannya ke buyer. Cocok untuk akun premium siap pakai.</p>
                        </div>
                        <div>
                            <b class="text-white block">• CODE (Voucher)</b>
                            <p>Bot mengirimkan kode unik atau lisensi. Pastikan stok yang Anda input berupa kode-kode valid.</p>
                        </div>
                        <div>
                            <b class="text-white block">• LINK (Grup/Invite)</b>
                            <p>Bot mengirimkan link statis yang sama ke setiap pembeli. Cocok untuk link Grup WA, Channel, atau File Drive.</p>
                        </div>
                    </div>
                </div>
            `,
            icon: 'info',
            ...getSwalTheme(),
            confirmButtonColor: '#3b82f6',
            confirmButtonText: 'Siap!'
        });
    });

    div.querySelector('.btn-manage-snk').addEventListener('click', () => {
        const snkInput = div.querySelector('.var-snk');
        const snkLabel = div.querySelector('.btn-snk-label');
        
        Swal.fire({
            title: 'Atur SNK Varian',
            text: 'Tuliskan aturan main untuk varian ini. Teks ini akan dikirim oleh Bot bersama data produk.',
            input: 'textarea',
            inputValue: snkInput.value,
            inputPlaceholder: 'Contoh: \n1. Garansi 30 Hari\n2. Dilarang Ganti Password...',
            inputAttributes: {
                'autocapitalize': 'off',
                'autocorrect': 'off',
            },
            showCancelButton: true,
            confirmButtonText: 'Simpan SNK',
            cancelButtonText: 'Batal',
            ...getSwalTheme(),
            confirmButtonColor: '#3b82f6',
        }).then((result) => {
            if (result.isConfirmed) {
                snkInput.value = result.value;
                snkLabel.textContent = result.value ? 'Edit SNK (Sudah Terisi)' : 'Tambah SNK (Kosong)';
                if (result.value) {
                    Swal.fire({ icon: 'success', title: 'Tersimpan', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, ...getSwalTheme() });
                }
            }
        });
    });

    div.querySelector('.btn-tutorial-qty').addEventListener('click', () => {
        Swal.fire({
            title: 'Aturan Pembelian',
            html: `
                <div class="text-xs text-gray-300 text-left space-y-4 leading-relaxed">
                    <div class="p-3 bg-white/5 rounded-lg border border-white/10">
                        <div class="mb-3">
                            <b class="text-indigo-400 block mb-1">Min Qty:</b>
                            Jumlah PALING SEDIKIT yang wajib dibeli. Misal diisi 2, maka buyer tidak bisa beli cuma 1.
                        </div>
                        <div>
                            <b class="text-indigo-400 block mb-1">Max Qty:</b>
                            Batasan MAKSIMAL pembelian dalam satu order. Untuk mencegah stok diborong habis satu orang. (Set 999 jika bebas).
                        </div>
                    </div>
                    
                    <div class="p-3 bg-white/5 rounded-lg border border-white/10">
                        <b class="text-white block mb-2 underline">Bulk / Qty per Purchase:</b>
                        <p class="mb-2">Berapa item stok yang dikirim ke buyer untuk 1x pembelian?</p>
                        <ul class="space-y-1 mb-2">
                            <li>• <b class="text-green-400">Jual satuan</b> → ketik 1 (atau biarkan)</li>
                            <li>• <b class="text-green-400">Paket isi 3</b> → ketik 3</li>
                            <li>• <b class="text-green-400">Paket isi 10</b> → ketik 10</li>
                        </ul>
                        <p class="text-[10px] text-gray-400 italic">Contoh: Varian "Paket 5 Akun Capcut" → set ke 5. Saat buyer beli 1 qty, bot otomatis kirim 5 item stok sekaligus.</p>
                    </div>
                </div>
            `,
            icon: 'info',
            ...getSwalTheme(),
            confirmButtonColor: '#3b82f6',
            confirmButtonText: 'Mantap'
        });
    });

    div.querySelector('.var-status').addEventListener('change', () => {
        updateVariantStatusBadge(div);
    });

    div.querySelector('.btn-remove-variant').addEventListener('click', () => {
        if (adminVariantsContainer.children.length > 1) {
            Swal.fire({
                title: 'Hapus Varian?',
                text: 'Data varian yang belum disimpan akan hilang.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#3b82f6',
                confirmButtonText: 'Ya, Hapus!',
                cancelButtonText: 'Batal',
                ...getSwalTheme()
            }).then((result) => {
                if (result.isConfirmed) {
                    const variantId = div.getAttribute('data-id');
                    if (variantId && !deletedVariantIds.includes(variantId)) {
                        deletedVariantIds.push(variantId);
                    }
                    div.remove();
                }
            });
        } else {
            Swal.fire({ icon: 'warning', title: 'Eiits!', text: 'Minimal harus ada 1 varian.', ...getSwalTheme() });
        }
    });

    adminVariantsContainer.appendChild(div);
}

function openAdminModal(product = null) {
    const title = document.getElementById('admin-modal-title');
    const subtitle = document.getElementById('admin-product-subtitle');
    const inputName = document.getElementById('admin-input-name');
    const inputImage = document.getElementById('admin-input-image');
    const inputDesc = document.getElementById('admin-input-desc');

    adminVariantsContainer.innerHTML = '';
    deletedVariantIds = [];

    if (product) {
        title.textContent = 'Edit Produk';
        if (subtitle) { subtitle.textContent = product.name; subtitle.classList.remove('hidden'); }
        inputName.value = product.name;
        inputImage.value = product.image_url || '';
        inputDesc.value = product.description || '';
        
        if (product.variants && product.variants.length > 0) {
            product.variants.forEach(v => addVariantBlock(v));
        } else {
            addVariantBlock();
        }
        
        btnSaveProduct.onclick = () => saveProduct(product.id, product.name);
    } else {
        title.textContent = 'Tambah Produk Baru';
        if (subtitle) subtitle.classList.add('hidden');
        inputName.value = '';
        inputImage.value = '';
        inputDesc.value = '';
        
        addVariantBlock();
        btnSaveProduct.onclick = () => saveProduct(null, null);
    }

    adminProductSlide.classList.add('active');
}

async function saveProduct(pid, oldName) {
    const name = document.getElementById('admin-input-name').value.trim();
    const image = document.getElementById('admin-input-image').value.trim();
    const desc = document.getElementById('admin-input-desc').value.trim();
    const variantBlocks = document.querySelectorAll('#admin-variants-container > div');
    
    if (!name) return Swal.fire({ icon: 'error', title: 'Data Tidak Lengkap', text: 'Nama Produk wajib diisi!', ...getSwalTheme() });

    Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), ...getSwalTheme() });

    try {
        const normalizedImage = image ? normalizeImageUrl(image) : '';
        if (image && !normalizedImage) {
            throw new Error('URL gambar tidak valid. Gunakan direct image URL. Link halaman seperti ibb.co/ImgBB preview tidak didukung.');
        }

        // 1. Upsert Product
        const productToSave = { 
            name, 
            image_url: normalizedImage || '', 
            description: desc,
            is_active: true
        };
        if (pid) productToSave.id = pid;

        const variantsToSave = [];
        variantBlocks.forEach((block) => {
            const vid = block.getAttribute('data-id');
            const vname = block.querySelector('.var-name').value.trim();
            const price = parseInt(block.querySelector('.var-price').value);
            const fulfillment = block.querySelector('.var-fulfillment').value;
            
            const variantData = {
                name: vname,
                price: price,
                fulfillment: fulfillment,
                description: block.querySelector('.var-desc').value.trim(),
                min_qty: parseInt(block.querySelector('.var-min').value),
                max_qty: parseInt(block.querySelector('.var-max').value),
                qty_per_purchase: parseInt(block.querySelector('.var-qpp').value),
                is_active: block.querySelector('.var-status').value === 'true',
                snk: block.querySelector('.var-snk').value.trim()
            };
            if (vid) variantData.id = vid;
            variantsToSave.push(variantData);
        });

        const response = await fetch('/api/webapp/admin-products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bot_id: currentBotId,
                auth: adminAuthToken,
                product: productToSave,
                variants: variantsToSave,
                deleted_variant_ids: deletedVariantIds
            })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Gagal menyimpan produk');

        await refreshAdminData();
        
        Swal.fire({
            icon: 'success',
            title: 'Tersimpan!',
            text: 'Data produk berhasil diperbarui.',
            ...getSwalTheme(),
            showConfirmButton: false,
            timer: 1500
        });

        adminProductSlide.classList.remove('active');
    } catch (e) {
        console.error(e);
        Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: e.message, ...getSwalTheme() });
    }
}

async function deleteProduct(id, name) {
    const { isConfirmed } = await Swal.fire({
        title: 'Hapus Produk?',
        text: `Anda akan menghapus "${name}" secara permanen.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#3b82f6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal',
        ...getSwalTheme()
    });

    if (isConfirmed) {
        try {
            Swal.fire({ title: 'Menghapus...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), ...getSwalTheme() });
            
            const response = await fetch(`/api/webapp/admin-products?bot_id=${encodeURIComponent(currentBotId)}&auth=${encodeURIComponent(adminAuthToken)}&id=${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Gagal menghapus produk');

            await refreshAdminData();
            
            Swal.fire({
                title: 'Terhapus!',
                text: 'Produk berhasil dihapus.',
                icon: 'success',
                ...getSwalTheme(),
                showConfirmButton: false,
                timer: 1500
            });
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: e.message, ...getSwalTheme() });
        }
    }
}
export { renderAdminView };
