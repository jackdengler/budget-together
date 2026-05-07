# Spending History Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a horizontal bar chart to the overview tab showing last 6 months of spending, broken down by Jack vs Jordan, in the empty middle-bottom desktop card and as a new 6th mobile carousel slide.

**Architecture:** Single new function `renderSpendingHistory()` returns HTML string, called from both desktop and mobile paths in `renderOverview()`. CSS added to the existing `<style>` block. All data computed from `S.transactions` using existing helpers.

**Tech Stack:** Vanilla JS/HTML/CSS in `index.html` (Google Apps Script web app, single-file frontend)

---

### Task 1: Add CSS for spending history bars

**Files:**
- Modify: `index.html` — insert CSS after the scrollbar styles (around line 425, after `::-webkit-scrollbar-thumb:hover`)

- [ ] **Step 1: Add the spending history CSS block**

Insert this CSS right after the `::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,0.2)}` line (around line 426):

```css
    /* Spending history bars */
    .sh-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:12px;transition:opacity 0.3s}
    .sh-row:last-child{margin-bottom:0}
    .sh-row.sh-faded{opacity:0.4}
    .sh-label{font-size:11px;font-weight:700;color:var(--text);width:52px;text-align:right;flex-shrink:0;padding-top:5px;letter-spacing:-0.01em}
    .sh-track{flex:1;height:26px;border-radius:13px;overflow:hidden;display:flex;background:rgba(0,0,0,0.04)}
    .sh-fill{display:flex;height:100%;border-radius:13px;overflow:hidden;transition:width 0.4s var(--ease-out)}
    .sh-seg1{background:var(--p1);height:100%}
    .sh-seg2{background:var(--p2);height:100%}
    .sh-gap{width:2.5px;background:white;height:100%;flex-shrink:0}
    .sh-amounts{display:flex;flex-direction:column;align-items:flex-end;width:54px;flex-shrink:0}
    .sh-total{font-size:11px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;letter-spacing:-0.02em;line-height:1.3}
    .sh-p1{font-size:9px;font-weight:600;color:var(--p1);font-variant-numeric:tabular-nums;line-height:1.3}
    .sh-p2{font-size:9px;font-weight:600;color:var(--p2);font-variant-numeric:tabular-nums;line-height:1.3}
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "style: add spending history bar CSS"
```

---

### Task 2: Add `renderSpendingHistory()` function

**Files:**
- Modify: `index.html` — add function before `renderOverview()` (insert around line 1598, right before `function renderOverview()`)

- [ ] **Step 1: Add the renderSpendingHistory function**

Insert this function right before the line `function renderOverview() {`:

```javascript
function renderSpendingHistory() {
  // Collect all months with data, newest first
  const allMonths = [...new Set(S.transactions.map(t => t.date && t.date.slice(0,7)).filter(Boolean))].sort().reverse().slice(0, 6);
  if (!allMonths.length) return '<p style="text-align:center;color:var(--text-3);font-size:13px;padding:18px;">No spending history yet</p>';

  // Per-month stats
  const monthData = allMonths.map(mo => {
    const txns = S.transactions.filter(t => t.date && t.date.startsWith(mo) && isVisible(t));
    const exp = txns.filter(t => t.amount > 0 && !getCat(t.category).ignored && !t.excluded);
    // Jack solo + Jack's share of shared
    const p1solo = exp.filter(t => t.person==='p1' && !t.shared).reduce((s,t) => s+t.amount, 0);
    const p2solo = exp.filter(t => t.person==='p2' && !t.shared).reduce((s,t) => s+t.amount, 0);
    const sharedByCat = {};
    for (const t of exp.filter(t => t.shared)) sharedByCat[t.category] = (sharedByCat[t.category]||0) + t.amount;
    let p1shared = 0, p2shared = 0;
    for (const [cid, amt] of Object.entries(sharedByCat)) {
      const {p1Share, p2Share} = getCatSplitAmts(cid, amt);
      p1shared += p1Share; p2shared += p2Share;
    }
    const p1total = p1solo + p1shared;
    const p2total = p2solo + p2shared;
    const total = p1total + p2total;
    return { mo, total, p1total, p2total };
  });

  const maxTotal = Math.max(...monthData.map(d => d.total), 1);
  const curMo = S.currentMonth;

  const bars = monthData.map(d => {
    const pct = d.total / maxTotal * 100;
    const p1pct = d.total > 0 ? (d.p1total / d.total * 100) : 50;
    const isCurrent = d.mo === curMo;
    const [y, m] = d.mo.split('-');
    const label = new Date(+y, +m-1, 1).toLocaleDateString('en-US', {month:'short'}) + " '" + y.slice(2);
    return `<div class="sh-row${isCurrent ? '' : ' sh-faded'}" style="cursor:pointer" onclick="S.currentMonth='${d.mo}';render()">
      <div class="sh-label">${label}</div>
      <div class="sh-track"><div class="sh-fill" style="width:${pct.toFixed(1)}%"><div class="sh-seg1" style="width:${p1pct.toFixed(1)}%"></div><div class="sh-gap"></div><div class="sh-seg2" style="flex:1"></div></div></div>
      <div class="sh-amounts">
        <div class="sh-total">${fc0(d.total)}</div>
        <div class="sh-p1">${fc0(d.p1total)}</div>
        <div class="sh-p2">${fc0(d.p2total)}</div>
      </div>
    </div>`;
  }).join('');

  return bars;
}
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add renderSpendingHistory function"
```

