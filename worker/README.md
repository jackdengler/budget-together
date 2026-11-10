# budget-api (Cloudflare Worker)

A small backend for Budget Together. It does two things:

- **`/plaid/*`:** connects banks through Plaid and syncs transactions for the web and mobile app.
  The app authenticates with the GitHub token it already has. Plaid access tokens stay in
  Cloudflare KV. The Worker passes transactions through to the app and stores none of them.
- **`/mcp`:** a **read-only** MCP server you add to Claude as a custom connector. Sign-in uses
  GitHub, and only the logins in `ALLOWED_GITHUB_LOGINS` are allowed.

Everything fits in Cloudflare's free plan.

## How syncing works

1. In the app, go to **Settings → Bank connections** (mobile: **Import → Connect a bank**) and click **Connect a bank**.
   Plaid Link opens. You sign in to your bank, and the Worker saves the access token.
2. **Sync banks** sends the app's saved position (cursor) for each bank to the Worker and gets back only
   transactions it hasn't seen yet. The app then:
   - skips pending transactions and anything on or before the connection's **Only after** date
   - skips payroll deposits if that's turned on (your income comes from paystubs)
   - tags card payments and moves between your own accounts as **Transfer**
   - applies your learned rules
   - puts everything in the **review queue**

   The new cursor and the queue are saved in the same write to `budget.json`.
3. Transactions use the **purchase date** and the **raw bank description**. Each keeps Plaid's
   `transaction_id` (`plaidId`), so a re-sync never duplicates anything. Later changes or removals from
   the bank are applied to unsettled transactions.

## One-time setup

### 1. Plaid
1. Sign up at <https://dashboard.plaid.com> as a US individual developer.
2. Request **Production** access on the **Trial** plan. It's free for up to 10 connected banks.
   Answer the questionnaire as personal use.
3. Complete the **Application profile** and **Company profile**. OAuth banks (Capital One, Chase, …)
   need these before they'll connect. Check the OAuth institution registration status in the dashboard.
4. **Developers → API → Allowed redirect URIs**: add both of these:
   - `https://jackdengler.github.io/budget-together/`
   - `https://jackdengler.github.io/budget-together/mobile.html`
5. **Developers → Keys**: keep your `client_id` and **Production** secret for step 4.
   Don't paste them into chat or commit them.

Optional: try everything first with Plaid's fake banks. Set `PLAID_ENV = "sandbox"` in
`wrangler.toml`, use the Sandbox secret, and sign in with `user_good` / `pass_good`.

### 2. GitHub
1. **Read-only token for the connector:** Settings → Developer settings → Fine-grained tokens →
   repository `jackdengler/private-data-storage` → **Contents: Read-only**. Give it a long expiry.
2. **OAuth App for connector sign-in:** Settings → Developer settings → OAuth Apps → New.
   - Homepage URL: `https://budget-api.<your-subdomain>.workers.dev`
   - Authorization callback URL: `https://budget-api.<your-subdomain>.workers.dev/callback`

   Generate a client secret. You'll know the exact URL after the first deploy in step 3. You can create
   the OAuth App afterwards, or edit the URLs once you know it.

### 3. Cloudflare (free)
Requires Node 20 or newer.
```sh
cd worker
npm install
npx wrangler login                      # opens the browser; free account is fine
npx wrangler kv namespace create PLAID_KV
npx wrangler kv namespace create OAUTH_KV
# paste the two printed ids into wrangler.toml (replace REPLACE_WITH_…)
npx wrangler deploy                     # prints https://budget-api.<subdomain>.workers.dev
```

### 4. Secrets (each command prompts for the value, so it never lands in a file)
```sh
npx wrangler secret put PLAID_CLIENT_ID
npx wrangler secret put PLAID_SECRET          # Production secret (or Sandbox if PLAID_ENV=sandbox)
npx wrangler secret put GH_READ_TOKEN         # the read-only token from step 2.1
npx wrangler secret put GITHUB_CLIENT_ID      # OAuth App from step 2.2
npx wrangler secret put GITHUB_CLIENT_SECRET
```
Open `https://budget-api.<subdomain>.workers.dev/` and you should see "Budget Together API is running."

### 5. App
In **Settings → Bank connections**, paste the Worker URL into **Sync server URL**. It's stored in
`budget.json`, so it applies on both devices. Then **Connect a bank** for each bank, and **Sync banks**.
The first sync right after connecting can come back empty while Plaid pulls your history. Sync again a
few minutes later.

### 6. Claude
claude.ai → **Settings → Connectors → Add custom connector**. Enter
`https://budget-api.<subdomain>.workers.dev/mcp`, then click **Connect** and sign in with GitHub.

Tools (all read-only): `list_categories`, `list_transactions`, `spending_summary`, `split_summary`
(who owes whom, same numbers as the Settle screen), `housing`, `budget_vs_actual`.

## Privacy settings (`wrangler.toml` → `[vars]`)
| Var | Default | Meaning |
|---|---|---|
| `OWNER_PERSON` | `p1` | Who the connector is for (p1 = Jack). |
| `INCLUDE_PARTNER_PRIVATE` | `false` | Whether the other person's **non-shared** transactions are visible to Claude. |
| `INCLUDE_HIDDEN` | `false` | Whether the PIN-hidden categories (gambling, cash) are visible to Claude. |
| `ALLOWED_GITHUB_LOGINS` | `jackdengler` | Who can sign in to the connector. |

Run `npx wrangler deploy` again after changing any of these.

## Development
```sh
npm test        # unit tests (Plaid mocked), incl. docs/bank-sync.js
npm run check   # bundle without deploying
npm run dev     # local Worker on :8787 (put test secrets in .dev.vars, git-ignored)
```

## Limits
- Workers free plan: 100k requests/day and 10 ms CPU per request. This app uses a handful per day.
- KV free plan: 100k reads and 1k writes per day.
- Plaid Trial: up to 10 connected banks (Items). Approval for personal use is at Plaid's discretion.
  Muse CSV exports still work as a fallback.
