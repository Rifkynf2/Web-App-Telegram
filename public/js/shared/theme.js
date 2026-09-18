const THEME_KEY = 'rnf-theme';

export function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved, false);
}

export function toggleTheme() {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
}

function applyTheme(theme, save) {
    document.documentElement.dataset.theme = theme;
    if (save) localStorage.setItem(THEME_KEY, theme);
    updateButton(theme, save);
}

function updateButton(theme, animate = false) {
    const btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (!icon) return;

    const newClass = theme === 'light'
        ? 'fa-solid fa-moon text-indigo-500 text-xl'
        : 'fa-solid fa-sun text-amber-400 text-xl';

    if (!animate) {
        icon.className = newClass;
        return;
    }

    icon.classList.add('theme-icon-out');
    setTimeout(() => {
        icon.className = newClass + ' theme-icon-in';
        setTimeout(() => icon.classList.remove('theme-icon-in'), 300);
    }, 180);
}
