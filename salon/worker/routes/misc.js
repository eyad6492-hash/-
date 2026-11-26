import { HttpError, bad, forbidden, json, newId, notFound, nowISO, readJson, reqStr, str, numOrNull, intOrNull, dateOrNull, oneOf } from '../lib/util.js';
import { auditStmt, need, needAny, notifyStmts, managersWith, SETTINGS_DEFAULTS, createContext } from '../lib/context.js';
import { attendanceFor, invoiceTotals, paymentTotals, duesFor, staffList, countedClause } from '../lib/data.js';
import { round2, diffDays, minutesLabel, eachDay } from '../../public/js/shared.js';

// ======================= Leaves =======================
const leaveRoutes = {
  'POST /api/me/leaves': async (ctx) => {
    const b = await readJson(ctx.req);
    const start = dateOrNull(b.start_date), end = dateOrNull(b.end_date);
    if (!start || !end) throw bad('حدد بداية ونهاية الإجازة');
    if (end < start) throw bad('تاريخ النهاية قبل البداية');
    if (diffDays(start, end) > 90) throw bad('أقصى مدة للطلب 90 يوماً');
    const overlap = await ctx.env.DB.prepare("SELECT 1 FROM leave_requests WHERE user_id = ? AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ?").bind(ctx.user.id, end, start).first();
    if (overlap) throw bad('يوجد طلب إجازة آخر في نفس الفترة');
    const id = newId('lv_');
    const ids = await managersWith(ctx, 'leaves.manage');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('INSERT INTO leave_requests (id, user_id, start_date, end_date, reason, status, created_at) VALUES (?,?,?,?,?,?,?)').bind(id, ctx.user.id, start, end, str(b.reason, 500), 'pending', nowISO()),
      auditStmt(ctx, 'طلب إجازة', { entity: 'leave', entity_id: id, subject: ctx.user.id, after: { start, end, reason: b.reason } }),
      ...notifyStmts(ctx, ids, { type: 'leave', title: `طلب إجازة — ${ctx.user.full_name}`, body: `${start} → ${end}`, link: '#/leaves' }),
    ]);
    return json({ id });
  },
  'GET /api/me/leaves': async (ctx) => {
    const { results } = await ctx.env.DB.prepare('SELECT l.*, d.full_name AS decided_by_name FROM leave_requests l LEFT JOIN users d ON d.id = l.decided_by WHERE l.user_id = ? ORDER BY l.created_at DESC').bind(ctx.user.id).all();
    return json({ items: results });
  },
  'POST /api/me/leaves/:id/cancel': async (ctx) => {
    const l = await ctx.env.DB.prepare('SELECT * FROM leave_requests WHERE id = ? AND user_id = ?').bind(ctx.params.id, ctx.user.id).first();
    if (!l) throw notFound();
    if (l.status !== 'pending') throw bad('لا يمكن إلغاء طلب تم البت فيه');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?").bind(l.id),
      auditStmt(ctx, 'إلغاء طلب إجازة', { entity: 'leave', entity_id: l.id, subject: l.user_id }),
    ]);
    return json({ ok: true });
  },
  'GET /api/leaves': async (ctx) => {
    need(ctx, 'leaves.manage');
    const s = ctx.url.searchParams.get('status');
    const { results } = await ctx.env.DB.prepare(
      `SELECT l.*, u.full_name, d.full_name AS decided_by_name FROM leave_requests l JOIN users u ON u.id = l.user_id LEFT JOIN users d ON d.id = l.decided_by
        ${s ? 'WHERE l.status = ?' : ''} ORDER BY CASE l.status WHEN 'pending' THEN 0 ELSE 1 END, l.start_date DESC LIMIT 300`,
    ).bind(...(s ? [s] : [])).all();
    return json({ items: results });
  },
  'POST /api/leaves/:id/decide': async (ctx) => {
    need(ctx, 'leaves.manage');
    const l = await ctx.env.DB.prepare('SELECT * FROM leave_requests WHERE id = ?').bind(ctx.params.id).first();
    if (!l) throw notFound();
    const b = await readJson(ctx.req);
    const status = oneOf(b.status, ['approved', 'rejected'], null);
    if (!status) throw bad('اختر القرار');
    if (l.status === 'cancelled') throw bad('الطلب ملغى من الموظف');
    const note = str(b.note, 500);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE leave_requests SET status = ?, decision_note = ?, decided_by = ?, decided_at = ? WHERE id = ?').bind(status, note, ctx.user.id, nowISO(), l.id),
      auditStmt(ctx, status === 'approved' ? 'اعتماد إجازة' : 'رفض إجازة', { entity: 'leave', entity_id: l.id, subject: l.user_id, before: { status: l.status }, after: { status, note } }),
      ...notifyStmts(ctx, [l.user_id], { type: 'leave', title: status === 'approved' ? 'تم اعتماد إجازتك ✓' : 'تم رفض طلب الإجازة', body: `${l.start_date} → ${l.end_date}${note ? ' — ' + note : ''}`, link: '#/me/leaves' }),
    ]);
    return json({ ok: true });
  },
};

