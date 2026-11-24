import { HttpError, bad, json, newId, nowISO, readJson, reqStr, str } from '../lib/util.js';
import { hashPassword, verifyPassword, randomToken, sha256, sha256hex, b64, unb64, b64url, unb64url } from '../lib/crypto.js';
import { SESSION_COOKIE, log, requireUser, userPerms } from '../lib/context.js';
import { PERMISSIONS, ROLES } from '../../public/js/shared.js';

const MAX_FAILS = 5, LOCK_MIN = 15;

export function publicUser(u, perms) {
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, permissions: [...perms], active: !!u.active, last_login_at: u.last_login_at };
}

function sessionCookie(req, token, maxAgeSec) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

async function startSession(ctx, user, remember) {
  const token = randomToken(32);
  const hours = remember ? (Number(ctx.settings.remember_days) || 30) * 24 : (Number(ctx.settings.session_hours) || 12);
  const expires = new Date(Date.now() + hours * 3600e3).toISOString();
  const db = ctx.env.DB;
  await db.batch([
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)')
      .bind(await sha256hex(token), user.id, nowISO(), expires, (ctx.req.headers.get('user-agent') || '').slice(0, 200)),
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowISO(), user.id),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowISO()),
  ]);
  ctx.user = user; ctx.perms = userPerms(user);
  return { 'set-cookie': sessionCookie(ctx.req, token, hours * 3600) };
}

async function hasUsers(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  return r.n > 0;
}

export function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 10) throw bad('كلمة المرور يجب أن تكون 10 أحرف على الأقل');
  if (p.length > 200) throw bad('كلمة المرور طويلة جدًا');
}

