import { HttpError, bad, buildInsert, buildUpdate, dateOrNull, json, jsonArr, newId, notFound, nowISO, numOrNull, intOrNull, oneOf, parseArr, readJson, reqStr, str, url } from '../lib/util.js';
import { log, need, can } from '../lib/context.js';
import { loadClientsDerived, deriveSub } from '../lib/derive.js';
import { addDays, addMonths, diffDays, OPEN_END } from '../lib/shim.js';
import { PAY_METHODS, PAY_TYPES } from '../../public/js/shared.js';

const CLIENT_STATUSES = ['active', 'stopped', 'frozen', 'former'];

function clientFields(b, partial = false) {
  const f = {
    name: b.name !== undefined || !partial ? reqStr(b.name, 'اسم العميل', 150) : undefined,
    store_name: b.store_name !== undefined ? str(b.store_name, 150) : undefined,
    phone: b.phone !== undefined ? str(b.phone, 40) : undefined,
    email: b.email !== undefined ? str(b.email, 150) : undefined,
    business_type: b.business_type !== undefined ? str(b.business_type, 100) : undefined,
    category_ids: b.category_ids !== undefined ? jsonArr(b.category_ids) : undefined,
    tags: b.tags !== undefined ? jsonArr((b.tags || []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean)) : undefined,
    store_url: b.store_url !== undefined ? url(b.store_url) : undefined,
    tiktok_url: b.tiktok_url !== undefined ? url(b.tiktok_url) : undefined,
    tiktok_ads_url: b.tiktok_ads_url !== undefined ? url(b.tiktok_ads_url) : undefined,
    other_links: b.other_links !== undefined ? jsonArr((b.other_links || []).filter((l) => l && l.url).map((l) => ({ label: str(l.label, 60) || 'رابط', url: url(l.url) }))) : undefined,
    start_date: b.start_date !== undefined ? dateOrNull(b.start_date) : undefined,
    platforms: b.platforms !== undefined ? jsonArr(b.platforms) : undefined,
    daily_budget: b.daily_budget !== undefined ? numOrNull(b.daily_budget) : undefined,
    pay_alert_enabled: b.pay_alert_enabled !== undefined ? (b.pay_alert_enabled ? 1 : 0) : undefined,
    pay_alert_days: b.pay_alert_days !== undefined ? Math.min(90, Math.max(1, intOrNull(b.pay_alert_days) || 3)) : undefined,
    followup_every: b.followup_every !== undefined ? Math.max(1, intOrNull(b.followup_every) || 1) : undefined,
    next_contact_date: b.next_contact_date !== undefined ? dateOrNull(b.next_contact_date) : undefined,
    notes: b.notes !== undefined ? str(b.notes, 10000) : undefined,
    logo: b.logo !== undefined ? (b.logo && /^data:image\/(png|jpe?g|webp);base64,/.test(b.logo) && b.logo.length < 400000 ? b.logo : null) : undefined,
    custom_fields: b.custom_fields !== undefined ? jsonArr((b.custom_fields || []).filter((x) => x && x.label).map((x) => ({ label: str(x.label, 60), value: str(x.value, 500) }))) : undefined,
  };
  if (b.billing_model !== undefined) f.billing_model = oneOf(b.billing_model, ['subscription', 'commission'], 'subscription');
  if (b.status !== undefined) f.status = oneOf(b.status, CLIENT_STATUSES, 'active');
  return f;
}