// ======================= Notifications =======================
const notificationRoutes = {
  'GET /api/notifications': async (ctx) => {
    const { results } = await ctx.env.DB.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(ctx.user.id).all();
    const unread = (await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(ctx.user.id).first()).n;
    return json({ items: results, unread });
  },
  'GET /api/notifications/unread': async (ctx) => {
    const r = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(ctx.user.id).first();
    return json({ unread: r.n });
  },
  'POST /api/notifications/read': async (ctx) => {
    const b = await readJson(ctx.req);
    if (b.id) await ctx.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL').bind(nowISO(), String(b.id), ctx.user.id).run();
    else await ctx.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(nowISO(), ctx.user.id).run();
    return json({ ok: true });
  },
};

// ======================= Audit =======================
const auditRoutes = {
  'GET /api/audit': async (ctx) => {
    need(ctx, 'audit.view');
    const q = ctx.url.searchParams;
    const where = ['1=1'], args = [];
    if (q.get('entity')) { where.push('entity = ?'); args.push(q.get('entity')); }
    if (q.get('subject')) { where.push('(subject_user_id = ? OR user_id = ?)'); args.push(q.get('subject'), q.get('subject')); }
    if (dateOrNull(q.get('from'))) { where.push('created_at >= ?'); args.push(q.get('from')); }
    if (dateOrNull(q.get('to'))) { where.push('created_at < date(?, \'+1 day\')'); args.push(q.get('to')); }
    if (q.get('q')) { where.push('(action LIKE ? OR user_name LIKE ?)'); args.push(`%${q.get('q')}%`, `%${q.get('q')}%`); }
    const before = q.get('before');
    if (before) { where.push('created_at < ?'); args.push(before); }
    const { results } = await ctx.env.DB.prepare(`SELECT * FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`).bind(...args).all();
    return json({ items: results });
  },
};

// ======================= Financial closures =======================
async function daySummary(ctx, date) {
  const staff = await staffList(ctx, { includeInactive: true });
  const [inv, att] = await Promise.all([invoiceTotals(ctx, { from: date, to: date }), attendanceFor(ctx, staff.map((s) => s.id), date, date)]);
  const pending = (await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM invoices WHERE work_date = ? AND (status IN ('registered','under_review','needs_edit') OR edit_request IS NOT NULL)").bind(date).first()).n;
  const rows = staff.filter((s) => inv[s.id] || att[s.id].rows[0].check_in_at).map((s) => ({
    user_id: s.id, name: s.full_name, ...(inv[s.id] || { count: 0, sales: 0, barber_due: 0, shop_share: 0 }),
    check_in_at: att[s.id].rows[0].check_in_at, check_out_at: att[s.id].rows[0].check_out_at, status: att[s.id].rows[0].status,
  }));
  const sum = (k) => round2(rows.reduce((n, r) => n + (r[k] || 0), 0));
  return { date, rows, totals: { count: sum('count'), sales: sum('sales'), barber_due: sum('barber_due'), shop_share: sum('shop_share') }, pending_invoices: pending, count_mode: ctx.settings.invoice_count_mode };
}

async function periodStatement(ctx, userId, from, to) {
  const u = await ctx.env.DB.prepare('SELECT id, full_name FROM users WHERE id = ?').bind(userId).first();
  if (!u) throw bad('اختر الموظف');
  const c = countedClause(ctx);
  const [dues, before, att, invs, pays] = await Promise.all([
    duesFor(ctx, userId, from, to),
    Promise.all([invoiceTotals(ctx, { userId, to: eachDayBefore(from) }), paymentTotals(ctx, { userId, to: eachDayBefore(from) })]),
    attendanceFor(ctx, [userId], from, to),
    ctx.env.DB.prepare(`SELECT number, work_date, amount, barber_share, shop_share, status FROM invoices WHERE user_id = ? AND work_date BETWEEN ? AND ? AND ${c.sql} ORDER BY created_at`).bind(userId, from, to, ...c.args).all(),
    ctx.env.DB.prepare('SELECT paid_on, amount, method, reference FROM employee_payments WHERE user_id = ? AND voided = 0 AND paid_on BETWEEN ? AND ? ORDER BY paid_on').bind(userId, from, to).all(),
  ]);
  const opening = round2((before[0][userId]?.barber_due || 0) - (before[1][userId]?.paid || 0));
  return {
    user_id: userId, name: u.full_name, from, to, opening_balance: opening, period: dues.period,
    closing_balance: round2(opening + dues.period.barber_due - dues.period.paid),
    attendance: att[userId].summary, invoices: invs.results, payments: pays.results,
  };
}
function eachDayBefore(d) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); }

