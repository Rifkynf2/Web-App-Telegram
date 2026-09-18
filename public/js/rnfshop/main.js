// public/js/rnfshop/main.js
import { loadDashboardOverview, initPeriodFilters } from './dashboard.js';
import { initTransactionsView, loadTransactions } from './transactions.js';
import { parseReceiptText } from './import.js';
import { fetchApps, renderAppsView, saveApp } from './apps.js';
import { batchSyncToGoogleSheets } from './sheets.js';
import { rnfFetch } from './apiClient.js';
import { MOCK_TRANSACTIONS, isRnfPreviewMode } from './mockData.js';
import { showAlert, showConfirm, formatRupiah, formatDateID } from './utils.js';
import { RNFSHOP_CONFIG } from './config.js';

let isInitialized = false;
let parsedImportRows = [];

export async function initRnfShop() {
    if (isInitialized) return;
    isInitialized = true;

    console.log('[RNFSHOP] Initializing RNF Shop Console...');

    // 1. Inisialisasi Transaksi
    await initTransactionsView();

    // 2. Bind Raw Receipt Import Events
    bindImportEvents();

    // 3. Bind Apps Modal Events
    bindAppModalEvents();

    // 4. Bind Sheets Sync Events
    bindSheetsEvents();

    // 5. Init Period Filters & Overview quick actions
    initPeriodFilters();
}

export async function onRnfViewActivated(viewName) {
    await initRnfShop();
    await loadDashboardOverview();

    if (viewName === 'rnf-transactions') {
        await loadTransactions(1);
    } else if (viewName === 'rnf-apps') {
        await renderAppsView();
    }
}

