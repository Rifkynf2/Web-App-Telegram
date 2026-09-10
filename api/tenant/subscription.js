const { getMasterSupabase } = require('../_lib/masterSupabase');
const { verifyHMAC } = require('../_lib/hmacAuth');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('../_lib/response');
const { diffCalendarDaysWIB } = require('../_lib/wibDate');

/**
 * /api/tenant/subscription
 * 
 * GET  — Ambil detail subscription (untuk fitur "Cek Sewa")
 * POST — Buat invoice perpanjang sewa (untuk fitur "Perpanjang Sewa")
 * 
 * Auth: HMAC-SHA256 signature
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method === 'GET') {
        return getSubscription(req, res);
    } else if (req.method === 'POST') {
        return createRenewalInvoice(req, res);
    }

    return error(res, 'Method not allowed', 405);
};

/**
 * GET /api/tenant/subscription
 * Cek detail sewa aktif
 */
async function getSubscription(req, res) {
    // For GET, body is empty, use query params for HMAC
    const body = '';
    const auth = verifyHMAC(req.headers, body);
    if (!auth.valid) return unauthorized(res, auth.error);

    const botId = auth.botId;

    try {
        const masterDb = getMasterSupabase();

        // 1-Turn Relational Query: fetch subscription, joined plans, and joined tenant in ONE round-trip!
        // Run rental_invoices in parallel via Promise.all (zero blocking)
        const [subResult, invResult] = await Promise.all([
            masterDb
                .from('subscriptions')
                .select(`
                    id, bot_id, start_date, expiry_date, status, 
                    last_payment_at, is_auto_off,
                    plans(name, price, duration_days, features),
                    tenants(username, shop_name, status, created_at)
                `)
                .eq('bot_id', botId)
                .order('expiry_date', { ascending: false })
                .limit(1)
                .maybeSingle(),
            masterDb
                .from('rental_invoices')
                .select('id, amount, status, created_at, paid_at')
                .eq('bot_id', botId)
                .order('created_at', { ascending: false })
                .limit(5)
        ]);

        const { data: sub, error: subErr } = subResult;
        const { data: invoices } = invResult;

        if (subErr) {
            console.error('[API/subscription] DB error:', subErr.message);
            return serverError(res);
        }

        if (!sub) {
            return notFound(res, 'Subscription not found');
        }

        // Extract joined tenant info
        const tenant = sub.tenants || null;

        // Calculate remaining days via WIB calendar difference
        const now = new Date();
        const expiry = new Date(sub.expiry_date);
        const diffDays = diffCalendarDaysWIB(now, sub.expiry_date);
        const remainingDays = diffDays !== null && diffDays > 0 ? diffDays : 0;
        const isTimeExpired = now >= expiry;
        const isActive = !isTimeExpired && tenant?.status === 'ACTIVE';

        // Auto-sync status if expired but tenant status or subscription is still ACTIVE in DB (Zero-waste lazy update)
        if (isTimeExpired && (tenant?.status === 'ACTIVE' || sub?.status === 'ACTIVE')) {
            masterDb.from('tenants').update({ status: 'EXPIRED' }).eq('bot_id', botId).then(() => {}).catch(() => {});
            masterDb.from('subscriptions').update({ status: 'EXPIRED' }).eq('bot_id', botId).then(() => {}).catch(() => {});
            if (tenant) tenant.status = 'EXPIRED';
            if (sub) sub.status = 'EXPIRED';
        }

        // (Invoices fetched concurrently in Promise.all above)

        return success(res, {
            subscription: {
                id: sub.id,
                status: isActive ? 'ACTIVE' : (isTimeExpired ? 'EXPIRED' : sub.status),
                startDate: sub.start_date,
                expiryDate: sub.expiry_date,
                remainingDays,
                plan: sub.plans || { name: 'Unknown' },
                lastPaymentAt: sub.last_payment_at,
                isAutoOff: sub.is_auto_off,
            },
            tenant: tenant || {},
            recentInvoices: invoices || []
        });
    } catch (err) {
        console.error('[API/subscription] Error:', err.message);
        return serverError(res);
    }
}

/**
 * POST /api/tenant/subscription
 * Buat invoice perpanjang sewa
 * 
 * Body: { plan_name?: string, amount?: number }
 * Default: Premium plan
 */
async function createRenewalInvoice(req, res) {
    const body = JSON.stringify(req.body || {});
    const auth = verifyHMAC(req.headers, body);
    if (!auth.valid) return unauthorized(res, auth.error);

    const botId = parseInt(auth.botId);

    try {
        const masterDb = getMasterSupabase();

        // 1. Get plan (default: Premium)
        const planName = req.body.plan_name || 'Premium';
        const { data: plan } = await masterDb
            .from('plans')
            .select('id, name, price, duration_days')
            .eq('name', planName)
            .eq('is_active', true)
            .single();

        const amount = req.body.amount || plan?.price || 10000;

        // 2. Check tenant exists
        const { data: tenant } = await masterDb
            .from('tenants')
            .select('bot_id, username, shop_name')
            .eq('bot_id', botId)
            .single();

        if (!tenant) {
            return notFound(res, 'Tenant not found. Register first.');
        }

        // 3. Check for existing pending invoice (prevent duplicates)
        const { data: pendingInvoice } = await masterDb
            .from('rental_invoices')
            .select('id, amount, created_at')
            .eq('bot_id', botId)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (pendingInvoice) {
            // Check if pending invoice is less than 10 minutes old
            const age = Date.now() - new Date(pendingInvoice.created_at).getTime();
            if (age < 10 * 60 * 1000) {
                return success(res, {
                    invoice: pendingInvoice,
                    message: 'Existing pending invoice found',
                    isExisting: true
                });
            }
            // Expire old pending invoice
            await masterDb.from('rental_invoices')
                .update({ status: 'EXPIRED' })
                .eq('id', pendingInvoice.id);
        }

        // 4. Create new invoice
        const { data: invoice, error: invErr } = await masterDb
            .from('rental_invoices')
            .insert({
                bot_id: botId,
                plan_id: plan?.id || null,
                amount,
                status: 'PENDING'
            })
            .select()
            .single();

        if (invErr) {
            console.error('[API/subscription] Invoice creation failed:', invErr.message);
            return serverError(res, 'Failed to create invoice');
        }


        return success(res, {
            invoice,
            plan: plan || { name: planName, price: amount, duration_days: 31 },
            message: 'Invoice created successfully'
        }, 201);
    } catch (err) {
        console.error('[API/subscription] Error:', err.message);
        return serverError(res);
    }
}
