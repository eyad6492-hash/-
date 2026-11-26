import { bad, forbidden, json, newId, notFound, nowISO, readJson, dateOrNull, oneOf } from '../lib/util.js';
import { auditStmt, need, needAny, notifyStmts } from '../lib/context.js';
import { attendanceFor, invoiceTotals, paymentTotals, staffList, duesFor, countedClause } from '../lib/data.js';
import { rateFor } from './employees.js';
import { addDays, diffDays, eachDay, periodRange, round2, countedStatuses } from '../../public/js/shared.js';

function rangeFrom(ctx, defType = 'month') {
  const q = ctx.url.searchParams;
  let from = dateOrNull(q.get('from')), to = dateOrNull(q.get('to'));
  if (!from || !to) ({ from, to } = periodRange(q.get('period') || defType, ctx.today));
  if (to < from) throw bad('تاريخ النهاية قبل تاريخ البداية');
  if (diffDays(from, to) > 366) throw bad('أقصى فترة للتقرير سنة واحدة');
  return { from, to };
}

async function dailySeries(ctx, from, to, userId = null) {
  const c = countedClause(ctx);
  const args = [...c.args, from, to];
  let extra = '';
  if (userId) { extra = ' AND user_id = ?'; args.push(userId); }
  const { results } = await ctx.env.DB.prepare(
    `SELECT work_date, COUNT(*) AS count, SUM(amount) AS sales, SUM(barber_share) AS barber, SUM(shop_share) AS shop FROM invoices WHERE ${c.sql} AND work_date BETWEEN ? AND ?${extra} GROUP BY work_date`,
  ).bind(...args).all();
  const by = Object.fromEntries(results.map((r) => [r.work_date, r]));
  return eachDay(from, to).map((d) => ({ date: d, count: by[d]?.count || 0, sales: round2(by[d]?.sales || 0), barber: round2(by[d]?.barber || 0), shop: round2(by[d]?.shop || 0) }));
}

const sumObj = (o, k) => round2(Object.values(o).reduce((n, x) => n + (x[k] || 0), 0));

/** Frozen data set for an employee PDF report. */
export async function employeeReportData(ctx, userId, from, to) {
  const db = ctx.env.DB;
  const emp = await db.prepare(`SELECT u.id, u.full_name, u.email, u.role, p.phone, p.job_title, p.start_date, p.photo_file_id FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE u.id = ?`).bind(userId).first();
  if (!emp) throw notFound('الموظف غير موجود');
  const st = countedStatuses(ctx.settings.invoice_count_mode);
  const [inv, pays, att, dues, rate] = await Promise.all([
    db.prepare('SELECT i.id, i.number, i.work_date, i.created_at, i.amount, i.barber_rate, i.shop_rate, i.barber_share, i.shop_share, i.status, i.service_type, (SELECT group_concat(file_id) FROM invoice_images WHERE invoice_id = i.id) AS images FROM invoices i WHERE i.user_id = ? AND i.work_date BETWEEN ? AND ? ORDER BY i.created_at').bind(userId, from, to).all(),
    db.prepare('SELECT id, amount, paid_on, method, reference FROM employee_payments WHERE user_id = ? AND voided = 0 AND paid_on BETWEEN ? AND ? ORDER BY paid_on').bind(userId, from, to).all(),
    attendanceFor(ctx, [userId], from, to),
    duesFor(ctx, userId, from, to),
    rateFor(db, userId, to),
  ]);
  const invoices = inv.results.map((r) => ({ ...r, counted: st.includes(r.status), images: r.images ? r.images.split(',') : [] }));
  return {
    generated_at: nowISO(), from, to,
    salon: { name: ctx.settings.salon_name, name_ar: ctx.settings.salon_name_ar, phone: ctx.settings.salon_phone, address: ctx.settings.salon_address, currency: ctx.settings.currency_symbol, footer: ctx.settings.report_footer, count_mode: ctx.settings.invoice_count_mode },
    employee: emp,
    rate,
    financial: { ...dues.period, balance_all_time: dues.total.remaining },
    attendance: att[userId],
    invoices,
    payments: pays.results,
  };
}

