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
- **Execute as:** `USER_ACCESSING` — each user runs the app as themselves
- **Access:** `DOMAIN` — available to users in the same Google Workspace domain

Access is further restricted in `Code.gs` via an `ALLOWED_EMAILS` list — only specific Google accounts can use the app.

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
