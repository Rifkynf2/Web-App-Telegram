// public/js/rnfshop/transactions.js
import { rnfFetch } from './apiClient.js';
import { formatRupiah, formatDateID, showAlert, showConfirm, escAttr } from './utils.js';
import { fetchApps } from './apps.js';
import { syncToGoogleSheets, updateInGoogleSheets, deleteFromGoogleSheets } from './sheets.js';
import { MOCK_TRANSACTIONS, isRnfPreviewMode } from './mockData.js';

let currentPage = 1;
const PAGE_SIZE = 25;
let currentFilter = {
    type: 'all',
    appId: 'all',
    search: '',
    startDate: '',
    endDate: '',
    sortBy: 'date_desc'
};

export async function initTransactionsView() {
    bindTransactionEvents();
    await populateAppFilterDropdown();
    await loadTransactions();
}

async function populateAppFilterDropdown() {
    const apps = await fetchApps();
    const modalSelect = document.getElementById('modal-trx-app');

    if (modalSelect) {
        modalSelect.innerHTML = `<option value="">Select App...</option>` +
            apps.filter(a => a.is_active).map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    }
}

function checkDateRangeLimit(startDate, endDate) {
    if (!startDate || !endDate) return true;
    const d1 = new Date(startDate);
    const d2 = new Date(endDate);
    const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
    if (diffDays > 31) {
        showAlert('Maximum 31 Days', 'Maximum date range is 31 days (1 month). Please adjust your date selection.', 'warning');
        return false;
    }
    return true;
}

