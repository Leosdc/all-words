// Firebase Config
// Initialize only if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp({
        apiKey: "AIzaSyDQxlSro88qyPSoyLRKXeksCYOvFS7h5Wc",
        authDomain: "all-words-project.firebaseapp.com",
        projectId: "all-words-project",
        storageBucket: "all-words-project.firebasestorage.app", // Fixed usage of storageBucket from original
        messagingSenderId: "636008299458",
        appId: "1:636008299458:web:745b902e503b265a67f45b",
        measurementId: "G-VBKCKCKDTD"
    });
}

export const auth = firebase.auth();
export const db = firebase.firestore();
