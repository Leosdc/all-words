import { authService } from '../services/auth-service.js';
import { db, auth } from '../config/firebase.js';
import { DatePicker } from '../ui/date-picker.js';
import { TimePicker } from '../ui/time-picker.js';
import { modal } from '../ui/modal.js';
import { Toast } from '../ui/toast.js';
import { ProfileModal } from './profile-view.js';
import { Sidebar } from '../ui/sidebar.js';

// Sidebars are now managed via Sidebar.render()

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
        const snapshot = await db.collection('users').doc(uid).collection('students').get();
        const students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let foundCount = 0;
        const syncPromises = [];

        for (const student of students) {
            if (student.status === 'active' && student.userUid) continue; // Already linked

            const email = (student.email || "").toLowerCase().trim();
            if (!email) continue;

            // SECURITY FIX: checking 'student_links' instead of 'users' collection
            const linkDocRef = db.collection('student_links').doc(email);
            const linkSnapshot = await linkDocRef.get();

            if (linkSnapshot.exists && linkSnapshot.data().uid) {
                // CASE A: Student has accepted link and provided their UID
                const linkData = linkSnapshot.data();
                const userUid = linkData.uid;
                foundCount++;

                // 1. Update Student record in Sub-collection
                syncPromises.push(db.collection('users').doc(uid).collection('students').doc(student.id).update({
                    status: 'active',
                    userUid: userUid
                }));

                // 2. Update ALL existing lessons for this student
                const studentLessons = await db.collection('lessons').where('studentId', '==', student.id).get();
                studentLessons.forEach(lDoc => {
                    syncPromises.push(db.collection('lessons').doc(lDoc.id).update({ userUid: userUid }));
                });

                // 3. Mark link as fully active/confirmed (optional cleanup)
                syncPromises.push(linkDocRef.update({ status: 'linked', studentId: student.id }));

            } else {
                // CASE B: Link missing or Student hasn't logged in yet
                // Create/Refresh the invitation
                syncPromises.push(linkDocRef.set({
                    teacherUid: uid,
                    studentId: student.id,
                    status: 'waiting',
                    name: student.name
                }, { merge: true }));
            }
        }

        if (syncPromises.length > 0) {
            await Promise.all(syncPromises);
            if (foundCount > 0) {
                Toast.show(`${foundCount} aluno(s) vinculado(s) com sucesso!`, 'success');
            } else {
                Toast.show("Solicitações de vínculo enviadas. Aguarde o login dos alunos.", 'info', 4000);
            }
            fetchStudents(); // Refresh the list
        } else {
            Toast.show("Todos os alunos já estão sincronizados ou convidados.", 'success');
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

const attachSidebarEvents = (navigate, role) => {
    Sidebar.attachEvents(navigate, role);
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

    // Update Title if needed (it might be set in the shell render)
    const titleEl = listContainer.querySelector('.header-bar h2');
    if (titleEl) titleEl.textContent = 'Meus Alunos';

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
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Aluno</th>
                            <th>Email</th>
                            <th>Nível / Idade</th>
                            <th>Status</th>
                            <th>Objetivo</th>
                            <th style="text-align: right;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${studentsData.map(student => `
                            <tr onclick="window.openStudentDetail('${student.id}')" style="cursor: pointer;">
                                <td>
                                    <div class="table-user-info">
                                        <div class="table-avatar">
                                            ${student.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div style="font-weight: 500;">${student.name}</div>
                                    </div>
                                </td>
                                <td style="color: #64748b;">${student.email || '-'}</td>
                                <td>${student.level} • ${student.age} anos</td>
                                <td id="status-cell-${student.id}">
                                    <span class="student-status-badge ${student.status === 'active' ? 'status-active' :
                (student.status === 'waiting' || student.status === 'waiting_approval' ? 'status-waiting' : 'status-cancelled')
            }">
                                        ${student.status === 'active' ? 'Efetivado' :
                (student.status === 'waiting_approval' ? 'Pendente' :
                    (student.status === 'waiting' ? 'Aguardando' : 'Cancelado'))}
                                    </span>
                                </td>
                                <td style="color: #64748b; font-size: 0.9rem;">
                                    <i data-lucide="target" style="width: 14px; vertical-align: middle; margin-right: 4px;"></i>${student.reason}
                                </td>
                                <td style="text-align: right;">
                                    ${student.status === 'waiting' || student.status === 'waiting_approval' ? `
                                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                            <button class="btn-icon" title="Efetivar Aluno" style="color: #10b981; border-color: #d1fae5;" onclick="event.stopPropagation(); window.approveStudent('${student.id}', '${student.userUid}')">
                                                <i data-lucide="user-check"></i>
                                            </button>
                                            <button class="btn-icon" title="Apagar Registro" style="color: #ef4444; border-color: #fee2e2;" onclick="event.stopPropagation(); window.deleteStudent('${student.id}', '${student.userUid}', '${student.email}')">
                                                <i data-lucide="trash-2"></i>
                                            </button>
                                        </div>
                                    ` : `
                                        <button class="btn-icon" style="display: inline-flex;">
                                            <i data-lucide="chevron-right"></i>
                                        </button>
                                    `}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    if (window.lucide) lucide.createIcons();
};

window.approveStudent = async (studentId, userUid) => {
    const confirmed = await modal.confirm({
        title: 'Aprovar Vínculo',
        message: 'Deseja aprovar o vínculo deste aluno? Ele terá acesso imediato à plataforma.',
        confirmText: 'Aprovar',
        type: 'success'
    });

    if (!confirmed) return;

    const uid = getUserId();
    try {
        const batch = db.batch();
        const studentRef = db.collection('users').doc(uid).collection('students').doc(studentId);
        batch.update(studentRef, { status: 'active' });

        // SECURITY NOTE: We don't update db.collection('users').doc(userUid) here to avoid permission errors.
        // The student handles their own status update upon next login via self-healing.
        // We also don't update student_links here as teachers lack permission; student handles it later.

        await batch.commit();
        modal.show({ title: 'Sucesso', message: 'Aluno aprovado com sucesso!', type: 'success' });
        fetchStudents();
    } catch (error) {
        console.error("Erro ao aprovar aluno:", error);
        modal.show({ title: 'Erro', message: 'Erro ao aprovar vínculo.', type: 'error' });
    }
};

window.deleteStudent = async (studentId, userUid, email) => {
    const isWaiting = true; // Based on when this button is shown
    const msg = 'Deseja apagar este registro? O convite pendente será removido.';

    if (!confirm(msg)) return;

    const uid = getUserId();
    try {
        const batch = db.batch();
        const studentRef = db.collection('users').doc(uid).collection('students').doc(studentId);

        // 1. Delete from Teacher's sub-collection
        batch.delete(studentRef);

        // 2. Delete/Update student_links
        if (email && email !== 'undefined' && email !== '-') {
            batch.delete(db.collection('student_links').doc(email.toLowerCase().trim()));
        }

        // 3. If there's an actual user ID, we DON'T delete the global user, just the link.
        // The user stays as a role 'student' but with no teacher link.

        await batch.commit();
        modal.show({ title: 'Removido', message: 'Registro apagado com sucesso.', type: 'info' });
        fetchStudents();
    } catch (error) {
        console.error("Erro ao apagar aluno:", error);
        modal.show({ title: 'Erro', message: 'Erro ao apagar registro.', type: 'error' });
    }
};

window.rejectStudent = async (studentId, userUid) => {
    if (!confirm('Deseja recusar este aluno? O acesso dele será bloqueado.')) return;
    const uid = getUserId();
    try {
        const batch = db.batch();
        const studentRef = db.collection('users').doc(uid).collection('students').doc(studentId);
        batch.update(studentRef, { status: 'refused' });
        if (userUid && userUid !== 'undefined') {
            batch.update(db.collection('users').doc(userUid), { status: 'refused' });

            const userDoc = await db.collection('users').doc(userUid).get();
            if (userDoc.exists && userDoc.data().email) {
                batch.update(db.collection('student_links').doc(userDoc.data().email.toLowerCase().trim()), { status: 'refused' });
            }
        }
        await batch.commit();
        modal.show({ title: 'Recusado', message: 'Vínculo recusado.', type: 'info' });
        fetchStudents(); // Correct call
    } catch (error) {
        console.error("Erro ao recusar aluno:", error);
        modal.show({ title: 'Erro', message: 'Erro ao processar recusa.', type: 'error' });
    }
};

// Fetch Students from Firestore
const fetchStudents = async () => {
    const uid = getUserId();
    if (!uid) return;

    try {
        const snapshot = await db.collection('users').doc(uid).collection('students').get();
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
        const batch = db.batch();

        // 1. Save in Teacher's 'students' sub-collection
        const studentData = { ...student, teacherUid: uid };
        const studentRef = db.collection('users').doc(uid).collection('students').doc(student.id);
        batch.set(studentRef, studentData, { merge: true });

        // 2. Sync with global user doc and student_links
        if (studentEmail) {
            // Check link source
            const linkDoc = await db.collection('student_links').doc(studentEmail).get();
            const linkData = linkDoc.exists ? linkDoc.data() : null;
            const userUid = student.userUid || (linkData ? linkData.uid : null);

            if (userUid) {
                // SECURITY FIX: Removed batch.update(db.collection('users').doc(userUid), { status: ... })
                // Students handle their own user status updates.

                // Update link record (Ignore error if no permission)
                try {
                    batch.update(db.collection('student_links').doc(studentEmail), {
                        status: student.status === 'active' ? 'linked' : 'refused',
                        teacherUid: uid,
                        studentId: student.id
                    });
                } catch (e) { console.warn("Link update skipped", e); }
            } else {
                // Not registered yet, update invitation link
                batch.set(db.collection('student_links').doc(studentEmail), {
                    teacherUid: uid,
                    studentId: student.id,
                    name: student.name,
                    status: (student.status === 'active' || student.status === 'waiting' || student.status === 'waiting_approval') ? 'waiting' : 'refused'
                }, { merge: true });
            }
        }

        await batch.commit();
    } catch (error) {
        console.error("Error saving student:", error);
    }
};

// Update Student in Firestore
const updateStudentInFirestore = async (student) => {
    const uid = getUserId();
    if (!uid) return;
    try {
        await db.collection('users').doc(uid).collection('students').doc(student.id).update(student);
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

        // Overlap Check (60 minutes)
        const snapshot = await db.collection('lessons')
            .where('teacherUid', '==', uid)
            .where('date', '==', lesson.date)
            .get();

        const isOverlapping = (t1, t2) => {
            if (!t1 || !t2) return false;
            const [h1, m1] = t1.split(':').map(Number);
            const [h2, m2] = t2.split(':').map(Number);
            const mins1 = h1 * 60 + m1;
            const mins2 = h2 * 60 + m2;
            return Math.abs(mins1 - mins2) < 60;
        };

        const conflict = snapshot.docs.find(doc => doc.id !== lesson.id && isOverlapping(doc.data().time, lesson.time));
        if (conflict) {
            throw new Error(`Conflito com outra aula neste horário (${conflict.data().time}).`);
        }

        const lessonData = {
            ...lesson,
            teacherUid: uid || null,
            userUid: (student && typeof student.userUid === 'string' && student.userUid !== 'undefined') ? student.userUid : null
        };

        // Aggressive cleanup: remove any undefined fields before sending to Firestore
        Object.keys(lessonData).forEach(key => {
            if (lessonData[key] === undefined) {
                console.warn(`Removing undefined field: ${key}`);
                lessonData[key] = null;
            }
        });
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

// Delete Lesson from Firestore
async function deleteLessonFromFirestore(studentId, lessonId) {
    try {
        await db.collection('lessons').doc(lessonId).delete();
        lessonsData = lessonsData.filter(l => l.id !== lessonId);
        Toast.show("Aula removida.", "success");
    } catch (error) {
        console.error("Error deleting lesson:", error);
        Toast.show("Erro ao excluir aula.", "error");
    }
}

// Quick Toggle Lesson Status
window.toggleLessonStatus = async (studentId, lessonId) => {
    try {
        const lesson = lessonsData.find(l => l.id === lessonId);
        if (!lesson) return;

        const isPast = new Date(lesson.date + 'T' + (lesson.time || '00:00')) < new Date();
        const currentStatus = lesson.status || (isPast ? 'CONCLUÍDA' : 'AGENDADA');
        const nextStatus = currentStatus === 'CONCLUÍDA' ? 'AGENDADA' : 'CONCLUÍDA';

        await db.collection('lessons').doc(lessonId).update({ status: nextStatus });
        lesson.status = nextStatus;

        Toast.show(`Aula marcada como ${nextStatus.toLowerCase()}.`, "success");
        const listEl = document.getElementById(`student-lessons-list-${studentId}`);
        if (listEl) listEl.innerHTML = renderStudentLessons(studentId);
    } catch (error) {
        console.error("Error toggling lesson status:", error);
        Toast.show("Erro ao atualizar status.", "error");
    }
};

// Quick Delete Lesson
window.deleteLessonQuick = async (studentId, lessonId) => {
    const confirmed = await modal.confirm({
        title: 'Excluir Aula',
        message: 'Tem certeza que deseja excluir esta aula permanentemente?',
        type: 'error',
        confirmText: 'Excluir',
        cancelText: 'Manter'
    });

    if (confirmed) {
        await deleteLessonFromFirestore(studentId, lessonId);
        const listEl = document.getElementById(`student-lessons-list-${studentId}`);
        if (listEl) listEl.innerHTML = renderStudentLessons(studentId);
    }
};

// Toggle Content Item
window.toggleContentItem = async (studentId, lessonId, itemIndex) => {
    try {
        const lesson = lessonsData.find(l => l.id === lessonId);
        if (!lesson || !lesson.content) return;

        const item = lesson.content[itemIndex];
        if (typeof item === 'string') {
            lesson.content[itemIndex] = { text: item, completed: true };
        } else {
            item.completed = !item.completed;
        }

        await db.collection('lessons').doc(lessonId).update({ content: lesson.content });
        const listEl = document.getElementById(`student-lessons-list-${studentId}`);
        if (listEl) listEl.innerHTML = renderStudentLessons(studentId);
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        console.error("Error toggling content item:", error);
    }
};

export const TeacherStudents = {
    render: (user) => {
        const role = user.role || 'teacher';
        return `
            <section id="teacher-students-view" class="view active teacher-dash">
                <style>
                    /* Hide number input arrows */
                    input[type=number]::-webkit-inner-spin-button, 
                    input[type=number]::-webkit-outer-spin-button { 
                        -webkit-appearance: none; 
                        margin: 0; 
                    }
                    input[type=number] {
                        -moz-appearance: textfield;
                    }
                    
                    .btn-pill {
                        border-radius: 50px !important;
                        padding: 0.6rem 1.5rem !important;
                        font-weight: 600 !important;
                        display: flex !important;
                        align-items: center !important;
                        gap: 8px !important;
                        transition: all 0.2s !important;
                    }
                    .btn-pill:hover {
                        transform: translateY(-1px) !important;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
                    }
                </style>
                <div class="dashboard-layout">
                    ${Sidebar.render(user, 'students')}
                    <main class="main-content">
                        <!-- LIST VIEW -->
                        <div id="student-list-container">
                            <div class="header-bar">
                                <h2>Meus Alunos</h2>
                                <div style="display: flex; gap: 10px;">
                                    <button id="btn-sync-students" class="btn-secondary" onclick="window.syncStudentsWithUsers(event)" style="width: auto; padding: 0.5rem 1rem; margin: 0; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 8px; background: white; color: var(--dark); border-color: #e2e8f0;">
                                        <i data-lucide="refresh-cw" style="width: 18px; height: 18px;"></i> Sincronizar Vínculos
                                    </button>
                                </div>
                            </div>
                            <div class="content-body">
                                <!-- Initial empty state or loading, actual list rendered by renderStudentGrid() -->
                                <div style="text-align: center; padding: 3rem; color: #64748b;">
                                    <i class="lucide-spinner" style="width: 32px; height: 32px; animation: spin 1s linear infinite; opacity: 0.5;"></i>
                                    <p style="margin-top: 1rem;">Carregando alunos...</p>
                                </div>
                            </div>
                        </div>

                        <!-- DETAIL VIEW (Hidden by default) -->
                        <div id="student-detail-container" style="display: none;">
                            <!-- Content injected via JS -->
                        </div>

                        <!-- MODALS moved inside main-content for smart navigation support -->

                        <!-- ADD LESSON MODAL -->
                        <div id="add-lesson-modal" class="modal-overlay">
                            <div class="modal-content" style="text-align: left;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                                    <h2>Nova Aula</h2>
                                    <button id="btn-close-lesson-modal" onclick="window.closeLessonModal()" style="background: none; border: none; cursor: pointer;">
                                        <i data-lucide="x" style="width: 24px; height: 24px;"></i>
                                    </button>
                                </div>
                                <form id="form-add-lesson">
                                    <input type="hidden" name="l_student_id" id="input-lesson-student-id">
                                    <input type="hidden" name="l_id" id="input-lesson-id">
                                    <div class="form-group">
                                        <label>Título da Aula</label>
                                        <input type="text" name="l_title" id="input-l-title" class="form-input" required placeholder="Ex: Aula 01 - Verb To Be">
                                    </div>
                                    <div class="form-group">
                                        <label>Tema Central</label>
                                        <input type="text" name="l_theme" id="input-l-theme" class="form-input" required placeholder="Ex: Gramática Básica">
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
                                        <button type="button" id="btn-cancel-lesson" onclick="window.closeLessonModal()" style="flex: 1; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer; font-weight: 500; font-size: 1rem; transition: background 0.2s;">Cancelar</button>
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

                        <!-- EDIT STUDENT MODAL -->
                        <div id="student-modal" class="modal-overlay">
                            <div class="modal-content" style="text-align: left;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                                    <h2 id="student-modal-title">Editar Aluno</h2>
                                    <button onclick="document.getElementById('student-modal').classList.remove('active')" style="background: none; border: none; cursor: pointer;">
                                        <i data-lucide="x" style="width: 24px; height: 24px;"></i>
                                    </button>
                                </div>
                                <form id="form-edit-student">
                                    <input type="hidden" id="edit-student-id">
                                    <div class="form-group">
                                        <label>Nome Completo</label>
                                        <input type="text" id="edit-student-name" name="full-name" class="form-input" required>
                                    </div>
                                    <div class="form-group">
                                        <label>E-mail</label>
                                        <input type="email" id="edit-student-email" name="email" class="form-input" required readonly style="background: #f1f5f9; cursor: not-allowed;">
                                    </div>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                                        <div class="form-group">
                                            <label>Idade</label>
                                            <input type="number" id="edit-student-age" name="age" class="form-input">
                                        </div>
                                        <div class="form-group">
                                            <label>Nível</label>
                                            <div style="position: relative;">
                                                <select id="edit-student-level" name="level" class="form-input" style="appearance: none; -webkit-appearance: none; padding-right: 2.5rem;">
                                                    <option value="A1">A1 - Iniciante</option>
                                                    <option value="A2">A2 - Básico</option>
                                                    <option value="B1">B1 - Intermediário</option>
                                                    <option value="B2">B2 - Intermediário Superior</option>
                                                    <option value="C1">C1 - Avançado</option>
                                                    <option value="C2">C2 - Proficiente (Nativo)</option>
                                                </select>
                                                <i data-lucide="chevron-down" style="position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); pointer-events: none; width: 16px; height: 16px; color: #64748b;"></i>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Status do Aluno</label>
                                        <div style="position: relative;">
                                            <select id="edit-student-status" name="status" class="form-input" style="appearance: none; -webkit-appearance: none; padding-right: 2.5rem;">
                                                <option value="active">Efetivado (Ativo)</option>
                                                <option value="waiting_approval">Pendente (Aguardando Aprovação)</option>
                                                <option value="waiting">Aguardando (Novo)</option>
                                                <option value="cancelled">Cancelado / Inativo</option>
                                            </select>
                                            <i data-lucide="chevron-down" style="position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); pointer-events: none; width: 16px; height: 16px; color: #64748b;"></i>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Objetivo/Motivação</label>
                                        <textarea id="edit-student-reason" name="reason" class="form-input" style="height: 100px; padding: 0.8rem;"></textarea>
                                    </div>
                                    <div style="margin-top: 2rem; display: flex; gap: 1rem;">
                                        <button type="button" onclick="document.getElementById('student-modal').classList.remove('active')" class="btn-secondary" style="flex: 1;">Cancelar</button>
                                        <button type="submit" class="btn-primary" style="flex: 2;">Salvar Alterações</button>
                                    </div>
                                </form>
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

    attachEvents: (navigate, user) => {
        // --- 1. EXPOSE GLOBAL FUNCTIONS FIRST (to prevent "is not a function" errors) ---
        window.closeStudentDetail = () => {
            const list = document.getElementById('student-list-container');
            const detail = document.getElementById('student-detail-container');
            if (list) list.style.display = 'block';
            if (detail) detail.style.display = 'none';
        };

        window.closeLessonModal = () => {
            const m = document.getElementById('add-lesson-modal');
            if (m) m.classList.remove('active');
        };

        // --- 2. REST OF EVENTS ---
        if (user && user.role) attachSidebarEvents(navigate, user.role);
        else attachSidebarEvents(navigate);

        if (studentsData.length === 0) fetchStudents();
        else renderStudentGrid();

        if (lessonsData.length === 0) fetchLessons();

        // --- Detail View Logic ---
        window.openStudentDetail = async (id) => {
            const student = studentsData.find(s => s.id === id);
            if (!student) return;

            const listContainer = document.getElementById('student-list-container');
            const detailContainer = document.getElementById('student-detail-container');

            if (listContainer) listContainer.style.display = 'none';
            if (detailContainer) {
                detailContainer.style.display = 'block';

                // Force Refresh Lessons to ensure we have any student-created reinforcement classes
                await fetchLessons();
                detailContainer.innerHTML = `
                    <div class="header-bar" style="margin-left: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <button class="btn-secondary btn-pill" onclick="window.closeStudentDetail()" style="color: var(--dark); border: 1px solid #e2e8f0; background: white;">
                                <i data-lucide="arrow-left" style="width: 18px;"></i> Voltar
                            </button>
                            <button class="btn-secondary btn-pill" onclick="window.openEditStudentModal('${student.id}')" style="color: #0284c7; border: 1px solid #bae6fd; background: #f0f9ff;">
                                <i data-lucide="edit-3" style="width: 18px;"></i> Editar Dados
                            </button>
                        </div>
                        <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                            <h2 style="margin: 0;">${student.name}</h2>
                            <span class="student-status-badge ${student.status === 'active' ? 'status-active' : (student.status === 'waiting' || student.status === 'waiting_approval' ? 'status-waiting' : 'status-cancelled')}">
                                ${student.status === 'active' ? 'Efetivado' : (student.status === 'waiting_approval' ? 'Pendente' : (student.status === 'waiting' ? 'Aguardando' : 'Cancelado'))}
                            </span>
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
            }
        };

        // Helper to render skill block
        function renderSkillBlock(student, skillKey, label) {
            const skills = student.skills || {};
            const skill = skills[skillKey] || { rating: 0, notes: '' };
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
                    const value = parseInt(e.target.dataset.value);

                    // Update Local Data
                    if (!student.skills) student.skills = {};
                    if (!student.skills[skillKey]) student.skills[skillKey] = { rating: 0, notes: '' };

                    student.skills[skillKey].rating = value;
                    updateStudentInFirestore(student);

                    // Re-render detail view to show valid stars
                    window.openStudentDetail(student.id);
                };
            });
        }

        // Helper to update notes
        window.updateSkillNote = (id, skillKey, value) => {
            const s = studentsData.find(st => st.id === id);
            if (s) {
                if (!s.skills) s.skills = {};
                if (!s.skills[skillKey]) s.skills[skillKey] = { rating: 0, notes: '' };
                s.skills[skillKey].notes = value;
                updateStudentInFirestore(s);
            }
        };

        // --- Student Edit Logic ---
        window.openEditStudentModal = (id) => {
            const student = studentsData.find(s => s.id === id);
            if (!student) return;

            const modalEl = document.getElementById('student-modal');
            if (!modalEl) return;

            document.getElementById('edit-student-id').value = id;
            document.getElementById('edit-student-name').value = student.name || '';
            document.getElementById('edit-student-email').value = student.email || '';
            document.getElementById('edit-student-age').value = student.age || '';
            document.getElementById('edit-student-level').value = student.level || 'A1';
            document.getElementById('edit-student-status').value = student.status || 'waiting';
            document.getElementById('edit-student-reason').value = student.reason || '';

            modalEl.classList.add('active');
            if (window.lucide) lucide.createIcons();
        };

        const formEdit = document.getElementById('form-edit-student');
        if (formEdit) {
            formEdit.onsubmit = async (e) => {
                e.preventDefault();
                const id = document.getElementById('edit-student-id').value;
                const student = studentsData.find(s => s.id === id);
                if (!student) return;

                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalBtnText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="lucide-spinner" style="animation: spin 1s linear infinite;"></i> Salvando...';

                try {
                    const updatedData = {
                        name: document.getElementById('edit-student-name').value,
                        age: document.getElementById('edit-student-age').value,
                        level: document.getElementById('edit-student-level').value,
                        status: document.getElementById('edit-student-status').value,
                        reason: document.getElementById('edit-student-reason').value
                    };

                    Object.assign(student, updatedData);
                    await updateStudentInFirestore(student);

                    Toast.show("Cadastro atualizado com sucesso!", "success");
                    document.getElementById('student-modal').classList.remove('active');

                    // Re-render detail view and grid
                    window.openStudentDetail(id);
                    renderStudentGrid();
                } catch (error) {
                    console.error("Error updating student:", error);
                    Toast.show("Erro ao atualizar cadastro.", "error");
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
            };
        }
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
                <div style="display: grid; gap: 1.5rem; margin-top: 1rem;">
                    ${lessons.map(lesson => {
        const isPast = new Date(lesson.date + 'T' + (lesson.time || '00:00')) < new Date();
        const status = lesson.status || (isPast ? 'CONCLUÍDA' : 'AGENDADA');
        const isFinished = status === 'CONCLUÍDA';

        return `
                        <div style="border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background: white; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                            <div onclick="window.openAddLessonModal('${studentId}', '${lesson.id}')" 
                                 style="padding: 1.25rem; background: ${isFinished ? '#f8fafc' : 'white'}; cursor: pointer; border-bottom: 1px solid #f1f5f9;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; align-items: start;">
                                    <div>
                                        <h4 style="margin: 0; color: var(--dark); font-weight: 700; font-size: 1.1rem;">${lesson.title}</h4>
                                        <div style="font-size: 0.85rem; color: #64748b; margin-top: 0.25rem;">
                                            <strong>Tema:</strong> ${lesson.theme}
                                        </div>
                                    </div>
                                    <div style="display: flex; flex-direction: column; align-items: end; gap: 6px;">
                                        <span style="font-size: 0.75rem; font-weight: 700; background: ${isFinished ? '#f1f5f9' : '#e0f2fe'}; color: ${isFinished ? '#64748b' : '#0284c7'}; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">
                                            ${status}
                                        </span>
                                        <span style="font-size: 0.8rem; color: #94a3b8; font-weight: 500;">
                                            ${new Date(lesson.date).toLocaleDateString("pt-BR")} - ${lesson.time}
                                        </span>
                                    </div>
                                </div>

                                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    <button onclick="event.stopPropagation(); window.openExerciseSelection('${lesson.id}')" 
                                            style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 0.4rem 0.8rem; border-radius: 10px; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                        <i data-lucide="dumbbell" style="width: 14px;"></i> Exercícios
                                    </button>
                                    ${lesson.exercises ? `
                                        <div style="font-size: 0.8rem; color: #0284c7; background: #f0f9ff; padding: 4px 10px; border-radius: 10px; border: 1px solid #bae6fd; display: flex; align-items: center; gap: 4px;">
                                            <i data-lucide="info" style="width: 12px;"></i> ${lesson.exercises}
                                        </div>
                                    ` : ''}
                                </div>
                            </div>

                            <div style="padding: 1.25rem; background: #fdfdfd;">
                                ${(lesson.content && lesson.content.length > 0) ? `
                                    <div style="background: white; padding: 1rem; border-radius: 12px; border: 1px solid #f1f5f9;">
                                        <h5 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; color: var(--primary-blue); font-weight: 600; text-transform: uppercase; letter-spacing: 0.025em;">Conteúdo Programado:</h5>
                                        <div style="display: grid; gap: 8px;">
                                            ${lesson.content.map((item, idx) => {
            const text = typeof item === 'string' ? item : item.text;
            const completed = typeof item === 'string' ? false : item.completed;
            return `
                                                    <div onclick="window.toggleContentItem('${studentId}', '${lesson.id}', ${idx})"
                                                         style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: ${completed ? '#f8fafc' : '#ffffff'}; border: 1px solid ${completed ? '#f1f5f9' : '#f8fafc'}; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                                                        <i data-lucide="${completed ? 'check-circle-2' : 'circle'}" 
                                                           style="width: 16px; height: 16px; flex-shrink: 0; color: ${completed ? '#10b981' : '#cbd5e1'};"></i>
                                                        <span style="font-size: 0.9rem; color: ${completed ? '#94a3b8' : '#334155'}; ${completed ? 'text-decoration: line-through;' : ''}">${text}</span>
                                                    </div>
                                                `;
        }).join('')}
                                        </div>
                                    </div>
                                ` : ''}

                                <div style="display: flex; gap: 12px; margin-top: 1.25rem;">
                                    <button onclick="window.toggleLessonStatus('${studentId}', '${lesson.id}')" 
                                            class="${isFinished ? 'btn-secondary' : 'btn-primary'}"
                                            style="flex: 1; padding: 0.6rem; font-size: 0.85rem; border-radius: 10px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                        <i data-lucide="${isFinished ? 'rotate-ccw' : 'check'}"></i> 
                                        ${isFinished ? 'Marcar como Pendente' : 'Concluir Aula'}
                                    </button>
                                    <button onclick="window.deleteLessonQuick('${studentId}', '${lesson.id}')"
                                            style="background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; padding: 0.6rem 1rem; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px;"
                                            title="Excluir Aula">
                                        <i data-lucide="trash-2" style="width: 18px;"></i>
                                        <span>Excluir</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
    }).join('')}
                </div>
            `;
}

// Toggle Lesson Status (Global/Detail)
window.toggleLessonStatus = async (studentId, lessonId) => {
    try {
        const lesson = lessonsData.find(l => l.id === lessonId);
        if (!lesson) return;

        const isPast = new Date(lesson.date + 'T' + (lesson.time || '00:00')) < new Date();
        const currentStatus = lesson.status || (isPast ? 'CONCLUÍDA' : 'AGENDADA');
        const newStatus = (currentStatus === 'CONCLUÍDA') ? 'AGENDADA' : 'CONCLUÍDA';

        // Update local data
        lesson.status = newStatus;

        // Update Firestore
        await db.collection('lessons').doc(lessonId).update({
            status: newStatus
        });

        Toast.show(`Aula marcada como ${newStatus.toLowerCase()}!`, 'success');

        // Re-render relevant view
        const listEl = document.getElementById(`student-lessons-list-${studentId}`);
        if (listEl) {
            listEl.innerHTML = renderStudentLessons(studentId);
            if (window.lucide) lucide.createIcons({ root: listEl });
        }

        // Also check if we are in the global lessons view and refresh if so
        const globalContainer = document.getElementById('lessons-list-container');
        if (globalContainer) {
            // Force a reload of the global lessons list
            const btnAdd = document.getElementById('btn-add-lesson-global');
            if (btnAdd) {
                // We are in TeacherLessons view, we should probably just re-run loadLessons but it's internal.
                // For simplicity, we can navigate back to refresh the component or just update the DOM if we had the logic here.
                // Let's just update the local card if it exists in the global list.
                const cards = globalContainer.querySelectorAll('.lesson-card');
                cards.forEach(card => {
                    // This is a bit hacky but works without refactoring the whole view
                    if (card.innerHTML.includes(lesson.title) && card.innerHTML.includes(lesson.date)) {
                        const badgeContainer = card.querySelector('div > div');
                        if (badgeContainer) {
                            badgeContainer.innerHTML = `
                                ${newStatus === 'CONCLUÍDA' ?
                                    '<span style="background: #f1f5f9; color: #64748b; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">CONCLUÍDA</span>' :
                                    '<span style="background: #e0f2fe; color: #0284c7; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">AGENDADA</span>'}
                                ${lesson.type === 'reinforcement' ?
                                    '<span style="background: #fef9c3; color: #a16207; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; border: 1px solid #fef08a;">REFORÇO</span>' : ''}
                                <span style="background: #f0fdf4; color: #15803d; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">
                                    <i data-lucide="user" style="width: 10px; margin-right: 4px;"></i> ${lesson.studentName || 'Aluno'}
                                </span>
                            `;
                            if (window.lucide) lucide.createIcons({ root: badgeContainer });
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error("Error toggling lesson status:", error);
        Toast.show("Erro ao atualizar status da aula.", "error");
    }
};

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
    if (window.lucide) lucide.createIcons();

    // Re-attach Form Submission Every Time to ensure it's fresh and prevents default
    form.onsubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner-small"></div> Salvando...';

        try {
            const formData = new FormData(form);
            const studentIdField = formData.get('l_student_id');
            const student = studentsData.find(s => s.id === studentIdField);
            const lessonIdField = formData.get('l_id');

            const contentList = [];
            document.querySelectorAll('#lesson-content-list .content-item').forEach(item => {
                contentList.push({
                    text: item.querySelector('span').textContent,
                    completed: item.querySelector('input[type="checkbox"]').checked
                });
            });

            const lessonPayload = {
                studentId: studentIdField,
                studentName: student ? student.name : 'Unknown',
                title: formData.get('l_title'),
                theme: formData.get('l_theme'),
                date: formData.get('l_date'),
                time: formData.get('l_time'),
                content: contentList
            };
            if (lessonIdField) lessonPayload.id = lessonIdField;
            else lessonPayload.createdAt = new Date().toISOString();

            await addLessonToFirestore(lessonPayload);
            window.closeLessonModal();
            form.reset();
            const listEl = document.getElementById(`student-lessons-list-${studentIdField}`);
            if (listEl) listEl.innerHTML = renderStudentLessons(studentIdField);
            Toast.show('Aula salva com sucesso!', 'success');
        } catch (err) {
            console.error("Error saving lesson:", err);
            Toast.show('Erro ao salvar aula.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    };

    const titleEl = document.querySelector('#add-lesson-modal h2');
    const submitBtn = document.querySelector('#add-lesson-modal button[type="submit"]');
    const deleteBtn = document.getElementById('btn-delete-lesson');
    // Helper to add item to DOM
    window.addItemToLessonDom = (text, completed = false) => {
        const container = document.getElementById('lesson-content-list');
        if (!container) return;
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
                        window.addItemToLessonDom(item);
                    } else {
                        window.addItemToLessonDom(item.text, item.completed);
                    }
                });
            } else if (lesson.exercises) {
                window.addItemToLessonDom(lesson.exercises);
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
                        window.closeLessonModal();
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
                window.addItemToLessonDom(text);
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

export const TeacherExercises = {
    render: (user) => {
        return `
            <section id="teacher-exercises-view" class="view active teacher-dash">
                <div class="dashboard-layout">
                    ${Sidebar.render(user, 'exercises')}
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
    attachEvents: (navigate, user) => attachSidebarEvents(navigate, user.role)
};

export const TeacherFormation = {
    render: (user) => {
        return `
            <section id="teacher-formation-view" class="view active teacher-dash">
                <div class="dashboard-layout">
                    ${Sidebar.render(user, 'formation')}
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
    attachEvents: (navigate, user) => attachSidebarEvents(navigate, user.role)
};

export const TeacherLessons = {
    render: (user) => {
        return `
            <section id="teacher-lessons-view" class="view active teacher-dash">
                <div class="dashboard-layout">
                    ${Sidebar.render(user, 'lessons')}
                    <main class="main-content">
                        <div class="header-bar">
                            <h2>Minha Agenda</h2>
                            <button class="btn-primary" id="btn-add-lesson-global"><i data-lucide="plus"></i> Nova Aula</button>
                        </div>
                        <div class="content-body" id="lessons-list-container">
                            <div style="text-align: center; padding: 4rem;">
                                <div class="spinner"></div>
                                <p style="margin-top: 1rem; color: #64748b;">Carregando cronograma...</p>
                            </div>
                        </div>
                    </main>
                </div>
            </section>
        `;
    },
    attachEvents: (navigate, user) => {
        attachSidebarEvents(navigate, user.role);

        const btnAdd = document.getElementById('btn-add-lesson-global');
        if (btnAdd) {
            btnAdd.onclick = () => {
                Toast.show('Vá para "Meus Alunos" e selecione um aluno para agendar uma aula.', 'info', 4000);
            };
        }

        // Load Lessons
        const loadLessons = async () => {
            const uid = getUserId();
            const container = document.getElementById('lessons-list-container');
            if (!uid || !container) return;

            try {
                // Get all lessons for this teacher
                const snapshot = await db.collection('lessons')
                    .where('teacherUid', '==', uid)
                    .orderBy('date', 'desc')
                    .get();

                const lessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (lessons.length === 0) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 4rem; background: white; border-radius: 16px;">
                            <i data-lucide="calendar" style="width: 48px; height: 48px; color: #cbd5e1; margin-bottom: 1rem;"></i>
                            <h3>Nenhuma aula agendada</h3>
                            <p style="color: #64748b;">Suas aulas agendadas aparecerão aqui.</p>
                        </div>
                    `;
                    if (window.lucide) lucide.createIcons();
                    return;
                }

                // Get Student Names map for better display
                const studentIds = [...new Set(lessons.map(l => l.studentId))];
                const studentMap = {};

                // Fetch student names (optimized in chunks if needed, but simple loop fine for now)
                for (const sid of studentIds) {
                    try {
                        const sDoc = await db.collection('users').doc(uid).collection('students').doc(sid).get();
                        if (sDoc.exists) studentMap[sid] = sDoc.data().name;
                    } catch (e) { }
                }

                container.innerHTML = `
                    <div style="display: grid; gap: 1rem;">
                        ${lessons.map(lesson => {
                    const isPast = new Date(lesson.date + 'T' + (lesson.time || '00:00')) < new Date();
                    const studentName = lesson.studentName || studentMap[lesson.studentId] || 'Aluno Desconhecido';
                    const isReinforcement = lesson.type === 'reinforcement';

                    return `
                                <div onclick="window.openAddLessonModal('${lesson.studentId}', '${lesson.id}')" 
                                     style="background: white; padding: 1.5rem; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); cursor: pointer;">
                                    <div>
                                        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap;">
                                            ${lesson.status === 'CONCLUÍDA' || (isPast && lesson.status !== 'AGENDADA') ?
                            '<span style="background: #f1f5f9; color: #64748b; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">CONCLUÍDA</span>' :
                            '<span style="background: #e0f2fe; color: #0284c7; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">AGENDADA</span>'}
                                            ${isReinforcement ?
                            '<span style="background: #fef9c3; color: #a16207; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; border: 1px solid #fef08a;">REFORÇO</span>' : ''}
                                            <span style="background: #f0fdf4; color: #15803d; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">
                                                <i data-lucide="user" style="width: 10px; margin-right: 4px;"></i> ${studentName}
                                            </span>
                                        </div>
                                        <h4 style="margin-bottom: 0.5rem; font-size: 1.1rem; color: #1e293b;">${lesson.title}</h4>
                                        <div style="font-size: 0.9rem; color: #64748b; display: flex; gap: 16px; align-items: center;">
                                            <span style="display: flex; align-items: center; gap: 6px;"><i data-lucide="calendar" style="width: 14px;"></i> ${lesson.date}</span>
                                            <span style="display: flex; align-items: center; gap: 6px;"><i data-lucide="clock" style="width: 14px;"></i> ${lesson.time}</span>
                                        </div>
                                    </div>
                                    <i data-lucide="edit-3" style="color: #cbd5e1; width: 20px;"></i>
                                </div>
                        `;
                }).join('')}
                    </div>
                `;
                if (window.lucide) lucide.createIcons();

            } catch (error) {
                console.error(error);
                container.innerHTML = `<p style="color: red;">Erro ao carregar aulas: ${error.message}</p>`;
            }
        };

        loadLessons();
    }
};
