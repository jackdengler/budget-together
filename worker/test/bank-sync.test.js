// Tests for docs/bank-sync.js (the browser-side merge shared by both app pages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../docs/bank-sync.js';
const { mergeSync, defaultStartAfter, syncAll, summary } = globalThis.BankSync;

let n = 0;
const helpers = {
  uid: () => 'id' + (++n),
  categorize: (d) => (/vons/i.test(d) ? 'groceries' : 'other'),
  applyRules: (d) => (/conservatory/i.test(d) ? { category: 'groceries', shared: true, person: 'p1' } : null),
};
const item = { itemId: 'i1', owner: 'p1', startAfter: '2026-08-31' };
const row = (o) => ({ plaidId: 'x', date: '2026-09-05', description: 'VONS #2100', amount: 20, account: 'Card ••9', suggestedCategory: null, ...o });

test('adds new rows to review with rules > Plaid hint > keywords; respects startAfter', () => {
  const r = mergeSync({ transactions: [], pendingReview: [] }, item, {
    added: [
      row({ plaidId: 'a' }),
      row({ plaidId: 'b', description: 'SQ *THE CONSERVATORY F' }),
      row({ plaidId: 'c', description: 'CAPITAL ONE MOBILE PYMT', amount: 3088.02, suggestedCategory: 'transfer' }),
      row({ plaidId: 'old', date: '2026-08-31' }),
    ], modified: [], removed: [], nextCursor: 'cur1' }, helpers);
  assert.deepEqual(r.pendingReview.map((t) => [t.plaidId, t.category, t.shared]), [['a', 'groceries', false], ['b', 'groceries', true], ['c', 'transfer', false]]);
  assert.equal(r.pendingReview[0].person, 'p1');
  assert.equal(r.pendingReview[0].account, 'Card ••9');
  assert.equal(r.cursor, 'cur1');
  assert.equal(r.stats.added, 3);
});

test('skips rows already saved/pending by plaidId or by the legacy date|desc|amount|person key', () => {
  const saved = { id: 's', plaidId: 'a', date: '2026-09-05', description: 'VONS #2100', amount: 20, person: 'p1' };
  const csv = { id: 'c', date: '2026-09-06', description: 'RALPHS #0156', amount: 9.98, person: 'p1' };
  const r = mergeSync({ transactions: [saved], pendingReview: [csv] }, item, {
    added: [row({ plaidId: 'a' }), row({ plaidId: 'z', date: '2026-09-06', description: 'RALPHS #0156', amount: 9.98 })], modified: [], removed: [], nextCursor: 'c' }, helpers);
  assert.equal(r.stats.added, 0);
  assert.equal(r.pendingReview.length, 1);
});

test('modified updates amount/date (not user fields); removed drops unsettled; settled is frozen', () => {
  const state = {
    transactions: [
      { id: '1', plaidId: 'm', date: '2026-09-01', description: 'A', amount: 10, category: 'dining', shared: true, person: 'p1' },
      { id: '2', plaidId: 'gone', date: '2026-09-01', description: 'B', amount: 5, person: 'p1' },
      { id: '3', plaidId: 'frozen', date: '2026-09-01', description: 'C', amount: 5, person: 'p1', settled: true },
    ],
    pendingReview: [{ id: '4', plaidId: 'gone2', date: '2026-09-02', description: 'D', amount: 1, person: 'p1' }],
  };
  const r = mergeSync(state, item, { added: [], modified: [row({ plaidId: 'm', amount: 12.5, date: '2026-09-02' }), row({ plaidId: 'frozen', amount: 99 })],
    removed: ['gone', 'gone2', 'frozen'], nextCursor: 'c' }, helpers);
  const m = r.transactions.find((t) => t.plaidId === 'm');
  assert.equal(m.amount, 12.5); assert.equal(m.date, '2026-09-02'); assert.equal(m.category, 'dining'); assert.equal(m.shared, true);
  assert.ok(!r.transactions.some((t) => t.plaidId === 'gone'));
  assert.equal(r.transactions.find((t) => t.plaidId === 'frozen').amount, 5);
  assert.equal(r.pendingReview.length, 0);
  assert.deepEqual(r.stats, { added: 0, updated: 1, removed: 2 });
  assert.equal(state.transactions.length, 3); // inputs untouched
});

test('defaultStartAfter = latest date for that person', () => {
  assert.equal(defaultStartAfter([{ person: 'p1', date: '2026-08-31' }, { person: 'p2', date: '2026-09-30' }, { person: 'p1', date: '2026-07-01' }], 'p1'), '2026-08-31');
});

test('syncAll: one bank failing (re-login) does not lose the others; cursors advance only on success', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init.body);
    if (b.itemId === 'bad') return new Response(JSON.stringify({ error: 'login required', code: 'ITEM_LOGIN_REQUIRED' }), { status: 400 });
    return new Response(JSON.stringify({ added: [row({ plaidId: 'ok1' })], modified: [], removed: [], nextCursor: 'new' }), { status: 200 });
  };
  try {
    const out = await syncAll('gh', { plaid: { apiUrl: 'https://api/', items: [
      { itemId: 'good', institution: 'SoFi', owner: 'p1', startAfter: '2026-08-31', cursor: 'old' },
      { itemId: 'bad', institution: 'Capital One', owner: 'p1', startAfter: '2026-08-31', cursor: 'old2' } ] },
      transactions: [], pendingReview: [] }, helpers);
    assert.equal(out.pendingReview.length, 1);
    assert.equal(out.plaid.items[0].cursor, 'new');
    assert.equal(out.plaid.items[1].cursor, 'old2');
    assert.equal(out.plaid.items[1].needsReauth, true);
    assert.equal(out.plaid.apiUrl, 'https://api');
    assert.match(summary(out.totals), /1 new to review · ⚠ Capital One: reconnect needed/);
  } finally { globalThis.fetch = realFetch; }
});
