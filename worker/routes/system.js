import { HttpError, bad, dateOrNull, json, newId, nowISO, parseArr, readJson, reqStr, str } from '../lib/util.js';
import { log, need, can, SETTINGS_DEFAULTS } from '../lib/context.js';
import { loadClientsDerived } from '../lib/derive.js';
import { addDays, addMonths, diffDays, computeMetrics } from '../lib/shim.js';
import { encryptWithPassphrase, decryptWithPassphrase, encryptVault, decryptVault, vaultAvailable, sha256hex } from '../lib/crypto.js';
import { TASK_PRIORITY } from '../../public/js/shared.js';
import { upcomingRows, checklistItems, entryStatus } from './v11.js';
import { trialState } from '../lib/shim.js';

const monthStart = (d) => d.slice(0, 8) + '01';

function rangeBounds(ctx) {
  const p = ctx.url.searchParams, t = ctx.today;
  const r = p.get('range') || '6m';
  let from, to = t;
  switch (r) {
    case 'today': from = t; break;
    case 'week': from = addDays(t, -6); break;
    case 'month': from = monthStart(t); break;
    case '3m': from = monthStart(addMonths(t, -2)); break;
    case 'year': from = monthStart(addMonths(t, -11)); break;
    case 'custom': from = dateOrNull(p.get('from')) || addDays(t, -29); to = dateOrNull(p.get('to')) || t; break;
    default: from = monthStart(addMonths(t, -5));
  }
  if (to < from) [from, to] = [to, from];
  const days = diffDays(from, to) + 1;
  return { from, to, unit: days <= 45 ? 'day' : 'month', range: r };
}
function buckets(from, to, unit) {
  const out = [];
  if (unit === 'day') for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  else for (let d = monthStart(from); d <= to; d = addMonths(d, 1)) out.push(d.slice(0, 7));
  return out;
}

const EXPORT_TABLES = ['settings', 'categories', 'trials', 'clients', 'subscriptions', 'freezes', 'payments', 'campaigns', 'campaign_snapshots', 'followups', 'tasks', 'reports', 'service_templates', 'quotes', 'checklist_entries', 'quick_checks', 'activity_log'];
const DEMO_TABLES = ['quick_checks', 'checklist_entries', 'vault_entries', 'campaign_snapshots', 'freezes', 'payments', 'followups', 'tasks', 'reports', 'quotes', 'campaigns', 'subscriptions', 'clients', 'service_templates', 'trials'];

async function tableColumns(db, t) {
  const { results } = await db.prepare(`PRAGMA table_info(${t})`).all();
  return results.map((r) => r.name);
}

