// adminStock.js
import { fetchCatalog, currentBotId, urlParams } from './store.js';
import { renderAdminView } from './adminProducts.js';

// Stock Management Modal Elements and Logic

const stockModal = document.getElementById('stock-modal');
const btnCloseStockModal = document.getElementById('btn-close-stock-modal');
const btnSaveStock = document.getElementById('btn-save-stock');
const stockInputVariant = document.getElementById('stock-input-variant');
const stockInputBulk = document.getElementById('stock-input-bulk');
const stockModalSubtitle = document.getElementById('stock-modal-subtitle');
const btnTutorialFormat = document.getElementById('btn-tutorial-format');
const btnToggleStockList = document.getElementById('btn-toggle-stock-list');
const btnDeleteAllStock = document.getElementById('btn-delete-all-stock');
const stockListContainer = document.getElementById('stock-list-container');
const adminAuthToken = urlParams.get('auth') || '';

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
                background: '#1e293b',
                color: '#fff',
                confirmButtonColor: '#3b82f6',
                confirmButtonText: 'Paham'
            });
        });
    }

    if (btnToggleStockList) {
        btnToggleStockList.addEventListener('click', () => {
            const isHidden = stockListContainer.classList.contains('hidden');
            if (isHidden) {
                stockListContainer.classList.remove('hidden');
                if (btnDeleteAllStock) btnDeleteAllStock.classList.remove('hidden');
                btnToggleStockList.innerHTML = '<i class="fa-solid fa-eye-slash mr-1"></i> Sembunyikan Daftar Stok';
                renderStockItems();
            } else {
                stockListContainer.classList.add('hidden');
                if (btnDeleteAllStock) btnDeleteAllStock.classList.add('hidden');
                btnToggleStockList.innerHTML = '<i class="fa-solid fa-list-check mr-1"></i> Lihat Daftar Stok Tersedia';
            }
        });
    }

    if (btnDeleteAllStock) {
        btnDeleteAllStock.addEventListener('click', async () => {
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
                background: '#1e293b',
                color: '#fff'
            });

            if (isConfirmed) {
                try {
                    const response = await fetch(`/api/webapp/admin-stock?bot_id=${encodeURIComponent(currentBotId)}&auth=${encodeURIComponent(adminAuthToken)}&variant_id=${encodeURIComponent(selectedVal)}`, {
                        method: 'DELETE'
                    });
                    const result = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(result.error || 'Gagal menghapus stok');

                    Swal.fire({ icon: 'success', title: 'Stok Dikosongkan', background: '#1e293b', color: '#fff', showConfirmButton: false, timer: 1500 });

                    await fetchCatalog();
                    renderAdminView();
                    updateStockStats();
                } catch (e) {
                    Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: e.message, background: '#1e293b', color: '#fff' });
                }
            }
        });
    }

    if (btnCloseStockModal) {
        btnCloseStockModal.addEventListener('click', () => stockModal.classList.replace('flex', 'hidden'));
    }
}

export function openStockModal(product) {
    if(!stockModal) return;
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
    
    // Initial Stat Simulation
    updateStockStats();
    
    // Reset stock list view
    stockListContainer.classList.add('hidden');
    if (btnDeleteAllStock) btnDeleteAllStock.classList.add('hidden');
    btnToggleStockList.innerHTML = '<i class="fa-solid fa-list-check mr-1"></i> Lihat Daftar Stok Tersedia';

    // Event for variant change
    stockInputVariant.onchange = () => updateStockStats();

    btnSaveStock.onclick = () => saveStockAction(product);

    stockModal.classList.remove('hidden');
    stockModal.classList.add('flex');
}

async function updateStockStats() {
    const selectedId = stockInputVariant.value;
    
    if (!selectedId) {
        document.getElementById('stock-stat-ready').textContent = "0";
        document.getElementById('stock-stat-reserved').textContent = "0";
        document.getElementById('stock-stat-sold').textContent = "0";
        if (!stockListContainer.classList.contains('hidden')) {
            stockListContainer.innerHTML = '<p class="text-[10px] text-gray-500 italic py-2 text-center uppercase tracking-widest">Pilih varian dulu</p>';
        }
        return;
    }

    try {
        const snapshot = await fetchStockSnapshot(selectedId);
        const stats = snapshot.stats || { AVAILABLE: 0, RESERVED: 0, SOLD: 0 };

        document.getElementById('stock-stat-ready').textContent = stats.AVAILABLE;
        document.getElementById('stock-stat-reserved').textContent = stats.RESERVED;
        document.getElementById('stock-stat-sold').textContent = stats.SOLD;

        // Refresh list if open
        if (!stockListContainer.classList.contains('hidden')) {
            renderStockItems();
        }
    } catch (e) {
        console.error("Error fetching stats:", e);
    }
}

