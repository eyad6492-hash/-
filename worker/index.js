// Media Buyer Control Center — Cloudflare Worker entry point.
// Serves the PWA (static assets) and the JSON API. All authorization is enforced here.
import { HttpError, json } from './lib/util.js';
import { createContext, loadSession, requireUser } from './lib/context.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { clientRoutes } from './routes/clients.js';
import { workRoutes } from './routes/work.js';
import { quoteVaultRoutes } from './routes/quotes_vault.js';
import { systemRoutes } from './routes/system.js';
import { serveStatic } from './static.js';

const PUBLIC = new Set(['GET /api/auth/status', 'POST /api/auth/setup', 'POST /api/auth/login', 'POST /api/auth/logout', 'POST /api/auth/webauthn/login-options', 'POST /api/auth/webauthn/login']);

const table = [];
for (const group of [authRoutes, userRoutes, clientRoutes, workRoutes, quoteVaultRoutes, systemRoutes]) {
  for (const [key, handler] of Object.entries(group)) {
    const [method, path] = key.split(' ');
    const names = [];
    const re = new RegExp('^' + path.replace(/:[a-z_]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$');
    table.push({ key, method, re, names, handler, static: !names.length });
  }
}
// static paths win over parameterised ones (e.g. /api/clients/lite vs /api/clients/:id)
table.sort((a, b) => Number(b.static) - Number(a.static));

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
};
function withHeaders(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  return r;
}

async function handleApi(req, env) {
  const url = new URL(req.url);
  if (!env.DB) return json({ error: 'قاعدة البيانات غير مربوطة (D1 binding DB)' }, 500);
  // CSRF defence: state-changing requests must come from our own JS (custom header + same origin)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers.get('x-requested-with') !== 'mbcc') return json({ error: 'طلب غير مسموح' }, 403);
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'مصدر غير مسموح' }, 403);
  }
  const route = table.find((r) => r.method === req.method && r.re.test(url.pathname));
  if (!route) return json({ error: 'غير موجود' }, 404);
  const ctx = await createContext(req, env);
  const m = url.pathname.match(route.re);
  route.names.forEach((n, i) => { ctx.params[n] = decodeURIComponent(m[i + 1]); });
  await loadSession(ctx);
  if (!PUBLIC.has(route.key)) requireUser(ctx);
  return route.handler(ctx);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return withHeaders(await handleApi(req, env));
      if (url.pathname === '/.well-known/assetlinks.json') {
        // Digital Asset Links for the Android (TWA) build — configured via the ASSETLINKS_JSON variable.
        return new Response(env.ASSETLINKS_JSON || '[]', { headers: { 'content-type': 'application/json' } });
      }
      const res = serveStatic(req);
      const out = withHeaders(res);
            return out;
    } catch (e) {
      if (e instanceof HttpError) return withHeaders(json({ error: e.message, code: e.code }, e.status));
      console.error('Unhandled error:', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
      return withHeaders(json({ error: 'حدث خطأ غير متوقع في الخادم' }, 500));
    }
  },
};
