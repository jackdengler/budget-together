import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTxn, classify, syncItem, exchangePublicToken, createLinkToken } from '../src/plaid.js';
import { memKV, router, ok } from './helpers.js';

const env = (kv) => ({ PLAID_ENV: 'sandbox', PLAID_CLIENT_ID: 'cid', PLAID_SECRET: 'sec', PLAID_KV: kv });
const tx = (o) => ({ transaction_id: 't1', account_id: 'a1', amount: 6.45, date: '2026-10-04', authorized_date: '2026-10-03',
  name: 'Starbucks', merchant_name: 'Starbucks', original_description: 'STARBUCKS  STORE 1234', pending: false,
  personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' }, ...o });

test('mapTxn uses purchase date, raw description, same sign, account label', () => {
  const m = mapTxn(tx(), { a1: { name: 'Checking', mask: '1234' } });
  assert.deepEqual(m, { plaidId: 't1', date: '2026-10-03', description: 'STARBUCKS STORE 1234', amount: 6.45,
    account: 'Checking ••1234', suggestedCategory: null, isPayroll: false, pending: false });
  assert.equal(mapTxn(tx({ authorized_date: null })).date, '2026-10-04');
  assert.equal(mapTxn(tx({ original_description: null })).description, 'Starbucks');
  assert.equal(mapTxn(tx({ amount: -3127.37 })).amount, -3127.37); // money in stays negative
});

test('classify: card payments/transfers → transfer, income → income, wages flagged payroll', () => {
  assert.equal(classify({ personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' } }).suggestedCategory, 'transfer');
  assert.equal(classify({ personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_SAVINGS' } }).suggestedCategory, 'transfer');
  assert.equal(classify({ personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_INTEREST_EARNED' } }).suggestedCategory, 'income');
  assert.equal(classify({ personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' } }).isPayroll, true);
  assert.equal(classify({ name: 'COMPENSIA PAYROLL', personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_OTHER_INCOME' } }).isPayroll, true);
  assert.equal(classify({ personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT' } }).suggestedCategory, null);
});

test('syncItem pages to the end, drops pending + payroll, returns cursor', async () => {
  const kv = memKV({ 'item:i1': JSON.stringify({ accessToken: 'access-1' }) });
  const pages = [
    { added: [tx(), tx({ transaction_id: 'p', pending: true })], modified: [], removed: [], next_cursor: 'c1', has_more: true, accounts: [{ account_id: 'a1', name: 'Card', mask: '9' }] },
    { added: [tx({ transaction_id: 'pay', amount: -3363.53, personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' } })],
      modified: [tx({ transaction_id: 'm', amount: 7 })], removed: [{ transaction_id: 'gone' }], next_cursor: 'c2', has_more: false, accounts: [] },
  ];
  const f = router([['/transactions/sync', () => ok(pages.shift())]]);
  const r = await syncItem(env(kv), { itemId: 'i1', cursor: 'c0' }, f);
  assert.deepEqual(r.added.map((t) => t.plaidId), ['t1']);
  assert.equal(r.added[0].account, 'Card ••9');
  assert.deepEqual(r.modified.map((t) => t.plaidId), ['m']);
  assert.deepEqual(r.removed, ['gone']);
  assert.equal(r.nextCursor, 'c2');
  assert.equal(f.calls[0].body.cursor, 'c0');
  assert.equal(f.calls[0].body.access_token, 'access-1');
  assert.equal(f.calls[0].body.options.include_original_description, true);
  assert.equal(f.calls[1].body.cursor, 'c1');
});

test('syncItem keeps payroll when skipPayroll=false; first sync sends no cursor', async () => {
  const kv = memKV({ 'item:i1': JSON.stringify({ accessToken: 'a' }) });
  const f = router([['/transactions/sync', () => ok({ added: [tx({ personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' } })], modified: [], removed: [], next_cursor: 'c', has_more: false })]]);
  const r = await syncItem(env(kv), { itemId: 'i1', cursor: '', skipPayroll: false }, f);
  assert.equal(r.added.length, 1);
  assert.equal(f.calls[0].body.cursor, undefined);
});

test('syncItem restarts from the original cursor on mutation-during-pagination', async () => {
  const kv = memKV({ 'item:i1': JSON.stringify({ accessToken: 'a' }) });
  let n = 0;
  const f = router([['/transactions/sync', (body) => {
    n++;
    if (n === 1) return ok({ added: [tx({ transaction_id: 'dup' })], modified: [], removed: [], next_cursor: 'x', has_more: true });
    if (n === 2) return new Response(JSON.stringify({ error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' }), { status: 400 });
    assert.equal(body.cursor, 'c0');
    return ok({ added: [tx({ transaction_id: 'dup' })], modified: [], removed: [], next_cursor: 'c9', has_more: false });
  }]]);
  const r = await syncItem(env(kv), { itemId: 'i1', cursor: 'c0' }, f);
  assert.deepEqual(r.added.map((t) => t.plaidId), ['dup']); // not duplicated by the aborted pass
  assert.equal(r.nextCursor, 'c9');
});

test('exchange stores the access token in KV only and returns the institution name', async () => {
  const kv = memKV();
  const f = router([
    ['/item/public_token/exchange', () => ok({ access_token: 'access-x', item_id: 'item-x' })],
    ['/item/get', () => ok({ item: { institution_id: 'ins_9' } })],
    ['/institutions/get_by_id', () => ok({ institution: { name: 'SoFi' } })],
  ]);
  const r = await exchangePublicToken(env(kv), 'public-1', f);
  assert.deepEqual(r, { itemId: 'item-x', institution: 'SoFi' });
  assert.equal(JSON.parse(kv._m.get('item:item-x')).accessToken, 'access-x');
  assert.ok(!JSON.stringify(r).includes('access-x'));
});

test('link token: new connection asks for transactions; update mode passes access_token', async () => {
  const kv = memKV({ 'item:i1': JSON.stringify({ accessToken: 'acc' }) });
  const f = router([['/link/token/create', () => ok({ link_token: 'link-1', expiration: 'e' })]]);
  await createLinkToken(env(kv), { userId: 'u', redirectUri: 'https://x/' }, f);
  assert.deepEqual(f.calls[0].body.products, ['transactions']);
  assert.equal(f.calls[0].body.redirect_uri, 'https://x/');
  await createLinkToken(env(kv), { userId: 'u', itemId: 'i1' }, f);
  assert.equal(f.calls[1].body.access_token, 'acc');
  assert.equal(f.calls[1].body.products, undefined);
});
