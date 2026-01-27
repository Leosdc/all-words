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
                    const doc = await db.collection('users').doc(user.uid).get();
                    if (doc.exists) {
                        const userData = doc.data();
                        this.currentUser = user;
                        this.currentRole = userData.role || 'student';
                        onAuthChange(user, this.currentRole);
                    } else {
                        // Fallback implementation if doc is missing (rare)
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

    async register(name, email, password, role) {
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            await user.updateProfile({ displayName: name });
            const userDoc = {
                name: name,
                email: email.toLowerCase().trim(),
                role: role,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Check if there is a pending student link for this email
            const searchEmail = email.toLowerCase().trim();
            if (role === 'student') {
                // Find student record in global collection by email
                const studentQuery = await db.collection('students').where('email', '==', searchEmail).get();

                if (!studentQuery.empty) {
                    const studentDoc = studentQuery.docs[0];
                    const studentData = studentDoc.data();

                    userDoc.linkedTeacher = studentData.teacherUid;
                    userDoc.studentIdInTeacherDoc = studentDoc.id;

                    // Update Global Student record to ACTIVE and link UID
                    await db.collection('students').doc(studentDoc.id)
                        .update({
                            status: 'active',
                            userUid: user.uid
                        });
                }
            }

            await db.collection('users').doc(user.uid).set(userDoc);

            // Success msg handled by UI or auto-redirect
        } catch (error) {
            let msg = 'Não foi possível criar a conta.';
            if (error.code === 'auth/email-already-in-use') msg = 'Este e-mail já está em uso.';
            if (error.code === 'auth/weak-password') msg = 'A senha é muito fraca.';

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
            await db.collection('users').doc(uid).update(newData);
            // If name changed, update firebase auth display name too
            if (newData.name) {
                await auth.currentUser.updateProfile({ displayName: newData.name });
            }
        } catch (error) {
            console.error("Error updating profile:", error);
            throw error;
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
