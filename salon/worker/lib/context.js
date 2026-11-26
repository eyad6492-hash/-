import { PERMISSIONS, businessDate } from '../../public/js/shared.js';
import { HttpError, forbidden, newId, nowISO } from './util.js';
import { sha256hex } from './crypto.js';

export const SETTINGS_DEFAULTS = {
  salon_name: 'Mr. Vibe Salon',
  salon_name_ar: 'مستر فايب',
  salon_phone: '',
  salon_address: '',
  salon_tax_no: '',
  currency_symbol: 'ر.س',
  tz_offset_minutes: 180,          // Asia/Riyadh (UTC+3, no DST)
  day_start_hour: 5,               // business day boundary: 02:00 belongs to the previous day
  invoice_count_mode: 'on_create', // 'on_create' | 'on_approve'
  invoice_initial_status: 'registered', // 'registered' | 'under_review'
  default_grace_minutes: 10,
  default_barber_rate: 50,
  early_checkin_minutes: 90,       // how early before the shift a check-in is accepted
  max_gps_accuracy_m: 150,         // reject fixes less precise than this
  max_location_age_sec: 120,       // reject stale positions
  ip_distance_flag_km: 300,        // flag when network location is far from the salon
  late_checkout_hours: 6,          // check-out still allowed this long after shift end
  session_hours: 12,
  remember_days: 30,
  report_footer: 'Mr. Vibe Salon – مستر فايب',
};

export async function loadSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM salon_settings').all();
  const s = { ...SETTINGS_DEFAULTS };
  for (const r of results) { try { s[r.key] = JSON.parse(r.value); } catch { /* ignore */ } }
  return s;
}

export function userPerms(user) {
  if (!user) return new Set();
  if (user.role === 'admin') return new Set(Object.keys(PERMISSIONS));
  if (user.role === 'barber') return new Set();
  let p; try { p = JSON.parse(user.permissions); } catch { p = []; }
  return new Set((Array.isArray(p) ? p : []).filter((k) => k in PERMISSIONS));
}

export function need(ctx, ...perms) { for (const p of perms) if (!ctx.perms.has(p)) throw forbidden(); }
export function needAny(ctx, ...perms) { if (!perms.some((p) => ctx.perms.has(p))) throw forbidden(); }
export const isAdmin = (ctx) => ctx.user?.role === 'admin';

export function readCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  for (const part of c.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return v.join('='); }
  return null;
}
export const SESSION_COOKIE = 'mvs_session';

export async function loadSession(ctx) {
  const token = readCookie(ctx.req, SESSION_COOKIE);
  if (!token) return;
  const h = await sha256hex(token);
  const row = await ctx.env.DB.prepare(
    `SELECT s.token_hash, s.expires_at, u.*, p.works_shifts, p.status AS emp_status, p.photo_file_id
       FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN employee_profiles p ON p.user_id = u.id
      WHERE s.token_hash = ?`,
  ).bind(h).first();
  if (!row) return;
  if (row.expires_at < nowISO() || !row.active) {
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(h).run();
    return;
  }
  ctx.session = { token_hash: row.token_hash, expires_at: row.expires_at };
  const { token_hash, expires_at, password_hash, ...user } = row;
  ctx.user = user;
  ctx.perms = userPerms(user);
}

export function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'يجب تسجيل الدخول', 'unauthenticated');
  if (ctx.user.must_change_password && !ctx.allowMustChange) throw new HttpError(403, 'يجب تغيير كلمة المرور أولاً', 'must_change_password');
}

export async function createContext(req, env, nowMs = Date.now()) {
  const settings = await loadSettings(env);
  const off = Number(settings.tz_offset_minutes) || 0;
  return {
    req, env, url: new URL(req.url), settings, off, nowMs,
    today: businessDate(nowMs, off, Number(settings.day_start_hour) || 0),
    user: null, session: null, perms: new Set(), params: {},
    ip: req.headers.get('cf-connecting-ip') || null,
  };
}

/** Audit log: who did what, with before/after snapshots. Never put secrets in before/after. */
export function auditStmt(ctx, action, { entity = null, entity_id = null, subject = null, before = null, after = null, reason = null } = {}) {
  const j = (v) => (v === null || v === undefined ? null : JSON.stringify(v).slice(0, 20000));
  return ctx.env.DB.prepare(
    'INSERT INTO audit_logs (id, user_id, user_name, action, entity, entity_id, subject_user_id, before_json, after_json, reason, ip, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  ).bind(newId('al_'), ctx.user?.id ?? null, ctx.user?.full_name ?? 'النظام', action, entity, entity_id, subject, j(before), j(after), reason, ctx.ip, nowISO());
}
export const audit = (ctx, action, opts) => auditStmt(ctx, action, opts).run();

/** In-app notifications. */
export function notifyStmts(ctx, userIds, { type, title, body = null, link = null }) {
  return [...new Set(userIds.filter(Boolean))].map((uid) => ctx.env.DB.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, link, created_at) VALUES (?,?,?,?,?,?,?)',
  ).bind(newId('n_'), uid, type, title, body, link, nowISO()));
}
export async function managersWith(ctx, perm) {
  const { results } = await ctx.env.DB.prepare("SELECT id, role, permissions FROM users WHERE active = 1 AND role IN ('admin','supervisor')").all();
  return results.filter((u) => userPerms(u).has(perm)).map((u) => u.id);
}
export async function notifyManagers(ctx, perm, msg) {
  const ids = (await managersWith(ctx, perm)).filter((id) => id !== ctx.user?.id);
  const st = notifyStmts(ctx, ids, msg);
  if (st.length) await ctx.env.DB.batch(st);
}
export async function notifyUser(ctx, userId, msg) {
  const st = notifyStmts(ctx, [userId], msg);
  if (st.length) await ctx.env.DB.batch(st);
}

/**
 * Financial closures: blocks changes on a closed day (whole salon) or a closed period for this employee.
 * Users with closures.override may proceed only when they give a reason; the caller must audit it.
 * Returns the closure that was overridden (or null).
 */
export async function assertOpen(ctx, userId, date, reason) {
  const c = await ctx.env.DB.prepare(
    `SELECT * FROM financial_closures WHERE status = 'closed' AND date_from <= ? AND date_to >= ?
       AND (kind = 'day' OR user_id = ?) ORDER BY closed_at DESC LIMIT 1`,
  ).bind(date, date, userId).first();
  if (!c) return null;
  const label = c.kind === 'day' ? `اليوم ${c.date_from}` : `الفترة ${c.date_from} → ${c.date_to}`;
  if (!ctx.perms.has('closures.override')) throw new HttpError(423, `${label} مغلقة مالياً — لا يمكن التعديل`, 'closed');
  if (!reason || String(reason).trim().length < 3) throw new HttpError(423, `${label} مغلقة — اكتب سبب التعديل بعد الإغلاق للمتابعة`, 'closed_reason_required');
  return c;
}
