export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

export const hideLoading = () => {
    const elLoading = document.getElementById('loading-state');
    if (elLoading) {
        elLoading.classList.add('hidden');
    }
};

export const setupGlobalErrorHandlers = () => {
    window.addEventListener('error', (e) => {
        console.error('Global Error:', e);
    });
};

export const normalizeImageUrl = (url) => {
    const value = String(url || '').trim();
    if (!value) return '';

    try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;

        // Known page URLs from image hosts that are not direct image assets.
        if (host.includes('ibb.co')) return null;
        if (host.includes('imgbb.com') && !/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(parsed.pathname)) return null;

        return parsed.toString();
    } catch (_) {
        return null;
    }
};

export const getLowestVariantPrice = (variants = []) => {
    const prices = (variants || [])
        .map((variant) => parseInt(variant.price, 10))
        .filter((price) => Number.isFinite(price) && price >= 0);

    return prices.length ? Math.min(...prices) : 0;
};

export const getImageFallback = (url, name = 'Product') => {
    const normalizedUrl = normalizeImageUrl(url);
    if (normalizedUrl) return normalizedUrl;
    
    // Use placehold.co with theme-friendly colors and product name
    const encodedName = encodeURIComponent(name);
    return `https://placehold.co/400x400/1e293b/white?text=${encodedName}`;
};