const closureRoutes = {
  'GET /api/closures': async (ctx) => {
    needAny(ctx, 'closures.manage', 'closures.override');
    const { results } = await ctx.env.DB.prepare(
      `SELECT f.id, f.kind, f.user_id, f.date_from, f.date_to, f.status, f.note, f.closed_at, f.reopened_at, f.reopen_reason, u.full_name, c.full_name AS closed_by_name, r.full_name AS reopened_by_name
         FROM financial_closures f LEFT JOIN users u ON u.id = f.user_id LEFT JOIN users c ON c.id = f.closed_by LEFT JOIN users r ON r.id = f.reopened_by
        ORDER BY f.closed_at DESC LIMIT 200`,
    ).all();
    return json({ items: results });
  },
  'GET /api/closures/preview': async (ctx) => {
    need(ctx, 'closures.manage');
    const q = ctx.url.searchParams;
    if (q.get('kind') === 'day') return json({ summary: await daySummary(ctx, dateOrNull(q.get('date')) || ctx.today) });
    const from = dateOrNull(q.get('from')), to = dateOrNull(q.get('to'));
    if (!from || !to || to < from) throw bad('حدد الفترة');
    return json({ summary: await periodStatement(ctx, String(q.get('user_id') || ''), from, to) });
  },
  'GET /api/closures/:id': async (ctx) => {
    needAny(ctx, 'closures.manage', 'closures.override');
    const c = await ctx.env.DB.prepare('SELECT f.*, u.full_name FROM financial_closures f LEFT JOIN users u ON u.id = f.user_id WHERE f.id = ?').bind(ctx.params.id).first();
    if (!c) throw notFound();
    c.summary = JSON.parse(c.summary_json); delete c.summary_json;
    return json({ closure: c });
  },
  'POST /api/closures': async (ctx) => {
    need(ctx, 'closures.manage');
    const b = await readJson(ctx.req);
    const kind = oneOf(b.kind, ['day', 'period'], null);
    if (!kind) throw bad('نوع الإغلاق غير صحيح');
    let from, to, userId = null, summary;
    if (kind === 'day') {
      from = to = dateOrNull(b.date) || ctx.today;
      if (from > ctx.today) throw bad('لا يمكن إغلاق يوم مستقبلي');
      summary = await daySummary(ctx, from);
      if (summary.pending_invoices && !b.force) throw new HttpError(409, `يوجد ${summary.pending_invoices} فاتورة بانتظار المراجعة في هذا اليوم. راجعها أو أكّد الإغلاق.`, 'pending_invoices');
    } else {
      from = dateOrNull(b.from); to = dateOrNull(b.to); userId = String(b.user_id || '');
      if (!from || !to || to < from) throw bad('حدد الفترة');
      if (to > ctx.today) throw bad('لا يمكن إغلاق فترة تنتهي في المستقبل');
      summary = await periodStatement(ctx, userId, from, to);
    }
    const dup = await ctx.env.DB.prepare("SELECT 1 FROM financial_closures WHERE status = 'closed' AND kind = ? AND COALESCE(user_id,'') = ? AND date_from <= ? AND date_to >= ?").bind(kind, userId || '', to, from).first();
    if (dup) throw bad('هذه الفترة (أو جزء منها) مغلقة مسبقاً');
    const id = newId('fc_');
    const ids = userId ? [userId] : [];
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('INSERT INTO financial_closures (id, kind, user_id, date_from, date_to, summary_json, status, note, closed_by, closed_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(id, kind, userId, from, to, JSON.stringify(summary), 'closed', str(b.note, 500), ctx.user.id, nowISO()),
      auditStmt(ctx, kind === 'day' ? 'إغلاق يوم مالي' : 'إغلاق فترة موظف', { entity: 'closure', entity_id: id, subject: userId, after: { from, to, totals: summary.totals || summary.period } }),
      ...notifyStmts(ctx, ids, { type: 'closure', title: 'تم إغلاق فترة مستحقاتك', body: `${from} → ${to}`, link: '#/me/dues' }),
    ]);
    return json({ id });
  },
  'POST /api/closures/:id/reopen': async (ctx) => {
    need(ctx, 'closures.override');
    const c = await ctx.env.DB.prepare('SELECT * FROM financial_closures WHERE id = ?').bind(ctx.params.id).first();
    if (!c) throw notFound();
    if (c.status !== 'closed') throw bad('الإغلاق غير فعّال');
    const b = await readJson(ctx.req);
    const reason = str(b.reason, 300); if (!reason || reason.length < 3) throw bad('اكتب سبب إعادة الفتح');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare("UPDATE financial_closures SET status = 'reopened', reopened_by = ?, reopened_at = ?, reopen_reason = ? WHERE id = ?").bind(ctx.user.id, nowISO(), reason, c.id),
      auditStmt(ctx, 'إعادة فتح فترة مغلقة', { entity: 'closure', entity_id: c.id, subject: c.user_id, before: { status: 'closed' }, after: { status: 'reopened' }, reason }),
    ]);
    return json({ ok: true });
  },
};

