// ─── TRANSACTION SERVICE ──────────────────────────────────────────
// Handles saving and deleting transactions.
// Kept separate from student.service.js because transaction logic
// (validation, balance checks, audit trail) is its own concern.
// Nothing in this file touches the DOM.

// ── State ─────────────────────────────────────────────────────────
let currentTxnType = 'deposit';
let currentTxnCat  = 'savings';
let deleteTxnId    = null;

// ── Save transaction ──────────────────────────────────────────────
// Called by the transaction modal submit button.
// Validates amount, checks balance for withdrawals, then writes to Firestore.
async function saveTransaction() {
  const s = DB.getStudentById(currentStudentId);
  if (!s) return;

  const amtRaw = document.getElementById('txn-amount').value;
  const amt    = parseFloat(amtRaw);

  // Validation
  if (!amtRaw || isNaN(amt) || amt <= 0) {
    showToast('Enter a valid amount (greater than 0)', 'error'); return;
  }
  if (!Number.isFinite(amt) || amt > 1000000) {
    showToast('Amount seems too large — please check', 'error'); return;
  }
  if (amt !== Math.floor(amt)) {
    showToast('Amount must be a whole number (no decimals)', 'error'); return;
  }
  if (currentTxnType === 'withdrawal') {
    const bal = DB.getBalance(currentStudentId);
    if (amt > bal) {
      showToast(`Insufficient balance! Available: ${fmt(bal)}`, 'error'); return;
    }
  }

  const btn = document.getElementById('save-txn-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Saving…';

  const txn = {
    id:            uuid(),
    studentId:     s.id,
    accountNumber: s.accountNumber,
    studentName:   s.name,
    class:         s.class,
    type:          currentTxnType,
    amount:        amt,
    date:          document.getElementById('txn-date').value || today(),
    note:          document.getElementById('txn-note').value.trim(),
    category:      currentTxnCat || 'savings',
    time:          new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    timestamp:     Date.now(),
  };

  try {
    await DB.addTransaction(txn);
    closeModal('txn-modal');
    showToast(
      `${currentTxnType === 'deposit' ? 'Deposit' : 'Withdrawal'} of ${fmt(amt)} recorded!`,
      'success'
    );
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✅ Record Transaction';
  }
}

// ── Open delete transaction modal ─────────────────────────────────
function openDeleteTxn(txnId) {
  if (STATE.teacher?.role !== 'manager') {
    showToast('Only manager can delete transactions', 'error'); return;
  }
  const t = STATE.transactions.find(x => x.id === txnId);
  if (!t) return;

  deleteTxnId = txnId;
  document.getElementById('del-txn-preview').innerHTML =
    `<strong>${t.type === 'deposit' ? '⬆️ Deposit' : '⬇️ Withdrawal'}</strong> of <strong>${fmt(t.amount)}</strong>` +
    `<br>Student: ${esc(t.studentName || '')} · ${fmtDate(t.date)}` +
    `<br>Note: ${esc(t.note || 'No note')}`;
  document.getElementById('del-txn-reason').value = '';
  document.getElementById('del-txn-modal').classList.add('active');
}

// ── Confirm delete transaction ────────────────────────────────────
// Writes to audit trail first, then deletes the Firestore document.
async function confirmDeleteTxn() {
  const reason = document.getElementById('del-txn-reason').value.trim();
  if (!reason) { showToast('Please enter a reason', 'error'); return; }
  if (!deleteTxnId) return;

  const btn = document.querySelector('#del-txn-modal .btn-danger');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';

  try {
    const t         = STATE.transactions.find(x => x.id === deleteTxnId);
    const balBefore = t ? DB.getBalance(t.studentId) : null;

    // Audit — write a full copy before deleting
    if (t) {
      await auditDelete('transaction', {
        originalId:          deleteTxnId,
        studentId:           t.studentId,
        studentName:         t.studentName    || '',
        accountNumber:       t.accountNumber  || '',
        amount:              t.amount,
        type:                t.type,
        category:            t.category       || '',
        date:                t.date           || '',
        note:                t.note           || '',
        createdBy:           t.createdBy      || '',
        createdByName:       t.createdByName  || '',
        originalCreatedAt:   t.createdAt      || null,
        balanceBeforeDeletion: balBefore,
        deletionReason:      reason,
      });
    }

    await txnsRef().doc(deleteTxnId).delete();

    deleteTxnId = null;
    document.querySelectorAll('.txn-item-wrap.del-active')
      .forEach(w => w.classList.remove('del-active'));
    closeModal('del-txn-modal');
    showToast('Transaction deleted', 'warn');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    btn.disabled    = false;
    btn.textContent = 'Delete';
  }
}

// ── Transaction type toggle ───────────────────────────────────────
function setTxnType(type) {
  currentTxnType = type;
  document.getElementById('type-btn-dep').classList.toggle('active', type === 'deposit');
  document.getElementById('type-btn-wd').classList.toggle('active',  type === 'withdrawal');
  document.getElementById('modal-title').textContent =
    type === 'deposit' ? '⬆️ Record Deposit' : '⬇️ Record Withdrawal';
}

// ── Category selector ─────────────────────────────────────────────
const CAT_LABELS = {
  savings:  '💰 Savings',
  fees:     '📚 Fees',
  fine:     '⚠️ Fine',
  donation: '🎁 Donation',
  other:    '📦 Other',
};

function selectCat(cat) {
  currentTxnCat = cat;
  document.querySelectorAll('.cat-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
}

// ── Open transaction modal ────────────────────────────────────────
function openTxnModal(type) {
  if (!currentStudentId || !DB.getStudentById(currentStudentId)) {
    showToast('Select a student first', 'error'); return;
  }
  currentTxnType = type;
  setTxnType(type);
  currentTxnCat = 'savings';
  selectCat('savings');
  document.getElementById('txn-amount').value = '';
  document.getElementById('txn-date').value   = today();
  document.getElementById('txn-note').value   = '';
  renderPresetRow();
  document.querySelectorAll('.txn-item-wrap.del-active')
    .forEach(w => w.classList.remove('del-active'));
  document.getElementById('txn-modal').classList.add('active');
  setTimeout(() => document.getElementById('txn-amount').focus(), 120);
}