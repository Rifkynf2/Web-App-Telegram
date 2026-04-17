const { getMasterSupabase } = require('../../_lib/masterSupabase');
const { verifyHMAC } = require('../../_lib/hmacAuth');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('../../_lib/response');

/**
 * POST /api/tenant/subscription/confirm-payment
 * 
 * Dipanggil oleh bot setelah menerima webhook Pakasir yang sudah diverifikasi.
 * Mengupdate invoice status dan memperpanjang subscription.
 * 
 * Auth: HMAC-SHA256 signature
 * Body: { invoice_id, amount }
 */
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return error(res, 'Method not allowed', 405);
    }

    // Verify HMAC
    const body = JSON.stringify(req.body || {});
    const auth = verifyHMAC(req.headers, body);
    if (!auth.valid) {
        return unauthorized(res, auth.error);
    }

    const botId = parseInt(auth.botId);
    const { invoice_id, amount } = req.body;

    if (!invoice_id) {
        return error(res, 'invoice_id is required');
    }

    try {
        const masterDb = getMasterSupabase();

        // 1. Find invoice
        const { data: inv, error: invError } = await masterDb
            .from('rental_invoices')
            .select('*, tenants(owner_chat_id, shop_name)')
            .eq('id', invoice_id)
            .single();

        if (invError || !inv) {
            return notFound(res, 'Invoice not found');
        }

        // Check invoice belongs to this bot
        if (inv.bot_id !== botId) {
            return error(res, 'Invoice does not belong to this bot', 403);
        }

        if (inv.status === 'PAID') {
            return success(res, { 
                message: 'Already processed',
                owner_chat_id: inv.tenants?.owner_chat_id,
                new_expiry: null
            });
        }

        // 2. Get current subscription to calculate new expiry
        const { data: currentSub } = await masterDb
            .from('subscriptions')
            .select('expiry_date')
            .eq('bot_id', botId)
            .order('expiry_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Get plan duration (default 31 days)
        let durationDays = 31;
        if (inv.plan_id) {
            const { data: plan } = await masterDb
                .from('plans')
                .select('duration_days')
                .eq('id', inv.plan_id)
                .single();
            if (plan) durationDays = plan.duration_days;
        }

        let baseDate = new Date();
        if (currentSub && new Date(currentSub.expiry_date) > baseDate) {
            baseDate = new Date(currentSub.expiry_date);
        }

        const newExpiry = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

        // 3. Update invoice
        await masterDb.from('rental_invoices').update({
            status: 'PAID',
            paid_at: new Date().toISOString()
        }).eq('id', invoice_id);

        // 4. Update subscription
        const { data: plan } = inv.plan_id 
            ? await masterDb.from('plans').select('id').eq('id', inv.plan_id).single()
            : { data: null };

        await masterDb.from('subscriptions').upsert({
            bot_id: botId,
            plan_id: inv.plan_id || plan?.id || null,
            expiry_date: newExpiry.toISOString(),
            status: 'ACTIVE',
            last_payment_at: new Date().toISOString()
        }, { onConflict: 'bot_id' });

        // 5. Activate tenant
        await masterDb.from('tenants').update({
            status: 'ACTIVE'
        }).eq('bot_id', botId);

        // 6. Audit log
        await masterDb.from('audit_logs').insert({
            bot_id: botId,
            actor: 'system',
            action: 'PAYMENT_CONFIRMED',
            entity: 'rental_invoices',
            entity_id: invoice_id,
            detail: { 
                amount: amount || inv.amount, 
                new_expiry: newExpiry.toISOString(),
                duration_days: durationDays
            }
        });

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
};
