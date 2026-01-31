import { authService } from '../services/auth-service.js';
import { ProfileModal } from './profile-view.js';
import { db } from '../config/firebase.js';

export const StudentDashboard = {
    render: (user) => {
        const name = user.displayName || user.email.split('@')[0];
        return `
            <section id="dashboard-view" class="view active">
                <div class="dashboard-layout">
                    <aside class="sidebar">
                        <div class="logo-text" style="margin-bottom: 3rem;">All Words</div>
                        <nav>
                            <div class="nav-item active" id="nav-dash"><i data-lucide="layout-dashboard"></i> Dashboard</div>
                            <div class="nav-item" id="nav-classes"><i data-lucide="book-open"></i> Aulas</div>
                            <div style="margin-top: auto;"></div>
                            <div class="nav-item" id="btn-profile"><i data-lucide="user-cog"></i> Editar Perfil</div>
                            <div class="nav-item" id="btn-logout"><i data-lucide="log-out"></i> Sair</div>
                        </nav>
                    </aside>
                    <main class="main-content">
                        <div class="header-bar">
                            <h2>Olá, <span id="user-name-display">${name}</span>!</h2>
                        </div>

                        <!-- Content Area -->
                        <div class="content-body" id="student-content-display">
                            <div style="text-align: center; padding: 3rem;">
                                <div class="spinner"></div>
                                <p style="margin-top: 1rem; color: #64748b;">Carregando...</p>
                            </div>
                        </div>
                    </main>
                </div>
            </section>
        `;
    },

    attachEvents: (navigate) => {
        const btnProfile = document.getElementById('btn-profile');
        if (btnProfile) btnProfile.onclick = () => ProfileModal.open(authService.currentUser);

        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) btnLogout.onclick = () => authService.logout();

        // Navigation Logic
        const navDash = document.getElementById('nav-dash');
        const navClasses = document.getElementById('nav-classes');

        if (navDash) navDash.onclick = () => {
            navDash.classList.add('active');
            navClasses.classList.remove('active');
            StudentDashboard.fetchTeacherData(false); // Show Dashboard
        };

        if (navClasses) navClasses.onclick = () => {
            navClasses.classList.add('active');
            navDash.classList.remove('active');
            StudentDashboard.fetchTeacherData(true); // Show Lessons List
        };

        // Initial Load (Dashboard)
        StudentDashboard.fetchTeacherData(false);
    },

    fetchTeacherData: async (showAllLessons = false) => {
        const user = authService.currentUser;
        if (!user) return;

        const contentEl = document.getElementById('student-content-display');
        if (!contentEl) return;

        try {
            // 1. Get User Profile to find linkedTeacher
            const userDoc = await db.collection('users').doc(user.uid).get();
            const userData = userDoc.data();

            if (!userData || !userData.linkedTeacher) {
                // Self-healing: Check if there's a student_link that wasn't applied
                const linkDoc = await db.collection('student_links').doc(user.email.toLowerCase()).get();
                if (linkDoc.exists) {
                    const linkData = linkDoc.data();
                    console.log("Found missing link, applying self-healing...");

                    // Update User Profile
                    await db.collection('users').doc(user.uid).update({
                        linkedTeacher: linkData.teacherUid,
                        studentIdInTeacherDoc: linkData.studentId
                    });

                    // Update Global Student record
                    await db.collection('students').doc(linkData.studentId)
                        .update({
                            status: 'active',
                            userUid: user.uid
                        });

                    // Reload data
                    return StudentDashboard.fetchTeacherData();
                }

                contentEl.innerHTML = `
                    <div style="background: white; padding: 3rem; border-radius: 16px; text-align: center;">
                        <i data-lucide="user-plus" style="width: 48px; height: 48px; color: #94a3b8; margin-bottom: 1rem;"></i>
                        <h3>Aguardando Vínculo</h3>
                        <p style="color: #64748b; margin-top: 0.5rem;">Seu e-mail ainda não foi associado a um professor por nossa administração.</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
                return;
            }

            // 2. Fetch Lessons and Teacher Info
            const teacherUid = userData.linkedTeacher;

            // Fetch lessons (Wrap in try-catch to handle "Pending Approval" state)
            let lessons = [];
            let isPendingApproval = false;

            try {
                const lessonsSnapshot = await db.collection('lessons')
                    .where('teacherUid', '==', teacherUid)
                    .where('studentId', '==', userData.studentIdInTeacherDoc || '')
                    .get();
                lessons = lessonsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (lessonError) {
                console.warn("Could not fetch lessons (likely waiting for teacher approval):", lessonError);
                isPendingApproval = true;
            }

            // Fetch Teacher Profile with Retry (Fix for Race Condition on Permissions)
            let teacherDoc = { exists: false };
            try {
                teacherDoc = await db.collection('users').doc(teacherUid).get();
            } catch (err) {
                console.warn("Initial teacher fetch failed, retrying...", err);
                await new Promise(r => setTimeout(r, 800)); // Wait 800ms
                try {
                    teacherDoc = await db.collection('users').doc(teacherUid).get();
                } catch (err2) {
                    console.error("Retried teacher fetch failed:", err2);
                    // Fallback: Continue without teacher details
                }
            }

            const teacherData = teacherDoc.exists ? teacherDoc.data() : {};
            const teacherName = teacherData.displayName || teacherData.name || 'Professor';
            const teacherWhatsapp = teacherData.whatsapp ? teacherData.whatsapp.replace(/\D/g, '') : '';

            // Sort locally (descending by date)
            lessons.sort((a, b) => {
                const dateA = new Date(a.date + 'T' + (a.time || '00:00'));
                const dateB = new Date(b.date + 'T' + (b.time || '00:00'));
                return dateB - dateA;
            });

            // Calculate Stats
            const totalLessons = lessons.length;
            const nextLesson = lessons.find(l => {
                const d = new Date(l.date + 'T' + (l.time || '00:00'));
                return d >= new Date();
            });

            const statsHtml = `
                <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-bottom: 2rem;">
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon"><i data-lucide="book-open"></i></div></div>
                        <div class="stat-value">${isPendingApproval ? '-' : totalLessons}</div>
                        <div class="stat-label">Aulas no Plano</div>
                    </div>
                    ${teacherWhatsapp ? `
                    <div class="stat-card" style="cursor: pointer;" onclick="window.open('https://wa.me/55${teacherWhatsapp}', '_blank')">
                        <div class="stat-header"><div class="stat-icon" style="background: #dcfce7; color: #16a34a;"><i data-lucide="message-circle"></i></div></div>
                        <div class="stat-value" style="font-size: 1.2rem; margin-top: 0.5rem;">${teacherName}</div>
                        <div class="stat-label">Falar no WhatsApp</div>
                    </div>
                     ` : `
                    <div class="stat-card">
                        <div class="stat-header"><div class="stat-icon"><i data-lucide="user"></i></div></div>
                        <div class="stat-value" style="font-size: 1.2rem; margin-top: 0.5rem;">${teacherName}</div>
                        <div class="stat-label">Seu Professor</div>
                    </div>
                    `}
                </div>
            `;

            // RENDER: Decide based on View Mode (Dashboard vs All Lessons)

            if (showAllLessons) {
                // --- VIEW: ALL LESSONS LIST ---
                if (isPendingApproval) {
                    contentEl.innerHTML = `
                        <div style="background: #fffbeb; padding: 3rem; border-radius: 16px; text-align: center; border: 1px solid #fcd34d;">
                            <i data-lucide="clock" style="width: 48px; height: 48px; color: #d97706; margin-bottom: 1rem;"></i>
                            <h3 style="color: #92400e;">Aguardando Confirmação</h3>
                            <p style="color: #b45309; margin-top: 0.5rem;">Aguarde o professor confirmar seu cadastro para liberar as aulas.</p>
                        </div>`;
                } else if (lessons.length === 0) {
                    contentEl.innerHTML = `
                        <div style="background: white; padding: 3rem; border-radius: 16px; text-align: center;">
                            <h3>Nenhuma Aula Encontrada</h3>
                            <p style="color: #64748b; margin-top: 0.5rem;">Você ainda não possui aulas cadastradas.</p>
                        </div>`;
                } else {
                    contentEl.innerHTML = `
                        <h3 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 10px;">
                            <i data-lucide="book-open" style="color: var(--primary-color);"></i> Todas as Aulas
                        </h3>
                        <div style="display: grid; gap: 1rem;">
                            ${lessons.map(lesson => `
                                <div class="lesson-card" style="background: white; padding: 1.5rem; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                                            ${new Date(lesson.date + 'T' + (lesson.time || '00:00')) < new Date() ?
                            '<span style="background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">CONCLUÍDA</span>' :
                            '<span style="background: #e0f2fe; color: #0284c7; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">AGENDADA</span>'}
                                        </div>
                                        <h4 style="margin-bottom: 0.5rem; font-size: 1.1rem; color: #1e293b;">${lesson.title}</h4>
                                        <div style="font-size: 0.9rem; color: #64748b; display: flex; gap: 16px; align-items: center;">
                                            <span style="display: flex; align-items: center; gap: 6px;"><i data-lucide="calendar" style="width: 14px;"></i> ${lesson.date}</span>
                                            <span style="display: flex; align-items: center; gap: 6px;"><i data-lucide="clock" style="width: 14px;"></i> ${lesson.time}</span>
                                        </div>
                                    </div>
                                    <button class="btn-primary" style="width: auto; padding: 0.6rem 1.2rem; font-size: 0.9rem; border-radius: 8px;">
                                        <i data-lucide="play-circle" style="width: 16px; height: 16px; margin-right: 6px;"></i> Ver
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                      `;
                }

            } else {
                // --- VIEW: DASHBOARD (Stats + Recent) ---


                if (isPendingApproval) {
                    contentEl.innerHTML = `
                    ${statsHtml}
                    <div style="background: #fffbeb; padding: 3rem; border-radius: 16px; text-align: center; border: 1px solid #fcd34d;">
                        <i data-lucide="clock" style="width: 48px; height: 48px; color: #d97706; margin-bottom: 1rem;"></i>
                        <h3 style="color: #92400e;">Aguardando Confirmação</h3>
                        <p style="color: #b45309; margin-top: 0.5rem;">Seu vínculo foi solicitado com sucesso! <br>Aguarde o professor confirmar seu cadastro para liberar as aulas.</p>
                    </div>
                `;
                } else if (lessons.length === 0) {
                    contentEl.innerHTML = `
                    ${statsHtml}
                    <div style="background: white; padding: 3rem; border-radius: 16px; text-align: center;">
                        <h3>Nenhuma Aula Encontrada</h3>
                        <p style="color: #64748b; margin-top: 0.5rem;">Fale com seu professor para começar seu plano de estudos!</p>
                    </div>
                `;
                } else {
                    contentEl.innerHTML = `
                    ${statsHtml}
                    <h3 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 10px;">
                        <i data-lucide="list" style="color: var(--primary-color);"></i> Seu Cronograma
                    </h3>
                    <div style="display: grid; gap: 1rem;">
                        ${lessons.map(lesson => `
                            <div class="lesson-card" style="background: white; padding: 1.5rem; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; transition: transform 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                                <div>
                                    <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                                        ${new Date(lesson.date + 'T' + (lesson.time || '00:00')) < new Date() ?
                            '<span style="background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">CONCLUÍDA</span>' :
                            '<span style="background: #e0f2fe; color: #0284c7; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">AGENDADA</span>'}
                                    </div>
                                    <h4 style="margin-bottom: 0.5rem; font-size: 1.1rem; color: #1e293b;">${lesson.title}</h4>
                                    <div style="font-size: 0.9rem; color: #64748b; display: flex; gap: 16px; align-items: center;">
                                        <span style="display: flex; align-items: center; gap: 6px;"><i data-lucide="calendar" style="width: 14px;"></i> ${lesson.date}</span>
                                        <span style="display: flex; align-items: center; gap: 6px;"><i data-lucide="clock" style="width: 14px;"></i> ${lesson.time}</span>
                                    </div>
                                </div>
                                <button class="btn-primary" style="width: auto; padding: 0.6rem 1.2rem; font-size: 0.9rem; border-radius: 8px;">
                                    <i data-lucide="play-circle" style="width: 16px; height: 16px; margin-right: 6px;"></i> Ver Conteúdo
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `;
                }

            }


            if (window.lucide) lucide.createIcons();

        } catch (error) {
            console.error("Error fetching student dashboard data:", error);
            contentEl.innerHTML = `< p style = "color: #ef4444;" > Erro ao carregar dados: ${error.message}</p > `;
        }
    }
};

