// v1.1 features: upcoming payments, trial clients, quick daily checklist, push notifications.
import { HttpError, bad, buildInsert, buildUpdate, dateOrNull, json, jsonArr, newId, notFound, nowISO, numOrNull, intOrNull, oneOf, parseArr, readJson, reqStr, str, url } from '../lib/util.js';
import { log, need, can, userPerms } from '../lib/context.js';
import { loadClientsDerived } from '../lib/derive.js';
import { addDays, diffDays, trialState } from '../lib/shim.js';
import { DEFAULT_QUICK_CHECKLIST, TRIAL_STATUS, PAY_STATUS } from '../../public/js/shared.js';
import { createClient } from './clients.js';
import { vapidKeys, sendPush } from '../lib/push.js';

// ---------------- helpers ----------------
export function checklistItems(settings) {
  const list = Array.isArray(settings.quick_checklist) && settings.quick_checklist.length ? settings.quick_checklist : DEFAULT_QUICK_CHECKLIST;
  return list.filter((x) => x && x.id && x.label);
}
export function entryStatus(entry, items) {
  if (!entry) return 'none';
  if (entry.needs_attention) return 'attention';
  const map = typeof entry.items === 'string' ? JSON.parse(entry.items || '{}') : entry.items || {};
  const core = items.filter((i) => i.core);
  const req = core.length ? core : items;
  if (req.length && req.every((i) => map[i.id])) return 'done';
  return items.some((i) => map[i.id]) ? 'progress' : 'none';
}
function trialFields(b, ctx) {
  const start = dateOrNull(b.start_date) || ctx.today;
  const days = Math.max(1, Math.min(365, intOrNull(b.days) || 3));
  const daily = numOrNull(b.daily_budget);
  return {
    name: reqStr(b.name, 'اسم العميل', 150), store_name: str(b.store_name, 150), phone: str(b.phone, 40), business_type: str(b.business_type, 100),
    platforms: jsonArr(b.platforms), start_date: start, days, end_date: addDays(start, days - 1), daily_budget: daily,
    total_budget: numOrNull(b.total_budget) ?? (daily !== null ? Math.round(daily * days * 100) / 100 : null), actual_spend: numOrNull(b.actual_spend),
    alert_days: Math.max(0, Math.min(30, intOrNull(b.alert_days) ?? 1)), notes: str(b.notes, 5000),
    store_url: url(b.store_url), account_url: url(b.account_url), ads_url: url(b.ads_url),
  };
}
const deriveTrial = (t, today) => ({ ...t, platforms: parseArr(t.platforms), state: trialState(t, today), days_left: diffDays(today, t.end_date), day_no: Math.min(t.days, Math.max(0, diffDays(t.start_date, today) + 1)) });

/** Builds upcoming payment rows from derived clients. */
export function upcomingRows(clients) {
  return clients.filter((c) => c.status !== 'former' && c.status !== 'stopped' && c.billing_model !== 'commission' && c.sub && c.sub.billing && (c.sub.next_due || ['paid', 'frozen'].includes(c.sub.pay_status)))
    .map((c) => ({
      client_id: c.id, name: c.name, store_name: c.store_name, phone: c.phone, logo: c.logo, client_status: c.status,
      subscription_id: c.sub.id, sub_type: c.sub.sub_type, sub_state: c.sub.state, monthly: c.sub.billing.monthly, one_time_amount: c.sub.billing.monthly ? null : c.sub.amount,
      cycle_days: c.sub.billing.cycle_days, amount_unset: c.sub.billing.amount_unset, period_paid: c.sub.billing.period_paid, current_paid: c.sub.billing.current_paid ?? null, amount_due: c.sub.amount_due, owed_now: c.sub.remaining,
      periods_due: c.sub.billing.periods_due, next_due: c.sub.next_due, days_to_due: c.sub.days_to_due, status: c.sub.pay_status, partial: c.sub.partial,
      last_payment: c.last_payment, pay_alert: c.sub.pay_alert, pay_alert_enabled: c.pay_alert_enabled, pay_alert_days: c.pay_alert_days, pay_alert_time: c.pay_alert_time, manual: !!c.sub.billing.manual, days_late: c.sub.billing.days_late || 0,
    }))
    .sort((a, b) => (a.status === 'frozen') - (b.status === 'frozen') || (a.next_due || '9999').localeCompare(b.next_due || '9999'));
}

