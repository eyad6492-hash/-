import { HttpError, bad, json, newId, notFound, nowISO, readJson, reqStr, str } from '../lib/util.js';
import { hashPassword } from '../lib/crypto.js';
import { log, need, userPerms } from '../lib/context.js';
import { PERMISSIONS, ROLES } from '../../public/js/shared.js';
import { publicUser, validatePassword } from './auth.js';

function cleanPerms(role, perms) {
  if (role === 'owner') throw bad('لا يمكن إنشاء مالك إضافي');
  if (!ROLES[role]) throw bad('نوع صلاحية غير معروف');
  const list = Array.isArray(perms) ? perms.filter((p) => p in PERMISSIONS) : ROLES[role].perms;
  return JSON.stringify([...new Set(list)]);
}

export const userRoutes = {
  'GET /api/users': async (ctx) => {
    need(ctx, 'users.manage');
    const { results } = await ctx.env.DB.prepare('SELECT * FROM users ORDER BY created_at').all();
    return json({ items: results.map((u) => publicUser(u, userPerms(u))) });
  },
  'GET /api/users/lite': async (ctx) => {
    const { results } = await ctx.env.DB.prepare('SELECT id, display_name FROM users WHERE active = 1 ORDER BY display_name').all();
    return json({ items: results });
  },
  'POST /api/users': async (ctx) => {
    need(ctx, 'users.manage');
    const b = await readJson(ctx.req);
    const username = reqStr(b.username, 'اسم المستخدم', 50).toLowerCase();
    if (!/^[a-z0-9_.-]{3,50}$/.test(username)) throw bad('اسم المستخدم: أحرف إنجليزية وأرقام فقط');
    validatePassword(b.password);
    const role = String(b.role || 'custom');
    const perms = cleanPerms(role, b.permissions);
    const exists = await ctx.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (exists) throw bad('اسم المستخدم مستخدم مسبقًا');
    const id = newId('u_');
    await ctx.env.DB.prepare('INSERT INTO users (id, username, display_name, password_hash, role, permissions, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, username, reqStr(b.display_name, 'الاسم', 80), await hashPassword(b.password), role, perms, b.active === false ? 0 : 1, nowISO(), nowISO()).run();
    await log(ctx, 'إضافة مستخدم', { entity: 'user', entity_id: id, details: `${username} — ${ROLES[role].label}` });
    return json({ id });
  },
  'PUT /api/users/:id': async (ctx) => {
    need(ctx, 'users.manage');
    const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(ctx.params.id).first();
    if (!u) throw notFound();
    if (u.role === 'owner') throw new HttpError(403, 'لا يمكن تعديل صلاحيات المالك');
    const b = await readJson(ctx.req);
    const role = String(b.role || u.role);
    const perms = cleanPerms(role, b.permissions);
    const stmts = [ctx.env.DB.prepare('UPDATE users SET display_name = ?, role = ?, permissions = ?, active = ?, updated_at = ? WHERE id = ?')
      .bind(str(b.display_name, 80) || u.display_name, role, perms, b.active === false ? 0 : 1, nowISO(), u.id)];
    if (b.password) { validatePassword(b.password); stmts.push(ctx.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(b.password), u.id)); }
    if (b.active === false || b.password) stmts.push(ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id));
    await ctx.env.DB.batch(stmts);
    await log(ctx, 'تغيير صلاحيات مستخدم', { entity: 'user', entity_id: u.id, details: `${u.username}: ${ROLES[role].label}${b.active === false ? ' (معطل)' : ''}` });
    return json({ ok: true });
  },
  'DELETE /api/users/:id': async (ctx) => {
    need(ctx, 'users.manage');
    const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(ctx.params.id).first();
    if (!u) throw notFound();
    if (u.role === 'owner') throw new HttpError(403, 'لا يمكن حذف المالك');
    await ctx.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
    await log(ctx, 'حذف مستخدم', { entity: 'user', entity_id: u.id, details: u.username });
    return json({ ok: true });
  },
};
