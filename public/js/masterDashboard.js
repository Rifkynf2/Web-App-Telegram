/**
 * Master SaaS Dashboard Logic
 */

const API_BASE = '/api/admin';
let adminSecret = localStorage.getItem('master_secret') || '';

// DOM Elements
const loginOverlay = document.getElementById('loginOverlay');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');
const btnRefresh = document.getElementById('btnRefresh');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (adminSecret) {
        // Test secret
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
async function loadStats() {
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

        const s = data.stats;
        document.getElementById('statTotalTenants').innerText = s.total_tenants;
        document.getElementById('statActiveTenants').innerText = `${s.active_tenants} / ${s.total_tenants}`;
        document.getElementById('statExpiring').innerText = s.expiring_soon;
        // Format Rp
        document.getElementById('statRevenue').innerText = `Rp ${(s.total_revenue || 0).toLocaleString('id-ID')}`;

        return true;
    } catch (err) {
        console.error('Stats error:', err);
        return false;
    }
}

/**
 * Fetch and render tenants table
 */
async function loadTenants() {
    const tbody = document.getElementById('tenantsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><br>Loading data...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/tenants?limit=100`, {
            headers: { 'X-Admin-Secret': adminSecret }
        });
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error);

        const tenants = data.tenants;
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

            tr.innerHTML = `
                <td><code>${t.bot_id}</code></td>
                <td>
                    <b>${t.shop_name}</b><br>
                    <small style="color:var(--text-muted)">@${t.username}</small>
                </td>
                <td><span class="badge ${tenantStatusClass}">${t.status}</span></td>
                <td>
                    <span class="badge ${subBadgeClass}">${subBadgeText}</span><br>
                    <small>${t.subscription.plan}</small>
                </td>
                <td>
                    ${expiry}<br>
                    <small style="color:${t.subscription.isExpired ? 'var(--danger-color)' : 'var(--text-muted)'}">
                        ${t.subscription.isExpired ? `Minus ${Math.abs(t.subscription.remainingDays)} days` : `${t.subscription.remainingDays} days left`}
                    </small>
                </td>
                <td>
                    <div class="actions">
                        <button class="btn btn-sm" onclick="showRenewModal('${t.bot_id}', '${t.username}')"><i class="fa-solid fa-calendar-plus"></i></button>
                        <button class="btn btn-sm btn-warning" onclick="updateTenantStatus('${t.bot_id}', '${t.status === 'ACTIVE' ? 'suspend' : 'activate'}')">
                            <i class="fa-solid fa-${t.status === 'ACTIVE' ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="confirmDelete('${t.bot_id}', '${t.username}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        showToast(err.message, 'error');
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:var(--danger-color)"><i class="fa-solid fa-triangle-exclamation"></i><br>Failed to load data</td></tr>`;
    }
}

/**
 * Tenant Actions 
 */
async function updateTenantStatus(botId, action) {
    if (!confirm(`Are you sure you want to ${action} bot ${botId}?`)) return;

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
    }
}

function confirmDelete(botId, username) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    modalTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger-color)"></i> Delete Tenant`;
    modalBody.innerHTML = `
        <p>You are about to permanently delete the tenant <b>@${username}</b> (${botId}).</p>
        <p style="color: var(--danger-color); margin-top: 10px; font-weight: bold;">
            This action CANNOT be undone. All database records, API keys, and configs for this tenant will be destroyed.
        </p>
    `;
    
    modalFooter.innerHTML = `
        <button class="btn" style="background: transparent; border: 1px solid var(--border-color);" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="executeDelete('${botId}')">Yes, Delete Forever</button>
    `;

    openModal();
}

async function executeDelete(botId) {
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
    }
}

function showRenewModal(botId, username) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    modalTitle.innerHTML = `<i class="fa-solid fa-calendar-plus" style="color: var(--primary-color)"></i> Extend Rent`;
    modalBody.innerHTML = `
        <p style="margin-bottom: 1rem;">Manually inject rent duration for <b>@${username}</b>.</p>
        <div class="input-group">
            <label style="display:block; margin-bottom: 5px; color: var(--text-muted); font-size: 0.9rem;">Adding Days</label>
            <input type="number" id="manualDays" value="31" min="1" max="365">
        </div>
    `;
    
    modalFooter.innerHTML = `
        <button class="btn" style="background: transparent; border: 1px solid var(--border-color);" onclick="closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="executeRenew('${botId}')">Confirm Extend</button>
    `;

    openModal();
}

async function executeRenew(botId) {
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
    
    toast.innerHTML = `<i class="fa-solid ${icon}" style="color: ${color}; font-size: 1.25rem;"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
