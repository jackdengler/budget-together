// ── Budget Together — Google Apps Script Backend ──────────
// Deploy as a Web App: Execute as "Me", access "Anyone with Google account"

const ALLOWED_EMAILS = [
  'denglerjack@gmail.com',
  'jleaf355@gmail.com'
];

function doGet(e) {
  try {
    var user = '';
    try {
      var activeUser = Session.getActiveUser();
      if (activeUser) user = activeUser.getEmail() || '';
    } catch(authErr) {
      user = '';
    }
    if (!ALLOWED_EMAILS.includes(user.toLowerCase())) {
      return HtmlService.createHtmlOutput('<h2>Access denied</h2><p>This app is private. Please sign in with an authorized Google account.</p>');
    }
    var page = (e && e.parameter && e.parameter.v === 'mobile') ? 'mobile' :
               (e && e.parameter && e.parameter.v === 'tournament') ? 'tournament' : 'index';
    return HtmlService.createHtmlOutputFromFile(page)
      .setTitle('Budget Together')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch(err) {
    return HtmlService.createHtmlOutput('<h2>Something went wrong</h2><p>' + err.message + '</p>');
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
function loadAll() {
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
function saveAll(data) {
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
function getSheetUrl() {
  return getSheet_().getUrl();
}

// ── Link an existing spreadsheet ───────────────────────────
function linkSheet(urlOrId) {
  const match = String(urlOrId).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = match ? match[1] : String(urlOrId).trim();
  if (!id) throw new Error('Invalid sheet URL or ID');
  SpreadsheetApp.openById(id); // throws if not accessible
  PropertiesService.getScriptProperties().setProperty('SS_ID', id);
  return { ok: true };
}

// ── Unlink the current spreadsheet ─────────────────────────
function unlinkSheet() {
  PropertiesService.getScriptProperties().deleteProperty('SS_ID');
  return { ok: true };
}

// ── Import data from a JSON backup (sent from the browser) ──
function importDataJson(json) {
  const data = JSON.parse(json);
  delete data._exportDate;
  delete data._backupDate;
  saveAll(data);
  return { ok: true };
}

// ── GitHub Backup ─────────────────────────────────────────
function setGitHubToken(token) {
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token.trim());
  return { ok: true };
}

function hasGitHubToken() {
  return !!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
}

function backupToGitHub() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('No GitHub token configured. Set one in Settings first.');

  const data = loadAll();
  data._backupDate = new Date().toISOString();
  const content = JSON.stringify(data, null, 2);
  const encoded = Utilities.base64Encode(Utilities.newBlob(content).getBytes());

  const repo = 'jackdengler/budget-together';
  const path = 'backups/budget-backup.json';
  const apiUrl = 'https://api.github.com/repos/' + repo + '/contents/' + path;

  // Check if file exists to get its SHA (required for updates)
  var sha = null;
  try {
    var existing = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' },
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
