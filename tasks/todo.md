# Plaid sync + read-only MCP server — plan

Status: **PLAN — waiting on decisions before building** (branch `plaid-mcp`)

## Constraints found in the codebase

- The app is static (GitHub Pages) with no server. Plaid needs a server: creating link tokens,
  exchanging tokens and syncing all need the Plaid secret, and Plaid's API can't be called
  from a browser. A Claude custom connector also needs a live HTTPS endpoint.
  → We need one small backend.
- `budget.json` in `jackdengler/private-data-storage` is **plaintext JSON**. The "end-to-end
  encryption" described in `DEPLOYMENT.md` (commit 8ad89d5) only changed the docs. The
  encryption code was never committed. The private repo plus the token is the only protection today.
- Plaid's `amount` sign already matches the app's internal convention
  (positive = money out, negative = money in).
- Today the review queue (`pendingReview`) lives only in memory, so closing the tab loses it.
  A synced cursor can't be "un-synced", so the queue must be persisted.

## Architecture

One **Cloudflare Worker** (free tier), source in `worker/`, deployed by you with `wrangler`.

```
Browser app ──(GitHub token as auth)──► Worker /plaid/*  ──► Plaid API
                                           │ KV: access_tokens only
Claude ──(OAuth via GitHub login)──► Worker /mcp ──(read-only token)──► budget.json
```

### Plaid (app-driven, stateless sync)
- `POST /plaid/link-token`: create a Link token for Transactions with the OAuth `redirect_uri` set to the Pages URL.
- `POST /plaid/exchange`: public_token → access_token, stored in Worker KV (never in the repo or the browser).
  Returns `{itemId, institution}`.
- `POST /plaid/sync {itemId, cursor}`: runs `/transactions/sync` until `has_more` is false and returns
  `added/modified/removed` mapped to the app's transaction shape plus `next_cursor`. The Worker stores no transactions.
- `DELETE /plaid/item/:id`: `/item/remove` plus a KV delete.
- Auth: the app sends its existing GitHub token, and the Worker checks it can access the data repo.
  No new credential for the browser.
- The cursor for each Item is stored in `budget.json` → `plaid.items[]`, and is saved in the same write as the
  new review-queue rows. A crash between the sync and the save loses nothing.

### Mapping Plaid → app transaction
- `date` = `authorized_date ?? date`
- `description` = `original_description ?? name`, so existing rules still match
- `amount` = Plaid `amount` (same sign)
- `plaidId` = `transaction_id`, used for dedup and for applying modified/removed changes
- `person` = owner set per connection (p1/p2)
- Skip `pending: true`.
- `personal_finance_category`:
  - `TRANSFER_IN/OUT` and `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` → category `transfer` (ignored, kept for audit)
  - `INCOME_WAGES` → skipped when "income comes from paystubs" is on (default on)
- Then the existing `applyRules()` / `categorize()` runs, and everything still goes through the review queue.
- `startAfter` date per connection (default = latest transaction date already in the app) prevents
  overlap with earlier CSV/PDF imports.

### MCP server (read-only)
- Streamable HTTP at `/mcp`, built with Cloudflare `agents` (McpAgent) and `@cloudflare/workers-oauth-provider`.
- Login through a GitHub OAuth app, with an allowlist containing only your GitHub login.
- Reads `budget.json` using its own fine-grained token (Contents: **read-only**).
- Tools:
  - `list_categories`
  - `list_transactions` (date range, category, person, shared, text search, limit)
  - `spending_summary` (by month or category, per person, ignoring ignored and excluded categories)
  - `split_summary` (shared spend, your share vs Jordan's, settled vs outstanding; reuses the logic of `calcSplit()` in index.html)
  - `rent` (housing over time)
  - `budgets` (budget vs actual)

## Your side (manual)

1. **Plaid:** sign up at dashboard.plaid.com → request Production through the **Trial** plan (questionnaire) →
   complete the Application and Company profiles, which OAuth banks such as **Capital One** require. Check
   the OAuth institution status page → add allowed redirect URI `https://jackdengler.github.io/budget-together/`
   → keep client_id and the Production secret for step 3. Don't paste them into chat.
2. **GitHub:** create an OAuth App for the MCP login, and a fine-grained token for the data repo with Contents **read-only**.
3. **Cloudflare:** free account → `npx wrangler login` → `wrangler kv namespace create PLAID` →
   `wrangler secret put` for PLAID_CLIENT_ID, PLAID_SECRET, GH_READ_TOKEN, GITHUB_CLIENT_ID,
   GITHUB_CLIENT_SECRET, COOKIE_KEY → `wrangler deploy`. Exact commands will go in `worker/README.md`.
4. **Claude:** Settings → Connectors → Add custom connector → `https://<worker>.workers.dev/mcp`.

## Checklist
- [ ] Decisions (below) answered
- [ ] `worker/`: Plaid endpoints, auth check, mapping, KV; unit tests with Plaid mocked
- [ ] App: persist review queue; `plaid` section in data; Connect / Sync / Remove UI; apply modified/removed
- [ ] App: dedup by `plaidId`, falling back to the existing date|desc|amount|person key
- [ ] `worker/` MCP: OAuth, read-only tools, split logic ported and tested against current data
- [ ] Docs: `worker/README.md` setup, CLAUDE.md/DEPLOYMENT.md (fix the encryption claim)
- [ ] Verify: run tests; replay Muse's Aug/Sep files through the mapping and check against the app (as in the earlier reconciliation)
- [ ] You: Plaid sign-up, deploy, first live sync in the app

## Open decisions
1. Should the Connect/Sync UI go on web (`index.html`), mobile (`mobile.html`), or both?
2. Encryption: keep plaintext in the private repo (as today, simplest for the MCP), or add real encryption first (then the Worker must hold a decryption key)?
3. Cloudflare Workers for hosting: OK?
4. Skip Plaid payroll deposits because income comes from paystubs: OK?

## Limits / risks
- Plaid Trial approval for personal use isn't guaranteed. Capital One OAuth may take extra registration time.
  Muse CSVs stay as the fallback.
- I can't reach plaid.com or Cloudflare from this session, so live testing happens after you deploy.
  Before that, everything is tested with mocked Plaid responses.
