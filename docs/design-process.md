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
9. DEPLOY           → Commit, push, clasp push, clasp deploy
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
- All tournaments run via the superpowers brainstorm visual companion server
- Start: `scripts/start-server.sh --project-dir "/Users/jackdengler/budget stuff"`
- Server times out after 30min inactivity — restart if localhost won't connect
- Real data, real tokens, real component rendering
- Every option shows the full component in context

## Content Picker Format

Used in step 3 to decide WHAT goes in the element before designing HOW.

- Full-page checklist in the browser
- Each item: toggle on/off, name, description, "Current" or "New" tag
- Grouped by category
- Running count at bottom
- User reports selections in terminal

## Tournament Rendering Rules

- Use Almond design tokens throughout (not hardcoded colors)
- Font: DM Sans
- Icons: Bootstrap Icons (CSS font, no JS needed)
- Background: Stone `#F0EDE6`
- Cards: Almond `#F8F2EA` + 2px border `#e8ddd0`
- All dollar values: whole numbers, no decimals, no + sign, − on losses

## Deployment Notes

- Google Apps Script has a **200 version limit**. When hit, manually delete old versions at https://script.google.com → Project History
- `clasp push` updates HEAD code but doesn't change the live deployment
- `clasp deploy -i <ID> -V <version>` pins deployment to a specific version
- Always run all three: `clasp push` → `clasp version "desc"` → `clasp deploy`
- GAS does NOT allow `<script>` tags inside template output — move any inline JS into the main script block

## Elements Completed

| Element | Status | Key Decisions |
|---------|--------|---------------|
| Color Palette | ✅ | 25-token Almond system, 10-step palette tournament |
| Person Colors | ✅ | Jack: Dusty Blue #6A8AAA, Jordan: Dark Gold #9A7A2A, pastel bar derivatives |
| Summary Cards | ✅ | Ring Center Stage, 3 across full width, income/ring/spending |
| Header Bar | ✅ | One row, text tabs, no logo, darker bg #E8E4DA, compact chevrons |
| Range Filter | ✅ | Underline tabs, inline Total/Avg, hidden in single month |
| Loading Screen | ✅ | Two-tone title 38px, 3 bouncing dots |
| Month Arrows | ✅ | Compact bare Bootstrap chevrons, no border |
| Icon Library | ✅ | Bootstrap Icons (beat Phosphor, Lucide, Font Awesome, Material) |
| Category Section | ✅ | 3 square cards, 7 rows + "X Other", 18px bars, pastel split fills, space-evenly |
| Category Row Design | ✅ | Icon in circle, inline split bar, hover/expand metadata, chevron |
| Category Spacing | ✅ | 12-variable tournament: gaps, padding, alignment, bar height |
| Bar Shading | ✅ | Pastel soft — Jack #A0B8CC, Jordan #C4B060 |

## Elements Remaining

- Top Merchants section (currently exists but needs redesign)
- Spending vs Average chart
- Budget progress cards
- Transaction list/table (Transactions tab)
- Split tab
- History tab
- Mobile layout (currently uses old carousel)
- Modals / bottom sheets
- Settings page
- Upload/import section
- Review cards (group review modal)
- Toast notifications
