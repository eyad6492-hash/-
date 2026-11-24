import { addDays, diffDays, parseArr } from './shim.js';

/**
 * Loads every client with its current subscription and payment totals, and
 * computes the derived statuses used across the app (dashboard, lists, alerts).
 */
export async function loadClientsDerived(ctx, where = '', args = []) {
  const db = ctx.env.DB;
  const { results: clients } = await db.prepare(`SELECT * FROM clients ${where} ORDER BY updated_at DESC`).bind(...args).all();
  if (!clients.length) return [];
  const { results: subs } = await db.prepare('SELECT * FROM subscriptions WHERE is_current = 1').all();
  const { results: paid } = await db.prepare(
    "SELECT subscription_id, SUM(amount) AS total, MAX(date) AS last FROM payments WHERE subscription_id IS NOT NULL AND type = 'subscription' GROUP BY subscription_id",
  ).all();
  const { results: lastPay } = await db.prepare('SELECT client_id, MAX(date) AS last, SUM(amount) AS total FROM payments GROUP BY client_id').all();
  const { results: lastFu } = await db.prepare('SELECT client_id, MAX(date) AS last FROM followups GROUP BY client_id').all();
  const { results: lastRep } = await db.prepare('SELECT client_id, MAX(created_at) AS last FROM reports GROUP BY client_id').all();
  const { results: camps } = await db.prepare("SELECT client_id, COUNT(*) AS n, SUM(CASE WHEN status IN ('optimize','rejected','stopped') THEN 1 ELSE 0 END) AS attention FROM campaigns WHERE status IN ('active','optimize','review','rejected','stopped','paused') GROUP BY client_id").all();
  const subBy = Object.fromEntries(subs.map((s) => [s.client_id, s]));
  const paidBy = Object.fromEntries(paid.map((p) => [p.subscription_id, p]));
  const lpBy = Object.fromEntries(lastPay.map((p) => [p.client_id, p]));
  const fuBy = Object.fromEntries(lastFu.map((p) => [p.client_id, p.last]));
  const repBy = Object.fromEntries(lastRep.map((p) => [p.client_id, p.last]));
  const campBy = Object.fromEntries(camps.map((c) => [c.client_id, c]));
  return clients.map((c) => derive(ctx, c, subBy[c.id], paidBy[subBy[c.id]?.id]?.total || 0, {
    last_payment: lpBy[c.id]?.last || null, total_paid_all: lpBy[c.id]?.total || 0,
    last_followup: fuBy[c.id] || null, last_report: repBy[c.id] || null,
    campaigns_active: campBy[c.id]?.n || 0, campaigns_attention: campBy[c.id]?.attention || 0,
  }));
}

export function deriveSub(ctx, sub, paid) {
  if (!sub) return null;
  const s = ctx.settings, today = ctx.today;
  const days_left = diffDays(today, sub.end_date);
  const amount = Number(sub.amount) || 0;
  const remaining = Math.max(amount - paid, 0);
  let pay_status = 'none';
  if (amount > 0) {
    if (remaining <= 0.009) pay_status = 'paid';
    else if (today > addDays(sub.start_date, Number(s.payment_grace_days) || 0)) pay_status = 'late';
    else if (paid > 0) pay_status = 'partial';
    else pay_status = 'due';
  }
  let state = sub.status;
  if (sub.status === 'active' || sub.status === 'pending_renewal') {
    if (days_left < 0) state = 'expired';
    else if (sub.status === 'pending_renewal') state = 'pending_renewal';
    else if (days_left <= (Number(s.expiring_days) || 7)) state = 'expiring';
  }
  return { ...sub, platforms: parseArr(sub.platforms), days_left, paid, remaining, pay_status, partial: paid > 0 && remaining > 0.009, state };
}

function derive(ctx, c, sub, paid, extra) {
  const d = deriveSub(ctx, sub, paid);
  const flags = [];
  if (c.status === 'former' || c.archived_at) flags.push('former');
  if (c.status === 'frozen' || d?.state === 'frozen') flags.push('frozen');
  if (c.status === 'stopped') flags.push('stopped');
  if (d) {
    if (d.state === 'expired') flags.push('expired');
    if (d.pay_status === 'late') flags.push('late');
    if (d.partial) flags.push('partial');
    if (d.state === 'expiring') flags.push('expiring');
    if (d.state === 'pending_renewal' || (d.state === 'expiring' && d.days_left <= 3) || d.state === 'expired') flags.push('renewal');
  }
  const status_display = flags[0] || 'active';
  return {
    ...c,
    category_ids: parseArr(c.category_ids), tags: parseArr(c.tags), platforms: parseArr(c.platforms),
    other_links: parseArr(c.other_links), custom_fields: parseArr(c.custom_fields),
    sub: d, flags, status_display, ...extra,
  };
}
