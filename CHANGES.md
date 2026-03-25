# Student Bank — Changes & Security Fixes

## Critical Security Fixes Applied

### 1. Firestore Security Rules (`firestore.rules`)
**Before:** No rules. Any authenticated user could read/write any school's data.
**After:** Full role-based rules.
- School data is scoped to `schools/{schoolCode}` — teachers can only access their own school
- Withdrawals must come from active teachers (`status != 'removed'`)
- Transactions are **immutable** after creation (`allow update: if false`)
- Only managers can delete students, transactions, rollover, reset
- Students (anonymous auth) can only update their own `studentPinHash` and `anonUid` fields
- Super admins have full access only to the `superAdmins` collection
- Deny-all catch-all at the bottom

### 2. Atomic Withdrawal — Race Condition Fixed (`transaction.service.js`)
**Before:** Balance check happened client-side from in-memory STATE. Two teachers could race and overdraw.
**After:** Withdrawals use `db.runTransaction()` — atomically reads the stored `balance` field, checks it server-side, and decrements it in one atomic operation. Overdraft is impossible.

### 3. Balance Field — O(n²) Performance Fix (`student.service.js`)
**Before:** `DB.getBalance(id)` iterated all transactions on every call. Rendering 200 students = 200 × n iterations.
**After:** A `balance` field is stored directly on each student document and maintained atomically:
- Deposits: `FieldValue.increment(+amount)`
- Withdrawals: `FieldValue.increment(-amount)` (inside a Firestore transaction)
- Deletions: reversal increment in a batch
- A one-time migration (`migrateBalanceFields()`) runs on first login to backfill old records.

### 4. Student Login Rate Limiting (`validators.js` — `RateLimiter`)
**Before:** No rate limiting. 4-digit PINs could be brute-forced in 10,000 tries.
**After:** `RateLimiter` in `sessionStorage` tracks per-account failure count. After 5 failures, the account is locked for 15 minutes. Error messages show remaining attempts.

### 5. `anonUid` Written to Student on Login (`portal.controller.js`)
**Before:** Anonymous students had no server-side identity — Security Rules couldn't distinguish them.
**After:** On successful login, the student's current Firebase anonymous UID is stored as `anonUid` on their Firestore document. Security Rules use this to scope student portal reads.

### 6. Firestore Auto-IDs for Transactions (`transaction.controller.js`)
**Before:** `uuid()` used `Date.now() + Math.random()` — collision-prone for financial records.
**After:** Transaction IDs use `db.collection('_').doc().id` — Firestore's cryptographically safe auto-ID.

### 7. Duplicate Scripts Removed (`superadmin.html`)
Chart.js and jsPDF were loaded twice. Now loaded once.

### 8. Input Validation Centralized (`validators.js`)
All inputs — student name, account number, amount, PIN, phone, email, password, school code, import rows — are validated through `Validators.*` before any Firestore write.

### 9. Balance Field Maintained on Student Delete (`student.service.js`)
When deleting a student, all their transactions are batch-deleted first, then the student document. The balance field stays consistent throughout.

---

## Architecture Improvements

### Module Separation
The 5,540-line monolith is now split across 17 focused files:

```
js/
  state/store.js              — single STATE object + balance cache
  utils/helpers.js            — pure utility functions
  utils/validators.js         — all input validation + rate limiter
  config/firebase.js          — Firebase init + collection refs
  services/
    auth.service.js           — Firebase Auth operations
    student.service.js        — Student CRUD + balance field
    transaction.service.js    — Atomic deposit/withdrawal/delete
  ui/
    toast.js                  — toast, modal, auth screen helpers
    navigation.js             — routing, listeners, view dispatch
    pin.js                    — PIN screen, idle timer, hash/verify
    render/
      views.js                — all DOM render functions
      idcard.js               — Canvas ID card drawing
  controllers/
    auth.controller.js        — login/register/join form handlers
    portal.controller.js      — student portal login + session
    student.controller.js     — student CRUD form handlers
    transaction.controller.js — transaction form + daily log + export
    school.controller.js      — teachers, settings, import, scanner
```

### No Direct DB Calls from UI
All Firestore writes go through `StudentService`, `TransactionService`, `SchoolService`, or `AuthService`. UI controllers call services, never `db.*` directly.

---

## Firebase Security Rules — Deployment

Deploy with Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
firebase init firestore
# Copy firestore.rules to your project
firebase deploy --only firestore:rules
```

Or paste `firestore.rules` directly into Firebase Console → Firestore → Rules.

---

## Remaining Risks

1. **Firebase API key is still in the HTML** — safe only if Security Rules are deployed correctly. For higher security, use Firebase App Check or move the app behind a domain restriction in Firebase Console → Authentication → Authorized domains.

2. **Student PIN verification is still client-side** — the hash comparison happens in the browser. The `anonUid` approach + Security Rules limits exposure, but for true server-side verification, move to a Cloud Function.

3. **WhatsApp bulk messaging** — still uses `window.open()` in a loop. Will be blocked by popup blockers for large lists. A proper solution requires a WhatsApp Business API integration.

4. **All transactions still loaded in memory** — for schools with >1,000 students over multiple years, add Firestore query pagination (`.limit(500).startAfter(lastDoc)`).

5. **No environment separation** — use a separate Firebase project for development vs production.
