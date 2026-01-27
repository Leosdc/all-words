import { authService } from '../services/auth-service.js';
import { db, auth } from '../config/firebase.js';
import { DatePicker } from '../ui/date-picker.js';
import { TimePicker } from '../ui/time-picker.js';
import { modal } from '../ui/modal.js';
import { Toast } from '../ui/toast.js';
import { ProfileModal } from './profile-view.js';

// Helper for Sidebar (Dry Principle applied manually here for simplicity in this file)
const getSidebar = (active) => {
    const role = authService.currentRole;
    return `
        <aside class="sidebar">
            <div class="logo-text" style="margin-bottom: 3rem; line-height: 1.2;">ALL WORDS<br><span style="font-size: 0.45em; opacity: 0.6; display: block;">${role === 'admin' ? 'ADMIN' : 'TEACHER'}</span></div>
            <nav>
                <div class="nav-item ${active === 'overview' ? 'active' : ''}" id="nav-overview"><i data-lucide="layout-dashboard"></i> Visão Geral</div>
                <div class="nav-item ${active === 'students' ? 'active' : ''}" id="nav-students"><i data-lucide="users"></i> Meus Alunos</div>
                <div class="nav-item ${active === 'exercises' ? 'active' : ''}" id="nav-exercises"><i data-lucide="dumbbell"></i> Exercícios</div>
                <div class="nav-item ${active === 'formation' ? 'active' : ''}" id="nav-formation"><i data-lucide="graduation-cap"></i> Formação</div>
                
                ${role === 'admin' ? `
                <div style="margin: 1.5rem 0 0.5rem 1rem; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Administração</div>
                <div class="nav-item ${active === 'admin' ? 'active' : ''}" id="nav-admin-users"><i data-lucide="shield-check"></i> Gestão de Roles</div>
                ` : ''}

                <div style="margin-top: auto;"></div>
                <div style="margin-top: auto;"></div>
                <div class="nav-item" id="btn-profile"><i data-lucide="user-cog"></i> Editar Perfil</div>
                <div class="nav-item" id="btn-logout-teacher"><i data-lucide="log-out"></i> Sair</div>
            </nav>
        </aside>
    `;
};

// --- SYNC STUDENTS WITH USERS ---
window.syncStudentsWithUsers = async (event) => {
    const btn = event?.currentTarget;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="lucide-spinner" style="animation: spin 1s linear infinite;"></i> Sincronizando...';
    }

    const uid = getUserId();
    if (!uid) return;

    try {
        console.log("Iniciando sincronização manual de alunos...");
        const snapshot = await db.collection('students').where('teacherUid', '==', uid).get();
        const students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let foundCount = 0;
        const syncPromises = [];

        for (const student of students) {
            if (student.status === 'active' && student.userUid) continue; // Already linked

            const email = (student.email || "").toLowerCase().trim();
            if (!email) continue;

            const userQuery = await db.collection('users').where('email', '==', email).get();
            if (!userQuery.empty) {
                const existingUser = userQuery.docs[0];
                const studentId = student.id;
                foundCount++;

                // 1. Update Global Student record
                syncPromises.push(db.collection('students').doc(studentId).update({
                    status: 'active',
                    userUid: existingUser.id
                }));

                // 2. Update Student User profile
                syncPromises.push(db.collection('users').doc(existingUser.id).update({
                    linkedTeacher: uid,
                    studentIdInTeacherDoc: studentId
                }));

                // 3. Update ALL existing lessons for this student to include userUid
                const studentLessons = await db.collection('lessons').where('studentId', '==', studentId).get();
                studentLessons.forEach(lDoc => {
                    syncPromises.push(db.collection('lessons').doc(lDoc.id).update({ userUid: existingUser.id }));
                });

                // 4. Create/Update student_link for consistency
                syncPromises.push(db.collection('student_links').doc(email).set({
                    teacherUid: uid,
                    studentId: studentId,
                    status: 'active',
                    uid: existingUser.id
                }, { merge: true }));
            }
        }

        if (syncPromises.length > 0) {
            await Promise.all(syncPromises);
            Toast.show(`${foundCount} aluno(s) vinculado(s) com sucesso!`, 'success');
            fetchStudents(); // Refresh the list
        } else {
            Toast.show("Nenhum novo vínculo encontrado. Certifique-se de que os alunos já criaram suas contas com o e-mail correto.", 'info', 5000);
        }

    } catch (error) {
        console.error("Erro na sincronização:", error);
        Toast.show("Erro ao sincronizar. Tente novamente.", 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="refresh-cw" style="width: 18px; height: 18px;"></i> Sincronizar Vínculos';
            if (window.lucide) lucide.createIcons();
        }
    }
};

const attachSidebarEvents = (navigate) => {
    document.getElementById('nav-overview').onclick = () => navigate('teacher-dashboard');
    document.getElementById('nav-students').onclick = () => navigate('teacher-students');
    document.getElementById('nav-exercises').onclick = () => navigate('teacher-exercises');
    document.getElementById('nav-formation').onclick = () => navigate('teacher-formation');

    const navAdmin = document.getElementById('nav-admin-users');
    if (navAdmin) navAdmin.onclick = () => navigate('admin-dashboard');

    const btnProfile = document.getElementById('btn-profile');
    if (btnProfile) btnProfile.onclick = () => ProfileModal.open(authService.currentUser);

    const btnLogout = document.getElementById('btn-logout-teacher');
    if (btnLogout) btnLogout.onclick = () => authService.logout();

    // Ensure Chat Widget is visible in all teacher sub-views
    if (window.chatWidget) window.chatWidget.setVisibility(true);
};

// Student Data Store (Managed via Firestore)
let studentsData = [];

// Helper to get current User ID
const getUserId = () => {
    return auth.currentUser ? auth.currentUser.uid : null;
};

