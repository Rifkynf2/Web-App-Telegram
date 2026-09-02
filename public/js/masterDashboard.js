/**
 * Master SaaS Dashboard Logic
 * Unified management for Bot Telegram and Bot WhatsApp
 */

const API_BASE = '/api/admin';
let adminSecret = localStorage.getItem('master_secret') || '';
let activeTab = 'telegram'; // 'telegram' or 'whatsapp'

// ── Search & Sort State ──────────────────────────────────────────────────────
let _currentTenants = [];    // Menyimpan data Telegram dari API, tidak query ulang saat filter
let _currentWaGroups = [];   // Menyimpan data WhatsApp dari API, tidak query ulang saat filter

// ── Stats Cache (5-minute TTL + Smart Invalidation) ──────────────────────────
// Cache mencegah query ulang ke DB saat user bolak-balik tab.
// Cache dikosongkan secara paksa setelah setiap aksi mutasi (renew, suspend, delete).
const STATS_CACHE_TTL = 5 * 60 * 1000; // 5 menit
const _statsCache = { telegram: null, whatsapp: null };
const _statsCacheTime = { telegram: 0, whatsapp: 0 };

function invalidateStatsCache() {
    _statsCache.telegram = null;
    _statsCache.whatsapp = null;
    _statsCacheTime.telegram = 0;
    _statsCacheTime.whatsapp = 0;
    console.log('[Cache] Stats cache invalidated.');
}
const urlPreviewParam = new URLSearchParams(window.location.search).get('preview');
const isPreviewMode = urlPreviewParam === 'true';
const isPreviewLoginMode = urlPreviewParam === 'login';

