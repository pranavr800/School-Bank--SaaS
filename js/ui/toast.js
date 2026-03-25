// ─── UI HELPERS ───────────────────────────────────────────────────
// Toast, modal, auth screen controls, sync dot, connectivity,
// loading overlay, ripple effects, swipe gestures.
// These are pure DOM functions — no Firestore calls here.

// ── Helpers ───────────────────────────────────────────────────────
function uuid()     { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }
function genCode(n) { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join(''); }
function fmt(n)     { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function today()    { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtDate(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtTS(ts)  { if (!ts) return ''; const ms = ts.toMillis ? ts.toMillis() : Number(ts); return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function initials(n){ if (!n) return '?'; const p = n.trim().split(' '); return p.length >= 2 ? p[0][0].toUpperCase() + p[1][0].toUpperCase() : p[0][0].toUpperCase(); }
function esc(str)   { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
function toMs(t)    { if (!t) return 0; if (t.toMillis) return t.toMillis(); if (t.timestamp) return t.timestamp; if (typeof t === 'number') return t; return 0; }

function countUp(el, target, duration = 700) {
  if (!el) return;
  const start = Date.now();
  const tick  = () => {
    const p      = Math.min((Date.now() - start) / duration, 1);
    const eased  = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.floor(eased * target));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmt(target);
  };
  requestAnimationFrame(tick);
}

async function retryGet(ref, retries = 3, delayMs = 400) {
  for (let i = 0; i < retries; i++) {
    const doc = await ref.get();
    if (doc.exists) return doc;
    if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return await ref.get();
}

async function batchChunked(items, applyFn, chunkSize = 499) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
  for (const chunk of chunks) {
    const b = db.batch();
    chunk.forEach(item => applyFn(b, item));
    await b.commit();
  }
}

function getAuthError(code) {
  const map = {
    'auth/user-not-found':                           'No account found with this email address',
    'auth/wrong-password':                           'Incorrect password — please try again',
    'auth/invalid-credential':                       'Incorrect email or password',
    'auth/email-already-in-use':                     'This email is already registered — try logging in',
    'auth/weak-password':                            'Password must be at least 6 characters',
    'auth/invalid-email':                            'Please enter a valid email address',
    'auth/too-many-requests':                        'Too many failed attempts — please wait a few minutes',
    'auth/user-disabled':                            'This account has been disabled — contact your manager',
    'auth/network-request-failed':                   'No internet connection — please check your network',
    'auth/operation-not-allowed':                    'Sign-in is not enabled — contact support',
    'auth/requires-recent-login':                    'Please log out and log in again to continue',
    'auth/popup-closed-by-user':                     'Sign-in was cancelled',
    'auth/account-exists-with-different-credential': 'An account already exists with this email',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ── Toast ─────────────────────────────────────────────────────────
const _toastIcons = {
  success: '✓',
  error:   '✕',
  warn:    '⚠️',
  '':      `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

function showToast(msg, type = '') {
  const t    = document.getElementById('toast');
  const icon = _toastIcons[type] || _toastIcons[''];
  t.innerHTML  = `<span class="toast-icon">${icon}</span><span class="toast-msg">${esc(msg)}</span>`;
  t.className  = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => {
    t.classList.add('hiding');
    setTimeout(() => { t.className = 'toast'; }, 220);
  }, 3000);
}

// ── Modal ─────────────────────────────────────────────────────────
function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.add('closing');
  setTimeout(() => { overlay.classList.remove('active', 'closing'); }, 200);
}

// ── Auth screen helpers ───────────────────────────────────────────
function showAuthView(view) {
  const current = document.querySelector('.auth-view.active');
  const next    = document.getElementById('auth-' + view);
  if (current && current !== next) {
    current.classList.add('slide-out');
    setTimeout(() => { current.classList.remove('active', 'slide-out'); }, 180);
    setTimeout(() => { next.classList.add('active'); }, 140);
  } else {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    next.classList.add('active');
  }
  // Reset all form button states
  ['login', 'create', 'join'].forEach(f => {
    const btn = document.getElementById(f + '-btn');
    if (btn && btn._origText) { btn.disabled = false; btn.innerHTML = btn._origText; }
  });
  // Clear all error messages
  ['login-error', 'create-error', 'join-error', 'sl-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function showAuthError(form, msg) { document.getElementById(form + '-error').textContent = msg; }
function clearAuthError(form)     { document.getElementById(form + '-error').textContent = ''; }

function setAuthLoading(form, on) {
  const btn = document.getElementById(form + '-btn');
  if (!btn) return;
  if (!btn._origText) btn._origText = btn.innerHTML;
  btn.disabled = on;
  btn.innerHTML = on ? '<span class="auth-spinner"></span>Please wait…' : btn._origText;
}

// ── Loading overlay ───────────────────────────────────────────────
function _dismissLoadingOverlay() {
  const lo = document.getElementById('app-loading');
  if (lo && !lo.classList.contains('fade-out')) {
    lo.classList.add('fade-out');
    setTimeout(() => { lo.style.display = 'none'; }, 320);
  }
}

function showAppScreen(which) {
  _dismissLoadingOverlay();
  document.getElementById('auth-screen').style.display = which === 'auth' ? 'flex' : 'none';
  document.getElementById('app').style.display         = which === 'app'  ? 'flex' : 'none';
}

// ── Sync dot ──────────────────────────────────────────────────────
function setSyncDot(state) {
  const d = document.getElementById('conn-dot');
  if (!d) return;
  d.className = 'conn-dot' +
    (state === 'offline' ? ' offline' : state === 'syncing' ? ' syncing' : '');
}

// ── Connectivity ──────────────────────────────────────────────────
window.addEventListener('online', () => {
  STATE.isOnline = true;
  setSyncDot('syncing');
  document.getElementById('offline-banner').classList.remove('visible');
  showToast('Back online — syncing…', 'success');
  setTimeout(() => setSyncDot('online'), 2000);
});
window.addEventListener('offline', () => {
  STATE.isOnline = false;
  setSyncDot('offline');
  document.getElementById('offline-banner').classList.add('visible');
  showToast('You are offline — data saved locally', 'warn');
});

// ── Ripple effect ─────────────────────────────────────────────────
function addRipple(e) {
  const btn    = e.currentTarget;
  const rect   = btn.getBoundingClientRect();
  const size   = Math.max(rect.width, rect.height) * 1.2;
  const x      = e.clientX - rect.left - size / 2;
  const y      = e.clientY - rect.top  - size / 2;
  const ripple = document.createElement('span');
  ripple.className  = 'ripple' + (btn.dataset.rippleDark !== undefined ? ' dark' : '');
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

function initRipples() {
  document.querySelectorAll(
    '.btn-primary,.btn-secondary,.btn-auth-primary,.btn-auth-secondary,.quick-btn,.sdh-btn,.txn-btn,.nav-item'
  ).forEach(btn => {
    btn.classList.add('ripple-host');
    if (btn.classList.contains('nav-item') ||
        btn.classList.contains('quick-btn') ||
        btn.classList.contains('sdh-btn')) {
      btn.dataset.rippleDark = '';
    }
    btn.addEventListener('click', addRipple);
  });
}

// ── Chip pop animation ────────────────────────────────────────────
function animateChip(el) {
  if (!el) return;
  el.classList.remove('chip-pop');
  requestAnimationFrame(() => el.classList.add('chip-pop'));
}

// ── Swipe gestures (tab switching) ────────────────────────────────
function initSwipeGestures() {
  const TAB_ORDER = ['dashboard', 'students', 'scanner', 'daily', 'teachers'];
  let sx = 0, sy = 0, sTime = 0;
  const app = document.getElementById('app');

  app.addEventListener('touchstart', e => {
    sx    = e.touches[0].clientX;
    sy    = e.touches[0].clientY;
    sTime = Date.now();
  }, { passive: true });

  app.addEventListener('touchend', e => {
    if (Date.now() - sTime > 400) return;
    const dx       = e.changedTouches[0].clientX - sx;
    const dy       = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const swipeLeft = dx < 0;
    const idx       = TAB_ORDER.indexOf(currentView);
    if (idx !== -1) {
      if (swipeLeft  && idx < TAB_ORDER.length - 1) navigateTo(TAB_ORDER[idx + 1]);
      if (!swipeLeft && idx > 0)                    navigateTo(TAB_ORDER[idx - 1]);
    }
    // Swipe right from the left edge of a sub-view = go back
    if (idx === -1 && !swipeLeft && sx < 60) {
      _navGoingBack = true;
      goBack();
    }
  }, { passive: true });
}