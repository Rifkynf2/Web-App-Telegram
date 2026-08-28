/**
 * Master SaaS Dashboard Logic
 * Unified management for Bot Telegram and Bot WhatsApp
 */

const API_BASE = '/api/admin';
let adminSecret = localStorage.getItem('master_secret') || '';
let activeTab = 'telegram'; // 'telegram' or 'whatsapp'

// ── Mock Data (preview mode) ────────────────────────────────────────────────
const isPreviewMode = new URLSearchParams(window.location.search).get('preview') === 'true';

const MOCK_STATS = {
    total_tenants: 12,
    active_tenants: 9,
    expiring_soon: 2,
    total_revenue: 4850000,
};

const MOCK_TENANTS = [
    {
        bot_id: '8774012156', username: 'majakartaap78_bot', shop_name: 'MAJAKARTA APP [AUTO ORDER]', status: 'ACTIVE', created_at: '2025-01-15T00:00:00Z',
        subscription: { plan: 'Premium', status: 'ACTIVE', expiryDate: '2026-08-03T00:00:00Z', isExpired: false, remainingDays: 19 },
    },
    {
        bot_id: '8750095348', username: 'terserahstore1_bot', shop_name: 'terserah store', status: 'ACTIVE', created_at: '2025-06-10T00:00:00Z',
        subscription: { plan: 'Trial', status: 'TRIAL', expiryDate: '2026-07-18T00:00:00Z', isExpired: false, remainingDays: 3 },
    },
    {
        bot_id: '8701921315', username: 'rogerfams_bot', shop_name: 'ROGERFAMS', status: 'SUSPENDED', created_at: '2025-03-20T00:00:00Z',
        subscription: { plan: 'Premium', status: 'ACTIVE', expiryDate: '2026-07-18T00:00:00Z', isExpired: false, remainingDays: 4 },
    },
    {
        bot_id: '8611234098', username: 'bannedshop_bot', shop_name: 'Banned Example Shop', status: 'BANNED', created_at: '2024-11-05T00:00:00Z',
        subscription: { plan: 'Premium', status: 'ACTIVE', expiryDate: '2026-05-01T00:00:00Z', isExpired: true, remainingDays: -75 },
    },
    {
        bot_id: '8599123456', username: 'expiredstore_bot', shop_name: 'Expired Store Example', status: 'EXPIRED', created_at: '2024-12-01T00:00:00Z',
        subscription: { plan: 'Premium', status: 'ACTIVE', expiryDate: '2026-06-10T00:00:00Z', isExpired: true, remainingDays: -35 },
    },
];

const MOCK_WA_STATS = {
    total_groups: 8,
    active_groups: 6,
    expiring_soon: 1,
    total_payments: 42,
};

const MOCK_WA_GROUPS = [
    {
        id: 1, store_group_id: '120363000000000001@g.us', group_name: 'VIP Reseller Group',
        renter_name: 'Ahmad Rizki', is_active: true, paid_until: '2026-09-15', joined_at: '2025-01-15'
    },
    {
        id: 2, store_group_id: '120363000000000002@g.us', group_name: 'Diamond Member Community',
        renter_name: 'Siti Sarah', is_active: true, paid_until: '2026-08-30', joined_at: '2025-06-10'
    },
    {
        id: 3, store_group_id: '120363000000000003@g.us', group_name: 'Crypto Signal & Discussion',
        renter_name: 'Budi Santoso', is_active: false, paid_until: '2026-07-01', joined_at: null
    }
];

