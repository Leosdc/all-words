import { authService } from '../services/auth-service.js';
import { chatWidget } from '../ui/chat-widget.js';
import { ProfileModal } from './profile-view.js';
import { db, auth } from '../config/firebase.js';

export const TeacherDashboard = {
    render: (user) => {
        const name = user.displayName || user.email.split('@')[0];
        return `
            <section id="teacher-dashboard-view" class="view active teacher-dash">
                <div class="dashboard-layout">
                    <aside class="sidebar">
                        <div class="logo-text" style="margin-bottom: 3rem; line-height: 1.2;">ALL WORDS<br><span style="font-size: 0.45em; opacity: 0.6; display: block;">${user.role === 'admin' ? 'ADMIN' : 'TEACHER'}</span></div>
                        <nav>
                            <div class="nav-item active" id="nav-overview"><i data-lucide="layout-dashboard"></i> Visão Geral</div>
                            <div class="nav-item" id="nav-students"><i data-lucide="users"></i> Meus Alunos</div>
                            <div class="nav-item" id="nav-exercises"><i data-lucide="dumbbell"></i> Exercícios</div>
                            <div class="nav-item" id="nav-formation"><i data-lucide="graduation-cap"></i> Formação</div>
                            
                            ${user.role === 'admin' ? `
                            <div style="margin: 1.5rem 0 0.5rem 1rem; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Administração</div>
                            <div class="nav-item" id="nav-admin-users"><i data-lucide="shield-check"></i> Gestão de Roles</div>
                            ` : ''}

                            <div style="margin-top: auto;"></div>
                            <div class="nav-item" id="btn-profile"><i data-lucide="user-cog"></i> Editar Perfil</div>
                            <div class="nav-item" id="btn-logout-teacher"><i data-lucide="log-out"></i> Sair</div>
                        </nav>
                    </aside>
                    <main class="main-content">
                        <div class="header-bar">
                            <h2>Olá, <span id="teacher-name-display">${name}</span>!</h2>
                            <div class="user-avatar"></div>
                        </div>

                        <div class="content-body">
                            <div class="card-grid">

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon"><i data-lucide="users"></i></div>
                                    </div>
                                    <div class="stat-value">0</div>
                                    <div class="stat-label">Alunos Ativos</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon"><i data-lucide="clock"></i></div>
                                    </div>
                                    <div class="stat-value">0</div>
                                    <div class="stat-label">Alunos em Espera</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon"><i data-lucide="user-x"></i></div>
                                    </div>
                                    <div class="stat-value">0</div>
                                    <div class="stat-label">Alunos Desistentes</div>
                                </div>
                            </div>

                            <div style="margin-top: 2rem; background: white; padding: 2rem; border-radius: 16px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                                    <h3>Aulas da Semana</h3>
                                    <button style="background: none; border: none; color: var(--primary-blue); font-weight: 600; cursor: pointer;">Ver todas</button>
                                </div>
                                
                                <div class="weekly-classes-list">
                                    <!-- Dynamic content will be injected here -->
                                    <div style="padding: 2rem; text-align: center; color: #94a3b8;">
                                        <i data-lucide="calendar" style="width: 32px; height: 32px; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                                        <p>Carregando aulas...</p>
                                    </div>
                                </div>
                            </div>

                            <div style="margin-top: 2rem; background: white; padding: 2rem; border-radius: 16px;">
                                <h3 style="margin-bottom: 1.5rem;">Progresso dos Alunos</h3>
                                <div class="student-progress-list">
                                    <!-- Dynamic progress will be injected here -->
                                    <div style="padding: 1rem; text-align: center; color: #94a3b8;">
                                        <p>Nenhum dado de progresso disponível.</p>
                                    </div>
                                </div>
                            </div>

                            <div style="margin-top: 2rem; background: white; padding: 2rem; border-radius: 16px;">
                                <h3>Ações Rápidas</h3>
                                <div class="btn-group" style="justify-content: flex-start; margin-top: 1rem; gap: 1rem;">
                                    <button class="btn-primary" id="btn-new-ai-class" style="background: var(--dark); color: white; width: auto; font-size: 0.95rem; padding: 0.8rem 1.5rem; border-radius: 50px; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                                        <i data-lucide="sparkles" style="width:18px;"></i> Nova Aula com IA
                                    </button>
                                    <button class="btn-secondary" id="btn-invite-student" style="background: white; color: var(--dark); border: 1px solid #e2e8f0; width: auto; font-size: 0.95rem; padding: 0.8rem 1.5rem; border-radius: 50px; cursor: pointer;">
                                        Convidar Aluno
                                    </button>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </section>
        `;
    },

    attachEvents: (navigate) => {
        document.getElementById('nav-overview').onclick = () => navigate('teacher-dashboard');
        document.getElementById('nav-students').onclick = () => navigate('teacher-students');
        document.getElementById('nav-exercises').onclick = () => navigate('teacher-exercises');
        document.getElementById('nav-formation').onclick = () => navigate('teacher-formation');
        if (document.getElementById('nav-admin-users')) document.getElementById('nav-admin-users').onclick = () => navigate('admin-dashboard');

        const btnProfile = document.getElementById('btn-profile');
        if (btnProfile) btnProfile.onclick = () => ProfileModal.open(authService.currentUser);

        const btnLogout = document.getElementById('btn-logout-teacher');
        if (btnLogout) btnLogout.onclick = () => authService.logout();

        // Show Chat Widget
        chatWidget.setVisibility(true);

        // Check for AI button and attach event
        const aiBtn = document.getElementById('btn-new-ai-class');
        if (aiBtn) {
            aiBtn.onclick = () => {
                chatWidget.openWithPrompt("Quero criar uma nova aula sobre...");
            };
        }

        const inviteBtn = document.getElementById('btn-invite-student');
        if (inviteBtn) {
            inviteBtn.onclick = () => navigate('teacher-students');
        }

        // --- FETCH REAL DATA (Weekly Lessons & Stats) ---
        const fetchDashboardData = async () => {
            const user = auth.currentUser;
            if (!user) return;

            try {
                // 1. Fetch Stats (Student counts) from global collection
                const studentsSnapshot = await db.collection('students').where('teacherUid', '==', user.uid).get();
                const students = studentsSnapshot.docs.map(doc => doc.data());

                const stats = {
                    active: students.filter(s => s.status === 'active').length,
                    waiting: students.filter(s => s.status === 'waiting' || !s.status).length,
                    cancelled: students.filter(s => s.status === 'cancelled').length
                };

                const statCards = document.querySelectorAll('.stat-card');
                if (statCards.length >= 3) {
                    statCards[0].querySelector('.stat-value').textContent = stats.active;
                    statCards[1].querySelector('.stat-value').textContent = stats.waiting;
                    statCards[2].querySelector('.stat-value').textContent = stats.cancelled;
                }

                // 2. Fetch Lessons from global collection
                const snapshot = await db.collection('lessons').where('teacherUid', '==', user.uid).get();
                let lessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Sort locally to avoid Firebase Index requirement
                lessons.sort((a, b) => {
                    const dateA = new Date(a.date + 'T' + (a.time || '00:00'));
                    const dateB = new Date(b.date + 'T' + (b.time || '00:00'));
                    return dateA - dateB;
                });

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const upcoming = lessons.filter(l => {
                    const lDate = new Date(l.date + 'T' + (l.time || '00:00'));
                    return lDate >= today;
                }).slice(0, 5);

                const container = document.querySelector('.weekly-classes-list');
                if (container) {
                    if (upcoming.length === 0) {
                        container.innerHTML = `<p style="color: #94a3b8; padding: 2rem; text-align: center;">Nenhuma aula agendada para os próximos dias.</p>`;
                    } else {
                        container.innerHTML = upcoming.map(lesson => {
                            const dateObj = new Date(lesson.date + 'T' + (lesson.time || '00:00'));
                            const day = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                            return `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; border-bottom: 1px solid #f1f5f9;">
                                    <div style="display: flex; align-items: center; gap: 1rem;">
                                        <div style="background: #e0f2fe; color: var(--primary-blue); padding: 0.5rem; border-radius: 8px;">
                                            <i data-lucide="calendar" style="width: 20px; height: 20px;"></i>
                                        </div>
                                        <div>
                                            <div style="font-weight: 600; color: var(--dark);">${lesson.title}</div>
                                            <div style="font-size: 0.9rem; color: #64748b;">${lesson.studentName || 'Aluno'}</div>
                                        </div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-weight: 600; color: var(--dark);">${day}</div>
                                        <div style="font-size: 0.9rem; color: #64748b;">${lesson.time}</div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                        if (window.lucide) lucide.createIcons();
                    }
                }

            } catch (error) {
                console.error("Error fetching dashboard data:", error);
            }
        };

        fetchDashboardData();
    }
};
