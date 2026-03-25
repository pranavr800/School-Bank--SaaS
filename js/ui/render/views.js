// ─── RENDER FUNCTIONS ─────────────────────────────────────────────
// All DOM rendering. Reads from STATE and DB only — no Firestore writes.
// Every function here is triggered by navigateTo() or a Firestore snapshot.

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════

function renderDashboard() {
  _baseRenderDashboard();
  setTimeout(() => { renderStudentOfMonth(); renderLowBalanceAlert(); }, 100);
}

function _baseRenderDashboard() {
  const students = STATE.students, txns = STATE.transactions;
  const now = new Date();
  document.getElementById('dh-date').textContent =
    now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const openBals = students.reduce((a, s) => a + (parseFloat(s.openingBalance) || 0), 0);
  const totalD   = txns.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
  const totalW   = txns.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0);
  const totalBal = openBals + totalD - totalW;

  countUp(document.getElementById('dh-balance'), totalBal, 800);
  countUp(document.getElementById('stat-deps'),   totalD,    600);
  countUp(document.getElementById('stat-wds'),    totalW,    600);
  document.getElementById('stat-students').textContent = students.length;
  document.getElementById('stat-txns').textContent     = txns.length;

  document.querySelectorAll('.stat-card').forEach((c, i) => {
    c.style.animationDelay = (i * 60) + 'ms';
    c.classList.remove('stagger-item');
    requestAnimationFrame(() => c.classList.add('stagger-item'));
  });

  const recent = [...txns].sort((a, b) => toMs(b) - toMs(a)).slice(0, 5);
  const el = document.getElementById('recent-txns');
  el.innerHTML = recent.length
    ? recent.map(t => txnHTML(t, true)).join('')
    : `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No Transactions Yet</div><div class="empty-sub">Start by adding students and recording transactions</div></div>`;
  el.querySelectorAll('.txn-item').forEach((item, i) => {
    item.style.animationDelay = (i * 50) + 'ms';
    item.classList.add('stagger-item');
  });
}

// ── Announcement banners on dashboard ────────────────────────────
const _dismissedAnns = new Set(JSON.parse(localStorage.getItem('sbm_dismissed_anns') || '[]'));