export const authRoutes = {
  'GET /api/auth/status': async (ctx) => {
    const setup_required = !(await hasUsers(ctx.env));
    return json({
      setup_required, setup_enabled: setup_required && !!ctx.env.SETUP_TOKEN,
      user: ctx.user ? publicUser(ctx.user, ctx.perms) : null,
      app: { name: ctx.settings.app_name, name_ar: ctx.settings.app_name_ar, identity_image: ctx.settings.identity_image, theme: ctx.settings.theme },
    });
  },

  // First-run owner creation. Requires the SETUP_TOKEN secret, and only works while no user exists.
  'POST /api/auth/setup': async (ctx) => {
    if (await hasUsers(ctx.env)) throw new HttpError(409, 'تم إنشاء حساب المالك مسبقًا');
    if (!ctx.env.SETUP_TOKEN) throw new HttpError(503, 'لم يتم ضبط رمز الإعداد SETUP_TOKEN على الخادم');
    const b = await readJson(ctx.req);
    const a = await sha256(String(b.setup_token || '')), e = await sha256(ctx.env.SETUP_TOKEN);
    if (b64(a) !== b64(e)) throw new HttpError(403, 'رمز الإعداد غير صحيح');
    const username = reqStr(b.username, 'اسم المستخدم', 50).toLowerCase();
    if (!/^[a-z0-9_.-]{3,50}$/.test(username)) throw bad('اسم المستخدم: أحرف إنجليزية وأرقام فقط (3 أحرف على الأقل)');
    validatePassword(b.password);
    const user = {
      id: newId('u_'), username, display_name: reqStr(b.display_name, 'الاسم', 80), password_hash: await hashPassword(b.password),
      role: 'owner', permissions: JSON.stringify(ROLES.owner.perms), active: 1, created_at: nowISO(), updated_at: nowISO(),
    };
    await ctx.env.DB.prepare('INSERT INTO users (id, username, display_name, password_hash, role, permissions, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(user.id, user.username, user.display_name, user.password_hash, user.role, user.permissions, 1, user.created_at, user.updated_at).run();
    // Seed default categories once
    const { DEFAULT_CATEGORIES } = await import('../../public/js/shared.js');
    await ctx.env.DB.batch(DEFAULT_CATEGORIES.map((n) => ctx.env.DB.prepare('INSERT INTO categories (id, name, created_at) VALUES (?,?,?)').bind(newId('cat_'), n, nowISO())));
    const headers = await startSession(ctx, user, false);
    await log(ctx, 'إنشاء حساب المالك', { entity: 'user', entity_id: user.id });
    return json({ user: publicUser(user, ctx.perms) }, 200, headers);
  },

  'POST /api/auth/login': async (ctx) => {
    const b = await readJson(ctx.req);
    const username = String(b.username || '').trim().toLowerCase().slice(0, 50);
    const password = String(b.password || '');
    if (!username || !password) throw bad('أدخل اسم المستخدم وكلمة المرور');
    const db = ctx.env.DB;
    const att = await db.prepare('SELECT * FROM login_attempts WHERE key = ?').bind(username).first();
    if (att?.locked_until && att.locked_until > nowISO()) throw new HttpError(429, 'تم إيقاف المحاولات مؤقتًا بسبب كثرة المحاولات الخاطئة. حاول لاحقًا');
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    const ok = user ? await verifyPassword(password, user.password_hash) : (await hashPassword('dummy-timing'), false);
    if (!ok || !user.active) {
      const fails = (att?.failures || 0) + 1;
      const locked = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60e3).toISOString() : null;
      await db.prepare('INSERT INTO login_attempts (key, failures, locked_until, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at')
        .bind(username, locked ? 0 : fails, locked, nowISO()).run();
      throw new HttpError(401, user && !user.active && ok ? 'هذا الحساب معطل' : 'اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(username).run();
    const headers = await startSession(ctx, user, !!b.remember);
    await log(ctx, 'تسجيل دخول', { entity: 'user', entity_id: user.id });
    return json({ user: publicUser(user, ctx.perms) }, 200, headers);
  },

  'POST /api/auth/logout': async (ctx) => {
    if (ctx.session) await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(ctx.session.token_hash).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(ctx.req, '', 0) });
  },

  'GET /api/auth/me': async (ctx) => { requireUser(ctx); return json({ user: publicUser(ctx.user, ctx.perms), vault_unlocked: !!(ctx.session.vault_until && ctx.session.vault_until > nowISO()) }); },

  'POST /api/auth/password': async (ctx) => {
    requireUser(ctx);
    const b = await readJson(ctx.req);
    const u = await ctx.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(ctx.user.id).first();
    if (!(await verifyPassword(String(b.current || ''), u.password_hash))) throw bad('كلمة المرور الحالية غير صحيحة');
    validatePassword(b.next);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(b.next), nowISO(), ctx.user.id),
      ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(ctx.user.id, ctx.session.token_hash),
    ]);
    await log(ctx, 'تغيير كلمة المرور', { entity: 'user', entity_id: ctx.user.id });
    return json({ ok: true });
  },

  'POST /api/auth/logout-all': async (ctx) => {
    requireUser(ctx);
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(ctx.user.id, ctx.session.token_hash).run();
    await log(ctx, 'تسجيل خروج من جميع الأجهزة الأخرى', { entity: 'user', entity_id: ctx.user.id });
    return json({ ok: true });
  },

  // ---- Vault lock: re-enter password to unlock for N minutes ----
  'POST /api/auth/vault/unlock': async (ctx) => {
    requireUser(ctx);
    if (!ctx.perms.has('vault.view')) throw new HttpError(403, 'ليست لديك صلاحية الخزنة');
    const b = await readJson(ctx.req);
    const u = await ctx.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(ctx.user.id).first();
    if (!(await verifyPassword(String(b.password || ''), u.password_hash))) throw new HttpError(401, 'كلمة المرور غير صحيحة');
    const until = new Date(Date.now() + (Number(ctx.settings.vault_lock_minutes) || 10) * 60e3).toISOString();
    await ctx.env.DB.prepare('UPDATE sessions SET vault_until = ? WHERE token_hash = ?').bind(until, ctx.session.token_hash).run();
    await log(ctx, 'فتح الخزنة', { entity: 'vault' });
    return json({ vault_until: until });
  },
  'POST /api/auth/vault/lock': async (ctx) => {
    requireUser(ctx);
    await ctx.env.DB.prepare('UPDATE sessions SET vault_until = NULL WHERE token_hash = ?').bind(ctx.session.token_hash).run();
    return json({ ok: true });
  },

  // ---- WebAuthn (fingerprint / device biometrics), ES256 only ----
  'POST /api/auth/webauthn/register-options': async (ctx) => {
    requireUser(ctx);
    const challenge = randomToken(32), id = newId('ch_');
    await ctx.env.DB.prepare('INSERT INTO webauthn_challenges (id, challenge, user_id, kind, expires_at) VALUES (?,?,?,?,?)')
      .bind(id, challenge, ctx.user.id, 'register', new Date(Date.now() + 5 * 60e3).toISOString()).run();
    const { results } = await ctx.env.DB.prepare('SELECT id FROM webauthn_credentials WHERE user_id = ?').bind(ctx.user.id).all();
    return json({
      challenge_id: id, challenge, rp: { id: ctx.url.hostname, name: ctx.settings.app_name },
      user: { id: b64url(new TextEncoder().encode(ctx.user.id)), name: ctx.user.username, displayName: ctx.user.display_name },
      exclude: results.map((r) => r.id),
    });
  },
  'POST /api/auth/webauthn/register': async (ctx) => {
    requireUser(ctx);
    const b = await readJson(ctx.req);
    const ch = await takeChallenge(ctx, b.challenge_id, 'register');
    if (ch.user_id !== ctx.user.id) throw bad('تحدٍّ غير صالح');
    verifyClientData(ctx, b.clientDataJSON, 'webauthn.create', ch.challenge);
    const authData = unb64url(b.authenticatorData);
    await verifyAuthData(ctx, authData);
    if (Number(b.alg) !== -7) throw bad('هذا الجهاز لا يدعم خوارزمية ES256');
    const spki = unb64url(b.publicKey);
    await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); // validate
    await ctx.env.DB.prepare('INSERT INTO webauthn_credentials (id, user_id, public_key, sign_count, label, created_at) VALUES (?,?,?,?,?,?)')
      .bind(String(b.id), ctx.user.id, b64(spki), 0, str(b.label, 60) || 'جهاز', nowISO()).run();
    await log(ctx, 'تفعيل الدخول بالبصمة', { entity: 'user', entity_id: ctx.user.id });
    return json({ ok: true });
  },
  'GET /api/auth/webauthn/credentials': async (ctx) => {
    requireUser(ctx);
    const { results } = await ctx.env.DB.prepare('SELECT id, label, created_at FROM webauthn_credentials WHERE user_id = ?').bind(ctx.user.id).all();
    return json({ items: results });
  },
  'POST /api/auth/webauthn/remove': async (ctx) => {
    requireUser(ctx);
    const b = await readJson(ctx.req);
    await ctx.env.DB.prepare('DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?').bind(String(b.id), ctx.user.id).run();
    return json({ ok: true });
  },
  'POST /api/auth/webauthn/login-options': async (ctx) => {
    const b = await readJson(ctx.req);
    const challenge = randomToken(32), id = newId('ch_');
    await ctx.env.DB.prepare('INSERT INTO webauthn_challenges (id, challenge, user_id, kind, expires_at) VALUES (?,?,?,?,?)')
      .bind(id, challenge, null, 'login', new Date(Date.now() + 5 * 60e3).toISOString()).run();
    let allow = [];
    const username = String(b.username || '').trim().toLowerCase();
    if (username) {
      const { results } = await ctx.env.DB.prepare('SELECT c.id FROM webauthn_credentials c JOIN users u ON u.id = c.user_id WHERE u.username = ?').bind(username).all();
      allow = results.map((r) => r.id);
    }
    return json({ challenge_id: id, challenge, rpId: ctx.url.hostname, allow });
  },
  'POST /api/auth/webauthn/login': async (ctx) => {
    const b = await readJson(ctx.req);
    const ch = await takeChallenge(ctx, b.challenge_id, 'login');
    const cred = await ctx.env.DB.prepare('SELECT * FROM webauthn_credentials WHERE id = ?').bind(String(b.id || '')).first();
    if (!cred) throw new HttpError(401, 'البصمة غير مسجلة لهذا التطبيق');
    const cdj = verifyClientData(ctx, b.clientDataJSON, 'webauthn.get', ch.challenge);
    const authData = unb64url(b.authenticatorData);
    await verifyAuthData(ctx, authData);
    const key = await crypto.subtle.importKey('spki', unb64(cred.public_key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const signed = new Uint8Array(authData.length + 32);
    signed.set(authData, 0); signed.set(await sha256(cdj), authData.length);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(unb64url(b.signature)), signed);
    if (!ok) throw new HttpError(401, 'فشل التحقق من البصمة');
    const count = new DataView(authData.buffer, authData.byteOffset).getUint32(33);
    if (count !== 0 && count <= cred.sign_count) throw new HttpError(401, 'تم رفض البصمة (عداد غير صالح)');
    await ctx.env.DB.prepare('UPDATE webauthn_credentials SET sign_count = ? WHERE id = ?').bind(count, cred.id).run();
    const user = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(cred.user_id).first();
    if (!user || !user.active) throw new HttpError(401, 'هذا الحساب معطل');
    const headers = await startSession(ctx, user, !!b.remember);
    await log(ctx, 'تسجيل دخول بالبصمة', { entity: 'user', entity_id: user.id });
    return json({ user: publicUser(user, ctx.perms) }, 200, headers);
  },
};

