import { authService } from '../services/auth-service.js';
import { ProfileModal } from './profile-view.js';
import { db } from '../config/firebase.js';
import { Sidebar } from '../ui/sidebar.js';
import { DatePicker } from '../ui/date-picker.js';
import { TimePicker } from '../ui/time-picker.js';
import { Toast } from '../ui/toast.js';
import { modal } from '../ui/modal.js';

export const StudentDashboard = {
    render: (user) => {
        const name = user.displayName || user.email.split('@')[0];
        return `
            <section id="dashboard-view" class="view active">
                <div class="dashboard-layout">
                    ${Sidebar.render(user, 'dash')}
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

    attachEvents: (navigate, user) => {
        Sidebar.attachEvents(navigate, 'student');

        // Navigation Logic
        const navDash = document.getElementById('nav-dash');
        const navClasses = document.getElementById('nav-classes');

        if (navDash) navDash.onclick = () => {
            navDash.classList.add('active');
            navClasses.classList.remove('active');
            StudentDashboard.fetchTeacherData(user, false); // Show Dashboard
        };

        if (navClasses) navClasses.onclick = () => {
            navClasses.classList.add('active');
            navDash.classList.remove('active');
            StudentDashboard.fetchTeacherData(user, true); // Show Lessons List
        };

        // Initial Load (Dashboard)
        StudentDashboard.fetchTeacherData(user, false);
    },

    fetchTeacherData: async (user, showAllLessons = false) => {
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

                    // Update Student record in Teacher's Sub-collection
                    await db.collection('users').doc(linkData.teacherUid).collection('students').doc(linkData.studentId)
                        .update({
                            status: 'active',
                            userUid: user.uid
                        });

                    // Reload data
                    return StudentDashboard.fetchTeacherData(user, showAllLessons);
                }

                contentEl.innerHTML = `
                    <div style="background: white; padding: 3rem; border-radius: 16px; text-align: center;">
                        <i data-lucide="user-plus" style="width: 48px; height: 48px; color: #94a3b8; margin-bottom: 1rem;"></i>
                        <h3>Aguardando Confirmação</h3>
                        <p style="color: #64748b; margin-top: 0.5rem;">Seu registro foi enviado para o professor. <br>Aguarde a aprovação para acessar suas aulas.</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
                return;
            }

            // 2. Fetch Lessons and Teacher Info
            const teacherUid = userData.linkedTeacher;

            // Fetch lessons
            let lessons = [];
            let isPendingApproval = false;

            try {
                const lessonsSnapshot = await db.collection('lessons')
                    .where('teacherUid', '==', teacherUid)
                    .where('studentId', '==', userData.studentIdInTeacherDoc || '')
                    .get();
                lessons = lessonsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (lessonError) {
                console.warn("Could not fetch lessons:", lessonError);
                isPendingApproval = true;
            }

            // Fetch Teacher Profile with Retry
            let teacherDoc = { exists: false };
            try {
                teacherDoc = await db.collection('users').doc(teacherUid).get();
            } catch (err) {
                console.warn("Teacher fetch failed, retrying...");
                await new Promise(r => setTimeout(r, 800));
                teacherDoc = await db.collection('users').doc(teacherUid).get();
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
                    <div class="stat-card" style="cursor: pointer; background: var(--bg-primary); border: 1px solid var(--primary-color);" id="btn-agenda-shortcut">
                        <div class="stat-header"><div class="stat-icon" style="background: white; color: var(--primary-color);"><i data-lucide="calendar-plus"></i></div></div>
                        <div class="stat-value" style="font-size: 1.2rem; margin-top: 0.5rem; color: var(--primary-color);">Agendar Aula</div>
                        <div class="stat-label">Novo horário de reforço</div>
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

            // Shortcut to Agenda
            const agendaBtn = document.getElementById('btn-agenda-shortcut');
            if (agendaBtn) agendaBtn.onclick = () => window.navigate ? window.navigate('student-agenda') : null;

        } catch (error) {
            console.error("Error fetching student dashboard data:", error);
            contentEl.innerHTML = `<p style="color: #ef4444;">Erro ao carregar dados: ${error.message}</p>`;
        }
    },

    renderAgenda: (user) => {
        return `
            <section id="agenda-view" class="view active">
                <div class="dashboard-layout">
                    ${Sidebar.render(user, 'agenda')}
                    <main class="main-content">
                        <div class="header-bar">
                            <h2>Agendar Aula</h2>
                        </div>

                        <div class="content-body">
                            <div class="card glass" style="max-width: 600px; margin: 0 auto; padding: 2.5rem;">
                                <div style="text-align: center; margin-bottom: 2rem;">
                                    <div style="width: 64px; height: 64px; background: var(--bg-primary); color: var(--primary-color); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
                                        <i data-lucide="calendar-plus" style="width: 32px; height: 32px;"></i>
                                    </div>
                                    <h3 style="font-size: 1.5rem; color: var(--dark);">Escolha um Horário</h3>
                                    <p style="color: #64748b;">Agende uma aula de reforço ou reposição com seu professor.</p>
                                </div>

                                <form id="form-agenda-student">
                                    <div class="input-group">
                                        <label>Título da Aula</label>
                                        <div class="input-wrapper">
                                            <i data-lucide="tag"></i>
                                            <input type="text" id="agenda-title" placeholder="Ex: Reforço de Gramática" required>
                                        </div>
                                    </div>

                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                                        <div class="input-group">
                                            <label>Data</label>
                                            <div class="input-wrapper">
                                                <i data-lucide="calendar"></i>
                                                <input type="text" id="agenda-date" placeholder="Selecione" required>
                                            </div>
                                        </div>
                                        <div class="input-group">
                                            <label>Horário</label>
                                            <div class="input-wrapper">
                                                <i data-lucide="clock"></i>
                                                <input type="text" id="agenda-time" placeholder="Selecione" required>
                                            </div>
                                        </div>
                                    </div>

                                    <div id="busy-slots-info" style="margin: 1.5rem 0; display: none;">
                                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                                            <div style="font-size: 0.8rem; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 6px;">
                                                <i data-lucide="alert-circle" style="width: 14px;"></i> Horários Ocupados do Professor
                                            </div>
                                            <div id="busy-slots-list" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                                <!-- Times pop here -->
                                            </div>
                                        </div>
                                    </div>

                                    <button type="submit" class="btn-primary" style="margin-top: 1rem;">Confirmar Agendamento</button>
                                </form>
                            </div>
                        </div>
                    </main>
                </div>
            </section>
        `;
    },

    attachAgendaEvents: (navigate, user) => {
        Sidebar.attachEvents(navigate, 'student');
        if (window.lucide) lucide.createIcons();

        const form = document.getElementById('form-agenda-student');
        const dateInput = document.getElementById('agenda-date');
        const timeInput = document.getElementById('agenda-time');
        const busyInfo = document.getElementById('busy-slots-info');
        const busyList = document.getElementById('busy-slots-list');

        const dp = new DatePicker('agenda-date');
        const tp = new TimePicker('agenda-time');

        let teacherUid = null;
        let studentId = null;

        // Load teacher context
        const loadContext = async () => {
            const doc = await db.collection('users').doc(user.uid).get();
            const data = doc.data();
            teacherUid = data.linkedTeacher;
            studentId = data.studentIdInTeacherDoc;

            if (!teacherUid) {
                Toast.show('Você precisa estar vinculado a um professor para agendar.', 'error');
                navigate('student-dashboard');
            }
        };
        loadContext();

        // Check availability on date change
        // Check availability on date change
        dateInput.onchange = async () => {
            const date = dp.getValue();
            if (!date || !teacherUid) return;

            try {
                const snapshot = await db.collection('lessons')
                    .where('teacherUid', '==', teacherUid)
                    .where('date', '==', date)
                    .get();

                const busyTimes = snapshot.docs.map(doc => doc.data().time);

                if (busyTimes.length > 0) {
                    busyInfo.style.display = 'block';
                    busyList.innerHTML = busyTimes.map(t => `
                        <span style="background: #fee2e2; color: #ef4444; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; border: 1px solid #fecaca;">
                            ${t}
                        </span>
                    `).join('');
                } else {
                    busyInfo.style.display = 'none';
                }
            } catch (error) {
                console.error("Erro ao verificar disponibilidade:", error);
            }
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            const title = document.getElementById('agenda-title').value;
            const date = dp.getValue();
            const time = tp.getValue();

            if (!date || !time) {
                Toast.show('Por favor, selecione data e hora.', 'warning');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="lucide-spinner" style="animation: spin 1s linear infinite;"></i> Agendando...';

            try {
                // Final Availability Check
                const finalCheck = await db.collection('lessons')
                    .where('teacherUid', '==', teacherUid)
                    .where('date', '==', date)
                    .where('time', '==', time)
                    .get();

                if (!finalCheck.empty) {
                    Toast.show('Desculpe, este horário acabou de ser ocupado.', 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Confirmar Agendamento';
                    return;
                }

                // Create Lesson
                await db.collection('lessons').add({
                    teacherUid: teacherUid,
                    studentId: studentId,
                    userUid: user.uid,
                    title: title,
                    date: date,
                    time: time,
                    type: 'reinforcement',
                    status: 'AGENDADA',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                Toast.show('Aula agendada com sucesso!', 'success');
                setTimeout(() => navigate('student-dashboard'), 1500);

            } catch (error) {
                console.error("Erro ao agendar:", error);
                Toast.show('Erro ao processar agendamento.', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Confirmar Agendamento';
            }
        };
    }
};
