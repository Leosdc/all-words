import { db } from '../config/firebase.js';

export const MigrationService = {
    migrateUser: async (uid) => {
        try {
            // 0. Check for New Users (Created after 2026-01-01) - SKIP MIGRATION
            // This prevents permission errors for new users who don't have legacy collections
            const auth = firebase.auth();
            if (auth.currentUser) {
                const creationTime = new Date(auth.currentUser.metadata.creationTime).getTime();
                const cutOffDate = new Date('2026-01-01').getTime();

                if (creationTime > cutOffDate) {
                    // Try to set flag to avoid future checks, but ignore permission errors
                    try {
                        await db.collection('users').doc(uid).set({ migrationDone: 'v4' }, { merge: true });
                    } catch (e) {
                        // Permission might deny writing if not fully initialized, safe to ignore for now
                    }
                    return;
                }
            }

            // 1. Check if migration is already done (we can use a flag on the user document)
            const userRef = db.collection('users').doc(uid);
            const userDoc = await userRef.get();

            // SECURITY FIX: Only teachers/admins should run migration
            // Students running this will fail on permissions when accessing subcollections
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.role !== 'teacher' && userData.role !== 'admin') {
                    return; // Students don't have legacy subcollections to migrate
                }
            }

            if (!userDoc.exists || userDoc.data().migrationDone === 'v4') {
                return;
            }

            console.log("Starting migration v4 to Global Collections for:", uid);

            // 2. Migrate Students
            const studentsSnapshot = await userRef.collection('students').get();
            const migrationPromises = [];
            const studentsMap = {}; // Keep track of studentId -> userUid for lessons

            for (const doc of studentsSnapshot.docs) {
                const data = doc.data();
                const studentId = doc.id;
                const studentEmail = (data.email || "").toLowerCase().trim();

                // Set teacherUid explicitly
                const globalStudentData = {
                    ...data,
                    teacherUid: uid,
                    legacyId: studentId
                };

                // Move to root 'students'
                migrationPromises.push(db.collection('students').doc(studentId).set(globalStudentData));

                // IMPROVED: Check if student already has account OR create student_link
                if (studentEmail) {
                    const userQuery = await db.collection('users').where('email', '==', studentEmail).get();

                    if (!userQuery.empty) {
                        const existingUser = userQuery.docs[0];
                        studentsMap[studentId] = existingUser.id; // Map for lessons

                        // Link retroactively in the root 'students' collection
                        migrationPromises.push(db.collection('students').doc(studentId).update({
                            status: 'active',
                            userUid: existingUser.id
                        }));

                        // Update Student User profile
                        migrationPromises.push(db.collection('users').doc(existingUser.id).update({
                            linkedTeacher: uid,
                            studentIdInTeacherDoc: studentId
                        }));
                    } else if (data.status === 'waiting' || !data.status) {
                        // Create student_link for future self-healing
                        migrationPromises.push(db.collection('student_links').doc(studentEmail).set({
                            teacherUid: uid,
                            studentId: studentId,
                            name: data.name || 'Aluno',
                            status: 'waiting'
                        }, { merge: true }));
                    }
                }
            }

            // 3. Migrate Lessons
            const lessonsSnapshot = await userRef.collection('lessons').get();
            for (const doc of lessonsSnapshot.docs) {
                const data = doc.data();
                const lessonId = doc.id;
                const studentId = data.studentId;

                const globalLessonData = {
                    ...data,
                    teacherUid: uid,
                    userUid: studentsMap[studentId] || null // Link directly if we know the userUid
                };

                migrationPromises.push(db.collection('lessons').doc(lessonId).set(globalLessonData));
            }

            await Promise.all(migrationPromises);

            // 4. Mark as migrated
            await userRef.update({ migrationDone: 'v4' });
            console.log("Migration v4 completed successfully for:", uid);

        } catch (error) {
            // Silent fail for permissions to avoid spamming console for users who just need to skip this
            if (error.code === 'permission-denied') {
                console.warn("Migration skipped due to permissions (expected for non-legacy accounts).");
            } else {
                console.error("Migration failed:", error);
            }
        }
    }
};