async function takeChallenge(ctx, id, kind) {
  const db = ctx.env.DB;
  const ch = await db.prepare('SELECT * FROM webauthn_challenges WHERE id = ? AND kind = ?').bind(String(id || ''), kind).first();
  await db.prepare('DELETE FROM webauthn_challenges WHERE id = ? OR expires_at < ?').bind(String(id || ''), nowISO()).run();
  if (!ch || ch.expires_at < nowISO()) throw bad('انتهت صلاحية الطلب، حاول مجددًا');
  return ch;
}
function verifyClientData(ctx, cdjB64, type, challenge) {
  const bytes = unb64url(cdjB64);
  const cd = JSON.parse(new TextDecoder().decode(bytes));
  if (cd.type !== type) throw bad('نوع طلب غير صالح');
  if (cd.challenge !== challenge) throw bad('تحدٍّ غير مطابق');
  if (cd.origin !== ctx.url.origin) throw bad('مصدر غير مطابق');
  return bytes;
}
async function verifyAuthData(ctx, authData) {
  const rpHash = await sha256(ctx.url.hostname);
  for (let i = 0; i < 32; i++) if (authData[i] !== rpHash[i]) throw bad('rpId غير مطابق');
  const flags = authData[32];
  if (!(flags & 0x01)) throw bad('لم يتم التحقق من وجود المستخدم');
  if (!(flags & 0x04)) throw bad('لم يتم التحقق من هوية المستخدم');
}
// ECDSA DER signature -> raw r||s (64 bytes) for WebCrypto
function derToRaw(der) {
  let p = 2; if (der[1] & 0x80) p += der[1] & 0x7f;
  const readInt = () => { p++; const len = der[p++]; let v = der.slice(p, p + len); p += len; while (v.length > 32 && v[0] === 0) v = v.slice(1); const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; };
  const r = readInt(), s = readInt(); const out = new Uint8Array(64); out.set(r, 0); out.set(s, 32); return out;
}
export { PERMISSIONS };
