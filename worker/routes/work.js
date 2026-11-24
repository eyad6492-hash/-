import { bad, buildInsert, buildUpdate, dateOrNull, json, jsonArr, newId, notFound, nowISO, numOrNull, intOrNull, oneOf, parseArr, readJson, reqStr, str } from '../lib/util.js';
import { log, need, can } from '../lib/context.js';
import { addDays, addMonths } from '../lib/shim.js';
import { CAMPAIGN_STATUS, TASK_PRIORITY, TASK_STATUS, RECURRENCE, RATINGS } from '../../public/js/shared.js';
import { getClient } from './clients.js';

function campFields(b) {
  return {
    name: reqStr(b.name, 'اسم الحملة', 200), platform: reqStr(b.platform, 'المنصة', 60), type: str(b.type, 100), objective: str(b.objective, 200),
    start_date: dateOrNull(b.start_date), end_date: dateOrNull(b.end_date), status: oneOf(b.status, Object.keys(CAMPAIGN_STATUS), 'active'),
    daily_budget: numOrNull(b.daily_budget), total_budget: numOrNull(b.total_budget), spend: numOrNull(b.spend), impressions: intOrNull(b.impressions),
    clicks: intOrNull(b.clicks), orders: intOrNull(b.orders), sales: numOrNull(b.sales), conversions: intOrNull(b.conversions),
    links: str(b.links, 2000), notes: str(b.notes, 5000),
  };
}
const METRIC_KEYS = ['spend', 'impressions', 'clicks', 'orders', 'sales', 'conversions'];

function taskFields(ctx, b) {
  return {
    title: reqStr(b.title, 'اسم المهمة', 300), details: str(b.details, 5000), client_id: str(b.client_id, 40),
    due_date: dateOrNull(b.due_date), priority: oneOf(b.priority, Object.keys(TASK_PRIORITY), ctx.settings.task_default_priority || 'medium'),
    status: oneOf(b.status, Object.keys(TASK_STATUS), 'new'), recurrence: oneOf(b.recurrence, Object.keys(RECURRENCE), 'none'),
    recurrence_days: intOrNull(b.recurrence_days), notes: str(b.notes, 2000), assignee_id: str(b.assignee_id, 40),
  };
}
function nextDue(t, from) {
  const base = t.due_date || from;
  switch (t.recurrence) {
    case 'daily': return addDays(base, 1);
    case 'weekly': return addDays(base, 7);
    case 'monthly': return addMonths(base, 1);
    case 'custom': return addDays(base, Math.max(1, t.recurrence_days || 1));
    default: return null;
  }
}

function reportFields(b) {
  const f = {
    client_id: reqStr(b.client_id, 'العميل', 40), platform: reqStr(b.platform, 'المنصة', 60),
    period_from: dateOrNull(b.period_from), period_to: dateOrNull(b.period_to),
    spend: numOrNull(b.spend), impressions: intOrNull(b.impressions), clicks: intOrNull(b.clicks), orders: intOrNull(b.orders), sales: numOrNull(b.sales),
    daily_budget: numOrNull(b.daily_budget), summary: str(b.summary, 5000), notes: str(b.notes, 5000), recommendations: str(b.recommendations, 5000),
  };
  if (!f.period_from || !f.period_to) throw bad('حدد فترة التقرير');
  if (f.period_to < f.period_from) throw bad('نهاية الفترة قبل بدايتها');
  return f;
}

