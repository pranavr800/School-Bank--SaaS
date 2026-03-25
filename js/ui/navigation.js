// ─── NAVIGATION ───────────────────────────────────────────────────
// Routing, view history, Firestore real-time listeners, onAuthStateChanged,
// and loadMainApp. Everything that ties the app together lives here.

// ── State ─────────────────────────────────────────────────────────
let currentView      = 'dashboard';
let currentStudentId = null;
let viewHistory      = [];
let _navGoingBack    = false;
let _classDashClass  = null;   // remembered so listener re-renders can call renderClassDashboard
let _refreshTimer    = null;

const MAX_HISTORY = 20;
const SP_SESSION_KEY = 'sbm_student_session';

const _mainTabs = ['dashboard','students','scanner','daily','teachers','import','export','settings'];

const _backLabels = {
  'add-student':      'Students',
  'student-detail':   'Students',
  'id-card':          'Student',
  'report':           'Dashboard',
  'class-dashboard':  'Students',
  'archives':         'Settings',
  'archive-detail':   'Archives',
  'collection-sheet': 'Daily Log',
  'fee-management':   'Dashboard',
  'class-report':     'Dashboard',
  'announcements':    'Dashboard',
  'import':           'Dashboard',
  'export':           'Dashboard',
};

const _viewTitles = {
  dashboard:          'Student <span>Bank</span>',
  students:           'Students',
  scanner:            'Scanner',
  'add-student':      'New Student',
  'student-detail':   'Account Detail',
  daily:              'Daily Log',
  import:             'Import Data',
  export:             'Export Data',
  report:             'Reports',
  teachers:           'Teachers',
  settings:           'Settings',
  'class-dashboard':  'Class Dashboard',
  archives:           'Archives',
  'archive-detail':   'Year Archive',
  'collection-sheet': 'Collection Sheet',
  'id-card':          '🪪 ID Card',
  'class-report':     '📊 Class Report',
  announcements:      '📣 Announcements',
  'fee-management':   '📚 Fee Manager',
};

// ── Back button ───────────────────────────────────────────────────
function _updateBackButton(view) {
  const isSubView  = !_mainTabs.includes(view);
  const topbarBack = document.getElementById('topbar-back');
  if (topbarBack) topbarBack.classList.toggle('visible', isSubView);

  const floatBtn = document.getElementById('float-back-btn');
  const floatLbl = document.getElementById('float-back-label');
  if (!floatBtn) return;

  if (isSubView) {
    const prevView   = viewHistory[viewHistory.length - 1] || 'dashboard';
    const explicit   = _backLabels[view];
    const fromTitle  = _viewTitles[prevView] || '';
    const cleanTitle = fromTitle.replace(/<[^>]+>/g, '');
    if (floatLbl) floatLbl.textContent = explicit || cleanTitle || 'Back';
    floatBtn.classList.add('visible');
  } else {
    floatBtn.classList.remove('visible');
  }
}

function _pushBrowserState(view) {
  if (window.history && window.history.pushState) {
    window.history.pushState({ view }, '', '#' + view);
  }
}

