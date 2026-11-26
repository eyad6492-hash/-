import { HttpError, bad, json, newId, notFound, nowISO, readJson, str, dateOrNull } from '../lib/util.js';
import { auditStmt, need, needAny, notifyStmts, managersWith, assertOpen } from '../lib/context.js';
import { shiftContext, attendanceFor, staffList } from '../lib/data.js';
import { haversine, addDays, minutesLabel, parseDate } from '../../public/js/shared.js';

const toISO = (ms) => new Date(ms).toISOString();

async function salonLocations(ctx, profile) {
  const { results } = await ctx.env.DB.prepare('SELECT * FROM location_settings WHERE active = 1').all();
  return profile?.location_id ? results.filter((l) => l.id === profile.location_id) : results;
}

/** Validates a GPS fix against the salon location(s). Returns {ok, reason, distance, location, flags}. */
async function checkPosition(ctx, b, profile) {
  const flags = [];
  const lat = Number(b.lat), lng = Number(b.lng), acc = Number(b.accuracy);
  const base = { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null, accuracy: Number.isFinite(acc) ? acc : null, distance: null, location: null, flags };
  if (b.geo_error) return { ...base, ok: false, reason: `تعذر الحصول على الموقع: ${String(b.geo_error).slice(0, 120)}` };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return { ...base, ok: false, reason: 'إحداثيات غير صالحة' };
  const locs = await salonLocations(ctx, profile);
  if (!locs.length) return { ...base, ok: false, reason: 'لم تحدد الإدارة موقع الصالون بعد' };
  let best = null;
  for (const l of locs) { const d = haversine(lat, lng, l.lat, l.lng); if (!best || d < best.d) best = { d, l }; }
  const radius = Number(profile?.radius_override_m) || best.l.radius_m;
  base.distance = Math.round(best.d); base.location = best.l;
  // ---- anti-spoofing indicators (server side) ----
  const maxAcc = Number(ctx.settings.max_gps_accuracy_m) || 150;
  if (!Number.isFinite(acc)) return { ...base, ok: false, reason: 'دقة الموقع غير معروفة' };
  if (acc > maxAcc) return { ...base, ok: false, reason: `دقة الموقع ضعيفة (${Math.round(acc)} م) — فعّل GPS عالي الدقة وحاول مجدداً` };
  if (acc < 1) flags.push('دقة غير واقعية (أقل من 1م)');
  const clientNow = Number(b.client_now), posTs = Number(b.position_ts);
  if (Number.isFinite(clientNow) && Number.isFinite(posTs)) {
    const age = (clientNow - posTs) / 1000;
    if (age > (Number(ctx.settings.max_location_age_sec) || 120)) return { ...base, ok: false, reason: 'الموقع قديم — أعد المحاولة للحصول على موقع حالي' };
    if (Math.abs(clientNow - ctx.nowMs) > 10 * 60e3) flags.push('ساعة الجهاز غير مضبوطة');
  }
  if (b.is_mock === true) flags.push('الجهاز أبلغ عن موقع وهمي');
  const cf = ctx.req.cf || {};
  if (cf.latitude && cf.longitude) {
    const ipKm = haversine(Number(cf.latitude), Number(cf.longitude), best.l.lat, best.l.lng) / 1000;
    if (ipKm > (Number(ctx.settings.ip_distance_flag_km) || 300)) flags.push(`موقع الشبكة بعيد عن الصالون (~${Math.round(ipKm)} كم${cf.country ? '، ' + cf.country : ''})`);
  }
  // identical coordinates to a previous fix of this user is a classic fake-GPS signature
  const same = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM attendance_attempts WHERE user_id = ? AND lat = ? AND lng = ? AND accuracy = ? AND created_at > ?')
    .bind(ctx.user.id, lat, lng, acc, toISO(ctx.nowMs - 30 * 864e5)).first();
  if (same.n > 0) flags.push('إحداثيات مطابقة تماماً لتسجيل سابق');
  // impossible travel since the last fix
  const last = await ctx.env.DB.prepare('SELECT lat, lng, created_at FROM attendance_attempts WHERE user_id = ? AND lat IS NOT NULL ORDER BY created_at DESC LIMIT 1').bind(ctx.user.id).first();
  if (last) {
    const dt = (ctx.nowMs - Date.parse(last.created_at)) / 1000;
    const dist = haversine(lat, lng, last.lat, last.lng);
    if (dt > 0 && dt < 3600 && dist / dt > 70) flags.push('انتقال غير منطقي بين تسجيلين');
  }
  if (best.d > radius) return { ...base, ok: false, reason: `أنت خارج نطاق الصالون (${Math.round(best.d)} م، المسموح ${radius} م)` };
  return { ...base, ok: true };
}

