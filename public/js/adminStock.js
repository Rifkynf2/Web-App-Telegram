// adminStock.js
import { currentBotId, urlParams } from './store.js';
import { refreshAdminData } from './adminProducts.js';

const adminStockSlide = document.getElementById('admin-stock-slide');
const btnSaveStock = document.getElementById('btn-save-stock');
const stockInputVariant = document.getElementById('stock-input-variant');
const stockInputBulk = document.getElementById('stock-input-bulk');
const stockModalSubtitle = document.getElementById('stock-modal-subtitle');
const btnTutorialFormat = document.getElementById('btn-tutorial-format');
const btnUploadStockFile = document.getElementById('btn-upload-stock-file');
const btnClearStockInput = document.getElementById('btn-clear-stock-input');
const stockInputFile = document.getElementById('stock-input-file');
const stockFileLoadedInfo = document.getElementById('stock-file-loaded-info');
const btnToggleStockList = document.getElementById('btn-toggle-stock-list');
const btnDeleteAllStock = document.getElementById('btn-delete-all-stock');
const stockListContainer = document.getElementById('stock-list-container');
const adminAuthToken = urlParams.get('auth') || '';
let currentSnapshot = null;
let currentSnapshotVariantId = null;
let isFetchingVariantStats = false;
let isSavingStock = false;
let currentStockPage = 1;
const STOCK_PAGE_SIZE = 10;

function getSwalTheme() {
    const isLight = document.documentElement.dataset.theme === 'light';
    return {
        background: isLight ? '#f5f3ff' : '#1e293b',
        color: isLight ? '#1e1d35' : '#fff',
    };
}

function normalizeStockLine(line) {
    return String(line || '').trim();
}

async function fetchStockSnapshot(variantId) {
    const response = await fetch(`/api/webapp/admin-stock?bot_id=${encodeURIComponent(currentBotId)}&auth=${encodeURIComponent(adminAuthToken)}&variant_id=${encodeURIComponent(variantId)}`);
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.error || 'Gagal memuat data stok');
    }

    return result.data || result;
}

