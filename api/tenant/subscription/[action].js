const { getMasterSupabase } = require('../../_lib/masterSupabase');
const { verifyHMAC } = require('../../_lib/hmacAuth');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('../../_lib/response');

/**
 * /api/tenant/subscription/[action]
 * Consolidated subscription sub-route handler.
 *
 * Handles: confirm-payment, update-qris-info
 * Auth: HMAC-SHA256 signature
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

    const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

    switch (action) {
        case 'confirm-payment':  return handleConfirmPayment(req, res);
        case 'update-qris-info': return handleUpdateQrisInfo(req, res);
        default:                 return error(res, `Unknown action: ${action}`, 404);
    }
};

// ── CONFIRM PAYMENT ───────────────────────────────────────────────────────────

async function handleConfirmPayment(req, res) {
    const body = JSON.stringify(req.body || {});
    const auth = verifyHMAC(req.headers, body);
    if (!auth.valid) return unauthorized(res, auth.error);

    const botId = parseInt(auth.botId);
    const { invoice_id, amount } = req.body;
    if (!invoice_id) return error(res, 'invoice_id is required');

    try {
        const masterDb = getMasterSupabase();

        const { data: inv, error: invError } = await masterDb
            .from('rental_invoices').select('*, tenants(owner_chat_id, shop_name)')
            .eq('id', invoice_id).single();

        if (invError || !inv) return notFound(res, 'Invoice not found');
        if (inv.bot_id !== botId) return error(res, 'Invoice does not belong to this bot', 403);

        if (inv.status === 'PAID') {
            return success(res, { message: 'Already processed', owner_chat_id: inv.tenants?.owner_chat_id, new_expiry: null });
        }

        // Resolve plan duration
        let durationDays = 31;
        if (inv.plan_id) {
            const { data: plan } = await masterDb.from('plans').select('duration_days').eq('id', inv.plan_id).single();
            if (plan) durationDays = plan.duration_days;
        }

        const { data: currentSub } = await masterDb
            .from('subscriptions').select('expiry_date').eq('bot_id', botId)
            .order('expiry_date', { ascending: false }).limit(1).maybeSingle();

        let baseDate = new Date();
        if (currentSub && new Date(currentSub.expiry_date) > baseDate) baseDate = new Date(currentSub.expiry_date);
        const newExpiry = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

        await masterDb.from('rental_invoices').update({ status: 'PAID', paid_at: new Date().toISOString() }).eq('id', invoice_id);

        await masterDb.from('subscriptions').upsert({
            bot_id: botId, plan_id: inv.plan_id || null,
            expiry_date: newExpiry.toISOString(), status: 'ACTIVE',
            last_payment_at: new Date().toISOString()
        }, { onConflict: 'bot_id' });

        await masterDb.from('tenants').update({ status: 'ACTIVE' }).eq('bot_id', botId);

        return success(res, {
            message: 'Payment confirmed and subscription extended',
            owner_chat_id: inv.tenants?.owner_chat_id,
            new_expiry: newExpiry.toISOString(),
            days: durationDays
        });
    } catch (err) {
        console.error('[API/confirm-payment] Error:', err.message);
        return serverError(res);
    }
}

// ── UPDATE QRIS INFO ──────────────────────────────────────────────────────────

async function handleUpdateQrisInfo(req, res) {
    const body = JSON.stringify(req.body || {});
    const auth = verifyHMAC(req.headers, body);
    if (!auth.valid) return unauthorized(res, auth.error);

    const botId = parseInt(auth.botId);
    const { invoice_id, qris_chat_id, qris_message_id } = req.body;

    if (!invoice_id) return error(res, 'invoice_id is required');
    if (!qris_chat_id || !qris_message_id) return error(res, 'qris_chat_id and qris_message_id are required');

    try {
        const masterDb = getMasterSupabase();

        const { data: inv, error: invErr } = await masterDb
            .from('rental_invoices').select('id, bot_id').eq('id', invoice_id).single();

        if (invErr || !inv) return notFound(res, 'Invoice not found');
        if (inv.bot_id !== botId) return error(res, 'Invoice does not belong to this bot', 403);

        const { error: updateErr } = await masterDb
            .from('rental_invoices')
            .update({ qris_chat_id: parseInt(qris_chat_id), qris_message_id: parseInt(qris_message_id) })
            .eq('id', invoice_id);

        if (updateErr) {
            console.error('[API/update-qris-info] Update failed:', updateErr.message);
            return serverError(res, 'Failed to update QRIS info');
        }

        return success(res, { message: 'QRIS info saved' });
    } catch (err) {
        console.error('[API/update-qris-info] Error:', err.message);
        return serverError(res);
    }
}
