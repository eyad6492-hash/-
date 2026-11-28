// Generic, schema-validated CRUD for every collection + bootstrap/sync (live updates between the two accounts).
import { COLLECTIONS, COL_NAMES } from '../schema.js';
import { HttpError, bad, forbidden, json, newId, notFound, nowISO, readJson } from '../lib/util.js';
import { mySettings, parseSettings, partnerOf, publicUser, users } from '../lib/session.js';
import { notify } from '../lib/notify.js';
import { cycleStats } from '../../public/js/cycle-math.js';
import { todayIn } from '../../public/js/dates.js';

const LIM = { str: 300, text: 5000 };
function coerce(type, v, userIds, label) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return type === 'bool' ? 0 : (Array.isArray(type) && type.includes('') ? '' : null);
  if (Array.isArray(type)) { if (!type.includes(v)) throw bad(`قيمة غير مسموحة للحقل ${label}`); return v; }
  switch (type) {
    case 'str': case 'text': return String(v).trim().slice(0, LIM[type]) || null;
    case 'file': return /^[a-z0-9_]{4,40}$/.test(String(v)) ? String(v) : null;
    case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad('تاريخ غير صحيح'); return v;
    case 'month': if (!/^\d{4}-\d{2}$/.test(v)) throw bad('شهر غير صحيح'); return v;
    case 'time': if (!/^\d{2}:\d{2}$/.test(v)) throw bad('وقت غير صحيح'); return v;
    case 'datetime': if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw bad('وقت التذكير غير صحيح'); return v;
    case 'int': case 'num': { const n = Number(v); if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw bad('رقم غير صحيح'); return type === 'int' ? Math.round(n) : Math.round(n * 100) / 100; }
    case 'geo': { const n = Number(v); if (!Number.isFinite(n) || Math.abs(n) > 180) throw bad('إحداثيات غير صحيحة'); return Math.round(n * 1e6) / 1e6; }
    case 'bool': return v ? 1 : 0;
    case 'url': { const s = String(v).trim().slice(0, 1000); if (!/^https?:\/\//i.test(s)) throw bad('الرابط يجب أن يبدأ بـ http:// أو https://'); return s; }
    case 'json': return JSON.stringify(v).slice(0, 20000);
    case 'user': if (v !== 'both' && !userIds.includes(v)) throw bad('الشخص المحدد غير موجود'); return v;
    default: return null;
  }
}

function cleanInput(col, body, userIds, partial) {
  const def = COLLECTIONS[col];
  const out = {};
  for (const [k, t] of Object.entries(def.fields)) {
    if (!(k in body)) continue;
    out[k] = coerce(t, body[k], userIds, k);
  }
  if (!partial) for (const k of def.required) if (out[k] === undefined || out[k] === null) throw bad(`حقل «${k}» مطلوب`);
  if (partial) for (const k of def.required) if (k in out && (out[k] === null)) throw bad(`حقل «${k}» مطلوب`);
  return out;
}

const parseRow = (col, row) => {
  if (!row) return row;
  for (const [k, t] of Object.entries(COLLECTIONS[col].fields)) if (t === 'json' && row[k]) { try { row[k] = JSON.parse(row[k]); } catch { row[k] = null; } }
  return row;
};
/** Strip what the viewer must not see (partner's private fields). */
export function visible(col, row, viewerId) {
  const def = COLLECTIONS[col];
  if (def.privateFields && row.created_by !== viewerId) { const r = { ...row }; for (const f of def.privateFields) delete r[f]; return r; }
  return row;
}

async function logChange(ctx, col, rowId, op, title) {
  const def = COLLECTIONS[col];
  await ctx.env.DB.prepare('INSERT INTO changes (col, row_id, op, actor, owner_only, title, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(col, rowId, op, ctx.user.id, def?.ownerOnly ? ctx.user.id : null, title ? String(title).slice(0, 120) : null, nowISO()).run();
}
export { logChange };

async function requireCycleAccess(ctx) {
  const s = parseSettings(ctx.user.settings);
  if (s.cycle.pin_hash && !(ctx.session.cycle_until && ctx.session.cycle_until > nowISO())) throw new HttpError(423, 'القسم مقفل — أدخل الرمز', 'locked');
}

async function getRow(ctx, col, id) {
  const row = await ctx.env.DB.prepare(`SELECT * FROM ${col} WHERE id = ?`).bind(id).first();
  if (!row) throw notFound();
  const def = COLLECTIONS[col];
  if (def.ownerOnly && row.created_by !== ctx.user.id) throw notFound();
  return parseRow(col, row);
}

function colOr404(name) { if (!COL_NAMES.includes(name)) throw notFound('قسم غير معروف'); return name; }
const titleOf = (r) => r?.title || r?.name || r?.body?.slice(0, 40) || '';
const SECTION_LINK = { dates: '#/dates', events: '#/calendar', tasks: '#/tasks', task_comments: '#/tasks', plans: '#/plans', moods: '#/mood', places: '#/places', bucket: '#/bucket', trips: '#/trips', trip_items: '#/trips', honeymoon: '#/honeymoon', honey_items: '#/honeymoon', shopping: '#/shopping', expenses: '#/expenses', budgets: '#/expenses', notes: '#/notes' };

// --------- notification hooks (who gets told about what) ----------
async function afterWrite(ctx, col, before, after) {
  const partner = await partnerOf(ctx.env, ctx.user.id);
  if (!partner) return;
  const me = ctx.user.name;
  const v = (verb) => (ctx.user.letter === 'R' ? verb + 'ت' : verb); // أضاف → أضافت
  const forPartner = (v) => v === partner.id || v === 'both';
  const created = !before;
  if (col === 'tasks') {
    const link = `#/tasks/${after.id}`;
    if (created && forPartner(after.assignee)) await notify(ctx, partner, { kind: 'task_assigned', group: 'tasks', title: after.assignee === 'both' ? `مهمة مشتركة جديدة من ${me}` : `${me} ${v('كلّف')}ك بمهمة`, body: after.title, link, actor: ctx.user.id });
    else if (created) await notify(ctx, partner, { kind: 'task_new', group: 'tasks', title: `${me} ${v('أضاف')} مهمة جديدة`, body: after.title, link, actor: ctx.user.id });
    if (!created && before.assignee !== after.assignee && forPartner(after.assignee)) await notify(ctx, partner, { kind: 'task_assigned', group: 'tasks', title: `${me} ${v('كلّف')}ك بمهمة`, body: after.title, link, actor: ctx.user.id });
    if (!created && before.status !== 'completed' && after.status === 'completed') await notify(ctx, partner, { kind: 'task_done', group: 'tasks', title: `${me} ${v('أنجز')} مهمة ✓`, body: after.title, link, actor: ctx.user.id });
  } else if (col === 'task_comments' && created) {
    await notify(ctx, partner, { kind: 'task_comment', group: 'tasks', title: `تعليق جديد من ${me}`, body: after.body, link: `#/tasks/${after.task_id}`, actor: ctx.user.id });
  } else if (col === 'notes' && created) {
    await notify(ctx, partner, { kind: 'note', group: 'notes', title: `رسالة صغيرة من ${me}`, body: after.title || after.body || '', link: '#/notes', actor: ctx.user.id });
  } else if ((col === 'events' || col === 'plans') && (created || before.assignee !== after.assignee) && forPartner(after.assignee) && after.assignee !== 'both') {
    await notify(ctx, partner, { kind: col, group: col, title: col === 'events' ? `${me} ${v('أضاف')} لك موعدًا` : `${me} ${v('أضاف')} لك خطة`, body: after.title, link: col === 'events' ? `#/calendar/${after.date}` : `#/plans/${after.month}`, actor: ctx.user.id });
  } else if (col === 'shopping' && created && after.buyer === partner.id) {
    await notify(ctx, partner, { kind: 'shopping', group: 'shopping', title: `${me} ${ctx.user.letter === 'R' ? 'تطلب' : 'يطلب'} منك شراء`, body: after.name + (after.qty ? ` (${after.qty})` : ''), link: '#/shopping', actor: ctx.user.id });
  } else if (col === 'moods' && created) {
    await notify(ctx, partner, { kind: 'mood', group: 'mood', title: `${me} ${v('سجّل')} ${ctx.user.letter === 'R' ? 'مزاجها' : 'مزاجه'} اليوم`, body: after.message || '', link: '#/mood', actor: ctx.user.id });
  }
}

// ---------------- bootstrap / sync ----------------
async function partnerCycle(ctx, partner) {
  if (!partner) return null;
  const s = parseSettings(partner.settings);
  if (!s.cycle.enabled || s.cycle.share !== 'prediction') return null;
  const { results } = await ctx.env.DB.prepare('SELECT start_date, end_date FROM cycles WHERE created_by = ? ORDER BY start_date DESC LIMIT 12').bind(partner.id).all();
  const st = cycleStats(results, todayIn(s.tz));
  return { next: st.next, in_period: st.inPeriod, days_to_next: st.daysToNext };
}

async function spaceSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM space_settings').all();
  const o = { currency: 'ر.س' };
  for (const r of results) { try { o[r.key] = JSON.parse(r.value); } catch { /* skip */ } }
  return o;
}

async function people(ctx) {
  const all = await users(ctx.env);
  const partner = all.find((u) => u.id !== ctx.user.id) || null;
  return { me: { ...publicUser(ctx.user), settings: mySettings(ctx.user) }, partner: publicUser(partner), partnerRaw: partner };
}

async function unread(ctx) { return (await ctx.env.DB.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0').bind(ctx.user.id).first()).n; }

export const dataRoutes = {
  'GET /api/bootstrap': async (ctx) => {
    const cursor = (await ctx.env.DB.prepare('SELECT COALESCE(MAX(id), 0) c FROM changes').first()).c;
    const data = {};
    const stmts = COL_NAMES.filter((c) => !COLLECTIONS[c].ownerOnly).map((c) => ctx.env.DB.prepare(`SELECT * FROM ${c}`));
    const res = await ctx.env.DB.batch(stmts);
    COL_NAMES.filter((c) => !COLLECTIONS[c].ownerOnly).forEach((c, i) => { data[c] = res[i].results.map((r) => visible(c, parseRow(c, r), ctx.user.id)); });
    const p = await people(ctx);
    return json({ cursor, me: p.me, partner: p.partner, partner_cycle: await partnerCycle(ctx, p.partnerRaw), space: await spaceSettings(ctx.env), unread: await unread(ctx), data, today: todayIn(parseSettings(ctx.user.settings).tz) });
  },

  'GET /api/sync': async (ctx) => {
    const since = Number(ctx.url.searchParams.get('since') || 0);
    const { results: ch } = await ctx.env.DB.prepare('SELECT * FROM changes WHERE id > ? AND (owner_only IS NULL OR owner_only = ?) ORDER BY id LIMIT 400').bind(since, ctx.user.id).all();
    const mm = await ctx.env.DB.prepare('SELECT COALESCE(MAX(id), 0) c, MIN(id) lo FROM changes').first();
    const max = mm.c;
    if (since && mm.lo && since < mm.lo - 1) return json({ cursor: max, reset: true, unread: await unread(ctx) }); // log was pruned
    const out = { cursor: ch.length ? ch[ch.length - 1].id : Math.max(since, 0), upserts: {}, deletes: {}, events: [], unread: await unread(ctx) };
    if (since > max || ch.some((c) => c.op === 'reset') || ch.length === 400) return json({ ...out, cursor: max, reset: true });
    const ids = {};
    for (const c of ch) {
      if (c.actor !== ctx.user.id) out.events.push({ col: c.col, op: c.op, actor: c.actor, title: c.title, row_id: c.row_id });
      if (c.col === 'users' || c.col === 'space' || COLLECTIONS[c.col]?.ownerOnly) { out.meta = true; continue; }
      (ids[c.col] ||= new Set()).add(c.row_id);
    }
    for (const [col, set] of Object.entries(ids)) {
      if (!COL_NAMES.includes(col)) continue;
      const list = [...set];
      const { results } = await ctx.env.DB.prepare(`SELECT * FROM ${col} WHERE id IN (${list.map(() => '?').join(',')})`).bind(...list).all();
      const found = new Set(results.map((r) => r.id));
      out.upserts[col] = results.map((r) => visible(col, parseRow(col, r), ctx.user.id));
      const gone = list.filter((id) => !found.has(id));
      if (gone.length) out.deletes[col] = gone;
    }
    if (out.meta) { const p = await people(ctx); out.me = p.me; out.partner = p.partner; out.partner_cycle = await partnerCycle(ctx, p.partnerRaw); out.space = await spaceSettings(ctx.env); }
    return json(out);
  },

  // ---------------- generic CRUD ----------------
  'GET /api/c/:col': async (ctx) => {
    const col = colOr404(ctx.params.col);
    const def = COLLECTIONS[col];
    if (col === 'cycles') await requireCycleAccess(ctx);
    const where = def.ownerOnly ? ' WHERE created_by = ?' : '';
    const stmt = ctx.env.DB.prepare(`SELECT * FROM ${col}${where}`);
    const { results } = await (def.ownerOnly ? stmt.bind(ctx.user.id) : stmt).all();
    return json({ items: results.map((r) => visible(col, parseRow(col, r), ctx.user.id)) });
  },

  'POST /api/c/:col': async (ctx) => {
    const col = colOr404(ctx.params.col);
    const def = COLLECTIONS[col];
    if (col === 'cycles') await requireCycleAccess(ctx);
    const body = await readJson(ctx.req);
    const ids = (await users(ctx.env)).map((u) => u.id);
    const row = cleanInput(col, body, ids, false);
    if (def.parent) { const p = await ctx.env.DB.prepare(`SELECT id FROM ${def.parent.col} WHERE id = ?`).bind(row[def.parent.key]).first(); if (!p) throw bad('العنصر الأصلي غير موجود'); }
    // "one per key" collections (mood per person per day, budget per month) → upsert
    if (def.unique) {
      const keys = def.unique.map((k) => (k === 'created_by' ? ctx.user.id : row[k]));
      const ex = await ctx.env.DB.prepare(`SELECT id FROM ${col} WHERE ${def.unique.map((k) => `${k} = ?`).join(' AND ')}`).bind(...keys).first();
      if (ex) return dataRoutes['PATCH /api/c/:col/:id']({ ...ctx, params: { col, id: ex.id }, body });
    }
    applyAuto(col, row, null, ctx.user.id);
    const now = nowISO();
    Object.assign(row, { id: newId(col.slice(0, 2) + '_'), created_by: ctx.user.id, updated_by: ctx.user.id, created_at: now, updated_at: now });
    const keys = Object.keys(row);
    await ctx.env.DB.prepare(`INSERT INTO ${col} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((k) => row[k])).run();
    await logChange(ctx, col, row.id, 'create', titleOf(row));
    const saved = await getRow(ctx, col, row.id);
    await afterWrite(ctx, col, null, saved);
    return json({ item: visible(col, saved, ctx.user.id) }, 201);
  },

  'PATCH /api/c/:col/:id': async (ctx) => {
    const col = colOr404(ctx.params.col);
    const def = COLLECTIONS[col];
    if (col === 'cycles') await requireCycleAccess(ctx);
    const before = await getRow(ctx, col, ctx.params.id);
    if (def.ownerWrite && before.created_by !== ctx.user.id) throw forbidden('هذا العنصر خاص بالطرف الآخر');
    const body = ctx.body || await readJson(ctx.req);
    const ids = (await users(ctx.env)).map((u) => u.id);
    const patch = cleanInput(col, body, ids, true);
    if (def.parent) delete patch[def.parent.key];
    applyAuto(col, patch, before, ctx.user.id);
    Object.assign(patch, { updated_by: ctx.user.id, updated_at: nowISO() });
    const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
    await ctx.env.DB.prepare(`UPDATE ${col} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => patch[k]), before.id).run();
    const after = await getRow(ctx, col, before.id);
    await logChange(ctx, col, before.id, 'update', titleOf(after));
    await afterWrite(ctx, col, before, after);
    return json({ item: visible(col, after, ctx.user.id) });
  },

  'DELETE /api/c/:col/:id': async (ctx) => {
    const col = colOr404(ctx.params.col);
    const def = COLLECTIONS[col];
    if (col === 'cycles') await requireCycleAccess(ctx);
    const row = await getRow(ctx, col, ctx.params.id);
    if (def.ownerWrite && row.created_by !== ctx.user.id) throw forbidden('هذا العنصر خاص بالطرف الآخر');
    // cascade to children
    for (const [child, cdef] of Object.entries(COLLECTIONS)) {
      if (cdef.parent?.col !== col) continue;
      const { results } = await ctx.env.DB.prepare(`SELECT id FROM ${child} WHERE ${cdef.parent.key} = ?`).bind(row.id).all();
      for (const r of results) { await ctx.env.DB.prepare(`DELETE FROM ${child} WHERE id = ?`).bind(r.id).run(); await logChange(ctx, child, r.id, 'delete'); }
    }
    if (col === 'honeymoon') {
      const { results } = await ctx.env.DB.prepare('SELECT id FROM honey_items WHERE destination_id = ?').bind(row.id).all();
      for (const r of results) { await ctx.env.DB.prepare('UPDATE honey_items SET destination_id = NULL WHERE id = ?').bind(r.id).run(); await logChange(ctx, 'honey_items', r.id, 'update'); }
    }
    await ctx.env.DB.prepare(`DELETE FROM ${col} WHERE id = ?`).bind(row.id).run();
    await logChange(ctx, col, row.id, 'delete', titleOf(row));
    return json({ ok: true });
  },
};

/** Server-maintained fields (who completed / bought something and when). */
function applyAuto(col, row, before, userId) {
  for (const k of ['completed_at', 'completed_by', 'done_at', 'done_by']) delete row[k]; // never client-set
  if (col === 'tasks' && row.status !== undefined) {
    if (row.status === 'completed' && before?.status !== 'completed') { row.completed_at = nowISO(); row.completed_by = userId; }
    if (row.status !== 'completed') { row.completed_at = null; row.completed_by = null; }
  }
  if (col === 'shopping' && row.done !== undefined) {
    if (row.done && !before?.done) { row.done_at = nowISO(); row.done_by = userId; }
    if (!row.done) { row.done_at = null; row.done_by = null; }
  }
  for (const k of ['completed_at', 'completed_by', 'done_at', 'done_by']) if (row[k] === undefined) delete row[k];
}

export { getRow, parseRow, requireCycleAccess, spaceSettings };