// ── Main navigate function ────────────────────────────────────────
function navigateTo(view, studentId = null, push = true) {
  if (push && currentView !== view) {
    viewHistory.push(currentView);
    if (viewHistory.length > MAX_HISTORY) viewHistory = viewHistory.slice(-MAX_HISTORY);
  }

  // Stop scanner when leaving scanner view
  if (currentView === 'scanner' && view !== 'scanner') stopScanner();

  const prevView    = currentView;
  const goingBack   = _navGoingBack;
  _navGoingBack     = false;

  // Slide direction
  const isSubView  = !_mainTabs.includes(view);
  const wasSubView = !_mainTabs.includes(prevView);
  let animClass    = 'fade-in';
  if      (isSubView  && !wasSubView) animClass = 'slide-in-right';
  else if (!isSubView &&  wasSubView) animClass = 'slide-in-left';
  else if (goingBack)                 animClass = 'slide-in-left';
  else if (isSubView  &&  wasSubView) animClass = 'slide-in-right';

  // Swap active view
  document.querySelectorAll('.view')
    .forEach(v => v.classList.remove('active', 'slide-in-right', 'slide-in-left', 'fade-in'));
  const nextEl = document.getElementById('view-' + view);
  if (!nextEl) return;
  nextEl.classList.add('active');
  requestAnimationFrame(() => nextEl.classList.add(animClass));

  // Bottom nav highlight
  document.querySelectorAll('.nav-item').forEach(n => {
    const wasActive = n.classList.contains('active');
    const nowActive = n.dataset.view === view;
    n.classList.toggle('active', nowActive);
    if (nowActive && !wasActive) {
      const svg = n.querySelector('svg');
      if (svg) { svg.style.animation = 'none'; requestAnimationFrame(() => { svg.style.animation = ''; }); }
    }
  });

  // Title
  const rawTitle = (_viewTitles[view] || 'Student Bank').replace(/<[^>]+>/g, '');
  document.title = rawTitle + ' — Student Bank';
  document.getElementById('topbar-title').innerHTML = _viewTitles[view] || 'Student <span>Bank</span>';

  currentView = view;
  if (studentId) currentStudentId = studentId;

  _updateBackButton(view);
  if (push) _pushBrowserState(view);
  document.getElementById('view-' + view).scrollTop = 0;

  // Trigger the correct render function
  if (view === 'dashboard')        renderDashboard();
  if (view === 'students')         { renderSkeletonList('student-list', 6); setTimeout(() => renderStudentList(), 80); }
  if (view === 'student-detail')   renderStudentDetail();
  if (view === 'daily')            { setTodayDate(); renderDailyLog(); }
  if (view === 'scanner')          { const sr = document.getElementById('scanner-search'); const res = document.getElementById('scanner-results'); if (sr) sr.value = ''; if (res) res.innerHTML = ''; startScanner(); }
  if (view === 'report')           renderReport();
  if (view === 'teachers')         renderTeachers();
  if (view === 'settings')         renderSettings();
  if (view === 'archives')         renderArchiveList();
  if (view === 'collection-sheet') renderCollectionClassGrid();
  if (view === 'id-card')          renderIDCard();
  if (view === 'class-report')     renderClassReport();
  if (view === 'announcements')    renderAnnouncementsView();
  if (view === 'fee-management')   setTimeout(renderFeeManagement, 80);
}

function goBack() {
  _navGoingBack = true;
  const prev = viewHistory.pop() || 'dashboard';
  navigateTo(prev, null, false);
}

// Hardware back button / browser back
window.addEventListener('popstate', e => {
  if (viewHistory.length > 0) goBack();
  else navigateTo('dashboard', null, false);
});

// ── Re-render dispatcher ──────────────────────────────────────────
// Called by every Firestore snapshot. Re-renders only the active view.
function _refreshCurrentView() {
  const v = currentView;
  if (v === 'dashboard')        renderDashboard();
  if (v === 'students')         renderStudentList();
  if (v === 'student-detail')   renderStudentDetail();
  if (v === 'daily')            renderDailyLog();
  if (v === 'report')           renderReport();
  if (v === 'class-dashboard')  renderClassDashboard(_classDashClass);
  if (v === 'class-report')     renderClassReport();
  if (v === 'collection-sheet') renderCollectionClassGrid();
  if (v === 'id-card')          renderIDCard();
  if (v === 'fee-management')   renderFeeManagement();
}

function _scheduleRefresh(fn) {
  clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(fn, 120);
}

// ── Firestore listeners ───────────────────────────────────────────
function cleanupListeners() {
  STATE.listeners.forEach(u => { try { u(); } catch (e) {} });
  STATE.listeners = [];
}

