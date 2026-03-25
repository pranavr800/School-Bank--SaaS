// ─── APP STATE ──────────────────────────────────────────────────
// Single source of truth for all runtime data.
// All modules read and write this object directly.
// Never store passwords, raw PINs, or secrets here.
const STATE = {
  // Auth
  user:       null,   // firebase.User object
  teacher:    null,   // { id, name, email, role, teacherPinHash, status, ... }
  schoolCode: null,   // 6-char string e.g. "AB3X7K"
  schoolName: null,

  // Live Firestore data — kept in sync by onSnapshot listeners
  students:      [],
  transactions:  [],
  teachers:      [],
  fees:          [],
  announcements: [],
  schoolData:    {},  // top-level school document fields (inviteCode, lastRollover, etc.)

  // Listener cleanup — call each fn to unsubscribe
  listeners: [],

  // Misc
  isOnline:      navigator.onLine,
  _appLoaded:    false,  // true once loadMainApp() has run
  _authResolved: false,  // true once onAuthStateChanged has fired at least once
};

// ─── BALANCE CACHE ───────────────────────────────────────────────
// Avoids recomputing balance from transactions on every render call.
// Must be cleared whenever STATE.transactions or a student's
// openingBalance changes.
const _balanceCache = new Map(); // studentId → number

function invalidateBalanceCache() {
  _balanceCache.clear();
}