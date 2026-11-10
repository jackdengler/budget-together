import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handlePlaid } from '../src/plaid-routes.js';
import { handleMcp } from '../src/mcp.js';
import { _resetCaches } from '../src/github.js';
import { memKV, router, ok } from './helpers.js';

beforeEach(() => _resetCaches());
const baseEnv = () => ({ DATA_REPO: 'o/r', DATA_PATH: 'budget.json', DATA_BRANCH: 'main', APP_ORIGIN: 'https://app.example',
  PLAID_ENV: 'sandbox', PLAID_CLIENT_ID: 'c', PLAID_SECRET: 's', GH_READ_TOKEN: 'read-tok', OWNER_PERSON: 'p1',
  PLAID_KV: memKV({ 'item:i1': JSON.stringify({ accessToken: 'acc' }) }) });
const post = (path, body, token = 'gh-good') => new Request(`https://api.example${path}`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('plaid endpoints reject tokens that cannot read the data repo', async () => {
  const f = router([['api.github.com/repos/o/r', (_, init) => new Response('{}', { status: init.headers.Authorization === 'Bearer gh-good' ? 200 : 404 })]]);
  const r = await handlePlaid(post('/plaid/sync', { itemId: 'i1' }, 'gh-bad'), baseEnv(), f);
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://app.example');
  assert.ok(!f.calls.some((c) => c.url.includes('plaid.com')));
});

test('CORS preflight and sync happy path', async () => {
  const env = baseEnv();
  const pre = await handlePlaid(new Request('https://api.example/plaid/sync', { method: 'OPTIONS' }), env, router([]));
  assert.equal(pre.status, 204);
  const f = router([
    ['api.github.com/repos/o/r', () => ok({})],
    ['/transactions/sync', () => ok({ added: [{ transaction_id: 't', account_id: 'a', amount: 5, date: '2026-10-01', name: 'X', pending: false }], modified: [], removed: [], next_cursor: 'n', has_more: false, accounts: [] })],
  ]);
  const r = await handlePlaid(post('/plaid/sync', { itemId: 'i1', cursor: '' }), env, f);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.nextCursor, 'n');
  assert.equal(j.added[0].plaidId, 't');
});

test('link-token only forwards redirect URIs on the app origin', async () => {
  const f = router([['api.github.com', () => ok({})], ['/link/token/create', () => ok({ link_token: 'l' })]]);
  await handlePlaid(post('/plaid/link-token', { redirectUri: 'https://evil.example/x' }), baseEnv(), f);
  await handlePlaid(post('/plaid/link-token', { redirectUri: 'https://app.example/budget-together/?oauth_state_id=1' }), baseEnv(), f);
  const bodies = f.calls.filter((c) => c.url.includes('/link/token/create')).map((c) => c.body.redirect_uri);
  assert.deepEqual(bodies, [undefined, 'https://app.example/budget-together/']);
});

test('Plaid errors surface their code (e.g. re-login needed)', async () => {
  const f = router([['api.github.com', () => ok({})],
    ['/transactions/sync', () => new Response(JSON.stringify({ error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'login required' }), { status: 400 })]]);
  const r = await handlePlaid(post('/plaid/sync', { itemId: 'i1' }), baseEnv(), f);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'ITEM_LOGIN_REQUIRED');
});

test('MCP: initialize, list tools, call a tool against budget.json', async () => {
  const budget = { settings: { person1: 'Jack', person2: 'Jordan' }, transactions: [
    { date: '2026-08-03', description: 'DOMUSO', amount: 4805.7, category: 'housing', person: 'p1', shared: true } ] };
  const f = router([['/contents/budget.json', (_, init) => {
    assert.equal(init.headers.Authorization, 'Bearer read-tok');
    return ok(budget);
  }]]);
  const rpc = async (body) => {
    const res = await handleMcp(new Request('https://api.example/mcp', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' },
      body: JSON.stringify(body) }), baseEnv(), f);
    return res.status === 202 ? null : res.json();
  };
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(init.result.serverInfo.name, 'budget-together');
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const names = list.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['budget_vs_actual', 'housing', 'list_categories', 'list_transactions', 'spending_summary', 'split_summary']);
  assert.ok(list.result.tools.every((t) => t.annotations.readOnlyHint === true));
  const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'housing', arguments: { from: '2026-08' } } });
  const out = JSON.parse(call.result.content[0].text);
  assert.equal(out.months[0].total, 4805.7);
  assert.equal(out.months[0].Jack, 2402.85);
});