function _renderDashboardAnnouncementBanners() {
  const el = document.getElementById('ann-banner-container');
  if (!el) return;
  const now    = Date.now();
  const active = STATE.announcements.filter(a => {
    const age = now - (a.createdAt?.toMillis?.() || 0);
    return age < 7 * 24 * 60 * 60 * 1000 && !_dismissedAnns.has(a.id);
  }).slice(0, 5);
  if (!active.length) { el.innerHTML = ''; return; }
  const icons      = { info: 'ℹ️', warning: '⚠️', urgent: '🚨' };
  const bgCols     = { info: '#EEF3FF', warning: '#FFF8E6', urgent: '#FDECEA' };
  const borderCols = { info: '#B5D4F4', warning: '#FCD34D', urgent: '#F5C0C0' };
  el.innerHTML = `<div style="padding:11px 14px 0;">${active.map(a =>
    `<div style="background:${bgCols[a.type]||bgCols.info};border:1px solid ${borderCols[a.type]||borderCols.info};border-radius:12px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:9px;">
      <span style="font-size:1rem;flex-shrink:0;">${icons[a.type] || '📢'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;font-size:.83rem;color:var(--navy);">${esc(a.title)}</div>
        ${a.body ? `<div style="font-size:.73rem;color:var(--text-2);margin-top:2px;line-height:1.45;">${esc(a.body)}</div>` : ''}
      </div>
      <button onclick="dismissAnn('${a.id}',this.closest('div[style]'))" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.85rem;padding:0;flex-shrink:0;line-height:1;">✕</button>
    </div>`
  ).join('')}</div>`;
}

// Alias used in several older call sites
function loadDashboardAnnouncements() { _renderDashboardAnnouncementBanners(); }

function dismissAnn(id, el) {
  _dismissedAnns.add(id);
  localStorage.setItem('sbm_dismissed_anns', JSON.stringify([..._dismissedAnns]));
  el.style.display = 'none';
}

// ── Student of the month widget ───────────────────────────────────
function renderStudentOfMonth() {
  const el = document.getElementById('sotm-container');
  if (!el) return;
  const students = STATE.students;
  if (!students.length) { el.innerHTML = ''; return; }
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthDeps = students.map(s => {
    const deps = STATE.transactions
      .filter(t => t.studentId === s.id && t.type === 'deposit' && t.date && t.date.startsWith(thisMonth))
      .reduce((a, t) => a + t.amount, 0);
    return { s, deps };
  }).filter(x => x.deps > 0).sort((a, b) => b.deps - a.deps);
  if (!monthDeps.length) { el.innerHTML = ''; return; }
  const top = monthDeps[0];
  el.innerHTML = `<div class="sotm-card" onclick="navigateTo('student-detail','${top.s.id}')" style="cursor:pointer;">
    <div class="sotm-icon">${top.s.photo ? `<img src="${top.s.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:14px;" alt="">` : '🏆'}</div>
    <div class="sotm-info">
      <div class="sotm-label">⭐ Student of the Month</div>
      <div class="sotm-name">${esc(top.s.name)}</div>
      <div class="sotm-sub">Class ${esc(top.s.class || '—')} · Saved ${fmt(top.deps)} this month</div>
    </div>
    <div style="color:rgba(255,255,255,.4);font-size:1rem;flex-shrink:0;">›</div>
  </div>`;
}

// ── Low balance alert widget ──────────────────────────────────────
function renderLowBalanceAlert() {
  const el = document.getElementById('low-bal-container');
  if (!el) return;
  const low = STATE.students
    .filter(s => DB.getBalance(s.id) < 50 && DB.getBalance(s.id) >= 0)
    .sort((a, b) => DB.getBalance(a.id) - DB.getBalance(b.id))
    .slice(0, 5);
  if (!low.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="low-bal-alert-card">
    <div class="low-bal-alert-title">⚠️ Low Balance Alert <span style="background:var(--red);color:#fff;border-radius:100px;padding:1px 8px;font-size:.65rem;margin-left:4px;">${low.length}</span></div>
    ${low.map(s => `<div class="low-bal-alert-item">
      <span style="font-weight:700;color:var(--text)">${esc(s.name)}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-family:var(--font-display);font-weight:700;color:var(--red)">${fmt(DB.getBalance(s.id))}</span>
        <button onclick="event.stopPropagation();navigateTo('student-detail','${s.id}')" style="background:var(--navy);color:#fff;border:none;border-radius:7px;padding:3px 9px;font-size:.65rem;font-weight:800;cursor:pointer;font-family:var(--font-body);">View</button>
      </div>
    </div>`).join('')}
  </div>`;
}

// ═══════════════════════════════════════════
// STUDENT LIST
// ═══════════════════════════════════════════

function renderSkeletonList(containerId, count = 5) {
  const el = document.getElementById(containerId);
  el.innerHTML = Array.from({ length: count }, () =>
    `<div class="skeleton-card"><div class="skeleton-avatar"></div><div class="skeleton-info"><div class="skeleton-line" style="width:60%;height:13px;"></div><div class="skeleton-line" style="width:80%;height:10px;margin-top:4px;"></div></div><div class="skeleton-bal"><div class="skeleton-line" style="width:48px;height:14px;"></div><div class="skeleton-line" style="width:36px;height:9px;margin-top:4px;"></div></div></div>`
  ).join('');
}

let classFilter  = '';
let _searchTimer = null;
function debouncedSearch() { clearTimeout(_searchTimer); _searchTimer = setTimeout(() => renderStudentList(), 220); }

function renderStudentList() {
  const q        = (document.getElementById('student-search').value || '').toLowerCase().trim();
  const filtered = STATE.students.filter(s => {
    const mQ = !q || s.name.toLowerCase().includes(q) || s.accountNumber.toLowerCase().includes(q) ||
               (s.class || '').toLowerCase().includes(q) || (s.rollNumber || '').toString().includes(q);
    const mC = !classFilter || s.class === classFilter;
    return mQ && mC;
  });
  const sorted = sortStudents(filtered);
  const el     = document.getElementById('student-list');
  if (!sorted.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">No Students Found</div><div class="empty-sub">${STATE.students.length === 0 ? 'Add a student or import from Excel' : 'Try a different search term'}</div></div>`;
    return;
  }
  el.innerHTML = sorted.map(s => {
    const bal    = DB.getBalance(s.id);
    const avatar = s.photo
      ? `<img class="s-photo" src="${s.photo}" alt="${esc(s.name)}">`
      : `<div class="s-avatar">${initials(s.name)}</div>`;
    const lowBal = bal < 50 && bal >= 0;
    const kycTag = s.kycVerified
      ? '<span class="kyc-badge verified" style="margin-left:5px;vertical-align:middle;">✓ KYC</span>'
      : '<span class="kyc-badge unverified" style="margin-left:5px;vertical-align:middle;">⚠</span>';
    return `<div class="student-card" onclick="navigateTo('student-detail','${s.id}')">${avatar}<div class="s-info"><div class="s-name">${esc(s.name)}${lowBal ? '<span class="low-bal-badge badge-pop">Low</span>' : ''}${kycTag}</div><div class="s-meta">A/C: ${esc(s.accountNumber)} &nbsp;·&nbsp; Class ${esc(s.class || '—')} &nbsp;·&nbsp; Roll ${esc(s.rollNumber || '—')}</div></div><div class="s-bal"><div class="s-bal-val" style="color:${bal < 50 ? 'var(--red)' : 'var(--navy)'}">${fmt(bal)}</div><div class="s-bal-lbl">Balance</div></div></div>`;
  }).join('');
  el.querySelectorAll('.student-card').forEach((c, i) => {
    c.style.animationDelay = Math.min(i * 35, 300) + 'ms';
    c.classList.add('stagger-item');
  });
}

function showClassFilter() {
  const row = document.getElementById('class-filter-row');
  if (row.style.display === 'flex') { row.style.display = 'none'; return; }
  const classes = [...new Set(STATE.students.map(s => s.class).filter(Boolean))].sort();
  if (!classes.length) { showToast('No classes yet', ''); return; }
  row.innerHTML = `<button class="chip ${!classFilter ? 'active' : ''}" onclick="setClassFilter('')">All</button>` +
    classes.map(c =>
      `<button class="chip ${classFilter === c ? 'active' : ''}" onclick="setClassFilter('${esc(c)}')">${esc(c)}</button> ` +
      `<button class="chip" onclick="openClassDash('${esc(c)}')" title="Class Dashboard" style="padding:3px 7px;">📊</button>`
    ).join('');
  row.style.display = 'flex';
}
function setClassFilter(c) { classFilter = c; renderStudentList(); showClassFilter(); }
function openClassDash(cls) { navigateTo('class-dashboard'); renderClassDashboard(cls); }

// ── Sort helpers ──────────────────────────────────────────────────
let currentSort = 'name';
function setSort(mode) {
  currentSort = mode;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('sort-' + mode);
  if (el) el.classList.add('active');
  renderStudentList();
}
function sortStudents(arr) {
  const copy = [...arr];
  if (currentSort === 'name')     return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (currentSort === 'bal-asc')  return copy.sort((a, b) => DB.getBalance(a.id) - DB.getBalance(b.id));
  if (currentSort === 'bal-desc') return copy.sort((a, b) => DB.getBalance(b.id) - DB.getBalance(a.id));
  if (currentSort === 'class')    return copy.sort((a, b) => (a.class || '').localeCompare(b.class || '') || a.name.localeCompare(b.name));
  if (currentSort === 'roll')     return copy.sort((a, b) => parseInt(a.rollNumber || 0) - parseInt(b.rollNumber || 0));
  return copy;
}

// ═══════════════════════════════════════════
// CREATE STUDENT
// ═══════════════════════════════════════════

function checkPinMatch() {
  const p1  = document.getElementById('new-student-pin').value;
  const p2  = document.getElementById('new-student-pin-confirm').value;
  const msg = document.getElementById('pin-match-msg');
  if (!p1 && !p2) { msg.textContent = ''; return; }
  if (p1.length === 4 && p2.length === 4) {
    if (p1 === p2) { msg.textContent = '✅ PINs match'; msg.style.color = 'var(--green)'; }
    else           { msg.textContent = '❌ PINs do not match'; msg.style.color = 'var(--red)'; }
  } else if (p2.length > 0) {
    msg.textContent = 'PIN must be 4 digits'; msg.style.color = 'var(--muted)';
  } else { msg.textContent = ''; }
}

async function createStudent() {
  const name       = document.getElementById('new-name').value.trim();
  const account    = document.getElementById('new-account').value.trim().toUpperCase();
  const cls        = document.getElementById('new-class').value.trim().toUpperCase();
  const roll       = document.getElementById('new-roll').value.trim();
  const balance    = parseFloat(document.getElementById('new-balance').value) || 0;
  const phoneRaw   = document.getElementById('new-phone').value.trim();
  const phone      = phoneRaw.replace(/\D/g, '');
  const pinRaw     = document.getElementById('new-student-pin').value.trim();
  const pinConfirm = document.getElementById('new-student-pin-confirm').value.trim();
  const goal       = parseFloat(document.getElementById('new-savings-goal').value) || 0;

  if (!name || name.length < 2)     { showToast('Student name must be at least 2 characters', 'error'); return; }
  if (!account)                      { showToast('Account number is required', 'error'); return; }
  if (!/^[A-Z0-9\-]+$/.test(account)) { showToast('Account number: use letters, numbers, hyphens only', 'error'); return; }
  if (DB.getStudentByAcc(account))   { showToast('Account number already exists — try Auto', 'error'); return; }
  if (balance < 0)                   { showToast('Opening balance cannot be negative', 'error'); return; }
  if (phoneRaw && (phone.length < 10 || phone.length > 15)) { showToast('Phone number must be 10–15 digits', 'error'); return; }
  if (!pinRaw)                       { showToast('Student PIN is required for login', 'error'); document.getElementById('new-student-pin').focus(); return; }
  if (!/^\d{4}$/.test(pinRaw))       { showToast('PIN must be exactly 4 digits', 'error'); return; }
  if (pinRaw !== pinConfirm)         { showToast('PINs do not match — please re-enter', 'error'); document.getElementById('new-student-pin-confirm').focus(); return; }

  const btn = document.getElementById('create-student-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Creating…';

  const pinHash = await sha256(pinRaw + account);
  const student = { id: uuid(), name, accountNumber: account, class: cls, rollNumber: roll, openingBalance: balance, parentPhone: phone, savingsGoal: goal, schoolCode: STATE.schoolCode, studentPinHash: pinHash, timestamp: Date.now() };
  if (newPhotoDataUrl) student.photo = newPhotoDataUrl;

  try {
    await DB.addStudent(student);
    ['new-name','new-account','new-class','new-roll','new-balance','new-phone','new-student-pin','new-student-pin-confirm','new-savings-goal']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('pin-match-msg').textContent = '';
    resetPhotoInput();
    showToast('Student account created!', 'success');
    currentStudentId = student.id;
    navigateTo('student-detail', student.id);
  } catch (err) {
    showToast('Error creating student: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✅ Create Account &amp; Generate QR';
  }
}

function autoFillAccount() {
  const cls      = document.getElementById('new-class').value.trim().toUpperCase();
  const existing = STATE.students.map(s => s.accountNumber || '');
  if (cls) {
    const clsNums = existing.filter(a => a.startsWith(cls)).map(a => { const m = a.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
    const clsMax  = clsNums.length ? Math.max(...clsNums) : 0;
    document.getElementById('new-account').value = cls + String(clsMax + 1).padStart(3, '0');
  } else {
    let max = 0;
    existing.forEach(acc => { const m = acc.match(/(\d+)$/); if (m) max = Math.max(max, parseInt(m[1])); });
    document.getElementById('new-account').value = 'SB' + String(max + 1).padStart(3, '0');
  }
}

// ── Photo helpers ─────────────────────────────────────────────────
let newPhotoDataUrl = '';
function previewNewPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const MAX = 400;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h = h * (MAX / w); w = MAX; } }
      else        { if (h > MAX) { w = w * (MAX / h); h = MAX; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      newPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const preview     = document.getElementById('new-photo-preview');
      const placeholder = document.getElementById('new-photo-placeholder');
      preview.src = newPhotoDataUrl;
      preview.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function resetPhotoInput() {
  newPhotoDataUrl = '';
  const preview     = document.getElementById('new-photo-preview');
  const placeholder = document.getElementById('new-photo-placeholder');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (placeholder) placeholder.style.display = 'flex';
  const inp = document.getElementById('new-photo-input');
  if (inp) inp.value = '';
}

// ═══════════════════════════════════════════
// STUDENT DETAIL
// ═══════════════════════════════════════════

function renderStudentDetail() {
  const s = DB.getStudentById(currentStudentId);
  if (!s) { navigateTo('students'); return; }

  const photoWrap = document.getElementById('sdh-photo-wrap');
  if (photoWrap) {
    photoWrap.innerHTML = s.photo
      ? `<img class="sdh-photo" src="${s.photo}" alt="${esc(s.name)}">`
      : `<div class="sdh-av">${initials(s.name)}</div>`;
  }
  document.getElementById('sdh-name').textContent = s.name;
  document.getElementById('sdh-meta').innerHTML =
    `Class ${esc(s.class || '—')}  ·  Roll No. ${esc(s.rollNumber || '—')}  ` +
    (s.kycVerified
      ? '<span class="kyc-badge verified" style="vertical-align:middle;">✓ KYC</span>'
      : '<span class="kyc-badge unverified" style="vertical-align:middle;">⚠ Unverified</span>');
  document.getElementById('sdh-acc').textContent =
    `Account: ${s.accountNumber} · School: ${STATE.schoolCode || ''}${s.parentPhone ? ' · 📞 ' + s.parentPhone : ''}`;

  const kycBtn = document.getElementById('kyc-btn');
  if (kycBtn) {
    const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    kycBtn.innerHTML  = svg + (s.kycVerified ? 'KYC ✓' : 'KYC');
    kycBtn.className  = s.kycVerified ? 'sdh-act green' : 'sdh-act';
  }

  const deps = DB.getDeposits(s.id) + (parseFloat(s.openingBalance) || 0);
  const wds  = DB.getWithdrawals(s.id);
  const bal  = DB.getBalance(s.id);
  countUp(document.getElementById('bc-deps'), deps, 600);
  countUp(document.getElementById('bc-wds'),  wds,  600);
  countUp(document.getElementById('bc-bal'),  bal,  700);
  document.getElementById('bc-bal').style.color = bal < 50 ? 'var(--red)' : 'var(--navy)';

  const qrBox = document.getElementById('student-qr-box');
  qrBox.innerHTML = '';
  try {
    new QRCode(qrBox, { text: s.accountNumber, width: 74, height: 74, colorDark: '#1A3A5C', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
  } catch (e) {
    qrBox.innerHTML = `<div style="font-size:.55rem;padding:4px;word-break:break-all;text-align:center;">${esc(s.accountNumber)}</div>`;
  }

  const detailView = document.getElementById('view-student-detail');
  if (detailView._scrollHandler) detailView.removeEventListener('scroll', detailView._scrollHandler);
  detailView._scrollHandler = function () {
    const sdh = document.querySelector('.sdh');
    if (sdh) sdh.classList.toggle('compact', detailView.scrollTop > 60);
  };
  detailView.addEventListener('scroll', detailView._scrollHandler, { passive: true });

  const txns      = STATE.transactions.filter(t => t.studentId === s.id).sort((a, b) => toMs(b) - toMs(a));
  const txnChip   = document.getElementById('txn-chip');
  txnChip.textContent = txns.length + ' txns';
  animateChip(txnChip);
  const hint = document.getElementById('del-hint');
  if (hint) hint.style.display = txns.length ? 'block' : 'none';

  const isManager = STATE.teacher?.role === 'manager';
  const list      = document.getElementById('student-txn-list');
  list.innerHTML  = txns.length
    ? txns.map(t => {
        const delBtn     = isManager ? `<button class="txn-del-btn" onclick="event.stopPropagation();openDeleteTxn('${t.id}')">🗑 Delete</button>` : '';
        const receiptBtn = `<button class="txn-receipt-btn" onclick="event.stopPropagation();openTxnReceipt('${t.id}')">🧾 Receipt</button>`;
        return `<div class="txn-item-wrap" onclick="toggleTxnDel(this)"><div class="txn-item">${txnInner(t, false)}</div>${receiptBtn}${delBtn}</div>`;
      }).join('')
    : `<div class="empty-state"><div class="empty-icon">💳</div><div class="empty-title">No Transactions</div><div class="empty-sub">Record the first deposit or withdrawal</div></div>`;
  list.querySelectorAll('.txn-item').forEach((item, i) => {
    item.style.animationDelay = Math.min(i * 40, 280) + 'ms';
    item.classList.add('stagger-item');
  });
}

function toggleTxnDel(el) {
  const wasActive = el.classList.contains('del-active');
  document.querySelectorAll('.txn-item-wrap.del-active').forEach(w => w.classList.remove('del-active'));
  if (!wasActive) el.classList.add('del-active');
}

function downloadQR() {
  const canvas = document.querySelector('#student-qr-box canvas');
  const img    = document.querySelector('#student-qr-box img');
  const s      = DB.getStudentById(currentStudentId);
  if (!s) return;
  const url = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = `QR_${s.accountNumber}_${s.name.replace(/\s+/g, '_')}.png`;
  a.click();
  showToast('QR downloaded!', 'success');
}

// ── Edit / Delete student ────────────────────────────────────────
function openEditStudent() {
  const s = DB.getStudentById(currentStudentId);
  if (!s) return;
  document.getElementById('edit-name').value         = s.name;
  document.getElementById('edit-account').value      = s.accountNumber;
  document.getElementById('edit-roll').value         = s.rollNumber || '';
  document.getElementById('edit-class').value        = s.class || '';
  document.getElementById('edit-balance').value      = s.openingBalance || 0;
  document.getElementById('edit-phone').value        = s.parentPhone || '';
  document.getElementById('edit-student-pin').value  = '';
  document.getElementById('edit-savings-goal').value = s.savingsGoal || '';
  document.getElementById('edit-modal').classList.add('active');
}

async function saveEditStudent() {
  const name       = document.getElementById('edit-name').value.trim();
  if (!name) { showToast('Name cannot be empty', 'error'); return; }
  const balance    = parseFloat(document.getElementById('edit-balance').value) || 0;
  if (balance < 0) { showToast('Opening balance cannot be negative', 'error'); return; }
  const pinRaw     = document.getElementById('edit-student-pin').value.trim();
  const goal       = parseFloat(document.getElementById('edit-savings-goal').value) || 0;
  const s          = DB.getStudentById(currentStudentId);
  const phoneRaw   = document.getElementById('edit-phone').value.trim();
  const editPhone  = phoneRaw.replace(/\D/g, '');
  if (phoneRaw && (editPhone.length < 10 || editPhone.length > 15)) { showToast('Phone number must be 10–15 digits', 'error'); return; }

  const changes = {
    name,
    class:         document.getElementById('edit-class').value.trim().toUpperCase(),
    rollNumber:    document.getElementById('edit-roll').value.trim(),
    openingBalance: balance,
    parentPhone:   editPhone || '',
    savingsGoal:   goal,
  };
  if (pinRaw) {
    if (!/^\d{4}$/.test(pinRaw)) { showToast('PIN must be exactly 4 digits', 'error'); return; }
    changes.studentPinHash = await sha256(pinRaw + s.accountNumber);
  }
  try {
    await DB.updateStudent(currentStudentId, changes);
    closeModal('edit-modal');
    showToast('Student updated!', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

function openDeleteConfirm() { document.getElementById('delete-modal').classList.add('active'); }

async function confirmDelete() {
  const btn = document.querySelector('#delete-modal .btn-danger');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';
  try {
    await DB.deleteStudent(currentStudentId);
    closeModal('delete-modal');
    showToast('Student deleted', '');
    viewHistory = viewHistory.filter(v => v !== 'student-detail');
    navigateTo('students', null, false);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    btn.disabled    = false;
    btn.textContent = 'Delete';
  }
}

// ── Transfer class ────────────────────────────────────────────────
function openTransferModal() {
  const s = DB.getStudentById(currentStudentId);
  if (!s) return;
  document.getElementById('transfer-class').value = s.class || '';
  document.getElementById('transfer-modal').classList.add('active');
}
async function confirmTransfer() {
  const newClass = document.getElementById('transfer-class').value.trim().toUpperCase();
  if (!newClass) { showToast('Enter a class name', 'error'); return; }
  const s = DB.getStudentById(currentStudentId);
  if (!s) return;
  if (newClass === s.class) { showToast('Student is already in this class', 'warn'); return; }
  try {
    await DB.updateStudent(currentStudentId, {
      class: newClass,
      transferredFrom: s.class || '',
      transferredAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    closeModal('transfer-modal');
    showToast(`Transferred to Class ${newClass}!`, 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

// ── KYC ───────────────────────────────────────────────────────────
let _kycPhotoDataUrl = null;

function openKycModal() {
  const s = DB.getStudentById(currentStudentId);
  if (!s) return;
  _kycPhotoDataUrl = null;
  document.getElementById('kyc-student-name-lbl').textContent = s.name;
  document.getElementById('kyc-student-acc-lbl').textContent  = 'A/C: ' + s.accountNumber;
  const statusEl = document.getElementById('kyc-current-status');
  if (s.kycVerified) {
    statusEl.innerHTML = `<span class="kyc-badge verified">✅ Verified</span> <span style="font-size:.7rem;color:var(--muted);">by ${esc(s.kycVerifiedBy || 'teacher')} · ${fmtDate(s.kycVerifiedAt?.toDate?.() || s.kycVerifiedAt || '')}</span>`;
  } else {
    statusEl.innerHTML = '<span class="kyc-badge unverified">⚠️ Not yet verified</span>';
  }
  document.getElementById('kyc-unverify-btn').style.display = s.kycVerified ? 'block' : 'none';
  const circle = document.getElementById('kyc-photo-circle');
  circle.innerHTML = s.photo ? `<img src="${s.photo}" alt="">` : `<span style="font-size:1.5rem">👤</span>`;
  document.getElementById('kyc-photo-preview-wrap').style.display = 'none';
  document.getElementById('kyc-photo-input').value    = '';
  document.getElementById('kyc-gallery-input').value  = '';
  document.getElementById('kyc-modal').classList.add('active');
}

function handleKycPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Select an image file', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 400;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h = h * (MAX / w); w = MAX; } }
      else        { if (h > MAX) { w = w * (MAX / h); h = MAX; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      _kycPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      document.getElementById('kyc-photo-preview-img').src = _kycPhotoDataUrl;
      document.getElementById('kyc-photo-preview-wrap').style.display = 'block';
      document.getElementById('kyc-photo-circle').innerHTML =
        `<img src="${_kycPhotoDataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

async function confirmKycVerify() {
  const s = DB.getStudentById(currentStudentId);
  if (!s) return;
  const btn = document.getElementById('kyc-verify-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Verifying…';
  try {
    const updates = {
      kycVerified:     true,
      kycVerifiedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      kycVerifiedBy:   STATE.teacher.name,
      kycVerifiedById: STATE.user.uid,
    };
    if (_kycPhotoDataUrl) updates.photo = _kycPhotoDataUrl;
    await DB.updateStudent(currentStudentId, updates);
    closeModal('kyc-modal');
    showToast('KYC verified! ✅', 'success');
    if (currentView === 'id-card') renderIDCard();
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '✅ Mark as Verified'; }
}

async function confirmKycUnverify() {
  if (!confirm('Remove KYC verification for this student?')) return;
  try {
    await DB.updateStudent(currentStudentId, { kycVerified: false, kycVerifiedAt: null, kycVerifiedBy: null });
    closeModal('kyc-modal');
    showToast('KYC removed', 'warn');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════
// TRANSACTION HTML BUILDERS
// ═══════════════════════════════════════════

function txnInner(t, showName) {
  const isD  = t.type === 'deposit';
  const by   = t.createdByName ? `· ${esc(t.createdByName)}` : '';
  const cat  = t.category && t.category !== 'savings'
    ? `<span class="txn-cat-badge ${esc(t.category)}">${esc(CAT_LABELS[t.category] || t.category)}</span>` : '';
  const icon = isD
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
  return `<div class="txn-dot ${t.type}">${icon}</div><div class="txn-details">${showName ? `<div class="txn-student">${esc(t.studentName || '')} · ${esc(t.accountNumber || '')}</div>` : ''}<div class="txn-type" style="color:${isD ? 'var(--green)' : 'var(--red)'}">${isD ? 'Deposit' : 'Withdrawal'}${cat}</div><div class="txn-note">${esc(t.note || 'No note')}</div><div class="txn-meta">${fmtDate(t.date)}${t.time ? ' · ' + t.time : ''} ${by}</div></div><div class="txn-amount"><div class="txn-amt ${t.type}">${isD ? '+' : '-'}${fmt(t.amount)}</div></div>`;
}
function txnHTML(t, showName) { return `<div class="txn-item">${txnInner(t, showName)}</div>`; }

// ═══════════════════════════════════════════
// DAILY LOG
// ═══════════════════════════════════════════

function setTodayDate() { document.getElementById('daily-date').value = today(); renderDailyLog(); }

function renderDailyLog() {
  const date  = document.getElementById('daily-date').value || today();
  const txns  = STATE.transactions.filter(t => t.date === date).sort((a, b) => toMs(b) - toMs(a));
  const deps  = txns.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
  const wds   = txns.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0);
  document.getElementById('dl-count').textContent = txns.length;
  document.getElementById('dl-deps').textContent  = fmt(deps);
  document.getElementById('dl-wds').textContent   = fmt(wds);
  const net   = deps - wds;
  const netEl = document.getElementById('dl-net');
  netEl.textContent = (net >= 0 ? '+' : '') + fmt(net);
  netEl.style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
  const el = document.getElementById('daily-txn-list');
  el.innerHTML = txns.length
    ? txns.map(t => txnHTML(t, true)).join('')
    : `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No Transactions</div><div class="empty-sub">No transactions recorded for this date</div></div>`;
}

// ═══════════════════════════════════════════
// PASSBOOK & RECEIPT
// ═══════════════════════════════════════════

function openPassbook() {
  const s    = DB.getStudentById(currentStudentId);
  if (!s) return;
  const txns = [...STATE.transactions.filter(t => t.studentId === s.id)].sort((a, b) => toMs(a) - toMs(b));
  const bal  = DB.getBalance(s.id);
  const deps = DB.getDeposits(s.id) + (parseFloat(s.openingBalance) || 0);
  const wds  = DB.getWithdrawals(s.id);
  let running = parseFloat(s.openingBalance) || 0;
  const rows = txns.map(t => {
    running += t.type === 'deposit' ? t.amount : -t.amount;
    return `<tr><td>${fmtDate(t.date)}</td><td>${esc(t.note || '—')}</td><td class="${t.type === 'deposit' ? 'd' : ''}">${t.type === 'deposit' ? '+' + fmt(t.amount) : ''}</td><td class="${t.type === 'withdrawal' ? 'w' : ''}">${t.type === 'withdrawal' ? '-' + fmt(t.amount) : ''}</td><td style="font-weight:600">${fmt(running)}</td></tr>`;
  }).join('');
  document.getElementById('passbook-content').innerHTML =
    `<div class="pb-header"><div class="pb-av">${initials(s.name)}</div><div><div class="pb-name">${esc(s.name)}</div><div class="pb-meta">A/C: ${esc(s.accountNumber)} &nbsp;·&nbsp; Class ${esc(s.class || '—')} &nbsp;·&nbsp; Roll ${esc(s.rollNumber || '—')}</div></div></div>` +
    `<div class="pb-balrow"><div class="pb-bal-item"><div class="pb-bal-val">${fmt(deps)}</div><div class="pb-bal-lbl">Total Credit</div></div><div class="pb-bal-item"><div class="pb-bal-val">${fmt(wds)}</div><div class="pb-bal-lbl">Withdrawn</div></div><div class="pb-bal-item"><div class="pb-bal-val">${fmt(bal)}</div><div class="pb-bal-lbl">Balance</div></div></div>` +
    `<div style="padding:10px 4px 0;"><table class="pb-txn-table"><thead><tr><th>Date</th><th>Note</th><th>Deposit</th><th>Withdraw</th><th>Balance</th></tr></thead><tbody><tr style="background:var(--cream)"><td colspan="4" style="font-size:.72rem;color:var(--muted)">Opening Balance</td><td style="font-weight:600">${fmt(parseFloat(s.openingBalance) || 0)}</td></tr>${rows || '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--muted)">No transactions yet</td></tr>'}</tbody></table></div>` +
    `<div style="padding:10px 12px 4px;font-size:.68rem;color:var(--muted);text-align:right;">${esc(STATE.schoolName)} · Printed ${new Date().toLocaleDateString('en-IN')}</div>`;
  document.getElementById('passbook-modal').classList.add('active');
}

function printPassbook() {
  const content = document.getElementById('passbook-content').innerHTML;
  document.getElementById('print-area').innerHTML =
    `<div style="padding:16px;font-family:sans-serif;max-width:600px;margin:0 auto;"><div style="text-align:center;margin-bottom:14px;"><div style="font-size:1.4rem;font-weight:700;color:#1A3A5C">${esc(STATE.schoolName)}</div><div style="font-size:.75rem;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:.06em">Student Savings Bank — Passbook</div></div>${content}</div>`;
  document.getElementById('print-area').style.display = 'block';
  window.print();
  document.getElementById('print-area').style.display = 'none';
}

function openTxnReceipt(txnId) {
  const t      = STATE.transactions.find(x => x.id === txnId);
  if (!t) return;
  const s      = DB.getStudentById(t.studentId);
  const balAfter = s ? DB.getBalance(s.id) : null;
  const isD    = t.type === 'deposit';
  const rcptNo = 'RCP' + t.id.toUpperCase().slice(-8);
  document.getElementById('receipt-content').innerHTML =
    `<div class="receipt-header"><div class="receipt-school">${esc(STATE.schoolName)}</div><div class="receipt-sub">Student Savings Bank · Transaction Receipt</div><div><span class="receipt-type-badge ${t.type}">${isD ? '⬆️ DEPOSIT' : '⬇️ WITHDRAWAL'}</span></div><div class="receipt-amount">${isD ? '+' : '-'}${fmt(t.amount)}</div></div>` +
    `<div class="receipt-body"><div class="receipt-row"><span class="receipt-row-label">Receipt No.</span><span class="receipt-row-val" style="font-family:monospace;font-size:.78rem;">${rcptNo}</span></div><div class="receipt-row"><span class="receipt-row-label">Student Name</span><span class="receipt-row-val">${esc(t.studentName || s?.name || '—')}</span></div><div class="receipt-row"><span class="receipt-row-label">Account No.</span><span class="receipt-row-val" style="font-family:monospace">${esc(t.accountNumber || s?.accountNumber || '—')}</span></div><div class="receipt-row"><span class="receipt-row-label">Class / Roll</span><span class="receipt-row-val">Class ${esc(t.class || s?.class || '—')} / Roll ${esc(s?.rollNumber || '—')}</span></div><div class="receipt-row"><span class="receipt-row-label">Date</span><span class="receipt-row-val">${fmtDate(t.date)}${t.time ? ' · ' + t.time : ''}</span></div><div class="receipt-row"><span class="receipt-row-label">Note</span><span class="receipt-row-val">${esc(t.note || '—')}</span></div><div class="receipt-row"><span class="receipt-row-label">Recorded By</span><span class="receipt-row-val">${esc(t.createdByName || STATE.teacher?.name || '—')}</span></div>${balAfter !== null ? `<div class="receipt-row" style="background:${isD ? 'var(--green-l)' : 'var(--red-l)'};border-radius:8px;padding:9px 11px;margin-top:6px;border:none;"><span class="receipt-row-label" style="font-weight:700;color:var(--navy);">Balance After</span><span class="receipt-row-val" style="font-size:1.1rem;color:var(--navy);">${fmt(balAfter)}</span></div>` : ''}</div>` +
    `<div class="receipt-footer">${esc(STATE.schoolName)} &nbsp;·&nbsp; School Code: ${esc(STATE.schoolCode || '')} &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}<br>This is a computer-generated receipt.</div>`;
  document.getElementById('receipt-modal').classList.add('active');
}

function printTxnReceipt() {
  const content = document.getElementById('receipt-content').innerHTML;
  document.getElementById('print-area').innerHTML = `<div style="padding:20px;font-family:sans-serif;max-width:400px;margin:0 auto;">${content}</div>`;
  document.getElementById('print-area').style.display = 'block';
  window.print();
  document.getElementById('print-area').style.display = 'none';
}

// ═══════════════════════════════════════════
// IMPORT / EXPORT
// ═══════════════════════════════════════════

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) { showToast('Only .xlsx, .xls, .csv files are supported', 'error'); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    let rows = [];
    try {
      if (ext === 'csv') { rows = parseCSV(e.target.result); }
      else { const data = new Uint8Array(e.target.result); const wb = XLSX.read(data, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; rows = XLSX.utils.sheet_to_json(ws, { defval: '' }); }
    } catch (err) { showToast('Error reading file: ' + err.message, 'error'); return; }
    if (!rows || !rows.length) { showToast('No data found in file', 'error'); return; }
    if (rows.length > 1000) { if (!confirm(`This file has ${rows.length} rows. Large imports may take time. Continue?`)) return; }
    showImportPreview(rows);
  };
  if (ext === 'csv') reader.readAsText(file); else reader.readAsArrayBuffer(file);
  event.target.value = '';
}

function parseCSV(text) {
  const lines   = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj  = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  });
}

function normalizeRow(row) {
  const keys = Object.keys(row).map(k => k.toLowerCase().replace(/[\s_]/g, ''));
  const vals = Object.values(row);
  const get  = (...pats) => {
    for (const p of pats) {
      const i = keys.findIndex(k => k === p || k.startsWith(p + 'n') || k === p + 'no' || k === p + 'number' || k.startsWith(p));
      if (i !== -1) return String(vals[i] || '').trim();
    }
    return '';
  };
  return {
    accountNumber:  get('account', 'acc'),
    name:           get('studentname', 'name', 'student', 'pupil', 'fullname'),
    class:          get('class', 'grade', 'std', 'section'),
    rollNumber:     get('roll', 'rno', 'rollno'),
    openingBalance: parseFloat(get('openingbalance', 'balance', 'amount', 'opening')) || 0,
  };
}

let importPreviewRows = [];
function showImportPreview(rows) {
  importPreviewRows = rows;
  const norm     = rows.slice(0, 5).map(normalizeRow);
  const dupCount = rows.map(normalizeRow).filter(r => r.accountNumber && DB.getStudentByAcc(r.accountNumber.toUpperCase())).length;
  document.getElementById('import-preview-section').innerHTML =
    `<div class="import-preview"><div class="preview-title">📋 Preview — ${rows.length} students found${dupCount ? ` (${dupCount} duplicates will be skipped)` : ''}</div><div class="preview-table"><table><thead><tr><th>Account</th><th>Name</th><th>Class</th><th>Roll</th><th>Balance</th></tr></thead><tbody>${norm.map(r => `<tr><td>${esc(r.accountNumber)}</td><td>${esc(r.name)}</td><td>${esc(r.class)}</td><td>${esc(r.rollNumber)}</td><td>${fmt(r.openingBalance)}</td></tr>`).join('')}${rows.length > 5 ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);font-style:italic;padding:9px;">…and ${rows.length - 5} more rows</td></tr>` : ''}</tbody></table></div></div>` +
    `<div class="form-section" style="padding-top:0"><button class="btn-primary" id="import-confirm-btn" onclick="confirmImport()">✅ Import ${rows.length} Students</button><div style="height:8px"></div><button class="btn-secondary" onclick="cancelImport()">Cancel</button></div>`;
}

async function confirmImport() {
  if (!importPreviewRows.length) return;
  const btn = document.getElementById('import-confirm-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Importing…';
  let added = 0, skipped = 0;
  const toAdd = [];
  importPreviewRows.forEach(row => {
    const r = normalizeRow(row);
    if (!r.name && !r.accountNumber) { skipped++; return; }
    if (!r.accountNumber) r.accountNumber = 'SB' + Date.now().toString(36).toUpperCase().slice(-5);
    r.accountNumber = r.accountNumber.toUpperCase();
    if (DB.getStudentByAcc(r.accountNumber)) { skipped++; return; }
    toAdd.push({ ...r, id: uuid(), timestamp: Date.now(), createdBy: STATE.user.uid, createdByName: STATE.teacher.name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    added++;
  });
  try {
    await batchChunked(toAdd, (b, s) => b.set(studentsRef().doc(s.id), s));
    importPreviewRows = [];
    document.getElementById('import-preview-section').innerHTML = '';
    showToast(`Imported ${added} students${skipped ? ', skipped ' + skipped + ' duplicates' : ''}!`, 'success');
  } catch (err) {
    showToast('Import error: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = `✅ Import ${importPreviewRows.length} Students`;
  }
}

function cancelImport() { importPreviewRows = []; document.getElementById('import-preview-section').innerHTML = ''; }

function exportFullExcel() {
  const wb = XLSX.utils.book_new(), students = STATE.students, txns = STATE.transactions;
  const sRows = students.map(s => ({ 'Account': s.accountNumber, 'Name': s.name, 'Class': s.class || '', 'Roll': s.rollNumber || '', 'Parent Phone': s.parentPhone || '', 'Opening Bal': s.openingBalance || 0, 'Total Deposits': DB.getDeposits(s.id), 'Total Withdrawals': DB.getWithdrawals(s.id), 'Current Balance': DB.getBalance(s.id) }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sRows.length ? sRows : [{ Message: 'No students' }]), 'Students');
  const tRows = [...txns].sort((a, b) => toMs(b) - toMs(a)).map(t => ({ 'Date': t.date, 'Time': t.time || '', 'Student': t.studentName, 'Account': t.accountNumber, 'Class': t.class || '', 'Type': t.type, 'Amount': t.amount, 'Note': t.note || '', 'Recorded By': t.createdByName || '' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tRows.length ? tRows : [{ Message: 'No transactions' }]), 'Transactions');
  const openBals = students.reduce((a, s) => a + (parseFloat(s.openingBalance) || 0), 0);
  const td = txns.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
  const tw = txns.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Item': 'School', 'Value': STATE.schoolName }, { 'Item': 'Total Students', 'Value': students.length }, { 'Item': 'Opening Balances', 'Value': openBals }, { 'Item': 'Total Deposits', 'Value': td }, { 'Item': 'Total Withdrawals', 'Value': tw }, { 'Item': 'Net Bank Balance', 'Value': openBals + td - tw }, { 'Item': 'Export Date', 'Value': new Date().toLocaleDateString('en-IN') }]), 'Summary');
  XLSX.writeFile(wb, `StudentBank_${STATE.schoolCode}_${today()}.xlsx`);
  showToast('Excel report exported!', 'success');
}
function exportStudentList() { const rows = STATE.students.map(s => ({ 'Account': s.accountNumber, 'Name': s.name, 'Class': s.class || '', 'Roll': s.rollNumber || '', 'Parent Phone': s.parentPhone || '', 'Opening Balance': s.openingBalance || 0, 'Total Deposits': DB.getDeposits(s.id), 'Total Withdrawals': DB.getWithdrawals(s.id), 'Current Balance': DB.getBalance(s.id) })); dlCSV(rows, `Students_${today()}.csv`); showToast('Student list exported!', 'success'); }
function exportTodayLog() { const txns = STATE.transactions.filter(t => t.date === today()); if (!txns.length) { showToast('No transactions today', 'warn'); return; } dlCSV(txns.map(t => ({ 'Time': t.time || '', 'Student': t.studentName, 'Account': t.accountNumber, 'Type': t.type, 'Amount': t.amount, 'Note': t.note || '', 'By': t.createdByName || '' })), `DailyLog_${today()}.csv`); showToast("Today's log exported!", 'success'); }
function exportAllTxns() { if (!STATE.transactions.length) { showToast('No transactions to export', 'warn'); return; } dlCSV([...STATE.transactions].sort((a, b) => toMs(b) - toMs(a)).map(t => ({ 'Date': t.date, 'Time': t.time || '', 'Student': t.studentName, 'Account': t.accountNumber, 'Class': t.class || '', 'Type': t.type, 'Amount': t.amount, 'Note': t.note || '', 'By': t.createdByName || '' })), `AllTxns_${today()}.csv`); showToast('All transactions exported!', 'success'); }
function dlCSV(rows, filename) { if (!rows.length) return; const h = Object.keys(rows[0]); const csv = [h.join(','), ...rows.map(r => h.map(k => `"${(r[k] || '').toString().replace(/"/g, '""')}"`).join(','))].join('\n'); const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }

// ═══════════════════════════════════════════
// SCANNER
// ═══════════════════════════════════════════

let videoStream = null, scanning = false, lastScan = '', scanLastFrameTime = 0;
const SCAN_FPS = 15, SCAN_INTERVAL = 1000 / SCAN_FPS;

async function startScanner() {
  const video    = document.getElementById('qr-video');
  const canvas   = document.getElementById('qr-canvas');
  const status   = document.getElementById('scanner-status');
  const noCam    = document.getElementById('scan-no-cam');
  const noCamMsg = document.getElementById('scan-no-cam-msg');
  lastScan = ''; scanning = false; scanLastFrameTime = 0;
  if (videoStream) stopScanner();
  if (noCam) noCam.style.display = 'none';
  if (!video) return;
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } });
    video.srcObject = videoStream;
    await video.play();
    scanning = true;
    if (status) status.textContent = '📷 Camera active — hold QR code steady';
    function tick(ts) {
      if (!scanning) return;
      if (ts - scanLastFrameTime < SCAN_INTERVAL) { requestAnimationFrame(tick); return; }
      scanLastFrameTime = ts;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) { requestAnimationFrame(tick); return; }
        const sz = Math.min(vw, vh);
        canvas.width = sz; canvas.height = sz;
        canvas.getContext('2d').drawImage(video, (vw - sz) / 2, (vh - sz) / 2, sz, sz, 0, 0, sz, sz);
        const code = jsQR(canvas.getContext('2d').getImageData(0, 0, sz, sz).data, sz, sz, { inversionAttempts: 'dontInvert' });
        if (code && code.data && code.data !== lastScan) { lastScan = code.data; if (navigator.vibrate) navigator.vibrate([80, 40, 80]); handleQR(code.data); return; }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  } catch (err) {
    if (status) status.textContent = '⚠️ Camera unavailable — search below';
    if (noCam && noCamMsg) { noCamMsg.textContent = err.name === 'NotAllowedError' ? 'Camera permission denied — please allow in browser settings' : 'Camera not available on this device'; noCam.style.display = 'flex'; }
  }
}
function stopScanner() { scanning = false; if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; } const v = document.getElementById('qr-video'); if (v) { v.pause(); v.srcObject = null; } lastScan = ''; scanLastFrameTime = 0; }
function handleQR(data) { const s = DB.getStudentByAcc(data) || STATE.students.find(s => s.id === data); if (s) { currentStudentId = s.id; stopScanner(); navigateTo('student-detail', s.id); showToast('Found: ' + s.name, 'success'); } else { showToast('Unknown QR code — not found', 'error'); setTimeout(() => { lastScan = ''; }, 2000); } }
function renderScannerSearch() {
  const q = document.getElementById('scanner-search').value.toLowerCase().trim();
  const el = document.getElementById('scanner-results');
  if (!q) { el.innerHTML = ''; return; }
  const found = STATE.students.filter(s => s.name.toLowerCase().includes(q) || s.accountNumber.toLowerCase().includes(q)).slice(0, 6);
  if (!found.length) { el.innerHTML = '<div style="font-size:.78rem;color:var(--muted);text-align:center;padding:11px;">No students found</div>'; return; }
  el.innerHTML = found.map(s => `<div class="student-card" style="margin-bottom:8px;" onclick="stopScanner();navigateTo('student-detail','${s.id}')"><div class="s-avatar">${initials(s.name)}</div><div class="s-info"><div class="s-name">${esc(s.name)}</div><div class="s-meta">A/C: ${esc(s.accountNumber)} · Class ${esc(s.class || '—')}</div></div><div class="s-bal"><div class="s-bal-val">${fmt(DB.getBalance(s.id))}</div></div></div>`).join('');
}

// ═══════════════════════════════════════════
// TEACHERS PANEL
// ═══════════════════════════════════════════

function renderTeachers() {
  const isManager = STATE.teacher.role === 'manager';
  const scEl = document.getElementById('display-school-code');
  if (scEl) scEl.textContent = STATE.schoolCode || '';
  const icEl = document.getElementById('display-invite-code');
  if (icEl) {
    const ic = (STATE.schoolData.inviteCode || '').toString().trim();
    icEl.textContent = ic || 'NOT SET';
    icEl.style.color = ic ? '' : 'var(--red-l,#fca5a5)';
  }
  const regenBtn = document.getElementById('regen-btn');
  if (regenBtn) regenBtn.style.display = isManager ? 'inline-flex' : 'none';
  renderTeachersUI();
}

function renderTeachersUI() {
  const chip      = document.getElementById('teacher-count-chip');
  const allActive = STATE.teachers.filter(t => t.status !== 'removed');
  // Deduplicate by email — keep manager role, then the record matching current uid
  const emailMap  = new Map();
  allActive.forEach(t => {
    const key = (t.email || t.id).toLowerCase();
    if (!emailMap.has(key)) { emailMap.set(key, t); }
    else {
      const existing = emailMap.get(key);
      if (t.role === 'manager' && existing.role !== 'manager') emailMap.set(key, t);
      else if (t.id === STATE.user.uid) emailMap.set(key, t);
    }
  });
  const active = [...emailMap.values()];
  if (chip) { chip.textContent = active.length + ' teacher' + (active.length !== 1 ? 's' : ''); animateChip(chip); }
  const list      = document.getElementById('active-teachers-list');
  if (!list) return;
  const isManager = STATE.teacher.role === 'manager';
  const sorted    = [...active].sort((a, b) => a.role === 'manager' ? -1 : b.role === 'manager' ? 1 : a.name.localeCompare(b.name));
  if (!sorted.length) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">👩‍🏫</div><div class="empty-title">No teachers yet</div><div class="empty-sub">Share the School Code and Invite Code with your colleagues.</div></div>`; return; }
  list.innerHTML = sorted.map(t => {
    const isMe      = t.id === STATE.user.uid;
    const isTMgr    = t.role === 'manager';
    const actionBtns = isManager && !isMe
      ? `<div class="t-actions">${!isTMgr ? `<button class="t-action-btn transfer" onclick="openTransferManagerModal('${t.id}','${esc(t.name)}')">👑 Promote</button>` : ''}<button class="t-action-btn pin" onclick="managerResetTeacherPin('${t.id}','${esc(t.name)}')">🔒 Reset PIN</button><button class="t-action-btn reject" onclick="removeTeacher('${t.id}','${esc(t.name)}')">✕ Remove</button></div>` : '';
    return `<div class="teacher-card"><div class="t-card-top"><div class="t-avatar" style="background:linear-gradient(135deg,${isTMgr ? 'var(--gold),var(--gold-l)' : 'var(--navy),var(--navy-l)'})">${initials(t.name)}</div><div class="t-info"><div class="t-name">${esc(t.name)}</div><div class="t-email">${esc(t.email || '')}</div><div class="t-badges"><span class="badge ${isTMgr ? 'admin' : 'staff'}">${isTMgr ? '👑 Manager' : 'Teacher'}</span>${isMe ? '<span class="badge you">You</span>' : ''}</div></div></div>${actionBtns}</div>`;
  }).join('');
  checkForDuplicateTeachers();
}

function copyJoinDetails() {
  const sc   = (document.getElementById('display-school-code') || {}).textContent || STATE.schoolCode;
  const ic   = (document.getElementById('display-invite-code') || {}).textContent || '';
  const text = `Join ${STATE.schoolName} on Student Bank:\nSchool Code: ${sc}\nInvite Code: ${ic}`;
  navigator.clipboard.writeText(text)
    .then(() => showToast('Codes copied!', 'success'))
    .catch(() => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('Codes copied!', 'success'); });
}
function shareJoinDetails() {
  const sc   = (document.getElementById('display-school-code') || {}).textContent || STATE.schoolCode;
  const ic   = (document.getElementById('display-invite-code') || {}).textContent || '';
  const text = `Join *${STATE.schoolName}* on Student Bank App 📚\n\nSchool Code: *${sc}*\nInvite Code: *${ic}*\n\nDownload the app and tap "Join as Teacher" to get started.`;
  if (navigator.share) { navigator.share({ title: 'Join ' + STATE.schoolName, text }).catch(() => {}); }
  else { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }
}
async function regenInviteCode() {
  const icEl       = document.getElementById('display-invite-code');
  const isFirstTime = icEl && icEl.textContent === 'NOT SET';
  if (!confirm(isFirstTime ? 'Set an invite code for this school?' : 'Generate a new invite code? The current one will stop working immediately.')) return;
  const btn = document.getElementById('regen-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const newCode = genCode(8);
    await db.collection('schools').doc(STATE.schoolCode).update({ inviteCode: newCode, inviteUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(), inviteUpdatedBy: STATE.user.uid });
    if (icEl) { icEl.textContent = newCode; icEl.style.color = ''; }
    showToast(isFirstTime ? 'Invite code set!' : 'New invite code generated!', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = '🔄 New Invite Code'; }
}

async function removeTeacher(uid, name) {
  if (!confirm(`Remove ${name} from this school?\nThey will lose access immediately.`)) return;
  try {
    const tDoc  = await teachersRef().doc(uid).get();
    const email = tDoc.exists ? tDoc.data().email : null;
    const batch = db.batch();
    batch.update(teachersRef().doc(uid), { status: 'removed', removedAt: firebase.firestore.FieldValue.serverTimestamp(), removedBy: STATE.user.uid });
    if (email) {
      const dupsSnap = await teachersRef().where('email', '==', email).get();
      dupsSnap.docs.forEach(d => { if (d.id !== uid) batch.delete(d.ref); });
    }
    await batch.commit();
    showToast(name + ' removed from school', 'warn');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

function checkForDuplicateTeachers() {
  const cleanBtn  = document.getElementById('clean-dupes-btn');
  if (!cleanBtn) return;
  const isManager = STATE.teacher?.role === 'manager';
  if (!isManager) { cleanBtn.style.display = 'none'; return; }
  const active = STATE.teachers.filter(t => t.status !== 'removed');
  const emails = active.map(t => (t.email || t.id).toLowerCase());
  cleanBtn.style.display = emails.length !== new Set(emails).size ? 'inline-block' : 'none';
}

async function cleanDuplicateTeachers() {
  if (STATE.teacher?.role !== 'manager') { showToast('Only manager can clean duplicates', 'error'); return; }
  if (!confirm('This will remove all duplicate teacher entries (keeping one per email). Continue?')) return;
  const btn = document.getElementById('clean-dupes-btn');
  btn.disabled = true; btn.textContent = '🧹 Cleaning…';
  try {
    const active   = STATE.teachers.filter(t => t.status !== 'removed');
    const emailMap = new Map();
    active.forEach(t => { const key = (t.email || t.id).toLowerCase(); if (!emailMap.has(key)) emailMap.set(key, []); emailMap.get(key).push(t); });
    const batch = db.batch();
    let deleted = 0;
    emailMap.forEach(docs => {
      if (docs.length <= 1) return;
      docs.sort((a, b) => { if (a.role === 'manager') return -1; if (b.role === 'manager') return 1; if (a.id === STATE.user.uid) return -1; if (b.id === STATE.user.uid) return 1; return 0; });
      docs.slice(1).forEach(d => { batch.delete(teachersRef().doc(d.id)); deleted++; });
    });
    if (deleted === 0) { showToast('No duplicates found!', 'success'); btn.disabled = false; btn.textContent = '🧹 Fix Duplicates'; return; }
    await batch.commit();
    showToast(`Removed ${deleted} duplicate teacher record${deleted !== 1 ? 's' : ''}!`, 'success');
    btn.style.display = 'none';
  } catch (err) { showToast('Error: ' + err.message, 'error'); btn.disabled = false; btn.textContent = '🧹 Fix Duplicates'; }
}

let _transferManagerTargetId = null, _transferManagerTargetName = null;
function openTransferManagerModal(uid, name) {
  if (STATE.teacher?.role !== 'manager') { showToast('Only manager can transfer manager role', 'error'); return; }
  _transferManagerTargetId   = uid;
  _transferManagerTargetName = name;
  document.getElementById('transfer-mgr-target-name').textContent  = name;
  document.getElementById('transfer-mgr-confirm-input').value       = '';
  document.getElementById('transfer-mgr-modal').classList.add('active');
}
async function confirmTransferManager() {
  const confirmText = document.getElementById('transfer-mgr-confirm-input').value.trim();
  if (confirmText !== 'TRANSFER') { showToast('Type TRANSFER exactly to confirm', 'error'); return; }
  if (!_transferManagerTargetId) return;
  const btn = document.getElementById('transfer-mgr-confirm-btn');
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Transferring…';
  try {
    const batch = db.batch();
    batch.update(teachersRef().doc(_transferManagerTargetId), { role: 'manager', promotedAt: firebase.firestore.FieldValue.serverTimestamp(), promotedBy: STATE.user.uid, promotedByName: STATE.teacher.name });
    batch.update(db.collection('users').doc(_transferManagerTargetId), { role: 'manager' });
    batch.update(teachersRef().doc(STATE.user.uid), { role: 'teacher', demotedAt: firebase.firestore.FieldValue.serverTimestamp(), demotedReason: 'Manager role transferred to ' + _transferManagerTargetName });
    batch.update(db.collection('users').doc(STATE.user.uid), { role: 'teacher' });
    batch.update(db.collection('schools').doc(STATE.schoolCode), { managerUid: _transferManagerTargetId, managerTransferredAt: firebase.firestore.FieldValue.serverTimestamp(), managerTransferredFrom: STATE.user.uid });
    await batch.commit();
    STATE.teacher.role = 'teacher';
    closeModal('transfer-mgr-modal');
    showToast(`Manager role transferred to ${_transferManagerTargetName}. You are now a Teacher.`, 'success');
    renderTeachersUI(); renderSettings();
    const editRow = document.getElementById('edit-school-row'), dz = document.getElementById('danger-zone'), dl = document.getElementById('danger-label');
    if (editRow) editRow.style.display = 'none'; if (dz) dz.style.display = 'none'; if (dl) dl.style.display = 'none';
    _transferManagerTargetId = null; _transferManagerTargetName = null;
  } catch (err) { showToast('Error: ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = '👑 Yes, Transfer Manager Role'; }
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════

function renderSettings() {
  updatePinSettingsLabel();
  const sn = document.getElementById('settings-teacher-name'), si = document.getElementById('settings-teacher-info');
  const ssn = document.getElementById('settings-school-name'),   ssc = document.getElementById('settings-school-code');
  if (sn) sn.textContent  = STATE.teacher?.name || '';
  if (si) si.textContent  = `${STATE.schoolName || ''} · ${STATE.teacher?.role || 'teacher'}`;
  if (ssn) ssn.textContent = STATE.schoolName || '';
  if (ssc) ssc.textContent = `School Code: ${STATE.schoolCode || ''}`;
  const isManager  = STATE.teacher?.role === 'manager';
  const editRow    = document.getElementById('edit-school-row'), dz = document.getElementById('danger-zone'), dl = document.getElementById('danger-label');
  if (editRow) editRow.style.display = isManager ? 'flex'  : 'none';
  if (dz)      dz.style.display      = isManager ? 'block' : 'none';
  if (dl)      dl.style.display      = isManager ? 'block' : 'none';
}

function openEditSchoolName() { const inp = document.getElementById('edit-school-name-input'); if (inp) inp.value = STATE.schoolName || ''; document.getElementById('edit-school-modal').classList.add('active'); }
async function saveSchoolName() {
  const inp  = document.getElementById('edit-school-name-input');
  const name = inp ? inp.value.trim() : '';
  if (!name) { showToast('School name cannot be empty', 'error'); return; }
  try {
    await db.collection('schools').doc(STATE.schoolCode).update({ name });
    await userRef(STATE.user.uid).update({ schoolName: name });
    STATE.schoolName = name;
    document.getElementById('topbar-school').textContent          = name;
    document.getElementById('settings-school-name').textContent   = name;
    closeModal('edit-school-modal');
    showToast('School name updated!', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

function openResetConfirm() { document.getElementById('reset-modal').classList.add('active'); }
async function performReset() {
  if (STATE.teacher?.role !== 'manager') { showToast('Only manager can reset data', 'error'); return; }
  const btn = document.querySelector('#reset-modal .btn-danger');
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Resetting…';
  try {
    const [studSnap, txnSnap] = await Promise.all([studentsRef().get(), txnsRef().get()]);
    try { await auditDelete('bulk_reset', { studentCount: studSnap.size, transactionCount: txnSnap.size, deletionReason: 'Manager performed full data reset' }); } catch (e) {}
    await batchChunked(studSnap.docs, (b, d) => b.delete(d.ref));
    await batchChunked(txnSnap.docs,  (b, d) => b.delete(d.ref));
    closeModal('reset-modal'); showToast('All data cleared', 'warn'); navigateTo('dashboard');
  } catch (err) { showToast('Error: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Reset All'; }
}

// ── Backup reminder ───────────────────────────────────────────────
const BACKUP_KEY = 'sbm_last_backup_dismiss';
function checkBackupReminder() {
  const last      = parseInt(localStorage.getItem(BACKUP_KEY) || '0');
  const daysSince = (Date.now() - last) / (1000 * 60 * 60 * 24);
  if (new Date().getDay() === 5 && daysSince > 6) document.getElementById('backup-banner').classList.add('visible');
}
function dismissBackup() { localStorage.setItem(BACKUP_KEY, Date.now().toString()); document.getElementById('backup-banner').classList.remove('visible'); }

// ── Presets ───────────────────────────────────────────────────────
const PRESET_KEY = 'sbm_presets';
function getPresets()         { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[10,20,50,100]'); } catch (e) { return [10, 20, 50, 100]; } }
function renderPresetRow()    { const presets = getPresets(); const row = document.getElementById('preset-row'); if (!row) return; row.innerHTML = presets.map(v => `<button class="preset-btn" onclick="applyPreset(${v},this)">₹${v}</button>`).join(''); }
function applyPreset(val, btn){ document.getElementById('txn-amount').value = val; document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active-preset')); btn.classList.add('active-preset'); }
function clearActivePreset()  { document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active-preset')); }
function openPresetSettings() { document.getElementById('preset-input').value = getPresets().join(','); document.getElementById('preset-modal').classList.add('active'); }
function savePresets() {
  const raw  = document.getElementById('preset-input').value;
  const vals = raw.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v) && v > 0 && v <= 100000).slice(0, 5);
  if (!vals.length) { showToast('Enter at least one valid amount', 'error'); return; }
  localStorage.setItem(PRESET_KEY, JSON.stringify(vals));
  closeModal('preset-modal');
  document.getElementById('preset-settings-sub').textContent = '₹' + vals.join(' · ₹');
  showToast('Presets saved!', 'success');
}

// ═══════════════════════════════════════════
// ROLLOVER & ARCHIVE
// ═══════════════════════════════════════════

function openRolloverModal() {
  if (STATE.teacher?.role !== 'manager') { showToast('Only manager can perform rollover', 'error'); return; }
  const students = STATE.students, txns = STATE.transactions;
  let totalBal = 0; students.forEach(s => { totalBal += DB.getBalance(s.id); });
  document.getElementById('rollover-summary-box').innerHTML =
    `<div style="font-size:.82rem;font-weight:700;color:var(--navy);margin-bottom:8px;">Rollover Preview</div>` +
    `<div class="rollover-summary-row"><span>Total Students</span><strong>${students.length}</strong></div>` +
    `<div class="rollover-summary-row"><span>Transaction Records to Clear</span><strong>${txns.length}</strong></div>` +
    `<div class="rollover-summary-row"><span>Total Balance Carried Forward</span><strong style="color:var(--green)">${fmt(totalBal)}</strong></div>`;
  document.getElementById('rollover-confirm-input').value = '';
  document.getElementById('rollover-modal').classList.add('active');
}

async function performRollover() {
  if (STATE.teacher?.role !== 'manager') { showToast('Only manager can perform rollover', 'error'); return; }
  if (document.getElementById('rollover-confirm-input').value.trim() !== 'ROLLOVER') { showToast('Type ROLLOVER exactly to confirm', 'error'); return; }
  const btn = document.getElementById('rollover-confirm-btn');
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Archiving…';
  try {
    const students  = STATE.students, year = new Date().getFullYear();
    const archBase  = db.collection('schools').doc(STATE.schoolCode).collection('archives').doc(String(year));
    const snaps     = students.map(s => ({ ...s, finalBalance: DB.getBalance(s.id), yearDeposits: DB.getDeposits(s.id), yearWithdrawals: DB.getWithdrawals(s.id) }));
    await batchChunked(snaps, (b, s) => b.set(archBase.collection('students').doc(s.id), s));
    const txnSnap   = await txnsRef().get();
    if (txnSnap.size > 0) await batchChunked(txnSnap.docs, (b, d) => b.set(archBase.collection('transactions').doc(d.id), d.data()));
    const totalBal  = students.reduce((a, s) => a + DB.getBalance(s.id), 0);
    const totalDeps = STATE.transactions.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
    await archBase.set({ year, schoolCode: STATE.schoolCode, schoolName: STATE.schoolName, studentCount: students.length, totalFinalBalance: totalBal, totalYearDeposits: totalDeps, archivedAt: firebase.firestore.FieldValue.serverTimestamp(), archivedBy: STATE.user.uid, archivedByName: STATE.teacher.name });
    await batchChunked(students, (b, s) => b.update(studentsRef().doc(s.id), { openingBalance: DB.getBalance(s.id), rolledOverAt: firebase.firestore.FieldValue.serverTimestamp(), rolledOverYear: year, rolledOverBy: STATE.user.uid }));
    if (txnSnap.size > 0) await batchChunked(txnSnap.docs, (b, d) => b.delete(d.ref));
    await db.collection('schools').doc(STATE.schoolCode).update({ lastRollover: firebase.firestore.FieldValue.serverTimestamp(), lastRolloverYear: year, lastRolloverBy: STATE.user.uid });
    closeModal('rollover-modal');
    showToast(`Year ${year} archived! ${students.length} balances carried forward.`, 'success');
    navigateTo('dashboard');
  } catch (err) { showToast('Rollover error: ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = '📅 Confirm Rollover'; }
}

let _currentArchiveYear = null, _archiveStudents = [], _archiveTxns = [];

async function renderArchiveList() {
  const el = document.getElementById('archive-list'); if (!el) return;
  el.innerHTML = `<div class="skeleton-card"><div class="skeleton-avatar"></div><div class="skeleton-info"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:40%;margin-top:6px"></div></div></div>`;
  try {
    const snap = await db.collection('schools').doc(STATE.schoolCode).collection('archives').orderBy('year', 'desc').get();
    if (snap.empty) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">🗃️</div><div class="empty-title">No Archives Yet</div><div class="empty-sub">Archives are created automatically when you do a Year-End Rollover from Settings.</div></div>`; return; }
    el.innerHTML = snap.docs.map(d => { const a = d.data(); return `<div class="archive-year-card" onclick="openArchiveYear('${a.year}')"><div class="archive-year-icon">📁</div><div class="archive-year-info"><div class="archive-year-title">Academic Year ${a.year}–${(a.year % 100) + 1}</div><div class="archive-year-sub">${a.studentCount || 0} students · Total saved: ${fmt(a.totalYearDeposits || 0)} · Final bal: ${fmt(a.totalFinalBalance || 0)}</div></div><div style="color:var(--muted);font-size:1rem;">›</div></div>`; }).join('');
  } catch (err) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Could not load archives</div><div class="empty-sub">${esc(err.message)}</div></div>`; }
}

async function openArchiveYear(year) {
  _currentArchiveYear = year; navigateTo('archive-detail');
  document.getElementById('archive-detail-title').textContent = `📁 Year ${year}–${(year % 100) + 1} Archive`;
  const tbody = document.getElementById('archive-detail-tbody');
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">Loading…</td></tr>`;
  try {
    const archBase          = db.collection('schools').doc(STATE.schoolCode).collection('archives').doc(String(year));
    const [studSnap, txnSnap] = await Promise.all([archBase.collection('students').get(), archBase.collection('transactions').get()]);
    _archiveStudents        = studSnap.docs.map(d => d.data());
    _archiveTxns            = txnSnap.docs.map(d => d.data());
    const classSelect       = document.getElementById('archive-class-filter');
    const classes           = [...new Set(_archiveStudents.map(s => s.class).filter(Boolean))].sort();
    classSelect.innerHTML   = '<option value="">All Classes</option>' + classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    renderArchiveDetail();
  } catch (err) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--red)">${esc(err.message)}</td></tr>`; }
}
function renderArchiveDetail() {
  const cls = document.getElementById('archive-class-filter')?.value || '';
  const students = cls ? _archiveStudents.filter(s => s.class === cls) : _archiveStudents;
  const totalDeps    = _archiveTxns.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
  const totalFinalBal = students.reduce((a, s) => a + (s.finalBalance || 0), 0);
  document.getElementById('arch-students').textContent  = students.length;
  document.getElementById('arch-deposits').textContent  = fmt(totalDeps);
  document.getElementById('arch-final-bal').textContent = fmt(totalFinalBal);
  const tbody = document.getElementById('archive-detail-tbody');
  if (!students.length) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">No students for this class</td></tr>`; return; }
  tbody.innerHTML = [...students].sort((a, b) => (b.finalBalance || 0) - (a.finalBalance || 0))
    .map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.class || '—')}</td><td style="color:var(--green);font-weight:600">${fmt(s.yearDeposits || 0)}</td><td style="font-weight:700;color:var(--navy)">${fmt(s.finalBalance || 0)}</td></tr>`).join('');
}
function exportArchiveCSV() {
  if (!_archiveStudents.length) { showToast('No archive data loaded', 'warn'); return; }
  dlCSV(_archiveStudents.map(s => ({ 'Name': s.name, 'Account': s.accountNumber, 'Class': s.class || '', 'Roll': s.rollNumber || '', 'Year Deposits': s.yearDeposits || 0, 'Year Withdrawals': s.yearWithdrawals || 0, 'Final Balance': s.finalBalance || 0 })), `Archive_${_currentArchiveYear}.csv`);
  showToast('Archive exported!', 'success');
}

// ═══════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════

function getReportDateRange(period) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  if (period === 'month')      return [new Date(y, m, 1),   new Date(y, m + 1, 0)];
  if (period === 'last-month') return [new Date(y, m - 1, 1), new Date(y, m, 0)];
  if (period === 'term1')      return [new Date(y, 5, 1),   new Date(y, 8, 30)];
  if (period === 'term2')      return [new Date(y, 9, 1),   new Date(y + 1, 0, 31)];
  if (period === 'term3')      return [new Date(y, 1, 1),   new Date(y, 4, 31)];
  return [null, null];
}
function inRange(dateStr, from, to) {
  if (!from || !to) return true;
  const d = new Date(dateStr + 'T00:00:00');
  return d >= from && d <= to;
}

function renderReport() {
  const period     = document.getElementById('report-period')?.value || 'month';
  const catFilter  = document.getElementById('report-category')?.value || '';
  const classSelect = document.getElementById('report-class');
  const savedClass = classSelect ? classSelect.value : '';
  if (classSelect) {
    const classes = [...new Set(STATE.students.map(s => s.class).filter(Boolean))].sort();
    classSelect.innerHTML = '<option value="">All Classes</option>' + classes.map(c => `<option value="${esc(c)}"${c === savedClass ? ' selected' : ''}>${esc(c)}</option>`).join('');
  }
  const cls         = classSelect ? classSelect.value : '';
  const [from, to]  = getReportDateRange(period);
  const txns        = STATE.transactions.filter(t => inRange(t.date, from, to) && (!catFilter || t.category === catFilter));
  const students    = cls ? STATE.students.filter(s => s.class === cls) : STATE.students;
  const rows        = students.map(s => { const sTxns = txns.filter(t => t.studentId === s.id); const deps = sTxns.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0); const wds = sTxns.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0); const bal = DB.getBalance(s.id); return { s, deps, wds, bal }; }).sort((a, b) => b.deps - a.deps);
  const totalDeps   = rows.reduce((a, r) => a + r.deps, 0);
  const totalWds    = rows.reduce((a, r) => a + r.wds, 0);
  document.getElementById('rp-students').textContent    = rows.length;
  document.getElementById('rp-deposits').textContent    = fmt(totalDeps);
  document.getElementById('rp-withdrawals').textContent = fmt(totalWds);

  const chartWrap = document.getElementById('report-chart-wrap');
  const top8      = rows.filter(r => r.deps > 0).slice(0, 8);
  if (top8.length > 0 && chartWrap) {
    const maxVal = Math.max(...top8.map(r => r.deps));
    const barW   = Math.floor((320 - top8.length * 4) / top8.length);
    const bars   = top8.map((r, i) => { const bh = Math.max(4, Math.round((r.deps / maxVal) * 70)); const x = i * (barW + 4); const name = r.s.name.split(' ')[0].substring(0, 6); return `<g><rect x="${x}" y="${120 - bh - 28}" width="${barW}" height="${bh}" rx="3" fill="var(--green)" opacity=".85" style="animation:staggerFadeUp .4s ${i * 50}ms cubic-bezier(.22,1,.36,1) both"/><text x="${x + barW / 2}" y="98" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="Nunito,sans-serif">${esc(name)}</text><text x="${x + barW / 2}" y="110" text-anchor="middle" font-size="8" fill="var(--navy)" font-weight="700" font-family="Nunito,sans-serif">₹${Math.round(r.deps)}</text></g>`; }).join('');
    chartWrap.innerHTML = `<div style="background:var(--white);border-radius:var(--r);padding:13px;box-shadow:var(--sh-xs);margin-bottom:4px;border:1px solid var(--border-l);"><div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Top depositors this period</div><svg width="100%" viewBox="0 0 ${top8.length * (barW + 4)} 120" style="overflow:visible">${bars}</svg></div>`;
  } else if (chartWrap) { chartWrap.innerHTML = ''; }

  const tbody = document.getElementById('report-tbody'); if (!tbody) return;
  tbody.innerHTML = rows.length
    ? rows.map(r => `<tr onclick="navigateTo('student-detail','${r.s.id}')" style="cursor:pointer;"><td><strong>${esc(r.s.name)}</strong></td><td>${esc(r.s.class || '—')}</td><td style="color:var(--green);font-weight:600">${fmt(r.deps)}</td><td style="color:var(--red);font-weight:600">${fmt(r.wds)}</td><td class="${r.bal < 50 ? 'bal-low' : ''}">${fmt(r.bal)}</td></tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">No data for this period</td></tr>`;
}

function exportReportCSV() {
  const period = document.getElementById('report-period')?.value || 'month';
  const cls    = document.getElementById('report-class')?.value || '';
  const [from, to] = getReportDateRange(period);
  const txns   = STATE.transactions.filter(t => inRange(t.date, from, to));
  const students = cls ? STATE.students.filter(s => s.class === cls) : STATE.students;
  const rows   = students.map(s => { const sTxns = txns.filter(t => t.studentId === s.id); const deps = sTxns.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0); const wds = sTxns.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0); return { 'Name': s.name, 'Account': s.accountNumber, 'Class': s.class || '', 'Roll': s.rollNumber || '', 'Deposits': deps, 'Withdrawals': wds, 'Balance': DB.getBalance(s.id) }; });
  dlCSV(rows, `Report_${period}_${today()}.csv`);
  showToast('Report exported!', 'success');
}

// ═══════════════════════════════════════════
// CLASS DASHBOARD & CLASS REPORT
// ═══════════════════════════════════════════

function renderClassDashboard(cls) {
  _classDashClass = cls;
  const students = STATE.students.filter(s => s.class === cls), txns = STATE.transactions;
  document.getElementById('cd-title').textContent = `Class ${cls}`;
  document.getElementById('cd-sub').textContent   = `${students.length} students enrolled`;
  const totalBal = students.reduce((a, s) => a + DB.getBalance(s.id), 0);
  const avgBal   = students.length ? Math.round(totalBal / students.length) : 0;
  countUp(document.getElementById('cd-students'), students.length, 400, n => n);
  countUp(document.getElementById('cd-total'), totalBal, 600);
  countUp(document.getElementById('cd-avg'),   avgBal,   600);
  const ranked = [...students].sort((a, b) => DB.getBalance(b.id) - DB.getBalance(a.id)).slice(0, 5);
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  document.getElementById('cd-top-savers').innerHTML = ranked.length
    ? ranked.map((s, i) => `<div class="top-saver-row stagger-item" style="animation-delay:${i * 50}ms" onclick="navigateTo('student-detail','${s.id}')"><div class="top-saver-rank">${medals[i]}</div><div style="flex:1"><div style="font-weight:700;font-size:.88rem">${esc(s.name)}</div><div style="font-size:.71rem;color:var(--muted)">Roll ${esc(s.rollNumber || '—')}</div></div><div style="font-family:'Fraunces',serif;font-size:1.1rem;font-weight:700;color:var(--navy)">${fmt(DB.getBalance(s.id))}</div></div>`).join('')
    : `<div style="font-size:.8rem;color:var(--muted);padding:8px 0">No students in this class yet</div>`;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const activeIds = new Set(txns.filter(t => t.type === 'deposit' && t.date && t.date.startsWith(thisMonth)).map(t => t.studentId));
  const inactive  = students.filter(s => !activeIds.has(s.id));
  document.getElementById('cd-inactive').innerHTML = inactive.length
    ? inactive.map(s => `<div class="inactive-row" onclick="navigateTo('student-detail','${s.id}')"><div style="flex:1"><div style="font-weight:700;font-size:.84rem">${esc(s.name)}</div><div style="font-size:.7rem;color:var(--red)">No deposit this month · Balance: ${fmt(DB.getBalance(s.id))}</div></div><div style="color:var(--muted);font-size:.85rem">›</div></div>`).join('')
    : `<div style="font-size:.8rem;color:var(--green);font-weight:600;padding:8px 0">✅ All students deposited this month!</div>`;
}

function openClassBulkDeposit() {
  if (!_classDashClass) return;
  const cls    = _classDashClass;
  const amount = prompt(`Enter deposit amount for ALL students in Class ${cls}:`);
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) { showToast('Invalid amount', 'error'); return; }
  const amt      = parseFloat(amount);
  const note     = prompt('Note (optional):', 'Weekly savings') || '';
  const students = STATE.students.filter(s => s.class === cls);
  if (!confirm(`Deposit ${fmt(amt)} for ${students.length} students in Class ${cls}?\nTotal: ${fmt(amt * students.length)}`)) return;
  Promise.all(students.map(s => DB.addTransaction({ id: uuid(), studentId: s.id, accountNumber: s.accountNumber, studentName: s.name, class: s.class, type: 'deposit', amount: amt, date: today(), note, category: 'savings', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), timestamp: Date.now() })))
    .then(() => showToast(`Deposited ${fmt(amt)} for ${students.length} students!`, 'success'))
    .catch(err => showToast('Error: ' + err.message, 'error'));
}

function renderClassReport() {
  const students = STATE.students, txns = STATE.transactions;
  const classes  = [...new Set(students.map(s => s.class).filter(Boolean))].sort();
  document.getElementById('cr-total-classes').textContent  = classes.length;
  document.getElementById('cr-total-students').textContent = students.length;
  const totalSaved = students.reduce((a, s) => a + DB.getBalance(s.id), 0);
  countUp(document.getElementById('cr-total-saved'), totalSaved, 600);
  const thisMonth  = new Date().toISOString().slice(0, 7);
  const classData  = classes.map(cls => {
    const s = students.filter(x => x.class === cls);
    const total       = s.reduce((a, x) => a + DB.getBalance(x.id), 0);
    const avg         = s.length ? Math.round(total / s.length) : 0;
    const topSaver    = s.reduce((a, x) => DB.getBalance(x.id) > DB.getBalance(a.id) ? x : a, s[0]);
    const activeIds   = new Set(txns.filter(t => t.type === 'deposit' && t.date && t.date.startsWith(thisMonth) && s.find(x => x.id === t.studentId)).map(t => t.studentId));
    const participation = s.length ? Math.round(activeIds.size / s.length * 100) : 0;
    return { cls, students: s.length, total, avg, topSaver, participation };
  }).sort((a, b) => b.total - a.total);
  const maxTotal = classData.length ? Math.max(...classData.map(d => d.total)) : 1;
  const medals   = ['🥇', '🥈', '🥉'];
  const el       = document.getElementById('class-rank-list');
  if (!classData.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No Classes Yet</div><div class="empty-sub">Add students with class names to see the comparison</div></div>`; return; }
  el.innerHTML = classData.map((d, i) => {
    const barPct = maxTotal ? Math.round(d.total / maxTotal * 100) : 0;
    const pClass = d.participation >= 70 ? 'high' : d.participation >= 40 ? 'mid' : 'low';
    return `<div class="class-rank-row stagger-item" style="animation-delay:${i * 55}ms" onclick="openClassDash('${esc(d.cls)}')"><div style="display:flex;align-items:center;gap:11px;"><div class="cr-rank">${medals[i] || '#' + (i + 1)}</div><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;"><div style="font-weight:800;font-size:.92rem;color:var(--navy);">Class ${esc(d.cls)}</div><div style="font-family:var(--font-display);font-size:1.05rem;font-weight:700;color:var(--navy);">${fmt(d.total)}</div></div><div class="cr-bar-bg"><div class="cr-bar-fill" style="width:${barPct}%"></div></div><div style="display:flex;justify-content:space-between;margin-top:5px;font-size:.69rem;color:var(--muted);"><span>${d.students} students · Avg ${fmt(d.avg)}</span><span class="cr-participation ${pClass}">${d.participation}% active</span></div>${d.topSaver ? `<div style="font-size:.68rem;color:var(--muted);margin-top:3px;">🏆 Top: <strong style="color:var(--navy)">${esc(d.topSaver.name)}</strong> · ${fmt(DB.getBalance(d.topSaver.id))}</div>` : ''}</div></div></div>`;
  }).join('');
}

function exportClassReportCSV() {
  const students  = STATE.students, txns = STATE.transactions;
  const classes   = [...new Set(students.map(s => s.class).filter(Boolean))].sort();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const rows      = classes.map(cls => { const s = students.filter(x => x.class === cls); const total = s.reduce((a, x) => a + DB.getBalance(x.id), 0); const avg = s.length ? Math.round(total / s.length) : 0; const activeIds = new Set(txns.filter(t => t.type === 'deposit' && t.date && t.date.startsWith(thisMonth) && s.find(x => x.id === t.studentId)).map(t => t.studentId)); const topSaver = s.reduce((a, x) => DB.getBalance(x.id) > DB.getBalance(a.id) ? x : a, s[0]); return { 'Class': cls, 'Students': s.length, 'Total Saved': total, 'Avg Balance': avg, 'Top Saver': topSaver?.name || '—', 'Active This Month': activeIds.size, 'Participation %': s.length ? Math.round(activeIds.size / s.length * 100) : 0 }; });
  dlCSV(rows, `ClassReport_${today()}.csv`);
  showToast('Class report exported!', 'success');
}

function printClassReport() {
  const students = STATE.students, txns = STATE.transactions;
  const classes  = [...new Set(students.map(s => s.class).filter(Boolean))].sort();
  const rows     = classes.map(cls => { const s = students.filter(x => x.class === cls); const total = s.reduce((a, x) => a + DB.getBalance(x.id), 0); const avg = s.length ? Math.round(total / s.length) : 0; const topSaver = s.reduce((a, x) => DB.getBalance(x.id) > DB.getBalance(a.id) ? x : a, s[0]); return `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee;font-weight:700">Class ${esc(cls)}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${s.length}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;font-weight:700;color:#2A7A54">${fmt(total)}</td><td style="padding:8px 10px;border-bottom:1px solid #eee">${fmt(avg)}</td><td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(topSaver?.name || '—')}</td></tr>`; }).join('');
  const totalAll = students.reduce((a, s) => a + DB.getBalance(s.id), 0);
  document.getElementById('print-area').innerHTML = `<div style="padding:20px;font-family:sans-serif;max-width:700px;margin:0 auto;"><div style="text-align:center;border-bottom:2px solid #1A3A5C;padding-bottom:12px;margin-bottom:16px;"><div style="font-size:1.2rem;font-weight:700;color:#1A3A5C">${esc(STATE.schoolName)}</div><div style="font-size:.85rem;color:#555;margin-top:2px;">Comparative Class Report · ${new Date().toLocaleDateString('en-IN')}</div></div><table style="width:100%;border-collapse:collapse;font-size:.85rem;"><thead><tr style="background:#1A3A5C;color:#fff;"><th style="padding:9px 10px;text-align:left">Class</th><th style="padding:9px 10px;text-align:center">Students</th><th style="padding:9px 10px;text-align:left">Total Saved</th><th style="padding:9px 10px;text-align:left">Avg Balance</th><th style="padding:9px 10px;text-align:left">Top Saver</th></tr></thead><tbody>${rows}</tbody><tfoot><tr style="background:#f5f5f5;font-weight:700"><td colspan="2" style="padding:9px 10px">TOTAL — ${students.length} students</td><td style="padding:9px 10px;color:#2A7A54">${fmt(totalAll)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
  document.getElementById('print-area').style.display = 'block';
  window.print();
  document.getElementById('print-area').style.display = 'none';
}

// ═══════════════════════════════════════════
// COLLECTION SHEET
// ═══════════════════════════════════════════

let _collectionClass = '', _quickEntryData = [];

function renderCollectionClassGrid() {
  const classes = [...new Set(STATE.students.map(s => s.class).filter(Boolean))].sort();
  const grid    = document.getElementById('collection-class-grid'); if (!grid) return;
  if (!classes.length) { grid.innerHTML = `<div style="grid-column:1/-1;font-size:.8rem;color:var(--muted)">No classes yet.</div>`; return; }
  if (!_collectionClass) _collectionClass = classes[0];
  grid.innerHTML = classes.map(c =>
    `<button class="collection-class-btn ${_collectionClass === c ? 'selected' : ''}" onclick="selectCollectionClass('${esc(c)}')">${esc(c)}<br><span style="font-size:.68rem;font-weight:400;opacity:.7">${STATE.students.filter(s => s.class === c).length} students</span></button>`
  ).join('');
}
function selectCollectionClass(cls) { _collectionClass = cls; document.getElementById('quick-entry-section').style.display = 'none'; renderCollectionClassGrid(); }
function printCollectionSheet() {
  if (!_collectionClass) { showToast('Select a class first', 'warn'); return; }
  const students = STATE.students.filter(s => s.class === _collectionClass).sort((a, b) => parseInt(a.rollNumber || 99) - parseInt(b.rollNumber || 99));
  if (!students.length) { showToast('No students in this class', 'warn'); return; }
  const rows = students.map(s => `<tr><td style="width:40px;text-align:center;padding:7px 4px;border:1px solid #ccc">${esc(s.rollNumber || '—')}</td><td style="padding:7px 8px;border:1px solid #ccc;font-weight:600">${esc(s.name)}</td><td style="width:90px;border:1px solid #ccc"></td><td style="width:130px;border:1px solid #ccc"></td><td style="width:70px;border:1px solid #ccc"></td></tr>`).join('');
  document.getElementById('print-area').innerHTML = `<div style="padding:18px;font-family:sans-serif;max-width:680px;margin:0 auto;"><div style="text-align:center;margin-bottom:12px;"><div style="font-size:1.2rem;font-weight:700;color:#1A3A5C">${esc(STATE.schoolName)}</div><div style="font-size:.85rem;color:#555;margin-top:3px;">Daily Cash Collection Sheet — Class ${esc(_collectionClass)}</div><div style="font-size:.8rem;color:#888;margin-top:2px;">Date: _________________ &nbsp;&nbsp; Teacher: _________________</div></div><table style="width:100%;border-collapse:collapse;font-size:.82rem;"><thead><tr style="background:#1A3A5C;color:#fff;"><th style="padding:7px 4px;border:1px solid #ccc;width:40px">Roll</th><th style="padding:7px 8px;border:1px solid #ccc;text-align:left">Student Name</th><th style="padding:7px;border:1px solid #ccc;width:90px">Amount (₹)</th><th style="padding:7px;border:1px solid #ccc;width:130px">Note / Category</th><th style="padding:7px;border:1px solid #ccc;width:70px">Signature</th></tr></thead><tbody>${rows}</tbody><tfoot><tr style="background:#f5f5f5"><td colspan="2" style="padding:7px 8px;border:1px solid #ccc;font-weight:700;text-align:right">Total:</td><td style="border:1px solid #ccc"></td><td colspan="2" style="border:1px solid #ccc"></td></tr></tfoot></table><div style="margin-top:16px;font-size:.72rem;color:#999;text-align:center;">${esc(STATE.schoolName)} · Generated ${new Date().toLocaleDateString('en-IN')} · ${students.length} students</div></div>`;
  document.getElementById('print-area').style.display = 'block';
  window.print();
  document.getElementById('print-area').style.display = 'none';
  showToast('Collection sheet sent to printer!', 'success');
}
function openQuickEntry() {
  if (!_collectionClass) { showToast('Select a class first', 'warn'); return; }
  const students = STATE.students.filter(s => s.class === _collectionClass).sort((a, b) => parseInt(a.rollNumber || 99) - parseInt(b.rollNumber || 99));
  if (!students.length) { showToast('No students in this class', 'warn'); return; }
  _quickEntryData = students.map(s => ({ student: s, amount: '' }));
  document.getElementById('qe-class-label').textContent = `Class ${_collectionClass}`;
  document.getElementById('quick-entry-list').innerHTML = _quickEntryData.map((row, i) =>
    `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;background:var(--white);border-radius:var(--r);padding:8px 13px;box-shadow:var(--sh-xs);border:1px solid var(--border-l);"><div style="font-size:.72rem;color:var(--muted);width:22px;text-align:center;font-weight:700">${esc(row.student.rollNumber || String(i + 1))}</div><div style="flex:1;font-size:.87rem;font-weight:600">${esc(row.student.name)}</div><input type="number" min="0" step="1" class="form-input" style="width:90px;padding:7px 10px;font-size:.9rem;font-weight:700;text-align:right;" placeholder="₹" id="qe-amt-${i}" onkeydown="qeKeyNav(event,${i})" onchange="_quickEntryData[${i}].amount=parseFloat(this.value)||0"></div>`
  ).join('');
  document.getElementById('quick-entry-section').style.display  = 'block';
  document.getElementById('collection-pick-section').style.display = 'none';
  setTimeout(() => { const f = document.getElementById('qe-amt-0'); if (f) f.focus(); }, 100);
}
function closeQuickEntry() { document.getElementById('quick-entry-section').style.display = 'none'; document.getElementById('collection-pick-section').style.display = 'block'; }
function qeKeyNav(e, i) {
  if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); const n = document.getElementById('qe-amt-' + (i + 1)); if (n) n.focus(); else submitQuickEntry(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); const p = document.getElementById('qe-amt-' + (i - 1)); if (p) p.focus(); }
}
async function submitQuickEntry() {
  _quickEntryData.forEach((row, i) => { const el = document.getElementById('qe-amt-' + i); row.amount = parseFloat(el?.value) || 0; });
  const entries = _quickEntryData.filter(row => row.amount > 0);
  if (!entries.length) { showToast('No amounts entered', 'warn'); return; }
  const btn = document.querySelector('#quick-entry-section .btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Saving…';
  try {
    await Promise.all(entries.map(row => DB.addTransaction({ id: uuid(), studentId: row.student.id, accountNumber: row.student.accountNumber, studentName: row.student.name, class: row.student.class, type: 'deposit', amount: row.amount, date: today(), note: 'Quick Entry', category: 'savings', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), timestamp: Date.now() })));
    showToast(`Saved ${entries.length} deposits!`, 'success');
    closeQuickEntry(); _quickEntryData = [];
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '✅ Save All Entries'; }
}

// ═══════════════════════════════════════════
// FEE MANAGEMENT
// ═══════════════════════════════════════════

let _markFeeId = null, _markFeeStudentId = null;

function renderFeeManagement() {
  const classes = [...new Set(STATE.students.map(s => s.class).filter(Boolean))].sort();
  const sel     = document.getElementById('fm-class-filter');
  if (sel) {
    const curVal = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    classes.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    if (curVal) sel.value = curVal;
  }
  const cls = sel ? sel.value : '';
  const el  = document.getElementById('fm-list'); if (!el) return;
  try {
    let fees = [...STATE.fees].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    if (cls) fees = fees.filter(f => f.class === cls || f.targetClass === cls);
    const totalPaid    = fees.filter(f => f.status === 'paid').reduce((a, f) => a + (f.amount || 0), 0);
    const totalPending = fees.filter(f => f.status === 'pending').reduce((a, f) => a + (f.amount || 0), 0);
    const totalOverdue = fees.filter(f => f.status === 'pending' && f.dueDate && f.dueDate < today()).reduce((a, f) => a + (f.amount || 0), 0);
    const pmEl = document.getElementById('fm-total-paid');    if (pmEl) pmEl.textContent = fmt(totalPaid);
    const pdEl = document.getElementById('fm-total-pending'); if (pdEl) pdEl.textContent = fmt(totalPending);
    const odEl = document.getElementById('fm-total-overdue'); if (odEl) odEl.textContent = fmt(totalOverdue);
    if (!fees.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-title">No Fee Records</div><div class="empty-sub">Tap "+ Add Fee Due" to create one</div></div>`; return; }
    el.innerHTML = fees.map(f => {
      const isOverdue = f.status === 'pending' && f.dueDate && f.dueDate < today();
      const status    = isOverdue ? 'overdue' : f.status || 'pending';
      const sName     = f.studentName || f.targetLabel || 'All Students';
      return `<div class="fee-mgmt-card" style="margin-bottom:10px;"><div class="fee-mgmt-row" style="border-bottom:1px solid var(--border-l);"><div style="flex:1;min-width:0;"><div style="font-weight:800;font-size:.9rem;color:var(--navy)">${esc(f.title || 'Fee')}</div><div style="font-size:.72rem;color:var(--muted);margin-top:2px">${esc(sName)} ${f.dueDate ? '· Due: ' + fmtDate(f.dueDate) : ''}</div></div><div style="text-align:right;flex-shrink:0;margin-right:8px;"><div style="font-family:var(--font-display);font-size:1.05rem;font-weight:700;color:var(--navy)">${fmt(f.amount || 0)}</div><span class="sp-fee-badge ${status}">${status === 'paid' ? '✓ Paid' : status === 'overdue' ? 'Overdue' : 'Pending'}</span></div>${status !== 'paid' ? `<button onclick="openMarkFeePaid('${f.id}','${esc(f.studentId || '')}','${esc(f.title || '')}',${f.amount || 0})" style="background:var(--green-l);border:1px solid var(--green-m);border-radius:9px;padding:6px 11px;font-size:.72rem;font-weight:800;cursor:pointer;color:var(--green);font-family:var(--font-body);white-space:nowrap;flex-shrink:0;">Mark Paid</button>` : ''}</div></div>`;
    }).join('');
  } catch (e) { el.innerHTML = `<div style="padding:14px;color:var(--red);font-size:.8rem">Error: ${esc(e.message)}</div>`; }
}

function openAddFeeModal() {
  document.getElementById('fee-title-input').value   = '';
  document.getElementById('fee-amount-input').value  = '';
  document.getElementById('fee-due-date-input').value = today();
  document.getElementById('fee-target-select').value = 'all';
  document.getElementById('fee-class-group').style.display   = 'none';
  document.getElementById('fee-student-group').style.display = 'none';
  document.getElementById('fee-target-select').onchange = function () {
    document.getElementById('fee-class-group').style.display   = this.value === 'class'   ? 'block' : 'none';
    document.getElementById('fee-student-group').style.display = this.value === 'student' ? 'block' : 'none';
  };
  document.getElementById('add-fee-modal').classList.add('active');
}

async function saveFeeDue() {
  const title   = document.getElementById('fee-title-input').value.trim();
  const amount  = parseFloat(document.getElementById('fee-amount-input').value);
  const dueDate = document.getElementById('fee-due-date-input').value;
  const target  = document.getElementById('fee-target-select').value;
  if (!title)              { showToast('Enter a fee title', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const btn = document.querySelector('#add-fee-modal .btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Saving…';
  try {
    const base = { title, amount, dueDate, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: STATE.user.uid, createdByName: STATE.teacher.name };
    if (target === 'all') {
      const students = STATE.students;
      await batchChunked(students, (b, s) => b.set(feesRef().doc(uuid()), { ...base, studentId: s.id, studentName: s.name, accountNumber: s.accountNumber, class: s.class, targetLabel: 'All Students' }));
      showToast(`Fee due added for ${students.length} students!`, 'success');
    } else if (target === 'class') {
      const cls = document.getElementById('fee-class-input').value.trim().toUpperCase();
      if (!cls) { showToast('Enter a class', 'error'); btn.disabled = false; btn.innerHTML = '✅ Create Fee Due'; return; }
      const students = STATE.students.filter(s => s.class === cls);
      if (!students.length) { showToast('No students in this class', 'warn'); btn.disabled = false; btn.innerHTML = '✅ Create Fee Due'; return; }
      await batchChunked(students, (b, s) => b.set(feesRef().doc(uuid()), { ...base, studentId: s.id, studentName: s.name, accountNumber: s.accountNumber, class: s.class, targetLabel: 'Class ' + cls, targetClass: cls }));
      showToast(`Fee due added for Class ${cls} (${students.length} students)!`, 'success');
    } else {
      const acc     = document.getElementById('fee-student-input').value.trim().toUpperCase();
      const student = DB.getStudentByAcc(acc);
      if (!student) { showToast('Student not found', 'error'); btn.disabled = false; btn.innerHTML = '✅ Create Fee Due'; return; }
      await feesRef().doc(uuid()).set({ ...base, studentId: student.id, studentName: student.name, accountNumber: student.accountNumber, class: student.class, targetLabel: student.name });
      showToast(`Fee due added for ${student.name}!`, 'success');
    }
    closeModal('add-fee-modal'); renderFeeManagement();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '✅ Create Fee Due'; }
}

function openMarkFeePaid(feeId, studentId, title, amount) {
  _markFeeId = feeId; _markFeeStudentId = studentId;
  document.getElementById('mark-fee-preview').innerHTML = `<strong>${esc(title)}</strong> — ${fmt(amount)}`;
  document.getElementById('mark-fee-date').value  = today();
  document.getElementById('mark-fee-note').value  = '';
  document.getElementById('mark-fee-modal').classList.add('active');
}
async function confirmMarkFeePaid() {
  if (!_markFeeId) return;
  const btn = document.querySelector('#mark-fee-modal .btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Saving…';
  try {
    await feesRef().doc(_markFeeId).update({ status: 'paid', paidDate: document.getElementById('mark-fee-date').value, note: document.getElementById('mark-fee-note').value.trim(), paidBy: STATE.user.uid, paidByName: STATE.teacher.name, paidAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeModal('mark-fee-modal'); showToast('Fee marked as paid!', 'success'); renderFeeManagement();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '✅ Mark as Paid'; }
}

// ═══════════════════════════════════════════
// ANNOUNCEMENTS VIEW
// ═══════════════════════════════════════════

let _currentAnnType = 'info', _deleteAnnId = null;
const annRef = () => db.collection('schools').doc(STATE.schoolCode).collection('announcements');

function selectAnnType(type, btn) {
  _currentAnnType = type;
  document.querySelectorAll('.ann-type-btn').forEach(b => { b.classList.remove('active', 'info', 'warning', 'urgent'); b.classList.add(b.dataset.type); });
  btn.classList.add('active', type);
}
function renderAnnouncementsView() {
  const isManager      = STATE.teacher?.role === 'manager';
  const composeSection = document.getElementById('ann-compose-section');
  if (composeSection) composeSection.style.display = isManager ? 'block' : 'none';
  loadAnnouncementsList();
}
function loadAnnouncementsList() {
  const el        = document.getElementById('ann-list-container'); if (!el) return;
  const anns      = STATE.announcements;
  const isManager = STATE.teacher?.role === 'manager';
  const now       = Date.now();
  if (!anns.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">📣</div><div class="empty-title">No Announcements</div><div class="empty-sub">Post an announcement to notify all teachers</div></div>`; return; }
  const active = anns.filter(a => (now - (a.createdAt?.toMillis?.() || 0)) < 7 * 24 * 60 * 60 * 1000);
  if (!active.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">📣</div><div class="empty-title">No Active Announcements</div></div>`; return; }
  try {
    const icons = { info: 'ℹ️', warning: '⚠️', urgent: '🚨' };
    el.innerHTML = active.map(a => {
      const age    = Math.floor((now - (a.createdAt?.toMillis?.() || 0)) / (1000 * 60 * 60));
      const ageStr = age < 1 ? 'Just now' : age < 24 ? age + 'h ago' : Math.floor(age / 24) + 'd ago';
      return `<div class="ann-list-item stagger-item"><div class="ann-dot ${a.type || 'info'}"></div><div style="flex:1;min-width:0;"><div style="font-weight:800;font-size:.86rem;color:var(--navy);display:flex;align-items:center;gap:6px;">${icons[a.type] || '📢'} ${esc(a.title)}</div>${a.body ? `<div style="font-size:.75rem;color:var(--text-2);margin-top:3px;line-height:1.5;">${esc(a.body)}</div>` : ''}<div style="font-size:.67rem;color:var(--muted);margin-top:4px;">${esc(a.postedByName || 'Manager')} · ${ageStr}</div></div>${isManager ? `<button onclick="openDeleteAnn('${a.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;font-size:.9rem;flex-shrink:0;">✕</button>` : ''}</div>`;
    }).join('') || `<div class="empty-state"><div class="empty-icon">📣</div><div class="empty-title">No Active Announcements</div></div>`;
  } catch (err) { el.innerHTML = `<div style="padding:14px;font-size:.8rem;color:var(--red);">Error loading: ${esc(err.message)}</div>`; }
}
async function postAnnouncement() {
  const title = document.getElementById('ann-title-input').value.trim();
  const body  = document.getElementById('ann-body-input').value.trim();
  if (!title) { showToast('Enter an announcement title', 'error'); return; }
  const btn = document.getElementById('ann-post-btn');
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Posting…';
  try {
    await annRef().add({ title, body, type: _currentAnnType, postedBy: STATE.user.uid, postedByName: STATE.teacher.name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById('ann-title-input').value = '';
    document.getElementById('ann-body-input').value  = '';
    showToast('Announcement posted!', 'success');
    loadAnnouncementsList(); loadDashboardAnnouncements();
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '📣 Post Announcement'; }
}
function openDeleteAnn(id) { _deleteAnnId = id; document.getElementById('del-ann-modal').classList.add('active'); }
async function confirmDeleteAnn() {
  if (!_deleteAnnId) return;
  const btn = document.querySelector('#del-ann-modal .btn-danger');
  btn.disabled = true; btn.textContent = 'Deleting…';
  try {
    try { await auditDelete('announcement', { originalId: _deleteAnnId, deletionReason: 'Deleted by teacher' }); } catch (e) {}
    await annRef().doc(_deleteAnnId).delete();
    _deleteAnnId = null; closeModal('del-ann-modal'); showToast('Announcement deleted', 'warn');
    loadAnnouncementsList(); loadDashboardAnnouncements();
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Delete'; }
}

// ═══════════════════════════════════════════
// ID CARD
// ═══════════════════════════════════════════

// drawIDCard is in idcard.js — this just triggers it
function renderIDCard() {
  const s = DB.getStudentById(currentStudentId);
  if (!s) { showToast('No student selected', 'error'); goBack(); return; }
  const canvas = document.getElementById('id-card-canvas');
  if (!canvas) return;
  drawIDCard(canvas, s);
}

// ═══════════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════════

function sendWhatsAppSlip() {
  const s    = DB.getStudentById(currentStudentId); if (!s) return;
  const bal  = DB.getBalance(s.id), deps = DB.getDeposits(s.id), wds = DB.getWithdrawals(s.id);
  const txns = STATE.transactions.filter(t => t.studentId === s.id);
  const last3 = [...txns].sort((a, b) => toMs(b) - toMs(a)).slice(0, 3);
  const lastTxnLines = last3.map(t => `  ${fmtDate(t.date)} — ${t.type === 'deposit' ? '+' : '-'}${fmt(t.amount)} (${t.note || 'No note'})`).join('\n');
  const msg  = `📚 *${STATE.schoolName}*\n*Student Bank — Balance Slip*\n\n👤 *${s.name}*\n🔢 A/C No: ${s.accountNumber}\n🏫 Class: ${s.class || '—'} | Roll: ${s.rollNumber || '—'}\n\n💰 *Current Balance: ${fmt(bal)}*\n⬆️ Total Deposited: ${fmt(deps)}\n⬇️ Total Withdrawn: ${fmt(wds)}\n\n` + (last3.length ? `📋 *Last ${last3.length} Transactions:*\n${lastTxnLines}\n\n` : '') + `📅 Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}\n_Sent via Student Bank App_`;
  const phone = (s.parentPhone || '').replace(/\D/g, '');
  window.open(phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function bulkWhatsAppAll() {
  const students = STATE.students.filter(s => s.parentPhone);
  if (!students.length) { showToast('No students have parent phone numbers saved', 'warn'); return; }
  const cls     = prompt('Send to specific class? (leave blank for all)', '');
  const targets = cls ? students.filter(s => s.class === cls.trim().toUpperCase()) : students;
  if (!targets.length) { showToast('No students found for this class', 'warn'); return; }
  if (!confirm(`Send balance update to ${targets.length} parents via WhatsApp?\nThis will open ${targets.length} WhatsApp tabs.`)) return;
  const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  targets.forEach((s, i) => {
    setTimeout(() => {
      const bal  = DB.getBalance(s.id);
      const msg  = `📚 *${STATE.schoolName}*\n*Student Bank — Balance Update*\n\n👤 *${s.name}*\n🔢 A/C: ${s.accountNumber} · Class ${s.class || '—'}\n💰 *Current Balance: ${fmt(bal)}*\n📅 As on: ${now}\n\n_Sent via Student Bank App_`;
      const phone = s.parentPhone.replace(/\D/g, '');
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }, i * 600);
  });
  showToast(`Sending to ${targets.length} parents…`, 'success');
}

function showStudentBalance() {
  const s = DB.getStudentById(currentStudentId); if (!s) return;
  const bal = DB.getBalance(s.id), deps = DB.getDeposits(s.id) + (parseFloat(s.openingBalance) || 0), wds = DB.getWithdrawals(s.id);
  document.getElementById('bv-name').textContent    = s.name;
  document.getElementById('bv-acc').textContent     = 'A/C: ' + s.accountNumber + ' · Class ' + (s.class || '—');
  document.getElementById('bv-balance').textContent = fmt(bal);
  document.getElementById('bv-deps').textContent    = fmt(deps);
  document.getElementById('bv-wds').textContent     = fmt(wds);
  document.getElementById('bv-school').textContent  = STATE.schoolName;
  document.getElementById('balance-view-screen').classList.add('active');
}
function closeBalanceView() { document.getElementById('balance-view-screen').classList.remove('active'); }

function printAllQRCards() {
  const students = STATE.students;
  if (!students.length) { showToast('No students to print', 'warn'); return; }
  const cards = students.map(s =>
    `<div style="width:180px;border:1px solid #ccc;border-radius:8px;padding:10px;text-align:center;break-inside:avoid;font-family:sans-serif;"><div style="font-size:10px;font-weight:700;color:#1A3A5C;margin-bottom:2px;">${esc(STATE.schoolName)}</div><div style="font-size:13px;font-weight:700;color:#1A3A5C;margin-bottom:4px;">${esc(s.name)}</div><div style="font-size:9px;color:#6b7280;margin-bottom:6px;">A/C: ${esc(s.accountNumber)} · Class ${esc(s.class || '—')}</div><div id="qrcard-${s.id}" style="display:inline-block;"></div><div style="font-size:9px;color:#6b7280;margin-top:4px;font-family:monospace;">${esc(s.accountNumber)}</div><div style="font-size:8px;color:#aaa;margin-top:2px;border-top:1px dashed #ddd;padding-top:3px;">School Code: <b style="color:#1A3A5C;letter-spacing:.08em">${esc(STATE.schoolCode || '')}</b></div></div>`
  ).join('');
  document.getElementById('print-area').innerHTML = `<div style="padding:16px;"><h2 style="font-family:sans-serif;font-size:14px;color:#1A3A5C;margin-bottom:12px;">${esc(STATE.schoolName)} — Student QR Cards</h2><div style="display:flex;flex-wrap:wrap;gap:10px;">${cards}</div></div>`;
  document.getElementById('print-area').style.display = 'block';
  students.forEach(s => { try { new QRCode(document.getElementById('qrcard-' + s.id), { text: s.accountNumber, width: 80, height: 80, colorDark: '#1A3A5C', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (e) {} });
  setTimeout(() => { window.print(); document.getElementById('print-area').style.display = 'none'; }, 600);
}

// ═══════════════════════════════════════════
// STUDENT PORTAL — HOME, PASSBOOK, CHALLENGE, FEES
// ═══════════════════════════════════════════

const SP_BADGES = [
  { id: 'first',   icon: '⭐', name: 'First Deposit', sub: 'Made 1st deposit',  check: (s, txns) => txns.filter(t => t.type === 'deposit').length > 0 },
  { id: 'r100',    icon: '💰', name: '₹100 Club',     sub: 'Balance ≥ ₹100',   check: (s, txns) => spBalance(s, txns) >= 100 },
  { id: 'r500',    icon: '🎖️', name: '₹500 Club',     sub: 'Balance ≥ ₹500',   check: (s, txns) => spBalance(s, txns) >= 500 },
  { id: 'r1000',   icon: '💎', name: '₹1000 Club',    sub: 'Balance ≥ ₹1,000', check: (s, txns) => spBalance(s, txns) >= 1000 },
  { id: 'streak5', icon: '🔥', name: '5-Week Streak', sub: '5 weeks in a row',  check: (s, txns) => spStreak(txns) >= 5 },
  { id: 'r2000',   icon: '👑', name: '₹2000 Club',    sub: 'Balance ≥ ₹2,000', check: (s, txns) => spBalance(s, txns) >= 2000 },
];

function spBalance(s, txns) {
  const d = txns.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
  const w = txns.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0);
  return (parseFloat(s.openingBalance) || 0) + d - w;
}

function spStreak(txns) {
  if (!txns.length) return 0;
  const weeks = new Set(txns.filter(t => t.type === 'deposit' && t.date).map(t => {
    const d = new Date(t.date + 'T00:00:00'), jan1 = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + 'W' + Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  }));
  let streak = 0; const now = new Date();
  for (let i = 0; i < 52; i++) {
    const d = new Date(now - i * 7 * 86400000), jan1 = new Date(d.getFullYear(), 0, 1);
    const wk = d.getFullYear() + 'W' + Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    if (weeks.has(wk)) streak++; else if (i > 0) break;
  }
  return streak;
}

function spNav(view) {
  ['home', 'passbook', 'challenge', 'fees'].forEach(v => {
    const el = document.getElementById('sp-view-' + v); if (el) el.style.display = v === view ? 'block' : 'none';
  });
  ['home', 'passbook', 'challenge', 'fees'].forEach(v => {
    const btn = document.getElementById('sp-nav-' + v); if (btn) btn.classList.toggle('active', v === view);
  });
  if (view === 'home')      renderStudentHome();
  if (view === 'passbook')  renderStudentPassbook();
  if (view === 'challenge') renderStudentChallenge();
  if (view === 'fees')      renderStudentFees();
}

function _baseRenderStudentHome() {
  const s = _spStudent, txns = _spTxns; if (!s) return;
  const bal = spBalance(s, txns);
  document.getElementById('sp-school-name').textContent  = s._schoolName || '';
  document.getElementById('sp-student-name').textContent = s.name || '';
  document.getElementById('sp-student-acc').textContent  = 'A/C: ' + (s.accountNumber || '');
  document.getElementById('sp-class-badge').textContent  = 'Class ' + (s.class || '—') + ' · Roll ' + (s.rollNumber || '—');
  countUp(document.getElementById('sp-balance'), bal, 700);
  const goal     = parseFloat(s.savingsGoal) || 0;
  const goalCard = document.getElementById('sp-goal-card');
  if (goal > 0) {
    goalCard.style.display = 'block';
    const pct = Math.min(100, Math.round(bal / goal * 100));
    document.getElementById('sp-goal-pct').textContent   = pct + '%';
    document.getElementById('sp-goal-fill').style.width  = pct + '%';
    const rem = Math.max(0, goal - bal);
    document.getElementById('sp-goal-sub').textContent   = rem > 0 ? `₹${rem.toLocaleString('en-IN')} more to reach your ₹${goal.toLocaleString('en-IN')} goal!` : '🎉 Goal reached! Well done!';
  } else { goalCard.style.display = 'none'; }
  const badgeEl = document.getElementById('sp-badges-row');
  badgeEl.innerHTML = SP_BADGES.map(b => { const earned = b.check(s, txns); return `<div class="sp-badge ${earned ? 'earned' : 'locked'}" title="${b.sub}"><span class="sp-badge-icon">${b.icon}</span><div class="sp-badge-name">${b.name}</div><div class="sp-badge-sub">${earned ? '✓ Earned' : 'Locked'}</div></div>`; }).join('');
  const recent = txns.slice(0, 5);
  document.getElementById('sp-recent-txns').innerHTML = recent.length
    ? recent.map(t => { const isD = t.type === 'deposit'; return `<div class="sp-pb-txn stagger-item"><div class="sp-pb-dot ${t.type}">${isD ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>' : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>'}</div><div style="flex:1"><div style="font-weight:700;font-size:.85rem;color:${isD ? 'var(--green)' : 'var(--red)'}">${isD ? '+' : '-'}${fmt(t.amount)}</div><div style="font-size:.72rem;color:var(--muted)">${esc(t.note || 'No note')} · ${fmtDate(t.date)}</div></div></div>`; }).join('')
    : `<div style="text-align:center;padding:20px;color:var(--muted);font-size:.82rem">No transactions yet</div>`;
}

function renderStudentHome() {
  _baseRenderStudentHome();
  const s = _spStudent, txns = _spTxns; if (!s) return;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthDeps = txns.filter(t => t.type === 'deposit' && t.date && t.date.startsWith(thisMonth)).reduce((a, t) => a + t.amount, 0);
  const streak    = spStreak(txns);
  const statsHTML = `<div class="sp-stats-row"><div class="sp-stat-mini"><div class="sp-stat-mini-val" style="color:var(--green)">${fmt(monthDeps)}</div><div class="sp-stat-mini-lbl">This Month</div></div><div class="sp-stat-mini"><div class="sp-stat-mini-val" style="color:var(--purple)">${streak}</div><div class="sp-stat-mini-lbl">Week Streak</div></div><div class="sp-stat-mini"><div class="sp-stat-mini-val" style="color:var(--navy)">${txns.filter(t => t.type === 'deposit').length}</div><div class="sp-stat-mini-lbl">Deposits</div></div></div>`;
  const goalCard  = document.getElementById('sp-goal-card');
  if (goalCard) {
    let statsEl = document.getElementById('sp-stats-injected');
    if (!statsEl) { statsEl = document.createElement('div'); statsEl.id = 'sp-stats-injected'; goalCard.insertAdjacentElement('afterend', statsEl); }
    statsEl.innerHTML = statsHTML;
  }
}

function renderStudentPassbook() {
  const s = _spStudent, txns = _spTxns; if (!s) return;
  const bal  = spBalance(s, txns);
  const deps = txns.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
  const wds  = txns.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0);
  document.getElementById('sp-pb-name').textContent = s.name || '';
  document.getElementById('sp-pb-meta').textContent = `A/C: ${s.accountNumber || ''} · Class ${s.class || '—'} · Roll ${s.rollNumber || '—'}`;
  document.getElementById('sp-pb-deps').textContent = fmt((parseFloat(s.openingBalance) || 0) + deps);
  document.getElementById('sp-pb-wds').textContent  = fmt(wds);
  document.getElementById('sp-pb-bal').textContent  = fmt(bal);
  const monthMap = {};
  txns.filter(t => t.type === 'deposit' && t.date).forEach(t => { const m = t.date.slice(0, 7); monthMap[m] = (monthMap[m] || 0) + t.amount; });
  const months = Object.keys(monthMap).sort().slice(-6);
  if (months.length) {
    const maxV = Math.max(...months.map(m => monthMap[m]));
    const bw   = Math.floor((280 - months.length * 5) / months.length);
    document.getElementById('sp-monthly-chart').innerHTML =
      `<svg width="100%" viewBox="0 0 300 80" style="overflow:visible">${months.map((m, i) => { const bh = Math.max(4, Math.round((monthMap[m] / maxV) * 52)); const x = i * (bw + 5); const lbl = new Date(m + '-01').toLocaleDateString('en-IN', { month: 'short' }); return `<rect x="${x}" y="${64 - bh}" width="${bw}" height="${bh}" rx="3" fill="var(--green)" opacity="${.5 + .5 * (i / (months.length - 1 || 1))}" style="animation:staggerFadeUp .4s ${i * 60}ms cubic-bezier(.22,1,.36,1) both"/><text x="${x + bw / 2}" y="76" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="Nunito,sans-serif">${lbl}</text>`; }).join('')}</svg>`;
  } else {
    document.getElementById('sp-monthly-chart').innerHTML = `<div style="text-align:center;padding:12px;color:var(--muted);font-size:.8rem">No deposit data yet</div>`;
  }
  document.getElementById('sp-full-txns').innerHTML =
    [...txns].sort((a, b) => { const da = new Date((a.date || '') + 'T' + (a.time || '00:00')).getTime() || toMs(a); const db2 = new Date((b.date || '') + 'T' + (b.time || '00:00')).getTime() || toMs(b); return da - db2; })
    .map(t => { const isD = t.type === 'deposit'; return `<div class="sp-pb-txn"><div class="sp-pb-dot ${t.type}">${isD ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>' : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>'}</div><div style="flex:1"><div style="font-weight:700;font-size:.84rem;color:${isD ? 'var(--green)' : 'var(--red)'}">${isD ? '+' : '-'}${fmt(t.amount)}</div><div style="font-size:.7rem;color:var(--muted)">${esc(t.note || 'No note')} · ${fmtDate(t.date)}</div></div><div style="font-family:'Fraunces',serif;font-size:.95rem;font-weight:700;color:var(--navy)">${fmt(spBalance(s, txns.filter(tx => toMs(tx) <= toMs(t))))}</div></div>`; }).join('')
    || `<div style="text-align:center;padding:20px;color:var(--muted);font-size:.82rem">No transactions recorded</div>`;
}

function printStudentPassbook() {
  const s = _spStudent, txns = _spTxns; if (!s) return;
  const bal = spBalance(s, txns);
  let running = parseFloat(s.openingBalance) || 0;
  const rows = [...txns].sort((a, b) => toMs(a) - toMs(b)).map(t => { running += t.type === 'deposit' ? t.amount : -t.amount; return `<tr><td>${fmtDate(t.date)}</td><td>${esc(t.note || '—')}</td><td style="color:#2A7A54;font-weight:600">${t.type === 'deposit' ? '+' + fmt(t.amount) : ''}</td><td style="color:#C04040;font-weight:600">${t.type === 'withdrawal' ? '-' + fmt(t.amount) : ''}</td><td style="font-weight:700">${fmt(running)}</td></tr>`; }).join('');
  document.getElementById('print-area').innerHTML = `<div style="padding:18px;font-family:sans-serif;max-width:560px;margin:0 auto;"><div style="text-align:center;border-bottom:2px solid #1A3A5C;padding-bottom:12px;margin-bottom:14px;"><div style="font-size:1.1rem;font-weight:700;color:#1A3A5C">${esc(s._schoolName || '')}</div><div style="font-size:.8rem;color:#555;margin-top:2px;">Student Savings Bank — Personal Passbook</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;"><div><b>Name:</b> ${esc(s.name || '')}</div><div><b>Account:</b> ${esc(s.accountNumber || '')}</div><div><b>Class:</b> ${esc(s.class || '—')}</div><div><b>Balance:</b> <b style="color:#2A7A54">${fmt(bal)}</b></div></div><table style="width:100%;border-collapse:collapse;font-size:.82rem;"><thead><tr style="background:#1A3A5C;color:#fff;"><th style="padding:7px 8px;text-align:left">Date</th><th style="padding:7px 8px;text-align:left">Note</th><th style="padding:7px 8px">Deposit</th><th style="padding:7px 8px">Withdraw</th><th style="padding:7px 8px">Balance</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:12px">No transactions yet</td></tr>'}</tbody></table><div style="margin-top:14px;font-size:.7rem;color:#aaa;text-align:center;">Printed ${new Date().toLocaleDateString('en-IN')} · ${esc(s._schoolName || '')}</div></div>`;
  document.getElementById('print-area').style.display = 'block';
  window.print();
  document.getElementById('print-area').style.display = 'none';
}

const SP_MILESTONES = [
  { icon: '🌱', label: 'First Deposit',  desc: 'Make your first deposit',       check: (s, txns) => txns.filter(t => t.type === 'deposit').length >= 1,  target: 1,  unit: 'deposit' },
  { icon: '💧', label: '5 Deposits',     desc: 'Make 5 deposits total',         check: (s, txns) => txns.filter(t => t.type === 'deposit').length >= 5,  target: 5,  unit: 'deposits' },
  { icon: '🌊', label: '10 Deposits',    desc: 'Make 10 deposits',              check: (s, txns) => txns.filter(t => t.type === 'deposit').length >= 10, target: 10, unit: 'deposits' },
  { icon: '💰', label: 'Save ₹500',      desc: 'Reach ₹500 balance',            check: (s, txns) => spBalance(s, txns) >= 500,  target: 500,  unit: '₹ balance' },
  { icon: '💎', label: 'Save ₹1000',     desc: 'Reach ₹1,000 balance',          check: (s, txns) => spBalance(s, txns) >= 1000, target: 1000, unit: '₹ balance' },
  { icon: '🏆', label: 'Save ₹2000',     desc: 'Reach ₹2,000 balance',          check: (s, txns) => spBalance(s, txns) >= 2000, target: 2000, unit: '₹ balance' },
  { icon: '🔥', label: '3-Week Streak',  desc: 'Deposit 3 weeks in a row',      check: (s, txns) => spStreak(txns) >= 3,  target: 3,  unit: 'week streak' },
  { icon: '⚡', label: '5-Week Streak',  desc: 'Deposit 5 weeks in a row',      check: (s, txns) => spStreak(txns) >= 5,  target: 5,  unit: 'week streak' },
  { icon: '👑', label: '10-Week Streak', desc: 'Deposit 10 weeks in a row',     check: (s, txns) => spStreak(txns) >= 10, target: 10, unit: 'week streak' },
];

function renderStudentChallenge() {
  const s = _spStudent, txns = _spTxns; if (!s) return;
  document.getElementById('sp-ch-school').textContent = s._schoolName || '';
  const streak = spStreak(txns);
  document.getElementById('sp-streak-num').textContent = streak;
  const msgs = ['Make a deposit this week to start your streak!', 'Great start! Keep going next week! 💪', '2 weeks strong! Don\'t break it now! 🔥', 'Amazing streak! You\'re on fire! 🔥🔥', 'Incredible! A month of savings! 🌟', 'Unstoppable! Keep the streak alive! 👑'];
  document.getElementById('sp-streak-msg').textContent = msgs[Math.min(streak, msgs.length - 1)];
  const now       = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const depositDays = new Set(txns.filter(t => t.type === 'deposit' && t.date && t.date.startsWith(now.toISOString().slice(0, 7))).map(t => parseInt(t.date.split('-')[2])));
  const todayDay  = now.getDate(), startDow = monthStart.getDay();
  let gridHTML    = '';
  ['S','M','T','W','T','F','S'].forEach(d => { gridHTML += `<div style="font-size:.58rem;font-weight:800;color:var(--muted);text-align:center;padding-bottom:3px;">${d}</div>`; });
  for (let i = 0; i < startDow; i++) gridHTML += `<div class="sp-week-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isActive = depositDays.has(d), isToday = d === todayDay;
    gridHTML += `<div class="sp-week-day ${isActive ? 'active' : isToday ? 'today' : 'empty'}" title="${d}">${d}</div>`;
  }
  document.getElementById('sp-week-grid').innerHTML = gridHTML;
  const monthTotal = txns.filter(t => t.type === 'deposit' && t.date && t.date.startsWith(now.toISOString().slice(0, 7))).reduce((a, t) => a + t.amount, 0);
  document.getElementById('sp-month-dep-total').textContent = monthTotal > 0 ? `Total deposited this month: ${fmt(monthTotal)}` : 'No deposits this month yet';
  const done   = SP_MILESTONES.filter(m => m.check(s, txns));
  const next   = SP_MILESTONES.find(m => !m.check(s, txns));
  const locked = SP_MILESTONES.filter(m => !m.check(s, txns)).slice(1);
  document.getElementById('sp-milestones-list').innerHTML = [
    ...done.map(m  => `<div class="sp-milestone-row stagger-item"><div class="sp-milestone-icon done">${m.icon}</div><div style="flex:1"><div style="font-weight:800;font-size:.88rem;color:var(--navy)">${m.label}</div><div style="font-size:.72rem;color:var(--muted);margin-top:2px">${m.desc}</div></div><span class="badge active" style="flex-shrink:0;">✓ Done</span></div>`),
    next ? `<div class="sp-milestone-row stagger-item" style="border:2px solid var(--gold);"><div class="sp-milestone-icon next">${next.icon}</div><div style="flex:1"><div style="font-weight:800;font-size:.88rem;color:var(--navy)">${next.label} <span style="font-size:.65rem;background:var(--gold-p);color:var(--gold);padding:2px 8px;border-radius:100px;font-weight:800;">NEXT</span></div><div style="font-size:.72rem;color:var(--muted);margin-top:2px">${next.desc}</div></div></div>` : '',
    ...locked.map(m => `<div class="sp-milestone-row stagger-item"><div class="sp-milestone-icon locked">${m.icon}</div><div style="flex:1"><div style="font-weight:700;font-size:.86rem;color:var(--muted)">${m.label}</div><div style="font-size:.71rem;color:var(--muted);margin-top:2px">${m.desc}</div></div><span style="font-size:.7rem;color:var(--muted);">🔒</span></div>`),
  ].join('');
}

async function renderStudentFees() {
  const s = _spStudent; if (!s) return;
  document.getElementById('sp-fee-school').textContent = s._schoolName || '';
  const el = document.getElementById('sp-fee-list');
  el.innerHTML = `<div style="text-align:center;padding:18px;color:var(--muted);font-size:.82rem">Loading…</div>`;
  try {
    const snap = await db.collection('schools').doc(s._schoolCode).collection('fees').where('studentId', '==', s.id).orderBy('createdAt', 'desc').get();
    const fees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const paid    = fees.filter(f => f.status === 'paid');
    const pending = fees.filter(f => f.status === 'pending');
    const overdue = fees.filter(f => f.status === 'overdue' || (f.status === 'pending' && f.dueDate && f.dueDate < today()));
    document.getElementById('sp-fee-paid-count').textContent    = paid.length;
    document.getElementById('sp-fee-pending-count').textContent = pending.length;
    document.getElementById('sp-fee-overdue-count').textContent = overdue.length;
    if (!fees.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-title">No Fee Records</div><div class="empty-sub">Your teacher hasn't added any fee dues yet</div></div>`; return; }
    el.innerHTML = fees.map(f => {
      const isOverdue = f.status === 'pending' && f.dueDate && f.dueDate < today();
      const status    = isOverdue ? 'overdue' : f.status || 'pending';
      return `<div class="sp-fee-item stagger-item"><div class="sp-fee-dot ${status}"></div><div style="flex:1;min-width:0;"><div style="font-weight:800;font-size:.88rem;color:var(--navy)">${esc(f.title || 'Fee')}</div><div style="font-size:.72rem;color:var(--muted);margin-top:2px">${f.dueDate ? 'Due: ' + fmtDate(f.dueDate) : ''} ${f.paidDate ? '· Paid: ' + fmtDate(f.paidDate) : ''}</div>${f.note ? `<div style="font-size:.69rem;color:var(--muted);margin-top:1px">${esc(f.note)}</div>` : ''}</div><div style="text-align:right;flex-shrink:0;"><div style="font-family:var(--font-display);font-size:1rem;font-weight:700;color:var(--navy)">${fmt(f.amount || 0)}</div><span class="sp-fee-badge ${status}">${status === 'paid' ? '✓ Paid' : status === 'overdue' ? 'Overdue' : 'Pending'}</span></div></div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div style="padding:14px;font-size:.8rem;color:var(--muted)">No fee records found.</div>`;
  }
}