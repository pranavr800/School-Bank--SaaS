// ─── STUDENT PORTAL CONTROLLER ───────────────────────────────────
// Handles student login, PIN setup, session persistence,
// and the real-time listeners for the student-facing portal.
// Render functions (renderStudentHome etc.) live in views.js.

let _spStudent   = null;
let _spTxns      = [];
let _spListeners = [];

// ── Student login ─────────────────────────────────────────────────
async function studentLogin() {
  const schoolCode = document.getElementById('sl-school').value.trim().toUpperCase();
  const acc        = document.getElementById('sl-account').value.trim().toUpperCase();
  const pin        = document.getElementById('sl-pin').value.trim();
  const err        = document.getElementById('sl-error');
  err.textContent  = '';

  if (!schoolCode)             { err.textContent = 'Enter your School Code'; return; }
  if (schoolCode.length !== 6) { err.textContent = 'School Code must be 6 characters'; return; }
  if (!acc)                    { err.textContent = 'Enter your account number'; return; }

  const btn    = document.getElementById('sl-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="auth-spinner"></span>Checking…';

  try {
    await ensureAnonAuth();
    const snap = await db.collection('schools').doc(schoolCode)
      .collection('students').where('accountNumber', '==', acc).limit(1).get();

    if (snap.empty) {
      err.textContent = 'Account not found.';
      await clearAnonAuth();
      return;
    }

    const s = { id: snap.docs[0].id, ...snap.docs[0].data() };

    if (!s.studentPinHash) {
      // First login — no PIN set yet, show setup section
      document.getElementById('sl-setpin-section').style.display = 'block';
      document.getElementById('sl-pin-label').textContent        = 'No PIN set yet — set one below';
      document.getElementById('sl-pin').style.display            = 'none';
      document.getElementById('sl-pin').value                    = '';
      setTimeout(() => document.getElementById('sl-newpin').focus(), 100);
      return;
    }

    if (!pin) {
      err.textContent = 'Enter your 4-digit PIN';
      return;
    }

    const hash = await sha256(pin + acc);
    if (hash !== s.studentPinHash) {
      err.textContent = 'Incorrect PIN. Try again.';
      document.getElementById('sl-pin').value = '';
      document.getElementById('sl-pin').focus();
      return;
    }

    await loadStudentPortal(s, schoolCode);
  } catch (e) {
    err.textContent = 'Error: ' + e.message;
    await clearAnonAuth();
  } finally {
    btn.disabled  = false;
    btn.innerHTML = 'Login →';
  }
}

// ── Set PIN on first login ────────────────────────────────────────
async function studentSetPin() {
  const schoolCode = document.getElementById('sl-school').value.trim().toUpperCase();
  const acc        = document.getElementById('sl-account').value.trim().toUpperCase();
  const pin1       = document.getElementById('sl-newpin').value.trim();
  const pin2       = document.getElementById('sl-newpin2').value.trim();
  const err        = document.getElementById('sl-error');
  err.textContent  = '';

  if (!/^\d{4}$/.test(pin1)) { err.textContent = 'PIN must be exactly 4 digits'; return; }
  if (pin1 !== pin2)          { err.textContent = 'PINs do not match'; return; }

  const btn = document.querySelector('#sl-setpin-section .btn-auth-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spinner"></span>Setting PIN…'; }

  try {
    await ensureAnonAuth();
    const snap = await db.collection('schools').doc(schoolCode)
      .collection('students').where('accountNumber', '==', acc).limit(1).get();
    if (snap.empty) { err.textContent = 'Account not found'; return; }

    const s    = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const hash = await sha256(pin1 + acc);
    await snap.docs[0].ref.update({ studentPinHash: hash });
    s.studentPinHash = hash;

    showToast('PIN set! Logging in…', 'success');
    await loadStudentPortal(s, schoolCode);
  } catch (e) {
    err.textContent = 'Error: ' + e.message;
    if (btn) { btn.disabled = false; btn.innerHTML = '✅ Set PIN &amp; Login'; }
  }
}

// ── Load student portal ───────────────────────────────────────────
// Called after successful login or session restore (page refresh).
async function loadStudentPortal(student, schoolCode) {
  // Clean up any previous session's listeners
  _spListeners.forEach(u => { try { u(); } catch (e) {} });
  _spListeners = [];

  _spStudent = { ...student, _schoolCode: schoolCode };

  // Fetch school name once
  const schoolDoc         = await db.collection('schools').doc(schoolCode).get();
  _spStudent._schoolName  = schoolDoc.exists ? schoolDoc.data().name : '';

  // Persist session — page refresh restores the portal automatically via onAuthStateChanged
  try {
    sessionStorage.setItem(SP_SESSION_KEY, JSON.stringify({
      schoolCode,
      studentId: student.id,
    }));
  } catch (e) {}

  _dismissLoadingOverlay();
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('student-portal').classList.add('active');

  // Real-time: student's transactions
  const txnUnsub = db.collection('schools').doc(schoolCode)
    .collection('transactions')
    .where('studentId', '==', student.id)
    .onSnapshot(snap => {
      _spTxns = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => toMs(b) - toMs(a));
      // Re-render whichever tab is active
      const activeTab = document.querySelector('.sp-nav-btn.active')?.id?.replace('sp-nav-', '');
      if (activeTab === 'home')      renderStudentHome();
      else if (activeTab === 'passbook')  renderStudentPassbook();
      else if (activeTab === 'challenge') renderStudentChallenge();
    }, err => console.error('SP txn listener error:', err));

  // Real-time: student's own record (balance, goal, PIN, KYC)
  const studentUnsub = db.collection('schools').doc(schoolCode)
    .collection('students').doc(student.id)
    .onSnapshot(snap => {
      if (!snap.exists) return;
      _spStudent = {
        ..._spStudent,
        ...snap.data(),
        _schoolCode: schoolCode,
        _schoolName: _spStudent._schoolName,
      };
      const activeTab = document.querySelector('.sp-nav-btn.active')?.id?.replace('sp-nav-', '');
      if (activeTab === 'home') renderStudentHome();
    }, err => console.error('SP student listener error:', err));

  _spListeners.push(txnUnsub, studentUnsub);

  // Initial data load — may be instant if Firestore has a local cache
  const initSnap = await db.collection('schools').doc(schoolCode)
    .collection('transactions').where('studentId', '==', student.id).get();
  _spTxns = initSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMs(b) - toMs(a));

  spNav('home');
}

// ── Student logout ─────────────────────────────────────────────────
async function studentLogout() {
  try { sessionStorage.removeItem(SP_SESSION_KEY); } catch (e) {}

  _spListeners.forEach(u => { try { u(); } catch (e) {} });
  _spListeners = [];
  _spStudent   = null;
  _spTxns      = [];

  await clearAnonAuth();

  document.getElementById('student-portal').classList.remove('active');
  document.getElementById('auth-screen').style.display = 'flex';

  // Reset the login form to clean state
  ['sl-school', 'sl-account', 'sl-pin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('sl-pin').style.display          = 'block';
  document.getElementById('sl-setpin-section').style.display = 'none';
  document.getElementById('sl-pin-label').textContent       = '4-Digit PIN';
  document.getElementById('sl-error').textContent           = '';

  showAuthView('welcome');
}