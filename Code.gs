// ── Budget Together — Google Apps Script Backend ──────────
// Deploy as a Web App: Execute as "Me", access "Anyone with Google account".
//
// PUBLIC PAGES, PRIVATE DATA:
//   doGet serves the app shell to anyone — it holds no data and no secrets.
//   Real budget data is unlocked PER PERSON with a PIN that is verified
//   server-side (unlockWithPin). A correct PIN returns a short-lived,
//   HMAC-signed session token; every data function requires a valid token
//   (assertSession_). PINs are never stored in source or sent to the browser —
//   only a salted, iterated hash lives in Script Properties.
//
//   First-time setup (owner, once, from the Apps Script editor):
//     setUserPin('p1', '<your-pin>');     // e.g. Run > setUserPin after editing
//     setUserPin('p2', '<partner-pin>');
//   Afterwards each person can change their own PIN from Settings in the app.
//
// Configuration lives in Script Properties (Project Settings → Script Properties):
//   PIN_HASH_P1 / PIN_HASH_P2   salted+iterated hash of each person's PIN. Managed
//                               by setUserPin(); never edit by hand.
//   PIN_SALT / SESSION_SECRET   auto-generated secrets for hashing/signing. Do NOT
//                               share or commit these.
//   ALLOWED_EMAILS    comma-separated emails allowed to ADMINISTER PINs (owner).
//                     Auto-seeds with the deployer's email on first request if unset.
//   BACKUP_REPO       (optional) "<owner>/<repo>" for the GitHub backup feature.
//   BACKUP_PATH       (optional) path within that repo to write the backup JSON to.
//   GITHUB_TOKEN      (optional) personal access token used by the GitHub backup feature.

function getAllowedEmails_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('ALLOWED_EMAILS') || '';
  const list = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list;
  // First-run bootstrap: only the deployer can hit the script before any
  // property is set, so seeding from their email is safe and keeps the app
  // self-configuring on a fresh deploy. Add additional accounts later via
  // Project Settings → Script Properties or addAllowedEmail().
  try {
    const me = (Session.getActiveUser().getEmail() || '').toLowerCase();
    if (me) {
      props.setProperty('ALLOWED_EMAILS', me);
      return [me];
    }
  } catch(e) {}
  return [];
}

function assertAllowed_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch(e) {}
  if (!getAllowedEmails_().includes(email.toLowerCase())) {
    throw new Error('Unauthorized');
  }
}

// Admin helper: any currently-allowed user can authorize an additional email.
function addAllowedEmail(email) {
  assertAllowed_();
  const next = String(email || '').trim().toLowerCase();
  if (!next || next.indexOf('@') < 0) throw new Error('Invalid email');
  const props = PropertiesService.getScriptProperties();
  const set = new Set(getAllowedEmails_());
  set.add(next);
  props.setProperty('ALLOWED_EMAILS', Array.from(set).join(','));
  return { ok: true, allowed: Array.from(set) };
}

function doGet(e) {
  try {
    // The pages are public: anyone who reaches this URL gets the app shell,
    // which contains no budget data and no secrets. Real data is unlocked
    // per-person with a PIN that is verified server-side (see unlockWithPin /
    // assertSession_). The app boots into a PIN lock screen until then.
    var page = (e && e.parameter && e.parameter.v === 'mobile') ? 'mobile' :
               (e && e.parameter && e.parameter.v === 'tournament') ? 'tournament' : 'index';
    return HtmlService.createHtmlOutputFromFile(page)
      .setTitle('Budget Together')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  } catch(err) {
    return HtmlService.createHtmlOutput('<h2>Something went wrong</h2><p>Please try again or contact the app owner.</p>');
  }
}

// ── Per-person PIN authentication ──────────────────────────
// Two people each have their own PIN. PINs are NEVER stored in this source
// file or sent to the browser — only a salted, iterated hash lives in Script
// Properties. A correct PIN returns a short-lived, HMAC-signed session token
// that the browser presents on every data call. Forging a token requires the
// server-only SESSION_SECRET, so it can't be faked client-side.
var PIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // session token lifetime
var PIN_HASH_ITERS = 1000;                  // slows offline brute force
var PIN_MAX_FAILS = 8;                       // lockout threshold per window
var PIN_FAIL_WINDOW_S = 60;                  // lockout window (seconds)

