# Mac Commands to Run After Cloud Edits

When Claude makes changes in the cloud, these commands need to be run on your Mac to complete the deployment.

## After Any Code Change

Run these on your Mac terminal:

```bash
cd ~/budget-together   # or wherever your local repo is
git pull origin main
clasp push
```

That's it. The live web app URL will immediately reflect the changes.

## One-Time Setup (New Mac)

If setting up clasp for the first time:

```bash
npm install -g @google/clasp
clasp login
```

The `.clasp.json` in the repo already has the `scriptId`, so clasp knows which project to push to.

## Quick Reference

| What happened in the cloud | What to run on Mac |
|---|---|
| Code change pushed to `main` | `git pull origin main && clasp push` |
| First time setup | `npm install -g @google/clasp && clasp login` |
| Check what clasp would push | `clasp status` |
| View Apps Script logs | `clasp logs` |
| Open Apps Script editor in browser | `clasp open` |
