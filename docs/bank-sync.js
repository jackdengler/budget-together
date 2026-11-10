// Bank sync (Plaid via the budget-api Worker), shared by index.html and mobile.html.
// The pages own the UI and the save; this file owns the Worker calls, Plaid Link,
// and the pure merge of synced rows into the data.
//
// Data shape (in budget.json):
//   plaid: { apiUrl, skipPayroll, items: [{ itemId, institution, owner, startAfter, cursor, lastSync, needsReauth }] }
//   pendingReview: [ ...transactions waiting for review ]
(function (global) {
  'use strict';

  var LINK_SRC = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
  var LS_LINK = 'bt_plaid_link'; // { token, itemId, owner } kept across the OAuth bank redirect

  function defaults(plaid) {
    plaid = plaid || {};
    return {
      apiUrl: (plaid.apiUrl || '').replace(/\/+$/, ''),
      skipPayroll: plaid.skipPayroll !== false,
      items: Array.isArray(plaid.items) ? plaid.items.slice() : [],
    };
  }

  function call(apiUrl, ghToken, path, body) {
    if (!apiUrl) return Promise.reject(Object.assign(new Error('Set the bank sync server URL first'), { code: 'NO_API_URL' }));
    return fetch(apiUrl + path, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + ghToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw Object.assign(new Error(j.error || ('HTTP ' + r.status)), { code: j.code || ('HTTP_' + r.status) });
        return j;
      });
    });
  }

  var _linkLoading = null;
  function loadLink() {
    if (global.Plaid) return Promise.resolve();
    if (_linkLoading) return _linkLoading;
    _linkLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = LINK_SRC; s.onload = res;
      s.onerror = function () { _linkLoading = null; rej(new Error('Could not load Plaid Link')); };
      document.head.appendChild(s);
    });
    return _linkLoading;
  }

  // Must exactly match a redirect URI registered in the Plaid dashboard:
  // …/budget-together/ (web) or …/budget-together/mobile.html (mobile).
  function hereUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }

  function openLink(token, opts, receivedRedirectUri) {
    var cfg = {
      token: token,
      onSuccess: function (publicToken) {
        try { localStorage.removeItem(LS_LINK); } catch (e) {}
        if (opts.itemId) { opts.onDone({ itemId: opts.itemId, reauthed: true }); return; } // update mode: same item
        call(opts.apiUrl, opts.ghToken, '/plaid/exchange', { publicToken: publicToken })
          .then(function (r) { opts.onDone({ itemId: r.itemId, institution: r.institution, owner: opts.owner }); })
          .catch(opts.onError);
      },
      onExit: function (err) {
        try { localStorage.removeItem(LS_LINK); } catch (e) {}
        if (err) opts.onError(Object.assign(new Error(err.display_message || err.error_message || 'Bank connection cancelled'), { code: err.error_code }));
        else if (opts.onCancel) opts.onCancel();
      },
    };
    if (receivedRedirectUri) cfg.receivedRedirectUri = receivedRedirectUri;
    global.Plaid.create(cfg).open();
  }

  // Connect a new bank, or re-login an existing one (opts.itemId).
  // opts: { apiUrl, ghToken, owner, itemId?, onDone({itemId, institution, owner}|{itemId, reauthed}), onError, onCancel? }
  function connect(opts) {
    return loadLink()
      .then(function () { return call(opts.apiUrl, opts.ghToken, '/plaid/link-token', { redirectUri: hereUrl(), itemId: opts.itemId }); })
      .then(function (r) {
        try { localStorage.setItem(LS_LINK, JSON.stringify({ token: r.linkToken, itemId: opts.itemId || null, owner: opts.owner })); } catch (e) {}
        openLink(r.linkToken, opts);
      })
      .catch(opts.onError);
  }

  // OAuth banks (e.g. Capital One) send the browser to the bank and back to this
  // page with ?oauth_state_id=…; finish the same Link session. Returns true if resuming.
  function resumeOAuthIfNeeded(opts) {
    if (!/[?&]oauth_state_id=/.test(location.search)) return false;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_LINK) || 'null'); } catch (e) {}
    var received = location.href;
    try { history.replaceState(null, '', hereUrl() + location.hash); } catch (e) {}
    if (!saved || !saved.token) return false;
    loadLink().then(function () {
      openLink(saved.token, Object.assign({}, opts, { itemId: saved.itemId || undefined, owner: saved.owner || opts.owner }), received);
    }).catch(opts.onError);
    return true;
  }

  function remove(apiUrl, ghToken, itemId) { return call(apiUrl, ghToken, '/plaid/remove', { itemId: itemId }); }

  // Latest date already in the app for this person — new connections start after it
  // so Plaid history never duplicates months imported from CSV/PDF.
  function defaultStartAfter(transactions, owner) {
    var max = '';
    (transactions || []).forEach(function (t) { if (t.person === owner && t.date > max) max = t.date; });
    return max;
  }

  var legacyKey = function (t) { return t.date + '|' + t.description + '|' + t.amount + '|' + t.person; };

  // Pure: apply one item's sync result. Returns new arrays/objects; never mutates inputs.
  // helpers: { uid, categorize, applyRules }
  function mergeSync(state, item, result, helpers) {
    var txns = state.transactions.slice();
    var pending = state.pendingReview.slice();
    var stats = { added: 0, updated: 0, removed: 0 };
    var byPlaid = {}, keys = {};
    txns.forEach(function (t, i) { if (t.plaidId) byPlaid[t.plaidId] = { list: 'txns', i: i }; keys[legacyKey(t)] = 1; });
    pending.forEach(function (t, i) { if (t.plaidId) byPlaid[t.plaidId] = { list: 'pending', i: i }; keys[legacyKey(t)] = 1; });

    (result.added || []).forEach(function (r) {
      if (item.startAfter && r.date <= item.startAfter) return;
      if (byPlaid[r.plaidId]) return;
      var t = {
        id: helpers.uid(), date: r.date, description: r.description, amount: r.amount,
        category: r.suggestedCategory || helpers.categorize(r.description),
        person: item.owner, shared: false, settled: false, splitRatio: 0.5, note: '', excluded: false,
        plaidId: r.plaidId,
      };
      if (r.account) t.account = r.account;
      if (keys[legacyKey(t)]) return;
      var rule = helpers.applyRules(t.description);
      if (rule) { t.category = rule.category; if (rule.shared !== undefined) t.shared = rule.shared; if (rule.person) t.person = rule.person; }
      keys[legacyKey(t)] = 1;
      byPlaid[r.plaidId] = { list: 'pending', i: pending.length };
      pending.push(t);
      stats.added++;
    });

    (result.modified || []).forEach(function (r) {
      var at = byPlaid[r.plaidId];
      if (!at) return;
      var list = at.list === 'txns' ? txns : pending;
      var old = list[at.i];
      if (old.settled) return; // settled amounts are frozen
      if (old.amount === r.amount && old.date === r.date) return;
      list[at.i] = Object.assign({}, old, { amount: r.amount, date: r.date });
      stats.updated++;
    });

    var gone = {};
    (result.removed || []).forEach(function (id) { gone[id] = 1; });
    var keep = function (t) { if (t.plaidId && gone[t.plaidId] && !t.settled) { stats.removed++; return false; } return true; };
    txns = txns.filter(keep);
    pending = pending.filter(keep);

    return { transactions: txns, pendingReview: pending, cursor: result.nextCursor, stats: stats };
  }

  // Sync every connected bank, one after another. Resolves with the new state to
  // save in ONE write (cursors + queue together, so nothing is lost on failure).
  // state: { plaid, transactions, pendingReview }
  function syncAll(ghToken, state, helpers) {
    var plaid = defaults(state.plaid);
    var cur = { transactions: state.transactions || [], pendingReview: state.pendingReview || [] };
    var totals = { added: 0, updated: 0, removed: 0, errors: [] };
    var items = plaid.items.map(function (it) { return Object.assign({}, it); });
    var chain = Promise.resolve();
    items.forEach(function (item) {
      chain = chain.then(function () {
        return call(plaid.apiUrl, ghToken, '/plaid/sync', { itemId: item.itemId, cursor: item.cursor || '', skipPayroll: plaid.skipPayroll })
          .then(function (res) {
            var m = mergeSync(cur, item, res, helpers);
            cur = { transactions: m.transactions, pendingReview: m.pendingReview };
            item.cursor = m.cursor; item.lastSync = new Date().toISOString(); item.needsReauth = false;
            totals.added += m.stats.added; totals.updated += m.stats.updated; totals.removed += m.stats.removed;
          })
          .catch(function (e) {
            if (e.code === 'ITEM_LOGIN_REQUIRED' || e.code === 'PENDING_EXPIRATION') item.needsReauth = true;
            totals.errors.push({ institution: item.institution, code: e.code, message: e.message });
          });
      });
    });
    return chain.then(function () {
      plaid.items = items;
      return { plaid: plaid, transactions: cur.transactions, pendingReview: cur.pendingReview, totals: totals };
    });
  }

  function summary(totals) {
    var parts = [];
    if (totals.added) parts.push(totals.added + ' new to review');
    if (totals.updated) parts.push(totals.updated + ' updated');
    if (totals.removed) parts.push(totals.removed + ' removed');
    var msg = parts.length ? parts.join(' · ') : 'No new bank transactions';
    if (totals.errors.length) msg += ' · ⚠ ' + totals.errors.map(function (e) { return e.institution + (e.code === 'ITEM_LOGIN_REQUIRED' ? ': reconnect needed' : ': ' + e.message); }).join('; ');
    return msg;
  }

  global.BankSync = {
    defaults: defaults, connect: connect, resumeOAuthIfNeeded: resumeOAuthIfNeeded, remove: remove,
    syncAll: syncAll, mergeSync: mergeSync, defaultStartAfter: defaultStartAfter, summary: summary,
  };
})(typeof window !== 'undefined' ? window : globalThis);
