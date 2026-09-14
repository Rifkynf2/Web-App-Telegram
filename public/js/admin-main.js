import { initAdminApp } from './adminProducts.js';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAdminApp();
    });
} else {
    initAdminApp();
}
