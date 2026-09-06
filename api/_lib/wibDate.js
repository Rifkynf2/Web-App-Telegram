/**
 * wibDate.js
 * Centralized lightweight Date & WIB Timezone Helper for RNF SaaS Web App.
 *
 * Guarantees:
 * 1. 100% Zero external dependencies (No moment, dayjs, or date-fns).
 * 2. O(1) Ephemeral memory consumption (GC friendly, zero memory spikes).
 * 3. Consistent ISO YYYY-MM-DD formatting via en-CA locale (cross-platform safe on Linux/Vercel).
 * 4. Exact alignment to 00:00:00 WIB (Asia/Jakarta) matching PostgreSQL process_renewal_payment RPC.
 */

// Singleton cached formatters (avoids recreating Intl objects repeatedly)
const wibDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

const wibTimeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
});

/**
 * Get current date in WIB as YYYY-MM-DD string
 * @returns {string} e.g. "2026-09-06"
 */
function getTodayWIB() {
    return wibDateFormatter.format(new Date());
}

/**
 * Convert any Date, ISO string, or timestamp to YYYY-MM-DD in WIB
 * @param {Date|string|number} dateInput 
 * @returns {string|null}
 */
function getCalendarDateWIB(dateInput = new Date()) {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    return wibDateFormatter.format(d);
}

/**
 * Calculate calendar days difference in Asia/Jakarta (WIB) timezone.
 * Returns:
 *   > 0 : Future (e.g. 3 = "3 days left")
 *   === 0 : Today is expiry day ("Expires today")
 *   < 0 : Overdue / Expired (e.g. -1 = "Minus 1 day")
 *
 * Matches diffCalendarDaysWIB in Telegram Bot and diffDaysDateOnly in WhatsApp Bot.
 * @param {Date|string|number} nowInput 
 * @param {Date|string|number} expiryInput 
 * @returns {number|null}
 */
function diffCalendarDaysWIB(nowInput, expiryInput) {
    if (!expiryInput) return null;
    const todayStr = getCalendarDateWIB(nowInput || new Date());
    const expiryStr = getCalendarDateWIB(expiryInput);
    if (!todayStr || !expiryStr) return null;

    const [ty, tm, td] = todayStr.split('-').map(Number);
    const [ey, em, ed] = expiryStr.split('-').map(Number);

    const todayUtc = Date.UTC(ty, tm - 1, td);
    const expiryUtc = Date.UTC(ey, em - 1, ed);

    return Math.round((expiryUtc - todayUtc) / (24 * 60 * 60 * 1000));
}

/**
 * Calculate new subscription expiry date aligned exactly to 00:00:00 WIB (Asia/Jakarta).
 *
 * Rules (identical to PostgreSQL RPC process_renewal_payment):
 * - Base date = GREATEST(currentExpiry, now)
 * - If base date has time past 00:00:00 WIB (e.g. mid-day renewal), add 1 bonus day so client gets
 *   full calendar days plus remaining bonus hours until next 00:00:00 WIB.
 * - Resulting ISO string always points to 00:00:00 WIB (which is 17:00:00Z UTC previous calendar day).
 *
 * @param {string|Date|null} currentExpiry 
 * @param {number} durationDays 
 * @returns {string} ISO string e.g. "2026-10-07T17:00:00.000Z" (which is 2026-10-08 00:00:00 WIB)
 */
function calcRenewalExpiryWIB(currentExpiry, durationDays = 31) {
    const now = new Date();
    let baseDate = now;

    if (currentExpiry) {
        const parsedCurrent = new Date(currentExpiry);
        if (!isNaN(parsedCurrent.getTime()) && parsedCurrent > now) {
            baseDate = parsedCurrent;
        }
    }

    const days = parseInt(durationDays, 10) || 31;
    const baseDateStr = wibDateFormatter.format(baseDate); // YYYY-MM-DD
    const baseTimeStr = wibTimeFormatter.format(baseDate); // HH:mm:ss

    // Round up 1 day if base date time is past 00:00:00 WIB
    const extraDay = baseTimeStr > '00:00:00' ? 1 : 0;
    const totalDays = days + extraDay;

    const [y, m, d] = baseDateStr.split('-').map(Number);
    // 00:00:00 WIB = 17:00:00 UTC previous day (UTC = WIB - 7 hours)
    const targetDate = new Date(Date.UTC(y, m - 1, d + totalDays, -7, 0, 0, 0));
    return targetDate.toISOString();
}

/**
 * Add calendar days to a YYYY-MM-DD date string in WIB
 * @param {string} dateStr 
 * @param {number} days 
 * @returns {string} YYYY-MM-DD
 */
function addDaysToWibDate(dateStr, days) {
    if (!dateStr) return getTodayWIB();
    const clean = String(dateStr).split('T')[0];
    const [y, m, d] = clean.split('-').map(Number);
    if (!y || !m || !d) return getTodayWIB();

    const dt = new Date(Date.UTC(y, m - 1, d + Number(days)));
    const ry = dt.getUTCFullYear();
    const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const rd = String(dt.getUTCDate()).padStart(2, '0');
    return `${ry}-${rm}-${rd}`;
}

/**
 * Calculate next paid_until for WhatsApp Groups (YYYY-MM-DD)
 * If currentPaidUntil > today: extend from currentPaidUntil
 * Else (expired or null): extend from today
 * @param {string|null} currentPaidUntil 
 * @param {number} days 
 * @returns {string} YYYY-MM-DD
 */
function calcRenewalDaysWA(currentPaidUntil, days = 31) {
    const today = getTodayWIB();
    const extendDays = parseInt(days, 10) || 31;
    if (currentPaidUntil && currentPaidUntil > today) {
        return addDaysToWibDate(currentPaidUntil, extendDays);
    }
    return addDaysToWibDate(today, extendDays);
}

/**
 * Format date for Indonesian display with WIB time
 * e.g. "16 September 2026 pukul 00:00 WIB"
 * @param {Date|string|number} dateInput 
 * @returns {string}
 */
function formatDisplayDateWIB(dateInput) {
    if (!dateInput) return '-';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';

    const formattedDate = d.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const timeStr = d.toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace('.', ':');

    return `${formattedDate} pukul ${timeStr} WIB`;
}

module.exports = {
    getTodayWIB,
    getCalendarDateWIB,
    diffCalendarDaysWIB,
    calcRenewalExpiryWIB,
    addDaysToWibDate,
    addDaysToDate: addDaysToWibDate,
    calcRenewalDaysWA,
    formatDisplayDateWIB
};
