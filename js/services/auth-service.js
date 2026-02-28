import { auth, db } from '../config/firebase.js';
import { modal } from '../ui/modal.js';
import { MigrationService } from './migration-service.js';

class AuthService {
    constructor() {
        this.currentUser = null;
        this.currentRole = null;
    }

    // Subscribe to auth changes
    init(onAuthChange) {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // Pre-fetch: Run migration for teachers/admins
                await MigrationService.migrateUser(user.uid);

                try {
                    // Fetch role from Firestore
                    let doc = await db.collection('users').doc(user.uid).get();

                    // Retry logic for new users (race condition fix)
                    if (!doc.exists) {
                        const creationTime = new Date(user.metadata.creationTime).getTime();
                        const now = new Date().getTime();
                        const isNewUser = (now - creationTime) < 10000; // Created in last 10s

                        if (isNewUser) {
                            console.log("New user detected, retrying role fetch...");
                            for (let i = 0; i < 3; i++) {
                                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
                                doc = await db.collection('users').doc(user.uid).get();
                                if (doc.exists) break;
                            }
                        }
                    }

                    if (doc.exists) {
                        const userData = doc.data();

                        // --- SELF-HEALING / STATUS FIX ---
                        // If student is waiting_approval OR missing linkedTeacher, try to heal
                        if (userData.role === 'student' && (userData.status === 'waiting_approval' || !userData.linkedTeacher)) {
                            try {
                                const email = user.email.toLowerCase().trim();

                                // 1. If we have the link fields, check for approval
                                if (userData.linkedTeacher && userData.studentIdInTeacherDoc) {
                                    const teacherStudentDoc = await db.collection('users')
                                        .doc(userData.linkedTeacher)
                                        .collection('students')
                                        .doc(userData.studentIdInTeacherDoc)
                                        .get();

                                    if (teacherStudentDoc.exists && teacherStudentDoc.data().status === 'active') {
                                        console.log("Student approved by teacher, updating local status...");
                                        const userUpdate = { status: 'active' };
                                        await db.collection('users').doc(user.uid).update(userUpdate);

                                        // Also update student_links mapping for consistency
                                        try {
                                            await db.collection('student_links').doc(email).update({
                                                status: 'linked',
                                                uid: user.uid
                                            });
                                        } catch (err) { console.warn("Could not update student_links during self-healing", err); }

                                        userData.status = 'active';
                                    }
                                }
                                // 2. If we ARE MISSING link fields, look in student_links
                                else {
                                    const linkDoc = await db.collection('student_links').doc(email).get();
                                    if (linkDoc.exists) {
                                        const linkData = linkDoc.data();
                                        console.log("Found missing link in student_links, applying...");

                                        const updateData = {
                                            linkedTeacher: linkData.teacherUid,
                                            studentIdInTeacherDoc: linkData.studentId
                                        };

                                        // Also check if they are already active in teacher's sub-collection
                                        const teacherStudentDoc = await db.collection('users')
                                            .doc(linkData.teacherUid)
                                            .collection('students')
                                            .doc(linkData.studentId)
                                            .get();

                                        if (teacherStudentDoc.exists && teacherStudentDoc.data().status === 'active') {
                                            updateData.status = 'active';
                                            userData.status = 'active';
                                        }

                                        await db.collection('users').doc(user.uid).update(updateData);
                                        userData.linkedTeacher = linkData.teacherUid;
                                        userData.studentIdInTeacherDoc = linkData.studentId;
                                    }
                                }
                            } catch (e) {
                                console.warn("Could not self-verify student status:", e);
                            }
                        }

                        // Check if student is approved
                        if (userData.role === 'student' && userData.status === 'waiting_approval') {
                            modal.show({
                                title: 'Aguardando Aprovação',
                                message: 'Sua conta foi criada com sucesso, mas seu professor ainda não aprovou seu vínculo. Tente novamente mais tarde.',
                                type: 'warning'
                            });
                            auth.signOut();
                            return;
                        }

                        if (userData.role === 'student' && userData.status === 'refused') {
                            modal.show({
                                title: 'Vínculo Recusado',
                                message: 'Seu vínculo foi recusado pelo professor ou a conta foi desativada. Entre em contato com o suporte.',
                                type: 'error'
                            });
                            auth.signOut();
                            return;
                        }

                        this.currentUser = user;
                        this.currentRole = userData.role || 'student';
                        onAuthChange(user, this.currentRole);

                        // Self-Healing: Check for pending links if student
                        if (this.currentRole === 'student') {
                            this.checkPendingLinks(user);
                        }
                    } else {
                        // Fallback implementation if doc is missing (rare)
                        console.warn("User role not found after retries, defaulting to student.");
                        this.currentUser = user;
                        this.currentRole = 'student';
                        onAuthChange(user, 'student');
                    }
                } catch (error) {
                    console.error("Error fetching user role:", error);
                    // Use standard modal for critical errors
                    modal.show({
                        title: 'Erro no Sistema',
                        message: 'Não foi possível carregar seus dados. Tente novamente.',
                        type: 'error'
                    });
                    auth.signOut();
                }
            } else {
                this.currentUser = null;
                this.currentRole = null;
                onAuthChange(null, null);
            }
        });
    }

    async login(email, password) {
        try {
            await auth.signInWithEmailAndPassword(email, password);
            // onAuthChange will trigger handling
        } catch (error) {
            let msg = 'Verifique suas credenciais.';
            if (error.code === 'auth/user-not-found') msg = 'Usuário não encontrado.';
            if (error.code === 'auth/wrong-password') msg = 'Senha incorreta.';
            if (error.code === 'auth/invalid-email') msg = 'E-mail inválido.';

            modal.show({
                title: 'Erro ao Entrar',
                message: msg,
                type: 'error'
            });
            throw error;
        }
    }

    async register(name, email, password, role, teacherUid = null) {
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            await user.updateProfile({ displayName: name });
            const userDoc = {
                name: name,
                email: email.toLowerCase().trim(),
                role: role,
                status: (role === 'student' && teacherUid) ? 'waiting_approval' : 'active',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                migrationDone: 'v4' // New users don't need migration
            };

            if (role === 'student' && teacherUid) {
                userDoc.linkedTeacher = teacherUid;
            }

            // Check if there is a pending student link for this email
            const searchEmail = email.toLowerCase().trim();
            let isLinked = false;

            if (role === 'student') {
                try {
                    // 1. Check if there's a pre-registered link from a teacher
                    const linkDoc = await db.collection('student_links').doc(searchEmail).get();

                    if (linkDoc.exists) {
                        const linkData = linkDoc.data();
                        const tUid = teacherUid || linkData.teacherUid;
                        const sId = linkData.studentId;

                        userDoc.linkedTeacher = tUid;
                        userDoc.studentIdInTeacherDoc = sId;

                        // Update Student record in Teacher's sub-collection
                        await db.collection('users').doc(tUid).collection('students').doc(sId).update({
                            status: 'active',
                            userUid: user.uid
                        });

                        // Update the link record
                        await db.collection('student_links').doc(searchEmail).update({
                            uid: user.uid,
                            status: 'linked'
                        });

                        isLinked = true;
                    }
                } catch (linkError) {
                    console.warn("Auto-linking via student_links failed", linkError);
                }

                // If not linked yet, create a new student record for the selected teacher (in sub-collection)
                if (!isLinked && teacherUid) {
                    const studentRef = await db.collection('users').doc(teacherUid).collection('students').add({
                        name: name,
                        email: email.toLowerCase().trim(),
                        status: 'waiting_approval',
                        teacherUid: teacherUid,
                        userUid: user.uid,
                        level: 'Starter',
                        age: '-',
                        reason: 'Registro via plataforma',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    userDoc.studentIdInTeacherDoc = studentRef.id;
                }
            }

            let teacherName = 'seu professor';
            if (teacherUid) {
                try {
                    const tDoc = await db.collection('users').doc(teacherUid).get();
                    if (tDoc.exists) teacherName = tDoc.data().name || tDoc.data().displayName || teacherName;
                } catch (e) { console.warn("Could not fetch teacher name for modal", e); }
            }

            await db.collection('users').doc(user.uid).set(userDoc);

            modal.show({
                title: 'Conta Criada',
                message: (role === 'student' && teacherUid)
                    ? `Seu cadastro foi realizado! Agora aguarde a aprovação do professor **${teacherName}**.`
                    : 'Conta criada com sucesso!',
                type: 'success'
            });

        } catch (error) {
            let msg = 'Não foi possível criar a conta.';
            if (error.code === 'auth/email-already-in-use') msg = 'Este e-mail já está em uso. Tente fazer login ou use outro.';
            if (error.code === 'auth/weak-password') msg = 'A senha é muito fraca (mínimo 6 caracteres).';

            modal.show({
                title: 'Erro no Cadastro',
                message: msg,
                type: 'error'
            });
            throw error;
        }
    }

    async updateProfile(uid, newData) {
        try {
            // 1. Update main user document
            await db.collection('users').doc(uid).update(newData);

            // 2. Update Firebase Auth displayName if name changed
            if (newData.name && auth.currentUser) {
                await auth.currentUser.updateProfile({ displayName: newData.name });
            }

            // 3. Propagate to Teacher's sub-collection if student
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.role === 'student' && userData.linkedTeacher && userData.studentIdInTeacherDoc) {
                    const studentUpdate = {};
                    if (newData.name) studentUpdate.name = newData.name;
                    if (newData.whatsapp) studentUpdate.whatsapp = newData.whatsapp;

                    if (Object.keys(studentUpdate).length > 0) {
                        await db.collection('users')
                            .doc(userData.linkedTeacher)
                            .collection('students')
                            .doc(userData.studentIdInTeacherDoc)
                            .update(studentUpdate);
                    }
                }
            }
        } catch (error) {
            console.error("Error updating profile:", error);
            throw error;
        }
    }

    // Self-Healing: Student checks if there is a pending link from a teacher
    async checkPendingLinks(user) {
        try {
            const email = user.email.toLowerCase().trim();
            const linkDoc = await db.collection('student_links').doc(email).get();

            if (linkDoc.exists) {
                const data = linkDoc.data();
                if (data.status === 'active' || data.status === 'waiting') {
                    // Update own profile to link to teacher
                    await db.collection('users').doc(user.uid).update({
                        linkedTeacher: data.teacherUid,
                        studentIdInTeacherDoc: data.studentId
                    });

                    // Update link status to 'linked'
                    await db.collection('student_links').doc(email).update({
                        uid: user.uid,
                        status: 'linked'
                    });

                    // ALSO: Link userUid in teacher sub-collection to ensure consistency
                    await db.collection('users').doc(data.teacherUid).collection('students').doc(data.studentId).update({
                        userUid: user.uid,
                        status: 'active'
                    });

                    console.log("Self-healing: Student linked to teacher successfully.");
                }
            }
        } catch (error) {
            console.error("Error checking pending links:", error);
        }
    }

    async changePassword(newPassword) {
        try {
            await auth.currentUser.updatePassword(newPassword);
        } catch (error) {
            console.error("Error changing password:", error);
            throw error;
        }
    }

    logout() {
        auth.signOut();
    }
}

export const authService = new AuthService();