export const reportRoutes = {
  'GET /api/dashboard': async (ctx) => {
    need(ctx, 'dashboard.view');
    const today = ctx.today;
    const staff = await staffList(ctx);
    const ids = staff.map((s) => s.id);
    const week = periodRange('week', today), month = periodRange('month', today);
    const prevMonthTo = addDays(month.from, -1), prevMonth = periodRange('month', prevMonthTo);
    const [att, invToday, allInv, allPay, series, wk, mo, pm, pend] = await Promise.all([
      attendanceFor(ctx, ids, today, today),
      invoiceTotals(ctx, { from: today, to: today }),
      invoiceTotals(ctx), paymentTotals(ctx),
      dailySeries(ctx, addDays(today, -29), today),
      invoiceTotals(ctx, { from: week.from, to: week.to }),
      invoiceTotals(ctx, { from: month.from, to: month.to }),
      invoiceTotals(ctx, { from: prevMonth.from, to: prevMonth.to }),
      ctx.env.DB.prepare(`SELECT
          (SELECT COUNT(*) FROM invoices WHERE status IN ('registered','under_review') OR edit_request IS NOT NULL) AS invoices_pending,
          (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending') AS leaves_pending,
          (SELECT COUNT(*) FROM attendance_attempts WHERE ok = 0 AND created_at >= ?) AS attempts_rejected,
          (SELECT COUNT(*) FROM invoices WHERE work_date = ?) AS invoices_today_all`).bind(new Date(ctx.nowMs - 864e5).toISOString(), today).first(),
    ]);
    const counts = { employees: staff.length, present: 0, in_shift: 0, checked_out: 0, late: 0, absent: 0, not_checked_in: 0, on_leave: 0, off: 0 };
    const employees = staff.map((s) => {
      const r = att[s.id].rows[0];
      if (r.check_in_at) counts.present++;
      if (r.status === 'open') counts.in_shift++;
      if (r.check_out_at) counts.checked_out++;
      if (r.late_minutes > 0 || r.status === 'waiting') counts.late++;
      if (r.status === 'absent') counts.absent++;
      if (['waiting', 'upcoming'].includes(r.status)) counts.not_checked_in++;
      if (r.status === 'leave') counts.on_leave++;
      if (r.status === 'off') counts.off++;
      const t = invToday[s.id] || {};
      return {
        user: s, day: r, invoices_today: t.count || 0, sales_today: t.sales || 0, barber_today: t.barber_due || 0,
        remaining: round2((allInv[s.id]?.barber_due || 0) - (allPay[s.id]?.paid || 0)),
      };
    });
    const tot = (o) => ({ sales: sumObj(o, 'sales'), count: sumObj(o, 'count'), barber: sumObj(o, 'barber_due'), shop: sumObj(o, 'shop_share') });
    return json({
      today, counts, employees, series, pending: pend,
      today_totals: { ...tot(invToday), invoices_all: pend.invoices_today_all },
      week: { ...week, ...tot(wk) }, month: { ...month, ...tot(mo) }, prev_month: { ...prevMonth, ...tot(pm) },
      dues: { barber_due: sumObj(allInv, 'barber_due'), paid: sumObj(allPay, 'paid'), remaining: round2(sumObj(allInv, 'barber_due') - sumObj(allPay, 'paid')), shop_share: sumObj(allInv, 'shop_share') },
    });
  },

  'GET /api/reports/summary': async (ctx) => {
    need(ctx, 'reports.view');
    const { from, to } = rangeFrom(ctx);
    const staff = await staffList(ctx, { includeInactive: true });
    const ids = staff.map((s) => s.id);
    const [inv, pay, att, series] = await Promise.all([invoiceTotals(ctx, { from, to }), paymentTotals(ctx, { from, to }), attendanceFor(ctx, ids, from, to), dailySeries(ctx, from, to)]);
    const rows = staff.map((s) => ({ user: s, invoices: inv[s.id] || { count: 0, sales: 0, barber_due: 0, shop_share: 0 }, paid: pay[s.id]?.paid || 0, attendance: att[s.id].summary }))
      .filter((r) => r.user.active || r.invoices.count);
    return json({
      from, to, rows, series,
      totals: { sales: sumObj(inv, 'sales'), count: sumObj(inv, 'count'), barber: sumObj(inv, 'barber_due'), shop: sumObj(inv, 'shop_share'), paid: sumObj(pay, 'paid'),
        late_count: rows.reduce((n, r) => n + r.attendance.late_count, 0), absent_days: rows.reduce((n, r) => n + r.attendance.absent_days, 0), worked_minutes: rows.reduce((n, r) => n + r.attendance.worked_minutes, 0) },
    });
  },

  // Barber's own numbers (home screen + "my income")
  'GET /api/me/summary': async (ctx) => {
    const id = ctx.user.id, today = ctx.today;
    const week = periodRange('week', today), month = periodRange('month', today);
    const [d, w, m, dues, att, rate] = await Promise.all([
      invoiceTotals(ctx, { userId: id, from: today, to: today }), invoiceTotals(ctx, { userId: id, from: week.from, to: week.to }),
      invoiceTotals(ctx, { userId: id, from: month.from, to: month.to }), duesFor(ctx, id),
      attendanceFor(ctx, [id], addDays(today, -1), today), rateFor(ctx.env.DB, id, today),
    ]);
    const z = { count: 0, sales: 0, barber_due: 0, shop_share: 0 };
    const open = await ctx.env.DB.prepare('SELECT * FROM attendance WHERE user_id = ? AND check_out_at IS NULL AND work_date >= ? ORDER BY work_date DESC LIMIT 1').bind(id, addDays(today, -1)).first();
    const rows = att[id].rows;
    const unread = (await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(id).first()).n;
    return json({ today, day: rows[1], yesterday: rows[0], open_attendance: open || null, rate, income: { day: d[id] || z, week: { ...week, ...(w[id] || z) }, month: { ...month, ...(m[id] || z) } }, dues: dues.total, unread });
  },

  // ---------- employee PDF reports ----------
  'POST /api/employee-reports': async (ctx) => {
    need(ctx, 'employee_reports.manage');
    const b = await readJson(ctx.req);
    const userId = String(b.user_id || '');
    const type = oneOf(b.period_type, ['day', 'week', 'month', 'custom'], 'custom');
    let from = dateOrNull(b.from), to = dateOrNull(b.to);
    if (type !== 'custom') ({ from, to } = periodRange(type, dateOrNull(b.ref_date) || ctx.today));
    if (!from || !to || to < from) throw bad('حدد فترة صحيحة');
    if (diffDays(from, to) > 366) throw bad('أقصى فترة للتقرير سنة واحدة');
    const snap = await employeeReportData(ctx, userId, from, to);
    const db = ctx.env.DB;
    const num = (await db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'report' RETURNING value").first()).value;
    const id = newId('rp_');
    snap.report_number = num;
    await db.prepare('INSERT INTO employee_reports (id, number, user_id, period_type, date_from, date_to, include_images, snapshot_json, status, issued_by, issued_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, num, userId, type, from, to, b.include_images ? 1 : 0, JSON.stringify(snap), 'draft', ctx.user.id, nowISO()).run();
    return json({ report: { id, number: num, period_type: type, date_from: from, date_to: to, include_images: !!b.include_images, status: 'draft' }, snapshot: snap });
  },

  'POST /api/employee-reports/:id/pdf': async (ctx) => {
    need(ctx, 'employee_reports.manage');
    const r = await ctx.env.DB.prepare('SELECT * FROM employee_reports WHERE id = ?').bind(ctx.params.id).first();
    if (!r) throw notFound();
    if (r.pdf_file_id) throw bad('تم حفظ ملف هذا التقرير مسبقاً — التقارير المصدرة لا تتغير');
    const b = await readJson(ctx.req);
    const f = await ctx.env.DB.prepare("SELECT * FROM files WHERE id = ? AND kind = 'report_pdf' AND attached = 0").bind(String(b.pdf_file_id || '')).first();
    if (!f || f.owner_user_id !== r.user_id) throw bad('ملف PDF غير صالح');
    const db = ctx.env.DB;
    await db.batch([
      db.prepare("UPDATE employee_reports SET pdf_file_id = ?, status = 'issued', issued_at = ? WHERE id = ?").bind(f.id, nowISO(), r.id),
      db.prepare('UPDATE files SET attached = 1 WHERE id = ?').bind(f.id),
      db.prepare('INSERT INTO report_archive (id, report_id, action, by_user_id, created_at) VALUES (?,?,?,?,?)').bind(newId('ra_'), r.id, 'issued', ctx.user.id, nowISO()),
      auditStmt(ctx, 'إصدار تقرير موظف', { entity: 'report', entity_id: r.id, subject: r.user_id, after: { number: r.number, from: r.date_from, to: r.date_to } }),
    ]);
    return json({ ok: true });
  },

  'POST /api/employee-reports/:id/send': async (ctx) => {
    need(ctx, 'employee_reports.manage');
    const r = await ctx.env.DB.prepare('SELECT * FROM employee_reports WHERE id = ?').bind(ctx.params.id).first();
    if (!r) throw notFound();
    if (!r.pdf_file_id) throw bad('احفظ التقرير أولاً قبل الإرسال');
    const db = ctx.env.DB, now = nowISO();
    const resend = r.send_count > 0;
    await db.batch([
      db.prepare("UPDATE employee_reports SET status = 'sent', sent_at = ?, sent_by = ?, send_count = send_count + 1 WHERE id = ?").bind(now, ctx.user.id, r.id),
      db.prepare('UPDATE files SET visible_to_owner = 1 WHERE id = ?').bind(r.pdf_file_id),
      db.prepare('INSERT INTO report_archive (id, report_id, action, by_user_id, created_at) VALUES (?,?,?,?,?)').bind(newId('ra_'), r.id, resend ? 'resent' : 'sent', ctx.user.id, now),
      auditStmt(ctx, resend ? 'إعادة إرسال تقرير' : 'إرسال تقرير للموظف', { entity: 'report', entity_id: r.id, subject: r.user_id, after: { number: r.number } }),
      ...notifyStmts(ctx, [r.user_id], { type: 'report', title: `تم إصدار تقريرك للفترة ${r.date_from} → ${r.date_to}`, body: `تقرير رقم ${r.number}`, link: `#/me/reports/${r.id}` }),
    ]);
    return json({ ok: true });
  },

  'GET /api/employee-reports': async (ctx) => {
    need(ctx, 'employee_reports.manage');
    const q = ctx.url.searchParams;
    const where = ["r.status != 'draft'"], args = [];
    if (q.get('user_id')) { where.push('r.user_id = ?'); args.push(q.get('user_id')); }
    const { results } = await ctx.env.DB.prepare(
      `SELECT r.id, r.number, r.user_id, r.period_type, r.date_from, r.date_to, r.include_images, r.pdf_file_id, r.status, r.issued_at, r.sent_at, r.send_count, r.viewed_at,
              u.full_name, i.full_name AS issued_by_name, s.full_name AS sent_by_name
         FROM employee_reports r JOIN users u ON u.id = r.user_id LEFT JOIN users i ON i.id = r.issued_by LEFT JOIN users s ON s.id = r.sent_by
        WHERE ${where.join(' AND ')} ORDER BY r.issued_at DESC LIMIT 300`,
    ).bind(...args).all();
    return json({ items: results });
  },

  'GET /api/employee-reports/:id': async (ctx) => {
    const r = await ctx.env.DB.prepare('SELECT r.*, u.full_name FROM employee_reports r JOIN users u ON u.id = r.user_id WHERE r.id = ?').bind(ctx.params.id).first();
    if (!r) throw notFound();
    const admin = ctx.perms.has('employee_reports.manage');
    if (!admin && !(r.user_id === ctx.user.id && r.status === 'sent')) throw notFound();
    if (!admin && !r.viewed_at) {
      await ctx.env.DB.batch([
        ctx.env.DB.prepare('UPDATE employee_reports SET viewed_at = ? WHERE id = ?').bind(nowISO(), r.id),
        ctx.env.DB.prepare('INSERT INTO report_archive (id, report_id, action, by_user_id, created_at) VALUES (?,?,?,?,?)').bind(newId('ra_'), r.id, 'viewed', ctx.user.id, nowISO()),
      ]);
    }
    const trail = admin ? (await ctx.env.DB.prepare('SELECT a.*, u.full_name FROM report_archive a LEFT JOIN users u ON u.id = a.by_user_id WHERE report_id = ? ORDER BY created_at').bind(r.id).all()).results : [];
    const { snapshot_json, ...meta } = r;
    return json({ report: meta, snapshot: JSON.parse(snapshot_json), trail });
  },

  'GET /api/me/reports': async (ctx) => {
    const { results } = await ctx.env.DB.prepare("SELECT id, number, period_type, date_from, date_to, pdf_file_id, sent_at, viewed_at FROM employee_reports WHERE user_id = ? AND status = 'sent' ORDER BY sent_at DESC").bind(ctx.user.id).all();
    return json({ items: results });
  },
};