const SVG_SPINNER = `<svg version="1.1" class="svg-loader" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 80 80" xml:space="preserve"><path fill="currentColor" d="M10,40c0,0,0-0.4,0-1.1c0-0.3,0-0.8,0-1.3c0-0.3,0-0.5,0-0.8c0-0.3,0.1-0.6,0.1-0.9c0.1-0.6,0.1-1.4,0.2-2.1
		c0.2-0.8,0.3-1.6,0.5-2.5c0.2-0.9,0.6-1.8,0.8-2.8c0.3-1,0.8-1.9,1.2-3c0.5-1,1.1-2,1.7-3.1c0.7-1,1.4-2.1,2.2-3.1
		c1.6-2.1,3.7-3.9,6-5.6c2.3-1.7,5-3,7.9-4.1c0.7-0.2,1.5-0.4,2.2-0.7c0.7-0.3,1.5-0.3,2.3-0.5c0.8-0.2,1.5-0.3,2.3-0.4l1.2-0.1
		l0.6-0.1l0.3,0l0.1,0l0.1,0l0,0c0.1,0-0.1,0,0.1,0c1.5,0,2.9-0.1,4.5,0.2c0.8,0.1,1.6,0.1,2.4,0.3c0.8,0.2,1.5,0.3,2.3,0.5
		c3,0.8,5.9,2,8.5,3.6c2.6,1.6,4.9,3.4,6.8,5.4c1,1,1.8,2.1,2.7,3.1c0.8,1.1,1.5,2.1,2.1,3.2c0.6,1.1,1.2,2.1,1.6,3.1
		c0.4,1,0.9,2,1.2,3c0.3,1,0.6,1.9,0.8,2.7c0.2,0.9,0.3,1.6,0.5,2.4c0.1,0.4,0.1,0.7,0.2,1c0,0.3,0.1,0.6,0.1,0.9
		c0.1,0.6,0.1,1,0.1,1.4C74,39.6,74,40,74,40c0.2,2.2-1.5,4.1-3.7,4.3s-4.1-1.5-4.3-3.7c0-0.1,0-0.2,0-0.3l0-0.4c0,0,0-0.3,0-0.9
		c0-0.3,0-0.7,0-1.1c0-0.2,0-0.5,0-0.7c0-0.2-0.1-0.5-0.1-0.8c-0.1-0.6-0.1-1.2-0.2-1.9c-0.1-0.7-0.3-1.4-0.4-2.2
		c-0.2-0.8-0.5-1.6-0.7-2.4c-0.3-0.8-0.7-1.7-1.1-2.6c-0.5-0.9-0.9-1.8-1.5-2.7c-0.6-0.9-1.2-1.8-1.9-2.7c-1.4-1.8-3.2-3.4-5.2-4.9
		c-2-1.5-4.4-2.7-6.9-3.6c-0.6-0.2-1.3-0.4-1.9-0.6c-0.7-0.2-1.3-0.3-1.9-0.4c-1.2-0.3-2.8-0.4-4.2-0.5l-2,0c-0.7,0-1.4,0.1-2.1,0.1
		c-0.7,0.1-1.4,0.1-2,0.3c-0.7,0.1-1.3,0.3-2,0.4c-2.6,0.7-5.2,1.7-7.5,3.1c-2.2,1.4-4.3,2.9-6,4.7c-0.9,0.8-1.6,1.8-2.4,2.7
		c-0.7,0.9-1.3,1.9-1.9,2.8c-0.5,1-1,1.9-1.4,2.8c-0.4,0.9-0.8,1.8-1,2.6c-0.3,0.9-0.5,1.6-0.7,2.4c-0.2,0.7-0.3,1.4-0.4,2.1
		c-0.1,0.3-0.1,0.6-0.2,0.9c0,0.3-0.1,0.6-0.1,0.8c0,0.5-0.1,0.9-0.1,1.3C10,39.6,10,40,10,40z"><animateTransform attributeType="xml" attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="0.8s" repeatCount="indefinite"/></path><path fill="currentColor" d="M62,40.1c0,0,0,0.2-0.1,0.7c0,0.2,0,0.5-0.1,0.8c0,0.2,0,0.3,0,0.5c0,0.2-0.1,0.4-0.1,0.7
		c-0.1,0.5-0.2,1-0.3,1.6c-0.2,0.5-0.3,1.1-0.5,1.8c-0.2,0.6-0.5,1.3-0.7,1.9c-0.3,0.7-0.7,1.3-1,2.1c-0.4,0.7-0.9,1.4-1.4,2.1
		c-0.5,0.7-1.1,1.4-1.7,2c-1.2,1.3-2.7,2.5-4.4,3.6c-1.7,1-3.6,1.8-5.5,2.4c-2,0.5-4,0.7-6.2,0.7c-1.9-0.1-4.1-0.4-6-1.1
		c-1.9-0.7-3.7-1.5-5.2-2.6c-1.5-1.1-2.9-2.3-4-3.7c-0.6-0.6-1-1.4-1.5-2c-0.4-0.7-0.8-1.4-1.2-2c-0.3-0.7-0.6-1.3-0.8-2
		c-0.2-0.6-0.4-1.2-0.6-1.8c-0.1-0.6-0.3-1.1-0.4-1.6c-0.1-0.5-0.1-1-0.2-1.4c-0.1-0.9-0.1-1.5-0.1-2c0-0.5,0-0.7,0-0.7
		s0,0.2,0.1,0.7c0.1,0.5,0,1.1,0.2,2c0.1,0.4,0.2,0.9,0.3,1.4c0.1,0.5,0.3,1,0.5,1.6c0.2,0.6,0.4,1.1,0.7,1.8
		c0.3,0.6,0.6,1.2,0.9,1.9c0.4,0.6,0.8,1.3,1.2,1.9c0.5,0.6,1,1.3,1.6,1.8c1.1,1.2,2.5,2.3,4,3.2c1.5,0.9,3.2,1.6,5,2.1
		c1.8,0.5,3.6,0.6,5.6,0.6c1.8-0.1,3.7-0.4,5.4-1c1.7-0.6,3.3-1.4,4.7-2.4c1.4-1,2.6-2.1,3.6-3.3c0.5-0.6,0.9-1.2,1.3-1.8
		c0.4-0.6,0.7-1.2,1-1.8c0.3-0.6,0.6-1.2,0.8-1.8c0.2-0.6,0.4-1.1,0.5-1.7c0.1-0.5,0.2-1,0.3-1.5c0.1-0.4,0.1-0.8,0.1-1.2
		c0-0.2,0-0.4,0.1-0.5c0-0.2,0-0.4,0-0.5c0-0.3,0-0.6,0-0.8c0-0.5,0-0.7,0-0.7c0-1.1,0.9-2,2-2s2,0.9,2,2C62,40,62,40.1,62,40.1z"><animateTransform attributeType="xml" attributeName="transform" type="rotate" from="0 40 40" to="-360 40 40" dur="0.6s" repeatCount="indefinite"/></path></svg>`;

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
        id: 1, store_group_id: '120363422100732509@g.us', target_group_id: '120363000000000001@g.us', group_name: 'VIP Reseller Group',
        renter_name: 'Ahmad Rizki', is_active: true, paid_until: '2026-09-15', joined_at: '2025-01-15'
    },
    {
        id: 2, store_group_id: '120363422100732509@g.us', target_group_id: '120363000000000002@g.us', group_name: 'Diamond Member Community',
        renter_name: 'Siti Sarah', is_active: true, paid_until: '2026-08-30', joined_at: '2025-06-10'
    },
    {
        id: 3, store_group_id: '120363422100732509@g.us', target_group_id: '120363000000000003@g.us', group_name: 'Crypto Signal & Discussion',
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

    // ── Search Event Listeners ──────────────────────────────────────────────────
    const searchTgInput = document.getElementById('searchTelegram');
    if (searchTgInput) searchTgInput.addEventListener('input', applyFilterAndSortTenants);

    const searchWaInput = document.getElementById('searchWhatsapp');
    if (searchWaInput) searchWaInput.addEventListener('input', applyFilterAndSortWaGroups);

    // Mobile: toggle expand search box Telegram
    const toggleTg = document.getElementById('searchToggleTelegram');
    const boxTg = document.getElementById('searchBoxTelegram');
    if (toggleTg && boxTg) {
        toggleTg.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = boxTg.classList.toggle('expanded');
            if (isOpen) { boxTg.querySelector('input')?.focus(); }
        });
    }

    // Mobile: toggle expand search box WhatsApp
    const toggleWa = document.getElementById('searchToggleWhatsapp');
    const boxWa = document.getElementById('searchBoxWhatsapp');
    if (toggleWa && boxWa) {
        toggleWa.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = boxWa.classList.toggle('expanded');
            if (isOpen) { boxWa.querySelector('input')?.focus(); }
        });
    }

    // Tutup search mobile jika klik di luar area search-wrapper
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#tab-telegram .search-wrapper')) {
            boxTg?.classList.remove('expanded');
        }
        if (!e.target.closest('#tab-whatsapp .search-wrapper')) {
            boxWa?.classList.remove('expanded');
        }
    });

    // ── Placeholder Typing Animation ────────────────────────────────────────────
    if (searchTgInput) initTypingPlaceholder(searchTgInput, ["Cari Bot ID...", "Cari Shop Name...", "Cari @username..."]);
    if (searchWaInput) initTypingPlaceholder(searchWaInput, ["Cari Group ID...", "Cari Group Name...", "Cari Renter Name..."]);

    // ── Copy CSV Event Listeners ────────────────────────────────────────────────
    const btnCopyTg = document.getElementById('btnCopyTelegram');
    if (btnCopyTg) btnCopyTg.addEventListener('click', () => handleCopyCsv('telegram'));

    const btnCopyWa = document.getElementById('btnCopyWhatsapp');
    if (btnCopyWa) btnCopyWa.addEventListener('click', () => handleCopyCsv('whatsapp'));



    async function handleRefresh() {
        const icon = btnRefresh?.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        if (btnRefresh) btnRefresh.disabled = true;

        invalidateStatsCache(); // Force fresh data on manual refresh

        try {
            await Promise.all([loadStats(), loadActiveTab()]);
            showToast('Dashboard data refreshed', 'success');
        } catch (err) {
            console.error('Refresh error:', err);
            showToast('Failed to refresh data', 'error');
        } finally {
            if (icon) icon.classList.remove('fa-spin');
            if (btnRefresh) btnRefresh.disabled = false;
        }
    }

    function handleLogout() {
        localStorage.removeItem('master_secret');
        adminSecret = '';
        transitionAppToLogin();
        showToast('Logged out successfully', 'success');
    }

    if (isPreviewLoginMode) {
        console.log('[MasterDashboard] Preview Login mode — displaying login screen');
        loginOverlay.style.display = 'flex';
        mainApp.style.display = 'none';
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = document.getElementById('loginBtn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';
            }
            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-lock"></i> Access Dashboard';
                }
                showToast('Login successful — Welcome to Master Dashboard', 'success');
                transitionLoginToApp();
                loadStats();
                loadActiveTab();
            }, 800);
        });
        if (btnLogout) btnLogout.addEventListener('click', handleLogout);
        if (btnRefresh) btnRefresh.addEventListener('click', handleRefresh);
        return;
    }

    if (isPreviewMode) {
        console.log('[MasterDashboard] Preview mode — mock data loaded');
        loadStats();
        if (btnLogout) btnLogout.addEventListener('click', handleLogout);
        if (btnRefresh) btnRefresh.addEventListener('click', handleRefresh);
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
                showToast('Login successful — Welcome to Master Dashboard', 'success');
                transitionLoginToApp();
                loadActiveTab();
            } else {
                showToast('Invalid Secret Key', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-lock"></i> Access Dashboard';
            }
        });
    });

    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
    if (btnRefresh) btnRefresh.addEventListener('click', handleRefresh);
});

