// Pure, read-only analysis over budget.json. Mirrors the app's own math
// (docs/index.html: getCatSplitAmts, splitSharedByCat, calcSplit, renderOverview)
// so Claude sees the same numbers the app shows.

// Keep in sync with BASE_CATS in docs/index.html (only the fields used here).
export const BASE_CATS = [
  { id: 'groceries', label: 'Groceries' },
  { id: 'dining', label: 'Dining' },
  { id: 'transport', label: 'Transport' },
  { id: 'entertain', label: 'Entertainment' },
  { id: 'subs', label: 'Subscriptions' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'health', label: 'Health' },
  { id: 'housing', label: 'Housing' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'travel', label: 'Travel' },
  { id: 'skiing', label: 'Skiing' },
  { id: 'annual', label: 'Annual' },
  { id: 'investing', label: 'Investments', ignored: true },
  { id: 'income', label: 'Income' },
  { id: 'insurance', label: 'Insurance', ignored: true },
  { id: 'transfer', label: 'Transfer', ignored: true },
  { id: 'other', label: 'Other' },
  { id: 'gambling', label: 'Gambling', hidden: true },
  { id: 'cash', label: 'Cash Withdrawal', hidden: true },
];
const DEFAULT_FIXED_CATS = new Set(['housing', 'utilities', 'subs', 'insurance']);

const r2 = (n) => Math.round(n * 100) / 100;
const sum = (xs, f = (x) => x) => xs.reduce((s, x) => s + f(x), 0);

export function makeContext(data, opts = {}) {
  const owner = opts.owner === 'p2' ? 'p2' : 'p1';
  const partner = owner === 'p1' ? 'p2' : 'p1';
  const cats = {};
  for (const c of [...BASE_CATS, ...(data.customCategories || [])]) cats[c.id] = { ...cats[c.id], ...c };
  const getCat = (id) => cats[id] || cats.other;
  const names = { p1: data.settings?.person1 || 'Person 1', p2: data.settings?.person2 || 'Person 2' };
  const all = (data.transactions || []).filter((t) => t && t.date);
  const visible = all.filter((t) => {
    if (!opts.includeHidden && getCat(t.category).hidden) return false;
    if (!opts.includePartnerPrivate && t.person === partner && !t.shared) return false;
    return true;
  });
  return {
    data, owner, partner, names, cats, getCat, all, txns: visible,
    catSplits: data.catSplits || {},
    notes: [
      !opts.includePartnerPrivate && `${names[partner]}'s non-shared transactions are not included (privacy setting).`,
      !opts.includeHidden && 'PIN-hidden categories (e.g. gambling, cash) are not included.',
    ].filter(Boolean),
  };
}

// ── Date range ──────────────────────────────────────────────────────────────
export function normRange(from, to) {
  const f = !from ? '0000-01-01' : /^\d{4}-\d{2}$/.test(from) ? `${from}-01` : from;
  const t = !to ? '9999-12-31' : /^\d{4}-\d{2}$/.test(to) ? `${to}-31` : to;
  return { from: f, to: t };
}
const inRange = (t, { from, to }) => t.date >= from && t.date <= to;

// ── App math ────────────────────────────────────────────────────────────────
export const isExpense = (ctx, t) => t.amount > 0 && !ctx.getCat(t.category).ignored && !t.excluded;
export const isIncome = (ctx, t) => t.amount < 0 && !ctx.getCat(t.category).ignored && !t.excluded;

export function getCatSplitAmts(ctx, catId, total) {
  const s = ctx.catSplits[catId] || {};
  const mode = s.mode || 'pct';
  if (mode === 'dollar') {
    const p1 = Math.min(Math.max(s.p1Amt || 0, 0), total);
    return { p1Share: p1, p2Share: total - p1 };
  }
  const pct = mode === 'pct' ? (s.p1Pct ?? 50) : 50;
  const p1Share = (total * pct) / 100;
  return { p1Share, p2Share: total - p1Share };
}

// Settled → frozen at settledSplit; unsettled → live category split per month.
export function splitSharedByCat(ctx, shared) {
  const p1 = {}, p2 = {}, live = {};
  for (const t of shared) {
    if (t.settled && t.settledSplit != null) {
      const s = t.amount * t.settledSplit;
      p1[t.category] = (p1[t.category] || 0) + s;
      p2[t.category] = (p2[t.category] || 0) + (t.amount - s);
    } else {
      const key = `${t.date.slice(0, 7)}|${t.category}`;
      live[key] = (live[key] || 0) + t.amount;
    }
  }
  for (const [key, amt] of Object.entries(live)) {
    const cid = key.slice(key.indexOf('|') + 1);
    const { p1Share, p2Share } = getCatSplitAmts(ctx, cid, amt);
    p1[cid] = (p1[cid] || 0) + p1Share;
    p2[cid] = (p2[cid] || 0) + p2Share;
  }
  return { p1, p2 };
}