export const systemRoutes = {
  // ---------------- Dashboard ----------------
  'GET /api/dashboard': async (ctx) => {
    need(ctx, 'clients.view');
    const db = ctx.env.DB, t = ctx.today, money = can(ctx, 'payments.view');
    const all = await loadClientsDerived(ctx);
    const cur = all.filter((c) => c.status !== 'former');
    const subs = cur.map((c) => c.sub).filter(Boolean);
    const ms = monthStart(t);
    const one = async (sql, ...a) => (await db.prepare(sql).bind(...a).first()) || {};
    const collected = money ? (await one('SELECT COALESCE(SUM(amount),0) v FROM payments WHERE date >= ? AND date <= ?', ms, t)).v : null;
    const billed = money ? (await one('SELECT COALESCE(SUM(amount),0) v FROM subscriptions WHERE start_date >= ? AND start_date <= ?', ms, t)).v : null;
    const tasksToday = (await one("SELECT COUNT(*) n FROM tasks WHERE due_date = ? AND status NOT IN ('done','cancelled')", t)).n;
    const tasksLate = (await one("SELECT COUNT(*) n FROM tasks WHERE due_date < ? AND status NOT IN ('done','cancelled')", t)).n;
    const campAttn = (await one("SELECT COUNT(*) n FROM campaigns k JOIN clients c ON c.id = k.client_id WHERE c.status != 'former' AND k.status IN ('optimize','rejected')")).n;
    const acctReview = (await one(`SELECT COUNT(DISTINCT c.id) n FROM clients c WHERE c.status != 'former' AND (
        EXISTS (SELECT 1 FROM campaigns k WHERE k.client_id = c.id AND k.status = 'rejected') OR
        (SELECT rating FROM followups f WHERE f.client_id = c.id ORDER BY date DESC, created_at DESC LIMIT 1) IN ('problem','urgent'))`)).n;
    const q = await db.prepare("SELECT status, COUNT(*) n FROM quotes GROUP BY status").all();
    const qs = Object.fromEntries(q.results.map((r) => [r.status, r.n]));
    const stats = {
      clients_total: cur.length,
      clients_active: cur.filter((c) => c.status === 'active').length,
      clients_stopped: cur.filter((c) => c.status === 'stopped').length,
      clients_frozen: cur.filter((c) => c.status === 'frozen').length,
      clients_former: all.length - cur.length,
      subs_expiring: subs.filter((s) => s.state === 'expiring').length,
      subs_expired: subs.filter((s) => s.state === 'expired').length,
      clients_unpaid: money ? cur.filter((c) => c.sub && c.sub.remaining > 0.009 && c.sub.pay_status !== 'due').length : null,
      due_total: money ? subs.reduce((s, x) => s + (x.remaining || 0), 0) : null,
      collected_month: collected, revenue_month: billed,
      tasks_today: tasksToday, tasks_late: tasksLate, campaigns_attention: campAttn, accounts_review: acctReview,
      quotes_sent: (qs.sent || 0) + (qs.review || 0) + (qs.accepted || 0) + (qs.rejected || 0), quotes_accepted: qs.accepted || 0, quotes_pending: (qs.sent || 0) + (qs.review || 0),
    };

    // v1.1 summaries: upcoming payments, trials, quick checklist
    const up = money ? upcomingRows(all) : [];
    stats.payments_upcoming = money ? up.filter((r) => r.next_due && r.days_to_due >= 0 && r.days_to_due <= 7 && r.status !== 'paid').length : null;
    stats.payments_late = money ? up.filter((r) => r.status === 'late').length : null;
    stats.payment_alerts = money ? up.filter((r) => r.pay_alert).length : null;
    const { results: trialRows } = await db.prepare("SELECT * FROM trials WHERE status IN ('active','converting')").all();
    const trialStates = trialRows.map((x) => ({ ...x, st: trialState(x, t) }));
    const qcToday = (await one('SELECT COUNT(*) n FROM quick_checks q JOIN clients c ON c.id = q.client_id WHERE q.date = ? AND c.status != \'former\'', t)).n;
    stats.quick_checked = qcToday; stats.quick_unchecked = Math.max(cur.length - qcToday, 0);
    stats.trials_active = trialStates.filter((x) => x.st === 'active' || x.st === 'ending').length;
    stats.trials_ending = trialStates.filter((x) => x.st === 'ending').length;
    stats.trials_ended = trialStates.filter((x) => x.st === 'ended').length;
    if (can(ctx, 'followups.manage')) {
      const items = checklistItems(ctx.settings);
      const pauseCk = !!ctx.settings.freeze_pause_work;
      const ckClients = cur.filter((c) => c.status === 'active' || (!pauseCk && c.status === 'frozen'));
      const { results: ck } = await db.prepare('SELECT * FROM checklist_entries WHERE date = ?').bind(t).all();
      const ckBy = Object.fromEntries(ck.map((e) => [e.client_id, entryStatus(e, items)]));
      stats.checklist_total = ckClients.length;
      stats.checklist_done = ckClients.filter((c) => ckBy[c.id] === 'done').length;
      stats.checklist_attention = ckClients.filter((c) => ckBy[c.id] === 'attention').length;
      stats.checklist_pending = ckClients.filter((c) => !ckBy[c.id] || ckBy[c.id] === 'none').length;
    }

    // Alerts
    const alerts = [];
    for (const r of up) if (r.pay_alert) alerts.push({ type: 'pay_alert', level: r.status === 'late' ? 'danger' : 'warn', client_id: r.client_id, link: '#/payments/upcoming',
      text: `💳 ${r.name}: ${r.days_to_due > 0 ? `دفعة ${Math.round(r.amount_due)} بعد ${r.days_to_due} يوم (${r.next_due})` : r.days_to_due === 0 ? `دفعة ${Math.round(r.amount_due)} مستحقة اليوم` : `دفعة متأخرة منذ ${-r.days_to_due} يوم`}` });
    for (const x of trialStates) {
      if (x.st === 'ending') alerts.push({ type: 'trial_ending', level: 'warn', link: `#/trials/${x.id}`, text: `🧪 تجربة ${x.name} تنتهي ${x.end_date === t ? 'اليوم' : x.end_date}` });
      if (x.st === 'ended') alerts.push({ type: 'trial_ended', level: 'info', link: `#/trials/${x.id}`, text: `🧪 انتهت تجربة ${x.name} — حوّلها إلى عميل أو حدّث حالتها` });
    }
    for (const c of cur) {
      const s = c.sub;
      if (s && !s.open && s.state === 'expiring' && s.days_left <= 3) alerts.push({ type: 'expiring3', level: 'warn', client_id: c.id, text: `اشتراك ${c.name} ينتهي خلال ${s.days_left} يوم` });
      else if (s && !s.open && s.state === 'expiring') alerts.push({ type: 'renewal', level: 'info', client_id: c.id, text: `موعد تجديد ${c.name} قريب (${s.end_date})` });
      if (s && s.state === 'expired') alerts.push({ type: 'expired', level: 'danger', client_id: c.id, text: `اشتراك ${c.name} منتهي منذ ${-s.days_left} يوم` });
      if (money && s && s.pay_status === 'late' && !s.pay_alert) alerts.push({ type: 'late', level: 'danger', client_id: c.id, text: `${c.name} متأخر في الدفع — المتبقي ${Math.round(s.remaining)}` });
      if (c.status === 'frozen') alerts.push({ type: 'frozen', level: 'info', client_id: c.id, text: `اشتراك ${c.name} مجمد` });
      if (c.next_contact_date && c.next_contact_date <= t) alerts.push({ type: 'contact', level: 'warn', client_id: c.id, text: `${c.name} يحتاج تواصل (${c.next_contact_date})` });
    }
    if (can(ctx, 'campaigns.view')) {
      const { results: ks } = await db.prepare("SELECT k.id, k.name, k.status, k.client_id, c.name cn FROM campaigns k JOIN clients c ON c.id = k.client_id WHERE c.status IN ('active') AND k.status IN ('optimize','rejected','stopped')").all();
      for (const k of ks) alerts.push({ type: 'campaign_' + k.status, level: k.status === 'rejected' ? 'danger' : 'warn', client_id: k.client_id, campaign_id: k.id,
        text: k.status === 'rejected' ? `حملة/حساب مرفوض: ${k.name} (${k.cn})` : k.status === 'stopped' ? `حملة متوقفة: ${k.name} (${k.cn})` : `حملة لا تحقق النتائج: ${k.name} (${k.cn})` });
    }
    if (tasksLate) alerts.push({ type: 'tasks_late', level: 'danger', text: `لديك ${tasksLate} مهمة متأخرة`, link: '#/tasks?view=late' });
    const order = { danger: 0, warn: 1, info: 2 };
    alerts.sort((a, b) => order[a.level] - order[b.level]);

    // Today's work: follow-up queue + tasks due today
    const pause = !!ctx.settings.freeze_pause_work;
    const lastFu = Object.fromEntries((await db.prepare('SELECT client_id, MAX(date) d FROM followups GROUP BY client_id').all()).results.map((r) => [r.client_id, r.d]));
    const review = cur.filter((c) => c.status === 'active' || (!pause && c.status === 'frozen'))
      .filter((c) => !lastFu[c.id] || addDays(lastFu[c.id], c.followup_every || 1) <= t)
      .map((c) => ({ id: c.id, name: c.name, store_name: c.store_name, logo: c.logo, platforms: c.platforms, campaigns: c.campaigns_active }));
    const { results: tasks } = await db.prepare("SELECT t.id, t.title, t.priority, t.due_date, t.client_id, c.name client_name FROM tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.due_date <= ? AND t.status NOT IN ('done','cancelled') ORDER BY t.due_date, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 30").bind(t).all();
    const followedToday = (await one('SELECT COUNT(DISTINCT client_id) n FROM followups WHERE date = ?', t)).n;
    const upcoming = up.filter((r) => r.next_due && r.status !== 'frozen').slice(0, 8).map((r) => ({ client_id: r.client_id, name: r.name, next_due: r.next_due, days_to_due: r.days_to_due, amount_due: r.status === 'late' ? r.owed_now || r.amount_due : r.amount_due, status: r.status }));
    return json({ today: t, stats, alerts: alerts.slice(0, 60), review, tasks, followed_today: followedToday, upcoming });
  },

  'GET /api/dashboard/charts': async (ctx) => {
    need(ctx, 'clients.view');
    const db = ctx.env.DB;
    const { from, to, unit, range } = rangeBounds(ctx);
    const labels = buckets(from, to, unit);
    const key = unit === 'day' ? 'substr(%s,1,10)' : 'substr(%s,1,7)';
    const k = (col) => key.replace('%s', col);
    const series = async (sql, ...a) => { const m = {}; for (const r of (await db.prepare(sql).bind(...a).all()).results) m[r.b] = r.v; return labels.map((l) => m[l] || 0); };
    const out = { from, to, unit, range, labels };
    if (can(ctx, 'payments.view')) {
      out.collected = await series(`SELECT ${k('date')} b, SUM(amount) v FROM payments WHERE date BETWEEN ? AND ? GROUP BY b`, from, to);
      out.billed = await series(`SELECT ${k('start_date')} b, SUM(amount) v FROM subscriptions WHERE start_date BETWEEN ? AND ? GROUP BY b`, from, to);
      let cum = 0; out.outstanding = labels.map((_, i) => (cum += out.billed[i] - out.collected[i], Math.max(cum, 0)));
    }
    out.new_clients = await series(`SELECT ${k('COALESCE(start_date, created_at)')} b, COUNT(*) v FROM clients WHERE COALESCE(start_date, substr(created_at,1,10)) BETWEEN ? AND ? GROUP BY b`, from, to);
    out.stopped_clients = await series(`SELECT ${k('created_at')} b, COUNT(DISTINCT client_id) v FROM activity_log WHERE action IN ('إيقاف العميل','نقل العميل إلى الأرشيف') AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY b`, from, to);
    if (can(ctx, 'campaigns.view')) {
      out.spend = await series(`SELECT ${k('date')} b, SUM(spend) v FROM campaign_snapshots WHERE date BETWEEN ? AND ? GROUP BY b`, from, to);
      out.sales = await series(`SELECT ${k('date')} b, SUM(sales) v FROM campaign_snapshots WHERE date BETWEEN ? AND ? GROUP BY b`, from, to);
      out.roas = labels.map((_, i) => (out.spend[i] > 0 ? Math.round((out.sales[i] / out.spend[i]) * 100) / 100 : null));
      const { results: top } = await db.prepare("SELECT k.name, k.platform, k.spend, k.sales, k.orders, k.clicks, k.impressions, c.name cn FROM campaigns k JOIN clients c ON c.id = k.client_id WHERE k.spend > 0 AND k.status NOT IN ('ended') ORDER BY k.spend DESC LIMIT 8").all();
      out.campaigns = top.map((x) => ({ name: x.name, client: x.cn, platform: x.platform, spend: x.spend, sales: x.sales, roas: computeMetrics(x).roas }));
      const tot = await db.prepare('SELECT SUM(spend) spend, SUM(sales) sales, SUM(orders) orders FROM campaign_snapshots WHERE date BETWEEN ? AND ?').bind(from, to).first();
      out.totals = { ...tot, roas: computeMetrics(tot).roas };
    }
    // previous-period comparison
    const len = diffDays(from, to) + 1, pFrom = addDays(from, -len), pTo = addDays(from, -1);
    if (can(ctx, 'payments.view')) {
      const a = await db.prepare('SELECT COALESCE(SUM(amount),0) v FROM payments WHERE date BETWEEN ? AND ?').bind(from, to).first();
      const b = await db.prepare('SELECT COALESCE(SUM(amount),0) v FROM payments WHERE date BETWEEN ? AND ?').bind(pFrom, pTo).first();
      out.compare = { current: a.v, previous: b.v, prev_from: pFrom, prev_to: pTo };
    }
    return json(out);
  },

  // ---------------- Calendar ----------------
  'GET /api/calendar': async (ctx) => {
    need(ctx, 'clients.view');
    const p = ctx.url.searchParams;
    const from = dateOrNull(p.get('from')) || monthStart(ctx.today), to = dateOrNull(p.get('to')) || addDays(addMonths(from, 1), -1);
    const db = ctx.env.DB, ev = [];
    const rows = async (sql, ...a) => (await db.prepare(sql).bind(...a).all()).results;
    for (const s of await rows("SELECT s.*, c.name cn FROM subscriptions s JOIN clients c ON c.id = s.client_id WHERE s.is_current = 1 AND c.status != 'former' AND ((s.end_date BETWEEN ?1 AND ?2) OR (s.start_date BETWEEN ?1 AND ?2))", from, to)) {
      if (s.sub_type !== 'open' && s.end_date >= from && s.end_date <= to) ev.push({ date: s.end_date, type: 'renewal', title: `تجديد اشتراك: ${s.cn}`, client_id: s.client_id });
      if (s.start_date >= from && s.start_date <= to) ev.push({ date: s.start_date, type: 'subscription', title: `بداية اشتراك: ${s.cn}`, client_id: s.client_id });
    }
    if (can(ctx, 'payments.view')) {
      const { dueAt } = await import('../../public/js/shared.js');
      for (const c of await loadClientsDerived(ctx, "WHERE status NOT IN ('former','stopped')")) {
        const b = c.sub?.billing; if (!b || !b.next_due) continue;
        if (b.monthly || b.amount_unset) {
          for (let k = b.next_index, n = 0; n < 24; k++, n++) {
            const d = dueAt(b.first_due, b.pay_day, b.cycle_days, k);
            if (d > to || (c.sub.sub_type !== 'open' && d > c.sub.end_date)) break;
            if (d >= from) ev.push({ date: d, type: 'payment', title: `موعد دفع: ${c.name}${b.monthly ? ` (${b.monthly})` : ''}`, client_id: c.id, done: false });
          }
        }
        else if (b.next_due >= from && b.next_due <= to) ev.push({ date: b.next_due, type: 'payment', title: `موعد دفع: ${c.name}`, client_id: c.id });
      }
    }
    for (const x of await rows("SELECT id, name, end_date, start_date FROM trials WHERE status = 'active' AND end_date BETWEEN ? AND ?", from, to))
      ev.push({ date: x.end_date, type: 'trial', title: `نهاية تجربة: ${x.name}`, trial_id: x.id });
    if (can(ctx, 'tasks.manage')) for (const t of await rows("SELECT t.*, c.name cn FROM tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.due_date BETWEEN ? AND ? AND t.status != 'cancelled'", from, to))
      ev.push({ date: t.due_date, type: 'task', title: t.title + (t.cn ? ` — ${t.cn}` : ''), done: t.status === 'done', priority: t.priority, task_id: t.id, client_id: t.client_id });
    for (const f of await rows('SELECT f.date, f.client_id, f.rating, c.name cn FROM followups f JOIN clients c ON c.id = f.client_id WHERE f.date BETWEEN ? AND ?', from, to))
      ev.push({ date: f.date, type: 'followup', title: `متابعة: ${f.cn}`, client_id: f.client_id, done: true });
    if (can(ctx, 'quotes.view')) for (const q of await rows("SELECT id, number, client_name, valid_until FROM quotes WHERE valid_until BETWEEN ? AND ? AND status IN ('draft','sent','review')", from, to))
      ev.push({ date: q.valid_until, type: 'quote', title: `انتهاء عرض ${q.number}: ${q.client_name}`, quote_id: q.id });
    for (const c of await rows("SELECT id, name, next_contact_date FROM clients WHERE next_contact_date BETWEEN ? AND ? AND status != 'former'", from, to))
      ev.push({ date: c.next_contact_date, type: 'contact', title: `تواصل مع ${c.name}`, client_id: c.id });
    // upcoming follow-ups (scheduled by frequency) within range from today
    const { results: fq } = await db.prepare("SELECT c.id, c.name, c.followup_every, (SELECT MAX(date) FROM followups f WHERE f.client_id = c.id) last FROM clients c WHERE c.status = 'active'").all();
    for (const c of fq) {
      let d = c.last ? addDays(c.last, c.followup_every || 1) : ctx.today;
      if (d < ctx.today) d = ctx.today;
      let guard = 0;
      while (d <= to && guard++ < 62) { if (d >= from) ev.push({ date: d, type: 'followup_due', title: `مراجعة: ${c.name}`, client_id: c.id }); d = addDays(d, c.followup_every || 1); }
    }
    ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return json({ from, to, events: ev });
  },

  // ---------------- Search ----------------
  'GET /api/search': async (ctx) => {
    const qraw = String(ctx.url.searchParams.get('q') || '').trim().slice(0, 100);
    if (qraw.length < 1) return json({ results: [] });
    const like = `%${qraw.replace(/[%_]/g, '')}%`;
    const db = ctx.env.DB, res = [];
    const rows = async (sql, ...a) => (await db.prepare(sql).bind(...a).all()).results;
    if (can(ctx, 'clients.view')) for (const c of await rows('SELECT id, name, store_name, phone, business_type, status, logo FROM clients WHERE name LIKE ?1 OR store_name LIKE ?1 OR phone LIKE ?1 OR email LIKE ?1 OR business_type LIKE ?1 OR platforms LIKE ?1 OR tags LIKE ?1 OR notes LIKE ?1 LIMIT 20', like))
      res.push({ type: 'client', id: c.id, title: c.name, sub: [c.store_name, c.phone, c.business_type].filter(Boolean).join(' • '), logo: c.logo, link: `#/clients/${c.id}` });
    if (can(ctx, 'campaigns.view')) for (const k of await rows('SELECT k.id, k.name, k.platform, k.status, c.name cn FROM campaigns k JOIN clients c ON c.id = k.client_id WHERE k.name LIKE ?1 OR k.platform LIKE ?1 OR k.objective LIKE ?1 OR c.name LIKE ?1 LIMIT 15', like))
      res.push({ type: 'campaign', id: k.id, title: k.name, sub: `${k.platform} • ${k.cn}`, link: `#/campaigns/${k.id}` });
    if (can(ctx, 'tasks.manage')) for (const t of await rows('SELECT t.id, t.title, t.due_date, c.name cn FROM tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.title LIKE ?1 OR t.details LIKE ?1 OR c.name LIKE ?1 LIMIT 15', like))
      res.push({ type: 'task', id: t.id, title: t.title, sub: [t.cn, t.due_date].filter(Boolean).join(' • '), link: `#/tasks?open=${t.id}` });
    if (can(ctx, 'reports.view') || can(ctx, 'reports.create')) for (const r of await rows('SELECT r.id, r.platform, r.period_from, r.period_to, c.name cn FROM reports r JOIN clients c ON c.id = r.client_id WHERE c.name LIKE ?1 OR r.platform LIKE ?1 OR r.summary LIKE ?1 LIMIT 15', like))
      res.push({ type: 'report', id: r.id, title: `تقرير ${r.cn}`, sub: `${r.platform} • ${r.period_from} → ${r.period_to}`, link: `#/reports/${r.id}` });
    if (can(ctx, 'clients.view')) for (const x of await rows('SELECT id, name, store_name, phone, status FROM trials WHERE name LIKE ?1 OR store_name LIKE ?1 OR phone LIKE ?1 OR business_type LIKE ?1 LIMIT 10', like))
      res.push({ type: 'trial', id: x.id, title: x.name, sub: [x.store_name, x.phone].filter(Boolean).join(' • '), link: `#/trials/${x.id}` });
    if (can(ctx, 'quotes.view')) for (const q of await rows('SELECT id, number, client_name, total FROM quotes WHERE number LIKE ?1 OR client_name LIKE ?1 OR company LIKE ?1 LIMIT 10', like))
      res.push({ type: 'quote', id: q.id, title: `${q.number} — ${q.client_name}`, sub: `${q.total}`, link: `#/quotes/${q.id}` });
    return json({ results: res });
  },

  // ---------------- Activity log ----------------
  'GET /api/activity': async (ctx) => {
    need(ctx, 'activity.view');
    const p = ctx.url.searchParams;
    const cond = [], args = [];
    if (p.get('client_id')) { cond.push('a.client_id = ?'); args.push(p.get('client_id')); }
    if (p.get('user_id')) { cond.push('a.user_id = ?'); args.push(p.get('user_id')); }
    if (p.get('q')) { cond.push('(a.action LIKE ? OR a.details LIKE ?)'); args.push(`%${p.get('q')}%`, `%${p.get('q')}%`); }
    if (p.get('entity')) { cond.push('a.entity = ?'); args.push(p.get('entity')); }
    const before = p.get('before'); if (before) { cond.push('a.created_at < ?'); args.push(before); }
    const { results } = await ctx.env.DB.prepare(`SELECT a.*, c.name client_name FROM activity_log a LEFT JOIN clients c ON c.id = a.client_id ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY a.created_at DESC LIMIT 100`).bind(...args).all();
    return json({ items: results });
  },

  // ---------------- Settings ----------------
  'GET /api/settings': async (ctx) => {
    const s = { ...ctx.settings };
    return json({ settings: s, vault_key_configured: await vaultAvailable(ctx.env) });
  },
  'PUT /api/settings': async (ctx) => {
    need(ctx, 'settings.manage');
    const b = await readJson(ctx.req);
    const stmts = [];
    for (const [k, v] of Object.entries(b || {})) {
      if (!(k in SETTINGS_DEFAULTS)) continue;
      if (k === 'identity_image' && v && !(typeof v === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(v) && v.length < 1500000)) throw bad('صورة الهوية غير صالحة أو كبيرة جدًا');
      if (k === 'checklist' && !Array.isArray(v)) throw bad('قائمة المتابعة غير صالحة');
      stmts.push(ctx.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, JSON.stringify(v)));
    }
    if (stmts.length) await ctx.env.DB.batch(stmts);
    await log(ctx, 'تعديل الإعدادات', { entity: 'settings', details: Object.keys(b || {}).filter((k) => k in SETTINGS_DEFAULTS).join('، ') });
    return json({ ok: true });
  },

  // ---------------- Categories ----------------
  'GET /api/categories': async (ctx) => {
    const { results } = await ctx.env.DB.prepare('SELECT * FROM categories ORDER BY created_at').all();
    const { results: cl } = await ctx.env.DB.prepare("SELECT category_ids FROM clients WHERE status != 'former'").all();
    const counts = {};
    for (const c of cl) for (const id of parseArr(c.category_ids)) counts[id] = (counts[id] || 0) + 1;
    return json({ items: results.map((c) => ({ ...c, count: counts[c.id] || 0 })) });
  },
  'POST /api/categories': async (ctx) => {
    need(ctx, 'clients.edit');
    const b = await readJson(ctx.req);
    const id = newId('cat_');
    await ctx.env.DB.prepare('INSERT INTO categories (id, name, color, created_at) VALUES (?,?,?,?)').bind(id, reqStr(b.name, 'اسم التصنيف', 60), str(b.color, 20), nowISO()).run();
    await log(ctx, 'إضافة تصنيف', { entity: 'category', entity_id: id, details: b.name });
    return json({ id });
  },
  'PUT /api/categories/:id': async (ctx) => {
    need(ctx, 'clients.edit');
    const b = await readJson(ctx.req);
    await ctx.env.DB.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').bind(reqStr(b.name, 'اسم التصنيف', 60), str(b.color, 20), ctx.params.id).run();
    await log(ctx, 'تعديل تصنيف', { entity: 'category', entity_id: ctx.params.id, details: b.name });
    return json({ ok: true });
  },
  'DELETE /api/categories/:id': async (ctx) => {
    need(ctx, 'clients.edit');
    const id = ctx.params.id;
    const { results } = await ctx.env.DB.prepare('SELECT id, category_ids FROM clients WHERE category_ids LIKE ?').bind(`%${id}%`).all();
    const stmts = results.map((c) => ctx.env.DB.prepare('UPDATE clients SET category_ids = ? WHERE id = ?').bind(JSON.stringify(parseArr(c.category_ids).filter((x) => x !== id)), c.id));
    stmts.push(ctx.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id));
    await ctx.env.DB.batch(stmts);
    await log(ctx, 'حذف تصنيف', { entity: 'category', entity_id: id });
    return json({ ok: true });
  },

  // ---------------- Backup & restore ----------------
  'POST /api/backup/export': async (ctx) => {
    need(ctx, 'data.export');
    const b = await readJson(ctx.req);
    const includeVault = !!b.include_vault;
    const pass = b.passphrase ? String(b.passphrase) : '';
    if (includeVault) {
      need(ctx, 'vault.reveal');
      if (!(ctx.session?.vault_until > nowISO())) throw new HttpError(423, 'افتح الخزنة أولًا لتضمين بياناتها في النسخة', 'vault_locked');
    }
    if ((includeVault || pass) && pass.length < 10) throw bad('كلمة مرور النسخة المشفرة يجب أن تكون 10 أحرف على الأقل');
    const db = ctx.env.DB, data = {};
    for (const t of EXPORT_TABLES) data[t] = (await db.prepare(`SELECT * FROM ${t}`).all()).results;
    if (includeVault) {
      const { results } = await db.prepare('SELECT * FROM vault_entries').all();
      data.vault_entries = [];
      for (const v of results) data.vault_entries.push({ ...v, secret: undefined, secret_plain: await decryptVault(ctx.env, v.secret) });
    }
    const payload = JSON.stringify(data);
    const meta = { format: 'mbcc-backup', version: 1, app: ctx.settings.app_name, created_at: nowISO(), created_by: ctx.user.display_name, counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])), includes_vault: includeVault, checksum: await sha256hex(payload) };
    const file = pass ? { ...meta, encrypted: true, box: await encryptWithPassphrase(pass, payload) } : { ...meta, encrypted: false, data };
    await log(ctx, includeVault ? 'إنشاء نسخة احتياطية مشفرة (تشمل الخزنة)' : pass ? 'إنشاء نسخة احتياطية مشفرة' : 'إنشاء نسخة احتياطية', { entity: 'backup', details: Object.entries(meta.counts).map(([k, v]) => `${k}:${v}`).join(' ') });
    return json(file);
  },
  'POST /api/backup/inspect': async (ctx) => {
    need(ctx, 'data.export');
    const b = await readJson(ctx.req);
    const { meta } = await openBackup(b.file, b.passphrase);
    return json({ ok: true, meta });
  },
  'POST /api/backup/restore': async (ctx) => {
    need(ctx, 'data.export'); need(ctx, 'settings.manage');
    const b = await readJson(ctx.req);
    const mode = b.mode === 'replace' ? 'replace' : 'merge';
    const { meta, data } = await openBackup(b.file, b.passphrase);
    const db = ctx.env.DB;
    if (data.vault_entries?.length && !(await vaultAvailable(ctx.env))) throw bad('مفتاح الخزنة غير مضبوط على الخادم، لا يمكن استعادة بيانات الخزنة');
    const stmts = [];
    if (mode === 'replace') {
      for (const t of [...EXPORT_TABLES].reverse()) if (data[t]) stmts.push(db.prepare(`DELETE FROM ${t}`));
      if (data.vault_entries) stmts.push(db.prepare('DELETE FROM vault_entries'));
    }
    const counts = {};
    for (const t of [...EXPORT_TABLES, 'vault_entries']) {
      const rows = data[t]; if (!Array.isArray(rows)) continue;
      const cols = await tableColumns(db, t);
      counts[t] = rows.length;
      for (const r0 of rows) {
        const r = { ...r0 };
        if (t === 'vault_entries') { r.secret = await encryptVault(ctx.env, r.secret_plain || {}); delete r.secret_plain; }
        const keys = cols.filter((c) => c in r);
        if (!keys.length) continue;
        const verb = t === 'settings' ? 'INSERT OR REPLACE' : mode === 'replace' ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
        stmts.push(db.prepare(`${verb} INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((k) => r[k] ?? null)));
      }
    }
    for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
    await log(ctx, 'استعادة نسخة احتياطية', { entity: 'backup', details: `${mode === 'replace' ? 'استبدال' : 'دمج'} — نسخة ${meta.created_at}` });
    return json({ ok: true, mode, counts });
  },

  // CSV export (no secrets)
  'GET /api/export/:kind': async (ctx) => {
    need(ctx, 'data.export');
    const kind = ctx.params.kind, db = ctx.env.DB;
    let rows;
    if (kind === 'clients') rows = (await loadClientsDerived(ctx, '')).map((c) => ({ الاسم: c.name, المتجر: c.store_name, الجوال: c.phone, البريد: c.email, النشاط: c.business_type, الحالة: c.status_display, المنصات: c.platforms.join(' / '), 'بداية الاشتراك': c.sub?.start_date, 'نهاية الاشتراك': c.sub?.end_date, 'قيمة الاشتراك': c.sub?.amount, المدفوع: c.sub?.paid, المتبقي: c.sub?.remaining }));
    else if (kind === 'payments') rows = (await db.prepare('SELECT p.date التاريخ, c.name العميل, p.amount المبلغ, p.method الطريقة, p.type النوع, p.period الفترة, p.reference المرجع, p.notes ملاحظات FROM payments p JOIN clients c ON c.id = p.client_id ORDER BY p.date DESC').all()).results;
    else if (kind === 'campaigns') rows = (await db.prepare('SELECT c.name العميل, k.name الحملة, k.platform المنصة, k.status الحالة, k.spend المصروف, k.impressions المشاهدات, k.clicks النقرات, k.orders الطلبات, k.sales المبيعات FROM campaigns k JOIN clients c ON c.id = k.client_id').all()).results;
    else if (kind === 'tasks') rows = (await db.prepare('SELECT t.title المهمة, c.name العميل, t.due_date الاستحقاق, t.priority الأولوية, t.status الحالة FROM tasks t LEFT JOIN clients c ON c.id = t.client_id').all()).results;
    else throw bad('نوع تصدير غير معروف');
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
    await log(ctx, 'تصدير بيانات', { entity: 'export', details: kind });
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${kind}-${ctx.today}.csv"`, 'cache-control': 'no-store' } });
  },

  // ---------------- Demo data ----------------
  'POST /api/demo/seed': async (ctx) => {
    need(ctx, 'settings.manage');
    const { seedDemo } = await import('../lib/demo.js');
    const n = await seedDemo(ctx);
    await log(ctx, 'إضافة بيانات تجريبية', { entity: 'demo', details: `${n} سجل` });
    return json({ ok: true, rows: n });
  },
  'POST /api/demo/clear': async (ctx) => {
    need(ctx, 'settings.manage');
    const db = ctx.env.DB;
    const stmts = [db.prepare("DELETE FROM quick_checks WHERE client_id LIKE 'demo_%'"), ...DEMO_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE id LIKE 'demo_%'`))];
    stmts.push(db.prepare("DELETE FROM activity_log WHERE client_id LIKE 'demo_%'"));
    await db.batch(stmts);
    await log(ctx, 'حذف البيانات التجريبية', { entity: 'demo' });
    return json({ ok: true });
  },
  'GET /api/demo/status': async (ctx) => {
    const r = await ctx.env.DB.prepare("SELECT COUNT(*) n FROM clients WHERE id LIKE 'demo_%'").first();
    return json({ demo_clients: r.n });
  },
};

async function openBackup(file, passphrase) {
  if (!file || file.format !== 'mbcc-backup') throw bad('الملف ليس نسخة احتياطية صالحة لهذا التطبيق');
  let data, payload;
  if (file.encrypted) {
    if (!passphrase) throw new HttpError(400, 'هذه النسخة مشفرة — أدخل كلمة مرور النسخة', 'passphrase_required');
    try { payload = await decryptWithPassphrase(String(passphrase), file.box); } catch { throw bad('كلمة مرور النسخة غير صحيحة أو الملف تالف'); }
    data = JSON.parse(payload);
  } else {
    data = file.data; payload = JSON.stringify(data);
  }
  if (!data || typeof data !== 'object') throw bad('الملف تالف');
  const sum = await sha256hex(payload);
  if (file.checksum && sum !== file.checksum) throw bad('فشل التحقق من سلامة الملف (checksum غير مطابق) — قد يكون الملف معدلًا أو تالفًا');
  const { box, data: _d, ...meta } = file;
  return { meta, data };
}
export { TASK_PRIORITY };
