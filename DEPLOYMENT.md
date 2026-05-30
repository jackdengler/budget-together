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

**Public pages, private data.** The pages are public — anyone who opens the URL gets a real response, never an error. But `doGet` only hands the actual app (`index` / `mobile` / `tournament`) to accounts on the allow-list; everyone else gets `welcome.html`, a friendly landing page that exposes no app code and no data. As defense-in-depth, every data function (`loadAll`, `saveAll`, …) is independently gated by `assertAllowed_()`, so private financial info can never be returned to an unauthorized visitor even if they reach the backend directly.

The allow-list is read from Script Properties (key: `ALLOWED_EMAILS`, comma-separated, case-insensitive). On a fresh deploy the deployer's email is auto-seeded; **the partner's email must be added** via `addAllowedEmail('partner@example.com')` or by editing the property in **Project Settings → Script Properties**.

> **Cross-domain note:** With *Execute as: owner*, `Session.getActiveUser().getEmail()` is only reliably populated for accounts in the **same Google Workspace domain** as the owner. If the partner uses a different domain (e.g. a personal `@gmail.com`) and the welcome page shows a blank "signed in as", their email won't be visible to the allow-list. If that happens, switch to a shared-secret unlock (the app already has a `secretPin` field) instead of email matching.

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