// DOM Elements
const loginOverlay = document.getElementById('loginOverlay');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');
const btnRefresh = document.getElementById('btnRefresh');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    setupTabListeners();

    // Inisialisasi: pastikan glass-bg untuk tab yang aktif saat load sudah terlihat
    const activePane = document.querySelector(`.tab-pane.active`);
    if (activePane) {
        const glassBg = activePane.querySelector('.glass-bg');
        if (glassBg) glassBg.classList.add('reveal');
    }

    if (isPreviewMode) {
        console.log('[MasterDashboard] Preview mode — mock data loaded');
        loadStats();
        loginForm.addEventListener('submit', (e) => e.preventDefault());
        btnLogout.addEventListener('click', () => location.reload());
        btnRefresh.addEventListener('click', () => { loadStats(); loadActiveTab(); });
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const secretParam = urlParams.get('secret');

    if (secretParam) {
        adminSecret = secretParam;
        localStorage.setItem('master_secret', secretParam);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (adminSecret) {
        loadStats();
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const secret = document.getElementById('adminSecret').value;
        if (!secret) return;
        adminSecret = secret;

        const btn = document.getElementById('loginBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

        loadStats().then(success => {
            if (success) {
                localStorage.setItem('master_secret', adminSecret);
                loginOverlay.style.display = 'none';
                mainApp.style.display = 'block';
                loadActiveTab();
            } else {
                showToast('Invalid Secret Key', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-lock"></i> Access Dashboard';
            }
        });
    });

    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('master_secret');
        location.reload();
    });

    btnRefresh.addEventListener('click', () => {
        loadStats();
        loadActiveTab();
    });
});

// ── Tab Management ──────────────────────────────────────────────────────────
const TAB_ORDER = ['telegram', 'whatsapp'];

function setupTabListeners() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            if (targetTab === activeTab) return;

            const oldIndex = TAB_ORDER.indexOf(activeTab);
            const newIndex = TAB_ORDER.indexOf(targetTab);
            const animClass = newIndex > oldIndex ? 'slide-in-right' : 'slide-in-left';

            activeTab = targetTab;
            tabBtns.forEach(b => b.classList.toggle('active', b === btn));
            
            const mainTabs = document.getElementById('mainTabs');
            if (mainTabs) {
                mainTabs.classList.remove('theme-telegram', 'theme-whatsapp');
                mainTabs.classList.add(`theme-${activeTab}`);
            }

            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('slide-in-right', 'slide-in-left');
                const glassBg = pane.querySelector('.glass-bg');
                
                const isActive = pane.id === `tab-${activeTab}`;
                pane.classList.toggle('active', isActive);
                
                if (isActive) {
                    if (glassBg) glassBg.classList.remove('reveal');
                    void pane.offsetWidth; // Force reflow
                    pane.classList.add(animClass);
                    
                    pane.addEventListener('animationend', function handler() {
                        pane.classList.remove(animClass);
                        if (glassBg) glassBg.classList.add('reveal'); // Trigger circular glass spread
                        pane.removeEventListener('animationend', handler);
                    });
                } else {
                    if (glassBg) glassBg.classList.remove('reveal');
                }
            });

            updateStatsHeader();
            loadStats();
            loadActiveTab();
        });
    });
}

function updateStatsHeader() {
    const label1 = document.getElementById('statLabel1');
    const icon1 = document.getElementById('statIcon1');
    const label2 = document.getElementById('statLabel2');
    const icon2 = document.getElementById('statIcon2');
    const label3 = document.getElementById('statLabel3');
    const icon3 = document.getElementById('statIcon3');
    const label4 = document.getElementById('statLabel4');
    const icon4 = document.getElementById('statIcon4');

    if (activeTab === 'whatsapp') {
        if (label1) label1.innerText = 'Total Groups';
        if (icon1) icon1.className = 'fa-solid fa-user-group';
        if (label2) label2.innerText = 'Active Groups';
        if (icon2) icon2.className = 'fa-solid fa-circle-check';
        if (label3) label3.innerText = 'Expiring Soon';
        if (icon3) icon3.className = 'fa-solid fa-hourglass-half';
        if (label4) label4.innerText = 'Monthly Revenue';
        if (icon4) icon4.className = 'fa-solid fa-money-bill-wave';
    } else {
        if (label1) label1.innerText = 'Total Tenants';
        if (icon1) icon1.className = 'fa-solid fa-store';
        if (label2) label2.innerText = 'Active Tenants';
        if (icon2) icon2.className = 'fa-solid fa-circle-check';
        if (label3) label3.innerText = 'Expiring Soon';
        if (icon3) icon3.className = 'fa-solid fa-hourglass-half';
        if (label4) label4.innerText = 'Total Revenue';
        if (icon4) icon4.className = 'fa-solid fa-money-bill-wave';
    }
}

