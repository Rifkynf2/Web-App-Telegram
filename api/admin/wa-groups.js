const { getWaSupabase } = require('../_lib/waSupabase');
const { success, error, unauthorized, notFound, serverError, handleCors } = require('../_lib/response');

/**
 * /api/admin/wa-groups
 * Admin management API for WhatsApp Bot Rental Groups.
 * Auth: X-Admin-Secret header
 */

function getTodayWIB() {
    const now = new Date();
    const dateStr = now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
    const [dd, mm, yyyy] = dateStr.split("/");
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function addDaysToDate(dateStr, days) {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + Number(days));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function calcRenewalDays(currentPaidUntil, days = 31) {
    const today = getTodayWIB();
    if (currentPaidUntil && currentPaidUntil > today) {
        return addDaysToDate(currentPaidUntil, days);
    }
    return addDaysToDate(today, days);
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const adminSecret = req.headers['x-admin-secret'];
    if (!adminSecret || adminSecret !== process.env.ADMIN_DASHBOARD_SECRET) {
        return unauthorized(res, 'Invalid admin secret');
    }

    try {
        const supa = getWaSupabase();
        const action = req.query.action || req.body?.action;

        // ── GET Requests ────────────────────────────────────────────────────
        if (req.method === 'GET') {
            if (action === 'stats') {
                const today = getTodayWIB();
                const threeDaysLater = addDaysToDate(today, 3);

                const { data: groups, error: groupsErr } = await supa
                    .from('managed_groups')
                    .select('id, is_active, paid_until');

                if (groupsErr) throw groupsErr;

                const totalGroups = groups ? groups.length : 0;
                let activeGroups = 0;
                let expiringSoon = 0;

                for (const g of (groups || [])) {
                    if (g.is_active && g.paid_until && g.paid_until >= today) {
                        activeGroups++;
                        if (g.paid_until <= threeDaysLater) {
                            expiringSoon++;
                        }
                    }
                }

                const { count: totalPayments, error: paysErr } = await supa
                    .from('payments')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'approved');

                if (paysErr) throw paysErr;

                return success(res, {
                    stats: {
                        total_groups: totalGroups,
                        active_groups: activeGroups,
                        expiring_soon: expiringSoon,
                        total_payments: totalPayments || 0
                    }
                });
            }

            // Default GET: List all groups
            const { data: groups, error: listErr } = await supa
                .from('managed_groups')
                .select('*')
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
                const newPaidUntil = calcRenewalDays(group.paid_until, extendDays);

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
        console.error('[api/admin/wa-groups] Error:', err);
        return serverError(res, err.message || 'Internal server error');
    }
};