// ======================= Settings & locations =======================
const EDITABLE = {
  salon_name: (v) => reqStr(v, 'اسم الصالون', 80), salon_name_ar: (v) => reqStr(v, 'الاسم العربي', 80),
  salon_phone: (v) => str(v, 30) || '', salon_address: (v) => str(v, 200) || '', salon_tax_no: (v) => str(v, 40) || '',
  invoice_count_mode: (v) => oneOf(v, ['on_create', 'on_approve'], 'on_create'),
  invoice_initial_status: (v) => oneOf(v, ['registered', 'under_review'], 'registered'),
  default_grace_minutes: (v) => clampInt(v, 0, 240), default_barber_rate: (v) => clampInt(v, 0, 100),
  early_checkin_minutes: (v) => clampInt(v, 0, 360), max_gps_accuracy_m: (v) => clampInt(v, 10, 1000),
  max_location_age_sec: (v) => clampInt(v, 10, 900), ip_distance_flag_km: (v) => clampInt(v, 10, 5000),
  late_checkout_hours: (v) => clampInt(v, 1, 24), day_start_hour: (v) => clampInt(v, 0, 10),
  session_hours: (v) => clampInt(v, 1, 72), remember_days: (v) => clampInt(v, 1, 90),
  report_footer: (v) => str(v, 200) || '',
};
function clampInt(v, a, b) { const n = intOrNull(v); if (n === null || n < a || n > b) throw bad(`قيمة خارج النطاق المسموح (${a}–${b})`); return n; }

