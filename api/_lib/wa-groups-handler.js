const { getWaSupabase } = require('./waSupabase');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('./response');

const { getTodayWIB, addDaysToWibDate, calcRenewalDaysWA } = require('./wibDate');

/**
 * /api/admin/wa-groups handler
 * Admin management API for WhatsApp Bot Rental Groups.
 * Auth: X-Admin-Secret header
 */

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    try {
        const supa = getWaSupabase();
        const action = req.query.action || req.body?.action;

        // ── GET Requests ────────────────────────────────────────────────────
        if (req.method === 'GET') {
            if (action === 'stats') {
                const today = getTodayWIB();
                const threeDaysLater = addDaysToDate(today, 3);

                // Run 4 parallel COUNT queries — no rows transferred, only numbers
                const [
                    { count: totalGroups,   error: totalErr },
                    { count: activeGroups,  error: activeErr },
                    { count: expiringSoon,  error: expiringErr },
                    { count: totalPayments, error: paysErr }
                ] = await Promise.all([
                    supa.from('managed_groups')
                        .select('id', { count: 'exact', head: true }),
                    supa.from('managed_groups')
                        .select('id', { count: 'exact', head: true })
                        .eq('is_active', true).gte('paid_until', today),
                    supa.from('managed_groups')
                        .select('id', { count: 'exact', head: true })
                        .eq('is_active', true).gte('paid_until', today).lte('paid_until', threeDaysLater),
                    supa.from('payments')
                        .select('id', { count: 'exact', head: true })
                        .eq('status', 'approved')
                ]);

                if (totalErr) throw totalErr;
                if (activeErr) throw activeErr;
                if (expiringErr) throw expiringErr;
                if (paysErr) throw paysErr;

                return success(res, {
                    stats: {
                        total_groups:   totalGroups   || 0,
                        active_groups:  activeGroups  || 0,
                        expiring_soon:  expiringSoon  || 0,
                        total_payments: totalPayments || 0
                    }
                });
            }

            // Default GET: List groups with only columns needed by the dashboard
            const { data: groups, error: listErr } = await supa
                .from('managed_groups')
                .select('id, store_group_id, target_group_id, group_name, renter_name, is_active, paid_until, joined_at')
                .order('id', { ascending: false });

            if (listErr) throw listErr;

            return success(res, { groups: groups || [] });
        }

        // ── PUT Requests ────────────────────────────────────────────────────
        if (req.method === 'PUT') {
            const { id, days, group_name, renter_name, is_active } = req.body || {};

            if (!id) return error(res, 'Group ID (id) is required');

            if (action === 'extend') {
                const { data: group, error: fetchErr } = await supa
                    .from('managed_groups')
                    .select('paid_until')
                    .eq('id', id)
                    .single();

                if (fetchErr || !group) return notFound(res, 'Group not found');

                const extendDays = parseInt(days, 10) || 31;
                const newPaidUntil = calcRenewalDaysWA(group.paid_until, extendDays);

                const { data: updated, error: updateErr } = await supa
                    .from('managed_groups')
                    .update({
                        paid_until: newPaidUntil,
                        is_active: true,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', id)
                    .select()
                    .single();

                if (updateErr) throw updateErr;

                return success(res, {
                    message: `Successfully extended rent until ${newPaidUntil}`,
                    group: updated
                });
            }

            if (action === 'edit') {
                if (!group_name || !renter_name) {
                    return error(res, 'group_name and renter_name are required');
                }

                const { data: updated, error: updateErr } = await supa
                    .from('managed_groups')
                    .update({
                        group_name,
                        renter_name,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', id)
                    .select()
                    .single();

                if (updateErr) throw updateErr;

                return success(res, {
                    message: 'Group details updated successfully',
                    group: updated
                });
            }

            if (action === 'toggle' || action === 'suspend' || action === 'activate') {
                const targetActive = action === 'activate' ? true : (action === 'suspend' ? false : Boolean(is_active));

                // Security Guard: Prevent unpausing/activating a group whose rent is already expired
                if (targetActive) {
                    const { data: group, error: fetchErr } = await supa
                        .from('managed_groups')
                        .select('paid_until, group_name')
                        .eq('id', id)
                        .single();

                    if (fetchErr || !group) return notFound(res, 'Group not found');

                    const today = getTodayWIB();
                    if (group.paid_until && group.paid_until < today) {
                        return error(res, `Grup "${group.group_name || id}" sudah kedaluwarsa (${group.paid_until}). Silakan perpanjang sewa (Extend Rent) terlebih dahulu.`, 400);
                    }
                }

                const { data: updated, error: updateErr } = await supa
                    .from('managed_groups')
                    .update({
                        is_active: targetActive,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', id)
                    .select()
                    .single();

                if (updateErr) throw updateErr;

                return success(res, {
                    message: `Group status changed to ${targetActive ? 'Active' : 'Inactive'}`,
                    group: updated
                });
            }

            return error(res, 'Invalid action specified');
        }

        // ── DELETE Requests ─────────────────────────────────────────────────
        if (req.method === 'DELETE') {
            const id = req.query.id || req.body?.id;
            if (!id) return error(res, 'Group ID (id) is required');

            const { error: delErr } = await supa
                .from('managed_groups')
                .delete()
                .eq('id', id);

            if (delErr) throw delErr;

            return success(res, { message: 'Managed group deleted successfully' });
        }

        return error(res, 'Method not allowed', 405);
    } catch (err) {
        console.error('[api/_lib/wa-groups-handler] Error:', err);
        return serverError(res, err.message || 'Internal server error');
    }
};
