import { authService } from '../services/auth-service.js';
import { db, auth } from '../config/firebase.js';
import { modal } from '../ui/modal.js';
import { Sidebar } from '../ui/sidebar.js';
import { ProfileModal } from './profile-view.js';

export const AdminView = {
    render: (user) => {
        return `
            <section id="admin-view" class="view active admin-dash">
                <div class="dashboard-layout">
                    ${Sidebar.render(user, 'admin-users')}
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

    attachEvents: (navigate, user) => {
        Sidebar.attachEvents(navigate, 'admin');

        const btnLogout = document.getElementById('btn-logout-admin');
        if (btnLogout) btnLogout.onclick = () => authService.logout();

        AdminView.fetchUsers();
    },

    deleteUser: async (uid, name) => {
        if (!confirm(`Tem certeza que deseja excluir o usuário ${name}? Esta ação é irreversível.`)) return;

        try {
            await db.collection('users').doc(uid).delete();
            modal.show({ title: 'Sucesso', message: 'Usuário excluído com sucesso.', type: 'success' });
            AdminView.fetchUsers();
        } catch (error) {
            console.error("Erro ao excluir usuário:", error);
            modal.show({ title: 'Erro', message: 'Falha ao excluir usuário.', type: 'error' });
        }
    },

    deleteStudent: async (id, name) => {
        if (!confirm(`Tem certeza que deseja excluir o registro do aluno ${name}?`)) return;

        try {
            await db.collection('students').doc(id).delete();
            // Also cleanup links if any
            const snapshot = await db.collection('student_links').where('studentId', '==', id).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            modal.show({ title: 'Sucesso', message: 'Registro de aluno excluído.', type: 'success' });
            AdminView.fetchUsers();
        } catch (error) {
            modal.show({ title: 'Erro', message: 'Falha ao excluir registro.', type: 'error' });
        }
    },

    fetchUsers: async () => {
        const listContainer = document.getElementById('admin-users-list');
        if (!listContainer) return;

        try {
            // 1. Fetch all registered users
            const usersSnapshot = await db.collection('users').get();
            const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'user' }));

            // 2. Fetch all students to find those not yet linked to users
            let students = [];
            try {
                const studentsSnapshot = await db.collection('students').get();
                students = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'student' }));
            } catch (e) {
                console.warn("Global students collection not accessible or empty", e);
            }

            // Filter students that don't have a userUid (unlinked)
            const unlinkedStudents = students.filter(student => !student.userUid);

            // Merge lists for display (Users first, then unlinked students as "Pending")
            const allItems = [...users, ...unlinkedStudents];

            listContainer.innerHTML = `
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>E-mail</th>
                                <th>Role / Status</th>
                                <th style="text-align: right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${allItems.map(item => {
                const isUser = item.type === 'user';
                const name = item.name || item.displayName || 'Sem Nome';
                const email = item.email || 'N/A';
                const role = item.role || 'student';

                return `
                                <tr>
                                    <td>
                                        <div class="table-user-info">
                                            <div class="table-avatar" style="width: 32px; height: 32px; font-size: 0.9rem; margin-right: 0.8rem; background: ${isUser ? '' : '#f1f5f9; color: #64748b;'}">
                                                ${name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div style="font-weight: 500;">${name}</div>
                                                ${!isUser ? '<div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Aguardando Primeiro Login</div>' : ''}
                                            </div>
                                        </div>
                                    </td>
                                    <td style="color: #64748b;">${email}</td>
                                    <td>
                                        <span class="student-status-badge ${role === 'admin' ? 'status-active' : (role === 'teacher' ? 'status-active' : 'status-waiting')}" 
                                              style="text-transform: capitalize; padding: 0.4rem 0.8rem; border-radius: 8px; font-weight: 600; font-size: 0.8rem; 
                                              ${role === 'admin' ? 'background: #fdf2f8; color: #db2777; border: 1px solid #fce7f3;' : ''}
                                              ${role === 'teacher' ? 'background: #f0f9ff; color: #0369a1; border: 1px solid #e0f2fe;' : ''}
                                              ${role === 'student' ? 'background: #f0fdf4; color: #111827; border: 1px solid #e2e8f0;' : ''}">
                                            <i data-lucide="${role === 'admin' ? 'shield-check' : (role === 'teacher' ? 'graduation-cap' : 'user')}" style="width: 14px; margin-right: 4px; vertical-align: middle;"></i>
                                            ${role}
                                        </span>
                                    </td>
                                    <td style="text-align: right;">
                                        <div class="role-actions-group" style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                                            ${isUser ? `
                                                ${role !== 'student' ? `
                                                    <button title="Tornar Aluno" class="btn-icon" onclick="window.changeUserRole(event, '${item.id}', 'student')">
                                                        <i data-lucide="user"></i>
                                                    </button>
                                                ` : ''}
                                                ${role !== 'teacher' ? `
                                                    <button title="Tornar Professor" class="btn-icon btn-success" onclick="window.changeUserRole(event, '${item.id}', 'teacher')">
                                                        <i data-lucide="graduation-cap"></i>
                                                    </button>
                                                ` : ''}
                                                ${role !== 'admin' ? `
                                                    <button title="Tornar Admin" class="btn-icon btn-admin" onclick="window.changeUserRole(event, '${item.id}', 'admin')">
                                                        <i data-lucide="shield-check"></i>
                                                    </button>
                                                ` : ''}
                                                <button title="Excluir Usuário" class="btn-icon" style="color: #ef4444; background: #fee2e2; border-color: #fecaca;" onclick="window.deleteAdminUser('${item.id}', '${name}')">
                                                    <i data-lucide="trash-2"></i>
                                                </button>
                                            ` : `
                                                <button title="Excluir Registro de Aluno" class="btn-icon" style="color: #ef4444; border-color: #fecaca;" onclick="window.deleteAdminStudent('${item.id}', '${name}')">
                                                    <i data-lucide="trash-2"></i>
                                                </button>
                                            `}
                                        </div>
                                    </td>
                                </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            window.changeUserRole = async (event, uid, newRole) => {
                const btn = event?.currentTarget;
                if (btn) btn.style.opacity = '0.5';

                try {
                    const batch = db.batch();
                    const userRef = db.collection('users').doc(uid);
                    const userDoc = await userRef.get();

                    const updateData = { role: newRole };

                    // If making them a student, or if they were a student, let's ensure status is 'active'
                    // especially if we are "approving" them via this interface.
                    if (newRole === 'student' || (userDoc.exists && userDoc.data().role === 'student')) {
                        updateData.status = 'active';
                    }

                    batch.update(userRef, updateData);

                    // If they are a student linked to a teacher, we should ideally find that link and update it too,
                    // but for now, updating the global user doc fixes the LOGIN block.

                    await batch.commit();
                    modal.show({ title: 'Sucesso', message: `Dados atualizados para ${newRole}`, type: 'success' });
                    AdminView.fetchUsers(); // Refresh
                } catch (error) {
                    console.error("Error updating user:", error);
                    modal.show({ title: 'Erro', message: 'Falha ao atualizar dados.', type: 'error' });
                    if (btn) btn.style.opacity = '1';
                }
            };

            window.deleteAdminUser = AdminView.deleteUser;
            window.deleteAdminStudent = AdminView.deleteStudent;

            if (window.lucide) lucide.createIcons();

        } catch (error) {
            listContainer.innerHTML = `<p style="color: #ef4444; padding: 2rem;">Erro ao carregar usuários: ${error.message}</p>`;
        }
    }
};
