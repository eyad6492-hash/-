// Shared server-side queries: schedules, leaves, attendance days, financial totals.
import { resolveShift, attendanceDays, attendanceSummary, countedStatuses, round2, eachDay } from '../../public/js/shared.js';

const inList = (arr) => arr.map(() => '?').join(',');

export async function loadSchedules(db, userIds) {
  if (!userIds.length) return {};
  const { results: scheds } = await db.prepare(`SELECT * FROM work_schedules WHERE user_id IN (${inList(userIds)}) ORDER BY effective_from`).bind(...userIds).all();
  const ids = scheds.map((s) => s.id);
  const days = ids.length ? (await db.prepare(`SELECT * FROM schedule_days WHERE schedule_id IN (${inList(ids)})`).bind(...ids).all()).results : [];
  const byId = Object.fromEntries(scheds.map((s) => [s.id, { ...s, days: {} }]));
  for (const d of days) byId[d.schedule_id].days[d.weekday] = d;
  const out = {};
  for (const s of scheds) (out[s.user_id] ||= []).push(byId[s.id]);
  return out;
}

export async function loadOverrides(db, userIds, from, to) {
  if (!userIds.length) return {};
  const { results } = await db.prepare(`SELECT * FROM schedule_overrides WHERE user_id IN (${inList(userIds)}) AND work_date BETWEEN ? AND ?`).bind(...userIds, from, to).all();
  const out = {};
  for (const r of results) (out[r.user_id] ||= {})[r.work_date] = r;
  return out;
}

export async function loadLeaveDays(db, userIds, from, to) {
  if (!userIds.length) return {};
  const { results } = await db.prepare(`SELECT user_id, start_date, end_date FROM leave_requests WHERE status = 'approved' AND user_id IN (${inList(userIds)}) AND start_date <= ? AND end_date >= ?`).bind(...userIds, to, from).all();
  const out = {};
  for (const r of results) {
    const set = (out[r.user_id] ||= new Set());
    for (const d of eachDay(r.start_date < from ? from : r.start_date, r.end_date > to ? to : r.end_date)) set.add(d);
  }
  return out;
}

/** Planned shift resolver for many employees at once. */
export async function shiftContext(ctx, userIds, from, to) {
  const [sch, ovr] = await Promise.all([loadSchedules(ctx.env.DB, userIds), loadOverrides(ctx.env.DB, userIds, from, to)]);
  return (userId) => (date) => resolveShift(date, sch[userId] || [], ovr[userId] || {}, ctx.off);
}

export async function attendanceFor(ctx, userIds, from, to) {
  const db = ctx.env.DB;
  const [shiftFor, leaves, attRows] = await Promise.all([
    shiftContext(ctx, userIds, from, to),
    loadLeaveDays(db, userIds, from, to),
    userIds.length ? db.prepare(`SELECT * FROM attendance WHERE user_id IN (${inList(userIds)}) AND work_date BETWEEN ? AND ?`).bind(...userIds, from, to).all().then((r) => r.results) : [],
  ]);
  const att = {};
  for (const a of attRows) (att[a.user_id] ||= {})[a.work_date] = a;
  const out = {};
  for (const uid of userIds) {
    const rows = attendanceDays({ from, to, nowMs: ctx.nowMs, shiftFor: shiftFor(uid), att: att[uid] || {}, leaves: leaves[uid] || new Set() });
    out[uid] = { rows, summary: attendanceSummary(rows) };
  }
  return out;
}

export function countedClause(ctx, alias = '') {
  const st = countedStatuses(ctx.settings.invoice_count_mode);
  return { sql: `${alias}status IN (${inList(st)})`, args: st };
}

/** Totals of counted invoices per employee in a date range (null range = all time). */
export async function invoiceTotals(ctx, { userId = null, from = null, to = null } = {}) {
  const c = countedClause(ctx);
  const where = [c.sql], args = [...c.args];
  if (userId) { where.push('user_id = ?'); args.push(userId); }
  if (from) { where.push('work_date >= ?'); args.push(from); }
  if (to) { where.push('work_date <= ?'); args.push(to); }
  const { results } = await ctx.env.DB.prepare(
    `SELECT user_id, COUNT(*) AS count, COALESCE(SUM(amount),0) AS sales, COALESCE(SUM(barber_share),0) AS barber_due, COALESCE(SUM(shop_share),0) AS shop_share
       FROM invoices WHERE ${where.join(' AND ')} GROUP BY user_id`,
  ).bind(...args).all();
  return Object.fromEntries(results.map((r) => [r.user_id, { count: r.count, sales: round2(r.sales), barber_due: round2(r.barber_due), shop_share: round2(r.shop_share) }]));
}

export async function paymentTotals(ctx, { userId = null, from = null, to = null } = {}) {
  const where = ['voided = 0'], args = [];
  if (userId) { where.push('user_id = ?'); args.push(userId); }
  if (from) { where.push('paid_on >= ?'); args.push(from); }
  if (to) { where.push('paid_on <= ?'); args.push(to); }
  const { results } = await ctx.env.DB.prepare(`SELECT user_id, COALESCE(SUM(amount),0) AS paid, COUNT(*) AS n FROM employee_payments WHERE ${where.join(' AND ')} GROUP BY user_id`).bind(...args).all();
  return Object.fromEntries(results.map((r) => [r.user_id, { paid: round2(r.paid), count: r.n }]));
}

/**
 * Dues for one employee. "balance" is always all-time (due − paid); the period block shows activity inside [from,to].
 */
export async function duesFor(ctx, userId, from = null, to = null) {
  const [allInv, allPay] = await Promise.all([invoiceTotals(ctx, { userId }), paymentTotals(ctx, { userId })]);
  const a = allInv[userId] || { count: 0, sales: 0, barber_due: 0, shop_share: 0 };
  const p = allPay[userId] || { paid: 0, count: 0 };
  const out = { total: { ...a, paid: p.paid, remaining: round2(a.barber_due - p.paid) } };
  if (from && to) {
    const [pi, pp] = await Promise.all([invoiceTotals(ctx, { userId, from, to }), paymentTotals(ctx, { userId, from, to })]);
    const x = pi[userId] || { count: 0, sales: 0, barber_due: 0, shop_share: 0 };
    out.period = { from, to, ...x, paid: pp[userId]?.paid || 0, remaining: round2(x.barber_due - (pp[userId]?.paid || 0)) };
  }
  return out;
}

export async function staffList(ctx, { includeInactive = false, onlyShifts = true } = {}) {
  const { results } = await ctx.env.DB.prepare(
    `SELECT u.id, u.full_name, u.email, u.role, u.active, p.phone, p.photo_file_id, p.job_title, p.status, p.works_shifts, p.barber_rate, p.shop_rate, p.start_date
       FROM users u JOIN employee_profiles p ON p.user_id = u.id
      WHERE (? OR u.active = 1) AND (? = 0 OR p.works_shifts = 1)
      ORDER BY u.full_name`,
  ).bind(includeInactive ? 1 : 0, onlyShifts ? 1 : 0).all();
  return results;
}