export function initAdminStock() {
    if (btnTutorialFormat) {
        btnTutorialFormat.addEventListener('click', () => {
            Swal.fire({
                title: 'Panduan Format Stok',
                html: `
                    <div class="text-xs text-gray-300 text-left space-y-4 leading-relaxed">
                        <div class="p-3 bg-black/30 rounded-lg border border-white/5">
                            <b class="text-white block mb-1">A. ACCOUNT — Format: email|password</b>
                            <p class="font-mono text-[10px] text-indigo-300">akun1@gmail.com|pass1<br>akun2@gmail.com|pass2</p>
                            <p class="mt-1 text-emerald-400 font-bold">✅ Total otomatis = 2 stok</p>
                        </div>
                        <div class="p-3 bg-black/30 rounded-lg border border-white/5">
                            <b class="text-white block mb-1">B. CODE — Format: KODEVOUCHER</b>
                            <p class="font-mono text-[10px] text-indigo-300">DISKON10<br>PROMO20</p>
                            <p class="mt-1 text-emerald-400 font-bold">✅ Total otomatis = 2 stok</p>
                        </div>
                        <div class="p-3 bg-black/30 rounded-lg border border-white/5">
                            <b class="text-white block mb-1">C. LINK — Format: URL Link</b>
                            <p class="font-mono text-[10px] text-indigo-300">https://example.com/akses1<br>https://example.com/akses2</p>
                            <p class="mt-1 text-emerald-400 font-bold">✅ Total otomatis = 2 stok</p>
                        </div>
                    </div>
                `,
                ...getSwalTheme(),
                confirmButtonColor: '#3b82f6',
                confirmButtonText: 'Paham'
            });
        });
    }

    if (btnUploadStockFile && stockInputFile) {
        btnUploadStockFile.addEventListener('click', () => {
            btnUploadStockFile.classList.add('scale-95');
            setTimeout(() => btnUploadStockFile.classList.remove('scale-95'), 150);
            stockInputFile.click();
        });
        stockInputFile.addEventListener('change', async () => {
            const file = stockInputFile.files?.[0];
            stockInputFile.value = '';
            if (!file) return;

            if (!file.name.toLowerCase().endsWith('.txt')) {
                return Swal.fire({ icon: 'error', title: 'File Tidak Didukung', text: 'File harus berformat .txt', ...getSwalTheme() });
            }

            try {
                const text = await file.text();
                stockInputBulk.value = text;
                const lineCount = text.split('\n').map(normalizeStockLine).filter(Boolean).length;
                if (stockFileLoadedInfo) {
                    stockFileLoadedInfo.innerHTML = `
                        <div class="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
                            <i class="fa-solid fa-circle-check text-xs"></i>
                            <span><b>${lineCount} baris stok</b> berhasil dimuat dari file <code>${file.name}</code></span>
                        </div>
                    `;
                    stockFileLoadedInfo.classList.remove('hidden');
                }
            } catch (e) {
                Swal.fire({ icon: 'error', title: 'Gagal Membaca File', text: e.message, ...getSwalTheme() });
            }
        });
    }

    if (btnClearStockInput) {
        btnClearStockInput.addEventListener('click', () => {
            stockInputBulk.value = '';
            if (stockFileLoadedInfo) stockFileLoadedInfo.classList.add('hidden');
        });
    }

    if (btnToggleStockList) {
        btnToggleStockList.addEventListener('click', () => {
            const selectedVal = stockInputVariant?.value;
            if (!selectedVal) {
                Swal.fire({
                    icon: 'info',
                    title: 'Pilih Varian Terlebih Dahulu',
                    text: 'Silakan tentukan varian produk di atas untuk melihat daftar stok yang tersedia.',
                    confirmButtonColor: '#3b82f6',
                    confirmButtonText: 'Oke, Paham',
                    ...getSwalTheme()
                });
                return;
            }

            const isHidden = stockListContainer.classList.contains('hidden');
            if (isHidden) {
                stockListContainer.classList.replace('hidden', 'flex');
                if (btnDeleteAllStock) btnDeleteAllStock.classList.remove('hidden');
                btnToggleStockList.innerHTML = '<i class="fa-solid fa-eye-slash text-sm"></i> <span>Tutup Daftar Stok</span>';
                renderStockItems();
            } else {
                stockListContainer.classList.replace('flex', 'hidden');
                if (btnDeleteAllStock) btnDeleteAllStock.classList.add('hidden');
                btnToggleStockList.innerHTML = '<i class="fa-solid fa-list-check text-sm"></i> <span>Lihat Daftar Stok Tersedia</span>';
            }
        });
    }

    if (btnDeleteAllStock) {
        let isDeletingAllStock = false;
        btnDeleteAllStock.addEventListener('click', async () => {
            if (isDeletingAllStock) return;

            const selectedVal = stockInputVariant.value;
            if (!selectedVal) return;

            const { isConfirmed } = await Swal.fire({
                title: 'Hapus SEMUA Stok?',
                text: 'Tindakan ini akan menghapus SELURUH data stok yang tersedia (AVAILABLE) untuk varian ini.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#3b82f6',
                confirmButtonText: 'Ya, Hapus Semua!',
                cancelButtonText: 'Batal',
                ...getSwalTheme()
            });

            if (isConfirmed) {
                isDeletingAllStock = true;
                btnDeleteAllStock.disabled = true;
                try {
                    const response = await fetch(`/api/webapp/admin-stock?bot_id=${encodeURIComponent(currentBotId)}&auth=${encodeURIComponent(adminAuthToken)}&variant_id=${encodeURIComponent(selectedVal)}`, {
                        method: 'DELETE'
                    });
                    const result = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(result.error || 'Gagal menghapus stok');

                    Swal.fire({ icon: 'success', title: 'Stok Dikosongkan', ...getSwalTheme(), showConfirmButton: false, timer: 1500 });

                    await refreshAdminData();
                    updateStockStats();
                } catch (e) {
                    Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: e.message, ...getSwalTheme() });
                } finally {
                    isDeletingAllStock = false;
                    btnDeleteAllStock.disabled = false;
                }
            }
        });
    }

    document.getElementById('btn-back-admin-stock')?.addEventListener('click', () => {
        adminStockSlide.classList.remove('active');
    });

    document.getElementById('btn-stock-prev')?.addEventListener('click', () => {
        if (currentStockPage > 1) { currentStockPage--; renderStockItems(); }
    });
    document.getElementById('btn-stock-next')?.addEventListener('click', () => {
        currentStockPage++; renderStockItems();
    });

    if (stockInputVariant) {
        initSmoothSelect(stockInputVariant);
    }
}

