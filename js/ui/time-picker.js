export class TimePicker {
    constructor(inputId) {
        this.input = document.getElementById(inputId);
        if (!this.input) return;

        this.isVisible = false;
        this.selectedHour = '12';
        this.selectedMinute = '00';

        this.init();
    }

    init() {
        // Wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'datepicker-wrapper'; // Reuse wrapper style
        this.input.parentNode.insertBefore(this.wrapper, this.input);
        this.wrapper.appendChild(this.input);

        this.input.readOnly = true;
        this.input.classList.add('datepicker-input'); // Reuse input style

        // Icon
        const icon = document.createElement('i');
        icon.dataset.lucide = 'clock';
        icon.className = 'datepicker-icon';
        this.wrapper.appendChild(icon);

        // Picker DOM (Portal)
        this.picker = document.createElement('div');
        this.picker.className = 'datepicker-calendar timepicker-container'; // Reuse basic container style
        document.body.appendChild(this.picker);

        // Events
        this.input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target) && !this.picker.contains(e.target)) {
                this.close();
            }
        });

        window.addEventListener('resize', () => {
            if (this.isVisible) this.updatePosition();
        });

        if (window.lucide) lucide.createIcons();
    }

    render() {
        let html = `
            <div class="timepicker-columns">
                <div class="tp-col">
                    <div class="tp-header">Hora</div>
                    <div class="tp-list">
                        ${Array.from({ length: 24 }, (_, i) => {
            const val = String(i).padStart(2, '0');
            const isSel = val === this.selectedHour;
            return `<div class="tp-item ${isSel ? 'selected' : ''}" data-h="${val}">${val}</div>`;
        }).join('')}
                    </div>
                </div>
                <div class="tp-col">
                    <div class="tp-header">Minuto</div>
                    <div class="tp-list">
                        ${Array.from({ length: 12 }, (_, i) => { // 5 min intervals for cleaner UI? Or all 60? User didn't specify, let's do 5 min steps + 00
            const val = String(i * 5).padStart(2, '0');
            const isSel = val === this.selectedMinute;
            return `<div class="tp-item ${isSel ? 'selected' : ''}" data-m="${val}">${val}</div>`;
        }).join('')}
                    </div>
                </div>
            </div>
            <div class="tp-footer">
                <button type="button" class="btn-primary" id="tp-confirm" style="width:100%; padding:0.5rem;">Confirmar</button>
            </div>
        `;

        this.picker.innerHTML = html;

        // Events
        this.picker.querySelectorAll('[data-h]').forEach(el => {
            el.onclick = (e) => {
                this.picker.querySelectorAll('[data-h]').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
                this.selectedHour = el.dataset.h;
            };
        });

        this.picker.querySelectorAll('[data-m]').forEach(el => {
            el.onclick = (e) => {
                this.picker.querySelectorAll('[data-m]').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
                this.selectedMinute = el.dataset.m;
            };
        });

        this.picker.querySelector('#tp-confirm').onclick = () => {
            this.confirm();
        };
    }

    updatePosition() {
        const rect = this.wrapper.getBoundingClientRect();
        this.picker.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        this.picker.style.left = (rect.left + window.scrollX) + 'px';
    }

    toggle() {
        if (this.isVisible) this.close();
        else this.open();
    }

    open() {
        this.isVisible = true;
        this.updatePosition(); // Calculate before showing
        this.picker.classList.add('active');
        this.render();

        // Scroll to selected
        setTimeout(() => {
            const h = this.picker.querySelector(`[data-h="${this.selectedHour}"]`);
            const m = this.picker.querySelector(`[data-m="${this.selectedMinute}"]`);

            if (h) {
                const container = h.parentElement;
                container.scrollTop = h.offsetTop - container.offsetTop - (container.clientHeight / 2) + (h.clientHeight / 2);
            }
            if (m) {
                const container = m.parentElement;
                container.scrollTop = m.offsetTop - container.offsetTop - (container.clientHeight / 2) + (m.clientHeight / 2);
            }
        }, 10);
    }

    close() {
        this.isVisible = false;
        this.picker.classList.remove('active');
    }

    confirm() {
        this.input.value = `${this.selectedHour}:${this.selectedMinute}`;
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
        this.close();
    }

    getValue() {
        return this.input.value;
    }
}
