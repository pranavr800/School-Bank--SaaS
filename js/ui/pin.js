// ─── TEACHER PIN LOCK ─────────────────────────────────────────────
// PIN hash stored in schools/{code}/teachers/{uid}.teacherPinHash
// Hash = sha256(pin + uid) — salted per user, never stored in plain text.
// Works on every device — one PIN set once, verified everywhere.
//
// Modes:
//   verify        — existing PIN, just confirm identity
//   setup-step1   — first entry of new PIN
//   setup-step2   — confirm new PIN
//   change-verify — verify current PIN before setting a new one
//   change-step1  — first entry of new PIN (after verifying old)
//   change-step2  — confirm new PIN (after verifying old)

const PIN_IDLE_MS = 5 * 60 * 1000; // lock after 5 min of inactivity

let pinBuffer      = '';
let pinIdleTimer   = null;
let _pinMode       = 'verify';
let _pinFirstEntry = '';

// ── Guard ─────────────────────────────────────────────────────────
function pinHasHash() {
  return !!(STATE.teacher && STATE.teacher.teacherPinHash);
}

// ── Low-level screen helper ───────────────────────────────────────
function _showPinScreen(subtitle, showForgot, showSetupBtn) {
  pinBuffer = '';
  for (let i = 0; i < 4; i++) {
    document.getElementById('pd' + i).classList.remove('filled', 'shake');
  }
  document.getElementById('pin-err').textContent  = '';
  document.getElementById('pin-sub').textContent  = subtitle;
  document.getElementById('pin-screen').classList.add('active');

  const forgotBtn = document.getElementById('pin-forgot-btn');
  const setupBtn  = document.getElementById('pin-setup-btn');
  if (forgotBtn) forgotBtn.style.display = showForgot   ? 'block' : 'none';
  if (setupBtn)  setupBtn.style.display  = showSetupBtn ? 'block' : 'none';
}

// ── Public: show lock screen ──────────────────────────────────────
function showPinScreen() {
  _pinMode = 'verify';
  _showPinScreen('Enter your PIN to continue', true, false);
}

// ── Public: first-time or new PIN setup ──────────────────────────
function showPinSetupScreen(isFirst) {
  _pinMode       = 'setup-step1';
  _pinFirstEntry = '';
  const msg = isFirst
    ? `🔒 Welcome, ${STATE.teacher?.name?.split(' ')[0] || ''}! Set a 4-digit PIN to secure your account`
    : 'Enter a new 4-digit PIN';
  _showPinScreen(msg, false, false);
}

function hidePinScreen() {
  document.getElementById('pin-screen').classList.remove('active');
}

// ── Numpad input ──────────────────────────────────────────────────
function pinKey(k) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += k;
  document.getElementById('pd' + (pinBuffer.length - 1)).classList.add('filled');
  if (pinBuffer.length === 4) setTimeout(_handlePin, 120);
}

function pinDel() {
  if (!pinBuffer.length) return;
  document.getElementById('pd' + (pinBuffer.length - 1)).classList.remove('filled');
  pinBuffer = pinBuffer.slice(0, -1);
}

function _pinError(msg) {
  document.getElementById('pin-err').textContent = msg;
  document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('shake'));
  setTimeout(() => {
    pinBuffer = '';
    document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('filled', 'shake'));
    document.getElementById('pin-err').textContent = '';
  }, 600);
}

