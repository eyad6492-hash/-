import { HttpError, bad, json, newId, nowISO, readJson, reqStr } from '../lib/util.js';
import { hashPassword, verifyPassword, randomToken, sha256, b64, sha256hex } from '../lib/crypto.js';
import { SESSION_COOKIE, audit, requireUser, userPerms } from '../lib/context.js';

const MAX_FAILS = 5, LOCK_MIN = 15;
export const emailRe = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function publicUser(u, perms) {
  return {
    id: u.id, email: u.email, full_name: u.full_name, role: u.role, permissions: [...perms], active: !!u.active,
    works_shifts: !!u.works_shifts, photo_file_id: u.photo_file_id || null, must_change_password: !!u.must_change_password,
  };
}

function sessionCookie(req, token, maxAgeSec) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

async function startSession(ctx, user, remember) {
  const token = randomToken(32);
  const hours = remember ? (Number(ctx.settings.remember_days) || 30) * 24 : (Number(ctx.settings.session_hours) || 12);
  const db = ctx.env.DB;
  await db.batch([
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)')
      .bind(await sha256hex(token), user.id, nowISO(), new Date(Date.now() + hours * 3600e3).toISOString(), (ctx.req.headers.get('user-agent') || '').slice(0, 200)),
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowISO(), user.id),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowISO()),
  ]);
  return { 'set-cookie': sessionCookie(ctx.req, token, hours * 3600) };
}

export function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw bad('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  if (p.length > 200) throw bad('كلمة المرور طويلة جداً');
  if (!/[A-Za-z؀-ۿ]/.test(p) || !/\d/.test(p)) throw bad('كلمة المرور يجب أن تحتوي على حروف وأرقام');
}

async function hasUsers(env) { return (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n > 0; }

export const authRoutes = {
  'GET /api/auth/status': async (ctx) => {
    const setup_required = !(await hasUsers(ctx.env));
    return json({
      setup_required, setup_enabled: setup_required && !!ctx.env.SETUP_TOKEN,
      user: ctx.user ? publicUser(ctx.user, ctx.perms) : null,
      salon: { name: ctx.settings.salon_name, name_ar: ctx.settings.salon_name_ar, currency: ctx.settings.currency_symbol },
      today: ctx.today,
    });
  },

  // First-run admin creation: needs the SETUP_TOKEN secret and works only while no user exists.
  'POST /api/auth/setup': async (ctx) => {
    if (await hasUsers(ctx.env)) throw new HttpError(409, 'تم إنشاء حساب المدير مسبقاً');
    if (!ctx.env.SETUP_TOKEN) throw new HttpError(503, 'لم يتم ضبط رمز الإعداد SETUP_TOKEN على الخادم');
    const b = await readJson(ctx.req);
    if (b64(await sha256(String(b.setup_token || ''))) !== b64(await sha256(ctx.env.SETUP_TOKEN))) throw new HttpError(403, 'رمز الإعداد غير صحيح');
    const email = reqStr(b.email, 'البريد الإلكتروني', 200).toLowerCase();
    if (!emailRe.test(email)) throw bad('البريد الإلكتروني غير صحيح');
    validatePassword(b.password);
    const now = nowISO();
    const user = { id: newId('u_'), email, full_name: reqStr(b.full_name, 'الاسم', 80), role: 'admin', active: 1, permissions: '[]', must_change_password: 0 };
    const db = ctx.env.DB;
    await db.batch([
      db.prepare('INSERT INTO users (id, email, full_name, password_hash, role, permissions, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(user.id, email, user.full_name, await hashPassword(b.password), 'admin', '[]', 1, now, now),
      db.prepare('INSERT INTO employee_profiles (user_id, job_title, start_date, works_shifts, barber_rate, shop_rate, updated_at) VALUES (?,?,?,?,?,?,?)')
        .bind(user.id, 'مدير الصالون', ctx.today, 0, 0, 100, now),
    ]);
    const headers = await startSession(ctx, user, false);
    ctx.user = user; ctx.perms = userPerms(user);
    await audit(ctx, 'إنشاء حساب المدير', { entity: 'user', entity_id: user.id, after: { email, full_name: user.full_name } });
    return json({ user: publicUser(user, ctx.perms) }, 200, headers);
  },

  'POST /api/auth/login': async (ctx) => {
    const b = await readJson(ctx.req);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    const password = String(b.password || '');
    if (!email || !password) throw bad('أدخل البريد الإلكتروني وكلمة المرور');
    const db = ctx.env.DB;
    const att = await db.prepare('SELECT * FROM login_attempts WHERE key = ?').bind(email).first();
    if (att?.locked_until && att.locked_until > nowISO()) throw new HttpError(429, 'تم إيقاف المحاولات مؤقتاً بسبب كثرة المحاولات الخاطئة. حاول بعد 15 دقيقة');
    const user = await db.prepare('SELECT u.*, p.works_shifts, p.photo_file_id FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE u.email = ?').bind(email).first();
    const ok = user ? await verifyPassword(password, user.password_hash) : (await hashPassword('timing-equaliser'), false);
    if (!ok || !user.active) {
      const fails = (att?.failures || 0) + 1;
      const locked = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60e3).toISOString() : null;
      await db.prepare('INSERT INTO login_attempts (key, failures, locked_until, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at')
        .bind(email, locked ? 0 : fails, locked, nowISO()).run();
      throw new HttpError(401, user && !user.active && ok ? 'هذا الحساب معطل — تواصل مع الإدارة' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }
    await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(email).run();
    const headers = await startSession(ctx, user, !!b.remember);
    ctx.user = user; ctx.perms = userPerms(user);
    await audit(ctx, 'تسجيل دخول', { entity: 'user', entity_id: user.id });
    return json({ user: publicUser(user, ctx.perms) }, 200, headers);
  },

  'POST /api/auth/logout': async (ctx) => {
    if (ctx.session) await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(ctx.session.token_hash).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(ctx.req, '', 0), 'clear-site-data': '"cache", "storage"' });
  },

  'GET /api/auth/me': async (ctx) => { ctx.allowMustChange = true; requireUser(ctx); return json({ user: publicUser(ctx.user, ctx.perms), today: ctx.today }); },

  'POST /api/auth/password': async (ctx) => {
    ctx.allowMustChange = true; requireUser(ctx);
    const b = await readJson(ctx.req);
    const u = await ctx.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(ctx.user.id).first();
    if (!(await verifyPassword(String(b.current || ''), u.password_hash))) throw bad('كلمة المرور الحالية غير صحيحة');
    validatePassword(b.next);
    if (b.next === b.current) throw bad('اختر كلمة مرور جديدة مختلفة');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?').bind(await hashPassword(b.next), nowISO(), ctx.user.id),
      ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(ctx.user.id, ctx.session.token_hash),
    ]);
    await audit(ctx, 'تغيير كلمة المرور', { entity: 'user', entity_id: ctx.user.id, subject: ctx.user.id });
    return json({ ok: true });
  },
};