function startFirestoreListeners() {
  cleanupListeners();

  // Students
  const unsubS = studentsRef().onSnapshot(snap => {
    STATE.students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _scheduleRefresh(_refreshCurrentView);
    setSyncDot('syncing'); setTimeout(() => setSyncDot('online'), 900);
  }, err => console.error('Students listener error:', err));

  // Transactions
  const unsubT = txnsRef().onSnapshot(snap => {
    STATE.transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _scheduleRefresh(_refreshCurrentView);
    setSyncDot('syncing'); setTimeout(() => setSyncDot('online'), 900);
  }, err => console.error('Transactions listener error:', err));

  STATE.listeners.push(unsubS, unsubT);

  // Teachers — also watches for PIN resets and role changes on the current user
  const unsubTch = teachersRef().onSnapshot(snap => {
    STATE.teachers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentView === 'teachers') renderTeachersUI();

    const myDoc = snap.docs.find(d => d.id === STATE.user?.uid);
    if (myDoc) {
      const updated = myDoc.data();

      // PIN reset by manager
      if (STATE.teacher && updated.teacherPinHash !== STATE.teacher.teacherPinHash) {
        STATE.teacher.teacherPinHash = updated.teacherPinHash;
        updatePinSettingsLabel();
        if (!updated.teacherPinHash && !document.getElementById('pin-screen').classList.contains('active')) {
          showToast('Your PIN was reset by manager — please set a new one', 'warn');
          setTimeout(() => showPinSetupScreen(false), 1200);
        }
      }

      // Role change (e.g. promoted to manager)
      if (STATE.teacher && updated.role !== STATE.teacher.role) {
        STATE.teacher.role = updated.role;
        renderSettings();
        const isManager = updated.role === 'manager';
        const editRow   = document.getElementById('edit-school-row');
        const dz        = document.getElementById('danger-zone');
        const dl        = document.getElementById('danger-label');
        if (editRow) editRow.style.display = isManager ? 'flex'  : 'none';
        if (dz)      dz.style.display      = isManager ? 'block' : 'none';
        if (dl)      dl.style.display      = isManager ? 'block' : 'none';
        showToast(isManager ? 'You are now the Manager 👑' : 'Your role has been updated', 'success');
      }
    }
  }, err => console.error('Teachers listener error:', err));

  // School doc — invite code, name changes
  const unsubSchool = db.collection('schools').doc(STATE.schoolCode).onSnapshot(snap => {
    if (!snap.exists) return;
    const data = snap.data();
    STATE.schoolData = data;

    const icEl = document.getElementById('display-invite-code');
    if (icEl) {
      const ic = (data.inviteCode || '').toString().trim();
      icEl.textContent = ic || 'NOT SET';
      icEl.style.color = ic ? '' : 'var(--red-l,#fca5a5)';
    }

    if (data.name && data.name !== STATE.schoolName) {
      STATE.schoolName = data.name;
      const tb  = document.getElementById('topbar-school');
      const ssn = document.getElementById('settings-school-name');
      if (tb)  tb.textContent  = data.name;
      if (ssn) ssn.textContent = data.name;
    }
  }, err => console.error('School listener error:', err));

  // Fees
  const unsubFees = feesRef().onSnapshot(snap => {
    STATE.fees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentView === 'fee-management') renderFeeManagement();
  }, err => console.error('Fees listener error:', err));

  // Announcements
  const unsubAnn = db.collection('schools').doc(STATE.schoolCode)
    .collection('announcements')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .onSnapshot(snap => {
      STATE.announcements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentView === 'announcements') renderAnnouncementsView();
      _renderDashboardAnnouncementBanners();
    }, err => console.error('Announcements listener error:', err));

  STATE.listeners.push(unsubTch, unsubSchool, unsubFees, unsubAnn);
}