function attemptStmt(ctx, kind, pos, ok, reason) {
  const cf = ctx.req.cf || {};
  return ctx.env.DB.prepare(
    'INSERT INTO attendance_attempts (id, user_id, kind, ok, reason, lat, lng, accuracy, distance_m, ip, ip_country, ip_city, user_agent, flags, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).bind(newId('aa_'), ctx.user.id, kind, ok ? 1 : 0, reason, pos.lat, pos.lng, pos.accuracy, pos.distance, ctx.ip, cf.country || null, cf.city || null,
    (ctx.req.headers.get('user-agent') || '').slice(0, 200), JSON.stringify(pos.flags || []), toISO(ctx.nowMs));
}

async function reject(ctx, kind, pos, reason, notify = false) {
  const stmts = [attemptStmt(ctx, kind, pos, false, reason)];
  if (notify) {
    const ids = await managersWith(ctx, 'attendance.view');
    stmts.push(...notifyStmts(ctx, ids, { type: 'attempt', title: `محاولة ${kind === 'check_in' ? 'حضور' : 'انصراف'} مرفوضة — ${ctx.user.full_name}`, body: reason, link: '#/attendance?tab=attempts' }));
  }
  await ctx.env.DB.batch(stmts);
  throw new HttpError(422, reason, 'attendance_rejected');
}

async function myProfile(ctx) {
  const p = await ctx.env.DB.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').bind(ctx.user.id).first();
  if (!p || !p.works_shifts) throw new HttpError(403, 'حسابك غير مفعل لتسجيل الحضور');
  if (p.status === 'suspended' || p.status === 'left') throw new HttpError(403, 'حسابك موقوف عن العمل');
  return p;
}

/** Which shift does "now" belong to? Considers yesterday's overnight shift, today's, and an early shift starting before the business-day boundary. */
async function currentShift(ctx) {
  const today = ctx.today, yest = addDays(today, -1), tom = addDays(today, 1);
  const shiftFor = (await shiftContext(ctx, [ctx.user.id], yest, tom))(ctx.user.id);
  const early = (Number(ctx.settings.early_checkin_minutes) || 90) * 60e3;
  for (const date of [yest, today, tom]) {
    const s = shiftFor(date);
    if (s && !s.off && ctx.nowMs >= s.startMs - early && ctx.nowMs <= s.endMs) return { date, shift: s };
  }
  const t = shiftFor(today);
  if (t && !t.off) return ctx.nowMs < t.startMs - early ? { date: today, shift: t, tooEarly: true } : { date: today, shift: t, ended: true };
  return { date: today, shift: null };
}

export function computeTimes(a) {
  const inMs = Date.parse(a.check_in_at), outMs = a.check_out_at ? Date.parse(a.check_out_at) : null;
  const s = a.sched_start ? Date.parse(a.sched_start) : null, e = a.sched_end ? Date.parse(a.sched_end) : null;
  const late = s && inMs > s + (a.grace_minutes || 0) * 60e3 ? Math.floor((inMs - s) / 60e3) : 0;
  const early = e && outMs && outMs < e ? Math.ceil((e - outMs) / 60e3) : 0;
  const worked = outMs ? Math.max(0, Math.round((outMs - inMs) / 60e3)) : null;
  return { late_minutes: late, early_leave_minutes: early, worked_minutes: worked };
}

