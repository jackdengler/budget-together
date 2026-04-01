# Budget Together — "Almond" Design System

Global design tokens and component specs. Every component pulls from these tokens.

## Global Rules

- **No decimals** on dollar values anywhere in the frontend. Whole numbers only (`$4,231` not `$4,231.00`).
- **No + sign** on positive amounts. **− sign** on losses only.
- **Font**: DM Sans, all weights 300–900, via Google Fonts.
- **Icons**: Bootstrap Icons via CDN CSS font. No emojis.
- **Layout**: One row header. Full-width content (no max-width cap).
- **Cards**: All cards use `--surface` bg + `2px solid --surface-border` + no box-shadow. Consistent everywhere.

## Color Tokens

### Page & Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#F0EDE6` | Main page background (Stone) |
| `--surface` | `#F8F2EA` | Card backgrounds (Almond) |
| `--surface-border` | `#e8ddd0` | Card border, 2px solid |
| `--hover-bg` | `#F8F2EA` | Button hover, interactive fills |
| `--ring-track` | `#e8ddd0` | Unfilled portion of savings ring |

### Text Hierarchy

| Token | Value | Usage |
|-------|-------|-------|
| `--text` | `#3A3020` | Headings, hero numbers, titles (Deep Brown) |
| `--text-2` | `#9A8A78` | Labels, descriptions (Taupe) |
| `--text-3` | `#b0a090` | Timestamps, hints, faintest text |
| `--text-sub` | `#7A6A58` | Breakdown values |
| `--text-inverse` | `#fff` | Text on dark backgrounds |

### Borders & Separators

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `#f0ede6` | Lines between sections, separators |
| `--border-strong` | `#e8ddd0` | Card outlines (slightly stronger) |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--green` | `#3A6A3A` | Income, savings, positive state |
| `--red` | `#A84A2A` | Spending, loss, negative state |
| `--yellow` | `#A08040` | Retirement income breakdown |
| `--purple` | `#685880` | Family income breakdown |

### Brand & Accent

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#D4663A` | Brand color, active tabs, links (Burnt Orange) |
| `--primary-hover` | `#C05A30` | Hover state |
| `--primary-light` | `rgba(212,102,58,0.08)` | Light tint |

### Person Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--p1` | `#6A8AAA` | Jack — titles, badges, dots (Dusty Blue) |
| `--p1-light` | `rgba(106,138,170,0.08)` | Jack — background tints |
| `--p1-bar` | `#A0B8CC` | Jack — bar fills (Pastel Blue) |
| `--p2` | `#9A7A2A` | Jordan — titles, badges, dots (Dark Gold) |
| `--p2-light` | `rgba(154,122,42,0.08)` | Jordan — background tints |
| `--p2-bar` | `#C4B060` | Jordan — bar fills (Pastel Gold) |

Person color constraints: Jordan cannot use red, orange, green, blue, pink, purple, or magenta — those overlap with semantic colors and Jack's blue.

### Navigation

| Token | Value | Usage |
|-------|-------|-------|
| `--nav-active-bg` | `#D4663A` | Active tab fill (uses accent) |
| `--nav-active-text` | `#fff` | Active tab text |
| `--nav-inactive` | `#999` | Inactive tab text |
| `--nav-track` | `rgba(0,0,0,0.05)` | Pill track background |

### Warning

| Token | Value | Usage |
|-------|-------|-------|
| `--warning` | `#A08040` | Review badge, warnings |
| `--warning-light` | `rgba(160,128,64,0.1)` | Warning backgrounds |

### Shadows & Radii

| Token | Value |
|-------|-------|
| `--radius` | `16px` |
| `--radius-lg` | `20px` |
| `--radius-pill` | `12px` |
| `--radius-sm` | `8px` |

### Motion

| Token | Value |
|-------|-------|
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ease-smooth` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` |

---

## Component: Summary Cards (Ring Center Stage)

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
| Hero numbers | 26px | 900 | letter-spacing -1.5px |
| Ring dollar | 19px | 900 | letter-spacing -0.5px |
| Ring percent | 16-20px | 800 | margin-top 5px |
| Labels | 9px | 800 | letter-spacing 2px, uppercase |
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
| Column gap | 20px |
| Ring size | 120px × 120px |
| Ring stroke | 8px |
| $ to % gap | 5px |
| Card border-radius | 16px |
| Responsive | Stacks to 1 column below 900px |

### Title Colors

| Card | Color Token |
|------|-------------|
| Combined | `--primary` |
| Person 1 | `--p1` |
| Person 2 | `--p2` |

### CSS Classes: `rcs-` prefix

`.rcs-row` `.rcs-card` `.rcs-title` `.rcs-body` `.rcs-col` `.rcs-col-right` `.rcs-label` `.rcs-number` `.rcs-breakdown` `.rcs-ring-wrap` `.rcs-ring-svg` `.rcs-ring-inner` `.rcs-ring-dollar` `.rcs-ring-pct`

---

## Component: Header Bar

### Layout

```
Overview  Transactions  Split  History     ‹ April 2026 ›   [3 to review] [📊] [⚙️]
```

| Property | Value |
|----------|-------|
| Rows | One row |
| Tab style | Text only — active in `--primary`, inactive `#999` |
| Logo | Hidden (display:none) |
| Background | `#E8E4DA` (Subtle Darker) |
| Border | `1px solid #ddd8cc` |
| Month nav | Compact bare chevrons (`bi-chevron-left/right`), no border |
| Actions | Full — review badge + icon buttons |
| Tab gap | 18px |
| Height | 48px |

---

## Component: Range Filter

```
Mar  2026  All  Custom                    Total  Avg/mo
─────────────────────────────────────────────────────────
```

| Property | Value |
|----------|-------|
| Style | Underline — active has `--primary` bottom border |
| Tab size | 13px |
| Gap | 18px |
| Bottom rule | `1px solid --border-strong` |
| Total/Avg | Inline right, only visible multi-month |

---

## Component: Loading Screen

```
Budget Together
  • • •
```

| Property | Value |
|----------|-------|
| Title | "Budget" in `--text`, "Together" in `--primary` — two-tone |
| Title size | 38px, weight 900 |
| Animation | 3 bouncing dots in `--primary` |
| Dot size | 6px |
| Dot gap | 6px |
| Background | `--bg` |

---

## Component: Category Section

Three square cards in a row (aspect-ratio: 1). First = category bars, second + third = blank (reserved).

### Category Row Specs

| Property | Value |
|----------|-------|
| Icon | 32px circle with `{color}10` tinted bg |
| Name width | 80px |
| Bar height | 18px XL |
| Bar fills | `--p1-bar` (Pastel Blue) + `--p2-bar` (Pastel Gold) — post-settle shares |
| Amount | 15px, weight 900 |
| Percentage | 10px, weight 700, `--text-3` |
| Chevron | `bi-chevron-right`, 10px, `#ddd` |
| Row separator | 1px solid `--bg` |
| Max visible rows | 7 (rest combined as "X Other") |

### Card Layout

| Property | Value |
|----------|-------|
| Distribution | `space-evenly` |
| Card padding | 12px |
| Title margin | 4px |
| Overflow | Hidden (no scroll) |
| "X Other" row | Combined remainder, `bi-three-dots` icon, `#94a3b8` color |

### Bar Scale

Bars represent percentage of total spending (not relative to max category). Housing at 54% fills 54%.

### Person Split Logic

- **Shared expenses**: Use `getCatSplitAmts()` ratios (post-settle shares)
- **Solo expenses**: 100% to the person who paid