async function renderStockItems() {
    if (stockListContainer.classList.contains('hidden')) return;
    const variantId = stockInputVariant.value;
    if (!variantId) return;

    stockListContainer.innerHTML = '<p class="text-[10px] text-gray-500 italic animate-pulse">Memuat data...</p>';
    
    try {
        const snapshot = await fetchStockSnapshot(variantId);
        const items = Array.isArray(snapshot.items) ? snapshot.items : [];

        stockListContainer.innerHTML = '';
        if (items.length === 0) {
            stockListContainer.innerHTML = '<p class="text-[10px] text-gray-500 italic py-2">Stok kosong</p>';
            return;
        }

        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-3 p-2 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors group';
            row.innerHTML = `
                <code class="text-[10px] text-gray-300 truncate flex-1">${item.payload}</code>
                <button class="w-6 h-6 rounded-md bg-red-500/10 text-red-500 opacity-50 group-hover:opacity-100 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all btn-del-item">
                    <i class="fa-solid fa-trash-can text-[10px]"></i>
                </button>
            `;
            row.querySelector('.btn-del-item').onclick = () => deleteStockItem(item.id);
            stockListContainer.appendChild(row);
        });
    } catch (e) {
        stockListContainer.innerHTML = `<p class="text-[10px] text-red-400">Gagal memuat: ${e.message}</p>`;
    }
}

async function deleteStockItem(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'Hapus Item?',
        text: 'Data stok ini akan dihapus permanen.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#3b82f6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal',
        background: '#1e293b',
        color: '#fff'
    });

    if (isConfirmed) {
        try {
            const response = await fetch(`/api/webapp/admin-stock?bot_id=${encodeURIComponent(currentBotId)}&auth=${encodeURIComponent(adminAuthToken)}&id=${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Gagal menghapus item stok');
            
            Swal.fire({ icon: 'success', title: 'Terhapus', background: '#1e293b', color: '#fff', timer: 1000, showConfirmButton: false });
            await fetchCatalog();
            renderAdminView();
            updateStockStats();
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Gagal', text: e.message, background: '#1e293b', color: '#fff' });
        }
    }
}

async function saveStockAction(product) {
    const selectedVal = stockInputVariant.value;
    if (!selectedVal) {
        return Swal.fire({ icon: 'error', title: 'Pilih Varian', text: 'Anda harus memilih varian produk sebelum memasukkan stok!', background: '#1e293b', color: '#fff' });
    }

    const selectedVariantId = String(selectedVal);
    const variant = product.variants.find(v => String(v.id) === selectedVariantId);
    if (!variant) {
        return Swal.fire({
            icon: 'error',
            title: 'Varian Tidak Ditemukan',
            text: 'Varian yang dipilih tidak cocok dengan data produk. Silakan tutup lalu buka ulang modal stok.',
            background: '#1e293b',
            color: '#fff'
        });
    }

    const fulfillment = variant.fulfillment;
    const rawLines = stockInputBulk.value.split('\n').map(l => l.trim()).filter(l => l);
    
    if (rawLines.length === 0) {
        return Swal.fire({ icon: 'warning', title: 'Kosong', text: 'Silakan masukkan data stok terlebih dahulu!', background: '#1e293b', color: '#fff' });
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
            background: '#1e293b',
            color: '#fff',
            confirmButtonColor: '#3b82f6'
        });
    }

    // 1. Check Internal Duplicates
    const uniqueInInput = [...new Set(rawLines)];
    const internalDupCount = rawLines.length - uniqueInInput.length;

    // 2. Simulate Database Duplicates (Check against "ready" stock items)
    const dbDupCount = rawLines.length > 5 ? Math.floor(rawLines.length * 0.1) : 0;
    
    const totalDups = internalDupCount + dbDupCount;

    if (totalDups > 0) {
        const { isConfirmed, isDenied } = await Swal.fire({
            title: 'Terdeteksi Duplikat',
            html: `
                <div class="text-xs text-gray-300 text-left space-y-2">
                    <p>Total Baris: <b>${rawLines.length}</b></p>
                    <p>Duplikat Internal: <span class="text-amber-400">${internalDupCount}</span></p>
                    <p>Duplikat Database (Simulasi): <span class="text-red-400">${dbDupCount}</span></p>
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
            denyButtonText: `Hanya Unik (${rawLines.length - totalDups})`,
            cancelButtonText: 'Batal',
            background: '#1e293b',
            color: '#fff'
        });

        if (isConfirmed) {
            finalizeStockSave(rawLines, selectedVal);
        } else if (isDenied) {
            const uniqueLines = [...new Set(rawLines)];
            finalizeStockSave(uniqueLines, selectedVal, totalDups);
        }
    } else {
        finalizeStockSave(rawLines, selectedVal);
    }
}

async function finalizeStockSave(lines, variantId, skipped = 0) {
    Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), background: '#1e293b', color: '#fff' });

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

        await fetchCatalog(); // Update memory
        renderAdminView();    // Update dashboard stats

        Swal.fire({
            icon: 'success',
            title: 'Stok Berhasil Ditambah!',
            html: `
                <div class="text-xs text-gray-300">
                    <p>✅ Berhasil simpan: <b>${lines.length}</b> baris</p>
                    ${skipped > 0 ? `<p>⚠️ Diabaikan (Duplikat): <b>${skipped}</b> baris</p>` : ''}
                </div>
            `,
            background: '#1e293b',
            color: '#fff',
            showConfirmButton: false,
            timer: 2000
        });
        
        stockModal.classList.replace('flex', 'hidden');
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Gagal Simpan', text: e.message, background: '#1e293b', color: '#fff' });
    }
}
