// firebase-config.js – Firebase initialization (CDN / compat mode)
// ────────────────────────────────────────────────────────────────
// Replace the placeholder values below with your actual Firebase
// project credentials from https://console.firebase.google.com
// → Project Settings → General → Your apps → Web app.
// ────────────────────────────────────────────────────────────────

const firebaseConfig = {
    apiKey:            "AIzaSyBR4Vi0-4MnRmrVfkjyFO_TIC7oVwEmwe0",
    authDomain:        "bit-builder-4c59c.firebaseapp.com",
    databaseURL:       "https://bit-builder-4c59c-default-rtdb.firebaseio.com",
    projectId:         "bit-builder-4c59c",
    storageBucket:     "bit-builder-4c59c.firebasestorage.app",
    messagingSenderId: "981445293965",
    appId:             "1:981445293965:web:9b95346ee6dbc45b65afc4"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// ─── Service references ─────────────────────────────────────────
// These are available globally for auth.js and app.js to use.

const fbAuth = firebase.auth();         // Firebase Authentication
const fbDB   = firebase.firestore();    // Cloud Firestore
const fbStorage = firebase.storage();   // Cloud Storage (for audio, photos)

// ─── Helper: check if Firebase is configured ────────────────────
function isFirebaseConfigured() {
    return firebaseConfig.apiKey !== "YOUR_API_KEY";
}

// ─── Auth state listener ────────────────────────────────────────
// Fires whenever the user signs in or out.
fbAuth.onAuthStateChanged(user => {
    if (user) {
        console.log('[Firebase] Signed in as', user.email || user.uid);
    } else {
        console.log('[Firebase] Signed out');
    }
});

console.log('[Firebase] Initialized –', isFirebaseConfigured() ? 'configured' : '⚠️  using placeholder keys (update firebase-config.js)');
