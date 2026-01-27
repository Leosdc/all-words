export class Modal {
    constructor() {
        this.createModalElement();
    }

    createModalElement() {
        // Create the overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';

        // Create content container
        this.content = document.createElement('div');
        this.content.className = 'modal-content';

        // Append to body (hidden by default)
        this.overlay.appendChild(this.content);
        document.body.appendChild(this.overlay);

        // Close on overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });
    }

    show({ title, message, type = 'success', icon = null, btnText = 'Entendi' }) {
        // Determine Icon based on type if not provided
        let iconName = icon;
        if (!iconName) {
            if (type === 'error') iconName = 'alert-octagon';
            else if (type === 'warning') iconName = 'alert-triangle';
            else iconName = 'check-circle-2';
        }

        // Build HTML
        this.content.className = `modal-content modal-type-${type}`;
        this.content.innerHTML = `
            <div class="modal-icon-wrapper">
                <i data-lucide="${iconName}" style="width: 32px; height: 32px;"></i>
            </div>
            <h3>${title}</h3>
            <p>${message}</p>
            <div class="modal-actions">
                <button class="modal-btn">${btnText}</button>
            </div>
        `;

        // Re-init icons
        if (window.lucide) {
            lucide.createIcons({
                root: this.content
            });
        }

        // Handle Button Click
        const btn = this.content.querySelector('.modal-btn');
        btn.onclick = () => this.close();

        // Show
        setTimeout(() => {
            this.overlay.classList.add('active');
        }, 10);
    }

    async confirm({ title, message, type = 'warning', confirmText = 'Confirmar', cancelText = 'Cancelar', icon = 'alert-triangle' }) {
        return new Promise((resolve) => {
            // Build HTML
            this.content.className = `modal-content modal-type-${type}`;
            this.content.innerHTML = `
                <div class="modal-icon-wrapper">
                    <i data-lucide="${icon}" style="width: 32px; height: 32px;"></i>
                </div>
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-actions" style="display: flex; gap: 1rem; width: 100%;">
                    <button class="modal-btn-cancel" style="flex: 1; padding: 0.8rem; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b; cursor: pointer; font-weight: 500;">${cancelText}</button>
                    <button class="modal-btn-confirm" style="flex: 1; padding: 0.8rem; border-radius: 12px; border: none; background: ${type === 'error' ? '#ef4444' : '#0ea5e9'}; color: white; cursor: pointer; font-weight: 600;">${confirmText}</button>
                </div>
            `;

            if (window.lucide) lucide.createIcons({ root: this.content });

            const btnCancel = this.content.querySelector('.modal-btn-cancel');
            const btnConfirm = this.content.querySelector('.modal-btn-confirm');

            btnCancel.onclick = () => {
                this.close();
                resolve(false);
            };

            btnConfirm.onclick = () => {
                this.close();
                resolve(true);
            };

            // Show
            setTimeout(() => {
                this.overlay.classList.add('active');
            }, 10);
        });
    }

    close() {
        this.overlay.classList.remove('active');
        // Optional: remove from DOM after transition, but keeping it is more performant for reuse
    }
}

// Singleton instance
export const modal = new Modal();