// Helper to update just the grid part
const renderStudentGrid = () => {
    const listContainer = document.getElementById('student-list-container');
    if (!listContainer) return;

    const contentBody = listContainer.querySelector('.content-body');
    if (!contentBody) return;

    if (studentsData.length === 0) {
        contentBody.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 16px; text-align: center; color: #64748b;">
                <i data-lucide="users" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 1rem;"></i>
                <p>Você ainda não tem alunos cadastrados.</p>
            </div>
        `;
    } else {
        contentBody.innerHTML = `
            <div class="student-grid" id="students-grid-display">
                ${studentsData.map(student => `
                    <div class="student-card-item" onclick="window.openStudentDetail('${student.id}')">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                            <div style="width: 48px; height: 48px; background: #e0f2fe; color: var(--primary-blue); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.2rem;">
                                ${student.name.substring(0, 2).toUpperCase()}
                            </div>
                            <span class="student-status-badge ${student.status === 'active' ? 'status-active' : (student.status === 'waiting' ? 'status-waiting' : 'status-cancelled')}">
                                ${student.status === 'active' ? 'Efetivado' : (student.status === 'waiting' ? 'Aguardando' : 'Cancelado')}
                            </span>
                        </div>
                        <h3 style="font-size: 1.1rem; margin-bottom: 0.2rem;">${student.name}</h3>
                        <p style="font-size: 0.9rem; color: #64748b;">Nível: ${student.level} • ${student.age} anos</p>
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #f1f5f9; font-size: 0.85rem; color: #64748b; display: flex; align-items: center; gap: 6px;">
                            <i data-lucide="target" style="width: 14px;"></i> ${student.reason}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    if (window.lucide) lucide.createIcons();
};

// Fetch Students from Firestore
const fetchStudents = async () => {
    const uid = getUserId();
    if (!uid) return;

    try {
        const snapshot = await db.collection('students').where('teacherUid', '==', uid).get();
        studentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Update DOM directly instead of full navigate/render loop
        renderStudentGrid();
    } catch (error) {
        console.error("Error fetching students:", error);
    }
};

// Add Student to Firestore
const addStudentToFirestore = async (student) => {
    const uid = getUserId();
    if (!uid) return;

    try {
        const studentEmail = (student.email || "").toLowerCase().trim();

        // 1. Save in Global 'students' collection
        const studentData = { ...student, teacherUid: uid };
        await db.collection('students').doc(student.id).set(studentData, { merge: true });

        // 2. Check if this student ALREADY has an account (Retroactive Linking)
        if (studentEmail) {
            const userSnapshot = await db.collection('users').where('email', '==', studentEmail).get();

            if (!userSnapshot.empty) {
                const existingUserDoc = userSnapshot.docs[0];
                const existingUserId = existingUserDoc.id;

                console.log("Usuário já existe. Vinculando retroativamente:", studentEmail);

                // Update Global Student record to ACTIVE and link UID
                await db.collection('students').doc(student.id)
                    .update({
                        status: 'active',
                        userUid: existingUserId
                    });

                // Update Student's profile record to include teacher link (for dashboard)
                await db.collection('users').doc(existingUserId).update({
                    linkedTeacher: uid,
                    studentIdInTeacherDoc: student.id
                });

                // Update the link record too
                await db.collection('student_links').doc(studentEmail).set({
                    teacherUid: uid,
                    studentId: student.id,
                    status: 'active',
                    uid: existingUserId
                }, { merge: true });

            } else {
                // Not registered yet, just create the link for future registration
                if (student.status === 'waiting') {
                    await db.collection('student_links').doc(studentEmail).set({
                        teacherUid: uid,
                        studentId: student.id,
                        name: student.name,
                        status: 'waiting'
                    }, { merge: true });
                }
            }
        }
    } catch (error) {
        console.error("Error saving student:", error);
    }
};

// Update Student in Firestore
// Update Student in Firestore
const updateStudentInFirestore = async (student) => {
    try {
        await db.collection('students').doc(student.id).update(student);
    } catch (error) {
        console.error("Error updating student:", error);
    }
};

// --- LESSONS LOGIC ---
let lessonsData = [];

const fetchLessons = async () => {
    const uid = getUserId();
    if (!uid) return;

    try {
        const snapshot = await db.collection('lessons').where('teacherUid', '==', uid).get();
        lessonsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sort locally to avoid Firebase Index requirement
        lessonsData.sort((a, b) => {
            const dateA = new Date(a.date + 'T' + (a.time || '00:00'));
            const dateB = new Date(b.date + 'T' + (b.time || '00:00'));
            return dateA - dateB;
        });
    } catch (error) {
        console.error("Error fetching lessons:", error);
    }
};

const addLessonToFirestore = async (lesson) => {
    const uid = getUserId();
    if (!uid) return;

    try {
        const student = studentsData.find(s => s.id === lesson.studentId);
        const lessonData = {
            ...lesson,
            teacherUid: uid,
            userUid: student ? student.userUid : null
        };
        if (lesson.id) {
            // Update existing
            await db.collection('lessons').doc(lesson.id).set(lessonData, { merge: true });

            // Update local
            const index = lessonsData.findIndex(l => l.id === lesson.id);
            if (index !== -1) lessonsData[index] = lessonData;
        } else {
            // Create new
            const docRef = await db.collection('lessons').add(lessonData);
            lessonData.id = docRef.id;
            lessonsData.push(lessonData);
        }
        lessonsData.sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
        console.error("Error saving lesson:", error);
        throw error; // Propagate to show UI error if needed
    }
};

const deleteLessonFromFirestore = async (studentId, lessonId) => {
    try {
        await db.collection('lessons').doc(lessonId).delete();
        // Update local
        const index = lessonsData.findIndex(l => l.id === lessonId);
        if (index !== -1) lessonsData.splice(index, 1);
    } catch (error) {
        console.error("Error deleting lesson:", error);
    }
};

export const TeacherStudents = {
    render: () => {
        return `
            <section id="teacher-students-view" class="view active teacher-dash">
                <style>
                    /* Inline dirty fix for modal z-index if needed, though css file handles it */
                </style>
                <div class="dashboard-layout">
                    ${getSidebar('students')}
                    <main class="main-content">
                        <!-- LIST VIEW -->
                        <div id="student-list-container">
                            <div class="header-bar">
                                <h2>Meus Alunos</h2>
                                <div style="display: flex; gap: 10px;">
                                    <button id="btn-sync-students" class="btn-secondary" onclick="window.syncStudentsWithUsers(event)" style="width: auto; padding: 0.5rem 1rem; margin: 0; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 8px; background: white; color: var(--dark); border-color: #e2e8f0;">
                                        <i data-lucide="refresh-cw" style="width: 18px; height: 18px;"></i> Sincronizar Vínculos
                                    </button>
                                    <button id="btn-open-add-student" class="btn-primary" style="width: auto; padding: 0.5rem 1rem; margin: 0; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                        <i data-lucide="plus" style="width: 18px; height: 18px;"></i> Adicionar Aluno
                                    </button>
                                </div>
                            </div>
                            <div class="content-body">
                                ${studentsData.length === 0 ? `
                                    <div style="background: white; padding: 2rem; border-radius: 16px; text-align: center; color: #64748b;">
                                        <i data-lucide="users" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 1rem;"></i>
                                        <p>Você ainda não tem alunos cadastrados.</p>
                                    </div>
                                ` : `
                                    <div class="student-grid" id="students-grid-display">
                                        <!-- Students rendered here -->
                                        ${studentsData.map(student => `
                                            <div class="student-card-item" onclick="window.openStudentDetail('${student.id}')">
                                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                                                    <div style="width: 48px; height: 48px; background: #e0f2fe; color: var(--primary-blue); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.2rem;">
                                                        ${student.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <span class="student-status-badge ${student.status === 'active' ? 'status-active' : (student.status === 'waiting' ? 'status-waiting' : 'status-cancelled')}">
                                                        ${student.status === 'active' ? 'Efetivado' : (student.status === 'waiting' ? 'Aguardando' : 'Cancelado')}
                                                    </span>
                                                </div>
                                                <h3 style="font-size: 1.1rem; margin-bottom: 0.2rem;">${student.name}</h3>
                                                <p style="font-size: 0.9rem; color: #64748b;">Nível: ${student.level} • ${student.age} anos</p>
                                                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #f1f5f9; font-size: 0.85rem; color: #64748b; display: flex; align-items: center; gap: 6px;">
                                                    <i data-lucide="target" style="width: 14px;"></i> ${student.reason}
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- DETAIL VIEW (Hidden by default) -->
                        <div id="student-detail-container" style="display: none;">
                            <!-- Content injected via JS -->
                        </div>

                        <!-- MODALS moved inside main-content for smart navigation support -->
                        <!-- ADD STUDENT MODAL -->
                        <div id="add-student-modal" class="modal-overlay">
                            <div class="modal-content" style="text-align: left;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                                    <h2>Novo Aluno</h2>
                                    <button id="btn-close-modal" style="background: none; border: none; cursor: pointer;">
                                        <i data-lucide="x" style="width: 24px; height: 24px;"></i>
                                    </button>
                                </div>
                                <form id="form-add-student">
                                    <input type="hidden" name="b_id" id="input-student-id">
                                    <div class="form-group">
                                        <label>Nome Completo</label>
                                        <input type="text" name="b_name" class="form-input" required placeholder="Ex: Ana Souza">
                                    </div>
                                    <div class="form-group">
                                        <label>Email do Aluno</label>
                                        <input type="email" name="b_email" class="form-input" required placeholder="Ex: ana.souza@email.com">
                                    </div>
                                    <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                        <div>
                                            <label>Idade</label>
                                            <input type="number" name="b_age" class="form-input" required placeholder="Ex: 25">
                                        </div>
                                        <div>
                                            <label>Nível Atual</label>
                                            <select name="b_level" class="form-select" required>
                                                <option value="Pré A">Pré A</option>
                                                <option value="A1">A1</option>
                                                <option value="A2">A2</option>
                                                <option value="B1">B1</option>
                                                <option value="B2">B2</option>
                                                <option value="C1">C1</option>
                                                <option value="C2">C2</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Objetivo</label>
                                        <select name="b_reason" class="form-select" required>
                                            <option value="Viagem">Viagem</option>
                                            <option value="Negócios">Negócios</option>
                                            <option value="Comunicação">Comunicação</option>
                                            <option value="Informação">Informação</option>
                                            <option value="Trabalho">Trabalho</option>
                                            <option value="Outro">Outro</option>
                                        </select>
                                        <input type="text" name="b_reason_other" id="input-other-reason" class="form-input" placeholder="Qual o objetivo?" style="display: none; margin-top: 0.5rem;">
                                    </div>
                                     <div class="form-group">
                                        <label>Status Inicial</label>
                                        <select name="b_status" class="form-select" required>
                                            <option value="waiting">Aguardando Contrato</option>
                                            <option value="active">Efetivado</option>
                                            <option value="cancelled">Cancelado</option>
                                        </select>
                                    </div>
                                    <div style="margin-top: 2rem; display: flex; gap: 1rem;">
                                        <button type="button" id="btn-cancel-add" class="btn-secondary" style="flex: 1; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer; font-weight: 500; font-size: 1rem;">Cancelar</button>
                                        <button type="submit" class="btn-primary" style="flex: 1; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0; border: 1px solid transparent; border-radius: 12px; font-weight: 600; font-size: 1rem;">Cadastrar Aluno</button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- ADD LESSON MODAL -->
                        <div id="add-lesson-modal" class="modal-overlay">
                            <div class="modal-content" style="text-align: left;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                                    <h2>Nova Aula</h2>
                                    <button id="btn-close-lesson-modal" style="background: none; border: none; cursor: pointer;">
                                        <i data-lucide="x" style="width: 24px; height: 24px;"></i>
                                    </button>
                                </div>
                                <form id="form-add-lesson">
                                    <input type="hidden" name="l_student_id" id="input-lesson-student-id">
                                    <input type="hidden" name="l_id" id="input-lesson-id">
                                    <div class="form-group">
                                        <label>Título da Aula</label>
                                        <input type="text" name="l_title" class="form-input" required placeholder="Ex: Aula 01 - Verb To Be">
                                    </div>
                                    <div class="form-group">
                                        <label>Tema Central</label>
                                        <input type="text" name="l_theme" class="form-input" required placeholder="Ex: Gramática Básica">
                                    </div>
                                    <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                        <div>
                                            <label>Data</label>
                                            <input type="text" id="input-lesson-date-visual" class="form-input" required placeholder="dd/mm/aaaa">
                                            <input type="hidden" name="l_date" id="input-lesson-date-hidden">
                                        </div>
                                        <div>
                                            <label>Horário</label>
                                            <input type="text" name="l_time" id="input-lesson-time" class="form-input" required placeholder="--:--">
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Conteúdo Programado</label>
                                        <div id="lesson-content-list" style="margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; max-height: 250px; overflow-y: auto; padding-right: 5px; border-radius: 8px;">
                                            <!-- Items will be injected here -->
                                        </div>
                                        <div style="display: flex; gap: 0.5rem;">
                                            <input type="text" id="input-content-item" class="form-input" placeholder="Adicionar item..." style="flex: 1;">
                                            <button type="button" id="btn-add-content" style="width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: #0ea5e9; color: white; border: none; cursor: pointer; transition: background 0.2s;">
                                                <i data-lucide="plus" style="width: 24px; height: 24px;"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div style="margin-top: 2rem; display: flex; gap: 0.8rem;">
                                        <button type="button" id="btn-delete-lesson" style="display: none; background: #fee2e2; color: #b91c1c; border: none; width: 44px; height: 44px; border-radius: 12px; cursor: pointer; align-items: center; justify-content: center; transition: opacity 0.2s;">
                                            <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
                                        </button>
                                        <button type="button" id="btn-cancel-lesson" style="flex: 1; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer; font-weight: 500; font-size: 1rem; transition: background 0.2s;">Cancelar</button>
                                        <button type="submit" style="flex: 2; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0; background: #0ea5e9; color: white; border: 1px solid transparent; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1rem; transition: background 0.2s;">Salvar Aula</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                        <!-- EXERCISE SELECTION MODAL -->
                        <div id="exercise-selection-modal" class="modal-overlay">
                            <div class="modal-content" style="max-width: 500px; text-align: center; padding: 3rem 2rem;">
                                <button id="btn-close-exercise-selection" style="position: absolute; top: 1.5rem; right: 1.5rem; background: none; border: none; cursor: pointer; color: #64748b;">
                                    <i data-lucide="x" style="width: 24px; height: 24px;"></i>
                                </button>
                                
                                <div class="modal-icon-wrapper" style="background: #e0f2fe; color: var(--primary-blue); margin-bottom: 1.5rem;">
                                    <i data-lucide="dumbbell" style="width: 32px; height: 32px;"></i>
                                </div>
                                
                                <h2 style="margin-bottom: 0.5rem;">Gerenciar Exercícios</h2>
                                <p style="color: #64748b; margin-bottom: 2.5rem;">Como você deseja adicionar exercícios a esta aula?</p>
                                
                                <div style="display: grid; gap: 1rem;">
                                    <button id="btn-create-ai-exercise" class="btn-primary" style="height: 60px; display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 1.1rem; background: linear-gradient(135deg, #0ea5e9, #2563eb);">
                                        <i data-lucide="sparkles" style="width: 24px; height: 24px;"></i>
                                        Criar com Inteligência Artificial
                                    </button>
                                    
                                    <button id="btn-create-manual-exercise" class="btn-secondary" style="height: 60px; display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 1.1rem; border: 2px solid #e2e8f0; color: #475569;">
                                        <i data-lucide="edit-3" style="width: 22px; height: 22px;"></i>
                                        Criar Manualmente
                                    </button>

                                    <button id="btn-use-existing-exercise" class="btn-secondary" style="height: 60px; display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 1.1rem; border: 2px solid #e2e8f0; color: #475569;">
                                        <i data-lucide="library" style="width: 22px; height: 22px;"></i>
                                        Usar Exercício Existente
                                    </button>
                                </div>
                                
                                <p style="margin-top: 1.5rem; font-size: 0.85rem; color: #94a3b8;">
                                    Os exercícios serão vinculados automaticamente a esta aula.
                                </p>
                            </div>
                        </div>

                         <!-- SELECT EXISTING EXERCISE MODAL -->
                        <div id="select-existing-exercise-modal" class="modal-overlay">
                            <div class="modal-content" style="max-width: 600px; text-align: left; padding: 2rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                                    <h2>Selecionar Exercício</h2>
                                    <button id="btn-close-select-exercise" style="background: none; border: none; cursor: pointer;">
                                        <i data-lucide="x" style="width: 24px; height: 24px;"></i>
                                    </button>
                                </div>
                                
                                <div style="margin-bottom: 1.5rem;">
                                    <input type="text" id="input-search-exercise" class="form-input" placeholder="Buscar por título ou tema..." style="width: 100%;">
                                </div>

                                <div id="existing-exercises-list" style="max-height: 400px; overflow-y: auto; padding-right: 5px;">
                                    <!-- List injected via JS -->
                                </div>
                            </div>
                        </div>
                    </main>
                </div>

            </section>
        `;
    },

    attachEvents: (navigate) => {
        const studentModalEl = document.getElementById('add-student-modal');
        const form = document.getElementById('form-add-student');

        // --- 1. EXPOSE GLOBAL FUNCTIONS FIRST (to prevent "is not a function" errors) ---
        window.closeStudentDetail = () => {
            const list = document.getElementById('student-list-container');
            const detail = document.getElementById('student-detail-container');
            if (list) list.style.display = 'block';
            if (detail) detail.style.display = 'none';
        };

        window.openStudentModal = (studentId = null) => {
            if (!form || !studentModalEl) return;
            form.reset();
            const titleEl = studentModalEl.querySelector('h2');
            const submitBtn = studentModalEl.querySelector('button[type="submit"]');

            if (studentId) {
                const student = studentsData.find(s => s.id === studentId);
                if (student) {
                    const idInput = document.getElementById('input-student-id');
                    if (idInput) idInput.value = student.id;

                    form.querySelector('[name="b_name"]').value = student.name;
                    form.querySelector('[name="b_email"]').value = student.email;
                    form.querySelector('[name="b_age"]').value = student.age;
                    form.querySelector('[name="b_level"]').value = student.level;
                    form.querySelector('[name="b_status"]').value = student.status;

                    const reasons = ["Viagem", "Negócios", "Comunicação", "Informação", "Trabalho"];
                    const otherInput = document.getElementById('input-other-reason');
                    if (reasons.includes(student.reason)) {
                        form.querySelector('[name="b_reason"]').value = student.reason;
                        if (otherInput) otherInput.style.display = 'none';
                    } else {
                        form.querySelector('[name="b_reason"]').value = 'Outro';
                        if (otherInput) {
                            otherInput.style.display = 'block';
                            otherInput.value = student.reason;
                        }
                    }

                    if (titleEl) titleEl.textContent = 'Editar Aluno';
                    if (submitBtn) submitBtn.textContent = 'Salvar Alterações';
                }
            } else {
                const idInput = document.getElementById('input-student-id');
                if (idInput) idInput.value = '';
                if (titleEl) titleEl.textContent = 'Novo Aluno';
                if (submitBtn) submitBtn.textContent = 'Cadastrar Aluno';
                const otherInput = document.getElementById('input-other-reason');
                if (otherInput) otherInput.style.display = 'none';
            }
            studentModalEl.classList.add('active');
        };

        const toggleModal = (show) => {
            if (show) window.openStudentModal();
            else if (studentModalEl) studentModalEl.classList.remove('active');
        };

        // --- 2. REST OF EVENTS ---
        attachSidebarEvents(navigate);

        if (studentsData.length === 0) fetchStudents();
        else renderStudentGrid();

        if (lessonsData.length === 0) fetchLessons();

        if (document.getElementById('btn-open-add-student')) {
            document.getElementById('btn-open-add-student').onclick = () => window.openStudentModal();
        }
        if (document.getElementById('btn-close-modal')) {
            document.getElementById('btn-close-modal').onclick = () => toggleModal(false);
        }
        if (document.getElementById('btn-cancel-add')) {
            document.getElementById('btn-cancel-add').onclick = () => toggleModal(false);
        }

        if (studentModalEl) {
            // Desabilitado fechar clicando fora para evitar perda de dados por acidente
            studentModalEl.onclick = (e) => {
                if (e.target === studentModalEl) {
                    console.log("Clique fora do modal ignorado para segurança");
                }
            };
        }

        // --- Handle "Outro" Reason ---
        const reasonSelect = form ? form.querySelector('select[name="b_reason"]') : null;
        const otherReasonInput = document.getElementById('input-other-reason');

        if (reasonSelect && otherReasonInput) {
            reasonSelect.onchange = (e) => {
                if (e.target.value === 'Outro') {
                    otherReasonInput.style.display = 'block';
                    otherReasonInput.required = true;
                } else {
                    otherReasonInput.style.display = 'none';
                    otherReasonInput.required = false;
                    otherReasonInput.value = ''; // Clear
                }
            };
        }

        // --- Form Submit ---
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                const studentId = formData.get('b_id'); // Hidden ID

                let finalReason = formData.get('b_reason');
                if (finalReason === 'Outro') {
                    finalReason = formData.get('b_reason_other');
                }

                // Construct object (keep existing skills/created date if edit)
                let studentData = {};

                if (studentId) {
                    // Update
                    const existing = studentsData.find(s => s.id === studentId);
                    studentData = {
                        ...existing,
                        name: formData.get('b_name'),
                        email: formData.get('b_email'),
                        age: formData.get('b_age'),
                        level: formData.get('b_level'),
                        reason: finalReason,
                        status: formData.get('b_status')
                    };

                    // Update local array
                    const index = studentsData.findIndex(s => s.id === studentId);
                    if (index !== -1) studentsData[index] = studentData;

                } else {
                    // Create
                    studentData = {
                        id: Date.now().toString(),
                        name: formData.get('b_name'),
                        email: formData.get('b_email'),
                        age: formData.get('b_age'),
                        level: formData.get('b_level'),
                        reason: finalReason,
                        status: formData.get('b_status'),
                        skills: {
                            reading: { rating: 0, notes: '' },
                            writing: { rating: 0, notes: '' },
                            listening: { rating: 0, notes: '' },
                            speaking: { rating: 0, notes: '' }
                        }
                    };
                    studentsData.push(studentData);
                }

                addStudentToFirestore(studentData);
                toggleModal(false);

                // Refresh view
                navigate('teacher-students');

                // If we were in detail view, update it too (or just close it? user usually wants to see result)
                // For simplicity, navigate resets to list. If user wants to see detail, they click again.
                // Or we can check if detail was open.
                if (studentId) {
                    // If we are editing, we are likely in detail view or list view.
                    // If detail view is open, refresh it?
                    const detailContainer = document.getElementById('student-detail-container');
                    if (detailContainer && detailContainer.style.display === 'block') {
                        window.openStudentDetail(studentId);
                    }
                }
            };
        }

        // --- Detail View Logic ---
        // Expose function globally so onClick in HTML works
        window.openStudentDetail = (id) => {
            const student = studentsData.find(s => s.id === id);
            if (!student) return;

            const listContainer = document.getElementById('student-list-container');
            const detailContainer = document.getElementById('student-detail-container');

            listContainer.style.display = 'none';
            detailContainer.style.display = 'block';

            // Render Detail Content
            detailContainer.innerHTML = `
                <div class="header-bar">
                    <button class="btn-secondary" onclick="window.closeStudentDetail()" style="width: auto; padding: 0.5rem 1rem; color: var(--dark); border: 1px solid #e2e8f0; background: white; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="arrow-left" style="width: 18px;"></i> Voltar
                    </button>
                    <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                        <h2 style="margin: 0;">${student.name}</h2>
                        <span class="student-status-badge ${student.status === 'active' ? 'status-active' : (student.status === 'waiting' ? 'status-waiting' : 'status-cancelled')}">
                            ${student.status === 'active' ? 'Efetivado' : (student.status === 'waiting' ? 'Aguardando' : 'Cancelado')}
                        </span>
                         <button class="btn-primary" onclick="window.openStudentModal('${student.id}')" style="width: auto; padding: 0.5rem 1.2rem; font-size: 0.9rem; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 50px;">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i> <span>Editar</span>
                        </button>
                    </div>
                </div>

                <div class="content-body">
                    <div style="background: white; padding: 2rem; border-radius: 16px; margin-bottom: 2rem;">
                         <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 2rem;">
                            <div><span style="color:#64748b; font-size: 0.9rem;">Email</span><div style="font-weight:600;">${student.email || '-'}</div></div>
                            <div><span style="color:#64748b; font-size: 0.9rem;">Idade</span><div style="font-weight:600;">${student.age} anos</div></div>
                            <div><span style="color:#64748b; font-size: 0.9rem;">Nível Atual</span><div style="font-weight:600;">${student.level}</div></div>
                            <div><span style="color:#64748b; font-size: 0.9rem;">Objetivo</span><div style="font-weight:600;">${student.reason}</div></div>
                         </div>

                         <h3>Habilidades Desenvolvidas</h3>
                         <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-top: 1.5rem;">
                            ${renderSkillBlock(student, 'reading', 'Reading (Leitura)')}
                            ${renderSkillBlock(student, 'writing', 'Writing (Escrita)')}
                            ${renderSkillBlock(student, 'listening', 'Listening (Escuta)')}
                            ${renderSkillBlock(student, 'speaking', 'Speaking (Fala)')}
                         </div>

                         <!-- LESSON PLAN SECTION -->
                         <div style="margin-top: 3rem; border-top: 2px solid #f1f5f9; padding-top: 2rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                                <h3>Plano de Aula</h3>
                                <button class="btn-primary" onclick="window.openAddLessonModal('${student.id}')" style="width: auto; padding: 0.5rem 1rem; font-size: 0.9rem; display: flex; align-items: center; gap: 8px;">
                                    <i data-lucide="plus-circle" style="width: 18px;"></i> Nova Aula
                                </button>
                            </div>

                            <div id="student-lessons-list-${student.id}">
                                ${renderStudentLessons(student.id)}
                            </div>
                         </div>

                         <div style="margin-top: 2rem; display: flex; justify-content: flex-end;">
                            <button class="btn-secondary" onclick="window.closeStudentDetail()" style="width: auto; padding: 0.5rem 1rem; color: var(--dark); border: 1px solid #e2e8f0; background: white; display: flex; align-items: center; gap: 8px;">
                                <i data-lucide="arrow-left" style="width: 18px;"></i> Voltar para Lista
                            </button>
                         </div>
                    </div>
                </div>
            `;

            if (window.lucide) lucide.createIcons();
            attachRatingEvents(student);
        };

        window.closeStudentDetail = () => {
            document.getElementById('student-list-container').style.display = 'block';
            document.getElementById('student-detail-container').style.display = 'none';
        };

        // Helper to render skill block
        function renderSkillBlock(student, skillKey, label) {
            const skill = student.skills[skillKey] || { rating: 0, notes: '' };
            return `
                <div class="skill-rating-container">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <label style="font-weight: 600;">${label}</label>
                        <div class="stars" data-skill="${skillKey}" data-student="${student.id}">
                            ${[1, 2, 3, 4, 5].map(i => `
                                <i data-lucide="star" class="star ${i <= skill.rating ? 'filled' : ''}" data-value="${i}" style="width: 20px; height: 20px;"></i>
                            `).join('')}
                        </div>
                    </div>
                    <textarea class="form-input" placeholder="Anotações sobre ${label}..." rows="3" onchange="window.updateSkillNote('${student.id}', '${skillKey}', this.value)">${skill.notes || ''}</textarea>
                </div>
            `;
        }

        // Attach events for stars
        function attachRatingEvents(student) {
            document.querySelectorAll('.stars .star').forEach(star => {
                star.onclick = (e) => {
                    const skillKey = e.target.closest('.stars').dataset.skill;
                    const value = parseInt(e.target.dataset.value); // Simple 1-5 for now, half stars require more complex UI logic or click position

                    // Update Local Data
                    if (student.skills[skillKey]) {
                        student.skills[skillKey].rating = value;
                        updateStudentInFirestore(student);
                    }

                    // Re-render detail view to show valid stars
                    window.openStudentDetail(student.id);
                };
            });
        }

        // Helper to update notes
        window.updateSkillNote = (id, skillKey, value) => {
            const s = studentsData.find(st => st.id === id);
            if (s && s.skills[skillKey]) {
                s.skills[skillKey].notes = value;
                updateStudentInFirestore(s);
            }
        };

        // --- LESSON PLANS LOGIC ---

        // Helper to render lessons list
        function renderStudentLessons(studentId) {
            const lessons = lessonsData.filter(l => l.studentId === studentId);
            if (lessons.length === 0) {
                return `<p style="color: #94a3b8; font-style: italic; margin-top: 1rem;">Nenhuma aula planejada.</p>`;
            }
            return `
                <div style="display: grid; gap: 1rem; margin-top: 1rem;">
                    ${lessons.map(lesson => `
                        <div onclick="window.openAddLessonModal('${studentId}', '${lesson.id}')" 
                             style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; background: #f8fafc; cursor: pointer; transition: background 0.2s;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                                <h4 style="margin: 0; color: var(--dark); font-weight: 600;">${lesson.title}</h4>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <button onclick="event.stopPropagation(); window.openExerciseSelection('${lesson.id}')" 
                                            style="background: #e0f2fe; color: var(--primary-blue); border: none; padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                        <i data-lucide="dumbbell" style="width: 14px;"></i> Exercícios
                                    </button>
                                    <span style="font-size: 0.85rem; background: #f1f5f9; color: #64748b; padding: 0.2rem 0.6rem; border-radius: 8px;">
                                        ${new Date(lesson.date).toLocaleDateString("pt-BR")} - ${lesson.time}
                                    </span>
                                </div>
                            </div>
                            <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 0.5rem;">
                                <strong>Tema:</strong> ${lesson.theme}
                            </div>
                            ${(lesson.content && lesson.content.length > 0) ? `
                                <div style="margin-top: 0.5rem; background: white; padding: 0.8rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; color: var(--primary-blue);">Conteúdo Programado:</h5>
                                    <ul style="margin: 0; padding-left: 0.5rem; list-style: none; font-size: 0.85rem; color: #475569;">
                                        ${lesson.content.map(item => {
                const text = typeof item === 'string' ? item : item.text;
                const completed = typeof item === 'string' ? false : item.completed;
                return `
                                                <li style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                                    <i data-lucide="${completed ? 'check-circle-2' : 'circle'}" style="width: 14px; height: 14px; color: ${completed ? '#10b981' : '#cbd5e1'};"></i>
                                                    <span style="${completed ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${text}</span>
                                                </li>
                                            `;
            }).join('')}
                                    </ul>
                                </div>
                            ` : (lesson.exercises ? `
                                <div style="font-size: 0.85rem; color: #475569; background: white; padding: 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <i data-lucide="dumbbell" style="width: 12px; vertical-align: middle;"></i> ${lesson.exercises}
                                </div>
                            ` : '')}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Open Add Lesson Modal
        window.openAddLessonModal = (studentId, lessonId = null) => {
            const form = document.getElementById('form-add-lesson');
            if (!form) return;
            form.reset();

            const contentListContainer = document.getElementById('lesson-content-list');
            if (contentListContainer) contentListContainer.innerHTML = '';

            document.getElementById('input-lesson-student-id').value = studentId;
            document.getElementById('input-lesson-id').value = lessonId || '';
            document.getElementById('add-lesson-modal').classList.add('active');

            const titleEl = document.querySelector('#add-lesson-modal h2');
            const submitBtn = document.querySelector('#add-lesson-modal button[type="submit"]');
            const deleteBtn = document.getElementById('btn-delete-lesson');
            // Helper to add item to DOM
            const addItemToDom = (text, completed = false) => {
                const container = document.getElementById('lesson-content-list');
                const div = document.createElement('div');
                div.className = 'content-item';
                div.style.cssText = `background: ${completed ? '#f1f5f9' : '#f8fafc'}; padding: 0.5rem 0.8rem; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 10px; font-size: 0.9rem; transition: background 0.2s;`;

                div.innerHTML = `
                    <input type="checkbox" ${completed ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
                    <span style="flex: 1; ${completed ? 'text-decoration: line-through; color: #94a3b8;' : 'color: #334155;'}">${text}</span>
                    <button type="button" style="color: #ef4444; background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                `;

                const checkbox = div.querySelector('input[type="checkbox"]');
                const span = div.querySelector('span');

                checkbox.onchange = () => {
                    if (checkbox.checked) {
                        span.style.textDecoration = 'line-through';
                        span.style.color = '#94a3b8';
                        div.style.background = '#f1f5f9';
                    } else {
                        span.style.textDecoration = 'none';
                        span.style.color = '#334155';
                        div.style.background = '#f8fafc';
                    }
                };

                div.querySelector('button').onclick = () => div.remove();
                container.appendChild(div);
                if (window.lucide) lucide.createIcons();

                // Auto-scroll to bottom
                container.scrollTop = container.scrollHeight;
            };

            if (lessonId) {
                // Edit Mode
                const lesson = lessonsData.find(l => l.id === lessonId);
                if (lesson) {
                    form.querySelector('[name="l_title"]').value = lesson.title;
                    form.querySelector('[name="l_theme"]').value = lesson.theme;

                    if (lesson.content && Array.isArray(lesson.content)) {
                        lesson.content.forEach(item => {
                            if (typeof item === 'string') {
                                addItemToDom(item);
                            } else {
                                addItemToDom(item.text, item.completed);
                            }
                        });
                    } else if (lesson.exercises) {
                        addItemToDom(lesson.exercises);
                    }

                    document.getElementById('input-lesson-date-visual').value = new Date(lesson.date).toLocaleDateString('pt-BR');
                    document.getElementById('input-lesson-date-hidden').value = lesson.date;

                    if (window.lessonDatePicker) {
                        const [y, m, d] = lesson.date.split('-');
                        window.lessonDatePicker.date = new Date(y, m - 1, d);
                        window.lessonDatePicker.input.dataset.value = lesson.date;
                    }

                    document.getElementById('input-lesson-time').value = lesson.time;

                    titleEl.textContent = 'Editar Aula';
                    submitBtn.textContent = 'Salvar Alterações';

                    if (deleteBtn) {
                        deleteBtn.style.display = 'block';
                        deleteBtn.onclick = async () => {
                            const confirmed = await modal.confirm({
                                title: 'Excluir Aula',
                                message: 'Tem certeza que deseja excluir esta aula? Esta ação não pode ser desfeita.',
                                type: 'error',
                                confirmText: 'Excluir',
                                cancelText: 'Manter Aula'
                            });

                            if (confirmed) {
                                await deleteLessonFromFirestore(studentId, lessonId);
                                closeLessonModal();
                                const listEl = document.getElementById(`student-lessons-list-${studentId}`);
                                if (listEl) listEl.innerHTML = renderStudentLessons(studentId);
                            }
                        };
                    }
                }
            } else {
                // Create Mode
                titleEl.textContent = 'Nova Aula';
                submitBtn.textContent = 'Agendar Aula';
                if (deleteBtn) deleteBtn.style.display = 'none';
            }

            if (!window.lessonDatePicker) {
                const dateInput = document.getElementById('input-lesson-date-visual');
                const hiddenInput = document.getElementById('input-lesson-date-hidden');

                if (dateInput) {
                    window.lessonDatePicker = new DatePicker('input-lesson-date-visual');

                    // Sync with hidden input for form submission
                    dateInput.addEventListener('change', () => {
                        hiddenInput.value = window.lessonDatePicker.getValue();
                    });
                }

                const timeInput = document.getElementById('input-lesson-time');
                if (timeInput) {
                    new TimePicker('input-lesson-time');
                }
            }

            // Attach Content Event
            const btnAdd = document.getElementById('btn-add-content');
            const inputContent = document.getElementById('input-content-item');
            if (btnAdd && inputContent) {
                btnAdd.onclick = () => {
                    const text = inputContent.value.trim();
                    if (text) {
                        addItemToDom(text);
                        inputContent.value = '';
                        inputContent.focus();
                    }
                };
                inputContent.onkeypress = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        btnAdd.click();
                    }
                };
            }
            if (window.lucide) lucide.createIcons();
        };

        const closeLessonModal = () => {
            document.getElementById('add-lesson-modal').classList.remove('active');
        };

        const btnCloseLesson = document.getElementById('btn-close-lesson-modal');
        const btnCancelLesson = document.getElementById('btn-cancel-lesson');
        if (btnCloseLesson) btnCloseLesson.onclick = closeLessonModal;
        if (btnCancelLesson) btnCancelLesson.onclick = closeLessonModal;

        const formLesson = document.getElementById('form-add-lesson');
        if (formLesson) {
            formLesson.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(formLesson);
                const studentId = formData.get('l_student_id');
                const student = studentsData.find(s => s.id === studentId);
                const lessonId = formData.get('l_id');

                // Gather Content List (with completion status)
                const contentList = [];
                document.querySelectorAll('#lesson-content-list .content-item').forEach(item => {
                    contentList.push({
                        text: item.querySelector('span').textContent,
                        completed: item.querySelector('input[type="checkbox"]').checked
                    });
                });

                const lessonPayload = {
                    studentId: studentId,
                    studentName: student ? student.name : 'Unknown',
                    title: formData.get('l_title'),
                    theme: formData.get('l_theme'),
                    date: formData.get('l_date'),
                    time: formData.get('l_time'),
                    content: contentList
                };
                if (lessonId) {
                    lessonPayload.id = lessonId;
                } else {
                    lessonPayload.createdAt = new Date().toISOString();
                }

                await addLessonToFirestore(lessonPayload);
                closeLessonModal();
                formLesson.reset();

                const listEl = document.getElementById(`student-lessons-list-${studentId}`);
                if (listEl) listEl.innerHTML = renderStudentLessons(studentId);
            };
        }

        // --- EXERCISE SELECTION MODAL LOGIC ---
        const exerciseModal = document.getElementById('exercise-selection-modal');
        let currentLessonIdForExercises = null;

        window.openExerciseSelection = (lessonId) => {
            currentLessonIdForExercises = lessonId;
            if (exerciseModal) {
                exerciseModal.classList.add('active');
                if (window.lucide) lucide.createIcons();
            }
        };

        const closeExerciseModal = () => {
            if (exerciseModal) exerciseModal.classList.remove('active');
        };

        const btnCloseSelection = document.getElementById('btn-close-exercise-selection');
        if (btnCloseSelection) btnCloseSelection.onclick = closeExerciseModal;

        if (exerciseModal) {
            exerciseModal.onclick = (e) => {
                if (e.target === exerciseModal) closeExerciseModal();
            };
        }

        const btnManual = document.getElementById('btn-create-manual-exercise');
        if (btnManual) {
            btnManual.onclick = () => {
                closeExerciseModal();
                navigate('teacher-exercises');
                // Optional: scroll to show catalog is active
                setTimeout(() => {
                    const view = document.getElementById('teacher-exercises-view');
                    if (view) view.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            };
        }

        const btnAI = document.getElementById('btn-create-ai-exercise');
        if (btnAI) {
            btnAI.onclick = () => {
                closeExerciseModal();
                // For now, open Lyra chat or similar
                if (window.chatWidget) {
                    window.chatWidget.open();
                    window.chatWidget.addMessage(`Olá! Vamos criar exercícios para a aula ${currentLessonIdForExercises}. Que tipo de atividade você tem em mente?`, 'bot');
                }
            };
        }

        // --- USE EXISTING EXERCISE LOGIC ---
        const btnUseExisting = document.getElementById('btn-use-existing-exercise');
        const modalSelectExercise = document.getElementById('select-existing-exercise-modal');
        const exerciseListContainer = document.getElementById('existing-exercises-list');
        const btnCloseSelectExercise = document.getElementById('btn-close-select-exercise');

        const closeSelectExerciseModal = () => {
            if (modalSelectExercise) modalSelectExercise.classList.remove('active');
        };

        if (btnCloseSelectExercise) btnCloseSelectExercise.onclick = closeSelectExerciseModal;
        if (modalSelectExercise) modalSelectExercise.onclick = (e) => {
            if (e.target === modalSelectExercise) closeSelectExerciseModal();
        };

        // Mock Data
        const mockExercises = [
            { id: 'ex-001', title: 'Verb To Be - Basics', type: 'Múltipla Escolha', level: 'A1' },
            { id: 'ex-002', title: 'Daily Routine Vocabulary', type: 'Associação de Imagens', level: 'A1' },
            { id: 'ex-003', title: 'Present Continuous Practice', type: 'Preencher Lacunas', level: 'A2' },
            { id: 'ex-004', title: 'Travel Dialogues', type: 'Resposta Oral', level: 'B1' },
            { id: 'ex-005', title: 'Business Email Writing', type: 'Correção de Erros', level: 'B2' }
        ];

        const renderExerciseList = (filter = '') => {
            if (!exerciseListContainer) return;
            const filtered = mockExercises.filter(ex =>
                ex.title.toLowerCase().includes(filter.toLowerCase()) ||
                ex.type.toLowerCase().includes(filter.toLowerCase())
            );

            if (filtered.length === 0) {
                exerciseListContainer.innerHTML = `
                    <div style="text-align: center; color: #94a3b8; padding: 2rem;">
                        <i data-lucide="search-x" style="width: 48px; height: 48px; opacity: 0.5;"></i>
                        <p>Nenhum exercício encontrado.</p>
                    </div>
                `;
            } else {
                exerciseListContainer.innerHTML = filtered.map(ex => `
                    <div class="exercise-list-item" onclick="window.selectExerciseForLesson('${ex.id}', '${ex.title}')">
                        <div>
                            <h4>${ex.title}</h4>
                            <p>${ex.type} • ${ex.level}</p>
                        </div>
                        <i data-lucide="plus-circle" style="color: var(--primary-blue); width: 20px;"></i>
                    </div>
                `).join('');
            }
            if (window.lucide) lucide.createIcons({ root: exerciseListContainer });
        };

        if (btnUseExisting) {
            btnUseExisting.onclick = () => {
                closeExerciseModal();
                if (modalSelectExercise) {
                    modalSelectExercise.classList.add('active');
                    renderExerciseList();
                    document.getElementById('input-search-exercise').focus();
                }
            };
        }

        const inputSearch = document.getElementById('input-search-exercise');
        if (inputSearch) {
            inputSearch.oninput = (e) => renderExerciseList(e.target.value);
        }

        // Global function to handle selection
        window.selectExerciseForLesson = async (exerciseId, exerciseTitle) => {
            if (!currentLessonIdForExercises) return;

            try {
                // Find lesson and update
                const lesson = lessonsData.find(l => l.id === currentLessonIdForExercises);
                if (lesson) {
                    // Update local mockup
                    if (!lesson.exercises) lesson.exercises = "";
                    lesson.exercises = lesson.exercises ? `${lesson.exercises}, ${exerciseTitle}` : exerciseTitle;

                    // Update Firestore (Simplified for now, just appending title)
                    await db.collection('lessons').doc(lesson.id).update({
                        exercises: lesson.exercises
                    });

                    Toast.show(`Exercício "${exerciseTitle}" adicionado à aula!`, 'success');
                    closeSelectExerciseModal();

                    // Refresh View
                    const studentId = lesson.studentId;
                    const listEl = document.getElementById(`student-lessons-list-${studentId}`);
                    if (listEl) listEl.innerHTML = renderStudentLessons(studentId);
                }
            } catch (error) {
                console.error("Error linking exercise:", error);
                Toast.show("Erro ao vincular exercício.", "error");
            }
        };
    }
};

export const TeacherExercises = {
    render: () => {
        return `
            <section id="teacher-exercises-view" class="view active teacher-dash">
                <div class="dashboard-layout">
                    ${getSidebar('exercises')}
                    <main class="main-content">
                        <div class="header-bar">
                            <h2>Catálogo de Exercícios</h2>
                        </div>
                        <div class="content-body">
                             <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));">
                                <!-- Card 1 -->
                                <div class="stat-card" style="border-left: 4px solid var(--primary-green);">
                                    <h3>Múltipla Escolha</h3>
                                    <p style="font-size: 0.9rem; color: #64748b; margin-top: 0.5rem;">
                                        Exercícios escritos nos quais o aluno deve escolher uma das opções corretas.
                                    </p>
                                </div>
                                <!-- Card 2 -->
                                <div class="stat-card" style="border-left: 4px solid var(--primary-blue);">
                                    <h3>Resposta Oral (Bot)</h3>
                                    <p style="font-size: 0.9rem; color: #64748b; margin-top: 0.5rem;">
                                        Aluno responde via áudio com feedback de um "bot" intuitivo sobre a melhor resposta.
                                    </p>
                                </div>
                                <!-- Card 3 -->
                                <div class="stat-card" style="border-left: 4px solid #f59e0b;">
                                    <h3>Descrição de Imagem</h3>
                                    <p style="font-size: 0.9rem; color: #64748b; margin-top: 0.5rem;">
                                        Descrever a situação exemplificada em uma imagem.
                                    </p>
                                </div>
                                <!-- Card 4 -->
                                <div class="stat-card" style="border-left: 4px solid #8b5cf6;">
                                    <h3>Diálogo Autêntico</h3>
                                    <p style="font-size: 0.9rem; color: #64748b; margin-top: 0.5rem;">
                                        Escolha de resposta plausível, formação de frase ou seleção de continuidade para um diálogo.
                                    </p>
                                </div>
                                <!-- Card 5 -->
                                <div class="stat-card" style="border-left: 4px solid #ec4899;">
                                    <h3>Correção de Erros</h3>
                                    <p style="font-size: 0.9rem; color: #64748b; margin-top: 0.5rem;">
                                        Identificar palavra errada e/ou reescrever a frase corretamente.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </section>
        `;
    },
    attachEvents: (navigate) => attachSidebarEvents(navigate)
};

export const TeacherFormation = {
    render: () => {
        return `
            <section id="teacher-formation-view" class="view active teacher-dash">
                <div class="dashboard-layout">
                    ${getSidebar('formation')}
                    <main class="main-content">
                        <div class="header-bar">
                            <h2>Plano de Ensino e Metodologia</h2>
                        </div>
                        <div class="content-body">
                            <div style="background: white; padding: 3rem; border-radius: 20px; max-width: 900px; margin: 0 auto;">
                                <h3 style="font-size: 1.5rem; margin-bottom: 1.5rem; color: var(--dark); border-bottom: 2px solid #f1f5f9; padding-bottom: 1rem;">
                                    Modelo de Abordagem
                                </h3>
                                <div style="display: grid; gap: 2rem;">
                                    <div>
                                        <h4 style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem; margin-bottom: 0.5rem; color: var(--primary-green);">
                                            <i data-lucide="book-a"></i> Abordagem Lexical
                                        </h4>
                                        <p style="color: #475569; line-height: 1.6;">
                                            Aprender o vocabulário com mais facilidade por meio de <strong>combinações de palavras</strong> (chunks), entendendo a gramática de forma intuitiva, sem focar excessivamente em regras isoladas.
                                        </p>
                                    </div>
                                    <div>
                                        <h4 style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem; margin-bottom: 0.5rem; color: var(--primary-blue);">
                                            <i data-lucide="headphones"></i> Abordagem Audiolingual
                                        </h4>
                                        <p style="color: #475569; line-height: 1.6;">
                                            Capacitar o aluno a se comunicar oralmente com proficiência semelhante a um nativo. Foco em:
                                            <ul style="margin-left: 1.5rem; margin-top: 0.5rem; color: #64748b;">
                                                <li>Exposição a diálogos baseados em situações reais.</li>
                                                <li>Práticas de estruturas e vocabulário.</li>
                                                <li>Exercícios de repetição e substituição (drills).</li>
                                            </ul>
                                        </p>
                                    </div>
                                    <div>
                                        <h4 style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem; margin-bottom: 0.5rem; color: #f59e0b;">
                                            <i data-lucide="message-circle"></i> Abordagem Comunicativa
                                        </h4>
                                        <p style="color: #475569; line-height: 1.6;">
                                            Desenvolve competências comunicativas — <strong>saber o que e como falar em cada situação</strong> — de forma autêntica e significativa. Atenção especial à pronúncia para permitir uma comunicação natural na comunidade global.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </section>
        `;
    },
    attachEvents: (navigate) => attachSidebarEvents(navigate)
};