export function initSmoothSelect(selectEl, onChange) {
    if (!selectEl) return null;
    let wrapper = selectEl.closest('.custom-select-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';
        selectEl.parentNode.insertBefore(wrapper, selectEl);
        wrapper.appendChild(selectEl);
        selectEl.classList.add('hidden');

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-select-trigger';
        trigger.innerHTML = `
            <span class="custom-select-label truncate">Pilih Varian...</span>
            <i class="fa-solid fa-chevron-down custom-select-arrow text-xs text-gray-400"></i>
        `;
        wrapper.insertBefore(trigger, selectEl);

        const menu = document.createElement('div');
        menu.className = 'custom-select-menu';
        wrapper.appendChild(menu);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                if (w !== wrapper) w.classList.remove('open');
            });
            wrapper.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                wrapper.classList.remove('open');
            }
        });
    }

    syncSmoothSelect(selectEl, onChange);
    return wrapper;
}

export function syncSmoothSelect(selectEl, onChange) {
    const wrapper = selectEl.closest('.custom-select-wrapper');
    if (!wrapper) return;
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const label = trigger?.querySelector('.custom-select-label');
    const menu = wrapper.querySelector('.custom-select-menu');
    if (!menu || !label) return;

    menu.innerHTML = '';
    const options = Array.from(selectEl.options);
    const selectedOption = options.find(o => o.selected && !o.disabled) || options.find(o => !o.disabled);

    if (selectedOption && !selectedOption.disabled && selectEl.value) {
        label.textContent = selectedOption.textContent;
        label.classList.remove('text-gray-400');
    } else {
        const placeholderOpt = options.find(o => o.disabled);
        label.textContent = placeholderOpt ? placeholderOpt.textContent.replace(/^--\s*|\s*--$/g, '') : 'Pilih Varian...';
        label.classList.add('text-gray-400');
    }

    options.forEach(opt => {
        if (opt.disabled) return;
        const isSelected = String(opt.value) === String(selectEl.value);
        const item = document.createElement('div');
        item.className = `custom-select-option ${isSelected ? 'selected' : ''}`;
        item.innerHTML = `
            <span class="truncate font-medium">${opt.textContent}</span>
            ${isSelected ? '<i class="fa-solid fa-check text-xs text-indigo-400"></i>' : ''}
        `;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            selectEl.value = opt.value;
            label.textContent = opt.textContent;
            label.classList.remove('text-gray-400');
            wrapper.querySelectorAll('.custom-select-option').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            wrapper.classList.remove('open');
            selectEl.dispatchEvent(new Event('change'));
            if (typeof onChange === 'function') onChange(opt.value);
        });
        menu.appendChild(item);
    });
}

export function openStockModal(product) {
    if (!adminStockSlide) return;
    stockModalSubtitle.textContent = product.name;
    
    // Fill variant selector
    stockInputVariant.innerHTML = '<option value="" disabled selected class="bg-slate-900 font-bold">-- Pilih Varian --</option>';
    product.variants.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.className = 'bg-slate-900';
        opt.textContent = `${v.name} (${v.fulfillment})`;
        stockInputVariant.appendChild(opt);
    });

    // Sync smooth custom dropdown
    initSmoothSelect(stockInputVariant);
    syncSmoothSelect(stockInputVariant);

    // Reset fields
    stockInputBulk.value = '';
    if (stockFileLoadedInfo) stockFileLoadedInfo.classList.add('hidden');
    currentSnapshot = null;
    
    // Initial Stat Simulation
    updateStockStats(product);
    
    // Reset stock list view
    stockListContainer.classList.replace('flex', 'hidden');
    if (btnDeleteAllStock) btnDeleteAllStock.classList.add('hidden');
    btnToggleStockList.innerHTML = '<i class="fa-solid fa-list-check text-sm"></i> <span>Lihat Daftar Stok Tersedia</span>';

    // Reset page saat ganti produk
    currentStockPage = 1;
    document.getElementById('stock-pagination')?.classList.replace('flex', 'hidden');

    stockInputVariant.onchange = () => {
        currentStockPage = 1;
        syncSmoothSelect(stockInputVariant);
        updateStockStats(product);
    };

    btnSaveStock.onclick = () => saveStockAction(product);

    adminStockSlide.classList.add('active');
}