export async function loadTransactions(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('rnf-transactions-body');
    const paginationEl = document.getElementById('rnf-pagination-container');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-12 text-slate-400">
                <i class="fa-solid fa-spinner fa-spin text-xl text-cyan-400 mb-2"></i>
                <p>Loading transactions...</p>
            </td>
        </tr>
    `;

    let transactions = [];
    let count = 0;

    if (isRnfPreviewMode()) {
        console.log('[RNFSHOP] Preview mode — filtering mock transactions');
        let filtered = [...MOCK_TRANSACTIONS];
        if (currentFilter.type !== 'all') {
            filtered = filtered.filter(t => t.trx_type === currentFilter.type);
        }
        if (currentFilter.appId !== 'all') {
            filtered = filtered.filter(t => String(t.app_id) === String(currentFilter.appId));
        }
        if (currentFilter.startDate) {
            filtered = filtered.filter(t => t.trx_date >= currentFilter.startDate);
        }
        if (currentFilter.endDate) {
            filtered = filtered.filter(t => t.trx_date <= currentFilter.endDate);
        }
        if (currentFilter.search) {
            const s = currentFilter.search.toLowerCase();
            filtered = filtered.filter(t =>
                (t.notes || t.note || '').toLowerCase().includes(s) ||
                (t.customer_id || '').toLowerCase().includes(s) ||
                (t.customer_name || '').toLowerCase().includes(s) ||
                (t.apps?.name || '').toLowerCase().includes(s)
            );
        }

        // Apply Sorting
        filtered.sort((a, b) => {
            if (currentFilter.sortBy === 'date_asc') {
                return (a.trx_date || '').localeCompare(b.trx_date || '');
            } else if (currentFilter.sortBy === 'amount_desc') {
                return Number(b.amount || 0) - Number(a.amount || 0);
            } else if (currentFilter.sortBy === 'amount_asc') {
                return Number(a.amount || 0) - Number(b.amount || 0);
            } else {
                // Default: date_desc
                return (b.trx_date || '').localeCompare(a.trx_date || '');
            }
        });

        count = filtered.length;
        const from = (page - 1) * PAGE_SIZE;
        transactions = filtered.slice(from, from + PAGE_SIZE);
    } else {
        const res = await rnfFetch('transactions', {
            params: {
                page,
                pageSize: PAGE_SIZE,
                trx_type: currentFilter.type,
                app_id: currentFilter.appId,
                startDate: currentFilter.startDate,
                endDate: currentFilter.endDate,
                search: currentFilter.search,
                sortBy: currentFilter.sortBy
            }
        });

        if (!res.ok) {
            console.error('[RNFSHOP] Error loading transactions:', res.error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-8 text-rose-400">
                        <i class="fa-solid fa-triangle-exclamation mb-1"></i> Failed to load data: ${res.error || 'Server error'}
                    </td>
                </tr>
            `;
            return;
        }

        transactions = res.transactions || [];
        count = res.count || 0;
    }

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-12 text-slate-500">
                    <i class="fa-solid fa-inbox text-3xl mb-2 text-slate-600"></i>
                    <p>No transactions match your search or filter.</p>
                </td>
            </tr>
        `;
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }

    tbody.innerHTML = transactions.map(t => {
        const isIncoming = t.trx_type === 'incoming';
        const appName = t.apps?.name || t.app_name || '-';
        const customer = t.customer_name || t.customer_id || '-';
        const noteText = t.note || t.notes || '-';
        const feeVal = Number(t.fee || t.fee_qris || 0);
        const feeHtml = feeVal > 0 ? `<span class="text-[10px] text-amber-400/90 block font-mono">Fee: ${formatRupiah(feeVal)}</span>` : '';

        // Clean Type Badge: Liquid Glass IN / OUT
        const typeBadge = isIncoming
            ? `<span class="badge-in-liquid">IN</span>`
            : `<span class="badge-out-liquid">OUT</span>`;

        // Clean App Name: text ONLY, NO logo thumbnail
        const appDisplay = `<span class="font-semibold text-slate-200 text-xs truncate max-w-32.5 block" title="${escAttr(appName)}">${escAttr(appName)}</span>`;

        return `
            <tr class="hover:bg-white/2 transition-colors border-b border-white/4">
                <td data-label="Date" class="tabular whitespace-nowrap text-slate-300 text-xs px-3 py-3">${formatDateID(t.trx_date)}</td>
                <td data-label="Type" class="px-3 py-3 whitespace-nowrap">${typeBadge}</td>
                <td data-label="App" class="px-3 py-3">${appDisplay}</td>
                <td data-label="Customer" class="text-slate-300 text-xs truncate max-w-32.5 px-3 py-3" title="${escAttr(customer)}">${escAttr(customer)}</td>
                <td data-label="Note / Fee" class="text-xs max-w-37.5 truncate px-3 py-3" title="${escAttr(noteText)}">
                    <span class="text-slate-300 font-medium">${escAttr(noteText)}</span>
                    ${feeHtml}
                </td>
                <td data-label="Amount" class="tabular font-bold text-right text-sm px-3 py-3 ${isIncoming ? 'text-emerald-400' : 'text-rose-400'}">
                    ${isIncoming ? '+' : '-'}${formatRupiah(t.amount)}
                </td>
                <td data-label="Actions" class="text-center whitespace-nowrap px-3 py-3">
                    <div class="flex gap-1 justify-center">
                        <button class="icon-btn icon-btn-blue btn-trx-edit" data-trx='${JSON.stringify(t).replace(/'/g, "&apos;")}' title="Edit">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="icon-btn icon-btn-red btn-trx-delete" data-id="${t.id}" title="Delete">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    renderPagination(count || 0, page);
    bindRowEvents();
}

