# Spending History Card — Design Spec

## Overview

Horizontal bar chart showing last 6 months of spending totals, broken down by Jack vs Jordan via fill color. Lives in the empty middle-bottom card on the desktop overview grid and as a new 6th carousel slide on mobile.

## Tournament Results

| Decision | Winner |
|----------|--------|
| Bar Style | Proportional Fill — bar width scales to max month's total |
| Bar Shape | Pill — 26px height, fully rounded (border-radius: 13px) |
| Split Boundary | White Gap — 2.5px white separator between Jack/Jordan segments |
| Month Labels | Short + Year — "Mar '26" format |
| Amount Display | Total + Breakdown Right — bold total, per-person amounts in their color below |
| Title & Legend | Title left, no person legend (colors on amounts are self-documenting) |
| Average Reference | None — bars show relative comparison on their own |
| Current Month | Fade Others — current month full opacity, older months at ~0.4 opacity |

## Layout

### Desktop
- Fills the existing empty middle card in the 3-column bottom row of the overview grid
- Card has `aspect-ratio: 1` (square), matching its siblings (Spending by Category, Top Merchants)
- Standard `.card` styling with `padding: 20px`

### Mobile
- New 6th slide in the `ov-carousel` after Top Merchants
- Uses `ov-slide-inner` with accent border-top (`3px solid var(--ios-accent)`)
- New tab pill "History" added to `ov-tabs`

## Visual Spec

### Card Header
- Title: "Spending History"
- Font: 14px, weight 800, letter-spacing -0.02em
- No legend, no subtitle, no average text
- Margin-bottom: 16px

### Bar Rows
Each row contains: **label | bar track | amounts**

**Label (left):**
- Format: `Mon 'YY` (e.g., "Mar '26")
- Font: 11px, weight 700
- Width: 52px, right-aligned
- Current month: color `var(--text)`, older months: same but faded via row opacity

**Bar Track (center):**
- Full track: `flex: 1`, background `rgba(0,0,0,0.04)`, height 26px, border-radius 13px
- Fill: proportional width = `monthTotal / maxMonthTotal * 100%`
- Fill is a flex container with:
  - Jack segment: `background: var(--p1)` (#6A8AAA), width = Jack's share %
  - White gap: 2.5px solid white separator
  - Jordan segment: `background: var(--p2)` (#9A7A2A), fills remaining

**Amounts (right):**
- Column layout, 54px wide, right-aligned
- Line 1: Total — 11px, weight 800, color `var(--text)`, tabular-nums
- Line 2: Jack amount — 9px, weight 600, color `var(--p1)`
- Line 3: Jordan amount — 9px, weight 600, color `var(--p2)`

### Row Spacing
- Gap between rows: 12px (margin-bottom on each row)
- Rows vertically centered in the card's remaining space (flex column, justify center)

### Opacity Treatment
- Row for current overview month: opacity 1.0
- All other rows: opacity 0.4
- Transition: `opacity 0.3s`

## Data

### Which 6 months?
- The 6 most recent months that have transaction data, sorted newest first (top = current)
- Uses the same `isVisible(t)` filter as other overview components
- Respects the current overview month context — "current" = `S.currentMonth`

### Per-person amounts
- Jack's total: sum of Jack's solo expenses + Jack's share of shared expenses (via `getCatSplitAmts`)
- Jordan's total: same logic for Jordan
- Combined total: Jack + Jordan
- Excludes ignored categories, excluded transactions, and income (amount < 0)

### Scaling
- Bar width scaled relative to the maximum month total across all 6 months
- Max month = 100% fill width, others proportional

## Interaction
- None initially — purely visual/read-only
- Clicking a bar row navigates to that month's overview (`S.currentMonth = mo; render()`) — same pattern as the old history tab's month cards

## Files to Modify
- `index.html` — add CSS, update `renderOverview()` for both desktop and mobile paths, add new render function `renderSpendingHistory()`
