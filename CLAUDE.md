# Budget Together - Development Instructions

## Architecture (static + GitHub)

Budget Together is now a **static web app hosted on GitHub Pages**. There is no
server and no Google Apps Script.

- **Frontend:** `docs/index.html` (web/desktop), `docs/mobile.html` (mobile dashboard),
  `docs/tournament.html`. All self-contained (inline CSS/JS).
- **Data:** a single JSON file (`budget.json`) in the **private** repo
  `jackdengler/private-data-storage`, read/written via the GitHub Contents API
  directly from the browser.
- **Access:** a fine-grained GitHub token (scoped to the data repo, Contents
  read/write) is the access boundary — pasted into the app once per device,
  stored only in `localStorage`, never in source.
- **Identity:** an app PIN tells the app which of the two people you are (`p1`/`p2`).
  PIN hashes live inside `budget.json` (`_auth`), never the PINs themselves.

## Deploy workflow

Deploys are just git:

1. Commit changes.
2. Push to the current branch.
3. Merge to `main` (GitHub Pages serves `docs/` from `main`).

That's it — no clasp, no Google. GitHub Pages rebuilds within a minute of the
push to `main`.

## Web vs Mobile

Always ask whether a UI change applies to **web** (`docs/index.html`) or
**mobile** (`docs/mobile.html`) before starting work. Never assume one or the other.

## Legacy

`Code.gs`, `appsscript.json`, `.clasp.json`, `.claspignore` are the old Google
Apps Script backend, kept for reference only. They are not used by the live app.

## Manual Tasks

When a task requires something done manually (enabling GitHub Pages, creating a
token, etc.), give clear step-by-step instructions.