export function subFields(ctx, b) {
  const start = dateOrNull(b.start_date) || ctx.today;
  const type = oneOf(b.sub_type, ['fixed', 'open'], 'fixed');
  const monthly = numOrNull(b.monthly_amount);
  const payDay = intOrNull(b.pay_day);
  if (payDay !== null && (payDay < 1 || payDay > 31)) throw bad('يوم الدفع يجب أن يكون بين 1 و31');
  const billing = { sub_type: type, pay_day: payDay, first_due_date: dateOrNull(b.first_due_date), billing_mode: oneOf(b.billing_mode, ['advance', 'arrears'], 'advance') };
  const cycle = intOrNull(b.cycle_days);
  if (cycle !== null && (cycle < 1 || cycle > 365)) throw bad('دورة التحصيل يجب أن تكون بين 1 و365 يومًا');
  billing.cycle_days = cycle;
  if (type === 'open') {
    // An open subscription may have no agreed amount yet — never assume one.
    const m0 = monthly ?? numOrNull(b.amount);
    const m = m0 && m0 > 0 ? m0 : null;
    return { start_date: start, end_date: OPEN_END, duration_months: null, amount: m ?? 0, monthly_amount: m, ...billing,
      ad_budget: numOrNull(b.ad_budget), services: str(b.services, 2000), platforms: jsonArr(b.platforms), notes: str(b.notes, 2000) };
  }
  const months = numOrNull(b.duration_months) ?? (Number(ctx.settings.default_sub_months) || 1);
  const endIn = dateOrNull(b.end_date);
  const end = endIn && endIn !== OPEN_END ? endIn : addDays(addMonths(start, months), -1);
  if (end < start) throw bad('تاريخ النهاية قبل تاريخ البداية');
  return {
    start_date: start, end_date: end, duration_months: months,
    amount: numOrNull(b.amount) ?? (monthly ? monthly * months : 0), monthly_amount: monthly && monthly > 0 ? monthly : null, ...billing,
    ad_budget: numOrNull(b.ad_budget), services: str(b.services, 2000),
    platforms: jsonArr(b.platforms), notes: str(b.notes, 2000),
  };
}

async function getClient(ctx, id) {
  const c = await ctx.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  if (!c) throw notFound('العميل غير موجود');
  return c;
}
async function currentSub(ctx, clientId) {
  return ctx.env.DB.prepare('SELECT * FROM subscriptions WHERE client_id = ? AND is_current = 1').bind(clientId).first();
}
async function subPaid(ctx, subId) {
  const r = await ctx.env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE subscription_id = ? AND type = 'subscription'").bind(subId).first();
  return r.t;
}
const touch = (ctx, id) => ctx.env.DB.prepare('UPDATE clients SET updated_at = ? WHERE id = ?').bind(nowISO(), id).run();

export async function createClient(ctx, b, extraLog = '') {
  const id = newId('c_');
  const f = clientFields(b);
  const row = { id, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)), status: f.status || 'active', created_by: ctx.user.id, created_at: nowISO(), updated_at: nowISO() };
  if (!row.followup_every) row.followup_every = Number(ctx.settings.followup_default_every) || 1;
  const ins = buildInsert('clients', row);
  const stmts = [ctx.env.DB.prepare(ins.sql).bind(...ins.args)];
  let subId = null;
  if (b.subscription && (b.subscription.amount || b.subscription.monthly_amount || b.subscription.start_date || b.subscription.sub_type === 'open')) {
    subId = newId('s_');
    const s = { id: subId, client_id: id, ...subFields(ctx, b.subscription), status: 'active', is_current: 1, created_at: nowISO(), updated_at: nowISO() };
    const si = buildInsert('subscriptions', s);
    stmts.push(ctx.env.DB.prepare(si.sql).bind(...si.args));
  }
  await ctx.env.DB.batch(stmts);
  await log(ctx, 'إضافة عميل', { entity: 'client', entity_id: id, client_id: id, details: row.name + extraLog });
  return { id, subscription_id: subId };
}

