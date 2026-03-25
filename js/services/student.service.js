// ─── STUDENT SERVICE ──────────────────────────────────────────────
// All Firestore reads and writes for students and transactions.
// Nothing in this file touches the DOM.
// UI controllers call these functions — never call db.* directly from HTML.

// ── Audit helper ──────────────────────────────────────────────────
// Writes a copy of any deleted record to deletedAudit before removal.
// Called by deleteStudent and deleteTransaction.
// Failures are silent — audit should never block the actual deletion.
async function auditDelete(type, data) {
  try {
    await db.collection('schools').doc(STATE.schoolCode)
      .collection('deletedAudit')
      .add({
        ...data,
        deletedBy:     STATE.user?.uid     || 'unknown',
        deletedByName: STATE.teacher?.name || 'unknown',
        deletedByRole: STATE.teacher?.role || 'unknown',
        schoolCode:    STATE.schoolCode,
        schoolName:    STATE.schoolName,
        deletedAt:     firebase.firestore.FieldValue.serverTimestamp(),
        _auditType:    type,
      });
  } catch (e) {
    console.warn('Audit write failed:', e.message);
  }
}

// ── DB object — main data access layer ───────────────────────────
const DB = {

  // ── Reads (from in-memory STATE — no Firestore calls) ──────────
  getStudents:     ()  => STATE.students,
  getTransactions: ()  => STATE.transactions,
  getStudentById:  id  => STATE.students.find(s => s.id === id) || null,
  getStudentByAcc: acc => STATE.students.find(s => s.accountNumber === acc) || null,

  // Balance is computed from openingBalance + all deposits − all withdrawals.
  // Called frequently so kept as a simple reduce — acceptable for typical
  // school sizes (< 500 students, < 5000 transactions total in memory).
  getBalance(id) {
    const s = this.getStudentById(id);
    if (!s) return 0;
    const txns = STATE.transactions.filter(t => t.studentId === id);
    const deps = txns.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
    const wds  = txns.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0);
    return (parseFloat(s.openingBalance) || 0) + deps - wds;
  },

  getDeposits: id =>
    STATE.transactions
      .filter(t => t.studentId === id && t.type === 'deposit')
      .reduce((a, t) => a + t.amount, 0),

  getWithdrawals: id =>
    STATE.transactions
      .filter(t => t.studentId === id && t.type === 'withdrawal')
      .reduce((a, t) => a + t.amount, 0),

  // ── Create ──────────────────────────────────────────────────────
  async addStudent(s) {
    await studentsRef().doc(s.id).set({
      ...s,
      createdBy:     STATE.user.uid,
      createdByName: STATE.teacher.name,
      createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  // ── Update ──────────────────────────────────────────────────────
  async updateStudent(id, changes) {
    await studentsRef().doc(id).update({
      ...changes,
      updatedBy: STATE.user.uid,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  // ── Delete ──────────────────────────────────────────────────────
  // Writes to audit trail first, then deletes student + all their transactions.
  async deleteStudent(id) {
    const s        = this.getStudentById(id);
    const stuTxns  = STATE.transactions.filter(t => t.studentId === id);
    const bal      = this.getBalance(id);

    // Audit the student record
    try {
      await auditDelete('student', {
        originalId:        id,
        studentName:       s?.name         || '',
        accountNumber:     s?.accountNumber || '',
        class:             s?.class         || '',
        rollNumber:        s?.rollNumber    || '',
        openingBalance:    s?.openingBalance || 0,
        finalBalance:      bal,
        totalTransactions: stuTxns.length,
        kycVerified:       s?.kycVerified   || false,
        studentData:       s               || {},
      });

      // Audit each transaction that will be cascade-deleted
      for (const t of stuTxns) {
        await auditDelete('transaction_with_student', {
          originalId:     t.id,
          studentId:      id,
          studentName:    s?.name         || '',
          accountNumber:  s?.accountNumber || '',
          amount:         t.amount,
          type:           t.type,
          category:       t.category      || '',
          date:           t.date          || '',
          note:           t.note          || '',
          createdByName:  t.createdByName || '',
          deletionReason: 'Student account deleted',
        });
      }
    } catch (e) {
      console.warn('Student audit failed:', e.message);
    }

    // Delete the student document
    await studentsRef().doc(id).delete();

    // Batch-delete all their transactions
    const snap = await txnsRef().where('studentId', '==', id).get();
    if (snap.size > 0) {
      await batchChunked(snap.docs, (b, d) => b.delete(d.ref));
    }
  },

  // ── Transaction write ───────────────────────────────────────────
  async addTransaction(t) {
    await txnsRef().doc(t.id).set({
      ...t,
      createdBy:     STATE.user.uid,
      createdByName: STATE.teacher.name,
      createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
    });
  },
};