// Budget Together API (Cloudflare Worker)
//  • /plaid/*  — Plaid Link + transaction sync for the browser app (auth: the app's GitHub token)
//  • /mcp      — read-only MCP server for Claude (auth: OAuth, GitHub sign-in, allowlisted)
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { handlePlaid } from './plaid-routes.js';
import { handleMcp } from './mcp.js';
import { authorize, callback } from './login.js';

const defaultHandler = {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/plaid/')) return handlePlaid(req, env);
    if (pathname === '/authorize') return authorize(req, env);
    if (pathname === '/callback') return callback(req, env);
    if (pathname === '/') return new Response('Budget Together API is running.\n', { headers: { 'Content-Type': 'text/plain' } });
    return new Response('Not found', { status: 404 });
  },
};

const mcpHandler = { fetch: (req, env) => handleMcp(req, env) };

// The OAuth resource URL must be absolute; build the provider from the
// Worker's own origin on first request (a Worker serves one host).
let provider;
function getProvider(origin) {
  provider ||= new OAuthProvider({
    apiRoute: '/mcp',
    apiHandler: mcpHandler,
    defaultHandler,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    clientIdMetadataDocumentEnabled: true,
    resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
  });
  return provider;
}

export default {
  fetch(req, env, ctx) {
    return getProvider(new URL(req.url).origin).fetch(req, env, ctx);
  },
};
