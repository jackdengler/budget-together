// ── Budget Together — Google Apps Script Backend ──────────
// Deploy as a Web App: Execute as "Me", access "Anyone with Google account"

const ALLOWED_EMAILS = [
  'denglerjack@gmail.com',
  'jleaf355@gmail.com'
];

function doGet() {
  const user = Session.getActiveUser().getEmail();
  if (!ALLOWED_EMAILS.includes(user.toLowerCase())) {
    return HtmlService.createHtmlOutput('<h2>Access denied</h2><p>This app is private.</p>');
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Budget Together 💕')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
  ts.appendRow(['id','date','amount','description','category','person','note','shared','settled','splitRatio','excluded']);
  ts.setFrozenRows(1);
  ts.getRange(1,1,1,11).setFontWeight('bold');

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
    ts.getRange(2, 1, lastR - 1, 11).getValues().forEach(r => {
      if (!r[0]) return;
      transactions.push({
        id:          String(r[0]),
        date:        String(r[1]),
        amount:      parseFloat(r[2]) || 0,
        description: String(r[3]),
        category:    String(r[4]) || 'other',
        person:      String(r[5]) || 'p1',
        note:        String(r[6] || ''),
        shared:      r[7] === true || String(r[7]).toLowerCase() === 'true',
        settled:     r[8] === true || String(r[8]).toLowerCase() === 'true',
        splitRatio:  parseFloat(r[9]) || 0.5,
        excluded:    r[10] === true || String(r[10]).toLowerCase() === 'true',
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
  const th = ['id','date','amount','description','category','person','note','shared','settled','splitRatio','excluded'];
  const tRows = [th, ...(data.transactions || []).map(t =>
    [t.id, t.date, t.amount||0, t.description||'', t.category, t.person, t.note||'',
     !!t.shared, !!t.settled, t.splitRatio||0.5, !!t.excluded]
  )];
  ts.getRange(1, 1, tRows.length, 11).setValues(tRows);
  ts.getRange(1, 1, 1, 11).setFontWeight('bold');

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