// ── Central handler — routes based on current mode ────────────────
async function _handlePin() {
  const entered = pinBuffer;

  // ── Verify existing PIN ────────────────────────────────────────
  if (_pinMode === 'verify' || _pinMode === 'change-verify') {
    const hash = await sha256(entered + STATE.user.uid);
    if (hash === STATE.teacher.teacherPinHash) {
      if (_pinMode === 'change-verify') {
        // Old PIN confirmed — now enter the new PIN
        _pinMode       = 'change-step1';
        _pinFirstEntry = '';
        _showPinScreen('Enter your new 4-digit PIN', false, false);
      } else {
        hidePinScreen();
        resetIdleTimer();
      }
    } else {
      _pinError('Incorrect PIN. Try again.');
    }

  // ── First entry (new PIN) ──────────────────────────────────────
  } else if (_pinMode === 'setup-step1' || _pinMode === 'change-step1') {
    _pinFirstEntry = entered;
    pinBuffer      = '';
    for (let i = 0; i < 4; i++) {
      document.getElementById('pd' + i).classList.remove('filled');
    }
    document.getElementById('pin-err').textContent = '';
    _pinMode = _pinMode === 'setup-step1' ? 'setup-step2' : 'change-step2';
    document.getElementById('pin-sub').textContent = 'Confirm your PIN';

  // ── Confirmation (must match first entry) ──────────────────────
  } else if (_pinMode === 'setup-step2' || _pinMode === 'change-step2') {
    if (entered !== _pinFirstEntry) {
      _pinFirstEntry = '';
      _pinMode = _pinMode === 'setup-step2' ? 'setup-step1' : 'change-step1';
      _pinError('PINs do not match — try again');
      setTimeout(() => {
        document.getElementById('pin-sub').textContent = 'Enter your new 4-digit PIN';
      }, 650);
      return;
    }

    // PINs match — hash and save to Firestore
    const isNew = _pinMode === 'setup-step2';
    const hash  = await sha256(entered + STATE.user.uid);
    try {
      await teachersRef().doc(STATE.user.uid).update({ teacherPinHash: hash });
      STATE.teacher.teacherPinHash = hash;
      hidePinScreen();
      _pinFirstEntry = '';
      _pinMode       = 'verify';
      showToast(
        isNew ? '🔒 PIN set! You\'re protected on every device.' : '🔒 PIN changed successfully!',
        'success'
      );
      resetIdleTimer();
      updatePinSettingsLabel();
    } catch (err) {
      _pinError('Could not save PIN — check connection');
      console.error('PIN save error:', err);
    }
  }
}

// ── Remove PIN ────────────────────────────────────────────────────
async function removeTeacherPin() {
  if (!pinHasHash()) return;
  try {
    await teachersRef().doc(STATE.user.uid).update({ teacherPinHash: null });
    STATE.teacher.teacherPinHash = null;
    showToast('PIN removed', '');
    updatePinSettingsLabel();
  } catch (err) {
    showToast('Error removing PIN: ' + err.message, 'error');
  }
}

function confirmRemovePin() {
  if (confirm('Remove your PIN lock?\nYour account will have no PIN until you set a new one.')) {
    removeTeacherPin();
  }
}

// ── Change PIN (from Settings) ────────────────────────────────────
function openPinSetup() {
  if (pinHasHash()) {
    _pinMode = 'change-verify';
    _showPinScreen('Enter your current PIN to change it', true, false);
  } else {
    showPinSetupScreen(false);
  }
}

// Stub — kept for any leftover HTML onclick references
function savePinSetup() { openPinSetup(); }

// ── Manager resets another teacher's PIN ──────────────────────────
async function managerResetTeacherPin(uid, name) {
  if (STATE.teacher?.role !== 'manager') {
    showToast('Only manager can reset PINs', 'error'); return;
  }
  if (!confirm(`Reset PIN for ${name}?\nThey will be asked to set a new PIN on their next login.`)) return;
  try {
    await teachersRef().doc(uid).update({ teacherPinHash: null });
    showToast(`${name}'s PIN has been reset`, 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ── Idle auto-lock ────────────────────────────────────────────────
function resetIdleTimer() {
  if (!pinHasHash()) return;
  clearTimeout(pinIdleTimer);
  pinIdleTimer = setTimeout(() => {
    if (document.getElementById('app').style.display !== 'none') showPinScreen();
  }, PIN_IDLE_MS);
}

function initIdleReset() {
  ['touchstart', 'click', 'keydown'].forEach(e =>
    document.addEventListener(e, resetIdleTimer, { passive: true })
  );
}

// ── Forgot PIN ────────────────────────────────────────────────────
// PIN is stored in Firestore — only a manager can clear it.
// Logging out is the only self-service recovery path.
function pinForgot() {
  if (confirm('Forgot your PIN?\n\nYou will be logged out. Ask your school manager to reset your PIN from the Teachers panel.')) {
    logoutTeacher();
  }
}

// ── Settings label ────────────────────────────────────────────────
function updatePinSettingsLabel() {
  const lbl       = document.getElementById('pin-settings-label');
  const sub       = document.getElementById('pin-settings-sub');
  const removeRow = document.getElementById('remove-pin-row');
  if (lbl) lbl.textContent = pinHasHash() ? 'Change PIN' : 'Set PIN Lock';
  if (sub) sub.textContent = pinHasHash()
    ? 'PIN active — works on all devices'
    : 'Secure your account — works on all devices';
  if (removeRow) removeRow.style.display = pinHasHash() ? 'flex' : 'none';
}