---

### Task 3: Wire into desktop overview

**Files:**
- Modify: `index.html` — replace the empty middle card in the desktop return block (line ~2156)

- [ ] **Step 1: Replace the empty card**

Find this line in `renderOverview()`:
```html
  <div class="card" style="margin-bottom:0;padding:12px;aspect-ratio:1;"></div>
```

Replace it with:
```html
  <div class="card" style="margin-bottom:0;padding:20px;aspect-ratio:1;display:flex;flex-direction:column;">
    <div style="font-size:14px;font-weight:800;letter-spacing:-0.02em;margin-bottom:16px;flex-shrink:0;">Spending History</div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;">
      ${renderSpendingHistory()}
    </div>
  </div>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: wire spending history into desktop overview grid"
```

---

### Task 4: Add mobile carousel slide 6

**Files:**
- Modify: `index.html` — add slide6 after slide5, update carousel references, update scroll tracking

- [ ] **Step 1: Add slide6 definition**

Find the line (around line 2014):
```javascript
    const slideNames = ['Combined', esc(S.settings.person1||'Person 1'), esc(S.settings.person2||'Person 2'), 'Categories', 'Merchants'];
```

Insert the slide6 definition right before that line:
```javascript
    // ── Slide 6: Spending History ──
    const slide6 = `<div class="ov-slide"><div class="ov-slide-inner" style="display:flex;flex-direction:column;border-top:3px solid var(--ios-accent)">
      <div class="ov-slide-title">Spending History</div>
      <div style="padding:12px 14px;flex:1;display:flex;flex-direction:column;justify-content:center;">
        ${renderSpendingHistory()}
      </div>
    </div></div>`;
```

- [ ] **Step 2: Add 'History' to slideNames and include slide6 in carousel**

Change the slideNames line to:
```javascript
    const slideNames = ['Combined', esc(S.settings.person1||'Person 1'), esc(S.settings.person2||'Person 2'), 'Categories', 'Merchants', 'History'];
```

Change the carousel line from:
```javascript
  ${slide1}${slide2}${slide3}${slide4}${slide5}
```
to:
```javascript
  ${slide1}${slide2}${slide3}${slide4}${slide5}${slide6}
```

- [ ] **Step 3: Update scroll tracking math**

Find this line in the `requestAnimationFrame` carousel scroll handler:
```javascript
        const idx = Math.round(carousel.scrollLeft / carousel.offsetWidth * (5/4.75));
        const clampedIdx = Math.max(0, Math.min(4, idx));
```

Change it to:
```javascript
        const idx = Math.round(carousel.scrollLeft / carousel.offsetWidth * (6/5.75));
        const clampedIdx = Math.max(0, Math.min(5, idx));
```

(The formula is `slideCount / (slideCount - 0.25)` because slides are 94% width except the last at 100%.)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add spending history as 6th mobile carousel slide"
```

---

### Task 5: Deploy and verify

- [ ] **Step 1: Commit any remaining changes**

```bash
git add index.html
git commit -m "feat: spending history card on overview"
```

- [ ] **Step 2: Push to remote**

```bash
git push
```

- [ ] **Step 3: Deploy to Apps Script**

```bash
npx @google/clasp push
npx @google/clasp version "Add spending history card to overview"
npx @google/clasp deploy -i "AKfycbz00_wJSijk4uL7KHMHpIi3u4OlWxmJmouGlHX2X106jwh_yDZFTVC9NyW9tFq0N1KpEg" -V <version_number> -d "Add spending history card to overview"
```

Replace `<version_number>` with the version number output from the `clasp version` command.

- [ ] **Step 4: Verify in browser**

Open the live deployment URL and check:
- Desktop: middle card in bottom row shows 6 months of horizontal bars
- Mobile: swipe to 6th slide, "History" tab pill visible
- Current month bar is full opacity, older months faded
- Clicking a bar row navigates to that month
- Bars scale proportionally (widest bar = highest spend month)
- Per-person amounts show in correct colors (blue = Jack, gold = Jordan)
