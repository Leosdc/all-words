export const Toast = {
    show: (message, type = 'info', duration = 3000) => {
        // Remove existing container if any (though we usually append to it)
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Icon based on type
        let iconHtml = '';
        if (type === 'success') iconHtml = '<i data-lucide="check-circle"></i>';
        else if (type === 'error') iconHtml = '<i data-lucide="alert-circle"></i>';
        else if (type === 'warning') iconHtml = '<i data-lucide="alert-triangle"></i>';
        else iconHtml = '<i data-lucide="info"></i>';

        toast.innerHTML = `
            <div class="toast-content">
                ${iconHtml}
                <span>${message}</span>
            </div>
            <button class="toast-close">&times;</button>
        `;

        container.appendChild(toast);

        // Initialize icon
        if (window.lucide) lucide.createIcons();

        // Animation in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Close logic
        const close = () => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentElement) toast.parentElement.removeChild(toast);
            }, 300);
        };

        toast.querySelector('.toast-close').onclick = close;

        // Auto close
        if (duration > 0) {
            setTimeout(close, duration);
        }
    }
};