function renderPagination(totalCount, page) {
    const el = document.getElementById('rnf-pagination-container');
    if (!el) return;

    if (!totalCount || totalCount === 0) {
        el.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    const startRecord = (page - 1) * PAGE_SIZE + 1;
    const endRecord = Math.min(page * PAGE_SIZE, totalCount);

    if (totalPages <= 1) {
        el.innerHTML = `
            <div class="flex items-center justify-between w-full text-xs text-slate-400">
                <span>Menampilkan <span class="font-bold text-slate-200">${startRecord}–${endRecord}</span> dari <span class="font-bold text-slate-200">${totalCount}</span> transaksi</span>
            </div>
        `;
        return;
    }

    // Build page number items
    let pageItems = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pageItems.push(i);
    } else {
        if (page <= 4) {
            pageItems = [1, 2, 3, 4, 5, '...', totalPages];
        } else if (page >= totalPages - 3) {
            pageItems = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        } else {
            pageItems = [1, '...', page - 1, page, page + 1, '...', totalPages];
        }
    }

    const pageButtonsHtml = pageItems.map(item => {
        if (item === '...') {
            return `<span class="px-1.5 text-xs text-slate-500 select-none">…</span>`;
        }
        const isActive = item === page;
        return `
            <button class="page-btn-glass ${isActive ? 'active' : ''} btn-page" data-page="${item}" aria-label="Page ${item}">
                ${item}
            </button>
        `;
    }).join('');

    el.innerHTML = `
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 w-full text-xs text-slate-400">
            <div class="text-slate-400 text-xs font-medium">
                Menampilkan <span class="font-bold text-slate-200">${startRecord}–${endRecord}</span> dari <span class="font-bold text-slate-200">${totalCount}</span> transaksi
            </div>
            <div class="pagination-glass-bar">
                <button class="page-btn-glass btn-page" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}" title="Previous Page" aria-label="Previous Page">
                    <i class="fa-solid fa-chevron-left text-[11px]"></i>
                </button>
                ${pageButtonsHtml}
                <button class="page-btn-glass btn-page" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}" title="Next Page" aria-label="Next Page">
                    <i class="fa-solid fa-chevron-right text-[11px]"></i>
                </button>
            </div>
        </div>
    `;

    el.querySelectorAll('.btn-page:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPage = Number(btn.getAttribute('data-page'));
            if (targetPage > 0 && targetPage <= totalPages && targetPage !== page) {
                loadTransactions(targetPage);
            }
        });
    });
}

function bindRowEvents() {
    document.querySelectorAll('.btn-trx-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const trx = JSON.parse(btn.getAttribute('data-trx'));
            openTransactionModal(trx);
        });
    });

    document.querySelectorAll('.btn-trx-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const ok = await showConfirm('Delete Transaction?', 'Deleted transactions cannot be recovered.', 'Delete');
            if (!ok) return;

            if (isRnfPreviewMode()) {
                const idx = MOCK_TRANSACTIONS.findIndex(t => String(t.id) === String(id));
                if (idx !== -1) MOCK_TRANSACTIONS.splice(idx, 1);
                showAlert('Success (Preview)', 'Transaction deleted from preview data.', 'success');
                loadTransactions(currentPage);
                return;
            }

            const res = await rnfFetch('delete_transaction', {
                method: 'DELETE',
                params: { id }
            });

            if (!res.ok) {
                showAlert('Failed to Delete', res.error || 'A system error occurred', 'error');
            } else {
                deleteFromGoogleSheets(id);
                showAlert('Deleted', 'Transaction has been deleted.', 'success');
                loadTransactions(currentPage);
            }
        });
    });
}

function setTransactionModalType(type) {
    const typeInput = document.getElementById('modal-trx-type');
    const modalBox = document.getElementById('modal-trx-box');
    const segIn = document.getElementById('seg-btn-incoming');
    const segOut = document.getElementById('seg-btn-outgoing');
    const saveBtn = document.getElementById('btn-save-trx-submit');
    const iconWrap = document.getElementById('modal-trx-icon-wrap');

    if (typeInput) typeInput.value = type;

    if (type === 'incoming') {
        modalBox?.classList.remove('modal-outgoing');
        modalBox?.classList.add('modal-incoming');
        segIn?.classList.add('active-incoming');
        segOut?.classList.remove('active-outgoing');
        if (iconWrap) {
            iconWrap.className = 'w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400';
        }
        if (saveBtn) {
            saveBtn.classList.remove('btn-rose');
            saveBtn.classList.add('btn-emerald');
        }
    } else {
        modalBox?.classList.remove('modal-incoming');
        modalBox?.classList.add('modal-outgoing');
        segOut?.classList.add('active-outgoing');
        segIn?.classList.remove('active-incoming');
        if (iconWrap) {
            iconWrap.className = 'w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400';
        }
        if (saveBtn) {
            saveBtn.classList.remove('btn-emerald');
            saveBtn.classList.add('btn-rose');
        }
    }
}

