// Test doubles: in-memory KV and a fetch router.
export function memKV(init = {}) {
  const m = new Map(Object.entries(init));
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, _m: m };
}
export function router(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), body, headers: init.headers });
    for (const [pat, fn] of routes) if (String(url).includes(pat)) return fn(body, init, calls);
    return new Response('{}', { status: 404 });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}
export const ok = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
