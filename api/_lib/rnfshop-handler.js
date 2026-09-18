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
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    try {
        const supa = getRnfSupabase();
        const action = req.query.action || req.body?.action;

        // ── 1. GET Requests ───────────────────────────────────────────────────
        if (req.method === 'GET') {
            if (action === 'overview') {
                const { data: trxs, error: dbErr } = await supa
                    .from('transactions')
                    .select('id, trx_date, trx_type, amount, app_id, apps(id, name)');

                if (dbErr) throw dbErr;

                let totalIncoming = 0;
                let totalOutgoing = 0;
                const appIncomeMap = {};
                const appSalesCountMap = {};
                const dailyIncomeMap = {};
                const dailyOutgoingMap = {};

                (trxs || []).forEach(t => {
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
                        totalCount: (trxs || []).length,
                        appIncomeMap,
                        appSalesCountMap,
                        dailyIncomeMap,
                        dailyOutgoingMap,
                        recentTransactions: (trxs || []).slice(0, 6)
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
                query = query.order('trx_date', { ascending: false }).order('created_at', { ascending: false }).range(from, to);

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
                const { data, error: dbErr } = await supa
                    .from('apps')
                    .select('*')
                    .order('name', { ascending: true });

                if (dbErr) throw dbErr;
                return success(res, { apps: data || [] });
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
                        fee_qris: Number(fee_qris || 0),
                        net_amount: Number(net_amount || amount),
                        payment_method: payment_method || 'QRIS',
                        note: note || '',
                        is_synced: Boolean(is_synced)
                    }])
                    .select()
                    .single();

                if (dbErr) throw dbErr;
                return success(res, { message: 'Transaksi berhasil disimpan', transaction: data });
            }

            if (action === 'save_app') {
                const { id, name, icon_url, is_active } = req.body;
                if (!name) return error(res, 'Nama aplikasi wajib diisi', 400);

                if (id) {
                    const { data, error: dbErr } = await supa
                        .from('apps')
                        .update({
                            name: name.trim().toUpperCase(),
                            icon_url: icon_url || null,
                            is_active: is_active !== undefined ? is_active : true,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', id)
                        .select()
                        .single();

                    if (dbErr) throw dbErr;
                    return success(res, { message: 'Aplikasi berhasil diperbarui', app: data });
                } else {
                    const { data, error: dbErr } = await supa
                        .from('apps')
                        .insert([{
                            name: name.trim().toUpperCase(),
                            icon_url: icon_url || null,
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
                    fee_qris: Number(r.fee_qris || 0),
                    net_amount: Number(r.net_amount || r.amount || 0),
                    payment_method: r.payment_method || 'QRIS',
                    note: r.note || '',
                    is_synced: false
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
            const { id, trx_date, trx_type, app_id, customer_name, amount, fee_qris, net_amount, payment_method, note, is_synced } = req.body;
            if (!id) return error(res, 'Transaction ID is required', 400);

            const updatePayload = { updated_at: new Date().toISOString() };
            if (trx_date !== undefined) updatePayload.trx_date = trx_date;
            if (trx_type !== undefined) updatePayload.trx_type = trx_type;
            if (app_id !== undefined) updatePayload.app_id = app_id;
            if (customer_name !== undefined) updatePayload.customer_name = customer_name;
            if (amount !== undefined) updatePayload.amount = Number(amount);
            if (fee_qris !== undefined) updatePayload.fee_qris = Number(fee_qris);
            if (net_amount !== undefined) updatePayload.net_amount = Number(net_amount);
            if (payment_method !== undefined) updatePayload.payment_method = payment_method;
            if (note !== undefined) updatePayload.note = note;
            if (is_synced !== undefined) updatePayload.is_synced = is_synced;

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
            if (!id) return error(res, 'Transaction ID is required', 400);

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