function loadActiveTab() {
    if (activeTab === 'whatsapp') {
        loadWaGroups();
    } else {
        loadTenants();
    }
}

// ── Member Since Formatter (2 Baris) ───────────────────────────────────────
function formatMemberSinceHtml(dateStr) {
    if (!dateStr) return '';
    const startDate = new Date(dateStr);
    if (isNaN(startDate.getTime())) return '';

    const dd = String(startDate.getDate()).padStart(2, '0');
    const mm = String(startDate.getMonth() + 1).padStart(2, '0');
    const yy = String(startDate.getFullYear()).slice(-2);
    const dateFormatted = `${dd}/${mm}/${yy}`;

    const now = new Date();
    if (startDate > now) return dateFormatted;

    let years = now.getFullYear() - startDate.getFullYear();
    let months = now.getMonth() - startDate.getMonth();
    let days = now.getDate() - startDate.getDate();

    if (days < 0) {
        months -= 1;
        const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += lastMonth.getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years} yr`);
    if (months > 0) parts.push(`${months} mo`);
    if (days > 0 || parts.length === 0) parts.push(`${days} d`);

    return `${dateFormatted}<br><small style="color:var(--text-muted); font-size:0.75rem;">(${parts.join(' ')})</small>`;
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

// ── Stats ───────────────────────────────────────────────────────────────────
function renderStats(s) {
    if (activeTab === 'whatsapp') {
        document.getElementById('statTotalTenants').innerText = s.total_groups ?? '-';
        document.getElementById('statActiveTenants').innerText = `${s.active_groups ?? 0} / ${s.total_groups ?? 0}`;
        document.getElementById('statExpiring').innerText = s.expiring_soon ?? '-';
        const mrr = (s.active_groups || 0) * 10000;
        document.getElementById('statRevenue').innerText = `Rp ${mrr.toLocaleString('id-ID')}`;
    } else {
        document.getElementById('statTotalTenants').innerText = s.total_tenants ?? '-';
        document.getElementById('statActiveTenants').innerText = `${s.active_tenants ?? 0} / ${s.total_tenants ?? 0}`;
        document.getElementById('statExpiring').innerText = s.expiring_soon ?? '-';
        document.getElementById('statRevenue').innerText = `Rp ${(s.total_revenue || 0).toLocaleString('id-ID')}`;
    }
}

async function loadStats() {
    if (isPreviewMode) {
        if (loginOverlay.style.display !== 'none') {
            loginOverlay.style.display = 'none';
            mainApp.style.display = 'block';
            loadActiveTab();
        }
        renderStats(activeTab === 'whatsapp' ? MOCK_WA_STATS : MOCK_STATS);
        return true;
    }

    try {
        const endpoint = activeTab === 'whatsapp' ? `${API_BASE}/wa-groups?action=stats` : `${API_BASE}/stats`;
        const res = await fetch(endpoint, {
            headers: { 'X-Admin-Secret': adminSecret }
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        if (loginOverlay.style.display !== 'none') {
            loginOverlay.style.display = 'none';
            mainApp.style.display = 'block';
            loadActiveTab();
        }

        renderStats(data.stats);
        return true;
    } catch (err) {
        console.error('Stats error:', err);
        return false;
    }
}

// ── Telegram Bot Tenants ─────────────────────────────────────────────────────
function renderTenants(tenants) {
    const tbody = document.getElementById('tenantsTableBody');

    if (tenants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-box-open"></i><br>No tenants found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    tenants.forEach(t => {
        const tr = document.createElement('tr');

        const expiry = t.subscription.expiryDate ? new Date(t.subscription.expiryDate).toLocaleDateString('id-ID') : '-';
        const memberSinceHtml = formatMemberSinceHtml(t.created_at || t.createdAt);

        let subBadgeClass = 'badge-active';
        let subBadgeText = t.subscription.status;
        if (t.subscription.isExpired) {
            subBadgeClass = 'badge-suspended';
            subBadgeText = 'EXPIRED';
        } else if (t.subscription.status === 'TRIAL') {
            subBadgeClass = 'badge-trial';
        }

        const tenantStatusClass = t.status === 'ACTIVE' ? 'badge-active' : (t.status === 'BANNED' ? 'badge-banned' : 'badge-suspended');

        tr.innerHTML = `
            <td data-label="Bot ID"><div class="cell-value"><code>${escapeHtml(t.bot_id)}</code></div></td>
            <td data-label="Shop">
                <div class="cell-value">
                    <b>${escapeHtml(t.shop_name)}</b><br>
                    <small style="color:var(--text-muted)">@${escapeHtml(t.username)}</small>
                </div>
            </td>
            <td data-label="STATUS JOINED" style="text-align: center;">
                <div class="cell-value">
                    <span class="badge ${tenantStatusClass}">${escapeHtml(t.status)}</span>
                    ${memberSinceHtml ? `<br>${memberSinceHtml}` : ''}
                </div>
            </td>
            <td data-label="Rental" style="text-align: center;">
                <div class="cell-value">
                    <span class="badge ${subBadgeClass}">${escapeHtml(subBadgeText)}</span><br>
                    <small>${escapeHtml(t.subscription.plan)}</small>
                </div>
            </td>
            <td data-label="Expiry" style="text-align: center;">
                <div class="cell-value">
                    ${expiry}<br>
                    <small style="color:${t.subscription.isExpired ? 'var(--danger-color)' : 'var(--text-muted)'}">
                        ${t.subscription.isExpired ? `Minus ${Math.abs(t.subscription.remainingDays)} days` : `${t.subscription.remainingDays} days left`}
                    </small>
                </div>
            </td>
            <td data-label="Actions" style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;">
                    <button class="icon-btn icon-btn-primary btn-action-renew" title="Extend rent"><i class="fa-solid fa-clock-rotate-left"></i></button>
                    <button class="icon-btn ${t.status === 'ACTIVE' ? 'icon-btn-warning' : 'icon-btn-success'} btn-action-toggle" title="${t.status === 'ACTIVE' ? 'Suspend' : 'Activate'}">
                        <i class="fa-solid fa-${t.status === 'ACTIVE' ? 'pause' : 'play'}"></i>
                    </button>
                    <button class="icon-btn icon-btn-danger btn-action-delete" title="Delete tenant"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        `;

        tr.querySelector('.btn-action-renew').onclick = () => showRenewModal(t.bot_id, t.username);
        tr.querySelector('.btn-action-toggle').onclick = (e) => confirmToggleStatus(t.bot_id, t.username, t.status === 'ACTIVE' ? 'suspend' : 'activate', e.currentTarget);
        tr.querySelector('.btn-action-delete').onclick = () => confirmDelete(t.bot_id, t.username);

        tbody.appendChild(tr);
    });
}

async function loadTenants() {
    const tbody = document.getElementById('tenantsTableBody');

    if (isPreviewMode) {
        renderTenants(MOCK_TENANTS);
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><br>Loading data...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/tenants?limit=100`, {
            headers: { 'X-Admin-Secret': adminSecret }
        });
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        renderTenants(data.tenants);
    } catch (err) {
        showToast(err.message, 'error');
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:var(--danger-color)"><i class="fa-solid fa-triangle-exclamation"></i><br>Failed to load data</td></tr>`;
    }
}

