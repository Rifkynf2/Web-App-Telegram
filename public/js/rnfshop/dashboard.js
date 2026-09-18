// public/js/rnfshop/dashboard.js
import { rnfFetch } from './apiClient.js';
import { formatRupiah, formatDateID, renderAppLogo, escAttr } from './utils.js';
import { MOCK_TRANSACTIONS, isRnfPreviewMode } from './mockData.js';

let chartInstanceTrend = null;
let chartInstanceApps = null;
let isUpdatingFromDateInput = false;

// ── In-Memory Cache for Overview Filters (Instant 0ms switching) ──────────────
const overviewCache = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds TTL

export function invalidateOverviewCache() {
    overviewCache.clear();
}

function getStartDate(range) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);

    switch (range) {
        case "today":
            break;
        case "week":
            d.setDate(d.getDate() - 7);
            break;
        case "month":
            d.setDate(1);
            break;
        case "2months":
            d.setMonth(d.getMonth() - 2);
            d.setDate(1);
            break;
        case "6months":
            d.setMonth(d.getMonth() - 6);
            d.setDate(1);
            break;
        case "1year":
            d.setFullYear(d.getFullYear() - 1);
            d.setMonth(0);
            d.setDate(1);
            break;
        default:
            return null;
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export async function loadDashboardOverview(forceRefresh = false) {
    const typeFilter = document.getElementById('chart-type-filter')?.value || 'all';
    const periodSelect = document.getElementById('chart-filter')?.value || 'month';
    const dateFromInput = document.getElementById('date-from')?.value || '';
    const dateToInput = document.getElementById('date-to')?.value || '';

    let totalIncoming = 0;
    let totalOutgoing = 0;
    let netProfit = 0;
    let totalCount = 0;
    let appIncomeMap = {};
    let dailyIncomeMap = {};
    let dailyOutgoingMap = {};
    let recentTransactions = [];
    let appSalesCountMap = {};

    // Calculate effective start and end dates
    let effectiveStartDate = dateFromInput || getStartDate(periodSelect);
    let effectiveEndDate = dateToInput || '';

    function isInFilter(t) {
        // Type filter
        if (typeFilter !== 'all' && t.trx_type !== typeFilter) {
            return false;
        }

        const dateStr = t.trx_date;
        if (!dateStr) return false;

        if (effectiveStartDate && dateStr < effectiveStartDate) {
            return false;
        }
        if (effectiveEndDate && dateStr > effectiveEndDate) {
            return false;
        }

        return true;
    }

    if (isRnfPreviewMode()) {
        console.log('[RNFSHOP] Preview mode — loading mock transactions for dashboard');
        const filtered = MOCK_TRANSACTIONS.filter(isInFilter);

        filtered.forEach(t => {
            const amt = Number(t.amount || 0);
            const appName = t.apps?.name || t.app_name || 'Lainnya';
            const dateStr = t.trx_date || 'Unknown';

            if (t.trx_type === 'incoming') {
                totalIncoming += amt;
                appIncomeMap[appName] = (appIncomeMap[appName] || 0) + amt;
                dailyIncomeMap[dateStr] = (dailyIncomeMap[dateStr] || 0) + amt;
            } else {
                totalOutgoing += amt;
                dailyOutgoingMap[dateStr] = (dailyOutgoingMap[dateStr] || 0) + amt;
            }
        });
        netProfit = totalIncoming - totalOutgoing;
        totalCount = filtered.length;

        // Recent: sort by date desc, take 6
        recentTransactions = [...MOCK_TRANSACTIONS]
            .filter(t => typeFilter === 'all' || t.trx_type === typeFilter)
            .sort((a, b) => (b.trx_date || '').localeCompare(a.trx_date || ''))
            .slice(0, 6);
    } else {
        const cacheKey = `${typeFilter}_${effectiveStartDate || ''}_${effectiveEndDate || ''}`;
        const cached = overviewCache.get(cacheKey);

        if (!forceRefresh && cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
            const stats = cached.stats || {};
            totalIncoming = stats.totalIncoming || 0;
            totalOutgoing = stats.totalOutgoing || 0;
            netProfit = stats.netProfit || (totalIncoming - totalOutgoing);
            totalCount = stats.totalCount || 0;
            appIncomeMap = stats.appIncomeMap || {};
            appSalesCountMap = stats.appSalesCountMap || {};
            dailyIncomeMap = stats.dailyIncomeMap || {};
            dailyOutgoingMap = stats.dailyOutgoingMap || {};
            recentTransactions = stats.recentTransactions || [];
        } else {
            try {
                const filterParams = {};
                if (typeFilter !== 'all') filterParams.type = typeFilter;
                if (effectiveStartDate) filterParams.startDate = effectiveStartDate;
                if (effectiveEndDate) filterParams.endDate = effectiveEndDate;

                const res = await rnfFetch('overview', { params: filterParams });
                const stats = res.stats || {};
                overviewCache.set(cacheKey, { timestamp: Date.now(), stats });

                totalIncoming = stats.totalIncoming || 0;
                totalOutgoing = stats.totalOutgoing || 0;
                netProfit = stats.netProfit || (totalIncoming - totalOutgoing);
                totalCount = stats.totalCount || 0;
                appIncomeMap = stats.appIncomeMap || {};
                appSalesCountMap = stats.appSalesCountMap || {};
                dailyIncomeMap = stats.dailyIncomeMap || {};
                dailyOutgoingMap = stats.dailyOutgoingMap || {};
                recentTransactions = stats.recentTransactions || [];
            } catch (err) {
                console.error('[RNFSHOP] Error loading dashboard stats:', err);
                return;
            }
        }
    }

    // ── Count Sales for Top Best Sellers Leaderboard ──────────────
    if (isRnfPreviewMode()) {
        appSalesCountMap = {};
        MOCK_TRANSACTIONS.forEach(t => {
            if (t.trx_type === 'incoming') {
                const appName = t.apps?.name || t.app_name || 'Lainnya';
                appSalesCountMap[appName] = (appSalesCountMap[appName] || 0) + 1;
            }
        });
    }

    // ── Update Metric Cards ───────────────────────────────────────
    const elIn = document.getElementById('rnf-stat-incoming');
    const elOut = document.getElementById('rnf-stat-outgoing');
    const elNet = document.getElementById('rnf-stat-profit');
    const elCount = document.getElementById('rnf-stat-count');

    if (elIn) elIn.textContent = formatRupiah(totalIncoming);
    if (elOut) elOut.textContent = formatRupiah(totalOutgoing);
    if (elNet) {
        elNet.textContent = formatRupiah(netProfit);
        elNet.style.color = netProfit >= 0 ? '#34d399' : '#fb7185';
    }
    if (elCount) elCount.textContent = (totalCount || 0).toLocaleString('id-ID');

    // ── Render Recent Activities (Flush table layout matching Reference) ───────
    renderRecentActivities(recentTransactions);

    // ── Render Top Best Seller (Leaderboard with count terjual) ────────────────
    renderTopBestSeller(appSalesCountMap);

    // ── Render Charts ─────────────────────────────────────────────
    const overviewSec = document.getElementById('view-rnf-overview');
    if (overviewSec && overviewSec.classList.contains('active')) {
        try {
            await renderCharts(dailyIncomeMap, dailyOutgoingMap, periodSelect, typeFilter);
        } catch (chartErr) {
            console.error('[RNFSHOP] Error rendering charts:', chartErr);
        }
    }
}

function renderRecentActivities(transactions) {
    const listEl = document.getElementById('recent-activities-table-body') || document.getElementById('ov-recent-activities');
    if (!listEl) return;

    if (!transactions || transactions.length === 0) {
        listEl.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-500 text-xs">No recent transactions.</td></tr>`;
        return;
    }

    listEl.innerHTML = transactions.slice(0, 6).map(t => {
        const isIn = t.trx_type === 'incoming';
        const appName = t.apps?.name || t.app_name || 'Other';
        const amount = formatRupiah(Number(t.amount || 0));
        let dateFormatted = '-';
        if (t.trx_date) {
            try {
                dateFormatted = new Date(t.trx_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
            } catch {
                dateFormatted = t.trx_date;
            }
        }
        const customer = (t.customer_name || t.customer_id || t.note || t.notes || '-').toString().trim() || '-';
        const color = isIn ? 'text-emerald-400' : 'text-rose-400';
        const sign = isIn ? '+' : '-';
        const typeBadge = isIn
            ? `<span class="badge-in-liquid">IN</span>`
            : `<span class="badge-out-liquid">OUT</span>`;

        return `
            <tr class="border-b border-white/4 hover:bg-white/2 transition-colors">
                <td class="px-3 py-3 text-slate-400 tabular whitespace-nowrap text-xs">${dateFormatted}</td>
                <td class="px-3 py-3 text-center whitespace-nowrap">${typeBadge}</td>
                <td class="px-3 py-3 font-semibold text-slate-200">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-md bg-white/5 shrink-0 flex items-center justify-center p-0.5 shadow-2xs overflow-hidden">
                            ${renderAppLogo(appName, "w-full h-full object-contain")}
                        </div>
                        <span class="truncate text-xs" title="${escAttr(appName)}">${escAttr(appName)}</span>
                    </div>
                </td>
                <td class="px-3 py-3 text-slate-300 text-xs truncate max-w-32.5" title="${escAttr(customer)}">
                    ${escAttr(customer)}
                </td>
                <td class="px-3 py-3 text-right whitespace-nowrap font-bold tabular text-sm ${color}">
                    ${sign}${amount}
                </td>
            </tr>
        `;
    }).join('');
}

function renderTopBestSeller(salesMap) {
    const listEl = document.getElementById('top-products-list') || document.getElementById('ov-top-bestseller');
    if (!listEl) return;

    const entries = Object.entries(salesMap || {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    if (entries.length === 0) {
        listEl.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">No sales data recorded yet.</div>`;
        return;
    }

    const maxVal = entries[0][1] || 1;

    listEl.innerHTML = entries.map(([appName, count], index) => {
        const rank = index + 1;
        const pct = Math.round((count / maxVal) * 100);

        const rankBadgeStyle = {
            1: "bg-amber-400 text-amber-950 font-black shadow-xs shadow-amber-500/20",
            2: "bg-slate-300 text-slate-900 font-bold",
            3: "bg-amber-700 text-amber-100 font-bold"
        }[rank] || "bg-white/10 text-slate-400 font-semibold";

        return `
            <div class="flex items-center gap-3.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors group">
                <!-- Rank Number -->
                <div class="w-6 h-6 rounded-lg ${rankBadgeStyle} flex items-center justify-center text-[11px] shrink-0">
                    ${rank}
                </div>

                <!-- Logo (Borderless iOS squircle) -->
                <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center p-1.5 shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                    ${renderAppLogo(appName, "w-full h-full object-contain")}
                </div>

                <!-- Name & Progress Bar -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-xs font-bold text-slate-200 truncate" title="${escAttr(appName)}">
                            ${escAttr(appName)}
                        </span>
                        <span class="text-xs font-extrabold text-white tabular shrink-0">
                            ${count} <span class="text-[10px] font-medium text-slate-400">sold</span>
                        </span>
                    </div>
                    <!-- Mini Progress Track -->
                    <div class="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div class="h-full rounded-full bg-linear-to-r from-blue-500 to-indigo-500 transition-all duration-500" style="width: ${pct}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ── Custom Liquid Glass Dropdown (enhanceSelect from Dashboard_RNF_SHOP) ──────
if (!window._enhancedDropdowns) {
    window._enhancedDropdowns = [];
}

export function enhanceSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    if (select.dataset.enhanced === "true") return;
    select.dataset.enhanced = "true";

    // Hide original native select
    select.style.display = "none";

    const widthClass = "w-full";

    // Create container
    const container = document.createElement("div");
    container.className = `relative block ${widthClass} z-[60]`;
    select.parentNode.insertBefore(container, select);

    // Create Trigger Button
    const button = document.createElement("button");
    button.type = "button";
    button.className = `flex items-center justify-between gap-2 ${widthClass} px-3.5 py-2.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-2xs text-xs font-medium text-slate-200 hover:bg-white/10 transition-all active:scale-[0.98] cursor-pointer h-11`;

    const selectedOption = select.options[select.selectedIndex];
    const initialLabel = selectedOption ? selectedOption.text : "Select option";

    button.innerHTML = `
      <span class="truncate" id="${selectId}-label">${initialLabel}</span>
      <span class="material-symbols-outlined text-slate-400 text-[20px] transition-transform duration-300" id="${selectId}-icon">
        expand_more
      </span>
    `;
    container.appendChild(button);

    // Create Dropdown Menu
    const menu = document.createElement("div");
    menu.className =
      `absolute left-0 mt-2 w-full min-w-[180px] origin-top ` +
      `bg-[#0c1222]/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10 ` +
      `focus:outline-none opacity-0 scale-95 pointer-events-none ` +
      `transition-all duration-200 ease-out transform z-[100]`;
    menu.innerHTML = `<div class="p-1 space-y-0.5 max-h-60 overflow-y-auto custom-scrollbar"></div>`;
    container.appendChild(menu);

    const menuList = menu.firstElementChild;

    function renderItems() {
      menuList.innerHTML = '';
      Array.from(select.options).forEach((opt) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-300 rounded-lg hover:bg-white/10 hover:text-white transition-colors group cursor-pointer";

        if (select.value === opt.value) {
          item.classList.add("bg-cyan-500/15", "font-medium", "text-cyan-300");
          item.innerHTML = `
            <span class="flex-1 truncate">${opt.text}</span>
            <span class="material-symbols-outlined text-cyan-400 text-[18px]">check</span>
          `;
        } else {
          item.innerHTML = `<span class="flex-1 truncate">${opt.text}</span>`;
        }

        item.addEventListener("click", () => {
          select.value = opt.value;
          select.dispatchEvent(new Event('change'));
          button.querySelector(`#${selectId}-label`).textContent = opt.text;
          closeMenu();
          renderItems();
        });

        menuList.appendChild(item);
      });
    }

    renderItems();

    let isOpen = false;

    function openMenu() {
      window._enhancedDropdowns.forEach(dropdown => {
        if (dropdown.id !== selectId && dropdown.close) {
          dropdown.close();
        }
      });

      menu.classList.remove("opacity-0", "scale-95", "pointer-events-none");
      menu.classList.add("opacity-100", "scale-100", "pointer-events-auto");
      button.querySelector(`#${selectId}-icon`).classList.add("rotate-180");
      container.classList.add("z-[100]");
      isOpen = true;
    }

    function closeMenu() {
      menu.classList.remove("opacity-100", "scale-100", "pointer-events-auto");
      menu.classList.add("opacity-0", "scale-95", "pointer-events-none");
      button.querySelector(`#${selectId}-icon`).classList.remove("rotate-180");
      container.classList.remove("z-[100]");
      isOpen = false;
    }

    window._enhancedDropdowns.push({
      id: selectId,
      close: closeMenu
    });

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      isOpen ? closeMenu() : openMenu();
    });

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        closeMenu();
      }
    });

    select.addEventListener('change', () => {
      const selected = select.options[select.selectedIndex];
      if (selected) {
        button.querySelector(`#${selectId}-label`).textContent = selected.text;
        renderItems();
      }
    });
}
window.enhanceSelect = enhanceSelect;

// ── Filter Bar & Actions Initialization ───────────────────────────────────────
export function initPeriodFilters() {
    // Enhance selects for liquid glass dropdowns
    enhanceSelect('chart-type-filter');
    enhanceSelect('chart-filter');

    // 1. Transaction Type filter
    document.getElementById('chart-type-filter')?.addEventListener('change', async () => {
        await loadDashboardOverview();
    });

    // 2. Period filter dropdown
    document.getElementById('chart-filter')?.addEventListener('change', async () => {
        if (!isUpdatingFromDateInput) {
            const dateFrom = document.getElementById('date-from');
            const dateTo = document.getElementById('date-to');
            if (dateFrom) dateFrom.value = '';
            if (dateTo) dateTo.value = '';
        }
        await loadDashboardOverview();
    });

    // 3. Custom Date Range inputs with debounce
    let dateDebounceTimer = null;
    const handleCustomDate = () => {
        clearTimeout(dateDebounceTimer);
        dateDebounceTimer = setTimeout(async () => {
            isUpdatingFromDateInput = true;
            await loadDashboardOverview();
            isUpdatingFromDateInput = false;
        }, 250);
    };

    document.getElementById('date-from')?.addEventListener('input', handleCustomDate);
    document.getElementById('date-from')?.addEventListener('change', handleCustomDate);
    document.getElementById('date-to')?.addEventListener('input', handleCustomDate);
    document.getElementById('date-to')?.addEventListener('change', handleCustomDate);

    // 4. Clear Filter button
    document.getElementById('btnClearChartFilter')?.addEventListener('click', async () => {
        const typeSelect = document.getElementById('chart-type-filter');
        const periodSelect = document.getElementById('chart-filter');
        const dateFrom = document.getElementById('date-from');
        const dateTo = document.getElementById('date-to');

        if (typeSelect) {
            typeSelect.value = 'all';
            typeSelect.dispatchEvent(new Event('change'));
        }
        if (periodSelect) {
            periodSelect.value = 'month';
            periodSelect.dispatchEvent(new Event('change'));
        }
        if (dateFrom) dateFrom.value = '';
        if (dateTo) dateTo.value = '';

        await loadDashboardOverview(true);
    });

    // 5. Quick action: Add Transaction from Overview
    document.getElementById('ov-btn-add-trx')?.addEventListener('click', () => {
        const addBtn = document.getElementById('btn-add-trx');
        if (addBtn) addBtn.click();
        else {
            const { switchView } = window;
            if (switchView) switchView('rnf-transactions');
        }
    });

    // 6. Quick action: Add App from Overview
    document.getElementById('ov-btn-add-app')?.addEventListener('click', () => {
        const addBtn = document.getElementById('btn-open-add-app');
        if (addBtn) addBtn.click();
        else {
            const { switchView } = window;
            if (switchView) switchView('rnf-apps');
        }
    });

    // 7. View all transactions shortcut
    document.getElementById('ov-btn-view-all-trx')?.addEventListener('click', () => {
        const { switchView } = window;
        if (switchView) switchView('rnf-transactions');
        else document.querySelector('.nav-item[data-view="rnf-transactions"]')?.click();
    });

    // 8. View catalog shortcut
    document.getElementById('ov-btn-view-catalog')?.addEventListener('click', () => {
        const { switchView } = window;
        if (switchView) switchView('rnf-apps');
        else document.querySelector('.nav-item[data-view="rnf-apps"]')?.click();
    });
}

async function renderCharts(dailyIn = {}, dailyOut = {}, period = 'month', typeFilter = 'all') {
    const trendCanvas = document.getElementById('rnf-chart-trend');
    if (!trendCanvas) return;

    // Load Chart.js (either preloaded via UMD on window.Chart or dynamic auto/+esm)
    let ChartConstructor = window.Chart;
    if (!ChartConstructor) {
        try {
            const chartModule = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/auto/+esm');
            ChartConstructor = chartModule.Chart || chartModule.default;
            window.Chart = ChartConstructor;
        } catch (err) {
            console.error('[RNFSHOP] Chart.js lazy load failed:', err);
            return;
        }
    }

    // Safely destroy existing instances from canvas to prevent "Canvas is already in use"
    const existingTrend = ChartConstructor.getChart ? ChartConstructor.getChart(trendCanvas) : null;
    if (existingTrend) {
        try { existingTrend.destroy(); } catch (_) {}
    }
    if (chartInstanceTrend) {
        try { chartInstanceTrend.destroy(); } catch (_) {}
        chartInstanceTrend = null;
    }

    // Determine aggregation mode matching Dashboard_RNF_SHOP
    const mode = (period === '6months' || period === '1year') ? 'month' : 'day';

    // Aggregate values
    const groups = new Map();
    const allDates = Array.from(new Set([...Object.keys(dailyIn || {}), ...Object.keys(dailyOut || {})])).sort();

    if (allDates.length === 0) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const key = mode === 'month' ? todayStr.slice(0, 7) : todayStr;
        groups.set(key, 0);
    } else {
        for (const dateStr of allDates) {
            const key = mode === 'month' ? String(dateStr).slice(0, 7) : String(dateStr);
            const prev = groups.get(key) || 0;
            const inAmt = Number(dailyIn[dateStr] || 0);
            const outAmt = Number(dailyOut[dateStr] || 0);

            let netAmt = 0;
            if (typeFilter === 'incoming') {
                netAmt = inAmt;
            } else if (typeFilter === 'outgoing') {
                netAmt = outAmt;
            } else {
                netAmt = inAmt - outAmt;
            }
            groups.set(key, prev + netAmt);
        }
    }

    const labels = Array.from(groups.keys()).sort();
    const values = labels.map(k => groups.get(k));

    // Determine dataset styling matching Dashboard_RNF_SHOP
    let label = 'Net Profit (IDR)';
    let primaryColor = '#06b6d4'; // Cyan default
    if (typeFilter === 'incoming') {
        label = 'Income (IDR)';
        primaryColor = '#10b981'; // Emerald
    } else if (typeFilter === 'outgoing') {
        label = 'Expense (IDR)';
        primaryColor = '#f43f5e'; // Rose
    }

    const ctx = trendCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
    if (typeFilter === 'incoming') {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    } else if (typeFilter === 'outgoing') {
        gradient.addColorStop(0, 'rgba(244, 63, 94, 0.35)');
        gradient.addColorStop(1, 'rgba(244, 63, 94, 0.0)');
    } else {
        gradient.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
        gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
    }

    chartInstanceTrend = new ChartConstructor(trendCanvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label,
                    data: values,
                    borderWidth: 2,
                    borderColor: primaryColor,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: mode === 'month' ? 4 : 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: primaryColor,
                    pointBorderColor: '#0c1222',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(7, 10, 18, 0.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            const v = context.parsed.y ?? 0;
                            return ` ${context.dataset.label}: Rp ${Number(v).toLocaleString('id-ID')}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    border: { display: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Plus Jakarta Sans', size: 10 },
                        callback: (v) => 'Rp ' + Number(v).toLocaleString('id-ID')
                    }
                },
                x: {
                    grid: { display: false, drawBorder: false },
                    border: { display: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Plus Jakarta Sans', size: 10 },
                        maxTicksLimit: 8
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            }
        }
    });
}