export const v11Routes = {
  // ---------------- Upcoming payments ----------------
  'GET /api/payments/upcoming': async (ctx) => {
    need(ctx, 'payments.view');
    const rows = upcomingRows(await loadClientsDerived(ctx, "WHERE status != 'former'"));
    return json({ today: ctx.today, items: rows });
  },

  // ---------------- Trials ----------------
  'GET /api/trials': async (ctx) => {
    need(ctx, 'clients.view');
    const { results } = await ctx.env.DB.prepare('SELECT * FROM trials ORDER BY CASE status WHEN \'active\' THEN 0 ELSE 1 END, end_date').all();
    return json({ today: ctx.today, items: results.map((t) => deriveTrial(t, ctx.today)) });
  },
  'GET /api/trials/:id': async (ctx) => {
    need(ctx, 'clients.view');
    const t = await ctx.env.DB.prepare('SELECT * FROM trials WHERE id = ?').bind(ctx.params.id).first();
    if (!t) throw notFound('التجربة غير موجودة');
    const { results: history } = await ctx.env.DB.prepare("SELECT * FROM activity_log WHERE entity = 'trial' AND entity_id = ? ORDER BY created_at DESC").bind(t.id).all();
    return json({ trial: deriveTrial(t, ctx.today), history });
  },
  'POST /api/trials': async (ctx) => {
    need(ctx, 'clients.create');
    const f = trialFields(await readJson(ctx.req), ctx);
    const row = { id: newId('tr_'), ...f, status: 'active', created_at: nowISO(), updated_at: nowISO() };
    const ins = buildInsert('trials', row);
    await ctx.env.DB.prepare(ins.sql).bind(...ins.args).run();
    await log(ctx, 'إضافة عميل تجربة', { entity: 'trial', entity_id: row.id, details: `${row.name} — ${row.days} أيام من ${row.start_date}` });
    return json({ id: row.id });
  },
  'PUT /api/trials/:id': async (ctx) => {
    need(ctx, 'clients.edit');
    const t = await ctx.env.DB.prepare('SELECT * FROM trials WHERE id = ?').bind(ctx.params.id).first();
    if (!t) throw notFound();
    const b = await readJson(ctx.req);
    const f = trialFields({ ...t, platforms: parseArr(t.platforms), total_budget: b.daily_budget !== undefined || b.days !== undefined ? undefined : t.total_budget, ...b }, ctx);
    if (b.status !== undefined && t.status !== 'converted') f.status = oneOf(b.status, ['active', 'no_deal', 'stopped'], t.status);
    const up = buildUpdate('trials', t.id, { ...f, updated_at: nowISO() });
    await ctx.env.DB.prepare(up.sql).bind(...up.args).run();
    await log(ctx, f.status && f.status !== t.status ? `تغيير حالة تجربة: ${TRIAL_STATUS[f.status]}` : 'تعديل عميل تجربة', { entity: 'trial', entity_id: t.id, details: f.name });
    return json({ ok: true });
  },
  'DELETE /api/trials/:id': async (ctx) => {
    need(ctx, 'clients.delete');
    const t = await ctx.env.DB.prepare('SELECT * FROM trials WHERE id = ?').bind(ctx.params.id).first();
    if (!t) throw notFound();
    await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE clients SET trial_id = NULL WHERE trial_id = ?').bind(t.id), ctx.env.DB.prepare('DELETE FROM trials WHERE id = ?').bind(t.id)]);
    await log(ctx, 'حذف عميل تجربة', { entity: 'trial', entity_id: t.id, details: t.name });
    return json({ ok: true });
  },
  // Converts a trial into a real client (+ subscription). Guarded so it can never create a duplicate client.
  'POST /api/trials/:id/convert': async (ctx) => {
    need(ctx, 'clients.create');
    const db = ctx.env.DB;
    const t = await db.prepare('SELECT * FROM trials WHERE id = ?').bind(ctx.params.id).first();
    if (!t) throw notFound();
    if (t.converted_client_id) throw new HttpError(409, 'تم تحويل هذه التجربة إلى عميل مسبقًا', 'already_converted');
    const b = await readJson(ctx.req);
    const claim = await db.prepare("UPDATE trials SET status = 'converting', updated_at = ? WHERE id = ? AND converted_client_id IS NULL AND status != 'converting'").bind(nowISO(), t.id).run();
    if (!claim.meta.changes) throw new HttpError(409, 'التحويل قيد التنفيذ أو تم مسبقًا', 'already_converted');
    try {
      const summary = `بدأ كعميل تجربة: ${t.start_date} → ${t.end_date} (${t.days} أيام)${t.daily_budget ? ` — ميزانية يومية ${t.daily_budget} / إجمالية ${t.total_budget ?? '—'}` : ''}${t.actual_spend ? ` — المصروف الفعلي ${t.actual_spend}` : ''}`;
      const r = await createClient(ctx, {
        name: t.name, store_name: t.store_name, phone: t.phone, business_type: t.business_type, platforms: parseArr(t.platforms),
        store_url: t.store_url, tiktok_url: t.account_url, tiktok_ads_url: t.ads_url, daily_budget: t.daily_budget,
        start_date: dateOrNull(b.work_start_date) || t.start_date, notes: [t.notes, summary].filter(Boolean).join('\n\n'),
        pay_alert_enabled: b.pay_alert_enabled, pay_alert_days: b.pay_alert_days,
        subscription: b.subscription ? { start_date: ctx.today, ...b.subscription, platforms: b.subscription.platforms || parseArr(t.platforms) } : undefined,
      }, ' (تحويل من عملاء التجارب)');
      await db.batch([
        db.prepare('UPDATE clients SET trial_id = ? WHERE id = ?').bind(t.id, r.id),
        db.prepare("UPDATE trials SET status = 'converted', converted_client_id = ?, converted_at = ?, updated_at = ? WHERE id = ?").bind(r.id, nowISO(), nowISO(), t.id),
      ]);
      await log(ctx, 'بدأ كعميل تجربة', { entity: 'trial', entity_id: t.id, client_id: r.id, details: summary });
      await log(ctx, 'تحويل التجربة إلى عميل رسمي', { entity: 'trial', entity_id: t.id, client_id: r.id, details: t.name });
      return json({ client_id: r.id });
    } catch (e) {
      await db.prepare("UPDATE trials SET status = ? WHERE id = ? AND converted_client_id IS NULL").bind(t.status, t.id).run();
      throw e;
    }
  },

  // ---------------- Quick checklist ----------------
  'GET /api/checklist': async (ctx) => {
    need(ctx, 'followups.manage');
    const date = dateOrNull(ctx.url.searchParams.get('date')) || ctx.today;
    const db = ctx.env.DB;
    const pause = !!ctx.settings.freeze_pause_work;
    const { results: entries } = await db.prepare('SELECT * FROM checklist_entries WHERE date = ?').bind(date).all();
    const ids = entries.map((e) => e.client_id);
    const statuses = pause ? "('active')" : "('active','frozen')";
    const { results: clients } = await db.prepare(`SELECT id, name, store_name, logo, category_ids, status, platforms FROM clients WHERE status IN ${statuses} ${ids.length ? `OR id IN (${ids.map(() => '?').join(',')})` : ''} ORDER BY name`).bind(...ids).all();
    const items = checklistItems(ctx.settings);
    const byClient = Object.fromEntries(entries.map((e) => [e.client_id, { ...e, items: JSON.parse(e.items || '{}') }]));
    return json({
      date, today: ctx.today, editable: date <= ctx.today, items,
      clients: clients.map((c) => ({ ...c, category_ids: parseArr(c.category_ids), platforms: parseArr(c.platforms), entry: byClient[c.id] || null, check_status: entryStatus(byClient[c.id], items) })),
    });
  },
  'PUT /api/checklist/:date/:client': async (ctx) => {
    need(ctx, 'followups.manage');
    const date = dateOrNull(ctx.params.date);
    if (!date) throw bad('تاريخ غير صحيح');
    if (date > ctx.today) throw bad('لا يمكن تسجيل متابعة لتاريخ مستقبلي');
    const c = await ctx.env.DB.prepare('SELECT id, name FROM clients WHERE id = ?').bind(ctx.params.client).first();
    if (!c) throw notFound('العميل غير موجود');
    const b = await readJson(ctx.req);
    const items = checklistItems(ctx.settings);
    const valid = new Set(items.map((i) => i.id));
    const prev = await ctx.env.DB.prepare('SELECT * FROM checklist_entries WHERE date = ? AND client_id = ?').bind(date, c.id).first();
    const map = Object.fromEntries(Object.entries(b.items && typeof b.items === 'object' ? b.items : {}).filter(([k, v]) => valid.has(k) && v === true));
    const entry = { items: JSON.stringify(map), needs_attention: b.needs_attention ? 1 : 0, note: str(b.note, 1000) };
    await ctx.env.DB.prepare(`INSERT INTO checklist_entries (id, date, client_id, items, needs_attention, note, user_id, updated_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(date, client_id) DO UPDATE SET items = excluded.items, needs_attention = excluded.needs_attention, note = excluded.note, user_id = excluded.user_id, updated_at = excluded.updated_at`)
      .bind(newId('ck_'), date, c.id, entry.items, entry.needs_attention, entry.note, ctx.user.id, nowISO()).run();
    const before = entryStatus(prev, items), after = entryStatus(entry, items);
    if (before !== after && (after === 'done' || after === 'attention')) {
      await log(ctx, after === 'done' ? 'اكتمال المتابعة السريعة' : 'المتابعة السريعة: يحتاج تدخل', { entity: 'checklist', entity_id: c.id, client_id: c.id, details: `${c.name} — ${date}` });
    }
    return json({ ok: true, check_status: after });
  },
  'GET /api/checklist/history': async (ctx) => {
    need(ctx, 'followups.manage');
    const days = Math.min(120, intOrNull(ctx.url.searchParams.get('days')) || 30);
    const from = addDays(ctx.today, -(days - 1));
    const { results } = await ctx.env.DB.prepare('SELECT date, items, needs_attention FROM checklist_entries WHERE date >= ? ORDER BY date DESC').bind(from).all();
    const items = checklistItems(ctx.settings);
    const by = {};
    for (const e of results) { const d = (by[e.date] ||= { date: e.date, entries: 0, done: 0, attention: 0, progress: 0 }); d.entries++; const s = entryStatus(e, items); if (s === 'done') d.done++; else if (s === 'attention') d.attention++; else if (s === 'progress') d.progress++; }
    return json({ days: Object.values(by) });
  },

  // ---------------- Push notifications ----------------
  'GET /api/push/key': async (ctx) => json({ publicKey: (await vapidKeys(ctx.env)).publicKey }),
  'POST /api/push/subscribe': async (ctx) => {
    const b = await readJson(ctx.req);
    const s = b.subscription || {};
    if (!s.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw bad('اشتراك إشعارات غير صالح');
    await ctx.env.DB.prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, label, created_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .bind(newId('ps_'), ctx.user.id, String(s.endpoint).slice(0, 1000), String(s.keys.p256dh).slice(0, 200), String(s.keys.auth).slice(0, 100), str(b.label, 60), nowISO()).run();
    await log(ctx, 'تفعيل إشعارات الجوال', { entity: 'user', entity_id: ctx.user.id, details: str(b.label, 60) });
    return json({ ok: true });
  },
  'POST /api/push/unsubscribe': async (ctx) => {
    const b = await readJson(ctx.req);
    await ctx.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(String(b.endpoint || ''), ctx.user.id).run();
    return json({ ok: true });
  },
  'GET /api/push/status': async (ctx) => {
    const r = await ctx.env.DB.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?').bind(ctx.user.id).first();
    return json({ devices: r.n });
  },
  'POST /api/push/test': async (ctx) => {
    const { results } = await ctx.env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').bind(ctx.user.id).all();
    if (!results.length) throw bad('لم يتم تفعيل الإشعارات على أي جهاز بعد');
    const out = [];
    for (const s of results) out.push(await sendPush(ctx.env, s, { title: 'Media Buyer Control Center', body: 'إشعار تجريبي — الإشعارات تعمل على هذا الجهاز ✅', url: '/#/' }, ctx.url.origin).catch((e) => 'error:' + e.message));
    return json({ results: out });
  },
  'GET /api/push/preview': async (ctx) => json({ lines: await dailyDigestLines(ctx, ctx.perms) }),
  // Owner tools for alerts: preview (dry run) or run now for a given instant.
  'POST /api/alerts/run': async (ctx) => {
    if (ctx.user.role !== 'owner') throw new HttpError(403, 'للمالك فقط');
    const b = await readJson(ctx.req);
    ctx.origin = ctx.url.origin;
    const at = b.at ? new Date(b.at) : new Date();
    if (Number.isNaN(at.getTime())) throw bad('وقت غير صالح');
    return json(await runAlerts(ctx, { at, dry: !!b.dry }));
  },
};

/** Lines of the daily summary for a user with the given permissions. */
export async function dailyDigestLines(ctx, perms) {
  const lines = [];
  const clients = await loadClientsDerived(ctx, "WHERE status != 'former'");
  if (perms.has('payments.view')) {
    const rows = upcomingRows(clients);
    const alerts = rows.filter((r) => r.pay_alert);
    const late = rows.filter((r) => r.status === 'late');
    for (const r of alerts.slice(0, 6)) lines.push(`💳 ${r.name}: ${r.days_to_due > 0 ? `دفعة بعد ${r.days_to_due} يوم` : r.days_to_due === 0 ? 'دفعة مستحقة اليوم' : `دفعة متأخرة ${-r.days_to_due} يوم`} (${r.amount_due})`);
    const lateOnly = late.filter((r) => !r.pay_alert);
    if (lateOnly.length) lines.push(`⏰ ${lateOnly.length} دفعات متأخرة أخرى`);
  }
  if (perms.has('clients.view')) {
    const { results } = await ctx.env.DB.prepare("SELECT * FROM trials WHERE status = 'active'").all();
    for (const t of results) {
      const st = trialState(t, ctx.today);
      if (st === 'ending') lines.push(`🧪 تجربة ${t.name} تنتهي ${t.end_date === ctx.today ? 'اليوم' : `خلال ${diffDays(ctx.today, t.end_date)} يوم`}`);
      if (st === 'ended') lines.push(`🧪 انتهت تجربة ${t.name} — حوّلها لعميل أو حدّث حالتها`);
    }
  }
  if (perms.has('tasks.manage')) {
    const r = await ctx.env.DB.prepare("SELECT COUNT(*) n FROM tasks WHERE due_date <= ? AND status NOT IN ('done','cancelled')").bind(ctx.today).first();
    if (r.n) lines.push(`✅ ${r.n} مهام لليوم/متأخرة`);
  }
  return lines;
}

/** Local date + hour in the app time zone for an instant. */
export function localClock(tz, at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/**
 * Payment alert events for one client on a given local date:
 * before (N days ahead), due (the day itself), late (day 1 after, then every K days until paid).
 */
export function paymentAlertEvents(row, date, settings) {
  if (!row.pay_alert_enabled || !row.next_due || row.status === 'frozen') return [];
  const ev = [], d = diffDays(date, row.next_due);
  const amt = row.amount_due ? ` بمبلغ ${row.amount_due} ريال` : '';
  if (row.pay_alert_days > 0 && d === row.pay_alert_days) ev.push({ kind: 'before', title: `دفعة قادمة: ${row.name}`, body: `موعد دفعة ${row.name} بعد ${d} ${d === 1 ? 'يوم' : 'أيام'} (${row.next_due})${amt}` });
  if (d === 0) ev.push({ kind: 'due', title: `دفعة مستحقة اليوم: ${row.name}`, body: `اليوم موعد دفعة ${row.name}${amt}` });
  const every = Math.max(1, Number(settings.late_reminder_every_days) || 2);
  if (d < 0 && (-d - 1) % every === 0) ev.push({ kind: 'late', title: `دفعة متأخرة: ${row.name}`, body: `${row.name} متأخر ${-d} ${-d === 1 ? 'يوم' : 'أيام'} عن موعد ${row.next_due}${amt} — لم تُسجَّل الدفعة بعد` });
  return ev.map((e) => ({ ...e, client_id: row.client_id, due: row.next_due, time: row.pay_alert_time || settings.default_alert_time || '09:00', key: `pay|${row.client_id}|${row.next_due}|${e.kind}|${date}` }));
}

/**
 * Hourly cron: sends payment alerts at each client's alert time and one daily digest (trials, tasks) at the
 * default time. Every notification is recorded in alert_log first, so it is never sent twice.
 * `at` / `dry` are used by tests and the preview endpoint.
 */
export async function runAlerts(ctx, { at = new Date(), dry = false } = {}) {
  const s = ctx.settings, clock = localClock(s.timezone, at);
  const hourOf = (t) => Number(String(t || '09:00').slice(0, 2));
  const savedToday = ctx.today; ctx.today = clock.date;
  const rows = upcomingRows(await loadClientsDerived(ctx, "WHERE status != 'former'"));
  ctx.today = savedToday;
  const payEvents = rows.flatMap((r) => paymentAlertEvents(r, clock.date, s)).filter((e) => hourOf(e.time) === clock.hour);
  const { results: subs } = await ctx.env.DB.prepare('SELECT p.*, u.role, u.permissions, u.active FROM push_subscriptions p JOIN users u ON u.id = p.user_id').all();
  const byUser = {};
  for (const sb of subs) if (sb.active) (byUser[sb.user_id] ||= { user: sb, subs: [] }).subs.push(sb);
  const out = { date: clock.date, hour: clock.hour, sent: [], skipped_duplicates: 0 };
  const claim = async (key) => {
    if (dry) return !(await ctx.env.DB.prepare('SELECT 1 FROM alert_log WHERE key = ?').bind(key).first());
    const r = await ctx.env.DB.prepare('INSERT OR IGNORE INTO alert_log (key, sent_at) VALUES (?, ?)').bind(key, new Date().toISOString()).run();
    return r.meta.changes === 1;
  };
  for (const e of payEvents) {
    if (!(await claim(e.key))) { out.skipped_duplicates++; continue; }
    out.sent.push({ kind: e.kind, client_id: e.client_id, due: e.due, title: e.title });
    if (dry) continue;
    for (const { user, subs: list } of Object.values(byUser)) {
      if (!userPerms(user).has('payments.view')) continue;
      for (const sb of list) await sendPush(ctx.env, sb, { title: e.title, body: e.body, url: `/#/clients/${e.client_id}?tab=payments`, tag: `pay-${e.client_id}` }, ctx.origin).catch(() => 'error');
    }
  }
  if (hourOf(s.default_alert_time) === clock.hour) {
    for (const { user, subs: list } of Object.values(byUser)) {
      const perms = userPerms(user);
      const lines = (await dailyDigestLines(ctx, perms)).filter((l) => !l.startsWith('💳'));
      if (!lines.length || !(await claim(`digest|${user.user_id}|${clock.date}`))) continue;
      out.sent.push({ kind: 'digest', user_id: user.user_id });
      if (!dry) for (const sb of list) await sendPush(ctx.env, sb, { title: `ملخص اليوم (${lines.length})`, body: lines.slice(0, 6).join('\n'), url: '/#/', tag: 'mbcc-digest' }, ctx.origin).catch(() => 'error');
    }
  }
  if (!dry) await ctx.env.DB.prepare('DELETE FROM alert_log WHERE sent_at < ?').bind(new Date(Date.now() - 120 * 864e5).toISOString()).run();
  return out;
}
export const runDailyNotifications = (ctx) => runAlerts(ctx).then((r) => r.sent.length);

export { PAY_STATUS };
