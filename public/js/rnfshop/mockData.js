// public/js/rnfshop/mockData.js
/**
 * Mock Data for RNF Shop Preview Mode
 * Allows full visualization of metrics, Chart.js graphs, transactions table, and apps grid without live DB.
 */

export const MOCK_APPS = [
    { id: 1, name: 'NETFLIX', icon_url: 'netflix.webp', is_active: true, created_at: '2025-01-10T00:00:00Z' },
    { id: 2, name: 'SPOTIFY', icon_url: 'spotify.webp', is_active: true, created_at: '2025-01-11T00:00:00Z' },
    { id: 3, name: 'CANVA', icon_url: 'canva.webp', is_active: true, created_at: '2025-01-12T00:00:00Z' },
    { id: 4, name: 'YOUTUBE', icon_url: 'youtube.webp', is_active: true, created_at: '2025-01-15T00:00:00Z' },
    { id: 5, name: 'CHATGPT', icon_url: 'chatgpt.webp', is_active: true, created_at: '2025-02-01T00:00:00Z' },
    { id: 6, name: 'DISNEY+', icon_url: 'disney.webp', is_active: true, created_at: '2025-02-10T00:00:00Z' },
    { id: 7, name: 'CAPCUT', icon_url: 'capcut.webp', is_active: true, created_at: '2025-02-15T00:00:00Z' },
    { id: 8, name: 'PRIME VIDEO', icon_url: 'prime.webp', is_active: false, created_at: '2025-02-20T00:00:00Z' }
];

export const MOCK_TRANSACTIONS = [
    {
        id: 101,
        trx_date: '2026-09-16',
        trx_type: 'incoming',
        app_id: 1,
        apps: { id: 1, name: 'NETFLIX' },
        amount: 45000,
        fee_qris: 315,
        net_amount: 44685,
        payment_method: 'QRIS',
        notes: 'Akun 1 Bulan Private',
        is_synced: true,
        created_at: '2026-09-16T08:30:00Z'
    },
    {
        id: 102,
        trx_date: '2026-09-16',
        trx_type: 'incoming',
        app_id: 2,
        apps: { id: 2, name: 'SPOTIFY' },
        amount: 25000,
        fee_qris: 175,
        net_amount: 24825,
        payment_method: 'QRIS',
        notes: 'Individual Plan 1 Bulan',
        is_synced: true,
        created_at: '2026-09-16T10:15:00Z'
    },
    {
        id: 103,
        trx_date: '2026-09-16',
        trx_type: 'incoming',
        app_id: 3,
        apps: { id: 3, name: 'CANVA' },
        amount: 35000,
        fee_qris: 0,
        net_amount: 35000,
        payment_method: 'BCA',
        notes: 'Canva Pro 1 Tahun Edu',
        is_synced: true,
        created_at: '2026-09-16T11:45:00Z'
    },
    {
        id: 104,
        trx_date: '2026-09-15',
        trx_type: 'outgoing',
        app_id: 1,
        apps: { id: 1, name: 'NETFLIX' },
        amount: 180000,
        fee_qris: 0,
        net_amount: 180000,
        payment_method: 'TRANSFER',
        notes: 'Kulakan Gift Card Netflix Turkey',
        is_synced: true,
        created_at: '2026-09-15T09:00:00Z'
    },
    {
        id: 105,
        trx_date: '2026-09-15',
        trx_type: 'incoming',
        app_id: 5,
        apps: { id: 5, name: 'CHATGPT' },
        amount: 125000,
        fee_qris: 875,
        net_amount: 124125,
        payment_method: 'QRIS',
        notes: 'ChatGPT Plus Shared Slot',
        is_synced: true,
        created_at: '2026-09-15T14:20:00Z'
    },
    {
        id: 106,
        trx_date: '2026-09-14',
        trx_type: 'incoming',
        app_id: 4,
        apps: { id: 4, name: 'YOUTUBE' },
        amount: 30000,
        fee_qris: 210,
        net_amount: 29790,
        payment_method: 'QRIS',
        notes: 'YouTube Famplan Invite',
        is_synced: true,
        created_at: '2026-09-14T16:00:00Z'
    },
    {
        id: 107,
        trx_date: '2026-09-14',
        trx_type: 'incoming',
        app_id: 6,
        apps: { id: 6, name: 'DISNEY+' },
        amount: 40000,
        fee_qris: 280,
        net_amount: 39720,
        payment_method: 'QRIS',
        notes: 'Disney Hotstar Premium 1 Bln',
        is_synced: false,
        created_at: '2026-09-14T19:30:00Z'
    },
    {
        id: 108,
        trx_date: '2026-09-13',
        trx_type: 'outgoing',
        app_id: 3,
        apps: { id: 3, name: 'CANVA' },
        amount: 150000,
        fee_qris: 0,
        net_amount: 150000,
        payment_method: 'DANA',
        notes: 'Restock Slot Canva Team',
        is_synced: true,
        created_at: '2026-09-13T11:00:00Z'
    },
    {
        id: 109,
        trx_date: '2026-09-13',
        trx_type: 'incoming',
        app_id: 1,
        apps: { id: 1, name: 'NETFLIX' },
        amount: 45000,
        fee_qris: 315,
        net_amount: 44685,
        payment_method: 'QRIS',
        notes: 'Netflix 1 Profile Anti Limit',
        is_synced: true,
        created_at: '2026-09-13T13:40:00Z'
    },
    {
        id: 110,
        trx_date: '2026-09-12',
        trx_type: 'incoming',
        app_id: 2,
        apps: { id: 2, name: 'SPOTIFY' },
        amount: 50000,
        fee_qris: 0,
        net_amount: 50000,
        payment_method: 'BCA',
        notes: 'Spotify Family Head Admin',
        is_synced: true,
        created_at: '2026-09-12T17:10:00Z'
    },
    {
        id: 111,
        trx_date: '2026-09-11',
        trx_type: 'incoming',
        app_id: 7,
        apps: { id: 7, name: 'CAPCUT' },
        amount: 35000,
        fee_qris: 245,
        net_amount: 34755,
        payment_method: 'QRIS',
        notes: 'CapCut Pro 1 Bulan',
        is_synced: false,
        created_at: '2026-09-11T20:15:00Z'
    },
    {
        id: 112,
        trx_date: '2026-09-10',
        trx_type: 'outgoing',
        app_id: 2,
        apps: { id: 2, name: 'SPOTIFY' },
        amount: 100000,
        fee_qris: 0,
        net_amount: 100000,
        payment_method: 'TRANSFER',
        notes: 'Voucher Spotify Regional',
        is_synced: true,
        created_at: '2026-09-10T10:00:00Z'
    }
];

export function isRnfPreviewMode() {
    const p = new URLSearchParams(window.location.search).get('preview');
    return p === 'true' || p === '1';
}