function pinPersonKey_(person) {
  if (person !== 'p1' && person !== 'p2') throw new Error('Invalid person');
  return 'PIN_HASH_' + person.toUpperCase();
}

function getOrCreateSecret_(key) {
  var props = PropertiesService.getScriptProperties();
  var val = props.getProperty(key);
  if (!val) {
    var bytes = Math.random().toString(36) + Utilities.getUuid() + Utilities.getUuid();
    val = Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    );
    props.setProperty(key, val);
  }
  return val;
}

function hashPin_(pin) {
  var salt = getOrCreateSecret_('PIN_SALT');
  var acc = salt + '|' + pin;
  for (var i = 0; i < PIN_HASH_ITERS; i++) {
    acc = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + acc)
    );
  }
  return acc;
}

// Constant-time-ish string compare to avoid leaking match position via timing.
function safeEquals_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

function signToken_(payload) {
  var secret = getOrCreateSecret_('SESSION_SECRET');
  var sig = Utilities.computeHmacSha256Signature(payload, secret);
  return Utilities.base64EncodeWebSafe(sig);
}

function makeToken_(person) {
  var payload = person + '|' + (Date.now() + PIN_TTL_MS);
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(payload).getBytes()) + '.' + signToken_(payload);
}

function verifyToken_(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return '';
  var parts = token.split('.');
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); }
  catch (e) { return ''; }
  if (!safeEquals_(parts[1], signToken_(payload))) return '';
  var seg = payload.split('|');
  var person = seg[0], exp = Number(seg[1]);
  if ((person !== 'p1' && person !== 'p2') || !exp || Date.now() > exp) return '';
  return person;
}

// Gate for every data function. A valid session token is required; the active
// Google account is irrelevant, so this works the same for both people
// regardless of their email domain.
function assertSession_(token) {
  var person = verifyToken_(token);
  if (!person) throw new Error('Locked: enter your PIN to continue.');
  return person;
}

function pinsConfigured_() {
  var props = PropertiesService.getScriptProperties();
  return { p1: !!props.getProperty('PIN_HASH_P1'), p2: !!props.getProperty('PIN_HASH_P2') };
}

// Reports whether each PIN exists (booleans only — never the PINs themselves).
function pinStatus() {
  return pinsConfigured_();
}

// Set or change a person's PIN. Callable by an allow-listed admin (the owner,
// e.g. from the Apps Script editor or the in-app Settings) or by that same
// person from an unlocked session. PINs must be 4–10 digits.
function setUserPin(person, pin, token) {
  var key = pinPersonKey_(person); // validates person
  var isAdmin = false;
  try { assertAllowed_(); isAdmin = true; } catch (e) {}
  if (!isAdmin && verifyToken_(token) !== person) {
    throw new Error('Not authorized to set this PIN.');
  }
  var clean = String(pin || '').trim();
  if (!/^\d{4,10}$/.test(clean)) throw new Error('PIN must be 4–10 digits.');
  PropertiesService.getScriptProperties().setProperty(key, hashPin_(clean));
  return { ok: true, person: person };
}

// Verify a PIN and, on success, issue a session token. Throttled and locked
// out after repeated failures to blunt brute-force attempts.
function unlockWithPin(pin, clientId) {
  var cache = CacheService.getScriptCache();
  var failKey = 'pinfail_' + (String(clientId || 'anon').slice(0, 64));
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= PIN_MAX_FAILS) {
    throw new Error('Too many attempts. Wait a minute and try again.');
  }

  Utilities.sleep(500); // cap guess throughput

  var clean = String(pin || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PIN_HASH_P1') && !props.getProperty('PIN_HASH_P2')) {
    throw new Error('No PINs set up yet. The owner must set them first.');
  }

  var attempt = hashPin_(clean);
  var match = '';
  var h1 = props.getProperty('PIN_HASH_P1');
  var h2 = props.getProperty('PIN_HASH_P2');
  if (h1 && safeEquals_(attempt, h1)) match = 'p1';
  else if (h2 && safeEquals_(attempt, h2)) match = 'p2';

  if (!match) {
    cache.put(failKey, fails + 1, PIN_FAIL_WINDOW_S);
    throw new Error('Incorrect PIN.');
  }

  cache.remove(failKey);
  var names = personNames_();
  return { ok: true, token: makeToken_(match), person: match, name: names[match] || '' };
}