// ── Typing Animation Logic ──────────────────────────────────────────────────
function initTypingPlaceholder(element, texts) {
    let textIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let typingDelay = 100;
    let erasingDelay = 50;
    let pauseBetween = 1500;

    function type() {
        const currentText = texts[textIndex];
        
        if (isDeleting) {
            element.setAttribute('placeholder', currentText.substring(0, charIndex - 1));
            charIndex--;
        } else {
            element.setAttribute('placeholder', currentText.substring(0, charIndex + 1));
            charIndex++;
        }

        let delay = isDeleting ? erasingDelay : typingDelay;

        if (!isDeleting && charIndex === currentText.length) {
            delay = pauseBetween;
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            textIndex = (textIndex + 1) % texts.length;
            delay = 500;
        }

        setTimeout(type, delay);
    }

    setTimeout(type, 1000); // initial delay
}

// ── Tab Management ──────────────────────────────────────────────────────────
const TAB_ORDER = ['telegram', 'whatsapp'];

function setupTabListeners() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            if (targetTab === activeTab) return;

            const oldPane = document.getElementById(`tab-${activeTab}`);
            const newPane = document.getElementById(`tab-${targetTab}`);

            // 1. Simpan posisi scroll saat ini & tahan tinggi konten agar halaman tidak kolaps (mencegah scroll lompat ke atas)
            const savedScrollY = window.scrollY;
            if (oldPane && newPane) {
                const oldHeight = oldPane.offsetHeight;
                if (oldHeight > 0) {
                    newPane.style.minHeight = `${oldHeight}px`;
                }
            }

            activeTab = targetTab;
            tabBtns.forEach(b => b.classList.toggle('active', b === btn));
            
            const mainTabs = document.getElementById('mainTabs');
            if (mainTabs) {
                mainTabs.classList.remove('theme-telegram', 'theme-whatsapp');
                mainTabs.classList.add(`theme-${activeTab}`);
            }

            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('tab-fade-in');
                const isActive = pane.id === `tab-${activeTab}`;
                pane.classList.toggle('active', isActive);
                
                if (isActive) {
                    pane.classList.add('tab-fade-in');
                    pane.addEventListener('animationend', function handler() {
                        pane.classList.remove('tab-fade-in');
                        pane.removeEventListener('animationend', handler);
                    }, { once: true });
                }
            });

            // 2. Auto-scroll halus (Smooth Auto-Scroll) ke posisi tab & tabel
            if (mainTabs) {
                const rect = mainTabs.getBoundingClientRect();
                const targetY = window.scrollY + rect.top - 20; // 20px padding di atas tab
                if (window.scrollY > targetY) {
                    window.scrollTo({
                        top: Math.max(0, targetY),
                        behavior: 'smooth'
                    });
                }
            }

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
        return loadWaGroups();
    } else {
        return loadTenants();
    }
}

