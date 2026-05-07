# Budget Together - Development Instructions

## Auto-Deploy Workflow

**IMPORTANT:** After every code change in this repo, automatically:
1. Commit the changes with a clear message
2. Push to the current branch
3. Merge to `main` (create a PR and merge it, or push directly to main)
4. Deploy to Google Apps Script:
   ```bash
   npx @google/clasp push
   npx @google/clasp version "Description of changes"
   npx @google/clasp deploy -i "AKfycbz00_wJSijk4uL7KHMHpIi3u4OlWxmJmouGlHX2X106jwh_yDZFTVC9NyW9tFq0N1KpEg" -V <version_number> -d "Description"
   ```
   All three steps are required — `clasp push` alone only updates HEAD, not the live deployment.

Do NOT wait for the user to ask — this should happen after every edit, every time.

## Project Info

- This is a Google Apps Script web app (Budget Together)
- Frontend: `index.html` (web/desktop), `mobile.html` (mobile dashboard, served via `?v=mobile`)
- Backend: `Code.gs` (shared across both frontends)
- Config: `appsscript.json`
- iOS launcher: `docs/index.html` (GitHub Pages, points to `?v=mobile`)
- The user has a single deployed web app URL that should always reflect the latest code
- Live deployment ID: `AKfycbz00_wJSijk4uL7KHMHpIi3u4OlWxmJmouGlHX2X106jwh_yDZFTVC9NyW9tFq0N1KpEg`

## Web vs Mobile

Always ask whether a UI change applies to **web** (`index.html`) or **mobile** (`mobile.html`) before starting work. Never assume one or the other.

## Manual Tasks

When a task requires something that must be done manually (e.g., opening a website, changing a computer setting, configuring an account, enabling a toggle in an app, etc.), offer to do it on the user's Mac for them.