function personNames_() {
  try {
    var data = loadAll_();
    return { p1: (data.settings && data.settings.person1) || 'Person 1',
             p2: (data.settings && data.settings.person2) || 'Person 2' };
  } catch (e) {
    return { p1: 'Person 1', p2: 'Person 2' };
  }
}

// ── Spreadsheet setup ──────────────────────────────────────
function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SS_ID');

  if (ssId) {
    try { return SpreadsheetApp.openById(ssId); } catch(e) { /* deleted or inaccessible */ }
  }

  // Before creating a new sheet, search Drive for an existing one by name.
  // This prevents a wipe when SS_ID is lost (e.g. after logout or redeploy).
  const existing = DriveApp.getFilesByName('💕 Budget Together');
  while (existing.hasNext()) {
    const f = existing.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
      try {
        const found = SpreadsheetApp.openById(f.getId());
        props.setProperty('SS_ID', f.getId()); // re-pin it
        return found;
      } catch(e) { /* not accessible */ }
    }
  }

  // Nothing found — create fresh spreadsheet
  const ss = SpreadsheetApp.create('💕 Budget Together');
  props.setProperty('SS_ID', ss.getId());

  const ts = ss.getActiveSheet().setName('Transactions');
  ts.appendRow(['id','date','amount','description','category','person','note','shared','settled','splitRatio','excluded','settledDate']);
  ts.setFrozenRows(1);
  ts.getRange(1,1,1,12).setFontWeight('bold');

  const bs = ss.insertSheet('Budgets');
  bs.appendRow(['key','amount']);
  bs.setFrozenRows(1);

  const st = ss.insertSheet('Settings');
  st.appendRow(['key','value']);
  st.appendRow(['person1','Person 1']);
  st.appendRow(['person2','Person 2']);
  st.setFrozenRows(1);

  return ss;
}

// ── Load all data ──────────────────────────────────────────
function loadAll(token) {
  assertSession_(token);
  return loadAll_();
}