// ── WIB (Asia/Jakarta, UTC+7) Timezone & Grammar Date Helpers ───────────────
function getTodayWibString() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function calculateRemainingDaysWib(targetDateStr) {
    if (!targetDateStr) return null;
    const cleanDateStr = targetDateStr.split('T')[0];
    const todayWibStr = getTodayWibString();

    const targetDate = new Date(`${cleanDateStr}T00:00:00Z`);
    const todayWibDate = new Date(`${todayWibStr}T00:00:00Z`);

    return Math.round((targetDate - todayWibDate) / (1000 * 60 * 60 * 24));
}

function formatRemainingDaysText(days, isExpired = false) {
    if (days === null || days === undefined || isNaN(days)) return '-';
    if (days === 0) return 'Expires today';
    if (days === 1) return '1 day left';
    if (days > 1) return `${days} days left`;
    if (days === -1 || (isExpired && Math.abs(days) === 1)) return 'Minus 1 day';
    return `Minus ${Math.abs(days)} days`;
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
            transitionLoginToApp();
            loadActiveTab();
        }
        renderStats(activeTab === 'whatsapp' ? MOCK_WA_STATS : MOCK_STATS);
        return true;
    }

    const tab = activeTab;
    const now = Date.now();

    // Serve from cache if still valid (5 min TTL)
    if (_statsCache[tab] && (now - _statsCacheTime[tab]) < STATS_CACHE_TTL) {
        console.log(`[Cache] Stats cache hit for tab: ${tab}`);
        renderStats(_statsCache[tab]);
        return true;
    }

    try {
        const endpoint = tab === 'whatsapp' ? `${API_BASE}/wa-groups?action=stats` : `${API_BASE}/stats`;
        const res = await fetch(endpoint, {
            headers: { 'X-Admin-Secret': adminSecret }
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // Store in cache
        _statsCache[tab] = data.stats;
        _statsCacheTime[tab] = Date.now();
        console.log(`[Cache] Stats cache refreshed for tab: ${tab}`);

        if (loginOverlay.style.display !== 'none') {
            transitionLoginToApp();
            loadActiveTab();
        }

        renderStats(data.stats);
        return true;
    } catch (err) {
        console.error('Stats error:', err);
        return false;
    }
}

// ── Scroll & Viewport Observer (Refrensi: Admin Panel Card Scroll) ───────────
let _tableObserver = null;
let _tableStaggerIdx = 0;
let _tableStaggerReset = null;

function observeTableRows(tbody) {
  _tableStaggerIdx = 0;
  if (!_tableObserver) {
    _tableObserver = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter(e => e.isIntersecting);
        if (intersecting.length === 0) return;

        intersecting.sort((a, b) => (a.target.sectionRowIndex ?? 0) - (b.target.sectionRowIndex ?? 0));

        intersecting.forEach((entry) => {
          const el = entry.target;
          const delay = _tableStaggerIdx * 90;
          el.style.animationDelay = `${delay}ms`;
          el.querySelectorAll('td').forEach(td => {
            td.style.animationDelay = `${delay}ms`;
          });
          el.classList.add('visible');
          _tableStaggerIdx++;
          _tableObserver.unobserve(el);
          clearTimeout(_tableStaggerReset);
          _tableStaggerReset = setTimeout(() => {
            _tableStaggerIdx = 0;
          }, 400);
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px 50px 0px' }
    );
  }

  // Only observe rows not yet visible
  tbody.querySelectorAll('.table-row-item:not(.visible)').forEach((el) => _tableObserver.observe(el));
}

// ── Telegram Bot Tenants ─────────────────────────────────────────────────────
function renderTenants(tenants) {
    const tbody = document.getElementById('tenantsTableBody');

    if (tenants.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6" class="empty-state"><i class="fa-solid fa-box-open"></i><br>No tenants found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    tenants.forEach(t => {
        const tr = document.createElement('tr');
        tr.className = 'table-row-item';

        const expiry = t.subscription?.expiryDate ? new Date(t.subscription.expiryDate).toLocaleDateString('id-ID') : '-';
        const memberSinceHtml = formatMemberSinceHtml(t.created_at || t.createdAt);

        const remainingDays = t.subscription?.expiryDate 
            ? calculateRemainingDaysWib(t.subscription.expiryDate) 
            : (t.subscription?.remainingDays ?? 0);
        const isExpired = Boolean(t.subscription?.isExpired || (remainingDays !== null && remainingDays < 0));
        const remainingText = formatRemainingDaysText(remainingDays, isExpired);

        let subBadgeClass = 'badge-active';
        let subBadgeText = t.subscription?.status || 'ACTIVE';
        if (isExpired) {
            subBadgeClass = 'badge-suspended';
            subBadgeText = 'EXPIRED';
        } else if (t.subscription?.status === 'TRIAL') {
            subBadgeClass = 'badge-trial';
        }

        const tenantStatusClass = (t.status === 'ACTIVE' && !isExpired) ? 'badge-active' : (t.status === 'BANNED' ? 'badge-banned' : 'badge-suspended');
        const displayStatus = (t.status === 'EXPIRED' || isExpired) ? 'INACTIVE' : t.status;

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
                    <span class="badge ${tenantStatusClass}">${escapeHtml(displayStatus)}</span>
                    ${memberSinceHtml ? `<br>${memberSinceHtml}` : ''}
                </div>
            </td>
            <td data-label="Rental" style="text-align: center;">
                <div class="cell-value">
                    <span class="badge ${subBadgeClass}">${escapeHtml(subBadgeText)}</span><br>
                    <small>${escapeHtml(t.subscription?.plan || 'Standard')}</small>
                </div>
            </td>
            <td data-label="Expiry" style="text-align: center;">
                <div class="cell-value">
                    ${expiry}<br>
                    <small style="color:${isExpired ? 'var(--danger-color)' : 'var(--text-muted)'}">
                        ${escapeHtml(remainingText)}
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

    requestAnimationFrame(() => {
        observeTableRows(tbody);
        const pane = tbody.closest('.tab-pane');
        if (pane) pane.style.minHeight = '';
    });
}

// ── Auto-Sort & Filtering Logic (Client-Side, 0 DB queries) ───────────────────
function sortTenantsByExpiry(list) {
    return [...list].sort((a, b) => {
        const dA = a.subscription?.expiryDate ? calculateRemainingDaysWib(a.subscription.expiryDate) : (a.subscription?.remainingDays ?? 9999);
        const dB = b.subscription?.expiryDate ? calculateRemainingDaysWib(b.subscription.expiryDate) : (b.subscription?.remainingDays ?? 9999);
        return (dA ?? 9999) - (dB ?? 9999);
    });
}

function sortWaGroupsByExpiry(list) {
    return [...list].sort((a, b) => {
        const dA = a.paid_until ? calculateRemainingDaysWib(a.paid_until) : 9999;
        const dB = b.paid_until ? calculateRemainingDaysWib(b.paid_until) : 9999;
        return (dA ?? 9999) - (dB ?? 9999);
    });
}

function applyFilterAndSortTenants() {
    const query = (document.getElementById('searchTelegram')?.value || '').toLowerCase().trim();
    let list = _currentTenants;

    if (query) {
        list = list.filter(t =>
            String(t.bot_id || '').toLowerCase().includes(query) ||
            String(t.shop_name || '').toLowerCase().includes(query) ||
            String(t.username || '').toLowerCase().includes(query)
        );
    }

    renderTenants(sortTenantsByExpiry(list));
}

function applyFilterAndSortWaGroups() {
    const query = (document.getElementById('searchWhatsapp')?.value || '').toLowerCase().trim();
    let list = _currentWaGroups;

    if (query) {
        list = list.filter(g => {
            const gid = String(g.target_group_id || g.store_group_id || g.id || '').toLowerCase();
            return (
                gid.includes(query) ||
                String(g.group_name || '').toLowerCase().includes(query) ||
                String(g.renter_name || '').toLowerCase().includes(query)
            );
        });
    }

    renderWaGroups(sortWaGroupsByExpiry(list));
}

const minDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadTenants() {
    const tbody = document.getElementById('tenantsTableBody');
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6" class="empty-state">${SVG_SPINNER}<br><span class="loading-text">Loading data...</span></td></tr>`;

    if (isPreviewMode) {
        await minDelay(1000);
        _currentTenants = MOCK_TENANTS;
        applyFilterAndSortTenants();
        return;
    }

    try {
        const [res] = await Promise.all([
            fetch(`${API_BASE}/tenants?limit=100`, {
                headers: { 'X-Admin-Secret': adminSecret }
            }),
            minDelay(600)
        ]);
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        _currentTenants = data.tenants;
        applyFilterAndSortTenants();
    } catch (err) {
        showToast(err.message, 'error');
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6" class="empty-state" style="color:var(--danger-color)"><i class="fa-solid fa-triangle-exclamation"></i><br>Failed to load data</td></tr>`;
    }
}

// ── WhatsApp Bot Groups ──────────────────────────────────────────────────────
function renderWaGroups(groups) {
    const tbody = document.getElementById('waGroupsTableBody');

    if (groups.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6" class="empty-state"><i class="fa-solid fa-box-open"></i><br>No WhatsApp groups found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    groups.forEach(g => {
        const tr = document.createElement('tr');
        tr.className = 'table-row-item';

        const displayGroupId = g.target_group_id || g.store_group_id || g.id;
        const memberSinceHtml = formatMemberSinceHtml(g.joined_at);
        const isActive = Boolean(g.is_active);

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

            const diffDays = calculateRemainingDaysWib(g.paid_until);
            if (diffDays !== null) {
                if (diffDays < 0) isExpired = true;
                remainingText = formatRemainingDaysText(diffDays, isExpired);
            }
        }

        let statusBadgeText = isActive ? 'ACTIVE' : 'INACTIVE';
        if (isExpired) {
            statusBadgeText = 'EXPIRED';
        }
        const statusBadgeClass = (!isExpired && isActive) ? 'badge-active' : 'badge-suspended';

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

    requestAnimationFrame(() => {
        observeTableRows(tbody);
        const pane = tbody.closest('.tab-pane');
        if (pane) pane.style.minHeight = '';
    });
}

async function loadWaGroups() {
    const tbody = document.getElementById('waGroupsTableBody');
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6" class="empty-state">${SVG_SPINNER}<br><span class="loading-text">Loading data...</span></td></tr>`;

    if (isPreviewMode) {
        await minDelay(1000);
        _currentWaGroups = MOCK_WA_GROUPS;
        applyFilterAndSortWaGroups();
        return;
    }

    try {
        const [res] = await Promise.all([
            fetch(`${API_BASE}/wa-groups?action=list`, {
                headers: { 'X-Admin-Secret': adminSecret }
            }),
            minDelay(600)
        ]);
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        _currentWaGroups = data.groups;
        applyFilterAndSortWaGroups();
    } catch (err) {
        showToast(err.message, 'error');
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6" class="empty-state" style="color:var(--danger-color)"><i class="fa-solid fa-triangle-exclamation"></i><br>Failed to load data</td></tr>`;
    }
}

// ── CSV Export & Clipboard Logic ─────────────────────────────────────────────
function csvEscape(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
}

async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return new Promise((resolve, reject) => {
        const successful = document.execCommand('copy');
        textArea.remove();
        if (successful) resolve();
        else reject(new Error('Copy command failed'));
    });
}

function generateTelegramCsv(tenants) {
    const headers = ['Bot ID', 'Shop Name', 'Username', 'Status', 'Member Since', 'Rental Plan', 'Expiry Date', 'Remaining Days'];
    const rows = tenants.map(t => {
        const remainingDays = t.subscription?.expiryDate 
            ? calculateRemainingDaysWib(t.subscription.expiryDate) 
            : (t.subscription?.remainingDays ?? 0);
        const isExpired = Boolean(t.subscription?.isExpired || (remainingDays !== null && remainingDays < 0));
        const displayStatus = (t.status === 'EXPIRED' || isExpired) ? 'INACTIVE' : (t.status || 'ACTIVE');
        const remainingText = formatRemainingDaysText(remainingDays, isExpired);

        let memberSince = '-';
        if (t.created_at || t.createdAt) {
            const d = new Date(t.created_at || t.createdAt);
            if (!isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                memberSince = `${dd}/${mm}/${yyyy}`;
            }
        }

        let expiryDate = '-';
        if (t.subscription?.expiryDate) {
            const d = new Date(t.subscription.expiryDate);
            if (!isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                expiryDate = `${dd}/${mm}/${yyyy}`;
            }
        }

        return [
            csvEscape(t.bot_id || ''),
            csvEscape(t.shop_name || ''),
            csvEscape(t.username ? `@${t.username}` : ''),
            csvEscape(displayStatus),
            csvEscape(memberSince),
            csvEscape(t.subscription?.plan || 'Standard'),
            csvEscape(expiryDate),
            csvEscape(remainingText)
        ].join(',');
    });

    return [headers.map(h => csvEscape(h)).join(','), ...rows].join('\r\n');
}

function generateWaCsv(groups) {
    const headers = ['Group ID', 'Group Name', 'Renter Name', 'Status', 'Member Since', 'Expiry Date', 'Remaining Days'];
    const rows = groups.map(g => {
        const displayGroupId = g.target_group_id || g.store_group_id || g.id || '';
        const isActive = Boolean(g.is_active);
        let isExpired = false;
        let remainingDays = null;
        let remainingText = '-';

        if (g.paid_until) {
            remainingDays = calculateRemainingDaysWib(g.paid_until);
            if (remainingDays !== null) {
                if (remainingDays < 0) isExpired = true;
                remainingText = formatRemainingDaysText(remainingDays, isExpired);
            }
        }

        let statusText = isActive ? 'ACTIVE' : 'INACTIVE';
        if (isExpired) statusText = 'EXPIRED';

        let memberSince = '-';
        if (g.joined_at) {
            const d = new Date(g.joined_at);
            if (!isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                memberSince = `${dd}/${mm}/${yyyy}`;
            }
        }

        let expiryDisplay = '-';
        if (g.paid_until) {
            const parts = g.paid_until.split('-');
            if (parts.length === 3) {
                expiryDisplay = `${parts[2]}/${parts[1]}/${parts[0]}`;
            } else {
                expiryDisplay = g.paid_until;
            }
        }

        return [
            csvEscape(displayGroupId),
            csvEscape(g.group_name || ''),
            csvEscape(g.renter_name || '-'),
            csvEscape(statusText),
            csvEscape(memberSince),
            csvEscape(expiryDisplay),
            csvEscape(remainingText)
        ].join(',');
    });

    return [headers.map(h => csvEscape(h)).join(','), ...rows].join('\r\n');
}

async function handleCopyCsv(type) {
    const btn = type === 'telegram' ? document.getElementById('btnCopyTelegram') : document.getElementById('btnCopyWhatsapp');
    let csvData = '';

    if (type === 'telegram') {
        const query = (document.getElementById('searchTelegram')?.value || '').toLowerCase().trim();
        let list = _currentTenants;
        if (query) {
            list = list.filter(t =>
                String(t.bot_id || '').toLowerCase().includes(query) ||
                String(t.shop_name || '').toLowerCase().includes(query) ||
                String(t.username || '').toLowerCase().includes(query)
            );
        }
        list = sortTenantsByExpiry(list);
        if (!list || list.length === 0) {
            showToast('No data to copy', 'error');
            return;
        }
        csvData = generateTelegramCsv(list);
    } else {
        const query = (document.getElementById('searchWhatsapp')?.value || '').toLowerCase().trim();
        let list = _currentWaGroups;
        if (query) {
            list = list.filter(g => {
                const gid = String(g.target_group_id || g.store_group_id || g.id || '').toLowerCase();
                return (
                    gid.includes(query) ||
                    String(g.group_name || '').toLowerCase().includes(query) ||
                    String(g.renter_name || '').toLowerCase().includes(query)
                );
            });
        }
        list = sortWaGroupsByExpiry(list);
        if (!list || list.length === 0) {
            showToast('No data to copy', 'error');
            return;
        }
        csvData = generateWaCsv(list);
    }

    try {
        await copyToClipboard(csvData);

        if (btn) {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check" style="color: #34d399;"></i> <span>Copied!</span>';
            btn.disabled = true;
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }, 1800);
        }

        showToast('CSV Copied!', 'success');
    } catch (err) {
        console.error('Copy CSV error:', err);
        showToast('Failed to copy CSV', 'error');
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
        invalidateStatsCache(); // Data changed — bust the cache
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
        invalidateStatsCache(); // Data changed — bust the cache
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
        invalidateStatsCache(); // Data changed — bust the cache
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
        invalidateStatsCache(); // Data changed — bust the cache
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
        invalidateStatsCache(); // Data changed — bust the cache
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
        invalidateStatsCache(); // Data changed — bust the cache
        loadWaGroups();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        isMutatingWaGroup = false;
    }
}

