const { getMasterSupabase } = require('../../_lib/masterSupabase');
const { verifyHMAC } = require('../../_lib/hmacAuth');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('../../_lib/response');

/**
 * POST /api/tenant/subscription/update-qris-info
 * 
 * Called by tenant bot after sending QRIS photo to admin.
 * Saves the Telegram chat_id and message_id to the rental invoice
 * so the centralized webhook can delete the QRIS message after payment.
 * 
 * Auth: HMAC-SHA256 signature
 * Body: { invoice_id, qris_chat_id, qris_message_id }
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
    const { invoice_id, qris_chat_id, qris_message_id } = req.body;

    if (!invoice_id) {
        return error(res, 'invoice_id is required');
    }

    if (!qris_chat_id || !qris_message_id) {
        return error(res, 'qris_chat_id and qris_message_id are required');
    }

    try {
        const masterDb = getMasterSupabase();

        // Verify invoice belongs to this bot (security check)
        const { data: inv, error: invErr } = await masterDb
            .from('rental_invoices')
            .select('id, bot_id')
            .eq('id', invoice_id)
            .single();

        if (invErr || !inv) {
            return notFound(res, 'Invoice not found');
        }

        if (inv.bot_id !== botId) {
            return error(res, 'Invoice does not belong to this bot', 403);
        }

        // Update QRIS info
        const { error: updateErr } = await masterDb
            .from('rental_invoices')
            .update({
                qris_chat_id: parseInt(qris_chat_id),
                qris_message_id: parseInt(qris_message_id),
            })
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
};