function loadAll_() {
  const ss = getSheet_();

  // Transactions: id, date, amount, description, category, person, note, shared, settled, splitRatio, excluded
  const ts = ss.getSheetByName('Transactions');
  const lastR = ts.getLastRow();
  const transactions = [];
  if (lastR > 1) {
    ts.getRange(2, 1, lastR - 1, 12).getValues().forEach(r => {
      if (!r[0]) return;
      // Google Sheets returns dates as Date objects; normalize to YYYY-MM-DD
      const rawDate = r[1];
      let dateStr = '';
      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        const yy = rawDate.getFullYear();
        const mm = String(rawDate.getMonth() + 1).padStart(2, '0');
        const dd = String(rawDate.getDate()).padStart(2, '0');
        dateStr = yy + '-' + mm + '-' + dd;
      } else if (rawDate) {
        dateStr = String(rawDate);
        // Try to normalize M/D/YYYY or MM/DD/YYYY to YYYY-MM-DD
        const m = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (m) {
          let [, mo, d, y] = m;
          if (y.length === 2) y = '20' + y;
          dateStr = y + '-' + mo.padStart(2, '0') + '-' + d.padStart(2, '0');
        } else {
          // Handle long date strings like "Mon Dec 15 2025 03:00:00 GMT-0500..."
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            const py = parsed.getFullYear();
            const pm = String(parsed.getMonth() + 1).padStart(2, '0');
            const pd = String(parsed.getDate()).padStart(2, '0');
            dateStr = py + '-' + pm + '-' + pd;
          }
        }
      }
      transactions.push({
        id:          String(r[0]),
        date:        dateStr,
        amount:      parseFloat(r[2]) || 0,
        description: String(r[3]),
        category:    String(r[4]) || 'other',
        person:      String(r[5]) || 'p1',
        note:        String(r[6] || ''),
        shared:      r[7] === true || String(r[7]).toLowerCase() === 'true',
        settled:     r[8] === true || String(r[8]).toLowerCase() === 'true',
        splitRatio:  parseFloat(r[9]) || 0.5,
        excluded:    r[10] === true || String(r[10]).toLowerCase() === 'true',
        settledDate: r[11] ? String(r[11]) : '',
      });
    });
  }

  // Budgets
  const bs = ss.getSheetByName('Budgets');
  const bLastR = bs.getLastRow();
  const budgets = {};
  if (bLastR > 1) {
    bs.getRange(2, 1, bLastR - 1, 2).getValues().forEach(([k, v]) => {
      if (k) budgets[String(k)] = parseFloat(v) || 0;
    });
  }

  // Settings (includes JSON-encoded extra fields)
  const st = ss.getSheetByName('Settings');
  const stLastR = st.getLastRow();
  const raw = {};
  if (stLastR > 1) {
    st.getRange(2, 1, stLastR - 1, 2).getValues().forEach(([k, v]) => {
      if (k) raw[String(k)] = String(v);
    });
  }

  const settings = { person1: raw.person1 || 'Person 1', person2: raw.person2 || 'Person 2' };
  let rules = {};
  try { if (raw.rules) rules = JSON.parse(raw.rules); } catch(e) {}
  let customCategories = [];
  try { if (raw.customCategories) customCategories = JSON.parse(raw.customCategories); } catch(e) {}
  let catSplits = {};
  try { if (raw.catSplits) catSplits = JSON.parse(raw.catSplits); } catch(e) {}
  let excludedFromAvg = [];
  try { if (raw.excludedFromAvg) excludedFromAvg = JSON.parse(raw.excludedFromAvg); } catch(e) {}
  let recurringIncome = [];
  try { if (raw.recurringIncome) recurringIncome = JSON.parse(raw.recurringIncome); } catch(e) {}
  let gamblingData = {};
  try { if (raw.gamblingData) gamblingData = JSON.parse(raw.gamblingData); } catch(e) {}
  let incomeData = {};
  try { if (raw.incomeData) incomeData = JSON.parse(raw.incomeData); } catch(e) {}
  let incomeTypeRules = {};
  try { if (raw.incomeTypeRules) incomeTypeRules = JSON.parse(raw.incomeTypeRules); } catch(e) {}
  if (raw.secretPin) settings.secretPin = raw.secretPin;

  return { transactions, budgets, settings, rules, customCategories, catSplits, excludedFromAvg, recurringIncome, gamblingData, incomeData, incomeTypeRules };
}

// ── Save all data ──────────────────────────────────────────
function saveAll(data, token) {
  assertSession_(token);
  return saveAll_(data);
}

function saveAll_(data) {
  const ss = getSheet_();

  // Transactions
  const ts = ss.getSheetByName('Transactions');
  ts.clearContents();
  const th = ['id','date','amount','description','category','person','note','shared','settled','splitRatio','excluded','settledDate'];
  const tRows = [th, ...(data.transactions || []).map(t =>
    [t.id, t.date, t.amount||0, t.description||'', t.category, t.person, t.note||'',
     !!t.shared, !!t.settled, t.splitRatio||0.5, !!t.excluded, t.settledDate||'']
  )];
  ts.getRange(1, 1, tRows.length, 12).setValues(tRows);
  ts.getRange(1, 1, 1, 12).setFontWeight('bold');

  // Budgets
  const bs = ss.getSheetByName('Budgets');
  bs.clearContents();
  const bEntries = Object.entries(data.budgets || {});
  const bRows = [['key','amount'], ...bEntries];
  bs.getRange(1, 1, bRows.length, 2).setValues(bRows);
  bs.getRange(1, 1, 1, 2).setFontWeight('bold');

  // Settings
  const st = ss.getSheetByName('Settings');
  st.clearContents();
  const sRows = [
    ['key','value'],
    ['person1', (data.settings||{}).person1 || 'Person 1'],
    ['person2', (data.settings||{}).person2 || 'Person 2'],
    ['rules',            JSON.stringify(data.rules||{})],
    ['customCategories', JSON.stringify(data.customCategories||[])],
    ['catSplits',        JSON.stringify(data.catSplits||{})],
    ['excludedFromAvg',  JSON.stringify(data.excludedFromAvg||[])],
    ['recurringIncome',  JSON.stringify(data.recurringIncome||[])],
    ['gamblingData',    JSON.stringify(data.gamblingData||{})],
    ['incomeData',       JSON.stringify(data.incomeData||{})],
    ['incomeTypeRules',  JSON.stringify(data.incomeTypeRules||{})],
    ['secretPin',        (data.settings||{}).secretPin || ''],
  ];
  st.getRange(1, 1, sRows.length, 2).setValues(sRows);
  st.getRange(1, 1, 1, 2).setFontWeight('bold');

  return { ok: true };
}