// ── Modal & Toast UI Helpers ────────────────────────────────────────────────
function transitionLoginToApp() {
    const overlay = document.getElementById('loginOverlay') || loginOverlay;
    const app = document.getElementById('mainApp') || mainApp;

    if (!overlay || overlay.style.display === 'none') {
        if (app) {
            app.style.display = 'block';
            app.classList.add('app-enter');
        }
        return;
    }

    overlay.classList.add('fade-out');
    if (app) {
        app.style.display = 'block';
        app.classList.remove('app-exit');
        app.classList.add('app-enter');
    }

    setTimeout(() => {
        if (overlay) {
            overlay.style.display = 'none';
            overlay.classList.remove('fade-out');
        }
    }, 450);
}

function transitionAppToLogin() {
    const overlay = document.getElementById('loginOverlay') || loginOverlay;
    const app = document.getElementById('mainApp') || mainApp;

    if (app) {
        app.classList.remove('app-enter');
        app.classList.add('app-exit');
    }

    if (overlay) {
        overlay.classList.remove('fade-out');
        overlay.style.display = 'flex';
        overlay.classList.add('fade-in');

        // Reset password input & verify button state
        const secretInput = document.getElementById('adminSecret');
        if (secretInput) secretInput.value = '';
        const btn = document.getElementById('loginBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-lock"></i> Access Dashboard';
        }
    }

    setTimeout(() => {
        if (app) {
            app.style.display = 'none';
            app.classList.remove('app-exit');
        }
        if (overlay) {
            overlay.classList.remove('fade-in');
        }
    }, 450);
}

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
        toast.style.animation = 'fadeOutToast 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
