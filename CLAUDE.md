# Budget Together - Development Instructions

## Auto-Deploy Workflow

**IMPORTANT:** After every code change in this repo, automatically:
1. Commit the changes with a clear message
2. Push to the current branch
3. Merge to `main` (create a PR and merge it, or push directly to main)
4. Deploy to Google Apps Script using `clasp push` so the live web app URL reflects the changes immediately

Do NOT wait for the user to ask — this should happen after every edit, every time.

## Project Info

- This is a Google Apps Script web app (Budget Together)
- Frontend: `index.html`
- Backend: `Code.gs`
- Config: `appsscript.json`
- The user has a single deployed web app URL that should always reflect the latest code