function bindTransactionEvents() {
    // Liquid glass dropdown enhance
    if (window.enhanceSelect) {
        window.enhanceSelect('sortBy');
        window.enhanceSelect('filterType');
    }

    // 1. Search Bar (Full Width)
    const searchInput = document.getElementById('searchInput') || document.getElementById('rnf-search-trx');
    let debounceTimer;
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentFilter.search = e.target.value.trim();
            loadTransactions(1);
        }, 350);
    });

    // 2. Sort Select
    document.getElementById('sortBy')?.addEventListener('change', (e) => {
        currentFilter.sortBy = e.target.value;
        loadTransactions(1);
    });

    // 3. Type Filter
    const filterTypeEl = document.getElementById('filterType') || document.getElementById('rnf-filter-type');
    filterTypeEl?.addEventListener('change', (e) => {
        currentFilter.type = e.target.value;
        loadTransactions(1);
    });

    // 4. Date From & To with 31 Days Validation
    const dateFromEl = document.getElementById('filterDateFrom') || document.getElementById('rnf-filter-date-from');
    const dateToEl = document.getElementById('filterDateTo') || document.getElementById('rnf-filter-date-to');

    dateFromEl?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val && dateToEl?.value && !checkDateRangeLimit(val, dateToEl.value)) {
            e.target.value = '';
            currentFilter.startDate = '';
            return;
        }
        currentFilter.startDate = val;
        loadTransactions(1);
    });

    dateToEl?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val && dateFromEl?.value && !checkDateRangeLimit(dateFromEl.value, val)) {
            e.target.value = '';
            currentFilter.endDate = '';
            return;
        }
        currentFilter.endDate = val;
        loadTransactions(1);
    });

    // 5. Clear Filter Button
    const clearBtn = document.getElementById('btnClearDateFilter') || document.getElementById('btn-reset-filter');
    clearBtn?.addEventListener('click', () => {
        currentFilter = { type: 'all', appId: 'all', search: '', startDate: '', endDate: '', sortBy: 'date_desc' };
        if (searchInput) searchInput.value = '';
        if (filterTypeEl) {
            filterTypeEl.value = 'all';
            filterTypeEl.dispatchEvent(new Event('change'));
        }
        const sortByEl = document.getElementById('sortBy');
        if (sortByEl) {
            sortByEl.value = 'date_desc';
            sortByEl.dispatchEvent(new Event('change'));
        }
        if (dateFromEl) dateFromEl.value = '';
        if (dateToEl) dateToEl.value = '';
        loadTransactions(1);
    });

    // 6. Segmented Switch for IN / OUT in Modal
    document.getElementById('seg-btn-incoming')?.addEventListener('click', () => {
        setTransactionModalType('incoming');
    });

    document.getElementById('seg-btn-outgoing')?.addEventListener('click', () => {
        setTransactionModalType('outgoing');
    });

    // 7. Collapsible Import Raw Panel Toggle
    const importPanel = document.getElementById('rnf-import-panel');
    document.getElementById('btn-toggle-import')?.addEventListener('click', () => {
        if (!importPanel) return;
        const isHidden = importPanel.classList.toggle('hidden');
        if (!isHidden) {
            importPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            document.getElementById('rnf-raw-import-text')?.focus();
        }
    });

    document.getElementById('btn-close-import-panel')?.addEventListener('click', () => {
        importPanel?.classList.add('hidden');
    });

    // 8. Open/Close Modal
    document.getElementById('btn-add-trx')?.addEventListener('click', () => {
        openTransactionModal();
    });

    document.getElementById('form-trx-modal')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSaveTransaction();
    });

    document.getElementById('btn-close-trx-modal')?.addEventListener('click', () => {
        closeTransactionModal();
    });
}

