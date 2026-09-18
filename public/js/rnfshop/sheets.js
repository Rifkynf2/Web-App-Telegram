// public/js/rnfshop/sheets.js
/**
 * Google Sheets Automated Background Sync Module
 * Synchronizes INSERT, UPDATE, DELETE, and BATCH_INSERT automatically
 * with Google Spreadsheet via Google Apps Script Webhook.
 */

const GSHEET_CONFIG = {
    // Official Apps Script Webhook URL for RNF Shop
    WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbx43pwKTiMSxdS0jelF1W1BNsKjHTofJybLpBUa732Q8SgGdHwVda6Z9WMl7_ZibM5dFA/exec',
    // Secret token for authentication
    SECRET_TOKEN: 'rnfshop-punya-rnf-since-2025',
    TIMEOUT: 25000,
    ENABLED: true
};

function normalizeType(trxType) {
    let type = String(trxType || '').toUpperCase();
    if (type === 'INCOMING') type = 'IN';
    if (type === 'OUTGOING') type = 'OUT';
    return type;
}

async function sendToAppsScript(payload) {
    if (!GSHEET_CONFIG.ENABLED || !GSHEET_CONFIG.WEB_APP_URL) {
        return { ok: false, skipped: true };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GSHEET_CONFIG.TIMEOUT);

    try {
        const response = await fetch(GSHEET_CONFIG.WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            redirect: 'follow',
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return await response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        console.warn('[RNF Sheets Sync] Background sync note:', err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Otomatis sync saat transaksi baru ditambahkan
 */
export async function syncToGoogleSheets(transaction) {
    console.log('[Sheets Sync] Auto-syncing INSERT:', transaction.id);
    const payload = {
        token: GSHEET_CONFIG.SECRET_TOKEN,
        action: 'INSERT',
        id: transaction.id,
        date: transaction.trx_date,
        type: normalizeType(transaction.trx_type),
        amount: Number(transaction.amount),
        customer: transaction.customer_name || '',
        app_name: transaction.app_name || transaction.apps?.name || '',
        note: transaction.note || ''
    };

    return sendToAppsScript(payload);
}

/**
 * Otomatis sync saat banyak transaksi di-import dari struk Telegram
 */
export async function batchSyncToGoogleSheets(transactions) {
    if (!transactions?.length) return { ok: true, count: 0 };
    console.log(`[Sheets Sync] Auto-syncing BATCH_INSERT for ${transactions.length} rows`);

    const payload = {
        token: GSHEET_CONFIG.SECRET_TOKEN,
        action: 'BATCH_INSERT',
        rows: transactions.map(t => ({
            id: t.id,
            date: t.trx_date,
            type: normalizeType(t.trx_type),
            amount: Number(t.amount),
            customer: t.customer_name || '',
            app_name: t.app_name || t.apps?.name || '',
            note: t.note || ''
        }))
    };

    return sendToAppsScript(payload);
}

/**
 * Otomatis sync saat transaksi di-update
 */
export async function updateInGoogleSheets(transaction) {
    console.log('[Sheets Sync] Auto-syncing UPDATE:', transaction.id);
    const payload = {
        token: GSHEET_CONFIG.SECRET_TOKEN,
        action: 'UPDATE',
        id: transaction.id,
        date: transaction.trx_date,
        type: normalizeType(transaction.trx_type),
        amount: Number(transaction.amount),
        customer: transaction.customer_name || '',
        app_name: transaction.app_name || transaction.apps?.name || '',
        note: transaction.note || ''
    };

    return sendToAppsScript(payload);
}

/**
 * Otomatis sync saat transaksi dihapus
 */
export async function deleteFromGoogleSheets(transactionId) {
    console.log('[Sheets Sync] Auto-syncing DELETE:', transactionId);
    const payload = {
        token: GSHEET_CONFIG.SECRET_TOKEN,
        action: 'DELETE',
        id: transactionId
    };

    return sendToAppsScript(payload);
}