export const clientRoutes = {
  'GET /api/clients': async (ctx) => {
    need(ctx, 'clients.view');
    const scope = ctx.url.searchParams.get('scope') || 'current';
    const where = scope === 'archived' ? "WHERE status = 'former'" : scope === 'all' ? '' : "WHERE status != 'former'";
    let items = await loadClientsDerived(ctx, where);
    if (!can(ctx, 'payments.view')) items = items.map(stripMoney);
    return json({ items });
  },
  'GET /api/clients/lite': async (ctx) => {
    const { results } = await ctx.env.DB.prepare("SELECT id, name, store_name, logo, status FROM clients ORDER BY name").all();
    return json({ items: results });
  },

  'GET /api/clients/:id': async (ctx) => {
    need(ctx, 'clients.view');
    const id = ctx.params.id;
    const [c] = await loadClientsDerived(ctx, 'WHERE id = ?', [id]);
    if (!c) throw notFound('العميل غير موجود');
    const db = ctx.env.DB;
    const q = (sql) => db.prepare(sql).bind(id).all().then((r) => r.results);
    const out = { client: can(ctx, 'payments.view') ? c : stripMoney(c) };
    const subs = await q('SELECT * FROM subscriptions WHERE client_id = ? ORDER BY start_date DESC');
    const paidRows = await q("SELECT subscription_id, SUM(amount) t FROM payments WHERE client_id = ? AND type = 'subscription' GROUP BY subscription_id");
    const paidBy = Object.fromEntries(paidRows.map((r) => [r.subscription_id, r.t]));
    const rawClient = await ctx.env.DB.prepare('SELECT pay_alert_enabled, pay_alert_days, trial_id FROM clients WHERE id = ?').bind(id).first();
    out.subscriptions = subs.map((s) => deriveSub(ctx, s, paidBy[s.id] || 0, rawClient));
    if (rawClient.trial_id) out.trial = await ctx.env.DB.prepare('SELECT * FROM trials WHERE id = ?').bind(rawClient.trial_id).first();
    out.freezes = await q('SELECT * FROM freezes WHERE client_id = ? ORDER BY start_date DESC');
    if (can(ctx, 'payments.view')) out.payments = await q('SELECT * FROM payments WHERE client_id = ? ORDER BY date DESC, created_at DESC');
    if (can(ctx, 'campaigns.view')) out.campaigns = await q('SELECT * FROM campaigns WHERE client_id = ? ORDER BY updated_at DESC');
    out.followups = (await q('SELECT * FROM followups WHERE client_id = ? ORDER BY date DESC, created_at DESC LIMIT 100'))
      .map((f) => ({ ...f, checklist: parseArr(f.checklist), campaign_ids: parseArr(f.campaign_ids) }));
    out.tasks = await q('SELECT * FROM tasks WHERE client_id = ? ORDER BY CASE WHEN status IN (\'done\',\'cancelled\') THEN 1 ELSE 0 END, due_date');
    if (can(ctx, 'reports.view') || can(ctx, 'reports.create')) out.reports = await q('SELECT * FROM reports WHERE client_id = ? ORDER BY period_to DESC, created_at DESC');
    if (can(ctx, 'quotes.view')) out.quotes = (await q('SELECT * FROM quotes WHERE client_id = ?1 OR converted_client_id = ?1 ORDER BY date DESC')).map((x) => ({ ...x, items: parseArr(x.items) }));
    if (can(ctx, 'vault.view')) out.vault = await q('SELECT id, platform, account_name, login_url, ad_account_id, created_at FROM vault_entries WHERE client_id = ? ORDER BY platform');
    if (can(ctx, 'activity.view')) out.activity = await q('SELECT * FROM activity_log WHERE client_id = ? ORDER BY created_at DESC LIMIT 100');
    return json(out);
  },

  'POST /api/clients': async (ctx) => {
    need(ctx, 'clients.create');
    const b = await readJson(ctx.req);
    return json(await createClient(ctx, b));
  },

  'PUT /api/clients/:id': async (ctx) => {
    need(ctx, 'clients.edit');
    const c = await getClient(ctx, ctx.params.id);
    const b = await readJson(ctx.req);
    const f = clientFields(b, true);
    delete f.status; // status changes go through explicit actions
    const up = buildUpdate('clients', c.id, { ...f, updated_at: nowISO() });
    if (up) await ctx.env.DB.prepare(up.sql).bind(...up.args).run();
    const changed = Object.keys(f).filter((k) => f[k] !== undefined && String(f[k] ?? '') !== String(c[k] ?? '')).length;
    await log(ctx, 'تعديل بيانات العميل', { entity: 'client', entity_id: c.id, client_id: c.id, details: `${c.name} — ${changed} حقل` });
    return json({ ok: true });
  },

  // What a permanent delete would remove (shown in the confirmation dialog).
  'GET /api/clients/:id/delete-preview': async (ctx) => {
    need(ctx, 'clients.delete');
    const c = await getClient(ctx, ctx.params.id);
    const n = async (t, col = 'client_id') => (await ctx.env.DB.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${col} = ?`).bind(c.id).first()).n;
    return json({ name: c.name, owner_only: true, can_delete: ctx.user.role === 'owner', counts: {
      subscriptions: await n('subscriptions'), payments: await n('payments'), freezes: await n('freezes'), campaigns: await n('campaigns'), reports: await n('reports'),
      followups: await n('followups'), checklist: await n('checklist_entries'), vault: await n('vault_entries'), tasks: await n('tasks'), quotes: await n('quotes') } });
  },
  'DELETE /api/clients/:id': async (ctx) => {
    need(ctx, 'clients.delete');
    if (ctx.user.role !== 'owner') throw new HttpError(403, 'الحذف النهائي للعملاء متاح لمالك التطبيق فقط — يمكنك الأرشفة بدلًا من ذلك');
    const c = await getClient(ctx, ctx.params.id);
    const db = ctx.env.DB;
    await db.batch([
      ...['subscriptions', 'freezes', 'payments', 'campaign_snapshots', 'campaigns', 'followups', 'reports', 'vault_entries', 'checklist_entries'].map((t) => db.prepare(`DELETE FROM ${t} WHERE client_id = ?`).bind(c.id)),
      db.prepare('UPDATE tasks SET client_id = NULL WHERE client_id = ?').bind(c.id),
      db.prepare('UPDATE quotes SET client_id = NULL WHERE client_id = ?').bind(c.id),
      db.prepare('UPDATE quotes SET converted_client_id = NULL WHERE converted_client_id = ?').bind(c.id),
      db.prepare('DELETE FROM clients WHERE id = ?').bind(c.id),
    ]);
    await ctx.env.DB.prepare('UPDATE trials SET converted_client_id = NULL WHERE converted_client_id = ?').bind(c.id).run();
    await log(ctx, 'حذف عميل', { entity: 'client', entity_id: c.id, details: c.name });
    return json({ ok: true });
  },

  // archive = move to former clients; nothing is deleted
  'POST /api/clients/:id/archive': async (ctx) => {
    need(ctx, 'clients.edit');
    const c = await getClient(ctx, ctx.params.id);
    const b = await readJson(ctx.req).catch(() => ({}));
    const db = ctx.env.DB;
    await db.batch([
      db.prepare("UPDATE clients SET status = 'former', archived_at = ?, updated_at = ? WHERE id = ?").bind(nowISO(), nowISO(), c.id),
      db.prepare("UPDATE subscriptions SET status = 'stopped', updated_at = ? WHERE client_id = ? AND is_current = 1 AND status != 'ended'").bind(nowISO(), c.id),
    ]);
    await log(ctx, 'نقل العميل إلى الأرشيف', { entity: 'client', entity_id: c.id, client_id: c.id, details: str(b?.reason, 500) || c.name });
    return json({ ok: true });
  },
  'POST /api/clients/:id/reactivate': async (ctx) => {
    need(ctx, 'clients.edit');
    const c = await getClient(ctx, ctx.params.id);
    const db = ctx.env.DB;
    await db.batch([
      db.prepare("UPDATE clients SET status = 'active', archived_at = NULL, updated_at = ? WHERE id = ?").bind(nowISO(), c.id),
      db.prepare("UPDATE subscriptions SET status = 'active', updated_at = ? WHERE client_id = ? AND is_current = 1 AND status = 'stopped'").bind(nowISO(), c.id),
    ]);
    await log(ctx, 'إعادة تفعيل العميل', { entity: 'client', entity_id: c.id, client_id: c.id, details: c.name });
    return json({ ok: true });
  },
  'POST /api/clients/:id/stop': async (ctx) => {
    need(ctx, 'clients.edit');
    const c = await getClient(ctx, ctx.params.id);
    const b = await readJson(ctx.req).catch(() => ({}));
    const db = ctx.env.DB;
    await db.batch([
      db.prepare("UPDATE clients SET status = 'stopped', updated_at = ? WHERE id = ?").bind(nowISO(), c.id),
      db.prepare("UPDATE subscriptions SET status = 'stopped', updated_at = ? WHERE client_id = ? AND is_current = 1 AND status IN ('active','pending_renewal')").bind(nowISO(), c.id),
    ]);
    await log(ctx, 'إيقاف العميل', { entity: 'client', entity_id: c.id, client_id: c.id, details: str(b?.reason, 500) || c.name });
    return json({ ok: true });
  },

  // ---------------- Subscriptions ----------------
  'GET /api/subscriptions': async (ctx) => {
    need(ctx, 'clients.view');
    const items = (await loadClientsDerived(ctx, "WHERE status != 'former'")).filter((c) => c.sub).map((c) => ({ client: { id: c.id, name: c.name, store_name: c.store_name, logo: c.logo, status: c.status }, sub: c.sub }));
    return json({ items: can(ctx, 'payments.view') ? items : items.map((i) => ({ ...i, sub: { ...i.sub, amount: null, paid: null, remaining: null } })) });
  },
  'POST /api/clients/:id/subscriptions': async (ctx) => {
    need(ctx, 'subscriptions.edit');
    const c = await getClient(ctx, ctx.params.id);
    const b = await readJson(ctx.req);
    const prev = await currentSub(ctx, c.id);
    const id = newId('s_');
    const row = { id, client_id: c.id, ...subFields(ctx, b), status: 'active', is_current: 1, renewed_from: prev?.id || null, created_at: nowISO(), updated_at: nowISO() };
    const ins = buildInsert('subscriptions', row);
    const db = ctx.env.DB;
    const stmts = [];
    if (prev) stmts.push(db.prepare("UPDATE subscriptions SET is_current = 0, status = 'ended', updated_at = ? WHERE id = ?").bind(nowISO(), prev.id));
    stmts.push(db.prepare(ins.sql).bind(...ins.args));
    if (c.status !== 'former') stmts.push(db.prepare("UPDATE clients SET status = 'active', updated_at = ? WHERE id = ?").bind(nowISO(), c.id));
    if (b.update_budget && row.ad_budget !== null) stmts.push(db.prepare('UPDATE clients SET daily_budget = ? WHERE id = ?').bind(row.ad_budget, c.id));
    await db.batch(stmts);
    await log(ctx, prev ? 'تجديد اشتراك' : 'إضافة اشتراك', { entity: 'subscription', entity_id: id, client_id: c.id, details: `${row.start_date} → ${row.end_date} — ${row.amount}` });
    return json({ id });
  },
  'PUT /api/subscriptions/:id': async (ctx) => {
    need(ctx, 'subscriptions.edit');
    const s = await ctx.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(ctx.params.id).first();
    if (!s) throw notFound();
    const b = await readJson(ctx.req);
    const f = subFields(ctx, { ...s, platforms: parseArr(s.platforms), ...b, end_date: b.end_date ?? s.end_date });
    if (b.status !== undefined) f.status = oneOf(b.status, ['active', 'stopped', 'pending_renewal', 'ended', 'frozen'], s.status);
    const up = buildUpdate('subscriptions', s.id, { ...f, updated_at: nowISO() });
    await ctx.env.DB.prepare(up.sql).bind(...up.args).run();
    await log(ctx, 'تعديل اشتراك', { entity: 'subscription', entity_id: s.id, client_id: s.client_id, details: `${f.start_date} → ${f.end_date} — ${f.amount}` });
    return json({ ok: true });
  },
  'DELETE /api/subscriptions/:id': async (ctx) => {
    need(ctx, 'subscriptions.edit');
    const s = await ctx.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(ctx.params.id).first();
    if (!s) throw notFound();
    const db = ctx.env.DB;
    const stmts = [db.prepare('DELETE FROM freezes WHERE subscription_id = ?').bind(s.id), db.prepare('UPDATE payments SET subscription_id = NULL WHERE subscription_id = ?').bind(s.id), db.prepare('DELETE FROM subscriptions WHERE id = ?').bind(s.id)];
    if (s.is_current) stmts.push(db.prepare('UPDATE subscriptions SET is_current = 1 WHERE id = (SELECT id FROM subscriptions WHERE client_id = ? AND id != ? ORDER BY start_date DESC LIMIT 1)').bind(s.client_id, s.id));
    await db.batch(stmts);
    await log(ctx, 'حذف اشتراك', { entity: 'subscription', entity_id: s.id, client_id: s.client_id });
    return json({ ok: true });
  },

  // ---------------- Freeze / Unfreeze ----------------
  'POST /api/clients/:id/freeze': async (ctx) => {
    need(ctx, 'subscriptions.freeze');
    const c = await getClient(ctx, ctx.params.id);
    const s = await currentSub(ctx, c.id);
    if (!s) throw bad('لا يوجد اشتراك حالي لهذا العميل');
    if (s.status === 'frozen') throw bad('الاشتراك مجمد بالفعل');
    const b = await readJson(ctx.req);
    const id = newId('f_');
    const start = dateOrNull(b.start_date) || ctx.today;
    const pause = b.pause_work === undefined ? !!ctx.settings.freeze_pause_work : !!b.pause_work;
    const db = ctx.env.DB;
    await db.batch([
      db.prepare('INSERT INTO freezes (id, subscription_id, client_id, start_date, reason, expected_days, notes, pause_work, end_before, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(id, s.id, c.id, start, str(b.reason, 500), intOrNull(b.expected_days), str(b.notes, 2000), pause ? 1 : 0, s.end_date, nowISO()),
      db.prepare("UPDATE subscriptions SET status = 'frozen', updated_at = ? WHERE id = ?").bind(nowISO(), s.id),
      db.prepare("UPDATE clients SET status = 'frozen', updated_at = ? WHERE id = ?").bind(nowISO(), c.id),
    ]);
    await log(ctx, 'تجميد اشتراك', { entity: 'freeze', entity_id: id, client_id: c.id, details: `من ${start}${b.reason ? ' — ' + str(b.reason, 200) : ''}` });
    return json({ id });
  },
  'POST /api/clients/:id/unfreeze': async (ctx) => {
    need(ctx, 'subscriptions.unfreeze');
    const c = await getClient(ctx, ctx.params.id);
    const s = await currentSub(ctx, c.id);
    const fr = await ctx.env.DB.prepare('SELECT * FROM freezes WHERE client_id = ? AND end_date IS NULL ORDER BY start_date DESC').bind(c.id).first();
    if (!s || !fr) throw bad('لا يوجد تجميد مفتوح لهذا العميل');
    const b = await readJson(ctx.req).catch(() => ({}));
    const end = dateOrNull(b?.end_date) || ctx.today;
    if (end < fr.start_date) throw bad('تاريخ فك التجميد قبل تاريخ التجميد');
    const days = diffDays(fr.start_date, end);
    const extend = b?.extend === undefined ? !!ctx.settings.freeze_extend : !!b.extend;
    const open = s.sub_type === 'open';
    const newEnd = extend && !open ? addDays(s.end_date, days) : s.end_date;
    // monthly schedules shift by the frozen days too, so the client is not billed for frozen time
    const shiftDue = extend && (open || s.monthly_amount > 0) && days > 0;
    if (shiftDue) {
      const { defaultFirstDue, computeBilling } = await import('../../public/js/shared.js');
      const paidRow = await ctx.env.DB.prepare("SELECT COALESCE(SUM(amount),0) t FROM payments WHERE subscription_id = ? AND type = 'subscription'").bind(s.id).first();
      const bill = computeBilling(s, paidRow.t, ctx.today);
      const first = s.first_due_date || defaultFirstDue(s);
      const shiftedNext = addDays(bill.next_due || first, days);
      await ctx.env.DB.prepare('UPDATE subscriptions SET first_due_date = ?, pay_day = ? WHERE id = ?').bind(addDays(first, days), Number(shiftedNext.slice(8)), s.id).run();
    }
    const db = ctx.env.DB;
    await db.batch([
      db.prepare('UPDATE freezes SET end_date = ?, actual_days = ?, end_after = ? WHERE id = ?').bind(end, days, newEnd, fr.id),
      db.prepare("UPDATE subscriptions SET status = 'active', end_date = ?, updated_at = ? WHERE id = ?").bind(newEnd, nowISO(), s.id),
      db.prepare("UPDATE clients SET status = 'active', updated_at = ? WHERE id = ?").bind(nowISO(), c.id),
    ]);
    await log(ctx, 'فك تجميد اشتراك', { entity: 'freeze', entity_id: fr.id, client_id: c.id, details: `مدة التجميد ${days} يوم — نهاية الاشتراك ${s.end_date} → ${newEnd}` });
    return json({ days, end_before: s.end_date, end_after: newEnd });
  },

  // ---------------- Payments ----------------
  'GET /api/payments': async (ctx) => {
    need(ctx, 'payments.view');
    const { results } = await ctx.env.DB.prepare('SELECT p.*, c.name AS client_name, c.store_name, c.logo FROM payments p JOIN clients c ON c.id = p.client_id ORDER BY p.date DESC, p.created_at DESC LIMIT 1000').all();
    return json({ items: results });
  },
  'POST /api/clients/:id/payments': async (ctx) => {
    need(ctx, 'payments.create');
    const c = await getClient(ctx, ctx.params.id);
    const b = await readJson(ctx.req);
    const amount = numOrNull(b.amount);
    if (!amount || amount <= 0) throw bad('أدخل مبلغًا صحيحًا');
    const type = oneOf(b.type, Object.keys(PAY_TYPES), 'subscription');
    let subId = str(b.subscription_id, 40);
    if (!subId && type === 'subscription') subId = (await currentSub(ctx, c.id))?.id || null;
    const row = { id: newId('p_'), client_id: c.id, subscription_id: subId, amount, date: dateOrNull(b.date) || ctx.today, method: oneOf(b.method, Object.keys(PAY_METHODS), 'transfer'), period: str(b.period, 100), type, reference: str(b.reference, 100), notes: str(b.notes, 1000), created_at: nowISO() };
    const ins = buildInsert('payments', row);
    await ctx.env.DB.prepare(ins.sql).bind(...ins.args).run();
    await touch(ctx, c.id);
    await log(ctx, 'تسجيل دفعة', { entity: 'payment', entity_id: row.id, client_id: c.id, details: `${amount} — ${PAY_METHODS[row.method]}` });
    return json({ id: row.id });
  },
  'PUT /api/payments/:id': async (ctx) => {
    need(ctx, 'payments.create');
    const p = await ctx.env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(ctx.params.id).first();
    if (!p) throw notFound();
    const b = await readJson(ctx.req);
    const amount = numOrNull(b.amount);
    if (!amount || amount <= 0) throw bad('أدخل مبلغًا صحيحًا');
    const up = buildUpdate('payments', p.id, { amount, date: dateOrNull(b.date) || p.date, method: oneOf(b.method, Object.keys(PAY_METHODS), p.method), period: str(b.period, 100), type: oneOf(b.type, Object.keys(PAY_TYPES), p.type), reference: str(b.reference, 100), notes: str(b.notes, 1000) });
    await ctx.env.DB.prepare(up.sql).bind(...up.args).run();
    await log(ctx, 'تعديل دفعة', { entity: 'payment', entity_id: p.id, client_id: p.client_id, details: `${p.amount} → ${amount}` });
    return json({ ok: true });
  },
  'DELETE /api/payments/:id': async (ctx) => {
    need(ctx, 'payments.create');
    const p = await ctx.env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(ctx.params.id).first();
    if (!p) throw notFound();
    await ctx.env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(p.id).run();
    await log(ctx, 'حذف دفعة', { entity: 'payment', entity_id: p.id, client_id: p.client_id, details: String(p.amount) });
    return json({ ok: true });
  },
};

function stripMoney(c) {
  return { ...c, total_paid_all: null, sub: c.sub ? { ...c.sub, amount: null, paid: null, remaining: null } : null };
}
export { getClient, HttpError };