// ── WhatsApp Bot Groups ──────────────────────────────────────────────────────
function renderWaGroups(groups) {
    const tbody = document.getElementById('waGroupsTableBody');

    if (groups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-box-open"></i><br>No WhatsApp groups found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];

    groups.forEach(g => {
        const tr = document.createElement('tr');

        const displayGroupId = g.store_group_id || g.target_group_id || g.id;
        const memberSinceHtml = formatMemberSinceHtml(g.joined_at);
        const isActive = Boolean(g.is_active);
        const statusBadgeClass = isActive ? 'badge-active' : 'badge-suspended';
        const statusBadgeText = isActive ? 'ACTIVE' : 'INACTIVE';

        let expiryDisplay = '-';
        let remainingText = '';
        let isExpired = false;

        if (g.paid_until) {
            const parts = g.paid_until.split('-');
            if (parts.length === 3) {
                expiryDisplay = `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
            } else {
                expiryDisplay = g.paid_until;
            }

            const paidUntilDate = new Date(g.paid_until + 'T00:00:00Z');
            const todayDate = new Date(today + 'T00:00:00Z');
            const diffDays = Math.round((paidUntilDate - todayDate) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                isExpired = true;
                remainingText = `Minus ${Math.abs(diffDays)} days`;
            } else if (diffDays === 0) {
                remainingText = 'Expires today';
            } else {
                remainingText = `${diffDays} days left`;
            }
        }

        tr.innerHTML = `
            <td data-label="Group ID"><div class="cell-value"><code>${escapeHtml(displayGroupId)}</code></div></td>
            <td data-label="Group Name">
                <div class="cell-value">
                    <b>${escapeHtml(g.group_name)}</b>
                </div>
            </td>
            <td data-label="Renter Name" style="text-align: center;">
                <div class="cell-value">
                    ${escapeHtml(g.renter_name || '-')}
                </div>
            </td>
            <td data-label="STATUS JOINED" style="text-align: center;">
                <div class="cell-value">
                    <span class="badge ${statusBadgeClass}">${escapeHtml(statusBadgeText)}</span>
                    ${memberSinceHtml ? `<br>${memberSinceHtml}` : ''}
                </div>
            </td>
            <td data-label="Expiry" style="text-align: center;">
                <div class="cell-value">
                    ${expiryDisplay}<br>
                    <small style="color:${isExpired ? 'var(--danger-color)' : 'var(--text-muted)'}">
                        ${escapeHtml(remainingText)}
                    </small>
                </div>
            </td>
            <td data-label="Actions" style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;">
                    <button class="icon-btn icon-btn-primary btn-action-extend-wa" title="Extend rent"><i class="fa-solid fa-clock-rotate-left"></i></button>
                    <button class="icon-btn ${isActive ? 'icon-btn-warning' : 'icon-btn-success'} btn-action-toggle-wa" title="${isActive ? 'Deactivate' : 'Activate'}">
                        <i class="fa-solid fa-${isActive ? 'pause' : 'play'}"></i>
                    </button>
                    <button class="icon-btn icon-btn-danger btn-action-delete-wa" title="Delete group"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        `;

        tr.querySelector('.btn-action-extend-wa').onclick = () => showWaExtendModal(g);
        tr.querySelector('.btn-action-toggle-wa').onclick = (e) => confirmWaToggleStatus(g, e.currentTarget);
        tr.querySelector('.btn-action-delete-wa').onclick = () => confirmWaDelete(g);

        tbody.appendChild(tr);
    });
}

async function loadWaGroups() {
    const tbody = document.getElementById('waGroupsTableBody');

    if (isPreviewMode) {
        renderWaGroups(MOCK_WA_GROUPS);
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><br>Loading data...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/wa-groups?action=list`, {
            headers: { 'X-Admin-Secret': adminSecret }
        });
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        renderWaGroups(data.groups);
    } catch (err) {
        showToast(err.message, 'error');
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:var(--danger-color)"><i class="fa-solid fa-triangle-exclamation"></i><br>Failed to load data</td></tr>`;
    }
}

// ── Telegram Actions ────────────────────────────────────────────────────────
let isMutatingTenant = false;

function confirmToggleStatus(botId, username, action, btn) {
    if (isPreviewMode) return showToast('Preview mode — actions are disabled', 'error');
    if (isMutatingTenant) return;

    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    const isSuspend = action === 'suspend';
    const icon = isSuspend ? 'fa-pause' : 'fa-play';
    const verb = isSuspend ? 'Suspend' : 'Activate';

    modalTitle.innerHTML = `<i class="fa-solid ${icon}" style="color: var(--warning-color)"></i> ${verb} Tenant`;
    modalBody.innerHTML = `
        <p>Are you sure you want to <b>${verb.toLowerCase()}</b> the tenant <b>@${escapeHtml(username)}</b> (${escapeHtml(botId)})?</p>
    `;

    modalFooter.innerHTML = `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn ${isSuspend ? 'btn-warning' : 'btn-success'}" id="confirmToggleBtn">Yes, ${verb}</button>
    `;

    document.getElementById('confirmToggleBtn').onclick = () => {
        closeModal();
        updateTenantStatus(botId, action, btn);
    };

    openModal();
}

async function updateTenantStatus(botId, action, btn) {
    if (isPreviewMode) return showToast('Preview mode — actions are disabled', 'error');
    if (isMutatingTenant) return;

    isMutatingTenant = true;
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/tenants`, {
            method: 'PUT',
            headers: {
                'X-Admin-Secret': adminSecret,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bot_id: botId, action })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast(data.message, 'success');
        loadTenants();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
        if (btn) btn.disabled = false;
    } finally {
        isMutatingTenant = false;
    }
}

function confirmDelete(botId, username) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    modalTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger-color)"></i> Delete Tenant`;
    modalBody.innerHTML = `
        <p>You are about to permanently delete the tenant <b>@${escapeHtml(username)}</b> (${escapeHtml(botId)}).</p>
        <p style="color: var(--danger-color); margin-top: 10px; font-weight: bold;">
            This action CANNOT be undone. All database records, API keys, and configs for this tenant will be destroyed.
        </p>
    `;

    modalFooter.innerHTML = `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="executeDelete('${botId}')">Yes, Delete Forever</button>
    `;

    openModal();
}

async function executeDelete(botId) {
    if (isPreviewMode) { closeModal(); return showToast('Preview mode — actions are disabled', 'error'); }
    if (isMutatingTenant) return;
    isMutatingTenant = true;
    closeModal();
    try {
        const res = await fetch(`${API_BASE}/tenants?bot_id=${botId}`, {
            method: 'DELETE',
            headers: { 'X-Admin-Secret': adminSecret }
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast(data.message, 'success');
        loadTenants();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        isMutatingTenant = false;
    }
}

function showRenewModal(botId, username) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    modalTitle.innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="color: var(--primary-color)"></i> Extend Rent`;
    modalBody.innerHTML = `
        <p style="margin-bottom: 1rem;">Manually inject rent duration for <b>@${escapeHtml(username)}</b>.</p>
        <div class="input-group">
            <label style="display:block; margin-bottom: 5px; color: var(--text-muted); font-size: 0.9rem;">Adding Days</label>
            <input type="number" id="manualDays" value="31" min="1" max="365">
        </div>
    `;

    modalFooter.innerHTML = `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="executeRenew('${botId}')">Confirm Extend</button>
    `;

    openModal();
}

async function executeRenew(botId) {
    if (isPreviewMode) { closeModal(); return showToast('Preview mode — actions are disabled', 'error'); }
    if (isMutatingTenant) return;
    isMutatingTenant = true;

    const days = parseInt(document.getElementById('manualDays').value, 10) || 31;
    closeModal();

    try {
        const res = await fetch(`${API_BASE}/subscriptions`, {
            method: 'POST',
            headers: {
                'X-Admin-Secret': adminSecret,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bot_id: botId, days })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast(data.message, 'success');
        loadTenants();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        isMutatingTenant = false;
    }
}

// ── WhatsApp Actions ────────────────────────────────────────────────────────
let isMutatingWaGroup = false;

function showWaExtendModal(g) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    modalTitle.innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="color: var(--primary-color)"></i> Extend WA Group Rent`;
    modalBody.innerHTML = `
        <p style="margin-bottom: 1rem;">Extend rental duration for <b>${escapeHtml(g.group_name)}</b>.</p>
        <div class="input-group">
            <label style="display:block; margin-bottom: 5px; color: var(--text-muted); font-size: 0.9rem;">Adding Days</label>
            <input type="number" id="waExtendDays" value="31" min="1" max="365">
        </div>
    `;

    modalFooter.innerHTML = `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-success" id="confirmWaExtendBtn">Confirm Extend</button>
    `;

    document.getElementById('confirmWaExtendBtn').onclick = () => executeWaExtend(g.id);
    openModal();
}

async function executeWaExtend(groupId) {
    if (isPreviewMode) { closeModal(); return showToast('Preview mode — actions are disabled', 'error'); }
    if (isMutatingWaGroup) return;
    isMutatingWaGroup = true;

    const days = parseInt(document.getElementById('waExtendDays').value, 10) || 31;
    closeModal();

    try {
        const res = await fetch(`${API_BASE}/wa-groups`, {
            method: 'PUT',
            headers: {
                'X-Admin-Secret': adminSecret,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'extend', id: groupId, days })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast(data.message, 'success');
        loadWaGroups();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        isMutatingWaGroup = false;
    }
}

function confirmWaToggleStatus(g, btn) {
    if (isPreviewMode) return showToast('Preview mode — actions are disabled', 'error');
    if (isMutatingWaGroup) return;

    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    const willDeactivate = Boolean(g.is_active);
    const verb = willDeactivate ? 'Deactivate' : 'Activate';
    const icon = willDeactivate ? 'fa-pause' : 'fa-play';

    modalTitle.innerHTML = `<i class="fa-solid ${icon}" style="color: var(--warning-color)"></i> ${verb} WA Group`;
    modalBody.innerHTML = `
        <p>Are you sure you want to <b>${verb.toLowerCase()}</b> group <b>${escapeHtml(g.group_name)}</b>?</p>
    `;

    modalFooter.innerHTML = `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn ${willDeactivate ? 'btn-warning' : 'btn-success'}" id="confirmWaToggleBtn">Yes, ${verb}</button>
    `;

    document.getElementById('confirmWaToggleBtn').onclick = () => {
        closeModal();
        executeWaToggle(g.id, !willDeactivate, btn);
    };

    openModal();
}

async function executeWaToggle(groupId, targetActive, btn) {
    if (isPreviewMode) return showToast('Preview mode — actions are disabled', 'error');
    if (isMutatingWaGroup) return;

    isMutatingWaGroup = true;
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/wa-groups`, {
            method: 'PUT',
            headers: {
                'X-Admin-Secret': adminSecret,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'toggle', id: groupId, is_active: targetActive })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast(data.message, 'success');
        loadWaGroups();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
        if (btn) btn.disabled = false;
    } finally {
        isMutatingWaGroup = false;
    }
}

function confirmWaDelete(g) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    modalTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger-color)"></i> Delete WA Group`;
    modalBody.innerHTML = `
        <p>You are about to permanently delete group <b>${escapeHtml(g.group_name)}</b> (ID: ${escapeHtml(g.id)}).</p>
        <p style="color: var(--danger-color); margin-top: 10px; font-weight: bold;">
            This action CANNOT be undone. All payment history for this group will also be permanently deleted.
        </p>
    `;

    modalFooter.innerHTML = `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" id="confirmWaDeleteBtn">Yes, Delete Forever</button>
    `;

    document.getElementById('confirmWaDeleteBtn').onclick = () => {
        closeModal();
        executeWaDelete(g.id);
    };

    openModal();
}

async function executeWaDelete(groupId) {
    if (isPreviewMode) return showToast('Preview mode — actions are disabled', 'error');
    if (isMutatingWaGroup) return;
    isMutatingWaGroup = true;

    try {
        const res = await fetch(`${API_BASE}/wa-groups?id=${groupId}`, {
            method: 'DELETE',
            headers: { 'X-Admin-Secret': adminSecret }
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast(data.message, 'success');
        loadWaGroups();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        isMutatingWaGroup = false;
    }
}

// ── Modal & Toast UI Helpers ────────────────────────────────────────────────
const modal = document.getElementById('actionModal');
function openModal() { modal.classList.add('active'); }
function closeModal() { modal.classList.remove('active'); }

modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' : 'fa-circle-xmark';
    const color = type === 'success' ? 'var(--success-color)' : 'var(--danger-color)';

    toast.innerHTML = `<i class="fa-solid ${icon}" style="color: ${color}; font-size: 1.25rem;"></i> <span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
