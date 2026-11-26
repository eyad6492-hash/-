import { HttpError, bad, forbidden, json, newId, notFound, nowISO, readJson, str, numOrNull, dateOrNull } from '../lib/util.js';
import { auditStmt, need, notifyStmts, assertOpen } from '../lib/context.js';
import { claimFile } from '../lib/files.js';
import { duesFor, invoiceTotals, paymentTotals, staffList } from '../lib/data.js';
import { round2, PAY_METHODS } from '../../public/js/shared.js';

async function paymentsList(ctx, userId, from, to) {
  const where = ['p.user_id = ?'], args = [userId];
  if (from) { where.push('p.paid_on >= ?'); args.push(from); }
  if (to) { where.push('p.paid_on <= ?'); args.push(to); }
  const { results } = await ctx.env.DB.prepare(
    `SELECT p.*, c.full_name AS by_name, (SELECT group_concat(file_id) FROM payment_proofs WHERE payment_id = p.id) AS proof_ids
       FROM employee_payments p LEFT JOIN users c ON c.id = p.created_by WHERE ${where.join(' AND ')} ORDER BY p.paid_on DESC, p.created_at DESC`,
  ).bind(...args).all();
  for (const r of results) r.proofs = r.proof_ids ? r.proof_ids.split(',') : [];
  return results;
}

const range = (ctx) => {
  const q = ctx.url.searchParams;
  return { from: dateOrNull(q.get('from')), to: dateOrNull(q.get('to')) };
};