async function updateStockStats(product) {
    const selectedId = stockInputVariant.value;

    if (!selectedId) {
        currentSnapshot = null;
        currentSnapshotVariantId = null;
        document.getElementById('stock-stat-ready').textContent = "0";
        document.getElementById('stock-stat-reserved').textContent = "0";
        document.getElementById('stock-stat-sold').textContent = "0";
        if (!stockListContainer.classList.contains('hidden')) {
            stockListContainer.innerHTML = '<p class="text-[11px] text-gray-500 italic py-3 text-center uppercase tracking-widest font-semibold">Pilih varian produk terlebih dahulu</p>';
        }
        return;
    }

    // Lock the save button while variant stats are still being fetched —
    // otherwise "Simpan" can be clicked while currentSnapshot still holds
    // the previously selected variant's data, causing dup-checks to run
    // against the wrong variant.
    isFetchingVariantStats = true;
    btnSaveStock.disabled = true;

    try {
        const snapshot = await fetchStockSnapshot(selectedId);
        currentSnapshot = snapshot;
        currentSnapshotVariantId = String(selectedId);
        const stats = snapshot.stats || { AVAILABLE: 0, RESERVED: 0, SOLD: 0 };

        // Find variant to get correct sold count
        const variant = product?.variants?.find(v => String(v.id) === String(selectedId));
        const variantSold = variant ? parseInt(variant.total_sold || 0, 10) : 0;

        document.getElementById('stock-stat-ready').textContent = stats.AVAILABLE;
        document.getElementById('stock-stat-reserved').textContent = stats.RESERVED;
        document.getElementById('stock-stat-sold').textContent = variantSold;

        // Refresh list if open
        if (!stockListContainer.classList.contains('hidden')) {
            renderStockItems();
        }
    } catch (e) {
        console.error("Error fetching stats:", e);
    } finally {
        isFetchingVariantStats = false;
        if (!isSavingStock) btnSaveStock.disabled = false;
    }
}

