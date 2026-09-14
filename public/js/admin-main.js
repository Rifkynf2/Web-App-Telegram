import { initAdminApp } from './adminProducts.js?v=2.0.1';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAdminApp();
    });
} else {
    initAdminApp();
}
