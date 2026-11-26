// Mr. Vibe Salon – مستر فايب : Cloudflare Worker entry point.
// Serves the PWA and the JSON API. Every permission check happens here on the server.
import { HttpError, json } from './lib/util.js';
import { createContext, loadSession, requireUser } from './lib/context.js';
import { authRoutes } from './routes/auth.js';
import { employeeRoutes } from './routes/employees.js';
import { attendanceRoutes } from './routes/attendance.js';
import { invoiceRoutes } from './routes/invoices.js';
import { paymentRoutes } from './routes/payments.js';
import { reportRoutes } from './routes/reports.js';
import { miscRoutes, runScheduled } from './routes/misc.js';
import { serveStatic } from './static.js';

const PUBLIC = new Set(['GET /api/auth/status', 'POST /api/auth/setup', 'POST /api/auth/login', 'POST /api/auth/logout']);
const ALLOW_MUST_CHANGE = new Set(['GET /api/auth/me', 'POST /api/auth/password', 'GET /api/notifications/unread', 'GET /api/settings']);

const table = [];
for (const group of [authRoutes, employeeRoutes, attendanceRoutes, invoiceRoutes, paymentRoutes, reportRoutes, miscRoutes]) {
  for (const [key, handler] of Object.entries(group)) {
    const [method, path] = key.split(' ');
    const names = [];
    const re = new RegExp('^' + path.replace(/:[A-Za-z_]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$');
    table.push({ key, method, re, names, handler, static: !names.length });
  }
}
table.sort((a, b) => Number(b.static) - Number(a.static));

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(self)',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src https://www.openstreetmap.org; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
};
function withHeaders(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v);
  return r;
}

async function handleApi(req, env) {
  const url = new URL(req.url);
  if (!env.DB) return json({ error: 'قاعدة البيانات غير مربوطة (D1 binding DB)' }, 500);
  // CSRF: state-changing requests must come from our own JS (custom header + same origin)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers.get('x-requested-with') !== 'mvs') return json({ error: 'طلب غير مسموح' }, 403);
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'مصدر غير مسموح' }, 403);
  }
  if (env.TEST_MODE === '1' && url.pathname === '/api/test/cron') return json({ sent: await runScheduled(env, Number(req.headers.get('x-test-now')) || Date.now()) });
  const route = table.find((r) => r.method === req.method && r.re.test(url.pathname));
  if (!route) return json({ error: 'غير موجود' }, 404);
  // Test-only clock override (never enabled in production: requires the TEST_MODE var)
  const testNow = env.TEST_MODE === '1' ? Number(req.headers.get('x-test-now')) : NaN;
  const ctx = await createContext(req, env, Number.isFinite(testNow) && testNow > 0 ? testNow : Date.now());
  const m = url.pathname.match(route.re);
  route.names.forEach((n, i) => { ctx.params[n] = decodeURIComponent(m[i + 1]); });
  await loadSession(ctx);
  if (!PUBLIC.has(route.key)) { ctx.allowMustChange = ALLOW_MUST_CHANGE.has(route.key); requireUser(ctx); }
  return route.handler(ctx);
}

export default {
  async scheduled(_event, env, ectx) {
    ectx.waitUntil(runScheduled(env).then((n) => console.log('attendance alerts sent:', n)));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return withHeaders(await handleApi(req, env));
      return withHeaders(serveStatic(req));
    } catch (e) {
      if (e instanceof HttpError) return withHeaders(json({ error: e.message, code: e.code }, e.status));
      const msg = String(e?.message || e);
      if (/UNIQUE constraint failed: (invoice_images|payment_proofs)\.file_id/.test(msg)) return withHeaders(json({ error: 'تم حفظ هذه العملية مسبقاً', code: 'duplicate' }, 409));
      console.error('Unhandled error:', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : msg);
      return withHeaders(json({ error: 'حدث خطأ غير متوقع في الخادم' }, 500));
    }
  },
};
