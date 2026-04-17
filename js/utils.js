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

export const getImageFallback = (url, name = 'Product') => {
    if (url && url.trim() !== '') return url;
    
    // Use placehold.co with theme-friendly colors and product name
    const encodedName = encodeURIComponent(name);
    return `https://placehold.co/400x400/1e293b/white?text=${encodedName}`;
};
