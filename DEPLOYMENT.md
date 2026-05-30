# Budget Together - Deployment & Hosting

## Architecture

Budget Together is a **Google Apps Script web app**. There is no separate server or hosting provider — Google runs everything.

- **Backend:** `Code.gs` — runs server-side on Google Apps Script (V8 runtime)
- **Frontend:** `index.html` — served by Apps Script via `HtmlService`
- **Data:** Google Sheets (created automatically on first use, stored in the owner's Google Drive)
- **Config:** `appsscript.json` — Apps Script project settings (timezone, runtime version, web app access)

## Hosting

The app is hosted entirely on Google Apps Script. The live URL is:

```
https://script.google.com/macros/s/AKfycbz00_wJSijk4uL7KHMHpIi3u4OlWxmJmouGlHX2X106jwh_yDZFTVC9NyW9tFq0N1KpEg/exec
```

The web app settings (in `appsscript.json`):
- **Execute as:** `USER_DEPLOYING` — the app always runs as the owner, so it can read the owner's budget spreadsheet on everyone's behalf.
- **Access:** `ANYONE` — anyone with a Google account can open the URL (a Google sign-in is required).

### Public pages, private data — per-person PINs

The **pages are public**: `doGet` serves the app shell (`index` / `mobile` / `tournament`) to anyone. The shell contains no budget data and no secrets, so this is safe.

**Real data is unlocked per person with a PIN, verified server-side.** The app boots into a PIN lock screen. A correct PIN (checked in `unlockWithPin`) returns a short-lived, **HMAC-signed session token**; the browser then sends that token with every backend call, and every data function (`loadAll`, `saveAll`, `getSheetUrl`, `importDataJson`, `backupToGitHub`, …) requires a valid token via `assertSession_()`. Without a valid token, the backend returns nothing.

Why PINs instead of email matching: with *Execute as: owner*, `Session.getActiveUser().getEmail()` is only reliable for accounts in the **same Workspace domain** as the owner. Both owners here use personal `@gmail.com` accounts, where email identity isn't reliably exposed — so a server-checked PIN is the robust choice and works the same for both people.

**Security properties of the PIN:**
- The PIN is **never** in source or sent to the browser. Only a **salted, iterated SHA-256 hash** is stored in Script Properties (`PIN_HASH_P1` / `PIN_HASH_P2`).
- The session token is signed with a server-only secret (`SESSION_SECRET`), so it can't be forged client-side. It expires after 7 days and lives only in `sessionStorage` (cleared when the tab closes).
- `unlockWithPin` is **throttled** (a delay per attempt) and **locks out** after repeated failures, so short PINs can't be brute-forced online. Use a 6-digit PIN.

### Setting the PINs (one-time)

PINs are **not** in the repo — the owner sets them once. In the Apps Script editor, edit and run (Run ▸ select function), or use a temporary helper:

```js
setUserPin('p1', '123456');   // owner's PIN
setUserPin('p2', '654321');   // partner's PIN
```

`setUserPin` is gated to an allow-listed admin (the deployer's own email auto-seeds `ALLOWED_EMAILS` on first run, so running it from the editor as the owner works) **or** to that same person from an already-unlocked session. After setup, each person can change their own PIN from **Settings ▸ Your login PIN** inside the app — no editor access needed.

> The old `secretPin` "Private Mode" lock (hides gambling/cash categories) is a separate, cosmetic client-side feature and is unrelated to this login PIN.

## Deployment Pipeline

### Tools

- **clasp** — Google's CLI for managing Apps Script projects locally
- **Git / GitHub** — source control at `github.com/jackdengler/budget-together`

### How code gets from this repo to the live app

1. Edit files locally (`Code.gs`, `index.html`, `appsscript.json`)
2. `git commit` + `git push` to GitHub
3. `clasp push` uploads the files to the linked Google Apps Script project
4. The live web app URL immediately reflects the new code (no separate "deploy" step needed for the default deployment)

### Key config files

| File | Purpose |
|------|---------|
| `.clasp.json` | Links this local folder to the Apps Script project (contains the `scriptId`) |
| `.claspignore` | Tells clasp which files NOT to upload (`.claude/`, `.git/`, `CLAUDE.md`, etc.) |
| `.gitignore` | Keeps `.clasprc.json` (auth token) and `.command` files out of git |
| `appsscript.json` | Apps Script project manifest (timezone, runtime, web app settings) |

### clasp setup

If setting up on a new machine:

```bash
npm install -g @google/clasp
clasp login          # authenticates with your Google account
clasp push           # uploads local files to the Apps Script project
```

The `.clasp.json` file already has the `scriptId` so clasp knows which project to push to.

## iOS Home Screen Launcher (GitHub Pages)

To get a custom icon on the iOS home screen, we serve a lightweight launcher page from GitHub Pages that redirects to the Apps Script URL.

- **Launcher URL:** `https://jackdengler.github.io/budget-together/`
- **Files:** `docs/index.html`, `docs/manifest.json`, `docs/icon.png`
- **How it works:** User adds the GitHub Pages URL to their home screen. iOS picks up the `apple-touch-icon` (the dog face icon). Tapping it opens the launcher, which immediately redirects to the Apps Script app.

To enable: Go to **GitHub repo > Settings > Pages** and set source to "Deploy from a branch", branch `main`, folder `/docs`.

## What's NOT in this repo

- No `package.json` / `node_modules` — clasp is the only Node dependency (installed globally)
- No build step — the HTML and GS files are pushed as-is
- No CI/CD pipeline — deployment is done manually via `clasp push`
- No separate database — Google Sheets is the data store, managed automatically by `Code.gs`
