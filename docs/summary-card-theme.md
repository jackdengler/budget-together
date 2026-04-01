# Budget Together — "Almond" Design System

Global design tokens and component specs. Every component pulls from these tokens.

## Global Rules

- **No decimals** on dollar values anywhere in the frontend. Whole numbers only (`$4,231` not `$4,231.00`).
- **No + sign** on positive amounts. **− sign** on losses only.
- **Font**: DM Sans, all weights 300–900, via Google Fonts.
- **Layout**: One row header. Full-width content (no max-width cap).
- **Cards**: All cards use `--surface` bg + `2px solid --surface-border` + no box-shadow. Consistent everywhere.

## Color Tokens

### Page & Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| `--page-bg` | `#F0EDE6` | Main page background (Stone) |
| `--card-bg` | `#F8F2EA` | Card backgrounds (Almond) |
| `--card-border` | `#e8ddd0` | Card border, 2px solid |
| `--hover-bg` | `#F8F2EA` | Button hover, interactive fills |

### Text Hierarchy

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#3A3020` | Headings, hero numbers, titles (Deep Brown) |
| `--text-secondary` | `#9A8A78` | Labels, descriptions, less important (Taupe) |
| `--text-muted` | `#b0a090` | Timestamps, hints, faintest text |
| `--text-sub` | `#7A6A58` | Breakdown values |

### Borders & Separators

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `#f0ede6` | Lines between sections, separators |
| `--card-border` | `#e8ddd0` | Card outlines (slightly stronger) |
| `--ring-track` | `#e8ddd0` | Unfilled portion of savings ring |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--green` | `#3A6A3A` | Income, savings, positive state |
| `--red` | `#A84A2A` | Spending, loss, negative state |
| `--yellow` | `#A08040` | Retirement income breakdown |
| `--purple` | `#685880` | Family income breakdown |

### Brand & People

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#D4663A` | Brand color, active tabs, links (Burnt Orange) |
| `--person1` | `#4A6AAA` | Jack's color — titles, badges (Slate Blue) |
| `--person2` | `#9A3A6A` | Jordan's color — titles, badges (Berry) |

### Navigation

| Token | Value | Usage |
|-------|-------|-------|
| `--nav-active-bg` | `#D4663A` | Active tab fill (uses accent) |
| `--nav-active-text` | `#fff` | Active tab text |
| `--nav-inactive-text` | `#999` | Inactive tab text |
| `--nav-track` | `rgba(0,0,0,0.05)` | Pill track background |

---

## Component: Summary Card (Ring Center Stage)

Three cards spanning full screen width: Combined, Person 1, Person 2.

### Layout

```
┌─────────────────────────────────────────────┐
│  Combined                                   │
│                                             │
│   INCOME        ┌──────┐       SPENDING     │
│   $6,800       │$2,569 │       $4,231       │
│                │       │                    │
│  Reg   $5,200  │  38%  │    Fixed   $1,850  │
│  Ret   $1,200  │       │    Var     $2,381  │
│  Fam     $400  └──────┘                    │
│                                             │
└─────────────────────────────────────────────┘
```

- **Left column**: Income total + breakdown (Regular / Retirement / Family), right-aligned
- **Center**: Savings ring with $ amount and % inside (5px gap), no label — green = saving, red = loss
- **Right column**: Spending total + breakdown (Fixed / Variable), left-aligned
- **Title**: Person name top-left

### Typography

| Element | Size | Weight | Extras |
|---------|------|--------|--------|
| Card title | 17px | 900 | letter-spacing -0.3px |
| Hero numbers (income/spending) | 26px | 900 | letter-spacing -1.5px |
| Ring dollar | 19px | 900 | letter-spacing -0.5px |
| Ring percent | 16px | 800 | margin-top 5px |
| Labels (INCOME/SPENDING) | 9px | 800 | letter-spacing 2px, uppercase |
| Breakdown items | 10px | 700 | |

### Ring Behavior

- **Saving**: Ring fills green, dollar and % in `--green`
- **Loss**: Ring fills red at 100%, dollar with `−` prefix, both in `--red`
- **No label text** inside ring — color alone communicates state

### Spacing

| Property | Value |
|----------|-------|
| Card padding | 24px |
| Gap between cards | 16px |
| Column gap (income / ring / spending) | 20px |
| Ring size | 120px × 120px |
| Ring stroke | 8px |
| $ to % gap inside ring | 5px |
| Card border-radius | 16px |
| Responsive | Stacks to 1 column below 900px |

### Title Colors

| Card | Color Token |
|------|-------------|
| Combined | `--accent` |
| Person 1 | `--person1` |
| Person 2 | `--person2` |

### CSS Classes

Prefix: `rcs-` (Ring Center Stage)

| Class | Purpose |
|-------|---------|
| `.rcs-row` | 3-column grid, full width |
| `.rcs-card` | Individual card |
| `.rcs-title` | Person name |
| `.rcs-body` | Flexbox (income \| ring \| spending) |
| `.rcs-col` / `.rcs-col-right` | Data columns |
| `.rcs-label` | INCOME / SPENDING |
| `.rcs-number` | Hero dollar amounts |
| `.rcs-breakdown` | Sub-items |
| `.rcs-ring-wrap` | Ring container |
| `.rcs-ring-svg` | SVG element |
| `.rcs-ring-inner` | Centered text overlay |
| `.rcs-ring-dollar` | Dollar inside ring |
| `.rcs-ring-pct` | Percent inside ring |

### Locked State

Private card shows 🔒 centered with "Private" text, no data.

---

## Component: Header Bar

Single row, full width.

### Layout

```
[ BT ]  Overview  Transactions  Split  History     ‹ April 2026 ›   [3 to review] [📊] [⚙️]
```

### Decisions

| Property | Value |
|----------|-------|
| Rows | One row |
| Tab style | Text only — active in `--accent`, inactive `#999` |
| Logo | Minimal "BT" — uppercase, muted, `--text-3`, letter-spacing 2px |
| Background | Subtle Darker `#E8E4DA` |
| Bottom border | `1px solid #ddd8cc` |
| Month nav | Normal 16px |
| Actions | Full — review badge + icon buttons |
| Tab position | Left (after logo) |
| Padding | 12px 20px |

### Logo

- Text: "BT"
- Font: 13px, weight 800, letter-spacing 2px, uppercase
- Color: `--text-3`

### Tabs

- Style: Plain text, no pill/border
- Active: `--accent` color, weight 800
- Inactive: `#999`, weight 600
- Gap: 18px between tabs
- Size: 13px

### Month Navigation

- Font: 16px, weight 900, letter-spacing -0.5px
- Arrows: 28×28px, 2px border `--surface-border`, radius 8px
- Arrow color: `--text-3`

### Action Buttons

- Review badge: `--warning-light` background, weight 800, 11px
- Icon buttons: 32×32px, `--hover-bg` background, radius 10px, 16px emoji
- Gap: 6px

---

## Component: Range Filter

Single row with bottom border, inline Total/Avg toggle on the right.

### Layout

```
Overview  2026  All  Custom                    Total  Avg/mo
─────────────────────────────────────────────────────────────
```

### Decisions

| Property | Value |
|----------|-------|
| Style | Underline — plain text, active has bottom border in `--accent` |
| Active tab | `--accent` color, weight 800, 2px bottom border |
| Inactive tab | `#999`, weight 600 |
| Tab size | 13px |
| Gap | 18px between tabs |
| Bottom rule | `1px solid --border-strong` |
| Total/Avg | Inline right side, only visible when multi-month |
| Total/Avg size | 12px |
| Padding-bottom | 8px |
