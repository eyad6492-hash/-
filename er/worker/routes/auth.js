// Authentication: first-account setup, partner invitation, login, password recovery.
// The space is limited to exactly two accounts — after the partner joins, no account can ever be created.
import { HttpError, bad, forbidden, isEmail, json, newId, nowISO, readJson, str } from '../lib/util.js';
import { hashPassword, randomToken, sha256hex, verifyPassword } from '../lib/crypto.js';
import { clearCookie, mySettings, partnerOf, publicUser, startSession, users } from '../lib/session.js';

const MIN_PASS = 8;
const checkPass = (p) => { if (typeof p !== 'string' || p.length < MIN_PASS) throw bad(`كلمة المرور يجب ألا تقل عن ${MIN_PASS} أحرف`); return p; };
const recoveryCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = crypto.getRandomValues(new Uint8Array(16)); let s = ''; b.forEach((x, i) => { s += a[x % a.length]; if (i % 4 === 3 && i < 15) s += '-'; }); return s; };
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function throttle(ctx, key) {
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const n = (await ctx.env.DB.prepare('SELECT COUNT(*) n FROM login_attempts WHERE k = ? AND at > ?').bind(key, since).first()).n;
  if (n >= 8) throw new HttpError(429, 'محاولات كثيرة — حاول بعد ربع ساعة');
}
const fail = (ctx, key) => ctx.env.DB.prepare('INSERT INTO login_attempts (k, at) VALUES (?, ?)').bind(key, nowISO()).run();

async function createUser(ctx, { name, email, password, letter }) {
  const id = newId('u_');
  const code = recoveryCode();
  await ctx.env.DB.prepare('INSERT INTO users (id, email, name, letter, password_hash, recovery_hash, settings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, email, name, letter, await hashPassword(password), await sha256hex(normCode(code)), '{}', nowISO()).run();
  await startSession(ctx, id);
  return { id, recovery_code: code };
}

async function consumeToken(ctx, token, kind) {
  const row = await ctx.env.DB.prepare('SELECT * FROM tokens WHERE token_hash = ? AND kind = ?').bind(await sha256hex(String(token || '')), kind).first();
  if (!row || row.used_at || row.expires_at < nowISO()) return null;
  return row;
}

async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM, to, subject, html }) });
  return r.ok;
}

