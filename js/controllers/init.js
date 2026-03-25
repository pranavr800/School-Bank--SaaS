// ─── APP BOOTSTRAP ────────────────────────────────────────────────
// Runs once when the HTML is fully parsed.
// All other modules are already loaded by this point.

window.addEventListener('DOMContentLoaded', () => {

  // ── Loading timeout safety net ────────────────────────────────
  // If onAuthStateChanged never fires (network block, cold start delay),
  // force-dismiss the loading overlay after 8 seconds.
  setTimeout(() => {
    const lo = document.getElementById('app-loading');
    if (lo && lo.style.display !== 'none' && !lo.classList.contains('fade-out')) {
      console.warn('Loading timeout — forcing dismiss');
      _dismissLoadingOverlay();
      if (
        document.getElementById('app').style.display === 'none' &&
        !document.getElementById('student-portal').classList.contains('active')
      ) {
        showAuthView('welcome');
      }
    }
  }, 8000);

  // ── Escape key closes any open modal ─────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = document.querySelector('.modal-overlay.active');
      if (open) closeModal(open.id);
    }
  });

  // ── Initial connectivity state ────────────────────────────────
  setSyncDot(navigator.onLine ? 'online' : 'offline');
  if (!navigator.onLine) {
    document.getElementById('offline-banner').classList.add('visible');
  }

  // ── Import zone drag-and-drop ─────────────────────────────────
  const zone = document.getElementById('import-zone');
  if (zone) {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleImport({ target: { files: [file], value: '' } });
    });
  }

  // ── Daily log date default ────────────────────────────────────
  const dd = document.getElementById('daily-date');
  if (dd) dd.value = today();

  // ── PIN idle timer ────────────────────────────────────────────
  initIdleReset();
  updatePinSettingsLabel();

  // ── Preset button label ───────────────────────────────────────
  const presets = getPresets();
  const sub     = document.getElementById('preset-settings-sub');
  if (sub) sub.textContent = '₹' + presets.join(' · ₹');

  // ── Global touch/click setup ──────────────────────────────────
  checkBackupReminder();
  initSwipeGestures();
  initRipples();

  // Dismiss swipe-reveal delete buttons when tapping outside a txn
  // Also lazily attach ripple to any dynamically-created buttons
  document.addEventListener('click', e => {
    if (!e.target.closest('.txn-item-wrap')) {
      document.querySelectorAll('.txn-item-wrap.del-active')
        .forEach(w => w.classList.remove('del-active'));
    }
    const btn = e.target.closest('.btn-primary,.btn-secondary,.sdh-btn,.txn-btn');
    if (btn && !btn._rippleInit) {
      btn._rippleInit = true;
      btn.classList.add('ripple-host');
      btn.addEventListener('click', addRipple);
    }
  });

});