const settingsRoutes = {
  'GET /api/settings': async (ctx) => {
    const pub = { salon_name: ctx.settings.salon_name, salon_name_ar: ctx.settings.salon_name_ar, currency_symbol: ctx.settings.currency_symbol, invoice_count_mode: ctx.settings.invoice_count_mode, tz_offset_minutes: ctx.settings.tz_offset_minutes, day_start_hour: ctx.settings.day_start_hour };
    if (!ctx.perms.has('settings.manage')) return json({ settings: pub });
    const { results } = await ctx.env.DB.prepare('SELECT * FROM location_settings ORDER BY created_at').all();
    return json({ settings: ctx.settings, locations: results, storage: ctx.env.FILES ? 'r2' : 'd1' });
  },
  'PUT /api/settings': async (ctx) => {
    need(ctx, 'settings.manage');
    const b = await readJson(ctx.req);
    const changes = {};
    for (const [k, fn] of Object.entries(EDITABLE)) if (k in b) changes[k] = fn(b[k]);
    if (!Object.keys(changes).length) return json({ ok: true });
    const before = Object.fromEntries(Object.keys(changes).map((k) => [k, ctx.settings[k]]));
    await ctx.env.DB.batch([
      ...Object.entries(changes).map(([k, v]) => ctx.env.DB.prepare('INSERT INTO salon_settings (key, value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by').bind(k, JSON.stringify(v), nowISO(), ctx.user.id)),
      auditStmt(ctx, 'تعديل الإعدادات', { entity: 'settings', before, after: changes }),
    ]);
    return json({ ok: true });
  },
  'POST /api/locations': async (ctx) => {
    need(ctx, 'settings.manage');
    const b = await readJson(ctx.req);
    const loc = parseLoc(b);
    const id = newId('loc_');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('INSERT INTO location_settings (id, name, lat, lng, radius_m, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, loc.name, loc.lat, loc.lng, loc.radius_m, 1, nowISO(), nowISO()),
      auditStmt(ctx, 'إضافة موقع الصالون', { entity: 'location', entity_id: id, after: loc }),
    ]);
    return json({ id });
  },
  'PUT /api/locations/:id': async (ctx) => {
    need(ctx, 'settings.manage');
    const l = await ctx.env.DB.prepare('SELECT * FROM location_settings WHERE id = ?').bind(ctx.params.id).first();
    if (!l) throw notFound();
    const b = await readJson(ctx.req);
    const loc = parseLoc({ ...l, ...b });
    const active = 'active' in b ? (b.active ? 1 : 0) : l.active;
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE location_settings SET name = ?, lat = ?, lng = ?, radius_m = ?, active = ?, updated_at = ? WHERE id = ?').bind(loc.name, loc.lat, loc.lng, loc.radius_m, active, nowISO(), l.id),
      auditStmt(ctx, 'تعديل موقع/نطاق الصالون', { entity: 'location', entity_id: l.id, before: l, after: { ...loc, active } }),
    ]);
    return json({ ok: true });
  },
};
function parseLoc(b) {
  const lat = numOrNull(b.lat), lng = numOrNull(b.lng), radius = intOrNull(b.radius_m);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw bad('إحداثيات غير صحيحة');
  if (radius === null || radius < 10 || radius > 5000) throw bad('نطاق السماح يجب أن يكون بين 10 و 5000 متر');
  return { name: reqStr(b.name, 'اسم الموقع', 80), lat, lng, radius_m: radius };
}

export const miscRoutes = { ...leaveRoutes, ...notificationRoutes, ...auditRoutes, ...closureRoutes, ...settingsRoutes };

// ======================= Cron: lateness / absence alerts =======================
export async function runScheduled(env, nowMs = Date.now()) {
  const ctx = await createContext(new Request('https://cron.local/'), env, nowMs);
  ctx.user = null;
  const staff = await staffList(ctx);
  if (!staff.length) return 0;
  const att = await attendanceFor(ctx, staff.map((s) => s.id), ctx.today, ctx.today);
  // also yesterday (overnight shifts that ended after midnight)
  const y = eachDayBefore(ctx.today);
  const attY = await attendanceFor(ctx, staff.map((s) => s.id), y, y);
  const managers = await managersWith(ctx, 'attendance.view');
  let sent = 0;
  for (const s of staff) {
    for (const [r, date] of [[att[s.id].rows[0], ctx.today], [attY[s.id].rows[0], y]]) {
      let key = null, title = null;
      if (r.status === 'waiting') { key = `late:${s.id}:${date}`; title = `${s.full_name} لم يسجل حضوره بعد (دوامه ${r.shift})`; }
      if (r.status === 'absent') { key = `absent:${s.id}:${date}`; title = `غياب: ${s.full_name} لم يحضر دوام ${date}`; }
      if (!key) continue;
      const ins = await env.DB.prepare('INSERT OR IGNORE INTO notification_keys (key, created_at) VALUES (?,?)').bind(key, nowISO()).run();
      if (!ins.meta.changes) continue;
      const st = notifyStmts(ctx, managers, { type: r.status === 'absent' ? 'absent' : 'late', title, link: '#/attendance' });
      if (r.status === 'absent') st.push(...notifyStmts(ctx, [s.id], { type: 'absent', title: `تم تسجيل غياب بتاريخ ${date}`, body: 'إذا كان هناك خطأ تواصل مع الإدارة', link: '#/me/attendance' }));
      if (st.length) await env.DB.batch(st);
      sent++;
    }
  }
  await env.DB.prepare('DELETE FROM notification_keys WHERE created_at < ?').bind(new Date(nowMs - 10 * 864e5).toISOString()).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowISO()).run();
  return sent;
}