export const authRoutes = {
  'GET /api/auth/status': async (ctx) => {
    const all = await users(ctx.env);
    return json({
      setup_needed: all.length === 0,
      setup_token_required: !!ctx.env.SETUP_TOKEN,
      space_full: all.length >= 2,
      email_reset: !!(ctx.env.RESEND_API_KEY && ctx.env.MAIL_FROM),
      user: ctx.user ? publicUser(ctx.user) : null,
    });
  },

  'POST /api/auth/setup': async (ctx) => {
    const b = await readJson(ctx.req);
    if (ctx.env.SETUP_TOKEN && b.setup_token !== ctx.env.SETUP_TOKEN) throw forbidden('رمز الإعداد غير صحيح');
    const count = (await ctx.env.DB.prepare('SELECT COUNT(*) n FROM users').first()).n;
    if (count > 0) throw new HttpError(409, 'تم إنشاء المساحة مسبقًا — استخدم تسجيل الدخول أو رابط الدعوة');
    const name = str(b.name, 40), email = str(b.email, 120)?.toLowerCase();
    if (!name) throw bad('اكتب اسمك');
    if (!isEmail(email)) throw bad('البريد الإلكتروني غير صحيح');
    const letter = b.letter === 'R' ? 'R' : 'E';
    const r = await createUser(ctx, { name, email, password: checkPass(b.password), letter });
    return json({ ok: true, recovery_code: r.recovery_code });
  },

  'POST /api/auth/login': async (ctx) => {
    const b = await readJson(ctx.req);
    const email = str(b.email, 120)?.toLowerCase() || '';
    const key = 'login:' + email;
    await throttle(ctx, key);
    const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!u || !(await verifyPassword(String(b.password || ''), u.password_hash))) { await fail(ctx, key); throw new HttpError(401, 'البريد أو كلمة المرور غير صحيحة'); }
    await startSession(ctx, u.id);
    return json({ ok: true });
  },

  'POST /api/auth/logout': async (ctx) => {
    if (ctx.session) await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(ctx.session.token_hash).run();
    clearCookie(ctx);
    return json({ ok: true });
  },

  // ---- partner invitation (only while the space has one member) ----
  'POST /api/auth/invite': async (ctx) => {
    const n = (await ctx.env.DB.prepare('SELECT COUNT(*) n FROM users').first()).n;
    if (n >= 2) throw new HttpError(409, 'المساحة مكتملة — تضم شخصين بالفعل');
    await ctx.env.DB.prepare("DELETE FROM tokens WHERE kind = 'invite'").run(); // only one live invitation
    const token = randomToken(24);
    await ctx.env.DB.prepare('INSERT INTO tokens (token_hash, kind, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256hex(token), 'invite', ctx.user.id, nowISO(), new Date(Date.now() + 7 * 86400000).toISOString()).run();
    return json({ link: `${ctx.origin}/#/join/${token}`, expires_days: 7 });
  },
  'GET /api/auth/invite/:token': async (ctx) => {
    const row = await consumeToken(ctx, ctx.params.token, 'invite');
    if (!row) throw new HttpError(410, 'رابط الدعوة غير صالح أو منتهي');
    const inviter = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.created_by).first();
    return json({ inviter: inviter?.name, letter: inviter?.letter === 'E' ? 'R' : 'E' });
  },
  'POST /api/auth/join': async (ctx) => {
    const b = await readJson(ctx.req);
    const row = await consumeToken(ctx, b.token, 'invite');
    if (!row) throw new HttpError(410, 'رابط الدعوة غير صالح أو منتهي');
    const all = await users(ctx.env);
    if (all.length !== 1) throw new HttpError(409, 'المساحة مكتملة');
    const name = str(b.name, 40), email = str(b.email, 120)?.toLowerCase();
    if (!name) throw bad('اكتب اسمك');
    if (!isEmail(email)) throw bad('البريد الإلكتروني غير صحيح');
    if (email === all[0].email) throw bad('هذا البريد مستخدم بالفعل');
    const res = await ctx.env.DB.prepare('UPDATE tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').bind(nowISO(), row.token_hash).run();
    if (!res.meta.changes) throw new HttpError(410, 'رابط الدعوة مستخدم');
    const r = await createUser(ctx, { name, email, password: checkPass(b.password), letter: all[0].letter === 'E' ? 'R' : 'E' });
    // tell the partner's open app (live sync) that the space is now complete
    await ctx.env.DB.prepare('INSERT INTO changes (col, row_id, op, actor, at) VALUES (?, ?, ?, ?, ?)').bind('users', r.id, 'create', r.id, nowISO()).run();
    return json({ ok: true, recovery_code: r.recovery_code });
  },

  // ---- password recovery ----
  // 1) personal recovery code (shown once at sign-up, can be regenerated in Settings)
  'POST /api/auth/recover': async (ctx) => {
    const b = await readJson(ctx.req);
    const email = str(b.email, 120)?.toLowerCase() || '';
    const key = 'recover:' + email;
    await throttle(ctx, key);
    const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!u || !u.recovery_hash || u.recovery_hash !== (await sha256hex(normCode(b.code)))) { await fail(ctx, key); throw new HttpError(401, 'البريد أو رمز الاستعادة غير صحيح'); }
    const code = recoveryCode();
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE users SET password_hash = ?, recovery_hash = ? WHERE id = ?').bind(await hashPassword(checkPass(b.password)), await sha256hex(normCode(code)), u.id),
      ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    ]);
    await startSession(ctx, u.id);
    return json({ ok: true, recovery_code: code });
  },
  // 2) a reset link — created by the partner from Settings, or e-mailed if mail is configured
  'POST /api/auth/reset-link': async (ctx) => {
    const p = await partnerOf(ctx.env, ctx.user.id);
    if (!p) throw bad('لا يوجد طرف آخر بعد');
    const token = randomToken(24);
    await ctx.env.DB.prepare('INSERT INTO tokens (token_hash, kind, user_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await sha256hex(token), 'reset', p.id, ctx.user.id, nowISO(), new Date(Date.now() + 86400000).toISOString()).run();
    return json({ link: `${ctx.origin}/#/reset/${token}`, for: p.name });
  },
  'POST /api/auth/forgot': async (ctx) => {
    const b = await readJson(ctx.req);
    const email = str(b.email, 120)?.toLowerCase() || '';
    await throttle(ctx, 'forgot:' + email);
    await fail(ctx, 'forgot:' + email);
    const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (u && ctx.env.RESEND_API_KEY) {
      const token = randomToken(24);
      await ctx.env.DB.prepare('INSERT INTO tokens (token_hash, kind, user_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(await sha256hex(token), 'reset', u.id, u.id, nowISO(), new Date(Date.now() + 3600000).toISOString()).run();
      await sendMail(ctx.env, email, 'E&R — استعادة كلمة المرور', `<div dir="rtl" style="font-family:sans-serif">مرحبًا ${u.name}،<br>لتعيين كلمة مرور جديدة افتح الرابط (صالح لساعة):<br><a href="${ctx.origin}/#/reset/${token}">${ctx.origin}/#/reset/${token}</a></div>`);
    }
    return json({ ok: true }); // same answer whether or not the e-mail exists
  },
  'POST /api/auth/reset': async (ctx) => {
    const b = await readJson(ctx.req);
    const row = await consumeToken(ctx, b.token, 'reset');
    if (!row) throw new HttpError(410, 'الرابط غير صالح أو منتهي');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(checkPass(b.password)), row.user_id),
      ctx.env.DB.prepare('UPDATE tokens SET used_at = ? WHERE token_hash = ?').bind(nowISO(), row.token_hash),
      ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
    ]);
    await startSession(ctx, row.user_id);
    return json({ ok: true });
  },

  // ---- account ----
  'POST /api/auth/password': async (ctx) => {
    const b = await readJson(ctx.req);
    const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(ctx.user.id).first();
    if (!(await verifyPassword(String(b.current || ''), u.password_hash))) throw new HttpError(401, 'كلمة المرور الحالية غير صحيحة');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(checkPass(b.password)), u.id),
      ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(u.id, ctx.session.token_hash),
    ]);
    return json({ ok: true });
  },
  'POST /api/auth/recovery-code': async (ctx) => {
    const b = await readJson(ctx.req);
    const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(ctx.user.id).first();
    if (!(await verifyPassword(String(b.password || ''), u.password_hash))) throw new HttpError(401, 'كلمة المرور غير صحيحة');
    const code = recoveryCode();
    await ctx.env.DB.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').bind(await sha256hex(normCode(code)), u.id).run();
    return json({ recovery_code: code });
  },
  'POST /api/auth/logout-all': async (ctx) => {
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(ctx.user.id).run();
    clearCookie(ctx);
    return json({ ok: true });
  },
  'GET /api/me': async (ctx) => json({ user: publicUser(ctx.user), settings: mySettings(ctx.user) }),
};