async function renderStockItems() {
    if (stockListContainer.classList.contains('hidden')) return;
    const variantId = stockInputVariant.value;
    if (!variantId) return;

    // Animated SVG Spinner Loading (Exact App-wide SVG Loader)
    stockListContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-6 gap-2 text-indigo-400">
            <svg version="1.1" class="svg-loader text-indigo-400" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 80 80" xml:space="preserve" style="width: 38px; height: 38px;">
                <path fill="currentColor" d="M10,40c0,0,0-0.4,0-1.1c0-0.3,0-0.8,0-1.3c0-0.3,0-0.5,0-0.8c0-0.3,0.1-0.6,0.1-0.9c0.1-0.6,0.1-1.4,0.2-2.1 c0.2-0.8,0.3-1.6,0.5-2.5c0.2-0.9,0.6-1.8,0.8-2.8c0.3-1,0.8-1.9,1.2-3c0.5-1,1.1-2,1.7-3.1c0.7-1,1.4-2.1,2.2-3.1 c1.6-2.1,3.7-3.9,6-5.6c2.3-1.7,5-3,7.9-4.1c0.7-0.2,1.5-0.4,2.2-0.7c0.7-0.3,1.5-0.3,2.3-0.5c0.8-0.2,1.5-0.3,2.3-0.4l1.2-0.1 l0.6-0.1l0.3,0l0.1,0l0.1,0l0,0c0.1,0-0.1,0,0.1,0c1.5,0,2.9-0.1,4.5,0.2c0.8,0.1,1.6,0.1,2.4,0.3c0.8,0.2,1.5,0.3,2.3,0.5 c3,0.8,5.9,2,8.5,3.6c2.6,1.6,4.9,3.4,6.8,5.4c1,1,1.8,2.1,2.7,3.1c0.8,1.1,1.5,2.1,2.1,3.2c0.6,1.1,1.2,2.1,1.6,3.1 c0.4,1,0.9,2,1.2,3c0.3,1,0.6,1.9,0.8,2.7c0.2,0.9,0.3,1.6,0.5,2.4c0.1,0.4,0.1,0.7,0.2,1c0,0.3,0.1,0.6,0.1,0.9 c0.1,0.6,0.1,1,0.1,1.4C74,39.6,74,40,74,40c0.2,2.2-1.5,4.1-3.7,4.3s-4.1-1.5-4.3-3.7c0-0.1,0-0.2,0-0.3l0-0.4c0,0,0-0.3,0-0.9 c0-0.3,0-0.7,0-1.1c0-0.2,0-0.5,0-0.7c0-0.2-0.1-0.5-0.1-0.8c-0.1-0.6-0.1-1.2-0.2-1.9c-0.1-0.7-0.3-1.4-0.4-2.2 c-0.2-0.8-0.5-1.6-0.7-2.4c-0.3-0.8-0.7-1.7-1.1-2.6c-0.5-0.9-0.9-1.8-1.5-2.7c-0.6-0.9-1.2-1.8-1.9-2.7c-1.4-1.8-3.2-3.4-5.2-4.9 c-2-1.5-4.4-2.7-6.9-3.6c-0.6-0.2-1.3-0.4-1.9-0.6c-0.7-0.2-1.3-0.3-1.9-0.4c-1.2-0.3-2.8-0.4-4.2-0.5l-2,0c-0.7,0-1.4,0.1-2.1,0.1 c-0.7,0.1-1.4,0.1-2,0.3c-0.7,0.1-1.3,0.3-2,0.4c-2.6,0.7-5.2,1.7-7.5,3.1c-2.2,1.4-4.3,2.9-6,4.7c-0.9,0.8-1.6,1.8-2.4,2.7 c-0.7,0.9-1.3,1.9-1.9,2.8c-0.5,1-1,1.9-1.4,2.8c-0.4,0.9-0.8,1.8-1,2.6c-0.3,0.9-0.5,1.6-0.7,2.4c-0.2,0.7-0.3,1.4-0.4,2.1 c-0.1,0.3-0.1,0.6-0.2,0.9c0,0.3-0.1,0.6-0.1,0.8c0,0.5-0.1,0.9-0.1,1.3C10,39.6,10,40,10,40z">
                    <animateTransform attributeType="xml" attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="0.8s" repeatCount="indefinite"/>
                </path>
                <path fill="currentColor" d="M62,40.1c0,0,0,0.2-0.1,0.7c0,0.2,0,0.5-0.1,0.8c0,0.2,0,0.3,0,0.5c0,0.2-0.1,0.4-0.1,0.7 c-0.1,0.5-0.2,1-0.3,1.6c-0.2,0.5-0.3,1.1-0.5,1.8c-0.2,0.6-0.5,1.3-0.7,1.9c-0.3,0.7-0.7,1.3-1,2.1c-0.4,0.7-0.9,1.4-1.4,2.1 c-0.5,0.7-1.1,1.4-1.7,2c-1.2,1.3-2.7,2.5-4.4,3.6c-1.7,1-3.6,1.8-5.5,2.4c-2,0.5-4,0.7-6.2,0.7c-1.9-0.1-4.1-0.4-6-1.1 c-1.9-0.7-3.7-1.5-5.2-2.6c-1.5-1.1-2.9-2.3-4-3.7c-0.6-0.6-1-1.4-1.5-2c-0.4-0.7-0.8-1.4-1.2-2c-0.3-0.7-0.6-1.3-0.8-2 c-0.2-0.6-0.4-1.2-0.6-1.8c-0.1-0.6-0.3-1.1-0.4-1.6c-0.1-0.5-0.1-1-0.2-1.4c-0.1-0.9-0.1-1.5-0.1-2c0-0.5,0-0.7,0-0.7 s0,0.2,0.1,0.7c0.1,0.5,0,1.1,0.2,2c0.1,0.4,0.2,0.9,0.3,1.4c0.1,0.5,0.3,1,0.5,1.6c0.2,0.6,0.4,1.1,0.7,1.8 c0.3,0.6,0.6,1.2,0.9,1.9c0.4,0.6,0.8,1.3,1.2,1.9c0.5,0.6,1,1.3,1.6,1.8c1.1,1.2,2.5,2.3,4,3.2c1.5,0.9,3.2,1.6,5,2.1 c1.8,0.5,3.6,0.6,5.6,0.6c1.8-0.1,3.7-0.4,5.4-1c1.7-0.6,3.3-1.4,4.7-2.4c1.4-1,2.6-2.1,3.6-3.3c0.5-0.6,0.9-1.2,1.3-1.8 c0.4-0.6,0.7-1.2,1-1.8c0.3-0.6,0.6-1.2,0.8-1.8c0.2-0.6,0.4-1.1,0.5-1.7c0.1-0.5,0.2-1,0.3-1.5c0.1-0.4,0.1-0.8,0.1-1.2 c0-0.2,0-0.4,0.1-0.5c0-0.2,0-0.4,0-0.5c0-0.3,0-0.6,0-0.8c0-0.5,0-0.7,0-0.7c0-1.1,0.9-2,2-2s2,0.9,2,2C62,40,62,40.1,62,40.1z">
                    <animateTransform attributeType="xml" attributeName="transform" type="rotate" from="0 40 40" to="-360 40 40" dur="0.6s" repeatCount="indefinite"/>
                </path>
            </svg>
            <span class="text-[11px] font-semibold text-gray-400 tracking-wide mt-1">Memuat data stok...</span>
        </div>
    `;

    const paginationEl = document.getElementById('stock-pagination');
    const pageInfoEl   = document.getElementById('stock-page-info');
    const btnPrev      = document.getElementById('btn-stock-prev');
    const btnNext      = document.getElementById('btn-stock-next');

    try {
        const snapshot = await fetchStockSnapshot(variantId);
        currentSnapshot = snapshot;
        const items = Array.isArray(snapshot.items) ? snapshot.items : [];

        stockListContainer.innerHTML = '';
        if (items.length === 0) {
            stockListContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-6 text-gray-500 gap-1.5 opacity-70">
                    <i class="fa-solid fa-box-open text-2xl"></i>
                    <p class="text-xs font-semibold">Stok varian ini masih kosong</p>
                </div>
            `;
            if (paginationEl) paginationEl.classList.replace('flex', 'hidden');
            return;
        }

        const totalPages = Math.max(1, Math.ceil(items.length / STOCK_PAGE_SIZE));
        if (currentStockPage > totalPages) currentStockPage = totalPages;

        const pageItems = items.slice(
            (currentStockPage - 1) * STOCK_PAGE_SIZE,
            currentStockPage * STOCK_PAGE_SIZE
        );

        pageItems.forEach((item, idx) => {
            const itemNumber = (currentStockPage - 1) * STOCK_PAGE_SIZE + idx + 1;
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-3 p-2.5 bg-white/5 rounded-xl border border-white/10 hover:border-indigo-500/30 hover:bg-white/[0.08] transition-all group';
            row.innerHTML = `
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <span class="text-[10px] font-bold text-gray-500 w-5 shrink-0">#${itemNumber}</span>
                    <code class="text-xs text-indigo-200 font-mono truncate flex-1 select-all">${item.payload}</code>
                </div>
                <button class="btn-del-item w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 hover:border-red-500 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-90" title="Hapus item ini">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            `;
            row.querySelector('.btn-del-item').onclick = (e) => deleteStockItem(item.id, e.currentTarget);
            stockListContainer.appendChild(row);
        });

        if (paginationEl) {
            if (totalPages <= 1) {
                paginationEl.classList.replace('flex', 'hidden');
            } else {
                paginationEl.classList.replace('hidden', 'flex');
                if (pageInfoEl) pageInfoEl.textContent = `Hal ${currentStockPage} / ${totalPages} (${items.length} item)`;
                if (btnPrev) btnPrev.disabled = currentStockPage === 1;
                if (btnNext) btnNext.disabled = currentStockPage === totalPages;
            }
        }
    } catch (e) {
        stockListContainer.innerHTML = `<p class="text-xs text-red-400 py-2">Gagal memuat: ${e.message}</p>`;
    }
}

