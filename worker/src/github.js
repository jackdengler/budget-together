// GitHub helpers: verifying the app's token, and reading budget.json for the MCP tools.

const GH_API = 'https://api.github.com';
const ghHeaders = (token, accept = 'application/vnd.github+json') => ({
  Authorization: `Bearer ${token}`,
  Accept: accept,
  'User-Agent': 'budget-api',
  'X-GitHub-Api-Version': '2022-11-28',
});

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The browser app authenticates with the same fine-grained GitHub token it
// already uses for the data repo: if the token can read that private repo,
// it belongs to one of the two of you. Results are cached briefly per isolate.
const verified = new Map(); // sha256(token) -> expiry ms
const VERIFY_TTL_MS = 5 * 60 * 1000;

export async function verifyAppToken(request, env, fetchImpl = fetch) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') || '');
  if (!m) return false;
  const key = await sha256(m[1]);
  const exp = verified.get(key);
  if (exp && exp > Date.now()) return true;
  const res = await fetchImpl(`${GH_API}/repos/${env.DATA_REPO}`, { headers: ghHeaders(m[1]) });
  if (!res.ok) { verified.delete(key); return false; }
  verified.set(key, Date.now() + VERIFY_TTL_MS);
  return true;
}

// budget.json via the Worker's own read-only token. Cached 60s per isolate so a
// burst of tool calls in one Claude turn costs one GitHub request.
let cache = { at: 0, data: null };
const DATA_TTL_MS = 60 * 1000;

export async function loadBudget(env, fetchImpl = fetch) {
  if (cache.data && Date.now() - cache.at < DATA_TTL_MS) return cache.data;
  const url = `${GH_API}/repos/${env.DATA_REPO}/contents/${encodeURIComponent(env.DATA_PATH)}?ref=${encodeURIComponent(env.DATA_BRANCH)}`;
  const res = await fetchImpl(url, { headers: ghHeaders(env.GH_READ_TOKEN, 'application/vnd.github.raw+json') });
  if (!res.ok) throw new Error(`Could not read budget data (GitHub HTTP ${res.status})`);
  const data = await res.json();
  cache = { at: Date.now(), data };
  return data;
}

export function _resetCaches() { verified.clear(); cache = { at: 0, data: null }; }
