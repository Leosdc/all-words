import { db, auth } from '../config/firebase.js';
import { Toast } from '../ui/toast.js';
import { modal } from '../ui/modal.js';

export const BoardView = {
    render: (user, lessonId) => {
        return `
            <div id="board-container" class="board-layout">
                <header class="board-header">
                    <div class="board-info">
                        <h2 id="board-lesson-title">Quadro da Aula</h2>
                        <span id="board-lesson-date" style="font-size: 0.9rem; opacity: 0.8;"></span>
                    </div>
                    <div class="board-actions">
                        ${user.role === 'teacher' ? `
                            <button id="btn-finalize-board" class="btn-primary" style="background: #ef4444; border-color: #dc2626; padding: 0.5rem 1.25rem; font-size: 0.9rem; border-radius: 50px;">
                                Finalizar Aula
                            </button>
                        ` : ''}
                        <button id="btn-close-board" class="btn-secondary" style="background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 0.5rem 1.25rem; font-size: 0.9rem; border-radius: 50px;">Fechar Quadro</button>
                    </div>
                </header>
                
                <main class="board-main">
                    <div class="board-pane teacher-pane">
                        <div class="pane-header">
                            <i data-lucide="user-cog"></i> Professor
                        </div>
                        <textarea id="teacher-notes" 
                                  placeholder="Suas anotações aparecerão aqui..." 
                                  ${user.role !== 'teacher' ? 'readonly' : ''}
                                  class="pane-editor"></textarea>
                    </div>
                    
                    <div class="board-pane student-pane">
                        <div class="pane-header">
                            <i data-lucide="user"></i> Aluno
                        </div>
                        <textarea id="student-notes" 
                                  placeholder="Anotações do aluno aparecerão aqui..." 
                                  ${user.role === 'teacher' ? 'readonly' : ''}
                                  class="pane-editor"></textarea>
                    </div>
                </main>

                <style>
                    .board-layout {
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                        background: #0f172a;
                        color: white;
                        font-family: inherit;
                    }
                    .board-header {
                        padding: 1rem 2rem;
                        background: #1e293b;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 1px solid #334155;
                    }
                    .board-main {
                        flex: 1;
                        display: flex;
                        overflow: hidden;
                    }
                    .board-pane {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        border-right: 1px solid #334155;
                    }
                    .board-pane:last-child {
                        border-right: none;
                    }
                    .pane-header {
                        padding: 0.75rem 1.5rem;
                        background: #1e293b;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        color: #94a3b8;
                    }
                    .pane-editor {
                        flex: 1;
                        padding: 2rem;
                        background: transparent;
                        border: none;
                        color: white;
                        font-size: 1.1rem;
                        line-height: 1.6;
                        resize: none;
                        outline: none;
                    }
                    .pane-editor:focus {
                        background: rgba(255,255,255,0.02);
                    }
                    .pane-editor[readonly] {
                        cursor: default;
                        color: #94a3b8;
                    }
                </style>
            </div>
        `;
    },

    attachEvents: async (navigate, user, lessonId) => {
        if (!lessonId) return;
        if (window.lucide) lucide.createIcons();

        const teacherArea = document.getElementById('teacher-notes');
        const studentArea = document.getElementById('student-notes');
        const titleEl = document.getElementById('board-lesson-title');
        const dateEl = document.getElementById('board-lesson-date');
        const finalizeBtn = document.getElementById('btn-finalize-board');
        const closeBtn = document.getElementById('btn-close-board');

        let isUpdatingFromLocal = false;

        // 1. Listen for real-time changes
        const unsubscribe = db.collection('lessons').doc(lessonId).onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            
            titleEl.textContent = `Quadro: ${data.title}`;
            dateEl.textContent = `${data.date} - ${data.time}`;

            if (data.boardData) {
                if (user.role !== 'teacher') {
                    teacherArea.value = data.boardData.teacherNotes || '';
                }
                if (user.role === 'teacher' || user.role === 'admin') {
                    // Even if teacher, student might have typed
                    if (!isUpdatingFromLocal) {
                        studentArea.value = data.boardData.studentNotes || '';
                    }
                } else {
                    // If student, we only update teacher side from remote
                    // but we should still let them see their own local state?
                    // actually if student types, they update remote and that syncs back.
                }
                
                // If student, teacher side update
                if (user.role !== 'teacher' && !isUpdatingFromLocal) {
                     studentArea.value = data.boardData.studentNotes || '';
                }
            }

            if (data.boardData?.isClosed) {
                teacherArea.readOnly = true;
                studentArea.readOnly = true;
                if (finalizeBtn) finalizeBtn.style.display = 'none';
                
                // Show modal to student
                if (user.role === 'student' || user.role === 'aluno') {
                    // Check if modal is already open to avoid duplicates
                    if (!document.getElementById('modal-overlay')?.classList.contains('active')) {
                        modal.show({
                            title: 'Aula Finalizada',
                            message: 'O professor finalizou esta aula. Seus registros foram salvos!',
                            type: 'success',
                            onClose: () => {
                                window.close();
                                // Fallback if window.close() fails
                                setTimeout(() => { window.location.href = 'index.html'; }, 300);
                            }
                        });
                    }
                } else if (user.role === 'teacher') {
                     Toast.show('Aula finalizada e salva.', 'success');
                }
            }
        });

        // 2. Handle Typing (Debounced)
        const updateRemote = async () => {
             isUpdatingFromLocal = true;
             try {
                await db.collection('lessons').doc(lessonId).set({
                    boardData: {
                        teacherNotes: teacherArea.value,
                        studentNotes: studentArea.value,
                        lastUpdate: new Date().toISOString()
                    }
                }, { merge: true });
             } catch (e) {
                console.error("Error updating board:", e);
             }
             isUpdatingFromLocal = false;
        };

        let timeout = null;
        const debounceUpdate = () => {
            clearTimeout(timeout);
            timeout = setTimeout(updateRemote, 500);
        };

        if (user.role === 'teacher') {
            teacherArea.oninput = debounceUpdate;
        } else {
            studentArea.oninput = debounceUpdate;
        }

        // 3. Finalize Logic
        if (finalizeBtn) {
            finalizeBtn.onclick = async () => {
                if (confirm('Deseja finalizar a aula e marcar como concluída?')) {
                    try {
                        await db.collection('lessons').doc(lessonId).update({
                            'boardData.isClosed': true,
                            status: 'CONCLUÍDA'
                        });
                        Toast.show('Aula finalizada com sucesso!', 'success');
                        setTimeout(() => {
                            window.close();
                            // Fallback
                            setTimeout(() => { window.location.href = 'index.html'; }, 300);
                        }, 1500);
                    } catch (e) {
                         console.error("Error finalizing:", e);
                         Toast.show("Erro ao finalizar aula. Verifique suas permissões.", "error");
                    }
                }
            };
        }

        // 4. Manual Close with Fallback
        if (closeBtn) {
            closeBtn.onclick = () => {
                window.close();
                // Fallback for browsers that don't allow script-closed windows
                setTimeout(() => {
                    if (!window.closed) {
                        window.location.href = 'index.html';
                    }
                }, 300);
            };
        }

        // Cleanup on unmount (if app navigation happens, though this is designed for tabs)
        window.onbeforeunload = () => unsubscribe();
    }
};
