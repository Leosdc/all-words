import { authService } from '../services/auth-service.js';

export const LoginView = {
    render: (intendedRole) => {
        const roleDisplay = intendedRole === 'teacher' ? '(Professor)' : '';
        return `
            <section id="login-view" class="view active">
                <button class="btn-back" id="btn-back"><i data-lucide="arrow-left"></i> Voltar</button>
                <div class="auth-container">
                    <div class="auth-card glass">
                        <div class="auth-header">
                            <h2>Bem-vindo ${roleDisplay}</h2>
                            <p>Acesse sua conta para continuar</p>
                        </div>
                        <form id="login-form">
                            <div class="input-group">
                                <label>E-mail</label>
                                <div class="input-wrapper">
                                    <i data-lucide="mail"></i>
                                    <input type="email" id="login-email" required placeholder="seu@email.com">
                                </div>
                            </div>
                            <div class="input-group">
                                <label>Senha</label>
                                <div class="input-wrapper">
                                    <i data-lucide="lock"></i>
                                    <input type="password" id="login-password" required placeholder="••••••••">
                                </div>
                            </div>
                            <button type="submit" class="btn-submit">Entrar</button>
                        </form>
                        <div class="auth-footer">
                            Não tem conta? <a href="#" id="link-create">Crie agora</a>
                        </div>
                    </div>
                </div>
            </section>
        `;
    },

    attachEvents: (navigate, intendedRole) => {
        // Back
        document.getElementById('btn-back').onclick = () => navigate('home');

        // Link to Register
        document.getElementById('link-create').onclick = (e) => {
            e.preventDefault();
            navigate('register');
        };

        // Form Submit
        document.getElementById('login-form').onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            await authService.login(email, password);
        };
    }
};

export const RegisterView = {
    render: (intendedRole) => {
        const roleLabel = intendedRole === 'teacher' ? 'Professor' : 'Estudante';
        return `
            <section id="register-view" class="view active">
                <button class="btn-back" id="btn-back-reg"><i data-lucide="arrow-left"></i> Voltar</button>
                <div class="auth-container">
                    <div class="auth-card glass">
                        <div class="auth-header">
                            <h2>Criar Conta de ${roleLabel}</h2>
                            <p>Preencha os dados abaixo</p>
                        </div>
                        <form id="register-form">
                            <div class="input-group">
                                <label>Nome Completo</label>
                                <div class="input-wrapper">
                                    <i data-lucide="user"></i>
                                    <input type="text" id="reg-name" required placeholder="Seu nome">
                                </div>
                            </div>
                            <div class="input-group">
                                <label>E-mail</label>
                                <div class="input-wrapper">
                                    <i data-lucide="mail"></i>
                                    <input type="email" id="reg-email" required placeholder="seu@email.com">
                                </div>
                            </div>
                            <div class="input-group">
                                <label>Senha</label>
                                <div class="input-wrapper">
                                    <i data-lucide="lock"></i>
                                    <input type="password" id="reg-password" required placeholder="••••••••">
                                </div>
                            </div>
                            <div id="teacher-selection-group" style="display: none;">
                                <div class="input-group">
                                    <label>Escolha seu Professor</label>
                                    <div class="custom-select-container" id="custom-teacher-select">
                                        <div class="custom-select-trigger">
                                            <i data-lucide="graduation-cap"></i>
                                            <span class="selected-text">Selecione seu professor</span>
                                            <i data-lucide="chevron-down" class="arrow"></i>
                                        </div>
                                        <div class="custom-select-options" id="teacher-options">
                                            <div class="select-option disabled">Carregando professores...</div>
                                        </div>
                                        <input type="hidden" id="reg-teacher" required>
                                    </div>
                                </div>
                            </div>
                            <button type="submit" class="btn-submit">Cadastrar</button>
                        </form>
                        <div class="auth-footer">
                            Já tem conta? <a href="#" id="link-login">Faça login</a>
                        </div>
                    </div>
                </div>
            </section>
        `;
    },

    attachEvents: (navigate, intendedRole) => {
        // Back
        document.getElementById('btn-back-reg').onclick = () => navigate('home');

        // Show/Hide Teacher Selection
        const teacherGroup = document.getElementById('teacher-selection-group');
        const teacherSelect = document.getElementById('reg-teacher');

        if (intendedRole === 'student') {
            teacherGroup.style.display = 'block';

            // Fetch Teachers
            const fetchTeachers = async () => {
                try {
                    const { db } = await import('../config/firebase.js');
                    const snapshot = await db.collection('users').where('role', '==', 'teacher').get();
                    const teachers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

                    const optionsContainer = document.getElementById('teacher-options');
                    const triggerText = document.querySelector('#custom-teacher-select .selected-text');
                    const hiddenInput = document.getElementById('reg-teacher');

                    if (teachers.length === 0) {
                        optionsContainer.innerHTML = '<div class="select-option disabled">Nenhum professor encontrado</div>';
                        return;
                    }

                    optionsContainer.innerHTML = teachers.map(t => `
                        <div class="select-option" data-value="${t.uid}">
                            <div class="avatar-mini">${t.name.substring(0, 2).toUpperCase()}</div>
                            <span>${t.name}</span>
                        </div>
                    `).join('');

                    // Add Event Listeners to Options
                    optionsContainer.querySelectorAll('.select-option').forEach(option => {
                        option.onclick = (e) => {
                            e.stopPropagation();
                            const val = option.dataset.value;
                            const text = option.querySelector('span').textContent;

                            // Update UI
                            optionsContainer.querySelectorAll('.select-option').forEach(opt => opt.classList.remove('selected'));
                            option.classList.add('selected');
                            triggerText.textContent = text;
                            hiddenInput.value = val;

                            // Close Dropdown
                            document.getElementById('custom-teacher-select').classList.remove('open');
                        };
                    });

                    if (window.lucide) lucide.createIcons();

                } catch (error) {
                    console.error("Error fetching teachers:", error);
                    document.getElementById('teacher-options').innerHTML = '<div class="select-option disabled">Erro ao carregar</div>';
                }
            };

            fetchTeachers();

            // Handle Dropdown Toggle
            const customSelect = document.getElementById('custom-teacher-select');
            if (customSelect) {
                customSelect.onclick = (e) => {
                    e.stopPropagation();
                    const isOpen = customSelect.classList.contains('open');

                    // Close all other instances if multiple (not yet, but good practice)
                    customSelect.classList.toggle('open');
                };
            }

            // Close on outside click
            window.addEventListener('click', () => {
                if (customSelect) customSelect.classList.remove('open');
            });
        }

        // Link to Login
        document.getElementById('link-login').onclick = (e) => {
            e.preventDefault();
        };

        // Form Submit
        const form = document.getElementById('register-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;

            const name = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const teacherUid = intendedRole === 'student' ? document.getElementById('reg-teacher').value : null;

            if (intendedRole === 'student' && !teacherUid) {
                const { Toast } = await import('../ui/toast.js');
                Toast.show('Por favor, selecione um professor.', 'warning');
                return;
            }

            try {
                btn.disabled = true;
                btn.innerHTML = 'Cadastrando...';
                await authService.register(name, email, password, intendedRole, teacherUid);
            } catch (err) {
                console.error("Erro no processo de registro:", err);
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        };
    }
};
