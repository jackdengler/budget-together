# Design-by-Element Process

How we redesign every component in Budget Together. This is our repeatable workflow.

## The Loop

```
1. PICK ELEMENT     → User names the element to redesign
2. LIST EVERYTHING  → Claude lists every possible sub-element, data point, visual treatment
3. CONTENT PICK     → Interactive browser picker — user toggles what to include
4. BROAD TOURNEY    → Eye-doctor tournament of full layout approaches (8-16 options)
5. REFINE TOURNEY   → Winner from step 4 → variations tournament (one variable at a time)
6. DEEP REFINE      → 10-20 specific variables, each winner feeds into next round live
7. SAVE TO THEME    → Decisions saved to docs/summary-card-theme.md
8. IMPLEMENT        → Build into index.html using design tokens
9. DEPLOY           → Commit, push, clasp push, clasp version, clasp deploy
```

## Tournament Rules

### Eye Doctor Style (Champion Stays)
- Champion appears on left, challenger rotates in on right
- Click to pick — winner stays, loser gets eliminated
- "Same — skip" if indistinguishable
- Eliminated items pile up at bottom for reference

### One Variable at a Time
- Never change two things between options
- Each decision locks in and is **reflected in all subsequent rounds**
- User sees the cumulative result building with each choice

### Auto-Advance
- After picking a winner, next step loads automatically (0.6-0.8s flash)
- Progress roadmap at top shows what's decided

### Browser-Based
- All tournaments run in the local visual companion server
- Real data, real tokens, real component rendering
- Every option shows the full component in context, not an isolated swatch

## Content Picker Format

Used in step 3 to decide WHAT goes in the element before designing HOW.

- Full-page checklist in the browser
- Each item: toggle on/off, name, description, "Current" or "New" tag
- Grouped by category (per-row data, section-level, visual treatment, etc.)
- Running count at bottom
- User reports selections in terminal

## Tournament Rendering Rules

- Use Almond design tokens throughout (not hardcoded colors)
- Font: DM Sans
- Icons: Bootstrap Icons
- Background: Stone `#F0EDE6`
- Cards: Almond `#F8F2EA` + 2px border `#e8ddd0`
- All dollar values: whole numbers, no decimals, no + sign, − on losses

## What Gets Saved

After each element is designed, save to `docs/summary-card-theme.md`:
- Component name
- ASCII layout diagram
- All decisions table (property → winner)
- Detailed specs (sizes, weights, colors, spacing)
- CSS class prefix if applicable
- Any tokens used

## Elements Completed

| Element | Status | Key Decisions |
|---------|--------|---------------|
| Summary Cards | ✅ Done | Ring Center Stage, DM Sans, Almond colors, 120px ring |
| Header Bar | ✅ Done | One row, text tabs, no logo, darker bg, compact chevrons |
| Range Filter | ✅ Done | Underline tabs, inline Total/Avg, hidden in single month |
| Loading Screen | ✅ Done | Two-tone title (38px), 3 bouncing dots |
| Month Arrows | ✅ Done | Compact bare chevrons, no border |
| Category Section | ✅ Done | Donut right (140px) + split-bar rows, icon circles |
| Color Palette | ✅ Done | Full 25-token Almond system |
| Icon Library | ✅ Done | Bootstrap Icons |

## Elements Remaining

- Top Merchants section
- Spending vs Average chart
- Budget progress cards
- Transaction list/table (Transactions tab)
- Split tab
- History tab
- Mobile layout
- Modals / sheets
- Settings page
- Upload/import section
- Review cards
- Toast notifications
