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
        btnUploadStockFile.addEventListener('click', () => stockInputFile.click());
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
                    stockFileLoadedInfo.textContent = `✓ ${lineCount} baris dimuat dari ${file.name}`;
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
            const isHidden = stockListContainer.classList.contains('hidden');
            if (isHidden) {
                stockListContainer.classList.replace('hidden', 'flex');
                if (btnDeleteAllStock) btnDeleteAllStock.classList.remove('hidden');
                btnToggleStockList.innerHTML = '<i class="fa-solid fa-eye-slash mr-1"></i> Sembunyikan Daftar Stok';
                renderStockItems();
            } else {
                stockListContainer.classList.replace('flex', 'hidden');
                if (btnDeleteAllStock) btnDeleteAllStock.classList.add('hidden');
                btnToggleStockList.innerHTML = '<i class="fa-solid fa-list-check mr-1"></i> Lihat Daftar Stok Tersedia';
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

    // Reset fields
    stockInputBulk.value = '';
    if (stockFileLoadedInfo) stockFileLoadedInfo.classList.add('hidden');
    currentSnapshot = null;
    
    // Initial Stat Simulation
    updateStockStats(product);
    
    // Reset stock list view
    stockListContainer.classList.replace('flex', 'hidden');
    if (btnDeleteAllStock) btnDeleteAllStock.classList.add('hidden');
    btnToggleStockList.innerHTML = '<i class="fa-solid fa-list-check mr-1"></i> Lihat Daftar Stok Tersedia';

    // Reset page saat ganti produk
    currentStockPage = 1;
    document.getElementById('stock-pagination')?.classList.replace('flex', 'hidden');

    stockInputVariant.onchange = () => {
        currentStockPage = 1;
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
            stockListContainer.innerHTML = '<p class="text-[10px] text-gray-500 italic py-2 text-center uppercase tracking-widest">Pilih varian dulu</p>';
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

    stockListContainer.innerHTML = '<p class="text-[10px] text-gray-500 italic animate-pulse">Memuat data...</p>';

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
            stockListContainer.innerHTML = '<p class="text-[10px] text-gray-500 italic py-2">Stok kosong</p>';
            if (paginationEl) paginationEl.classList.replace('flex', 'hidden');
            return;
        }

        const totalPages = Math.max(1, Math.ceil(items.length / STOCK_PAGE_SIZE));
        if (currentStockPage > totalPages) currentStockPage = totalPages;

        const pageItems = items.slice(
            (currentStockPage - 1) * STOCK_PAGE_SIZE,
            currentStockPage * STOCK_PAGE_SIZE
        );

        pageItems.forEach(item => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-3 p-2 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors group';
            row.innerHTML = `
                <code class="text-[10px] text-gray-300 truncate flex-1">${item.payload}</code>
                <button class="w-6 h-6 rounded-md bg-red-500/10 text-red-500 opacity-50 group-hover:opacity-100 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all btn-del-item">
                    <i class="fa-solid fa-trash-can text-[10px]"></i>
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
                if (pageInfoEl) pageInfoEl.textContent = `Hal ${currentStockPage} / ${totalPages}  (${items.length} item)`;
                if (btnPrev) btnPrev.disabled = currentStockPage === 1;
                if (btnNext) btnNext.disabled = currentStockPage === totalPages;
            }
        }
    } catch (e) {
        stockListContainer.innerHTML = `<p class="text-[10px] text-red-400">Gagal memuat: ${e.message}</p>`;
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
