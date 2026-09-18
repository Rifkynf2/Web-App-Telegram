// public/js/rnfshop/apps.js
import { rnfFetch } from './apiClient.js';
import { showAlert, showConfirm, renderAppLogo, escAttr } from './utils.js';
import { MOCK_APPS, MOCK_TRANSACTIONS, isRnfPreviewMode } from './mockData.js';

let cachedApps = [];

export async function fetchApps(forceRefresh = false) {
    if (isRnfPreviewMode()) {
        return MOCK_APPS;
    }
    if (cachedApps.length > 0 && !forceRefresh) return cachedApps;
    try {
        const res = await rnfFetch('apps');
        cachedApps = res.apps || [];
        return cachedApps;
    } catch (error) {
        console.error('[RNFSHOP] Error fetching apps:', error);
        return [];
    }
}

export async function renderAppsView() {
    const container = document.getElementById('rnf-apps-grid');
    if (!container) return;

    container.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400">
            <i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-cyan-400 block"></i>
            <p>Memuat katalog aplikasi...</p>
        </div>
    `;

    const apps = await fetchApps(true);

    // Compute sales count per app: in live mode, backend calculates it accurately from all transactions
    if (isRnfPreviewMode()) {
        const salesMap = {};
        MOCK_TRANSACTIONS.forEach(t => {
            if (t.trx_type === 'incoming') {
                const name = t.apps?.name || t.app_name || '';
                if (name) salesMap[name] = (salesMap[name] || 0) + 1;
                if (t.app_id) salesMap[t.app_id] = (salesMap[t.app_id] || 0) + 1;
            }
        });
        cachedApps = (apps || []).map(a => ({
            ...a,
            sold_count: salesMap[a.name] || salesMap[a.id] || 0
        }));
    } else {
        cachedApps = (apps || []).map(a => ({
            ...a,
            sold_count: Number(a.sold_count || 0)
        }));
    }

    if (!cachedApps || cachedApps.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-12 text-center text-slate-500">
                <i class="fa-solid fa-box-open text-3xl mb-2 block text-slate-600"></i>
                <p>Belum ada aplikasi yang terdaftar.</p>
            </div>
        `;
        return;
    }

    renderAppsFiltered();
    bindAppSearchFilter();
}

