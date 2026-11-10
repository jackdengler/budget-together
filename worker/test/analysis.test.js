import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/analysis.js';

const T = (o) => ({ date: '2026-08-05', description: 'X', amount: 10, category: 'groceries', person: 'p1', shared: false, settled: false, excluded: false, ...o });
const data = {
  settings: { person1: 'Jack', person2: 'Jordan' },
  budgets: { groceries: 600, housing: 2200 },
  catSplits: { housing: { mode: 'dollar', p1Amt: 3000 }, groceries: { mode: 'pct', p1Pct: 60 } },
  customCategories: [{ id: 'pets', label: 'Pets' }],
  transactions: [
    T({ description: 'RENT', amount: 4800, category: 'housing', shared: true }),               // Aug rent, Jack pays $3000 of it
    T({ date: '2026-09-02', description: 'RENT', amount: 4800, category: 'housing', shared: true }),
    T({ description: 'VONS', amount: 100, shared: true }),                                      // 60/40
    T({ description: 'TJ', amount: 50, shared: true, person: 'p2' }),                           // Jordan paid, 60/40
    T({ description: 'OLD', amount: 200, shared: true, settled: true, settledSplit: 0.5 }),    // settled → excluded from outstanding
    T({ description: 'JACK SOLO', amount: 20 }),
    T({ description: 'JORDAN PRIVATE', amount: 70, person: 'p2' }),
    T({ description: 'CARD PMT', amount: 3000, category: 'transfer' }),
    T({ description: 'PAY', amount: -3363.53, category: 'income' }),
    T({ description: 'DK', amount: 25, category: 'gambling' }),
    T({ description: 'IGNORED', amount: 99, excluded: true }),
  ],
};

test('privacy: hides partner private + hidden categories by default', () => {
  const ctx = A.makeContext(data, {});
  const d = ctx.txns.map((t) => t.description);
  assert.ok(!d.includes('JORDAN PRIVATE'));
  assert.ok(!d.includes('DK'));
  assert.ok(d.includes('TJ')); // partner's shared stays
  const all = A.makeContext(data, { includeHidden: true, includePartnerPrivate: true });
  assert.ok(all.txns.some((t) => t.description === 'JORDAN PRIVATE'));
});

test('dollar split applies once per month; pct split; settled frozen', () => {
  const ctx = A.makeContext(data, {});
  const shared = ctx.txns.filter((t) => t.shared && A.isExpense(ctx, t));
  const { p1, p2 } = A.splitSharedByCat(ctx, shared);
  assert.equal(p1.housing, 6000);   // $3000 × 2 months
  assert.equal(p2.housing, 3600);
  assert.equal(p1.groceries, 90 + 100); // 60% of 150 + settled 200×0.5
  assert.equal(p2.groceries, 60 + 100);
});

test('split_summary outstanding matches calcSplit (positive = Jordan owes Jack)', () => {
  const s = A.splitSummary(A.makeContext(data, {}), {});
  // unsettled shared: rent 9600 (Jack paid), groceries 150 (Jack 100, Jordan 50)
  // Jack paid 9700; Jack share 6000 + 90 = 6090 → Jordan owes 3610
  assert.equal(s.outstanding.summary, 'Jordan owes Jack $3610.00');
  assert.equal(s.outstanding.netOwedTo.Jack, 3610);
  assert.equal(s.outstanding.unsettledTransactions, 4);
  const aug = A.splitSummary(A.makeContext(data, {}), { from: '2026-08', to: '2026-08' });
  assert.equal(aug.range.sharedTotal, 5150);
  assert.equal(aug.range.settledTotal, 200);
});

test('spending summary excludes transfers/excluded, per-person = solo + share', () => {
  const s = A.spendingSummary(A.makeContext(data, {}), { from: '2026-08', to: '2026-08' });
  const o = s.overall;
  assert.equal(o.spending.total, 4800 + 100 + 50 + 200 + 20);
  assert.equal(o.spending.Jack, 20 + 3000 + 90 + 100);
  assert.equal(o.income, 3363.53);
  const byCat = A.spendingSummary(A.makeContext(data, {}), { groupBy: 'category' });
  assert.ok(!byCat.rows.some((r) => r.category === 'transfer'));
});

test('list_transactions filters, sorts newest first, reports sign convention', () => {
  const ctx = A.makeContext(data, {});
  const r = A.listTransactions(ctx, { search: 'rent' });
  assert.equal(r.total, 2);
  assert.equal(r.transactions[0].date, '2026-09-02');
  assert.equal(r.transactions[0].person, 'Jack');
  assert.equal(A.listTransactions(ctx, { person: 'Jordan' }).total, 1);
  assert.equal(A.listTransactions(ctx, { from: '2026-09-01' }).total, 1);
  assert.equal(A.listTransactions(ctx, { limit: 2 }).returned, 2);
});

test('categories include custom ones, budgets, and spending flags', () => {
  const cats = A.listCategories(A.makeContext(data, {}));
  assert.equal(cats.find((c) => c.id === 'pets').label, 'Pets');
  assert.equal(cats.find((c) => c.id === 'transfer').countsAsSpending, false);
  assert.equal(cats.find((c) => c.id === 'housing').monthlyBudget, 2200);
  assert.equal(cats.find((c) => c.id === 'housing').type, 'fixed');
});

test('housing and budget vs actual', () => {
  const ctx = A.makeContext(data, {});
  const h = A.housing(ctx, {});
  assert.equal(h.months.length, 2);
  assert.equal(h.months[0].Jack, 3000);
  const b = A.budgetVsActual(ctx, { month: '2026-08' });
  assert.equal(b.rows.find((r) => r.category === 'housing').remaining, 2200 - 4800);
});