function personTotals(ctx, exp) {
  const shared = exp.filter((t) => t.shared);
  const { p1, p2 } = splitSharedByCat(ctx, shared);
  const solo = (p) => sum(exp.filter((t) => t.person === p && !t.shared), (t) => t.amount);
  return {
    total: r2(sum(exp, (t) => t.amount)),
    shared: r2(sum(shared, (t) => t.amount)),
    [ctx.names.p1]: r2(solo('p1') + sum(Object.values(p1))),
    [ctx.names.p2]: r2(solo('p2') + sum(Object.values(p2))),
  };
}

// ── Tools ───────────────────────────────────────────────────────────────────
export function listCategories(ctx) {
  const budgets = ctx.data.budgets || {};
  const catTypes = ctx.data.catTypes || {};
  return Object.values(ctx.cats).map((c) => ({
    id: c.id,
    label: c.label,
    countsAsSpending: !c.ignored,
    hidden: !!c.hidden,
    type: catTypes[c.id] || (DEFAULT_FIXED_CATS.has(c.id) ? 'fixed' : 'variable'),
    monthlyBudget: budgets[c.id] ?? null,
    split: ctx.catSplits[c.id] || null,
  }));
}

export function listTransactions(ctx, q = {}) {
  const range = normRange(q.from, q.to);
  const search = (q.search || '').toLowerCase();
  const person = q.person ? (q.person === ctx.names.p2 || q.person === 'p2' ? 'p2' : 'p1') : null;
  let rows = ctx.txns.filter((t) => inRange(t, range)
    && (!q.category || t.category === q.category)
    && (!person || t.person === person)
    && (q.shared === undefined || !!t.shared === q.shared)
    && (!search || `${t.description} ${t.note || ''}`.toLowerCase().includes(search))
    && (q.minAmount === undefined || t.amount >= q.minAmount)
    && (q.maxAmount === undefined || t.amount <= q.maxAmount));
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = rows.length;
  const net = r2(sum(rows, (t) => t.amount));
  const limit = Math.min(q.limit || 200, 1000);
  const offset = q.offset || 0;
  rows = rows.slice(offset, offset + limit).map((t) => ({
    date: t.date,
    description: t.description,
    amount: t.amount,
    category: t.category,
    person: ctx.names[t.person] || t.person,
    shared: !!t.shared,
    settled: !!t.settled,
    excluded: !!t.excluded,
    countsAsSpending: isExpense(ctx, t),
    ...(t.note ? { note: t.note } : {}),
    ...(t.account ? { account: t.account } : {}),
  }));
  return { total, returned: rows.length, offset, netAmount: net, signConvention: 'positive = money out, negative = money in', transactions: rows, notes: ctx.notes };
}

export function spendingSummary(ctx, q = {}) {
  const range = normRange(q.from, q.to);
  const groupBy = q.groupBy || 'month';
  const txns = ctx.txns.filter((t) => inRange(t, range));
  const keyOf = {
    month: (t) => t.date.slice(0, 7),
    category: (t) => t.category,
    month_category: (t) => `${t.date.slice(0, 7)}|${t.category}`,
  }[groupBy];
  const groups = new Map();
  for (const t of txns) {
    const k = keyOf(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const rows = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, list]) => {
    const exp = list.filter((t) => isExpense(ctx, t));
    const inc = list.filter((t) => isIncome(ctx, t));
    const [month, category] = groupBy === 'month_category' ? k.split('|') : groupBy === 'month' ? [k] : [undefined, k];
    return {
      ...(month ? { month } : {}),
      ...(category ? { category, label: ctx.getCat(category).label } : {}),
      spending: personTotals(ctx, exp),
      income: r2(sum(inc, (t) => -t.amount)),
      transactions: list.length,
    };
  }).filter((r) => r.spending.total || r.income);
  const exp = txns.filter((t) => isExpense(ctx, t));
  return {
    range,
    groupBy,
    overall: { spending: personTotals(ctx, exp), income: r2(sum(txns.filter((t) => isIncome(ctx, t)), (t) => -t.amount)) },
    rows,
    notes: [
      'Spending excludes transfers, investments, insurance, and transactions marked excluded. Per-person totals = own non-shared spending + share of shared spending (category splits applied per month, as in the app).',
      ...ctx.notes,
    ],
  };
}

