# Budget Together — Deployment & Hosting

## Architecture

Budget Together is a **static web app on GitHub Pages**. No server, no Google.

- **Frontend:** `docs/index.html`, `docs/mobile.html`, `docs/tournament.html` — served as static files.
- **Data:** `budget.json` in the **private** repo `jackdengler/private-data-storage`, read/written from the browser via the GitHub Contents API.
- **Access (the lock):** a fine-grained GitHub token scoped to the data repo (Contents: read/write). Without it the page loads but can read/write nothing. Stored only in the browser's `localStorage`, never in source.
- **Identity:** an app PIN identifies which of the two people you are. PIN *hashes* live inside `budget.json` under `_auth`; the PINs themselves are never stored or sent anywhere except once to compute the hash in your own browser.

## Hosting

GitHub Pages serves the `docs/` folder of `main`:

- **URL:** `https://jackdengler.github.io/budget-together/`
- **Enable:** GitHub repo → **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main**, Folder: **/docs**.

Deploying a change = commit + push to `main`. Pages rebuilds within ~1 minute.

## One-time setup

### 1. Create access tokens (one per person)

1. GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**.
2. **Repository access:** Only select repositories → `jackdengler/private-data-storage`.
3. **Permissions:** Repository permissions → **Contents: Read and write**.
4. Set an expiration, generate, copy the `github_pat_…` value.
5. Each person does this with their own GitHub account (so tokens are individually revocable), or you generate two — either works.

### 2. First run

Open the Pages URL. The app asks for:

1. **Access token** — paste the token. (Stored on that device only.)
2. **First-time setup** — enter both names and a **PIN for each person**. You can also **Import a backup file first** (the JSON exported from the old app via Settings → Export JSON) so your existing data carries over. Saving writes `budget.json` to the data repo.

After setup, opening the app asks for the **token** (once per device) and then your **PIN** (identifies you). Each person can change their own PIN under **Settings → Your login PIN**.

## Migrating data off Google Sheets

The old Apps Script app still runs until you stop using it. To bring data over:

1. Open the old app → **Settings → Export JSON** → save the file.
2. Open the new Pages app → paste your token → on the setup screen choose **Import a backup file first** → pick that JSON → set PINs → **Save & start**.

## Security notes

- The data repo is **private** — GitHub enforces that. The token is the access control; scope it to just that one repo and set an expiry so its blast radius is only the budget data.
- Concurrent edits use the file's SHA; if both save at the same moment one retries automatically (last-write-wins). Fine for two people.
- The app pages are public (static, no secrets) and safe to host on Pages.

## Legacy (Google Apps Script)

`Code.gs`, `appsscript.json`, `.clasp.json`, `.claspignore` are the previous
backend, kept for reference. Not used by the live app. The old deployment can be
deleted from Google once you've migrated your data.