async function deleteStockItem(id, btn) {
    if (btn?.disabled) return;

    const { isConfirmed } = await Swal.fire({
        title: 'Hapus Item?',
        text: 'Data stok ini akan dihapus permanen.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#3b82f6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal',
        ...getSwalTheme()
    });

    if (isConfirmed) {
        if (btn) btn.disabled = true;
        try {
            const response = await fetch(`/api/webapp/admin-stock?bot_id=${encodeURIComponent(currentBotId)}&auth=${encodeURIComponent(adminAuthToken)}&id=${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Gagal menghapus item stok');

            Swal.fire({ icon: 'success', title: 'Terhapus', ...getSwalTheme(), timer: 1000, showConfirmButton: false });
            await refreshAdminData();
            updateStockStats();
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Gagal', text: e.message, ...getSwalTheme() });
            if (btn) btn.disabled = false;
        }
    }
}

async function saveStockAction(product) {
    if (isSavingStock || isFetchingVariantStats) return;

    const selectedVal = stockInputVariant.value;
    if (!selectedVal) {
        return Swal.fire({ icon: 'error', title: 'Pilih Varian', text: 'Anda harus memilih varian produk sebelum memasukkan stok!', ...getSwalTheme() });
    }

    isSavingStock = true;
    btnSaveStock.disabled = true;

    try {
        await saveStockActionInner(product, selectedVal);
    } finally {
        isSavingStock = false;
        if (!isFetchingVariantStats) btnSaveStock.disabled = false;
    }
}

async function saveStockActionInner(product, selectedVal) {
    const selectedVariantId = String(selectedVal);
    const variant = product.variants.find(v => String(v.id) === selectedVariantId);
    if (!variant) {
        return Swal.fire({
            icon: 'error',
            title: 'Varian Tidak Ditemukan',
            text: 'Varian yang dipilih tidak cocok dengan data produk. Silakan tutup lalu buka ulang modal stok.',
            ...getSwalTheme()
        });
    }

    const fulfillment = variant.fulfillment;
    const rawLines = stockInputBulk.value.split('\n').map(normalizeStockLine).filter(Boolean);
    
    if (rawLines.length === 0) {
        return Swal.fire({ icon: 'warning', title: 'Kosong', text: 'Silakan masukkan data stok terlebih dahulu!', ...getSwalTheme() });
    }

    // 0. Format Validation
    let invalidLines = [];
    rawLines.forEach((line, idx) => {
        if (fulfillment === 'ACCOUNT' && !line.includes('|')) {
            invalidLines.push(`Baris ${idx + 1}: Format akun salah (Gunakan email|pass)`);
        } else if (fulfillment === 'LINK' && !/^https?:\/\//i.test(line)) {
            invalidLines.push(`Baris ${idx + 1}: Format link salah (Wajib http:// atau https://)`);
        } else if (fulfillment === 'CODE' && line.length < 3) {
            invalidLines.push(`Baris ${idx + 1}: Kode terlalu pendek (Minimal 3 karakter)`);
        }
    });

    if (invalidLines.length > 0) {
        const errorList = invalidLines.slice(0, 5).join('<br>');
        const moreCount = invalidLines.length > 5 ? `<br>...dan ${invalidLines.length - 5} baris lainnya` : '';
        
        return Swal.fire({
            icon: 'error',
            title: 'Format Stok Salah!',
            html: `
                <div class="text-xs text-left text-gray-300 space-y-3">
                    <p class="text-red-400 font-bold">Ditemukan ${invalidLines.length} baris tidak sesuai format ${fulfillment}:</p>
                    <div class="bg-black/20 p-2 rounded border border-white/10 font-mono text-[10px]">
                        ${errorList}${moreCount}
                    </div>
                    <p class="pt-2 italic text-gray-400">Silakan perbaiki format data Anda sesuai panduan di menu (?) di atas.</p>
                </div>
            `,
            ...getSwalTheme(),
            confirmButtonColor: '#3b82f6'
        });
    }

    const snapshot = (currentSnapshot && currentSnapshotVariantId === selectedVariantId)
        ? currentSnapshot
        : await fetchStockSnapshot(selectedVal);
    currentSnapshot = snapshot;
    currentSnapshotVariantId = selectedVariantId;
    const availablePayloads = Array.isArray(snapshot.available_payloads)
        ? snapshot.available_payloads.map(normalizeStockLine).filter(Boolean)
        : [];
    const dbPayloadSet = new Set(availablePayloads);

    // 1. Check Internal Duplicates
    const seenInput = new Set();
    const uniqueInInput = [];
    let internalDupCount = 0;
    for (const line of rawLines) {
        if (seenInput.has(line)) {
            internalDupCount += 1;
            continue;
        }
        seenInput.add(line);
        uniqueInInput.push(line);
    }

    // 2. Check Database Duplicates against real AVAILABLE stock
    let dbDupCount = 0;
    for (const line of uniqueInInput) {
        if (dbPayloadSet.has(line)) {
            dbDupCount += 1;
        }
    }

    const totalDups = internalDupCount + dbDupCount;

    if (totalDups > 0) {
        const { isConfirmed, isDenied } = await Swal.fire({
            title: 'Terdeteksi Duplikat',
            html: `
                <div class="text-xs text-gray-300 text-left space-y-2">
                    <p>Total Baris: <b>${rawLines.length}</b></p>
                    <p>Duplikat Internal: <span class="text-amber-400">${internalDupCount}</span></p>
                    <p>Duplikat Database: <span class="text-red-400">${dbDupCount}</span></p>
                    <hr class="border-white/10 my-2">
                    <p>Apa yang ingin Anda lakukan?</p>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonColor: '#10b981', // Emerald
            denyButtonColor: '#3b82f6',    // Blue
            cancelButtonColor: '#6b7280',  // Gray
            confirmButtonText: `Simpan Semua (${rawLines.length})`,
            denyButtonText: `Hanya Unik (${Math.max(rawLines.length - totalDups, 0)})`,
            cancelButtonText: 'Batal',
            ...getSwalTheme()
        });

        if (isConfirmed) {
            const confirmed = await showStockConfirmation(variant, fulfillment, rawLines.length);
            if (confirmed) await finalizeStockSave(rawLines, selectedVal);
        } else if (isDenied) {
            const uniqueLines = uniqueInInput.filter((line) => !dbPayloadSet.has(line));
            if (uniqueLines.length === 0) {
                return Swal.fire({ icon: 'warning', title: 'Tidak Ada Data Unik', text: 'Semua baris sudah ada di stok atau terduplikasi.', ...getSwalTheme() });
            }
            const confirmed = await showStockConfirmation(variant, fulfillment, uniqueLines.length);
            if (confirmed) await finalizeStockSave(uniqueLines, selectedVal, totalDups);
        }
    } else {
        const confirmed = await showStockConfirmation(variant, fulfillment, rawLines.length);
        if (confirmed) await finalizeStockSave(rawLines, selectedVal);
    }
}

async function showStockConfirmation(variant, fulfillment, itemCount) {
    const { isConfirmed } = await Swal.fire({
        title: 'Konfirmasi Stok Baru',
        html: `
            <div class="text-xs text-gray-300 text-left space-y-3">
                <div class="p-3 bg-black/30 rounded-lg border border-white/5">
                    <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Varian</p>
                    <p class="text-white font-bold">${variant.name}</p>
                </div>
                <div class="p-3 bg-black/30 rounded-lg border border-white/5">
                    <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Metode</p>
                    <p class="text-white font-bold">${fulfillment}</p>
                </div>
                <div class="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <p class="text-[10px] text-emerald-400 uppercase tracking-widest mb-1">Total stok yang ingin ditambahkan</p>
                    <p class="text-emerald-300 font-black text-2xl">${itemCount} item</p>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Ya, Tambahkan!',
        cancelButtonText: 'Batalkan',
        ...getSwalTheme()
    });
    return isConfirmed;
}

async function finalizeStockSave(lines, variantId, skipped = 0) {
    Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), ...getSwalTheme() });

    try {
        const response = await fetch('/api/webapp/admin-stock', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bot_id: currentBotId,
                auth: adminAuthToken,
                variant_id: variantId,
                lines
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Gagal menyimpan stok');

        await refreshAdminData();

        Swal.fire({
            icon: 'success',
            title: 'Stok Berhasil Ditambah!',
            html: `
                <div class="text-xs text-gray-300">
                    <p>✅ Berhasil simpan: <b>${lines.length}</b> baris</p>
                    ${skipped > 0 ? `<p>⚠️ Diabaikan (Duplikat): <b>${skipped}</b> baris</p>` : ''}
                </div>
            `,
            ...getSwalTheme(),
            showConfirmButton: false,
            timer: 2000
        });
        
        adminStockSlide.classList.remove('active');
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Gagal Simpan', text: e.message, ...getSwalTheme() });
    }
}