// Outstanding balance exactly as the app's Settle screen (calcSplit): all
// unsettled shared spending, ever. Plus totals for the requested range.
export function splitSummary(ctx, q = {}) {
  const { p1: n1, p2: n2 } = ctx.names;
  // ctx.txns keeps every shared transaction (the partner-privacy filter only drops
  // non-shared ones); only PIN-hidden categories can be missing.
  const sharedExp = ctx.txns.filter((t) => t.shared && isExpense(ctx, t));
  const active = sharedExp.filter((t) => !t.settled);
  const p1paid = sum(active.filter((t) => t.person === 'p1'), (t) => t.amount);
  const shares = splitSharedByCat(ctx, active);
  const net = p1paid - sum(Object.values(shares.p1));
  const byCat = {};
  for (const t of active) {
    byCat[t.category] ||= { p1paid: 0, p2paid: 0 };
    byCat[t.category][t.person === 'p1' ? 'p1paid' : 'p2paid'] += t.amount;
  }
  const owes = (x) => (Math.abs(x) < 0.005 ? 'even' : x > 0 ? `${n2} owes ${n1} $${r2(x).toFixed(2)}` : `${n1} owes ${n2} $${r2(-x).toFixed(2)}`);
  const range = normRange(q.from, q.to);
  const inR = sharedExp.filter((t) => inRange(t, range));
  const rShares = splitSharedByCat(ctx, inR);
  return {
    outstanding: {
      summary: owes(net),
      netOwedTo: { [n1]: r2(Math.max(net, 0)), [n2]: r2(Math.max(-net, 0)) },
      unsettledTransactions: active.length,
      byCategory: Object.entries(byCat).map(([cid, v]) => {
        const catNet = v.p1paid - (shares.p1[cid] || 0);
        return {
          category: cid, label: ctx.getCat(cid).label,
          paidBy: { [n1]: r2(v.p1paid), [n2]: r2(v.p2paid) },
          share: { [n1]: r2(shares.p1[cid] || 0), [n2]: r2(shares.p2[cid] || 0) },
          balance: owes(catNet),
        };
      }),
    },
    range: {
      ...range,
      sharedTotal: r2(sum(inR, (t) => t.amount)),
      paidBy: { [n1]: r2(sum(inR.filter((t) => t.person === 'p1'), (t) => t.amount)), [n2]: r2(sum(inR.filter((t) => t.person === 'p2'), (t) => t.amount)) },
      share: { [n1]: r2(sum(Object.values(rShares.p1))), [n2]: r2(sum(Object.values(rShares.p2))) },
      settledTotal: r2(sum(inR.filter((t) => t.settled), (t) => t.amount)),
      unsettledTotal: r2(sum(inR.filter((t) => !t.settled), (t) => t.amount)),
    },
    notes: ['"outstanding" matches the app\'s Settle screen (all unsettled shared spending, any date). "range" covers only the requested dates.'],
  };
}

export function housing(ctx, q = {}) {
  const range = normRange(q.from, q.to);
  const txns = ctx.txns.filter((t) => t.category === 'housing' && inRange(t, range) && isExpense(ctx, t));
  const months = {};
  for (const t of txns) (months[t.date.slice(0, 7)] ||= []).push(t);
  return {
    range,
    months: Object.entries(months).sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, list]) => ({
      month,
      ...personTotals(ctx, list),
      transactions: list.map((t) => ({ date: t.date, description: t.description, amount: t.amount, paidBy: ctx.names[t.person], shared: !!t.shared, settled: !!t.settled })),
    })),
    split: ctx.catSplits.housing || { mode: 'pct', p1Pct: 50 },
  };
}

export function budgetVsActual(ctx, q = {}) {
  const month = q.month;
  const budgets = ctx.data.budgets || {};
  const exp = ctx.txns.filter((t) => t.date.startsWith(month) && isExpense(ctx, t));
  const ids = new Set([...Object.keys(budgets), ...exp.map((t) => t.category)]);
  const rows = [...ids].map((cid) => {
    const list = exp.filter((t) => t.category === cid);
    const totals = personTotals(ctx, list);
    const budget = budgets[cid] ?? null;
    return { category: cid, label: ctx.getCat(cid).label, budget, actual: totals.total, remaining: budget == null ? null : r2(budget - totals.total), byPerson: totals };
  }).filter((r) => r.budget || r.actual).sort((a, b) => b.actual - a.actual);
  return { month, rows, notes: ['Budgets are monthly, compared against household spending in that category.', ...ctx.notes] };
}
