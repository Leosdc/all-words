import { authService } from '../services/auth-service.js';
import { db } from '../config/firebase.js';
import { ProfileModal } from './profile-view.js';
import { modal } from '../ui/modal.js';

export const AdminView = {
    render: () => {
        return `
            <section id="admin-view" class="view active">
                <div class="dashboard-layout">
                    <aside class="sidebar">
                        <div class="logo-text" style="margin-bottom: 3rem; line-height: 1.2;">ALL WORDS<br><span style="font-size: 0.45em; opacity: 0.6; display: block;">ADMIN</span></div>
                        <nav>
                            <div class="nav-item active" id="nav-admin-users"><i data-lucide="shield-check"></i> Gestão de Roles</div>
                            
                            <div style="margin: 1.5rem 0 0.5rem 1rem; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Visão Professor</div>
                            <div class="nav-item" id="nav-overview"><i data-lucide="layout-dashboard"></i> Visão Geral</div>
                            <div class="nav-item" id="nav-students"><i data-lucide="users"></i> Meus Alunos</div>
                            <div class="nav-item" id="nav-exercises"><i data-lucide="dumbbell"></i> Exercícios</div>
                            <div class="nav-item" id="nav-formation"><i data-lucide="graduation-cap"></i> Formação</div>
                            
                            <div style="margin-top: auto;"></div>
                            <div class="nav-item" id="btn-profile"><i data-lucide="user-cog"></i> Editar Perfil</div>
                            <div class="nav-item" id="btn-logout-admin"><i data-lucide="log-out"></i> Sair</div>
                        </nav>
                    </aside>
                    <main class="main-content">
                        <div class="header-bar">
                            <h2>Gestão de Usuários</h2>
                        </div>

                        <div class="content-body" id="admin-users-list">
                            <div style="text-align: center; padding: 3rem;">
                                <div class="spinner"></div>
                                <p style="margin-top: 1rem; color: #64748b;">Carregando usuários...</p>
                            </div>
                        </div>
                    </main>
                </div>
            </section>
        `;
    },

    attachEvents: (navigate) => {
        document.getElementById('btn-logout-admin').onclick = () => {
            firebase.auth().signOut();
        };

        if (document.getElementById('nav-overview')) document.getElementById('nav-overview').onclick = () => navigate('teacher-dashboard');
        if (document.getElementById('nav-students')) document.getElementById('nav-students').onclick = () => navigate('teacher-students');
        if (document.getElementById('nav-exercises')) document.getElementById('nav-exercises').onclick = () => navigate('teacher-exercises');
        if (document.getElementById('nav-formation')) document.getElementById('nav-formation').onclick = () => navigate('teacher-formation');

        const btnProfile = document.getElementById('btn-profile');
        if (btnProfile) btnProfile.onclick = () => ProfileModal.open(authService.currentUser);

        const btnLogout = document.getElementById('btn-logout-admin');
        if (btnLogout) btnLogout.onclick = () => authService.logout();

        AdminView.fetchUsers();
    },

    fetchUsers: async () => {
        const listContainer = document.getElementById('admin-users-list');
        if (!listContainer) return;

        try {
            const snapshot = await db.collection('users').get();
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            listContainer.innerHTML = `
                <div style="background: white; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <th style="padding: 1.2rem 1.5rem; color: #64748b; font-weight: 600;">Nome</th>
                                <th style="padding: 1.2rem 1.5rem; color: #64748b; font-weight: 600;">E-mail</th>
                                <th style="padding: 1.2rem 1.5rem; color: #64748b; font-weight: 600;">Role Atual</th>
                                <th style="padding: 1.2rem 1.5rem; color: #64748b; font-weight: 600; text-align: right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(user => `
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="padding: 1rem 1.5rem; font-weight: 500;">${user.name}</td>
                                    <td style="padding: 1rem 1.5rem; color: #64748b;">${user.email}</td>
                                    <td style="padding: 1rem 1.5rem;">
                                        <span class="student-status-badge ${user.role === 'admin' ? 'status-active' : (user.role === 'teacher' ? 'status-active' : 'status-waiting')}" 
                                              style="text-transform: capitalize; padding: 0.4rem 0.8rem; border-radius: 8px; font-weight: 600; font-size: 0.8rem; 
                                              ${user.role === 'admin' ? 'background: #fdf2f8; color: #db2777; border: 1px solid #fce7f3;' : ''}
                                              ${user.role === 'teacher' ? 'background: #f0f9ff; color: #0369a1; border: 1px solid #e0f2fe;' : ''}
                                              ${user.role === 'student' ? 'background: #f0fdf4; color: #15803d; border: 1px solid #dcfce7;' : ''}">
                                            <i data-lucide="${user.role === 'admin' ? 'shield-check' : (user.role === 'teacher' ? 'graduation-cap' : 'user')}" style="width: 14px; margin-right: 4px; vertical-align: middle;"></i>
                                            ${user.role}
                                        </span>
                                    </td>
                                    <td style="padding: 1rem 1.5rem; text-align: right; display: flex; gap: 0.5rem; justify-content: flex-end;">
                                        <div class="role-actions-group" style="display: flex; gap: 0.4rem;">
                                            ${user.role !== 'student' ? `
                                                <button title="Tornar Aluno" class="btn-icon" onclick="window.changeUserRole(event, '${user.id}', 'student')">
                                                    <i data-lucide="user"></i>
                                                </button>
                                            ` : ''}
                                            ${user.role !== 'teacher' ? `
                                                <button title="Tornar Professor" class="btn-icon btn-success" onclick="window.changeUserRole(event, '${user.id}', 'teacher')">
                                                    <i data-lucide="graduation-cap"></i>
                                                </button>
                                            ` : ''}
                                            ${user.role !== 'admin' ? `
                                                <button title="Tornar Admin" class="btn-icon btn-admin" onclick="window.changeUserRole(event, '${user.id}', 'admin')">
                                                    <i data-lucide="shield-check"></i>
                                                </button>
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            window.changeUserRole = async (event, uid, newRole) => {
                const btn = event?.currentTarget;
                if (btn) btn.style.opacity = '0.5';

                try {
                    await db.collection('users').doc(uid).update({ role: newRole });
                    modal.show({ title: 'Sucesso', message: `Role atualizada para ${newRole}`, type: 'success' });
                    AdminView.fetchUsers(); // Refresh
                } catch (error) {
                    modal.show({ title: 'Erro', message: 'Falha ao atualizar role.', type: 'error' });
                    if (btn) btn.style.opacity = '1';
                }
            };

            if (window.lucide) lucide.createIcons();

        } catch (error) {
            listContainer.innerHTML = `<p style="color: #ef4444; padding: 2rem;">Erro ao carregar usuários: ${error.message}</p>`;
        }
    }
};
