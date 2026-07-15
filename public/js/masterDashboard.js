/**
 * Master SaaS Dashboard Logic
 */

const API_BASE = '/api/admin';
let adminSecret = localStorage.getItem('master_secret') || '';

// ── Mock Data (preview mode) ────────────────────────────────────────────────
// Open master-dashboard.html?preview=true to see the UI with fake data,
// no secret/API call needed — handy for reviewing layout/style changes
// without a redeploy. Mirrors the same convention used in adminProducts.js.
const isPreviewMode = new URLSearchParams(window.location.search).get('preview') === 'true';

const MOCK_STATS = {
    total_tenants: 12,
    active_tenants: 9,
    expiring_soon: 2,
    total_revenue: 4850000,
};

const MOCK_TENANTS = [
    {
        bot_id: '8774012156', username: 'majakartaap78_bot', shop_name: 'MAJAKARTA APP [AUTO ORDER]', status: 'ACTIVE',
        subscription: { plan: 'Premium', status: 'ACTIVE', expiryDate: '2026-08-03T00:00:00Z', isExpired: false, remainingDays: 19 },
    },
    {
        bot_id: '8750095348', username: 'terserahstore1_bot', shop_name: 'terserah store', status: 'ACTIVE',
        subscription: { plan: 'Trial', status: 'TRIAL', expiryDate: '2026-07-18T00:00:00Z', isExpired: false, remainingDays: 3 },
    },
    {
        bot_id: '8701921315', username: 'rogerfams_bot', shop_name: 'ROGERFAMS', status: 'SUSPENDED',
        subscription: { plan: 'Premium', status: 'ACTIVE', expiryDate: '2026-07-18T00:00:00Z', isExpired: false, remainingDays: 4 },
    },
    {
        bot_id: '8611234098', username: 'bannedshop_bot', shop_name: 'Banned Example Shop', status: 'BANNED',
        subscription: { plan: 'Premium', status: 'ACTIVE', expiryDate: '2026-05-01T00:00:00Z', isExpired: true, remainingDays: -75 },
    },
    {
        bot_id: '8599123456', username: 'expiredstore_bot', shop_name: 'Expired Store Example', status: 'EXPIRED',
        subscription: { plan: 'Premium', status: 'ACTIVE', expiryDate: '2026-06-10T00:00:00Z', isExpired: true, remainingDays: -35 },
    },
];

// DOM Elements
const loginOverlay = document.getElementById('loginOverlay');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');
const btnRefresh = document.getElementById('btnRefresh');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (isPreviewMode) {
        console.log('[MasterDashboard] Preview mode — mock data loaded');
        loadStats();
        loginForm.addEventListener('submit', (e) => e.preventDefault());
        btnLogout.addEventListener('click', () => location.reload());
        btnRefresh.addEventListener('click', () => { loadStats(); loadTenants(); });
        return;
    }

    // Auto-login via URL parameter ?secret=...
    const urlParams = new URLSearchParams(window.location.search);
    const secretParam = urlParams.get('secret');

    if (secretParam) {
        adminSecret = secretParam;
        localStorage.setItem('master_secret', secretParam);
        // Clean URL after capturing secret
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
                loadTenants();
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
        loadTenants();
    });
});

/**
 * Fetch and update stats
 */
function renderStats(s) {
    document.getElementById('statTotalTenants').innerText = s.total_tenants;
    document.getElementById('statActiveTenants').innerText = `${s.active_tenants} / ${s.total_tenants}`;
    document.getElementById('statExpiring').innerText = s.expiring_soon;
    // Format Rp
    document.getElementById('statRevenue').innerText = `Rp ${(s.total_revenue || 0).toLocaleString('id-ID')}`;
}

async function loadStats() {
    if (isPreviewMode) {
        if (loginOverlay.style.display !== 'none') {
            loginOverlay.style.display = 'none';
            mainApp.style.display = 'block';
            loadTenants();
        }
        renderStats(MOCK_STATS);
        return true;
    }

    try {
        const res = await fetch(`${API_BASE}/stats`, {
            headers: { 'X-Admin-Secret': adminSecret }
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // Show main app if this was a validation call
        if (loginOverlay.style.display !== 'none') {
            loginOverlay.style.display = 'none';
            mainApp.style.display = 'block';
            loadTenants();
        }

        renderStats(data.stats);
        return true;
    } catch (err) {
        console.error('Stats error:', err);
        return false;
    }
}

/**
 * Fetch and render tenants table
 */
// Tenant username/shop_name are free text set by the tenant's own bot owner
// (api/tenant/register.js does not sanitize them) — escape before ever
// putting them into innerHTML so a malicious tenant can't inject markup/JS
// that runs in the SaaS owner's authenticated dashboard session.
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

function renderTenants(tenants) {
    const tbody = document.getElementById('tenantsTableBody');

    if (tenants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-box-open"></i><br>No tenants found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    tenants.forEach(t => {
        const tr = document.createElement('tr');

        // Format dates
        const expiry = t.subscription.expiryDate ? new Date(t.subscription.expiryDate).toLocaleDateString('id-ID') : '-';

        // Badges
        let subBadgeClass = 'badge-active';
        let subBadgeText = t.subscription.status;
        if (t.subscription.isExpired) {
            subBadgeClass = 'badge-suspended';
            subBadgeText = 'EXPIRED';
        } else if (t.subscription.status === 'TRIAL') {
            subBadgeClass = 'badge-trial';
        }

        const tenantStatusClass = t.status === 'ACTIVE' ? 'badge-active' : (t.status === 'BANNED' ? 'badge-banned' : 'badge-suspended');

        // Action buttons are wired via .onclick below (real JS closures over
        // t.bot_id/t.username), never by interpolating tenant-controlled
        // strings into an inline onclick="..." attribute — a single quote in
        // shop_name/username there would otherwise break out of the JS
        // string literal and execute arbitrary code in the admin's session.
        tr.innerHTML = `
            <td><code>${escapeHtml(t.bot_id)}</code></td>
            <td>
                <b>${escapeHtml(t.shop_name)}</b><br>
                <small style="color:var(--text-muted)">@${escapeHtml(t.username)}</small>
            </td>
            <td><span class="badge ${tenantStatusClass}">${escapeHtml(t.status)}</span></td>
            <td>
                <span class="badge ${subBadgeClass}">${escapeHtml(subBadgeText)}</span><br>
                <small>${escapeHtml(t.subscription.plan)}</small>
            </td>
            <td>
                ${expiry}<br>
                <small style="color:${t.subscription.isExpired ? 'var(--danger-color)' : 'var(--text-muted)'}">
                    ${t.subscription.isExpired ? `Minus ${Math.abs(t.subscription.remainingDays)} days` : `${t.subscription.remainingDays} days left`}
                </small>
            </td>
            <td>
                <div class="actions">
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

/**
 * Tenant Actions
 */
// Prevents a rapid double-click from firing two mutating requests (suspend/
// activate/delete/renew) for the same tenant before the table re-renders.
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

    const days = parseInt(document.getElementById('manualDays').value) || 31;
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

/**
 * Modal & Toast UI Helpers
 */
const modal = document.getElementById('actionModal');
function openModal() { modal.classList.add('active'); }
function closeModal() { modal.classList.remove('active'); }

// Close modal when clicking outside
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
