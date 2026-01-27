import { authService } from '../services/auth-service.js';
import { Toast } from '../ui/toast.js';

export const ProfileModal = {
    render: (user) => {
        return `
            <div class="modal-overlay" id="profile-modal">
                <div class="modal-content" style="max-width: 500px;">
                    <button class="modal-close" id="close-profile-modal">&times;</button>
                    
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem;">
                        <div style="width: 64px; height: 64px; background: #e0f2fe; color: #0284c7; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold;">
                            ${(user.displayName || user.email || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.5rem;">Editar Perfil</h2>
                            <p style="color: #64748b; margin: 0;">${user.email}</p>
                        </div>
                    </div>

                    <form id="profile-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div class="form-group">
                            <label>Nome Completo</label>
                            <input type="text" id="profile-name" value="${user.displayName || ''}" placeholder="Seu nome" required>
                        </div>

                        <div class="form-group">
                            <label>WhatsApp</label>
                            <input type="tel" id="profile-whatsapp" value="${user.whatsapp || ''}" placeholder="(DDD) 99999-9999">
                            <small style="color: #94a3b8; font-size: 0.85rem;">Usado para comunicações importantes.</small>
                        </div>

                        <div style="border-top: 1px solid #e2e8f0; padding-top: 1.5rem; margin-top: 0.5rem;">
                            <h3 style="font-size: 1.1rem; margin-bottom: 1rem;">Segurança</h3>
                            <button type="button" class="btn-secondary" id="btn-toggle-password" style="width: 100%;">Adobe Alterar Senha</button>
                            
                            <div id="password-section" style="display: none; margin-top: 1rem; background: #f8fafc; padding: 1rem; border-radius: 8px;">
                                <div class="form-group" style="margin-bottom: 1rem;">
                                    <label>Nova Senha</label>
                                    <input type="password" id="new-password" placeholder="Mínimo 6 caracteres">
                                </div>
                                <button type="button" class="btn-danger" id="btn-save-password">Atualizar Senha</button>
                            </div>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem;">
                            <button type="button" class="btn-secondary" id="btn-cancel-profile">Cancelar</button>
                            <button type="submit" class="btn-primary">Salvar Alterações</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    open: (user) => {
        // Remove existing modal if any (by ID or class to be safe)
        const existingId = document.getElementById('profile-modal');
        if (existingId) existingId.remove();

        const existingClass = document.querySelector('.modal-overlay.profile-modal-instance');
        if (existingClass) existingClass.remove();

        const parser = new DOMParser();
        const doc = parser.parseFromString(ProfileModal.render(user), 'text/html');
        const modalEl = doc.body.firstChild;
        modalEl.classList.add('profile-modal-instance'); // Add marker class
        document.body.appendChild(modalEl);

        // Mask Logic
        const phoneInput = document.getElementById('profile-whatsapp');
        phoneInput.addEventListener('input', (e) => {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });

        // Toggle Password Section
        const pwdBtn = document.getElementById('btn-toggle-password');
        const pwdSection = document.getElementById('password-section');
        pwdBtn.onclick = () => {
            const isHidden = pwdSection.style.display === 'none';
            pwdSection.style.display = isHidden ? 'block' : 'none';
            pwdBtn.textContent = isHidden ? 'Cancelar Alteração de Senha' : 'Alterar Senha';
        };

        // Change Password Action
        document.getElementById('btn-save-password').onclick = async () => {
            const newPwd = document.getElementById('new-password').value;
            if (newPwd.length < 6) {
                Toast.show('A senha deve ter pelo menos 6 caracteres.', 'warning');
                return;
            }
            try {
                await authService.changePassword(newPwd);
                Toast.show('Senha alterada com sucesso!', 'success');
                document.getElementById('new-password').value = '';
                pwdSection.style.display = 'none';
                pwdBtn.textContent = 'Alterar Senha';
            } catch (error) {
                Toast.show('Erro ao alterar senha. Talvez seja necessário relogar.', 'error');
            }
        };

        // Save Profile Action
        document.getElementById('profile-form').onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('profile-name').value;
            const whatsapp = document.getElementById('profile-whatsapp').value;

            try {
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'Salvando...';

                await authService.updateProfile(user.uid, {
                    name: name, // standardizing field name to 'name' in Firestore user doc? 
                    // Wait, auth-service logic for 'users' collection uses 'name' on register.
                    displayName: name, // Keeping legacy compatibility if needed
                    whatsapp: whatsapp
                });

                Toast.show('Perfil atualizado com sucesso!', 'success');

                // Update UI if name changed
                const nameDisplay = document.getElementById('user-name-display');
                if (nameDisplay) nameDisplay.textContent = name;

                setTimeout(() => modalEl.remove(), 1000);
            } catch (error) {
                console.error(error);
                Toast.show('Erro ao atualizar perfil.', 'error');
            } finally {
                const btn = e.target.querySelector('button[type="submit"]');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Salvar Alterações';
                }
            }
        };

        // Close events
        const close = () => modalEl.remove();
        document.getElementById('close-profile-modal').onclick = close;
        document.getElementById('btn-cancel-profile').onclick = close;
        modalEl.onclick = (e) => {
            if (e.target === modalEl) close();
        };
    }
};
