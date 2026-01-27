export class DatePicker {
    constructor(inputId, options = {}) {
        this.input = document.getElementById(inputId);
        if (!this.input) return;

        this.options = {
            format: 'DD/MM/YYYY',
            ...options
        };

        this.date = new Date();
        this.selectedDate = null;
        this.isVisible = false;

        this.init();
    }

    init() {
        // Create Wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'datepicker-wrapper';
        this.input.parentNode.insertBefore(this.wrapper, this.input);
        this.wrapper.appendChild(this.input);

        // Read-only input to prevent typing garbage
        this.input.readOnly = true;
        this.input.classList.add('datepicker-input');

        // Add Icon
        const icon = document.createElement('i');
        icon.dataset.lucide = 'calendar';
        icon.className = 'datepicker-icon';
        this.wrapper.appendChild(icon);

        // Create Calendar DOM
        this.calendar = document.createElement('div');
        this.calendar.className = 'datepicker-calendar';
        this.wrapper.appendChild(this.calendar);

        // Bind Events
        this.input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.close();
            }
        });

        this.renderCalendar();
        if (window.lucide) lucide.createIcons();
    }

    toggle() {
        if (this.isVisible) this.close();
        else this.open();
    }

    open() {
        this.isVisible = true;
        this.calendar.classList.add('active');
        this.renderCalendar();
        // Position check could go here
    }

    close() {
        this.isVisible = false;
        this.calendar.classList.remove('active');
    }

    renderCalendar() {
        const year = this.date.getFullYear();
        const month = this.date.getMonth();

        // Header
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

        let html = `
            <div class="datepicker-header">
                <button type="button" class="dp-prev"><i data-lucide="chevron-left"></i></button>
                <div class="dp-title">
                    <span class="dp-month">${monthNames[month]}</span>
                    <span class="dp-year">${year}</span>
                </div>
                <button type="button" class="dp-next"><i data-lucide="chevron-right"></i></button>
            </div>
            <div class="datepicker-body">
                <div class="dp-weekdays">
                    <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
                </div>
                <div class="dp-days">
        `;

        // Days Logic
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();

        // Empty slots prev month
        for (let i = 0; i < firstDay; i++) {
            html += `<span class="dp-day prev-month">${prevMonthDays - firstDay + 1 + i}</span>`;
        }

        // Days
        for (let i = 1; i <= daysInMonth; i++) {
            const isToday = new Date().toDateString() === new Date(year, month, i).toDateString();
            let isSelected = false;
            if (this.selectedDate) {
                isSelected = this.selectedDate.toDateString() === new Date(year, month, i).toDateString();
            }

            html += `<span class="dp-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-day="${i}">${i}</span>`;
        }

        html += `   </div>
            </div>
        `;

        this.calendar.innerHTML = html;
        if (window.lucide) lucide.createIcons();

        // Attach Calendar Events
        this.calendar.querySelector('.dp-prev').onclick = (e) => {
            e.stopPropagation();
            this.date.setMonth(this.date.getMonth() - 1);
            this.renderCalendar();
        };
        this.calendar.querySelector('.dp-next').onclick = (e) => {
            e.stopPropagation();
            this.date.setMonth(this.date.getMonth() + 1);
            this.renderCalendar();
        };

        this.calendar.querySelectorAll('.dp-day:not(.prev-month)').forEach(day => {
            day.onclick = (e) => {
                e.stopPropagation();
                const d = parseInt(e.target.dataset.day);
                this.selectDate(d);
            };
        });
    }

    selectDate(day) {
        this.selectedDate = new Date(this.date.getFullYear(), this.date.getMonth(), day);

        // Format Output (YYYY-MM-DD for value, Display for visual)
        const y = this.selectedDate.getFullYear();
        const m = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');

        // Update Internal Value (hidden or attribute)
        this.input.dataset.value = `${y}-${m}-${d}`;
        this.input.value = `${d}/${m}/${y}`; // Visual Format

        // Trigger Change Event
        const event = new Event('change', { bubbles: true });
        this.input.dispatchEvent(event);

        this.close();
    }

    // API to get raw YYYY-MM-DD
    getValue() {
        return this.input.dataset.value;
    }
}