export function openTransactionModal(trx = null) {
    const modal = document.getElementById('modal-trx');
    const title = document.getElementById('modal-trx-title');
    const form = document.getElementById('form-trx-modal');
    if (!modal) return;

    form.reset();
    document.getElementById('modal-trx-id').value = trx?.id || '';

    if (trx) {
        if (title) title.innerText = 'Edit Transaction';
        setTransactionModalType(trx.trx_type || 'incoming');
        document.getElementById('modal-trx-app').value = trx.app_id || '';
        document.getElementById('modal-trx-date').value = trx.trx_date || '';
        document.getElementById('modal-trx-amount').value = trx.amount || '';
        document.getElementById('modal-trx-customer').value = trx.customer_name || '';
        document.getElementById('modal-trx-note').value = trx.note || trx.notes || '';
    } else {
        if (title) title.innerText = 'Add Transaction';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('modal-trx-date').value = today;
        setTransactionModalType('incoming');
    }

    modal.classList.add('active');
}

export function closeTransactionModal() {
    const modal = document.getElementById('modal-trx');
    modal?.classList.remove('active');
}

async function handleSaveTransaction() {
    const id = document.getElementById('modal-trx-id').value;
    const trx_type = document.getElementById('modal-trx-type').value || 'incoming';
    const app_id = document.getElementById('modal-trx-app').value;
    const trx_date = document.getElementById('modal-trx-date').value;
    const amount = Number(document.getElementById('modal-trx-amount').value || 0);
    const customer_name = document.getElementById('modal-trx-customer').value.trim();
    const note = document.getElementById('modal-trx-note').value.trim();

    if (!app_id || !trx_date || amount <= 0 || !customer_name) {
        showAlert('Incomplete Form', 'Please fill in all required fields properly!', 'warning');
        return;
    }

    const payload = { trx_type, app_id, trx_date, amount, customer_name, note };

    if (isRnfPreviewMode()) {
        if (id) {
            const idx = MOCK_TRANSACTIONS.findIndex(t => String(t.id) === String(id));
            if (idx !== -1) {
                MOCK_TRANSACTIONS[idx] = { ...MOCK_TRANSACTIONS[idx], ...payload };
            }
        } else {
            MOCK_TRANSACTIONS.unshift({
                id: 'mock-trx-' + Date.now(),
                ...payload,
                apps: { id: app_id, name: 'APP-' + app_id }
            });
        }
        showAlert('Success (Preview)', id ? 'Transaction updated in preview data!' : 'New transaction added to preview data!', 'success');
        closeTransactionModal();
        loadTransactions(currentPage);
        return;
    }

    let res;
    if (id) {
        res = await rnfFetch('update_transaction', {
            method: 'PUT',
            body: { id, ...payload }
        });
    } else {
        res = await rnfFetch('add_transaction', {
            method: 'POST',
            body: payload
        });
    }

    if (!res.ok) {
        showAlert('Save Failed', res.error || 'A system error occurred', 'error');
        return;
    }

    if (id) {
        updateInGoogleSheets({ id, ...payload });
    } else {
        syncToGoogleSheets({ id: res.transaction?.id || ('trx-' + Date.now()), ...payload });
    }

    showAlert('Saved', id ? 'Transaction has been updated!' : 'New transaction saved successfully!', 'success');
    closeTransactionModal();
    loadTransactions(currentPage);
}
