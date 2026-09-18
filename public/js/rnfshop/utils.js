// public/js/rnfshop/utils.js

export const formatRupiah = (num) => {
    const n = Number(num || 0);
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
    }).format(n);
};

export const formatDateID = (ymd) => {
    if (!ymd) return "-";
    const [y, m, d] = String(ymd).split("-");
    if (!y || !m || !d) return ymd;
    return `${d}/${m}/${y}`;
};

export const showAlert = async (title, text, icon = "info") => {
    if (typeof Swal !== "undefined") {
        await Swal.fire({
            title,
            text,
            icon,
            background: "#0d1322",
            color: "#f8fafc",
            confirmButtonColor: "#06b6d4",
            customClass: { popup: "liquid-card rounded-2xl" }
        });
    } else {
        alert(`${title}: ${text}`);
    }
};

export const showConfirm = async (title, text, confirmText = "Ya, Lanjutkan") => {
    if (typeof Swal !== "undefined") {
        const result = await Swal.fire({
            title,
            text,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#06b6d4",
            cancelButtonColor: "#f43f5e",
            confirmButtonText: confirmText,
            cancelButtonText: "Batal",
            background: "#0d1322",
            color: "#f8fafc",
            customClass: { popup: "liquid-card rounded-2xl" }
        });
        return result.isConfirmed;
    }
    return window.confirm(`${title}\n\n${text}`);
};

export function escAttr(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

export function getAppIconUrl(appName) {
    if (!appName) return '/assets/apps/default.webp';
    const raw = String(appName).trim().toLowerCase();

    // Contains check for common app variants
    if (raw.includes('netflix')) return '/assets/apps/netflix.webp';
    if (raw.includes('disney')) return '/assets/apps/disney.webp';
    if (raw.includes('hbo')) return '/assets/apps/hbo.webp';
    if (raw.includes('prime')) return '/assets/apps/prime.webp';
    if (raw.includes('getcontact') || raw.includes('get contact')) return '/assets/apps/getcontact.webp';
    if (raw.includes('surfshark')) return '/assets/apps/surfshark.webp';
    if (raw.includes('canva')) return '/assets/apps/canva.webp';
    if (raw.includes('chatgpt') || raw.includes('gpt')) return '/assets/apps/chatgpt.webp';
    if (raw.includes('spotify')) return '/assets/apps/spotify.webp';
    if (raw.includes('youtube') || raw.includes('yt')) return '/assets/apps/youtube.webp';
    if (raw.includes('capcut')) return '/assets/apps/capcut.webp';
    if (raw.includes('bstation') || raw.includes('bilibili')) return '/assets/apps/bstation.webp';
    if (raw.includes('vidio')) return '/assets/apps/vidio.webp';
    if (raw.includes('vision')) return '/assets/apps/vision.webp';
    if (raw.includes('viu')) return '/assets/apps/viu.webp';
    if (raw.includes('wetv')) return '/assets/apps/wetv.webp';
    if (raw.includes('iqiyi')) return '/assets/apps/iqiyi.webp';
    if (raw.includes('zoom')) return '/assets/apps/zoom.webp';
    if (raw.includes('tiktok')) return '/assets/apps/tiktok.webp';
    if (raw.includes('picsart')) return '/assets/apps/picsart.webp';
    if (raw.includes('instagram')) return '/assets/apps/instagram.webp';
    if (raw.includes('gemini')) return '/assets/apps/gemini.webp';
    if (raw.includes('crunchyroll')) return '/assets/apps/crunchyroll.webp';
    if (raw.includes('express')) return '/assets/apps/expressvpn.webp';
    if (raw.includes('hma')) return '/assets/apps/hma.webp';
    if (raw.includes('leonardo')) return '/assets/apps/leonardo.webp';
    if (raw.includes('scribd')) return '/assets/apps/scribd.webp';
    if (raw.includes('tmail') || raw.includes('temp mail')) return '/assets/apps/tmail.webp';
    if (raw.includes('vpn')) return '/assets/apps/vpn.webp';

    const slug = raw.replace(/[^a-z0-9]/g, '');
    const knownApps = [
        'bstation', 'canva', 'capcut', 'chatgpt', 'crunchyroll', 'default', 'disney',
        'expressvpn', 'gemini', 'getcontact', 'hbo', 'hma', 'instagram', 'iqiyi',
        'leonardo', 'netflix', 'picsart', 'prime', 'scribd', 'spotify', 'surfshark',
        'tiktok', 'tmail', 'vidio', 'vision', 'viu', 'vpn', 'wetv', 'youtube', 'zoom'
    ];
    if (knownApps.includes(slug)) {
        return `/assets/apps/${slug}.webp`;
    }
    return '/assets/apps/default.webp';
}

export function renderAppLogo(appName, className = "w-6 h-6 rounded-md object-contain") {
    const src = getAppIconUrl(appName);
    const safeAlt = escAttr(appName || "App");
    return `<img src="${src}" alt="${safeAlt}" class="${className}" loading="lazy" onerror="this.onerror=null; this.src='/assets/apps/default.webp';">`;
}

