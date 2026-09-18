const { getRnfSupabase } = require('./rnfSupabase');
const { success, error, serverError, handleCors } = require('./response');

/**
 * /api/admin/rnfshop handler
 * Secure backend API gateway for RNF Shop finance and product management.
 * Protected by X-Admin-Secret header.
 * 
 * Supports:
 * - GET overview
 * - GET transactions
 * - POST add_transaction
 * - PUT update_transaction
 * - DELETE delete_transaction
 * - GET apps
 * - POST save_app
 * - POST import_batch
/**
 * Helper to fetch all rows in chunks of batchSize to safely bypass PostgREST max_rows limit.
 * Very lightweight and memory-efficient as callers only project required columns.
 */
async function fetchAllRows(queryBuilder, batchSize = 1000) {
    const all = [];
    let from = 0;
    while (true) {
        const { data, error } = await queryBuilder.range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < batchSize) break;
        from += batchSize;
    }
    return all;
}

/**
 * /api/admin/rnfshop handler
 * Secure backend API gateway for RNF Shop finance and product management.
 * Protected by X-Admin-Secret header.
 * 
 * Supports:
 * - GET overview
 * - GET transactions
 * - POST add_transaction
 * - PUT update_transaction
 * - DELETE delete_transaction
 * - GET apps
 * - POST save_app
 * - POST import_batch
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    try {
        const supa = getRnfSupabase();
        let action = req.query.action || req.body?.action || '';

        // Defensive: if action contains '?' (e.g. "overview?startDate=2026-09-01"), split it
        if (typeof action === 'string' && action.includes('?')) {
            const [cleanAction, qs] = action.split('?');
            action = cleanAction;
            const parsed = new URLSearchParams(qs);
            parsed.forEach((v, k) => {
                if (!req.query[k]) req.query[k] = v;
            });
        }

        // ── 1. GET Requests ───────────────────────────────────────────────────
        if (req.method === 'GET') {
            if (action === 'overview') {
                const startDate = req.query.startDate;
                const endDate = req.query.endDate;
                const trxType = req.query.trx_type || req.query.type;

                let query = supa
                    .from('transactions')
                    .select('id, trx_date, trx_type, amount, app_id, apps(id, name)');

                if (trxType && trxType !== 'all') {
                    query = query.eq('trx_type', trxType);
                }
                if (startDate) {
                    query = query.gte('trx_date', startDate);
                }
                if (endDate) {
                    query = query.lte('trx_date', endDate);
                }

                query = query.order('trx_date', { ascending: false });

                // Stream all rows in chunks of 1000 to bypass Supabase 1000 rows limit safely
                const trxs = await fetchAllRows(query);

                let totalIncoming = 0;
                let totalOutgoing = 0;
                const appIncomeMap = {};
                const appSalesCountMap = {};
                const dailyIncomeMap = {};
                const dailyOutgoingMap = {};

                trxs.forEach(t => {
                    const amt = Number(t.amount || 0);
                    const appName = t.apps?.name || 'Lainnya';
                    const dateStr = t.trx_date || 'Unknown';

                    if (t.trx_type === 'incoming') {
                        totalIncoming += amt;
                        appIncomeMap[appName] = (appIncomeMap[appName] || 0) + amt;
                        appSalesCountMap[appName] = (appSalesCountMap[appName] || 0) + 1;
                        dailyIncomeMap[dateStr] = (dailyIncomeMap[dateStr] || 0) + amt;
                    } else {
                        totalOutgoing += amt;
                        dailyOutgoingMap[dateStr] = (dailyOutgoingMap[dateStr] || 0) + amt;
                    }
                });

                return success(res, {
                    stats: {
                        totalIncoming,
                        totalOutgoing,
                        netProfit: totalIncoming - totalOutgoing,
                        totalCount: trxs.length,
                        appIncomeMap,
                        appSalesCountMap,
                        dailyIncomeMap,
                        dailyOutgoingMap,
                        recentTransactions: trxs.slice(0, 6)
                    }
                });
            }

            if (action === 'transactions') {
                const page = Math.max(1, parseInt(req.query.page, 10) || 1);
                const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize, 10) || 25));
                const trxType = req.query.trx_type;
                const appId = req.query.app_id;
                const startDate = req.query.startDate;
                const endDate = req.query.endDate;
                const search = (req.query.search || '').trim();

                let query = supa
                    .from('transactions')
                    .select('*, apps(id, name)', { count: 'exact' });

                if (trxType && trxType !== 'all') {
                    query = query.eq('trx_type', trxType);
                }
                if (appId && appId !== 'all') {
                    query = query.eq('app_id', appId);
                }
                if (startDate) {
                    query = query.gte('trx_date', startDate);
                }
                if (endDate) {
                    query = query.lte('trx_date', endDate);
                }
                if (search) {
                    query = query.or(`customer_name.ilike.%${search}%,note.ilike.%${search}%`);
                }

                const from = (page - 1) * pageSize;
                const to = from + pageSize - 1;

                const sortBy = req.query.sortBy || 'date_desc';
                if (sortBy === 'date_asc') {
                    query = query.order('trx_date', { ascending: true }).order('created_at', { ascending: true });
                } else if (sortBy === 'amount_desc') {
                    query = query.order('amount', { ascending: false }).order('trx_date', { ascending: false });
                } else if (sortBy === 'amount_asc') {
                    query = query.order('amount', { ascending: true }).order('trx_date', { ascending: false });
                } else {
                    query = query.order('trx_date', { ascending: false }).order('created_at', { ascending: false });
                }
                query = query.range(from, to);

                const { data, count, error: dbErr } = await query;
                if (dbErr) throw dbErr;

                return success(res, {
                    transactions: data || [],
                    count: count || 0,
                    page,
                    pageSize
                });
            }

            if (action === 'apps') {
                const appsQuery = supa
                    .from('apps')
                    .select('*')
                    .order('name', { ascending: true });

                const appsData = await fetchAllRows(appsQuery);

                // Fetch incoming transactions count per app without 1000 row cutoff
                const incomingQuery = supa
                    .from('transactions')
                    .select('app_id')
                    .eq('trx_type', 'incoming');

                const incomingTrxs = await fetchAllRows(incomingQuery);

                const salesCountMap = {};
                incomingTrxs.forEach(t => {
                    if (t.app_id) {
                        salesCountMap[t.app_id] = (salesCountMap[t.app_id] || 0) + 1;
                    }
                });

                const appsWithSold = appsData.map(a => ({
                    ...a,
                    sold_count: salesCountMap[a.id] || 0
                }));

                return success(res, { apps: appsWithSold });
            }

            return error(res, `Unknown GET action: ${action}`, 400);
        }

        // ── 2. POST Requests ──────────────────────────────────────────────────
        if (req.method === 'POST') {
            if (action === 'add_transaction') {
                const { trx_date, trx_type, app_id, customer_name, amount, fee_qris, net_amount, payment_method, note, is_synced } = req.body;
                if (!trx_date || !trx_type || !app_id || amount === undefined) {
                    return error(res, 'Missing required transaction fields', 400);
                }

                const { data, error: dbErr } = await supa
                    .from('transactions')
                    .insert([{
                        trx_date,
                        trx_type,
                        app_id,
                        customer_name: customer_name || '',
                        amount: Number(amount),
                        note: note || ''
                    }])
                    .select()
                    .single();

                if (dbErr) throw dbErr;
                return success(res, { message: 'Transaksi berhasil disimpan', transaction: data });
            }

            if (action === 'save_app') {
                const { id, name, is_active } = req.body;

                if (id) {
                    const updatePayload = {
                        updated_at: new Date().toISOString()
                    };
                    if (name) updatePayload.name = name.trim().toUpperCase();
                    if (is_active !== undefined) updatePayload.is_active = is_active;

                    const { data, error: dbErr } = await supa
                        .from('apps')
                        .update(updatePayload)
                        .eq('id', id)
                        .select()
                        .single();

                    if (dbErr) throw dbErr;
                    return success(res, { message: 'Aplikasi berhasil diperbarui', app: data });
                } else {
                    if (!name || !name.trim()) return error(res, 'Nama aplikasi wajib diisi', 400);

                    const { data, error: dbErr } = await supa
                        .from('apps')
                        .insert([{
                            name: name.trim().toUpperCase(),
                            is_active: is_active !== undefined ? is_active : true
                        }])
                        .select()
                        .single();

                    if (dbErr) throw dbErr;
                    return success(res, { message: 'Aplikasi berhasil ditambahkan', app: data });
                }
            }

            if (action === 'import_batch') {
                const { rows } = req.body;
                if (!Array.isArray(rows) || rows.length === 0) {
                    return error(res, 'Rows array required for import_batch', 400);
                }

                const insertPayload = rows.map(r => ({
                    trx_date: r.trx_date,
                    trx_type: r.trx_type || 'incoming',
                    app_id: r.app_id,
                    customer_name: r.customer_name || '',
                    amount: Number(r.amount || 0),
                    note: r.note || ''
                }));

                const { data, error: dbErr } = await supa
                    .from('transactions')
                    .insert(insertPayload)
                    .select();

                if (dbErr) throw dbErr;
                return success(res, { message: `Berhasil mengimpor ${data.length} transaksi`, inserted: data.length });
            }

            return error(res, `Unknown POST action: ${action}`, 400);
        }

        // ── 3. PUT Requests ───────────────────────────────────────────────────
        if (req.method === 'PUT') {
            const { id, trx_date, trx_type, app_id, customer_name, amount, note } = req.body;
            if (!id) return error(res, 'Transaction ID is required', 400);

            const updatePayload = { updated_at: new Date().toISOString() };
            if (trx_date !== undefined) updatePayload.trx_date = trx_date;
            if (trx_type !== undefined) updatePayload.trx_type = trx_type;
            if (app_id !== undefined) updatePayload.app_id = app_id;
            if (customer_name !== undefined) updatePayload.customer_name = customer_name;
            if (amount !== undefined) updatePayload.amount = Number(amount);
            if (note !== undefined) updatePayload.note = note;

            const { data, error: dbErr } = await supa
                .from('transactions')
                .update(updatePayload)
                .eq('id', id)
                .select()
                .single();

            if (dbErr) throw dbErr;
            return success(res, { message: 'Transaksi berhasil diupdate', transaction: data });
        }

        // ── 4. DELETE Requests ────────────────────────────────────────────────
        if (req.method === 'DELETE') {
            const id = req.query.id || req.body?.id;
            if (!id) return error(res, 'ID is required', 400);

            if (action === 'save_app' || action === 'delete_app') {
                const { error: dbErr } = await supa
                    .from('apps')
                    .delete()
                    .eq('id', id);

                if (dbErr) throw dbErr;
                return success(res, { message: 'Aplikasi berhasil dihapus' });
            }

            const { error: dbErr } = await supa
                .from('transactions')
                .delete()
                .eq('id', id);

            if (dbErr) throw dbErr;
            return success(res, { message: 'Transaksi berhasil dihapus' });
        }

        return error(res, `Method ${req.method} not allowed`, 405);

    } catch (err) {
        console.error('[API/admin/rnfshop] Error:', err);
        return serverError(res, err.message);
    }
};
