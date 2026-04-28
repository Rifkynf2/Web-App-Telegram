const fs = require('fs');
let code = fs.readFileSync('public/js/buyer.js', 'utf8');
const target = \        detailModalCard.addEventListener('touchstart', (e) => {
            // Only initiate drag from the top area (handle + header region)
            const touchY = e.touches[0].clientY;
            const cardRect = detailModalCard.getBoundingClientRect();
            const touchOffset = touchY - cardRect.top;
            if (touchOffset > 80) return; // Only top 80px is draggable

            startY = e.touches[0].clientY;
            currentY = startY;
            isDragging = true;
            detailModalCard.style.transition = 'none';
        }, { passive: true });

        detailModalCard.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            if (deltaY > 0) {
                detailModalCard.style.transform = \\\	ranslateY(\\$\{deltaY\}px)\\\;
                // Fade backdrop as user drags
                const opacity = Math.max(0.2, 1 - (deltaY / 400));
                detailModal.style.backgroundColor = \\\gba(0,0,0,\\$\{opacity * 0.8\})\\\;
            }
        }, { passive: true });

        detailModalCard.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            const deltaY = currentY - startY;
            detailModalCard.style.transition = 'transform 0.3s ease';
            detailModal.style.transition = 'background-color 0.3s ease';

            if (deltaY > 100) {
                // Threshold exceeded — close modal
                closeDetailModal();
            } else {
                // Snap back
                detailModalCard.style.transform = 'translateY(0)';
                detailModal.style.backgroundColor = '';
            }

            // Clean up inline styles after animation
            setTimeout(() => {
                detailModalCard.style.transition = '';
                detailModal.style.transition = '';
                detailModal.style.backgroundColor = '';
            }, 350);
        }, { passive: true });\;

const replacement = \        detailModalCard.addEventListener('pointerdown', (e) => {
            // Only initiate drag from the top area (handle + header region)
            const touchY = e.clientY;
            const cardRect = detailModalCard.getBoundingClientRect();
            const touchOffset = touchY - cardRect.top;
            if (touchOffset > 80) return; // Only top 80px is draggable

            startY = e.clientY;
            currentY = startY;
            isDragging = true;
            detailModalCard.style.transition = 'none';
            try { detailModalCard.setPointerCapture(e.pointerId); } catch(err){}
        });

        detailModalCard.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            currentY = e.clientY;
            const deltaY = currentY - startY;
            if (deltaY > 0) {
                detailModalCard.style.transform = \\\	ranslateY(\\$\{deltaY\}px)\\\;
                // Fade backdrop as user drags
                const opacity = Math.max(0.2, 1 - (deltaY / 400));
                detailModal.style.backgroundColor = \\\gba(0,0,0,\\$\{opacity * 0.8\})\\\;
            }
        });

        const handlePointerUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            try { detailModalCard.releasePointerCapture(e.pointerId); } catch(err){}
            const deltaY = currentY - startY;
            detailModalCard.style.transition = 'transform 0.3s ease';
            detailModal.style.transition = 'background-color 0.3s ease';

            if (deltaY > 100) {
                // Threshold exceeded — close modal
                closeDetailModal();
            } else {
                // Snap back
                detailModalCard.style.transform = 'translateY(0)';
                detailModal.style.backgroundColor = '';
            }

            // Clean up inline styles after animation
            setTimeout(() => {
                detailModalCard.style.transition = '';
                detailModal.style.transition = '';
                detailModal.style.backgroundColor = '';
            }, 350);
        };
        
        detailModalCard.addEventListener('pointerup', handlePointerUp);
        detailModalCard.addEventListener('pointercancel', handlePointerUp);\;

code = code.split(target.replace(/\\r\\n/g, '\\n')).join(replacement);
code = code.split(target.replace(/\\n/g, '\\r\\n')).join(replacement);
fs.writeFileSync('public/js/buyer.js', code);
console.log('Done');

