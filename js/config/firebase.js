// ─── FIREBASE CONFIG ─────────────────────────────────────────────
// Your project credentials. These are safe to be in client-side code
// ONLY if Firestore Security Rules are deployed. Without rules, anyone
// who sees this file can read your entire database.
const firebaseConfig = {
  apiKey:            "AIzaSyBYqZM7i7khg3eYCn_O6bs_4XvT38boFyA",
  authDomain:        "noted-style-459801-n4.firebaseapp.com",
  projectId:         "noted-style-459801-n4",
  storageBucket:     "noted-style-459801-n4.firebasestorage.app",
  messagingSenderId: "96820525235",
  appId:             "1:96820525235:web:476e911667964e236f58c6"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// Enable offline persistence so the app works without internet.
// failed-precondition = multiple tabs open (only one tab can hold persistence).
// unimplemented       = browser doesn't support IndexedDB (Safari private mode).
// Both are harmless — just silently skip.
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
    console.warn('Firestore persistence error:', err);
  }
});

// ─── COLLECTION REFS ─────────────────────────────────────────────
// All Firestore paths go through these functions.
// They always read STATE.schoolCode at call time, so they're safe
// to define here even though STATE is populated later.

const schoolRef   = ()  => db.collection('schools').doc(STATE.schoolCode);
const studentsRef = ()  => schoolRef().collection('students');
const txnsRef     = ()  => schoolRef().collection('transactions');
const teachersRef = ()  => schoolRef().collection('teachers');
const feesRef     = ()  => schoolRef().collection('fees');
const auditRef    = ()  => schoolRef().collection('deletedAudit');
const userRef     = uid => db.collection('users').doc(uid);