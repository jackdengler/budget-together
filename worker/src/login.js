// Sign-in for the MCP connector: consent page → GitHub → back to Claude.
// Only GitHub logins in ALLOWED_GITHUB_LOGINS are let through. The GitHub
// token is used once to read the login and then discarded.
import { authorizationErrorRedirect } from '@cloudflare/workers-oauth-provider';

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title, body, headers = new Headers()) {
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:460px;margin:48px auto;padding:0 16px;color:#1f2937}
button{font:inherit;padding:8px 18px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer}
button.primary{background:#D4663A;border-color:#D4663A;color:#fff}.warn{color:#b45309}</style>
${body}`, { headers });
}

function consentPage(d, handle, headers) {
  return page('Connect Budget Together', `<h1>Connect Budget Together?</h1>
<p><strong>${esc(d.clientName)}</strong> wants <strong>read-only</strong> access to your budget data.</p>
<p>${d.clientDomain ? `Published by <strong>${esc(d.clientDomain)}</strong>.` : 'This app registered itself; its name is not verified.'}
Access will be sent to <strong>${esc(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? '<p class="warn"><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p>' : ''}
<p>You'll sign in with GitHub next.</p>
<form method="post"><input type="hidden" name="handle" value="${esc(handle)}">
<button class="primary" name="decision" value="approve">Continue with GitHub</button>
<button name="decision" value="deny">Cancel</button></form>`, headers);
}

async function s256(verifier) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function toGithub(oauth, req, env, request, headers) {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const up = await oauth.beginUpstream(request, { data: { verifier }, headers });
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  u.searchParams.set('redirect_uri', new URL('/callback', req.url).href);
  u.searchParams.set('state', up.state);
  u.searchParams.set('code_challenge', await s256(verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('allow_signup', 'false');
  up.headers.set('Location', u.href);
  return new Response(null, { status: 302, headers: up.headers });
}

export async function authorize(req, env) {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (req.method === 'GET') {
      const request = await oauth.parseAuthRequest(req);
      const details = await oauth.describeConsent(request);
      const consent = await oauth.beginConsent(request);
      return consentPage(details, consent.handle, consent.headers);
    }
    if (req.method === 'POST') {
      const form = await req.formData();
      const handle = String(form.get('handle') || '');
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(req, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(req, handle);
      return toGithub(oauth, req, env, approved.request, approved.headers);
    }
    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    return page('Sign-in error', `<h1>Sign-in error</h1><p>${esc(e.message || e)}</p>`);
  }
}

export async function callback(req, env, fetchImpl = fetch) {
  const oauth = env.OAUTH_PROVIDER;
  let resumed;
  try { resumed = await oauth.finishUpstream(req); }
  catch (e) { return page('Sign-in error', `<h1>Sign-in error</h1><p>${esc(e.message || e)}</p>`); }
  const { request, data, headers } = resumed;
  const deny = (desc) => {
    headers.set('Location', authorizationErrorRedirect(request, 'access_denied', desc));
    return new Response(null, { status: 302, headers });
  };
  const url = new URL(req.url);
  if (url.searchParams.get('error') || !url.searchParams.get('code')) return deny('GitHub sign-in was cancelled');

  const tokRes = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'budget-api' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: url.searchParams.get('code'),
      redirect_uri: new URL('/callback', req.url).href,
      code_verifier: data.verifier,
    }),
  });
  const tok = await tokRes.json().catch(() => ({}));
  if (!tok.access_token) return deny('GitHub sign-in failed');
  const userRes = await fetchImpl('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'budget-api' },
  });
  const user = await userRes.json().catch(() => ({}));
  const allowed = (env.ALLOWED_GITHUB_LOGINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!user.login || !allowed.includes(user.login.toLowerCase())) return deny('This GitHub account is not allowed');

  const { redirectTo } = await oauth.completeAuthorization({
    request,
    userId: String(user.id),
    metadata: { login: user.login },
    scope: request.scope,
    props: { login: user.login },
  });
  headers.set('Location', redirectTo);
  return new Response(null, { status: 302, headers });
}