// ── Spreadsheet URL (for "Open in Sheets" link) ────────────
function getSheetUrl(token) {
  assertSession_(token);
  return getSheet_().getUrl();
}

// ── Link an existing spreadsheet ───────────────────────────
function linkSheet(urlOrId, token) {
  assertSession_(token);
  const match = String(urlOrId).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = match ? match[1] : String(urlOrId).trim();
  if (!id) throw new Error('Invalid sheet URL or ID');
  SpreadsheetApp.openById(id); // throws if not accessible
  PropertiesService.getScriptProperties().setProperty('SS_ID', id);
  return { ok: true };
}

// ── Unlink the current spreadsheet ─────────────────────────
function unlinkSheet(token) {
  assertSession_(token);
  PropertiesService.getScriptProperties().deleteProperty('SS_ID');
  return { ok: true };
}

// ── Import data from a JSON backup (sent from the browser) ──
function importDataJson(json, token) {
  assertSession_(token);
  const data = JSON.parse(json);
  delete data._exportDate;
  delete data._backupDate;
  saveAll_(data);
  return { ok: true };
}

// ── GitHub Backup ─────────────────────────────────────────
function setGitHubToken(ghToken, token) {
  assertSession_(token);
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', String(ghToken).trim());
  return { ok: true };
}

function hasGitHubToken(token) {
  assertSession_(token);
  return !!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
}

function backupToGitHub(token) {
  assertSession_(token);
  const props = PropertiesService.getScriptProperties();
  const ghToken = props.getProperty('GITHUB_TOKEN');
  if (!ghToken) throw new Error('No GitHub token configured. Set one in Settings first.');

  const repo = props.getProperty('BACKUP_REPO');
  const path = props.getProperty('BACKUP_PATH');
  if (!repo || !path) {
    throw new Error('Set BACKUP_REPO ("<owner>/<repo>") and BACKUP_PATH in Script Properties.');
  }

  const data = loadAll_();
  data._backupDate = new Date().toISOString();
  const content = JSON.stringify(data, null, 2);
  const encoded = Utilities.base64Encode(Utilities.newBlob(content).getBytes());

  const apiUrl = 'https://api.github.com/repos/' + repo + '/contents/' + path;

  // Check if file exists to get its SHA (required for updates)
  var sha = null;
  try {
    var existing = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      headers: { 'Authorization': 'token ' + ghToken, 'Accept': 'application/vnd.github.v3+json' },
      muteHttpExceptions: true
    });
    if (existing.getResponseCode() === 200) {
      sha = JSON.parse(existing.getContentText()).sha;
    }
  } catch(e) { /* file doesn't exist yet, that's fine */ }

  var body = {
    message: 'backup: ' + new Date().toISOString().slice(0, 16).replace('T', ' '),
    content: encoded
  };
  if (sha) body.sha = sha;

  var resp = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' },
    contentType: 'application/json',
    payload: JSON.stringify(body)
  });

  if (resp.getResponseCode() !== 200 && resp.getResponseCode() !== 201) {
    throw new Error('GitHub API error: ' + resp.getContentText().slice(0, 200));
  }
  return { ok: true, date: data._backupDate };
}
