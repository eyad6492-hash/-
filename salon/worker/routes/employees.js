import { HttpError, bad, forbidden, json, newId, notFound, nowISO, readJson, reqStr, str, dateOrNull, numOrNull, intOrNull, oneOf } from '../lib/util.js';
import { hashPassword } from '../lib/crypto.js';
import { audit, auditStmt, need, needAny, isAdmin, notifyStmts, requireUser } from '../lib/context.js';
import { claimFile } from '../lib/files.js';
import { emailRe, validatePassword } from './auth.js';
import { PERMISSIONS, EMP_STATUS, validRates, isTime, WEEKDAYS } from '../../public/js/shared.js';

export async function rateFor(db, userId, date) {
  const r = await db.prepare('SELECT barber_rate, shop_rate FROM employee_rates_history WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, created_at DESC LIMIT 1').bind(userId, date).first();
  if (r) return r;
  const p = await db.prepare('SELECT barber_rate, shop_rate FROM employee_profiles WHERE user_id = ?').bind(userId).first();
  return p || null;
}

async function loadEmployee(ctx, id) {
  const e = await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.role, u.permissions, u.active, u.last_login_at, u.created_at, u.must_change_password, p.*
       FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE u.id = ?`,
  ).bind(id).first();
  if (!e) throw notFound('الموظف غير موجود');
  try { e.permissions = JSON.parse(e.permissions); } catch { e.permissions = []; }
  return e;
}

/** Supervisors may only manage barbers; admins manage everyone. */
function assertCanManage(ctx, target) {
  need(ctx, 'employees.manage');
  if (!isAdmin(ctx) && target.role !== 'barber') throw forbidden('فقط المدير يستطيع تعديل حسابات الإدارة');
}

function profileFields(b, settings) {
  const p = {};
  if ('phone' in b) p.phone = str(b.phone, 30);
  if ('job_title' in b) p.job_title = str(b.job_title, 80);
  if ('start_date' in b) p.start_date = dateOrNull(b.start_date);
  if ('status' in b) p.status = oneOf(b.status, Object.keys(EMP_STATUS), 'active');
  if ('works_shifts' in b) p.works_shifts = b.works_shifts ? 1 : 0;
  if ('location_id' in b) p.location_id = str(b.location_id, 60);
  if ('radius_override_m' in b) { const r = intOrNull(b.radius_override_m); if (r !== null && (r < 10 || r > 5000)) throw bad('نطاق الموقع يجب أن يكون بين 10 و 5000 متر'); p.radius_override_m = r; }
  if ('notes' in b) p.notes = str(b.notes, 1000);
  return p;
}

function parseDays(days) {
  if (!Array.isArray(days)) throw bad('أيام الدوام مطلوبة');
  const out = [];
  for (let w = 0; w < 7; w++) {
    const d = days.find((x) => Number(x.weekday) === w) || { is_off: true };
    const off = !!d.is_off;
    if (!off && (!isTime(d.start_time) || !isTime(d.end_time))) throw bad(`وقت الدوام غير صحيح ليوم ${WEEKDAYS[w]}`);
    if (!off && d.start_time === d.end_time) throw bad(`بداية ونهاية الدوام متساويتان ليوم ${WEEKDAYS[w]}`);
    out.push({ weekday: w, is_off: off ? 1 : 0, start_time: off ? null : d.start_time, end_time: off ? null : d.end_time });
  }
  return out;
}

export const employeeRoutes = {
  'GET /api/employees': async (ctx) => {
    needAny(ctx, 'employees.view', 'employees.manage');
    const { results } = await ctx.env.DB.prepare(
      `SELECT u.id, u.email, u.full_name, u.role, u.active, u.last_login_at, p.phone, p.photo_file_id, p.job_title, p.status, p.works_shifts, p.start_date
         FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id ORDER BY u.active DESC, u.role, u.full_name`,
    ).all();
    for (const r of results) { const rt = await rateFor(ctx.env.DB, r.id, ctx.today); r.barber_rate = rt?.barber_rate ?? null; r.shop_rate = rt?.shop_rate ?? null; }
    return json({ items: results });
  },

  // Small list for selectors (any manager)
  'GET /api/employees/lite': async (ctx) => {
    if (ctx.user.role === 'barber') throw forbidden();
    const { results } = await ctx.env.DB.prepare(
      `SELECT u.id, u.full_name, u.role, u.active, p.works_shifts, p.photo_file_id FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id ORDER BY u.active DESC, u.full_name`,
    ).all();
    return json({ items: results });
  },

  'POST /api/employees': async (ctx) => {
    need(ctx, 'employees.manage');
    const b = await readJson(ctx.req);
    const role = oneOf(b.role, ['admin', 'supervisor', 'barber'], 'barber');
    if (role !== 'barber' && !isAdmin(ctx)) throw forbidden('فقط المدير يستطيع إنشاء حسابات إدارية');
    const email = reqStr(b.email, 'البريد الإلكتروني', 200).toLowerCase();
    if (!emailRe.test(email)) throw bad('البريد الإلكتروني غير صحيح');
    if (await ctx.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) throw new HttpError(409, 'هذا البريد مستخدم لحساب آخر');
    validatePassword(b.password);
    const perms = role === 'supervisor' ? (Array.isArray(b.permissions) ? b.permissions.filter((p) => p in PERMISSIONS) : []) : [];
    const barber = numOrNull(b.barber_rate) ?? Number(ctx.settings.default_barber_rate) ?? 50;
    const shop = numOrNull(b.shop_rate) ?? 100 - barber;
    if (!validRates(barber, shop)) throw bad('مجموع نسبة الحلاق ونسبة المحل يجب أن يساوي 100%');
    const id = newId('u_'), now = nowISO();
    const p = { works_shifts: role === 'barber' ? 1 : 0, status: 'active', start_date: ctx.today, ...profileFields(b, ctx.settings) };
    const full_name = reqStr(b.full_name, 'الاسم الكامل', 80);
    const db = ctx.env.DB;
    const stmts = [
      db.prepare('INSERT INTO users (id, email, full_name, password_hash, role, permissions, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(id, email, full_name, await hashPassword(b.password), role, JSON.stringify(perms), 1, b.must_change_password === false ? 0 : 1, now, now),
      db.prepare(`INSERT INTO employee_profiles (user_id, phone, job_title, start_date, status, works_shifts, location_id, radius_override_m, barber_rate, shop_rate, notes, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, p.phone ?? null, p.job_title ?? null, p.start_date, p.status, p.works_shifts, p.location_id ?? null, p.radius_override_m ?? null, barber, shop, p.notes ?? null, now),
      db.prepare('INSERT INTO employee_rates_history (id, user_id, barber_rate, shop_rate, effective_from, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind(newId('rt_'), id, barber, shop, p.start_date || ctx.today, 'النسبة الأولية', ctx.user.id, now),
    ];
    if (b.photo_file_id) {
      await claimFile(ctx, b.photo_file_id, { kind: 'avatar', ownerUserId: null });
      stmts.push(db.prepare('UPDATE files SET owner_user_id = ?, attached = 1 WHERE id = ?').bind(id, b.photo_file_id));
      stmts.push(db.prepare('UPDATE employee_profiles SET photo_file_id = ? WHERE user_id = ?').bind(b.photo_file_id, id));
    }
    stmts.push(auditStmt(ctx, 'إضافة موظف', { entity: 'user', entity_id: id, subject: id, after: { email, full_name, role, permissions: perms, barber_rate: barber, shop_rate: shop, ...p } }));
    await db.batch(stmts);
    return json({ id });
  },

  'GET /api/employees/:id': async (ctx) => {
    needAny(ctx, 'employees.view', 'employees.manage');
    const e = await loadEmployee(ctx, ctx.params.id);
    const db = ctx.env.DB;
    const [rates, scheds, overrides, rt] = await Promise.all([
      db.prepare('SELECT r.*, u.full_name AS by_name FROM employee_rates_history r LEFT JOIN users u ON u.id = r.created_by WHERE r.user_id = ? ORDER BY effective_from DESC, created_at DESC').bind(e.id).all(),
      db.prepare('SELECT * FROM work_schedules WHERE user_id = ? ORDER BY effective_from DESC').bind(e.id).all(),
      db.prepare('SELECT * FROM schedule_overrides WHERE user_id = ? AND work_date >= ? ORDER BY work_date').bind(e.id, ctx.today).all(),
      rateFor(db, e.id, ctx.today),
    ]);
    const ids = scheds.results.map((s) => s.id);
    const days = ids.length ? (await db.prepare(`SELECT * FROM schedule_days WHERE schedule_id IN (${ids.map(() => '?').join(',')}) ORDER BY weekday`).bind(...ids).all()).results : [];
    for (const s of scheds.results) s.days = days.filter((d) => d.schedule_id === s.id);
    e.barber_rate = rt?.barber_rate ?? e.barber_rate; e.shop_rate = rt?.shop_rate ?? e.shop_rate;
    return json({ employee: e, rates: rates.results, schedules: scheds.results, overrides: overrides.results });
  },

  'PUT /api/employees/:id': async (ctx) => {
    const before = await loadEmployee(ctx, ctx.params.id);
    assertCanManage(ctx, before);
    const b = await readJson(ctx.req);
    const db = ctx.env.DB;
    const stmts = [];
    const u = {};
    if ('full_name' in b) u.full_name = reqStr(b.full_name, 'الاسم الكامل', 80);
    if ('email' in b) {
      const email = reqStr(b.email, 'البريد الإلكتروني', 200).toLowerCase();
      if (!emailRe.test(email)) throw bad('البريد الإلكتروني غير صحيح');
      if (await db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').bind(email, before.id).first()) throw new HttpError(409, 'هذا البريد مستخدم لحساب آخر');
      u.email = email;
    }
    if ('role' in b || 'permissions' in b) {
      if (!isAdmin(ctx)) throw forbidden('فقط المدير يستطيع تغيير الأدوار والصلاحيات');
      const role = oneOf(b.role ?? before.role, ['admin', 'supervisor', 'barber'], before.role);
      if (before.id === ctx.user.id && role !== 'admin') throw bad('لا يمكنك إزالة صلاحية المدير عن حسابك');
      u.role = role;
      u.permissions = JSON.stringify(role === 'supervisor' ? (Array.isArray(b.permissions) ? b.permissions.filter((p) => p in PERMISSIONS) : before.permissions) : []);
    }
    if (Object.keys(u).length) {
      u.updated_at = nowISO();
      stmts.push(db.prepare(`UPDATE users SET ${Object.keys(u).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(u), before.id));
    }
    const p = profileFields(b, ctx.settings);
    if ('photo_file_id' in b) {
      if (b.photo_file_id) { await claimFile(ctx, b.photo_file_id, { kind: 'avatar', ownerUserId: null }); stmts.push(db.prepare('UPDATE files SET owner_user_id = ?, attached = 1 WHERE id = ?').bind(before.id, b.photo_file_id)); }
      p.photo_file_id = b.photo_file_id || null;
    }
    if (Object.keys(p).length) {
      p.updated_at = nowISO();
      stmts.push(db.prepare(`UPDATE employee_profiles SET ${Object.keys(p).map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).bind(...Object.values(p), before.id));
    }
    if (!stmts.length) return json({ ok: true });
    if (u.role && u.role !== before.role) stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(before.id));
    stmts.push(auditStmt(ctx, 'تعديل بيانات موظف', { entity: 'user', entity_id: before.id, subject: before.id, before: pick(before, [...Object.keys(u), ...Object.keys(p)]), after: { ...u, ...p } }));
    await db.batch(stmts);
    return json({ ok: true });
  },

  'POST /api/employees/:id/active': async (ctx) => {
    const e = await loadEmployee(ctx, ctx.params.id);
    assertCanManage(ctx, e);
    const b = await readJson(ctx.req);
    if (e.id === ctx.user.id) throw bad('لا يمكنك تعطيل حسابك');
    const active = b.active ? 1 : 0;
    const db = ctx.env.DB;
    await db.batch([
      db.prepare('UPDATE users SET active = ?, updated_at = ? WHERE id = ?').bind(active, nowISO(), e.id),
      ...(active ? [] : [db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(e.id)]),
      auditStmt(ctx, active ? 'تفعيل حساب' : 'تعطيل حساب', { entity: 'user', entity_id: e.id, subject: e.id, before: { active: e.active }, after: { active } }),
    ]);
    return json({ ok: true });
  },

  'POST /api/employees/:id/reset-password': async (ctx) => {
    const e = await loadEmployee(ctx, ctx.params.id);
    assertCanManage(ctx, e);
    const b = await readJson(ctx.req);
    validatePassword(b.password);
    const db = ctx.env.DB;
    await db.batch([
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?').bind(await hashPassword(b.password), nowISO(), e.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(e.id),
      db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(e.email),
      auditStmt(ctx, 'إعادة تعيين كلمة المرور', { entity: 'user', entity_id: e.id, subject: e.id }),
    ]);
    return json({ ok: true });
  },

  // ---- Revenue split rates (history kept; invoices freeze the rate in force on their date) ----
  'POST /api/employees/:id/rates': async (ctx) => {
    need(ctx, 'rates.manage');
    const e = await loadEmployee(ctx, ctx.params.id);
    const b = await readJson(ctx.req);
    const barber = numOrNull(b.barber_rate), shop = numOrNull(b.shop_rate);
    if (!validRates(barber, shop)) throw bad('مجموع نسبة الحلاق ونسبة المحل يجب أن يساوي 100% تماماً');
    const from = dateOrNull(b.effective_from) || ctx.today;
    if (from < ctx.today) {
      // Rates never rewrite history: back-dated changes are refused once invoices exist after that date.
      const n = (await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM invoices WHERE user_id = ? AND work_date >= ?').bind(e.id, from).first()).n;
      if (n) throw bad('لا يمكن تطبيق نسبة بتاريخ سابق توجد بعده فواتير — اختر تاريخ اليوم أو تاريخاً لاحقاً');
    }
    const prev = await rateFor(ctx.env.DB, e.id, from);
    const db = ctx.env.DB, now = nowISO(), id = newId('rt_');
    const stmts = [
      db.prepare('INSERT INTO employee_rates_history (id, user_id, barber_rate, shop_rate, effective_from, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, e.id, barber, shop, from, str(b.note, 300), ctx.user.id, now),
      auditStmt(ctx, 'تعديل نسبة الحلاق', { entity: 'rate', entity_id: id, subject: e.id, before: prev, after: { barber_rate: barber, shop_rate: shop, effective_from: from } }),
      ...notifyStmts(ctx, [e.id], { type: 'rate', title: 'تحديث نسبتك', body: `نسبتك ${barber}% ونسبة المحل ${shop}% اعتباراً من ${from}`, link: '#/me/dues' }),
    ];
    if (from <= ctx.today) stmts.push(db.prepare('UPDATE employee_profiles SET barber_rate = ?, shop_rate = ?, updated_at = ? WHERE user_id = ?').bind(barber, shop, now, e.id));
    await db.batch(stmts);
    return json({ id });
  },

  // ---- Work schedules ----
  'POST /api/employees/:id/schedules': async (ctx) => {
    need(ctx, 'schedules.manage');
    const e = await loadEmployee(ctx, ctx.params.id);
    const b = await readJson(ctx.req);
    const from = dateOrNull(b.effective_from) || ctx.today;
    const days = parseDays(b.days);
    const grace = Math.max(0, Math.min(240, intOrNull(b.grace_minutes) ?? Number(ctx.settings.default_grace_minutes)));
    const db = ctx.env.DB, now = nowISO();
    const existing = await db.prepare('SELECT id FROM work_schedules WHERE user_id = ? AND effective_from = ?').bind(e.id, from).first();
    const id = existing?.id || newId('ws_');
    const stmts = existing
      ? [db.prepare('UPDATE work_schedules SET name = ?, grace_minutes = ?, updated_at = ? WHERE id = ?').bind(str(b.name, 60), grace, now, id), db.prepare('DELETE FROM schedule_days WHERE schedule_id = ?').bind(id)]
      : [db.prepare('INSERT INTO work_schedules (id, user_id, name, effective_from, grace_minutes, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, e.id, str(b.name, 60), from, grace, ctx.user.id, now, now)];
    for (const d of days) stmts.push(db.prepare('INSERT INTO schedule_days (schedule_id, weekday, is_off, start_time, end_time) VALUES (?,?,?,?,?)').bind(id, d.weekday, d.is_off, d.start_time, d.end_time));
    stmts.push(auditStmt(ctx, existing ? 'تعديل جدول دوام' : 'إضافة جدول دوام', { entity: 'schedule', entity_id: id, subject: e.id, after: { effective_from: from, grace_minutes: grace, days } }));
    stmts.push(...notifyStmts(ctx, [e.id], { type: 'schedule', title: 'تم تحديث جدول دوامك', body: `يسري الجدول الجديد اعتباراً من ${from}`, link: '#/me/attendance' }));
    await db.batch(stmts);
    return json({ id });
  },

  'DELETE /api/schedules/:id': async (ctx) => {
    need(ctx, 'schedules.manage');
    const s = await ctx.env.DB.prepare('SELECT * FROM work_schedules WHERE id = ?').bind(ctx.params.id).first();
    if (!s) throw notFound();
    if (s.effective_from <= ctx.today) throw bad('لا يمكن حذف جدول بدأ تطبيقه — أضف جدولاً جديداً بتاريخ لاحق بدلاً من ذلك');
    const db = ctx.env.DB;
    await db.batch([
      db.prepare('DELETE FROM schedule_days WHERE schedule_id = ?').bind(s.id),
      db.prepare('DELETE FROM work_schedules WHERE id = ?').bind(s.id),
      auditStmt(ctx, 'حذف جدول دوام مستقبلي', { entity: 'schedule', entity_id: s.id, subject: s.user_id, before: s }),
    ]);
    return json({ ok: true });
  },

  'POST /api/employees/:id/overrides': async (ctx) => {
    need(ctx, 'schedules.manage');
    const e = await loadEmployee(ctx, ctx.params.id);
    const b = await readJson(ctx.req);
    const date = dateOrNull(b.work_date); if (!date) throw bad('اختر التاريخ');
    const off = !!b.is_off;
    if (!off && (!isTime(b.start_time) || !isTime(b.end_time) || b.start_time === b.end_time)) throw bad('أدخل وقت البداية والنهاية');
    const db = ctx.env.DB, id = newId('so_');
    await db.batch([
      db.prepare(`INSERT INTO schedule_overrides (id, user_id, work_date, is_off, start_time, end_time, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)
                  ON CONFLICT(user_id, work_date) DO UPDATE SET is_off = excluded.is_off, start_time = excluded.start_time, end_time = excluded.end_time, note = excluded.note, created_by = excluded.created_by, created_at = excluded.created_at`)
        .bind(id, e.id, date, off ? 1 : 0, off ? null : b.start_time, off ? null : b.end_time, str(b.note, 200), ctx.user.id, nowISO()),
      auditStmt(ctx, 'تعديل دوام يوم محدد', { entity: 'schedule_override', entity_id: `${e.id}:${date}`, subject: e.id, after: { date, is_off: off, start_time: b.start_time, end_time: b.end_time } }),
      ...notifyStmts(ctx, [e.id], { type: 'schedule', title: 'تغيير في دوامك', body: off ? `يوم ${date}: راحة` : `يوم ${date}: من ${b.start_time} إلى ${b.end_time}`, link: '#/me/attendance' }),
    ]);
    return json({ ok: true });
  },

  'DELETE /api/overrides/:id': async (ctx) => {
    need(ctx, 'schedules.manage');
    const o = await ctx.env.DB.prepare('SELECT * FROM schedule_overrides WHERE id = ?').bind(ctx.params.id).first();
    if (!o) throw notFound();
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('DELETE FROM schedule_overrides WHERE id = ?').bind(o.id),
      auditStmt(ctx, 'حذف تعديل دوام يوم', { entity: 'schedule_override', entity_id: o.id, subject: o.user_id, before: o }),
    ]);
    return json({ ok: true });
  },
};

function pick(o, keys) { const r = {}; for (const k of keys) if (k in o) r[k] = o[k]; return r; }
