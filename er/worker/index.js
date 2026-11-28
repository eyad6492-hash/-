// E&R — Cloudflare Worker entry point: serves the PWA and the JSON API. All privacy rules are enforced here.
import { HttpError, json } from './lib/util.js';
import { loadSession, requireUser } from './lib/session.js';
import { authRoutes } from './routes/auth.js';
import { dataRoutes } from './routes/data.js';
import { miscRoutes } from './routes/misc.js';
import { actionRoutes } from './routes/actions.js';
import { runReminders } from './cron.js';
import { serveStatic } from './static.js';

const PUBLIC = new Set(['GET /api/auth/status', 'POST /api/auth/setup', 'POST /api/auth/login', 'POST /api/auth/logout', 'GET /api/auth/invite/:token', 'POST /api/auth/join', 'POST /api/auth/recover', 'POST /api/auth/forgot', 'POST /api/auth/reset']);

const table = [];
for (const group of [authRoutes, dataRoutes, miscRoutes, actionRoutes]) {
  for (const [key, handler] of Object.entries(group)) {
    const [method, path] = key.split(' ');
    const names = [];
    const re = new RegExp('^' + path.replace(/:[a-z_]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$');
    table.push({ key, method, re, names, handler, static: !names.length });
  }
}
table.sort((a, b) => Number(b.static) - Number(a.static));

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.basemaps.cartocdn.com; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
};
function withHeaders(res, ctx) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  if (ctx?.setCookie) r.headers.append('set-cookie', ctx.setCookie);
  return r;
}

async function handleApi(req, env, ectx) {
  const url = new URL(req.url);
  if (!env.DB) return { res: json({ error: 'قاعدة البيانات غير مربوطة (D1 binding DB)' }, 500) };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // CSRF defence: writes must come from our own JS (custom header) and our own origin
    if (req.headers.get('x-requested-with') !== 'er') return { res: json({ error: 'طلب غير مسموح' }, 403) };
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return { res: json({ error: 'مصدر غير مسموح' }, 403) };
  }
  const route = table.find((r) => r.method === req.method && r.re.test(url.pathname));
  if (!route) return { res: json({ error: 'غير موجود' }, 404) };
  const ctx = { req, env, url, origin: url.origin, params: {}, waitUntil: (p) => ectx.waitUntil(p.catch((e) => console.log('bg', String(e)))) };
  const m = url.pathname.match(route.re);
  route.names.forEach((n, i) => { ctx.params[n] = decodeURIComponent(m[i + 1]); });
  await loadSession(ctx);
  if (!PUBLIC.has(route.key)) requireUser(ctx);
  return { res: await route.handler(ctx), ctx };
}

export default {
  async scheduled(_event, env, ectx) {
    ectx.waitUntil(runReminders(env, { env }).then((n) => console.log('reminders sent:', n)));
  },
  async fetch(req, env, ectx) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) { const { res, ctx } = await handleApi(req, env, ectx); return withHeaders(res, ctx); }
      return withHeaders(serveStatic(req));
    } catch (e) {
      if (e instanceof HttpError) return withHeaders(json({ error: e.message, code: e.code }, e.status));
      console.error('Unhandled error:', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
      return withHeaders(json({ error: 'حدث خطأ غير متوقع في الخادم' }, 500));
    }
  },
};