function renderAppsFiltered() {
    const container = document.getElementById('rnf-apps-grid');
    if (!container) return;

    const searchQuery = (document.getElementById('rnf-apps-search')?.value || '').toLowerCase().trim();
    const sortMode = document.getElementById('rnf-apps-sort')?.value || 'sold_desc';

    let apps = [...cachedApps];

    // Filter by search
    if (searchQuery) {
        apps = apps.filter(a => (a.name || '').toLowerCase().includes(searchQuery));
    }

    // Sort by single combined filter
    if (sortMode === 'name_asc') {
        apps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortMode === 'name_desc') {
        apps.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (sortMode === 'sold_desc') {
        apps.sort((a, b) => (b.sold_count || 0) - (a.sold_count || 0));
    } else if (sortMode === 'sold_asc') {
        apps.sort((a, b) => (a.sold_count || 0) - (b.sold_count || 0));
    }

    if (apps.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-8 text-center text-slate-500">
                <i class="fa-solid fa-magnifying-glass text-2xl mb-2 block text-slate-600"></i>
                <p class="text-sm">Tidak ada aplikasi yang sesuai filter.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = apps.map(app => {
        const isActive = app.is_active !== false;

        return `
            <div class="liquid-card p-4 sm:p-5 rounded-2xl border border-white/10 shadow-sm hover:border-cyan-500/30 transition-all group flex flex-col justify-between">
                <div>
                    <!-- Card Top: Logo on left, Action buttons on right -->
                    <div class="flex items-start justify-between gap-2 mb-3">
                        <div class="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center p-2 shadow-sm shrink-0 transition-transform group-hover:scale-105">
                            ${renderAppLogo(app.name, "w-full h-full object-contain")}
                        </div>
                        <div class="flex items-center gap-0.5 bg-white/5 rounded-xl border border-white/10 p-0.5 shrink-0">
                            <button class="btn-app-edit text-slate-400 hover:text-cyan-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer" data-id="${app.id}" data-name="${escAttr(app.name)}" title="Edit Nama Aplikasi">
                                <span class="material-symbols-outlined text-base">edit</span>
                            </button>
                            <div class="w-px h-3.5 bg-white/10 my-auto"></div>
                            <button class="btn-app-delete text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/30 transition-colors cursor-pointer" data-id="${app.id}" data-name="${escAttr(app.name)}" title="Hapus Aplikasi">
                                <span class="material-symbols-outlined text-base">delete</span>
                            </button>
                        </div>
                    </div>

                    <!-- App Title: Full width, clean font sizing without single-letter truncation -->
                    <h3 class="font-bold text-sm sm:text-base text-white truncate mb-1" title="${escAttr(app.name)}">${app.name}</h3>
                </div>

                <!-- Card Footer: Status on left, Sold badge on right (Never overlaps) -->
                <div class="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-white/6">
                    <button type="button" class="btn-app-toggle inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg ${isActive ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'} cursor-pointer hover:opacity-80 transition-opacity shrink-0" data-id="${app.id}" data-active="${isActive}" title="Klik untuk mengubah status">
                        <span class="size-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}"></span>
                        ${isActive ? 'Active' : 'Nonaktif'}
                    </button>

                    <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-[11px] font-bold border border-cyan-500/20 shadow-2xs shrink-0 pointer-events-none">
                        <span class="material-symbols-outlined text-[13px]">sell</span>
                        ${app.sold_count || 0} Sold
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Bind events
    container.querySelectorAll('.btn-app-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const currentActive = btn.getAttribute('data-active') === 'true';
            await toggleAppActive(id, !currentActive);
        });
    });

    container.querySelectorAll('.btn-app-edit').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const currentName = btn.getAttribute('data-name');
            if (window.Swal) {
                const { value: newName } = await window.Swal.fire({
                    title: 'Edit Aplikasi',
                    input: 'text',
                    inputValue: currentName,
                    showCancelButton: true,
                    confirmButtonText: 'Simpan',
                    cancelButtonText: 'Batal',
                    customClass: {
                        popup: 'bg-slate-900 border border-white/10 text-white rounded-2xl',
                        input: 'bg-white/5 border border-white/10 text-white rounded-xl'
                    }
                });
                if (newName && newName.trim() && newName.trim() !== currentName) {
                    await saveApp(newName, id);
                }
            } else {
                const newName = prompt('Ubah nama aplikasi:', currentName);
                if (newName && newName.trim() && newName.trim() !== currentName) {
                    await saveApp(newName, id);
                }
            }
        });
    });

    container.querySelectorAll('.btn-app-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            const ok = await showConfirm('Hapus Aplikasi?', `Aplikasi "${name}" akan dihapus dari katalog master.`);
            if (ok) {
                await deleteApp(id);
            }
        });
    });
}

let _appSearchBound = false;
function bindAppSearchFilter() {
    if (_appSearchBound) return;
    _appSearchBound = true;

    let debounce;
    document.getElementById('rnf-apps-search')?.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(renderAppsFiltered, 250);
    });

    document.getElementById('rnf-apps-sort')?.addEventListener('change', renderAppsFiltered);

    document.getElementById('btn-clear-apps-filter')?.addEventListener('click', () => {
        const searchInput = document.getElementById('rnf-apps-search');
        const sortSelect = document.getElementById('rnf-apps-sort');
        if (searchInput) searchInput.value = '';
        if (sortSelect) sortSelect.value = 'sold_desc';
        renderAppsFiltered();
    });
}

export async function saveApp(name, id = null) {
    if (!name || !name.trim()) {
        showAlert('Peringatan', 'Nama aplikasi tidak boleh kosong!', 'warning');
        return false;
    }
    const cleanName = name.trim().toUpperCase();

    if (isRnfPreviewMode()) {
        if (id) {
            const existing = MOCK_APPS.find(a => String(a.id) === String(id));
            if (existing) existing.name = cleanName;
            showAlert('Berhasil (Preview)', `Aplikasi diperbarui menjadi ${cleanName}!`, 'success');
        } else {
            const newApp = {
                id: 'mock-app-' + Date.now(),
                name: cleanName,
                is_active: true
            };
            MOCK_APPS.unshift(newApp);
            showAlert('Berhasil (Preview)', `Aplikasi ${cleanName} ditambahkan ke katalog mock!`, 'success');
        }
        await renderAppsView();
        return true;
    }

    try {
        const body = id ? { id, name: cleanName } : { name: cleanName, is_active: true };
        const res = await rnfFetch('save_app', {
            method: 'POST',
            body
        });
        if (!res.ok) throw new Error(res.error || 'Gagal menyimpan');
        showAlert('Berhasil', `Aplikasi ${cleanName} berhasil disimpan!`, 'success');
        await renderAppsView();
        return true;
    } catch (error) {
        showAlert('Gagal Menyimpan', error.message, 'error');
        return false;
    }
}

export async function toggleAppActive(id, newStatus) {
    if (isRnfPreviewMode()) {
        const app = MOCK_APPS.find(a => String(a.id) === String(id));
        if (app) app.is_active = newStatus;
        showAlert('Berhasil (Preview)', `Status aplikasi diperbarui di mock!`, 'success');
        await renderAppsView();
        return;
    }

    try {
        const res = await rnfFetch('save_app', {
            method: 'POST',
            body: { id, is_active: newStatus }
        });
        if (!res.ok) throw new Error(res.error || 'Gagal mengubah status');
        await renderAppsView();
    } catch (error) {
        showAlert('Gagal', error.message, 'error');
    }
}

export async function deleteApp(id) {
    if (isRnfPreviewMode()) {
        const idx = MOCK_APPS.findIndex(a => String(a.id) === String(id));
        if (idx !== -1) MOCK_APPS.splice(idx, 1);
        showAlert('Berhasil (Preview)', 'Aplikasi dihapus dari mock!', 'success');
        await renderAppsView();
        return;
    }

    try {
        const res = await rnfFetch('save_app', {
            method: 'DELETE',
            params: { id }
        });
        if (!res.ok) throw new Error(res.error || 'Gagal menghapus');
        showAlert('Berhasil', 'Aplikasi telah dihapus.', 'success');
        await renderAppsView();
    } catch (error) {
        showAlert('Gagal Menghapus', error.message, 'error');
    }
}