function bindImportEvents() {
    const btnParse = document.getElementById('btn-parse-receipts');
    const btnSaveImport = document.getElementById('btn-save-import');
    const rawInput = document.getElementById('rnf-raw-import-text');
    const previewContainer = document.getElementById('rnf-import-preview');
    const summaryBadge = document.getElementById('rnf-import-summary');

    btnParse?.addEventListener('click', async () => {
        const text = rawInput?.value || '';
        if (!text.trim()) {
            showAlert('Empty Input', 'Please paste transaction receipt text from Telegram first!', 'warning');
            return;
        }

        const apps = await fetchApps();
        const { rows, summary } = parseReceiptText(text, apps);
        parsedImportRows = rows;

        if (summaryBadge) {
            summaryBadge.innerHTML = `
                <span class="text-slate-300">Total: ${summary.total}</span> | 
                <span class="text-emerald-400 font-bold">Ready: ${summary.ready}</span> | 
                <span class="text-rose-400">Failed: ${summary.invalid + summary.unknown}</span>
            `;
            summaryBadge.classList.remove('hidden');
        }

        if (previewContainer) {
            if (rows.length === 0) {
                previewContainer.innerHTML = `<p class="text-center py-6 text-slate-500">No recognizable transaction format found.</p>`;
                btnSaveImport?.classList.add('hidden');
                return;
            }

            previewContainer.innerHTML = `
                <table class="table-liquid">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Customer ID</th>
                            <th>App</th>
                            <th>Net</th>
                            <th>Fee QRIS</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                <td class="tabular">${formatDateID(r.trx_date)}</td>
                                <td class="font-mono text-xs">${r.customer_name || '-'}</td>
                                <td>${r.app_name}</td>
                                <td class="tabular text-emerald-400 font-semibold">${formatRupiah(r.amount)}</td>
                                <td class="tabular text-rose-400 text-xs">${formatRupiah(r.fee)}</td>
                                <td>
                                    <span class="badge-liquid ${r.isReady ? 'badge-incoming' : 'badge-outgoing'}">
                                        ${r.isReady ? '<i class="fa-solid fa-check mr-1"></i>Ready' : (r.status || r.statusKey)}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            if (summary.ready > 0 && btnSaveImport) {
                btnSaveImport.classList.remove('hidden');
                btnSaveImport.innerText = `Save ${summary.ready} Ready Transactions`;
            } else {
                btnSaveImport?.classList.add('hidden');
            }
        }
    });

    btnSaveImport?.addEventListener('click', async () => {
        const readyRows = parsedImportRows.filter(r => r.isReady);
        if (readyRows.length === 0) {
            showAlert('Notice', 'No transactions ready to save.', 'warning');
            return;
        }

        const ok = await showConfirm('Save Transactions?', `Save ${readyRows.length} transactions to store database?`);
        if (!ok) return;

        const mappedPayload = readyRows.map(r => ({
            ...r,
            fee_qris: r.fee || 0,
            net_amount: r.amount,
            amount: r.amount,
            payment_method: r.payment_method || 'QRIS'
        }));

        if (isRnfPreviewMode()) {
            mappedPayload.forEach((r, idx) => {
                MOCK_TRANSACTIONS.unshift({
                    id: 'mock-import-' + Date.now() + '-' + idx,
                    trx_date: r.trx_date,
                    trx_type: r.trx_type || 'incoming',
                    app_id: r.app_id,
                    amount: r.amount,
                    fee: r.fee_qris,
                    fee_qris: r.fee_qris,
                    gross_amount: r.gross_amount || r.amount,
                    payment_method: r.payment_method,
                    customer_name: r.customer_name,
                    note: r.note,
                    apps: { id: r.app_id, name: r.app_name }
                });
            });

            btnSaveImport.disabled = false;
            btnSaveImport.innerText = `Save Transactions`;
            showAlert('Success (Preview)', `${mappedPayload.length} transactions added to preview data!`, 'success');
            if (rawInput) rawInput.value = '';
            if (previewContainer) previewContainer.innerHTML = '';
            if (summaryBadge) summaryBadge.classList.add('hidden');
            btnSaveImport.classList.add('hidden');
            document.getElementById('rnf-import-panel')?.classList.add('hidden');
            await loadTransactions(1);
            await loadDashboardOverview();
            return;
        }

        try {
            const res = await rnfFetch('import_batch', {
                method: 'POST',
                body: { rows: mappedPayload }
            });

            btnSaveImport.disabled = false;
            btnSaveImport.innerText = `Save Transactions`;

            if (!res.ok && !res.success) {
                showAlert('Save Failed', res.error || 'A system error occurred', 'error');
                return;
            }

            batchSyncToGoogleSheets(readyRows);
            showAlert('Saved', `${readyRows.length} transactions saved and synced successfully!`, 'success');
            if (rawInput) rawInput.value = '';
            if (previewContainer) previewContainer.innerHTML = '';
            if (summaryBadge) summaryBadge.classList.add('hidden');
            btnSaveImport.classList.add('hidden');
            document.getElementById('rnf-import-panel')?.classList.add('hidden');
            await loadTransactions(1);
            await loadDashboardOverview();
        } catch (err) {
            btnSaveImport.disabled = false;
            btnSaveImport.innerText = `Save Transactions`;
            showAlert('Save Failed', err.message || 'A system error occurred', 'error');
        }
    });
}

function bindAppModalEvents() {
    const btnOpenAdd = document.getElementById('btn-open-add-app');
    const modal = document.getElementById('modal-app');
    const form = document.getElementById('form-app-modal');
    const btnClose = document.getElementById('btn-close-app-modal');

    btnOpenAdd?.addEventListener('click', () => {
        form?.reset();
        modal?.classList.add('active');
    });

    btnClose?.addEventListener('click', () => {
        modal?.classList.remove('active');
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('modal-app-name')?.value;
        const success = await saveApp(name);
        if (success) {
            modal?.classList.remove('active');
        }
    });
}

function bindSheetsEvents() {
    const btnSyncSheets = document.getElementById('btn-trigger-sheets-sync');
    const inputWebhook = document.getElementById('rnf-sheets-webhook-input');
    const btnSaveWebhook = document.getElementById('btn-save-sheets-webhook');

    if (inputWebhook) {
        inputWebhook.value = RNFSHOP_CONFIG.sheetsWebhookUrl;
    }

    btnSaveWebhook?.addEventListener('click', () => {
        const val = inputWebhook?.value || '';
        RNFSHOP_CONFIG.sheetsWebhookUrl = val;
        showAlert('Tersimpan', 'URL Webhook Google Sheets berhasil disimpan di browser lokal Anda.', 'success');
    });

    btnSyncSheets?.addEventListener('click', async () => {
        btnSyncSheets.disabled = true;
        btnSyncSheets.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyinkronkan...`;

        let trxs = [];
        if (isRnfPreviewMode()) {
            trxs = MOCK_TRANSACTIONS.slice(0, 100);
        } else {
            try {
                const res = await rnfFetch('transactions', {
                    params: { page: 1, pageSize: 100 }
                });
                if (!res.ok && !res.success) {
                    btnSyncSheets.disabled = false;
                    btnSyncSheets.innerHTML = `<i class="fa-solid fa-cloud-arrow-up mr-1.5"></i> Mulai Sinkronisasi 100 Transaksi Terbaru`;
                    showAlert('Gagal Mengambil Data', res.error || 'Gagal memuat transaksi', 'error');
                    return;
                }
                trxs = res.transactions || [];
            } catch (err) {
                btnSyncSheets.disabled = false;
                btnSyncSheets.innerHTML = `<i class="fa-solid fa-cloud-arrow-up mr-1.5"></i> Mulai Sinkronisasi 100 Transaksi Terbaru`;
                showAlert('Gagal Mengambil Data', err.message || 'Gagal memuat transaksi', 'error');
                return;
            }
        }

        btnSyncSheets.disabled = false;
        btnSyncSheets.innerHTML = `<i class="fa-solid fa-cloud-arrow-up mr-1.5"></i> Mulai Sinkronisasi 100 Transaksi Terbaru`;

        await syncBatchToGoogleSheets(trxs);
    });
}