export const workRoutes = {
  // ---------------- Campaigns ----------------
  'GET /api/campaigns': async (ctx) => {
    need(ctx, 'campaigns.view');
    const { results } = await ctx.env.DB.prepare("SELECT k.*, c.name AS client_name, c.store_name, c.logo FROM campaigns k JOIN clients c ON c.id = k.client_id ORDER BY CASE k.status WHEN 'rejected' THEN 0 WHEN 'optimize' THEN 1 WHEN 'active' THEN 2 ELSE 3 END, k.updated_at DESC").all();
    return json({ items: results });
  },
  'GET /api/campaigns/:id': async (ctx) => {
    need(ctx, 'campaigns.view');
    const k = await ctx.env.DB.prepare('SELECT k.*, c.name AS client_name, c.store_name, c.logo FROM campaigns k JOIN clients c ON c.id = k.client_id WHERE k.id = ?').bind(ctx.params.id).first();
    if (!k) throw notFound('الحملة غير موجودة');
    const { results: snaps } = await ctx.env.DB.prepare('SELECT * FROM campaign_snapshots WHERE campaign_id = ? ORDER BY date DESC, created_at DESC').bind(k.id).all();
    const { results: history } = await ctx.env.DB.prepare("SELECT * FROM activity_log WHERE entity = 'campaign' AND entity_id = ? ORDER BY created_at DESC LIMIT 50").bind(k.id).all();
    return json({ campaign: k, snapshots: snaps, history });
  },
  'POST /api/campaigns': async (ctx) => {
    need(ctx, 'campaigns.edit');
    const b = await readJson(ctx.req);
    const c = await getClient(ctx, reqStr(b.client_id, 'العميل', 40));
    const row = { id: newId('k_'), client_id: c.id, ...campFields(b), created_at: nowISO(), updated_at: nowISO() };
    const ins = buildInsert('campaigns', row);
    await ctx.env.DB.prepare(ins.sql).bind(...ins.args).run();
    await log(ctx, 'إضافة حملة', { entity: 'campaign', entity_id: row.id, client_id: c.id, details: `${row.name} — ${row.platform}` });
    return json({ id: row.id });
  },
  'PUT /api/campaigns/:id': async (ctx) => {
    need(ctx, 'campaigns.edit');
    const k = await ctx.env.DB.prepare('SELECT * FROM campaigns WHERE id = ?').bind(ctx.params.id).first();
    if (!k) throw notFound();
    const b = await readJson(ctx.req);
    const f = campFields({ ...k, ...b });
    const changes = Object.keys(f).filter((key) => String(f[key] ?? '') !== String(k[key] ?? '')).map((key) => `${key}: ${k[key] ?? '—'} → ${f[key] ?? '—'}`);
    const up = buildUpdate('campaigns', k.id, { ...f, updated_at: nowISO() });
    await ctx.env.DB.prepare(up.sql).bind(...up.args).run();
    await log(ctx, 'تعديل حملة', { entity: 'campaign', entity_id: k.id, client_id: k.client_id, details: `${f.name}: ${changes.join('، ') || 'بدون تغيير'}` });
    return json({ ok: true });
  },
  'DELETE /api/campaigns/:id': async (ctx) => {
    need(ctx, 'campaigns.edit');
    const k = await ctx.env.DB.prepare('SELECT * FROM campaigns WHERE id = ?').bind(ctx.params.id).first();
    if (!k) throw notFound();
    await ctx.env.DB.batch([ctx.env.DB.prepare('DELETE FROM campaign_snapshots WHERE campaign_id = ?').bind(k.id), ctx.env.DB.prepare('DELETE FROM campaigns WHERE id = ?').bind(k.id)]);
    await log(ctx, 'حذف حملة', { entity: 'campaign', entity_id: k.id, client_id: k.client_id, details: k.name });
    return json({ ok: true });
  },
  // Performance entry: adds the period's numbers to the campaign totals and keeps a dated history.
  'POST /api/campaigns/:id/snapshots': async (ctx) => {
    need(ctx, 'campaigns.edit');
    const k = await ctx.env.DB.prepare('SELECT * FROM campaigns WHERE id = ?').bind(ctx.params.id).first();
    if (!k) throw notFound();
    const b = await readJson(ctx.req);
    const row = { id: newId('ks_'), campaign_id: k.id, client_id: k.client_id, date: dateOrNull(b.date) || ctx.today, note: str(b.note, 1000), created_at: nowISO() };
    let any = false;
    for (const m of METRIC_KEYS) { row[m] = m === 'spend' || m === 'sales' ? numOrNull(b[m]) : intOrNull(b[m]); if (row[m] !== null) any = true; }
    if (!any) throw bad('أدخل رقمًا واحدًا على الأقل');
    const ins = buildInsert('campaign_snapshots', row);
    const sets = METRIC_KEYS.filter((m) => row[m] !== null).map((m) => `${m} = COALESCE(${m},0) + ?`);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(ins.sql).bind(...ins.args),
      ctx.env.DB.prepare(`UPDATE campaigns SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...METRIC_KEYS.filter((m) => row[m] !== null).map((m) => row[m]), nowISO(), k.id),
    ]);
    await log(ctx, 'تسجيل أداء حملة', { entity: 'campaign', entity_id: k.id, client_id: k.client_id, details: `${k.name} — ${row.date}` });
    return json({ id: row.id });
  },
  'DELETE /api/snapshots/:id': async (ctx) => {
    need(ctx, 'campaigns.edit');
    const s = await ctx.env.DB.prepare('SELECT * FROM campaign_snapshots WHERE id = ?').bind(ctx.params.id).first();
    if (!s) throw notFound();
    const used = METRIC_KEYS.filter((m) => s[m] !== null);
    const stmts = [ctx.env.DB.prepare('DELETE FROM campaign_snapshots WHERE id = ?').bind(s.id)];
    if (used.length) stmts.push(ctx.env.DB.prepare(`UPDATE campaigns SET ${used.map((m) => `${m} = COALESCE(${m},0) - ?`).join(', ')} WHERE id = ?`).bind(...used.map((m) => s[m]), s.campaign_id));
    await ctx.env.DB.batch(stmts);
    await log(ctx, 'حذف سجل أداء', { entity: 'campaign', entity_id: s.campaign_id, client_id: s.client_id, details: s.date });
    return json({ ok: true });
  },

  // ---------------- Tasks ----------------
  'GET /api/tasks': async (ctx) => {
    need(ctx, 'tasks.manage');
    const { results } = await ctx.env.DB.prepare('SELECT t.*, c.name AS client_name, c.status AS client_status, u.display_name AS assignee_name FROM tasks t LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN users u ON u.id = t.assignee_id ORDER BY t.due_date IS NULL, t.due_date, t.created_at DESC LIMIT 2000').all();
    const pause = !!ctx.settings.freeze_pause_work;
    return json({ items: results.map((t) => ({ ...t, paused: pause && t.client_status === 'frozen' })) });
  },
  'POST /api/tasks': async (ctx) => {
    need(ctx, 'tasks.manage');
    const b = await readJson(ctx.req);
    const row = { id: newId('t_'), ...taskFields(ctx, b), followup_id: str(b.followup_id, 40), created_at: nowISO(), updated_at: nowISO() };
    if (row.status === 'done') row.completed_at = nowISO();
    const ins = buildInsert('tasks', row);
    await ctx.env.DB.prepare(ins.sql).bind(...ins.args).run();
    await log(ctx, 'إضافة مهمة', { entity: 'task', entity_id: row.id, client_id: row.client_id, details: row.title });
    return json({ id: row.id });
  },
  'PUT /api/tasks/:id': async (ctx) => {
    need(ctx, 'tasks.manage');
    const t = await ctx.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(ctx.params.id).first();
    if (!t) throw notFound();
    const b = await readJson(ctx.req);
    const f = taskFields(ctx, { ...t, ...b });
    const becameDone = f.status === 'done' && t.status !== 'done';
    const patch = { ...f, updated_at: nowISO(), completed_at: becameDone ? nowISO() : f.status === 'done' ? t.completed_at : null };
    const up = buildUpdate('tasks', t.id, patch);
    const stmts = [ctx.env.DB.prepare(up.sql).bind(...up.args)];
    let next = null;
    if (becameDone && f.recurrence !== 'none') {
      next = { id: newId('t_'), ...f, status: 'new', due_date: nextDue(f, ctx.today), completed_at: null, followup_id: null, created_at: nowISO(), updated_at: nowISO() };
      const ins = buildInsert('tasks', next);
      stmts.push(ctx.env.DB.prepare(ins.sql).bind(...ins.args));
    }
    await ctx.env.DB.batch(stmts);
    await log(ctx, becameDone ? 'إكمال مهمة' : 'تعديل مهمة', { entity: 'task', entity_id: t.id, client_id: f.client_id, details: f.title + (next ? ` — التكرار القادم ${next.due_date}` : '') });
    return json({ ok: true, next_id: next?.id || null, next_due: next?.due_date || null });
  },
  'DELETE /api/tasks/:id': async (ctx) => {
    need(ctx, 'tasks.manage');
    const t = await ctx.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(ctx.params.id).first();
    if (!t) throw notFound();
    await ctx.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(t.id).run();
    await log(ctx, 'حذف مهمة', { entity: 'task', entity_id: t.id, client_id: t.client_id, details: t.title });
    return json({ ok: true });
  },

  // ---------------- Daily follow-up ----------------
  'GET /api/followups/queue': async (ctx) => {
    need(ctx, 'followups.manage');
    const db = ctx.env.DB, today = ctx.today;
    const pause = !!ctx.settings.freeze_pause_work;
    const statuses = pause ? "('active')" : "('active','frozen')";
    const { results } = await db.prepare(`SELECT c.id, c.name, c.store_name, c.logo, c.platforms, c.followup_every, c.status, c.daily_budget,
        (SELECT MAX(date) FROM followups f WHERE f.client_id = c.id) AS last_followup,
        (SELECT COUNT(*) FROM campaigns k WHERE k.client_id = c.id AND k.status IN ('active','optimize','review','rejected','paused')) AS campaigns
      FROM clients c WHERE c.status IN ${statuses} ORDER BY c.name`).all();
    const items = results.map((c) => {
      const due = !c.last_followup || addDays(c.last_followup, c.followup_every || 1) <= today;
      return { ...c, platforms: parseArr(c.platforms), due, done_today: c.last_followup === today };
    });
    return json({ today, checklist: ctx.settings.checklist, items });
  },
  'GET /api/followups': async (ctx) => {
    need(ctx, 'followups.manage');
    const { results } = await ctx.env.DB.prepare('SELECT f.*, c.name AS client_name, c.logo, u.display_name AS user_name FROM followups f JOIN clients c ON c.id = f.client_id LEFT JOIN users u ON u.id = f.user_id ORDER BY f.date DESC, f.created_at DESC LIMIT 500').all();
    return json({ items: results.map((f) => ({ ...f, checklist: parseArr(f.checklist), campaign_ids: parseArr(f.campaign_ids) })) });
  },
  'POST /api/followups': async (ctx) => {
    need(ctx, 'followups.manage');
    const b = await readJson(ctx.req);
    const c = await getClient(ctx, reqStr(b.client_id, 'العميل', 40));
    const checklist = (Array.isArray(b.checklist) ? b.checklist : []).slice(0, 60).map((x) => ({ label: str(x.label, 200), value: oneOf(x.value, ['yes', 'no', 'na'], 'na') }));
    const row = {
      id: newId('fu_'), client_id: c.id, date: dateOrNull(b.date) || ctx.today, campaign_ids: jsonArr(b.campaign_ids), checklist: JSON.stringify(checklist),
      status: oneOf(b.status, ['done', 'pending', 'skipped'], 'done'), rating: oneOf(b.rating, Object.keys(RATINGS), null),
      notes: str(b.notes, 5000), actions: str(b.actions, 5000), user_id: ctx.user.id, created_at: nowISO(),
    };
    const ins = buildInsert('followups', row);
    const stmts = [ctx.env.DB.prepare(ins.sql).bind(...ins.args)];
    const tasks = (Array.isArray(b.tasks) ? b.tasks : []).filter((t) => t && String(t.title || '').trim()).slice(0, 20);
    if (tasks.length && !can(ctx, 'tasks.manage')) throw bad('ليست لديك صلاحية إنشاء مهام');
    for (const t of tasks) {
      const tr = { id: newId('t_'), ...taskFields(ctx, { ...t, client_id: c.id, due_date: t.due_date || ctx.today }), followup_id: row.id, created_at: nowISO(), updated_at: nowISO() };
      const ti = buildInsert('tasks', tr);
      stmts.push(ctx.env.DB.prepare(ti.sql).bind(...ti.args));
    }
    await ctx.env.DB.batch(stmts);
    await log(ctx, 'متابعة يومية', { entity: 'followup', entity_id: row.id, client_id: c.id, details: `${c.name} — ${RATINGS[row.rating] || 'بدون تقييم'}${tasks.length ? ` — ${tasks.length} مهمة` : ''}` });
    return json({ id: row.id });
  },
  'DELETE /api/followups/:id': async (ctx) => {
    need(ctx, 'followups.manage');
    const f = await ctx.env.DB.prepare('SELECT * FROM followups WHERE id = ?').bind(ctx.params.id).first();
    if (!f) throw notFound();
    await ctx.env.DB.prepare('DELETE FROM followups WHERE id = ?').bind(f.id).run();
    await log(ctx, 'حذف متابعة', { entity: 'followup', entity_id: f.id, client_id: f.client_id, details: f.date });
    return json({ ok: true });
  },

  // ---------------- Reports ----------------
  'GET /api/reports': async (ctx) => {
    if (!can(ctx, 'reports.view') && !can(ctx, 'reports.create')) need(ctx, 'reports.view');
    const { results } = await ctx.env.DB.prepare('SELECT r.*, c.name AS client_name, c.store_name, c.logo FROM reports r JOIN clients c ON c.id = r.client_id ORDER BY r.created_at DESC LIMIT 1000').all();
    return json({ items: results });
  },
  'GET /api/reports/:id': async (ctx) => {
    if (!can(ctx, 'reports.view') && !can(ctx, 'reports.create')) need(ctx, 'reports.view');
    const r = await ctx.env.DB.prepare('SELECT r.*, c.name AS client_name, c.store_name, c.logo FROM reports r JOIN clients c ON c.id = r.client_id WHERE r.id = ?').bind(ctx.params.id).first();
    if (!r) throw notFound('التقرير غير موجود');
    const prev = await ctx.env.DB.prepare('SELECT * FROM reports WHERE client_id = ? AND platform = ? AND id != ? AND period_to <= ? ORDER BY period_to DESC, created_at DESC LIMIT 1').bind(r.client_id, r.platform, r.id, r.period_from).first();
    return json({ report: r, previous: prev || null });
  },
  'POST /api/reports': async (ctx) => {
    need(ctx, 'reports.create');
    const b = await readJson(ctx.req);
    const f = reportFields(b);
    const c = await getClient(ctx, f.client_id);
    const row = { id: newId('r_'), ...f, created_by: ctx.user.id, created_at: nowISO(), updated_at: nowISO() };
    const ins = buildInsert('reports', row);
    await ctx.env.DB.prepare(ins.sql).bind(...ins.args).run();
    await log(ctx, 'إنشاء تقرير', { entity: 'report', entity_id: row.id, client_id: c.id, details: `${c.name} — ${row.platform} — ${row.period_from} → ${row.period_to}` });
    return json({ id: row.id });
  },
  'PUT /api/reports/:id': async (ctx) => {
    need(ctx, 'reports.create');
    const r = await ctx.env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(ctx.params.id).first();
    if (!r) throw notFound();
    const f = reportFields({ ...r, ...(await readJson(ctx.req)) });
    const up = buildUpdate('reports', r.id, { ...f, updated_at: nowISO() });
    await ctx.env.DB.prepare(up.sql).bind(...up.args).run();
    await log(ctx, 'تعديل تقرير', { entity: 'report', entity_id: r.id, client_id: f.client_id, details: `${f.platform} — ${f.period_from} → ${f.period_to}` });
    return json({ ok: true });
  },
  'DELETE /api/reports/:id': async (ctx) => {
    need(ctx, 'reports.create');
    const r = await ctx.env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(ctx.params.id).first();
    if (!r) throw notFound();
    await ctx.env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(r.id).run();
    await log(ctx, 'حذف تقرير', { entity: 'report', entity_id: r.id, client_id: r.client_id });
    return json({ ok: true });
  },
};
