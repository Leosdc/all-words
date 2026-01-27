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

        // Link to Login
        document.getElementById('link-login').onclick = (e) => {
            e.preventDefault();
            navigate('login');
        };

        // Form Submit
        document.getElementById('register-form').onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;

            await authService.register(name, email, password, intendedRole);
        };
    }
};
