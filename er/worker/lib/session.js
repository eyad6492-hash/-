// Sessions (HttpOnly cookie), user loading and the "only two people" rules.
import { HttpError, nowISO, readCookie } from './util.js';
import { randomToken, sha256hex } from './crypto.js';

export const COOKIE = 'er_session';
const SESSION_DAYS = 60;

export const USER_DEFAULTS = { theme: 'auto', date_display: 'both', tz: 'Asia/Riyadh', remind_hour: 9, notify: { tasks: true, notes: true, dates: true, events: true, trips: true, plans: true, shopping: true, mood: true, wishes: true, requests: true, commitments: true, agreements: true, reminders: true, urgent: true, appointments: true, confessions: true, upsets: true, needs: true, outings: true, memories: true, anniversary: true, daily: true, cravings: true, quran: true }, cycle: { enabled: false, pin_hash: null, share: 'none', show_home: false, home_card: true, fertility: false, hide: false }, week_start: 6, numerals: 'latn' };

export function parseSettings(s) {
  let o = {}; try { o = JSON.parse(s || '{}'); } catch { o = {}; }
  return { ...USER_DEFAULTS, ...o, notify: { ...USER_DEFAULTS.notify, ...(o.notify || {}) }, cycle: { ...USER_DEFAULTS.cycle, ...(o.cycle || {}) } };
}
export function publicUser(u) {
  if (!u) return null;
  const s = parseSettings(u.settings);
  return { id: u.id, name: u.name, letter: u.letter, email: u.email, avatar_id: u.avatar_id, created_at: u.created_at };
}
export function mySettings(u) {
  const s = parseSettings(u.settings);
  const { pin_hash, ...cycle } = s.cycle;
  return { ...s, cycle: { ...cycle, has_pin: !!pin_hash } };
}

export async function loadSession(ctx) {
  const token = readCookie(ctx.req, COOKIE);
  if (!token) return;
  const h = await sha256hex(token);
  const row = await ctx.env.DB.prepare('SELECT s.token_hash, s.expires_at, s.cycle_until, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(h).first();
  if (!row) return;
  if (row.expires_at < nowISO()) { await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(h).run(); return; }
  const { token_hash, expires_at, cycle_until, password_hash, recovery_hash, ...user } = row;
  ctx.session = { token_hash, expires_at, cycle_until };
  ctx.user = user;
}
export function requireUser(ctx) { if (!ctx.user) throw new HttpError(401, 'يجب تسجيل الدخول', 'auth'); }

export async function users(env) { return (await env.DB.prepare('SELECT * FROM users ORDER BY created_at').all()).results; }
export async function partnerOf(env, userId) { return env.DB.prepare('SELECT * FROM users WHERE id != ? LIMIT 1').bind(userId).first(); }

export async function startSession(ctx, userId) {
  const token = randomToken(32);
  const exp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await ctx.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ua) VALUES (?, ?, ?, ?, ?)').bind(await sha256hex(token), userId, nowISO(), exp, (ctx.req.headers.get('user-agent') || '').slice(0, 200)).run();
  const secure = new URL(ctx.req.url).protocol === 'https:' ? '; Secure' : '';
  ctx.setCookie = `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
export function clearCookie(ctx) { ctx.setCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`; }
