import { DEFAULT_CHECKLIST, DEFAULT_QUICK_CHECKLIST, ROLES, PERMISSIONS, todayIn } from '../../public/js/shared.js';
import { HttpError, forbidden, newId, nowISO } from './util.js';
import { sha256hex } from './crypto.js';

export const SETTINGS_DEFAULTS = {
  app_name: 'Media Buyer Control Center',
  app_name_ar: 'مركز إدارة أعمال الميديا باير',
  identity_image: null,                 // data URL; null = bundled avatar
  theme: 'dark',
  accent: 'pink',
  provider_name: '', provider_title: 'Media Buyer', provider_phone: '', provider_email: '', provider_website: '', provider_tax_no: '', provider_address: '',
  currency: 'SAR', currency_symbol: 'ر.س',
  timezone: 'Asia/Riyadh',
  tax_rate: 15, tax_default_enabled: false, tax_label: 'ضريبة القيمة المضافة',
  quote_prefix: 'Q-', quote_validity_days: 14,
  quote_terms: 'العرض صالح حتى تاريخ الانتهاء المذكور.\nيتم سداد 100% من قيمة الخدمة مقدمًا قبل بدء العمل.\nميزانية الإعلانات تُدفع مباشرة للمنصة ولا تشمل أتعاب الإدارة.',
  report_footer: 'شكرًا لثقتكم — نسعى دائمًا لتحقيق أفضل النتائج.',
  report_show_identity: true,
  default_sub_months: 1, expiring_days: 7, payment_grace_days: 5,
  freeze_extend: true, freeze_pause_work: true,
  checklist: DEFAULT_CHECKLIST,
  quick_checklist: DEFAULT_QUICK_CHECKLIST,
  due_soon_days: 3,
  default_alert_time: '09:00',
  late_reminder_every_days: 2,
  default_pay_alert_days: 3,
  followup_default_every: 1,
  task_default_priority: 'medium',
  vault_lock_minutes: 10,
  session_hours: 12, remember_days: 30,
};

export async function loadSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = { ...SETTINGS_DEFAULTS };
  for (const r of results) { try { s[r.key] = JSON.parse(r.value); } catch { /* ignore bad row */ } }
  return s;
}

export function userPerms(user) {
  if (!user) return new Set();
  if (user.role === 'owner') return new Set(Object.keys(PERMISSIONS));
  let p = null;
  try { p = JSON.parse(user.permissions); } catch { p = null; }
  if (!Array.isArray(p)) p = ROLES[user.role]?.perms || [];
  return new Set(p.filter((k) => k in PERMISSIONS));
}

export function can(ctx, perm) { return ctx.perms.has(perm); }
export function need(ctx, ...perms) {
  for (const p of perms) if (!ctx.perms.has(p)) throw forbidden();
}

export function readCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  for (const part of c.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return v.join('='); }
  return null;
}

export const SESSION_COOKIE = 'mbcc_session';

export async function loadSession(ctx) {
  const token = readCookie(ctx.req, SESSION_COOKIE);
  if (!token) return;
  const h = await sha256hex(token);
  const row = await ctx.env.DB.prepare(
    `SELECT s.token_hash, s.expires_at, s.vault_until, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  ).bind(h).first();
  if (!row) return;
  if (row.expires_at < nowISO() || !row.active) {
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(h).run();
    return;
  }
  ctx.session = { token_hash: row.token_hash, expires_at: row.expires_at, vault_until: row.vault_until };
  const { token_hash, expires_at, vault_until, password_hash, ...user } = row;
  ctx.user = user;
  ctx.perms = userPerms(user);
}

export function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'يجب تسجيل الدخول', 'unauthenticated');
}

export async function createContext(req, env) {
  const settings = await loadSettings(env);
  return {
    req, env, url: new URL(req.url), settings, today: todayIn(settings.timezone),
    user: null, session: null, perms: new Set(), params: {},
  };
}

/** Append to the activity log. Never pass secrets in `details`. */
export async function log(ctx, action, { entity = null, entity_id = null, client_id = null, details = null } = {}) {
  await ctx.env.DB.prepare(
    'INSERT INTO activity_log (id, user_id, user_name, action, entity, entity_id, client_id, details, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  ).bind(newId(), ctx.user?.id ?? null, ctx.user?.display_name ?? 'النظام', action, entity, entity_id, client_id,
    details ? String(details).slice(0, 2000) : null, nowISO()).run();
}
