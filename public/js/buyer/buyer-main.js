import { initBuyerApp } from './buyer.js';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initBuyerApp();
    });
} else {
    initBuyerApp();
}