const localToMs = (ctx, s) => { // "YYYY-MM-DDTHH:MM" in salon local time
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(s || ''))) throw bad('صيغة الوقت غير صحيحة');
  return parseDate(s.slice(0, 10)).getTime() + (Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16))) * 60e3 - ctx.off * 60e3;
};

export const attendanceRoutes = {
  'POST /api/attendance/check-in': async (ctx) => {
    const profile = await myProfile(ctx);
    const b = await readJson(ctx.req);
    const pos = await checkPosition(ctx, b, profile);
    if (!pos.ok) await reject(ctx, 'check_in', pos, pos.reason, pos.distance !== null);
    const cur = await currentShift(ctx);
    if (cur.tooEarly) await reject(ctx, 'check_in', pos, `مبكر جداً — يبدأ دوامك الساعة ${cur.shift.start}`);
    if (cur.ended) await reject(ctx, 'check_in', pos, `انتهى وقت دوامك لهذا اليوم (${cur.shift.start} – ${cur.shift.end})`);
    const dup = await ctx.env.DB.prepare('SELECT check_out_at FROM attendance WHERE user_id = ? AND work_date = ?').bind(ctx.user.id, cur.date).first();
    if (dup) await reject(ctx, 'check_in', pos, dup.check_out_at ? 'سجلت حضورك وانصرافك لهذا اليوم مسبقاً' : 'سجلت حضورك مسبقاً — سجّل الانصراف عند نهاية الدوام');
    const sh = cur.shift;
    const row = {
      id: newId('at_'), user_id: ctx.user.id, work_date: cur.date,
      sched_start: sh ? toISO(sh.startMs) : null, sched_end: sh ? toISO(sh.endMs) : null, grace_minutes: sh ? sh.grace : 0,
      check_in_at: toISO(ctx.nowMs), in_lat: pos.lat, in_lng: pos.lng, in_accuracy: pos.accuracy, in_distance_m: pos.distance, in_location_id: pos.location.id,
      flags: JSON.stringify(pos.flags), created_at: nowISO(), updated_at: nowISO(),
    };
    const t = computeTimes(row);
    row.late_minutes = t.late_minutes;
    const keys = Object.keys(row);
    const managers = await managersWith(ctx, 'attendance.view');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT INTO attendance (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((k) => row[k])),
      attemptStmt(ctx, 'check_in', pos, true, null),
      auditStmt(ctx, 'تسجيل حضور', { entity: 'attendance', entity_id: row.id, subject: ctx.user.id, after: { work_date: row.work_date, check_in_at: row.check_in_at, distance_m: pos.distance, late_minutes: row.late_minutes, flags: pos.flags } }),
      ...notifyStmts(ctx, managers, {
        type: row.late_minutes ? 'late' : 'check_in',
        title: `${ctx.user.full_name} سجّل حضوره${row.late_minutes ? ` — متأخر ${minutesLabel(row.late_minutes)}` : ''}`,
        body: `${pos.distance} م من الصالون${pos.flags.length ? ' • تنبيه: ' + pos.flags.join('، ') : ''}`, link: '#/attendance',
      }),
    ]);
    return json({ attendance: row, unscheduled: !sh });
  },

  'POST /api/attendance/check-out': async (ctx) => {
    const profile = await myProfile(ctx);
    const b = await readJson(ctx.req);
    const pos = await checkPosition(ctx, b, profile);
    if (!pos.ok) await reject(ctx, 'check_out', pos, pos.reason, pos.distance !== null);
    const open = await ctx.env.DB.prepare('SELECT * FROM attendance WHERE user_id = ? AND check_out_at IS NULL AND work_date >= ? ORDER BY work_date DESC LIMIT 1')
      .bind(ctx.user.id, addDays(ctx.today, -1)).first();
    if (!open) await reject(ctx, 'check_out', pos, 'لا يوجد تسجيل حضور مفتوح — لا يمكن الانصراف بدون حضور');
    const limit = (open.sched_end ? Date.parse(open.sched_end) : Date.parse(open.check_in_at) + 12 * 3600e3) + (Number(ctx.settings.late_checkout_hours) || 6) * 3600e3;
    const flags = [...JSON.parse(open.flags || '[]'), ...pos.flags.map((f) => 'انصراف: ' + f)];
    if (ctx.nowMs > limit) flags.push('انصراف متأخر جداً عن نهاية الدوام');
    const upd = { ...open, check_out_at: toISO(ctx.nowMs) };
    const t = computeTimes(upd);
    const managers = await managersWith(ctx, 'attendance.view');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE attendance SET check_out_at = ?, out_lat = ?, out_lng = ?, out_accuracy = ?, out_distance_m = ?, early_leave_minutes = ?, worked_minutes = ?, flags = ?, updated_at = ? WHERE id = ? AND check_out_at IS NULL')
        .bind(upd.check_out_at, pos.lat, pos.lng, pos.accuracy, pos.distance, t.early_leave_minutes, t.worked_minutes, JSON.stringify(flags), nowISO(), open.id),
      attemptStmt(ctx, 'check_out', pos, true, null),
      auditStmt(ctx, 'تسجيل انصراف', { entity: 'attendance', entity_id: open.id, subject: ctx.user.id, after: { check_out_at: upd.check_out_at, ...t, distance_m: pos.distance } }),
      ...notifyStmts(ctx, managers, {
        type: 'check_out', title: `${ctx.user.full_name} سجّل انصرافه${t.early_leave_minutes ? ` — خروج مبكر ${minutesLabel(t.early_leave_minutes)}` : ''}`,
        body: `ساعات العمل: ${minutesLabel(t.worked_minutes)}`, link: '#/attendance',
      }),
    ]);
    return json({ attendance: { ...upd, ...t } });
  },

  // Board for one business date: every shift employee with planned shift + status
  'GET /api/attendance/board': async (ctx) => {
    needAny(ctx, 'attendance.view', 'dashboard.view');
    const date = dateOrNull(ctx.url.searchParams.get('date')) || ctx.today;
    const staff = await staffList(ctx);
    const att = await attendanceFor(ctx, staff.map((s) => s.id), date, date);
    return json({ date, items: staff.map((s) => ({ user: s, ...att[s.id].rows[0] })) });
  },

  'GET /api/attendance': async (ctx) => {
    need(ctx, 'attendance.view');
    const q = ctx.url.searchParams;
    const from = dateOrNull(q.get('from')) || addDays(ctx.today, -6), to = dateOrNull(q.get('to')) || ctx.today;
    const where = ['a.work_date BETWEEN ? AND ?'], args = [from, to];
    if (q.get('user_id')) { where.push('a.user_id = ?'); args.push(q.get('user_id')); }
    const { results } = await ctx.env.DB.prepare(`SELECT a.*, u.full_name FROM attendance a JOIN users u ON u.id = a.user_id WHERE ${where.join(' AND ')} ORDER BY a.work_date DESC, a.check_in_at DESC LIMIT 1000`).bind(...args).all();
    return json({ items: results, from, to });
  },

  'GET /api/attendance/attempts': async (ctx) => {
    need(ctx, 'attendance.view');
    const q = ctx.url.searchParams;
    const where = ['1=1'], args = [];
    if (q.get('user_id')) { where.push('t.user_id = ?'); args.push(q.get('user_id')); }
    if (q.get('only_rejected') !== '0') where.push('t.ok = 0');
    if (q.get('from')) { where.push('t.created_at >= ?'); args.push(new Date(parseDate(q.get('from')).getTime() - ctx.off * 60e3).toISOString()); }
    const { results } = await ctx.env.DB.prepare(`SELECT t.*, u.full_name FROM attendance_attempts t JOIN users u ON u.id = t.user_id WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC LIMIT 300`).bind(...args).all();
    return json({ items: results });
  },

  // Manual correction (forgotten check-out, wrong time...). Fully audited, reason required.
  'PUT /api/attendance/:id': async (ctx) => {
    need(ctx, 'attendance.manage');
    const a = await ctx.env.DB.prepare('SELECT * FROM attendance WHERE id = ?').bind(ctx.params.id).first();
    if (!a) throw notFound();
    const b = await readJson(ctx.req);
    const reason = str(b.reason, 300); if (!reason) throw bad('اكتب سبب التعديل');
    const upd = { ...a };
    if (b.check_in_local) upd.check_in_at = toISO(localToMs(ctx, b.check_in_local));
    if ('check_out_local' in b) upd.check_out_at = b.check_out_local ? toISO(localToMs(ctx, b.check_out_local)) : null;
    if (upd.check_out_at && upd.check_out_at <= upd.check_in_at) throw bad('وقت الانصراف يجب أن يكون بعد الحضور');
    const t = computeTimes(upd);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE attendance SET check_in_at = ?, check_out_at = ?, late_minutes = ?, early_leave_minutes = ?, worked_minutes = ?, note = ?, source = ?, updated_at = ? WHERE id = ?')
        .bind(upd.check_in_at, upd.check_out_at, t.late_minutes, t.early_leave_minutes, t.worked_minutes, reason, 'manual', nowISO(), a.id),
      auditStmt(ctx, 'تعديل حضور يدوي', { entity: 'attendance', entity_id: a.id, subject: a.user_id, before: a, after: { check_in_at: upd.check_in_at, check_out_at: upd.check_out_at, ...t }, reason }),
    ]);
    return json({ ok: true });
  },

  'POST /api/attendance/manual': async (ctx) => {
    need(ctx, 'attendance.manage');
    const b = await readJson(ctx.req);
    const userId = String(b.user_id || ''), date = dateOrNull(b.work_date);
    const reason = str(b.reason, 300); if (!reason) throw bad('اكتب سبب الإضافة اليدوية');
    if (!date || !userId) throw bad('اختر الموظف والتاريخ');
    if (await ctx.env.DB.prepare('SELECT 1 FROM attendance WHERE user_id = ? AND work_date = ?').bind(userId, date).first()) throw bad('يوجد تسجيل حضور لهذا اليوم — عدّله بدلاً من إضافة جديد');
    const sh = (await shiftContext(ctx, [userId], date, date))(userId)(date);
    const row = {
      id: newId('at_'), user_id: userId, work_date: date,
      sched_start: sh && !sh.off ? toISO(sh.startMs) : null, sched_end: sh && !sh.off ? toISO(sh.endMs) : null, grace_minutes: sh && !sh.off ? sh.grace : 0,
      check_in_at: toISO(localToMs(ctx, b.check_in_local)), check_out_at: b.check_out_local ? toISO(localToMs(ctx, b.check_out_local)) : null,
      source: 'manual', note: reason, flags: '[]', created_at: nowISO(), updated_at: nowISO(),
    };
    if (row.check_out_at && row.check_out_at <= row.check_in_at) throw bad('وقت الانصراف يجب أن يكون بعد الحضور');
    Object.assign(row, computeTimes(row));
    const keys = Object.keys(row);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT INTO attendance (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((k) => row[k])),
      auditStmt(ctx, 'إضافة حضور يدوي', { entity: 'attendance', entity_id: row.id, subject: userId, after: row, reason }),
    ]);
    return json({ id: row.id });
  },

  // ---- self service ----
  'GET /api/me/attendance': async (ctx) => {
    const q = ctx.url.searchParams;
    const from = dateOrNull(q.get('from')) || addDays(ctx.today, -29), to = dateOrNull(q.get('to')) || ctx.today;
    const r = (await attendanceFor(ctx, [ctx.user.id], from, to))[ctx.user.id];
    return json({ from, to, rows: r.rows.reverse(), summary: r.summary });
  },
};