export const paymentRoutes = {
  // Overview: every employee's dues, paid and remaining (all-time balance + selected period)
  'GET /api/dues': async (ctx) => {
    need(ctx, 'payments.view');
    const { from, to } = range(ctx);
    const staff = await staffList(ctx, { includeInactive: true });
    const [allInv, allPay, pInv, pPay] = await Promise.all([
      invoiceTotals(ctx), paymentTotals(ctx),
      from && to ? invoiceTotals(ctx, { from, to }) : {}, from && to ? paymentTotals(ctx, { from, to }) : {},
    ]);
    const z = { count: 0, sales: 0, barber_due: 0, shop_share: 0 };
    const items = staff.map((s) => {
      const a = allInv[s.id] || z, p = allPay[s.id]?.paid || 0;
      const pi = pInv[s.id] || z, pp = pPay[s.id]?.paid || 0;
      return {
        user: s,
        total: { ...a, paid: p, remaining: round2(a.barber_due - p) },
        period: from && to ? { ...pi, paid: pp, remaining: round2(pi.barber_due - pp) } : null,
      };
    }).filter((x) => x.user.active || x.total.remaining !== 0);
    const sum = (k, part = 'total') => round2(items.reduce((n, x) => n + (x[part]?.[k] || 0), 0));
    const totals = { sales: sum('sales'), barber_due: sum('barber_due'), shop_share: sum('shop_share'), paid: sum('paid'), remaining: sum('remaining') };
    const period = from && to ? { from, to, sales: sum('sales', 'period'), barber_due: sum('barber_due', 'period'), shop_share: sum('shop_share', 'period'), paid: sum('paid', 'period'), remaining: sum('remaining', 'period') } : null;
    return json({ items, totals, period });
  },

  'GET /api/dues/:userId': async (ctx) => {
    need(ctx, 'payments.view');
    const { from, to } = range(ctx);
    const u = await ctx.env.DB.prepare('SELECT id, full_name, email, role FROM users WHERE id = ?').bind(ctx.params.userId).first();
    if (!u) throw notFound();
    return json({ user: u, dues: await duesFor(ctx, u.id, from, to), payments: await paymentsList(ctx, u.id, from, to) });
  },

  'GET /api/me/dues': async (ctx) => {
    const { from, to } = range(ctx);
    return json({ dues: await duesFor(ctx, ctx.user.id, from, to), payments: await paymentsList(ctx, ctx.user.id, from, to) });
  },

  'POST /api/payments': async (ctx) => {
    need(ctx, 'payments.manage');
    const b = await readJson(ctx.req);
    const u = await ctx.env.DB.prepare('SELECT id, full_name FROM users WHERE id = ?').bind(String(b.user_id || '')).first();
    if (!u) throw bad('اختر الموظف');
    const amount = round2(numOrNull(b.amount) ?? 0);
    if (!(amount > 0)) throw bad('أدخل مبلغ الدفعة');
    const paid_on = dateOrNull(b.paid_on) || ctx.today;
    if (paid_on > ctx.today) throw bad('لا يمكن تسجيل دفعة بتاريخ مستقبلي');
    const method = PAY_METHODS.includes(b.method) ? b.method : null;
    if (!method) throw bad('اختر طريقة الدفع');
    const dues = await duesFor(ctx, u.id);
    if (amount > dues.total.remaining + 0.001 && !b.allow_over) {
      throw new HttpError(409, `المبلغ (${amount}) أكبر من المتبقي للموظف (${dues.total.remaining}). أكّد إذا كانت دفعة مقدمة/سلفة.`, 'over_remaining');
    }
    const overridden = await assertOpen(ctx, u.id, paid_on, b.reason);
    if (b.proof_file_id) await claimFile(ctx, b.proof_file_id, { kind: 'payment_proof', ownerUserId: u.id });
    const db = ctx.env.DB, id = newId('pay_'), now = nowISO();
    const row = { id, user_id: u.id, amount, paid_on, method, reference: str(b.reference, 100), notes: str(b.notes, 500), created_by: ctx.user.id, created_at: now, updated_at: now };
    const keys = Object.keys(row);
    await db.batch([
      db.prepare(`INSERT INTO employee_payments (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((k) => row[k])),
      ...(b.proof_file_id ? [
        db.prepare('INSERT INTO payment_proofs (id, payment_id, file_id, created_at) VALUES (?,?,?,?)').bind(newId('pp_'), id, b.proof_file_id, now),
        db.prepare('UPDATE files SET attached = 1 WHERE id = ?').bind(b.proof_file_id),
      ] : []),
      auditStmt(ctx, 'تسجيل دفعة لموظف', { entity: 'payment', entity_id: id, subject: u.id, after: { ...row, proof_file_id: b.proof_file_id || null }, reason: overridden ? `بعد الإغلاق: ${b.reason}` : null }),
      ...notifyStmts(ctx, [u.id], { type: 'payment', title: 'تم تسجيل دفعة لك', body: `${amount} ${ctx.settings.currency_symbol} — ${method} بتاريخ ${paid_on}`, link: '#/me/dues' }),
    ]);
    return json({ id, remaining_after: round2(dues.total.remaining - amount) });
  },

  'POST /api/payments/:id/void': async (ctx) => {
    need(ctx, 'payments.manage');
    const p = await ctx.env.DB.prepare('SELECT * FROM employee_payments WHERE id = ?').bind(ctx.params.id).first();
    if (!p) throw notFound();
    if (p.voided) throw bad('الدفعة ملغاة مسبقاً');
    const b = await readJson(ctx.req);
    const reason = str(b.reason, 300); if (!reason) throw bad('اكتب سبب إلغاء الدفعة');
    const overridden = await assertOpen(ctx, p.user_id, p.paid_on, b.closure_reason);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE employee_payments SET voided = 1, void_reason = ?, updated_at = ? WHERE id = ?').bind(reason, nowISO(), p.id),
      auditStmt(ctx, 'إلغاء دفعة', { entity: 'payment', entity_id: p.id, subject: p.user_id, before: p, after: { voided: 1 }, reason: overridden ? `${reason} (بعد الإغلاق: ${b.closure_reason})` : reason }),
      ...notifyStmts(ctx, [p.user_id], { type: 'payment', title: 'تم إلغاء دفعة', body: `${p.amount} ${ctx.settings.currency_symbol} بتاريخ ${p.paid_on}: ${reason}`, link: '#/me/dues' }),
    ]);
    return json({ ok: true });
  },
};
