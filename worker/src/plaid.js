// Plaid API client (plain fetch — no SDK) plus the Plaid → app transaction mapping.
// Plaid access tokens live only in PLAID_KV; nothing here persists transactions.

const HOSTS = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

export class PlaidError extends Error {
  constructor(status, body) {
    super(body?.error_message || `Plaid HTTP ${status}`);
    this.status = status;
    this.code = body?.error_code || 'PLAID_ERROR';
    this.type = body?.error_type;
  }
}

export async function plaid(env, path, body, fetchImpl = fetch) {
  const host = HOSTS[env.PLAID_ENV];
  if (!host) throw new Error(`Unknown PLAID_ENV "${env.PLAID_ENV}"`);
  const res = await fetchImpl(host + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new PlaidError(res.status, json);
  return json;
}

const itemKey = (itemId) => `item:${itemId}`;

export async function getItem(env, itemId) {
  const raw = await env.PLAID_KV.get(itemKey(itemId));
  if (!raw) throw new PlaidError(404, { error_code: 'ITEM_NOT_FOUND', error_message: 'Unknown bank connection' });
  return JSON.parse(raw);
}

// Link token for a new connection, or for "update mode" (re-login) when itemId is given.
export async function createLinkToken(env, { userId, redirectUri, itemId }, fetchImpl) {
  const body = {
    client_name: 'Budget Together',
    language: 'en',
    country_codes: ['US'],
    user: { client_user_id: userId },
  };
  if (redirectUri) body.redirect_uri = redirectUri;
  if (itemId) {
    body.access_token = (await getItem(env, itemId)).accessToken;
  } else {
    body.products = ['transactions'];
    body.transactions = { days_requested: 730 };
  }
  const r = await plaid(env, '/link/token/create', body, fetchImpl);
  return { linkToken: r.link_token, expiration: r.expiration };
}

export async function exchangePublicToken(env, publicToken, fetchImpl) {
  const ex = await plaid(env, '/item/public_token/exchange', { public_token: publicToken }, fetchImpl);
  let institution = 'Bank';
  try {
    const item = await plaid(env, '/item/get', { access_token: ex.access_token }, fetchImpl);
    const instId = item.item?.institution_id;
    if (instId) {
      const inst = await plaid(env, '/institutions/get_by_id', { institution_id: instId, country_codes: ['US'] }, fetchImpl);
      institution = inst.institution?.name || institution;
    }
  } catch { /* name is cosmetic */ }
  await env.PLAID_KV.put(itemKey(ex.item_id), JSON.stringify({
    accessToken: ex.access_token, institution, createdAt: new Date().toISOString(),
  }));
  return { itemId: ex.item_id, institution };
}

export async function removeItem(env, itemId, fetchImpl) {
  const item = await getItem(env, itemId);
  try { await plaid(env, '/item/remove', { access_token: item.accessToken }, fetchImpl); }
  catch (e) { if (e.code !== 'ITEM_NOT_FOUND') throw e; }
  await env.PLAID_KV.delete(itemKey(itemId));
}

// ── Mapping ────────────────────────────────────────────────────────────────
// Category hints from Plaid's personal_finance_category. These are only
// suggestions: the app's learned rules win, and everything is still reviewed.
const TRANSFER_DETAILED = new Set(['LOAN_PAYMENTS_CREDIT_CARD_PAYMENT']);

export function classify(t) {
  const pfc = t.personal_finance_category || {};
  const primary = pfc.primary || '';
  const detailed = pfc.detailed || '';
  const isPayroll = detailed === 'INCOME_WAGES' || (primary === 'INCOME' && /payroll/i.test(t.name || ''));
  let suggestedCategory = null;
  if (primary === 'TRANSFER_IN' || primary === 'TRANSFER_OUT' || TRANSFER_DETAILED.has(detailed)) suggestedCategory = 'transfer';
  else if (primary === 'INCOME') suggestedCategory = 'income';
  return { suggestedCategory, isPayroll };
}

function accountLabel(a) {
  if (!a) return '';
  const name = a.official_name || a.name || '';
  return a.mask ? `${name} ••${a.mask}` : name;
}

// Plaid amount sign = app sign (positive = money out). Date = purchase date.
// Description = raw bank text so the app's learned rules keep matching.
export function mapTxn(t, accountsById = {}) {
  const { suggestedCategory, isPayroll } = classify(t);
  return {
    plaidId: t.transaction_id,
    date: t.authorized_date || t.date,
    description: (t.original_description || t.name || t.merchant_name || '').replace(/\s+/g, ' ').trim(),
    amount: Math.round(t.amount * 100) / 100,
    account: accountLabel(accountsById[t.account_id]),
    suggestedCategory,
    isPayroll,
    pending: !!t.pending,
  };
}

// Run /transactions/sync from `cursor` to the end. Returns app-shaped rows.
// Pending rows and (optionally) payroll deposits are dropped here so both app
// pages get the same, already-filtered stream.
export async function syncItem(env, { itemId, cursor, skipPayroll = true }, fetchImpl) {
  const { accessToken } = await getItem(env, itemId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const added = [], modified = [], removed = [];
    const accounts = {};
    let next = cursor || '';
    let hasMore = true;
    try {
      while (hasMore) {
        const r = await plaid(env, '/transactions/sync', {
          access_token: accessToken,
          cursor: next || undefined,
          count: 500,
          options: { include_original_description: true },
        }, fetchImpl);
        for (const a of r.accounts || []) accounts[a.account_id] = a;
        added.push(...r.added); modified.push(...r.modified); removed.push(...r.removed);
        next = r.next_cursor; hasMore = r.has_more;
      }
    } catch (e) {
      if (e.code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') continue; // restart from original cursor
      throw e;
    }
    const keep = (m) => !m.pending && !(skipPayroll && m.isPayroll);
    const map = (list) => list.map((t) => mapTxn(t, accounts)).filter(keep);
    return {
      added: map(added),
      modified: map(modified),
      removed: removed.map((r) => r.transaction_id),
      nextCursor: next,
    };
  }
  throw new PlaidError(409, { error_code: 'SYNC_RETRY_EXHAUSTED', error_message: 'Bank data kept changing during sync; try again.' });
}
