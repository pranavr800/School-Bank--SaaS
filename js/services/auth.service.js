// ─── AUTH SERVICE ─────────────────────────────────────────────────
// All Firebase Auth operations live here.
// UI controllers call these functions — nothing in this file
// touches the DOM directly.

let _regInProgress  = false;
let _joinInProgress = false;

// ── SHA-256 hash (async, requires HTTPS or localhost) ─────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Teacher login ─────────────────────────────────────────────────
async function loginTeacher() {
  clearAuthError('login');
  const email = document.getElementById('login-email').value.trim();
  const pwd   = document.getElementById('login-pwd').value;
  if (!email) { showAuthError('login', 'Please enter your email address'); return; }
  if (!pwd)   { showAuthError('login', 'Please enter your password'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError('login', 'Please enter a valid email address'); return;
  }
  setAuthLoading('login', true);
  try {
    await auth.signInWithEmailAndPassword(email, pwd);
    // Success — onAuthStateChanged takes it from here.
    // Reset button immediately so it never gets stuck.
    setAuthLoading('login', false);
  } catch (err) {
    setAuthLoading('login', false);
    showAuthError('login', getAuthError(err.code));
  }
}

// ── Create school (first-time registration) ───────────────────────
async function createSchool() {
  clearAuthError('create');
  const schoolName  = document.getElementById('create-school-name').value.trim();
  const teacherName = document.getElementById('create-teacher-name').value.trim();
  const email       = document.getElementById('create-email').value.trim();
  const pwd         = document.getElementById('create-pwd').value;
  const confirmPwd  = document.getElementById('create-confirm-pwd').value;

  if (!schoolName)  { showAuthError('create', 'School name is required'); return; }
  if (!teacherName) { showAuthError('create', 'Your name is required'); return; }
  if (!email)       { showAuthError('create', 'Email address is required'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError('create', 'Please enter a valid email address'); return;
  }
  if (!pwd)          { showAuthError('create', 'Password is required'); return; }
  if (pwd.length < 6){ showAuthError('create', 'Password must be at least 6 characters'); return; }
  if (pwd !== confirmPwd) { showAuthError('create', 'Passwords do not match'); return; }

  _regInProgress = true;
  setAuthLoading('create', true);
  let cred = null;
  try {
    if (auth.currentUser) await auth.signOut();
    const schoolCode  = genCode(6);
    const inviteCode  = genCode(8);
    cred = await auth.createUserWithEmailAndPassword(email, pwd);
    const uid = cred.user.uid;

    const batch = db.batch();
    batch.set(db.collection('schools').doc(schoolCode), {
      name: schoolName, code: schoolCode, inviteCode,
      managerUid: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(db.collection('schools').doc(schoolCode).collection('teachers').doc(uid), {
      name: teacherName, email, role: 'manager',
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(db.collection('users').doc(uid), {
      schoolCode, schoolName, name: teacherName, email, role: 'manager'
    });
    await batch.commit();

    STATE.user       = cred.user;
    STATE.schoolCode = schoolCode;
    STATE.schoolName = schoolName;
    STATE.teacher    = { id: uid, name: teacherName, email, role: 'manager' };
    _regInProgress   = false;
    setAuthLoading('create', false);
    loadMainApp();
  } catch (err) {
    _regInProgress = false;
    // Roll back — delete the Firebase Auth account if Firestore write failed
    if (cred) {
      try { await cred.user.delete(); } catch (e) {}
      try { await auth.signOut(); } catch (e) {}
    }
    setAuthLoading('create', false);
    showAuthError('create', getAuthError(err.code) || err.message || 'Registration failed. Please try again.');
  }
}

// ── Join existing school ──────────────────────────────────────────
async function joinSchool() {
  if (_joinInProgress) { showAuthError('join', 'Please wait, already processing...'); return; }
  clearAuthError('join');

  const schoolCode  = document.getElementById('join-school-code').value.trim().toUpperCase();
  const inviteCode  = document.getElementById('join-invite-code').value.trim().toUpperCase();
  const teacherName = document.getElementById('join-teacher-name').value.trim();
  const email       = document.getElementById('join-email').value.trim().toLowerCase();
  const pwd         = document.getElementById('join-pwd').value;
  const confirmPwd  = document.getElementById('join-confirm-pwd').value;

  if (!schoolCode)        { showAuthError('join', 'School Code is required'); return; }
  if (schoolCode.length !== 6) { showAuthError('join', 'School Code must be exactly 6 characters'); return; }
  if (!inviteCode)        { showAuthError('join', 'Invite Code is required'); return; }
  if (!teacherName)       { showAuthError('join', 'Your name is required'); return; }
  if (!email)             { showAuthError('join', 'Email address is required'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError('join', 'Please enter a valid email address'); return;
  }
  if (!pwd)          { showAuthError('join', 'Password is required'); return; }
  if (pwd.length < 6){ showAuthError('join', 'Password must be at least 6 characters'); return; }
  if (pwd !== confirmPwd) { showAuthError('join', 'Passwords do not match'); return; }

  _joinInProgress = true;
  _regInProgress  = true;
  setAuthLoading('join', true);
  let cred = null;
  try {
    if (auth.currentUser) await auth.signOut();

    // STEP 1: Verify school exists + invite code matches BEFORE creating auth account
    const schoolDoc = await db.collection('schools').doc(schoolCode).get();
    if (!schoolDoc.exists) {
      showAuthError('join', 'School not found. Please check the School Code.');
      _joinInProgress = false; setAuthLoading('join', false); return;
    }
    const school      = schoolDoc.data();
    const storedCode  = (school.inviteCode || '').toString().trim().toUpperCase();
    if (!storedCode) {
      showAuthError('join', 'This school has no invite code set yet. Ask your manager to generate one.');
      _joinInProgress = false; setAuthLoading('join', false); return;
    }
    if (storedCode !== inviteCode) {
      showAuthError('join', 'Invite code is incorrect. Please check with your manager.');
      _joinInProgress = false; setAuthLoading('join', false); return;
    }
    const schoolName = school.name;

    // STEP 2: Block duplicate registrations for this school
    const existingSnap = await db.collection('schools').doc(schoolCode)
      .collection('teachers').where('email', '==', email).limit(1).get();
    if (!existingSnap.empty) {
      const ex = existingSnap.docs[0].data();
      showAuthError('join', ex.status === 'removed'
        ? 'This email was removed from this school. Contact your manager.'
        : 'This email is already a teacher in this school. Please login instead.');
      _joinInProgress = false; setAuthLoading('join', false); return;
    }

    // STEP 3: All checks passed — create the Firebase Auth account
    cred = await auth.createUserWithEmailAndPassword(email, pwd);
    const uid = cred.user.uid;

    // STEP 4: Clean up any orphan teacher docs + write the real ones
    const orphanSnap = await db.collection('schools').doc(schoolCode)
      .collection('teachers').where('email', '==', email).get();
    const batch = db.batch();
    orphanSnap.docs.forEach(d => { if (d.id !== uid) batch.delete(d.ref); });
    batch.set(db.collection('schools').doc(schoolCode).collection('teachers').doc(uid), {
      name: teacherName, email, role: 'teacher',
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(db.collection('users').doc(uid), {
      schoolCode, schoolName, name: teacherName, email, role: 'teacher'
    });
    await batch.commit();

    STATE.user       = cred.user;
    STATE.schoolCode = schoolCode;
    STATE.schoolName = schoolName;
    STATE.teacher    = { id: uid, name: teacherName, email, role: 'teacher' };
    _joinInProgress  = false;
    _regInProgress   = false;
    setAuthLoading('join', false);
    loadMainApp();
  } catch (err) {
    _joinInProgress = false;
    _regInProgress  = false;
    if (cred) {
      try { await cred.user.delete(); } catch (e) {}
      try { await auth.signOut(); } catch (e) {}
    }
    setAuthLoading('join', false);
    const authErr   = getAuthError(err.code);
    const isGeneric = authErr === 'Something went wrong. Please try again.';
    showAuthError('join', isGeneric
      ? (err.message || 'Join failed. Please check your details and try again.')
      : authErr);
  }
}

// ── Forgot password ───────────────────────────────────────────────
async function forgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showAuthError('login', 'Enter your email address first'); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('Password reset email sent!', 'success');
  } catch (err) {
    showAuthError('login', getAuthError(err.code));
  }
}

// ── Teacher logout ────────────────────────────────────────────────
async function logoutTeacher() {
  clearTimeout(pinIdleTimer);
  STATE._appLoaded  = false;
  _regInProgress    = false;
  _joinInProgress   = false;
  cleanupListeners();
  stopScanner();
  await auth.signOut();
}

// ── Anonymous auth (student portal) ──────────────────────────────
// Students sign in anonymously so Firestore Security Rules can
// identify them and scope their reads to their own records only.
let _anonCred = null;

async function ensureAnonAuth() {
  if (auth.currentUser && auth.currentUser.isAnonymous) return; // already anon
  if (auth.currentUser && !auth.currentUser.isAnonymous) return; // teacher session
  if (!_anonCred) {
    _anonCred = await auth.signInAnonymously();
  }
}

async function clearAnonAuth() {
  if (_anonCred && auth.currentUser && auth.currentUser.isAnonymous) {
    try { await auth.currentUser.delete(); } catch (e) {}
    _anonCred = null;
  }
}