// ── Load main app ─────────────────────────────────────────────────
// Called once after a successful login or registration.
// Sets up the UI, starts listeners, and navigates to dashboard.
function loadMainApp() {
  if (STATE._appLoaded) return;
  STATE._appLoaded = true;
  showAppScreen('app');

  document.getElementById('topbar-school').textContent = STATE.schoolName || '';

  const sn  = document.getElementById('settings-teacher-name');
  const si  = document.getElementById('settings-teacher-info');
  const ssn = document.getElementById('settings-school-name');
  const ssc = document.getElementById('settings-school-code');
  if (sn)  sn.textContent  = STATE.teacher.name || '';
  if (si)  si.textContent  = `${STATE.schoolName || ''} · ${STATE.teacher.role || 'teacher'}`;
  if (ssn) ssn.textContent = STATE.schoolName || '';
  if (ssc) ssc.textContent = `School Code: ${STATE.schoolCode || ''}`;

  const isManager  = STATE.teacher.role === 'manager';
  const editRow    = document.getElementById('edit-school-row');
  const dangerZone = document.getElementById('danger-zone');
  const dangerLabel = document.getElementById('danger-label');
  if (editRow)    editRow.style.display    = isManager ? 'flex'  : 'none';
  if (dangerZone) dangerZone.style.display = isManager ? 'block' : 'none';
  if (dangerLabel) dangerLabel.style.display = isManager ? 'block' : 'none';

  startFirestoreListeners();
  navigateTo('dashboard');

  // Seed browser history so hardware back doesn't exit the app on first press
  if (window.history && window.history.replaceState) {
    window.history.replaceState({ view: 'dashboard' }, '', '#dashboard');
  }

  // PIN is mandatory — every teacher must have one
  if (STATE.teacher.teacherPinHash) {
    showPinScreen();
  } else {
    setTimeout(() => showPinSetupScreen(true), 350);
  }

  checkBackupReminder();
  const presets = getPresets();
  const psub    = document.getElementById('preset-settings-sub');
  if (psub) psub.textContent = '₹' + presets.join(' · ₹');
  updatePinSettingsLabel();
}

// ── Auth state change ─────────────────────────────────────────────
// The single entry point for all login/logout transitions.
auth.onAuthStateChanged(async user => {
  STATE._authResolved = true;

  // Anonymous user — could be a student session being restored after page refresh
  if (user && user.isAnonymous) {
    try {
      const saved = sessionStorage.getItem(SP_SESSION_KEY);
      if (saved) {
        const { schoolCode, studentId } = JSON.parse(saved);
        const snap = await db.collection('schools').doc(schoolCode)
          .collection('students').doc(studentId).get();
        if (snap.exists) {
          await loadStudentPortal({ id: snap.id, ...snap.data() }, schoolCode);
          return;
        }
        sessionStorage.removeItem(SP_SESSION_KEY);
        showToast('Session expired — please log in again', 'warn');
      }
    } catch (e) {
      console.warn('Could not restore student session:', e);
      try { sessionStorage.removeItem(SP_SESSION_KEY); } catch (e2) {}
    }
    _dismissLoadingOverlay();
    showAuthView('student-login');
    return;
  }

  // Block while registration / join is in flight
  if (_regInProgress || _joinInProgress) return;

  // Signed out
  if (!user) {
    try { sessionStorage.removeItem(SP_SESSION_KEY); } catch (e) {}
    _dismissLoadingOverlay();
    if (document.getElementById('student-portal').classList.contains('active')) return;
    STATE.user = null; STATE.teacher = null; STATE.schoolCode = null; STATE._appLoaded = false;
    ['login', 'create', 'join'].forEach(f => {
      const btn = document.getElementById(f + '-btn');
      if (btn && btn._origText) { btn.disabled = false; btn.innerHTML = btn._origText; }
    });
    showAppScreen('auth');
    return;
  }

  // Signed in as teacher
  if (_joinInProgress) return;
  setAuthLoading('login', false);
  STATE.user = user;

  try {
    const uDoc = await retryGet(userRef(user.uid));
    if (!uDoc.exists) {
      showToast('Account setup incomplete. Please re-register.', 'error');
      await auth.signOut(); return;
    }
    const { schoolCode, schoolName } = uDoc.data();
    const tDoc = await db.collection('schools').doc(schoolCode)
      .collection('teachers').doc(user.uid).get();
    if (!tDoc.exists) {
      showToast('Teacher record not found. Contact your manager.', 'error');
      await auth.signOut(); return;
    }
    const teacherData = { id: user.uid, ...tDoc.data() };
    if (teacherData.status === 'removed') {
      showToast('Your access has been removed.', 'error');
      await auth.signOut(); return;
    }
    STATE.schoolCode = schoolCode;
    STATE.schoolName = schoolName;
    STATE.teacher    = teacherData;
    if (!STATE._appLoaded) loadMainApp();
  } catch (err) {
    console.error('onAuthStateChanged error:', err);
    setAuthLoading('login', false);
    _dismissLoadingOverlay();
    showToast('Login failed — check your connection and try again.', 'error');
    showAppScreen('auth');
  }
});