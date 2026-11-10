// Plaid routes for the browser app. Auth: the app's own GitHub token for the data repo.
import { verifyAppToken } from './github.js';
import { createLinkToken, exchangePublicToken, syncItem, removeItem, PlaidError } from './plaid.js';

function cors(env, res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', env.APP_ORIGIN);
  h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Max-Age', '86400');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}
const jsonRes = (obj, status = 200) => Response.json(obj, { status });

// Plaid redirect URIs must be the app's own pages (registered in the Plaid dashboard).
function safeRedirect(env, uri) {
  if (!uri) return undefined;
  try {
    const u = new URL(uri);
    return u.origin === env.APP_ORIGIN ? `${u.origin}${u.pathname}` : undefined;
  } catch { return undefined; }
}

export async function handlePlaid(req, env, fetchImpl) {
  if (req.method === 'OPTIONS') return cors(env, new Response(null, { status: 204 }));
  if (req.method !== 'POST') return cors(env, jsonRes({ error: 'Method not allowed' }, 405));
  if (!(await verifyAppToken(req, env, fetchImpl))) return cors(env, jsonRes({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401));
  const body = await req.json().catch(() => ({}));
  const path = new URL(req.url).pathname;
  try {
    let out;
    switch (path) {
      case '/plaid/link-token':
        out = await createLinkToken(env, {
          userId: 'budget-together',
          redirectUri: safeRedirect(env, body.redirectUri),
          itemId: body.itemId,
        }, fetchImpl);
        break;
      case '/plaid/exchange':
        if (!body.publicToken) return cors(env, jsonRes({ error: 'publicToken required' }, 400));
        out = await exchangePublicToken(env, body.publicToken, fetchImpl);
        break;
      case '/plaid/sync':
        if (!body.itemId) return cors(env, jsonRes({ error: 'itemId required' }, 400));
        out = await syncItem(env, { itemId: body.itemId, cursor: body.cursor, skipPayroll: body.skipPayroll !== false }, fetchImpl);
        break;
      case '/plaid/remove':
        if (!body.itemId) return cors(env, jsonRes({ error: 'itemId required' }, 400));
        await removeItem(env, body.itemId, fetchImpl);
        out = { ok: true };
        break;
      default:
        return cors(env, jsonRes({ error: 'Not found' }, 404));
    }
    return cors(env, jsonRes(out));
  } catch (e) {
    if (e instanceof PlaidError) {
      return cors(env, jsonRes({ error: e.message, code: e.code }, e.status >= 400 && e.status < 500 ? e.status : 502));
    }
    console.error(e);
    return cors(env, jsonRes({ error: 'Internal error' }, 500));
  }
}
