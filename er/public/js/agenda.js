// Aggregates everything that has a date (events, important dates, tasks, plans, trips, bucket list) for the calendar & home.
import { all, store } from './store.js';
import { addDays, diffDays, nextOccurrence, occurrencesBetween, fmtTime } from './dates.js';

/** Important dates + the yearly anniversary of the day we met (computed automatically from "منذ أن عرفنا بعض"). */
export function datesWithSince() {
  const list = all('dates');
  const s = store.space?.since;
  if (s?.at) list.push({ id: 'since', virtual: true, title: 'ذكرى يوم عرفنا بعض ❤️', date: s.at.slice(0, 10), recurring: 1, cal: 'g', kind: 'anniversary', created_at: s.at, created_by: s.updated_by, description: s.note, image_id: s.image_id });
  return list;
}
const mineOr = (v) => !v || v === 'both' || v === store.me?.id;
const pad2 = (n) => String(n).padStart(2, '0');

/** Items per day between from..to (inclusive): Map(date -> [item]). */
export function agenda(from, to, { includeDone = true } = {}) {
  const out = new Map();
  const push = (date, it) => { if (date < from || date > to) return; (out.get(date) || out.set(date, []).get(date)).push(it); };
  for (const e of all('events')) {
    const end = e.end_date && e.end_date > e.date ? e.end_date : e.date;
    if (e.date > to || end < from) continue;
    for (let d = e.date > from ? e.date : from; d <= end && d <= to; d = addDays(d, 1)) push(d, { col: 'events', kind: e.type === 'appointment' ? 'col-appointment' : 'col-event', id: e.id, title: e.title, time: d === e.date ? e.time : null, sub: e.location, assignee: e.assignee, row: e, multi: end !== e.date });
  }
  for (const d of datesWithSince()) for (const occ of occurrencesBetween(d, from, to)) push(occ, { col: 'dates', kind: 'col-dates', id: d.id, title: d.title, row: d, years: d.recurring ? years(d, occ) : null });
  for (const t of all('tasks')) if (t.due_date && (includeDone || t.status !== 'completed')) push(t.due_date, { col: 'tasks', kind: 'col-tasks', id: t.id, title: t.title, done: t.status === 'completed', assignee: t.assignee, row: t });
  for (const p of all('plans')) if (p.date) push(p.date, { col: 'plans', kind: 'col-plans', id: p.id, title: p.title, done: p.status === 'completed', assignee: p.assignee, row: p });
  for (const tr of all('trips')) {
    if (!tr.start_date) continue;
    const end = tr.end_date || tr.start_date;
    if (tr.start_date > to || end < from) continue;
    for (let d = tr.start_date > from ? tr.start_date : from; d <= end && d <= to; d = addDays(d, 1)) push(d, { col: 'trips', kind: 'col-trips', id: tr.id, title: tr.name, sub: d === tr.start_date ? 'يوم السفر ✈️' : d === end ? 'يوم العودة' : `اليوم ${diffDays(tr.start_date, d) + 1}`, row: tr });
  }
  for (const b of all('bucket')) if (b.suggested_date && b.status !== 'done' && !b.event_id) push(b.suggested_date, { col: 'bucket', kind: 'col-bucket', id: b.id, title: b.title, row: b });
  // ---- v3 sections ----
  for (const a of all('appointments')) if (a.status !== 'cancelled') push(a.date, { col: 'appointments', kind: 'col-appointment', id: a.id, title: a.title, time: a.time, sub: a.location, assignee: a.person, done: a.status === 'done', row: a });
  for (const o of all('outings')) if (o.status !== 'cancelled') push(o.date, { col: 'outings', kind: 'col-event', id: o.id, title: o.title, time: o.start_time, sub: 'جدول يومنا', row: o });
  for (const t of all('daily_tasks')) push(t.date, { col: 'daily_tasks', kind: 'col-tasks', id: t.id, title: t.title, time: t.time, done: t.status === 'done', assignee: t.assignee, row: t });
  for (const r of all('reminders')) if (mineOr(r.target) || r.created_by === store.me?.id) push(r.date, { col: 'reminders', kind: 'col-plans', id: r.id, title: r.title, time: r.time, sub: 'تذكير', done: r.status === 'done', assignee: r.target, row: r });
  for (const u of all('urgent')) if (u.deadline && u.status !== 'done') push(u.deadline, { col: 'urgent', kind: 'col-plans', id: u.id, title: u.title, sub: 'أمر عاجل', assignee: u.assignee, row: u });
  for (const w of all('wishes')) if (w.pick_date && w.picked_by === store.me?.id && w.status !== 'done') push(w.pick_date, { col: 'wishes', kind: 'col-dates', id: w.id, title: w.title, sub: 'أمنية سأحققها', row: w });
  for (const q of all('requests')) if (q.proposed_date && q.status === 'approved') push(q.proposed_date, { col: 'requests', kind: 'col-tasks', id: q.id, title: q.title, sub: 'طلب', row: q });
  const s = store.space?.since;
  if (s?.at) { // monthly anniversaries in range
    const [y0, m0, d0] = s.at.slice(0, 10).split('-').map(Number);
    for (let n = 1; n < 1200; n++) {
      let y = y0, m = m0 + n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1;
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const d = `${y}-${pad2(m)}-${pad2(Math.min(d0, dim))}`;
      if (d > to) break;
      if (n % 12 !== 0) push(d, { col: 'anniv', kind: 'col-dates', id: String(n), title: 'ذكرى شهرية ليوم عرفنا بعض', sub: `الشهر رقم ${n}`, row: {} });
    }
  }
  for (const list of out.values()) list.sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1);
  return out;
}
function years(d, occ) { const n = Number(occ.slice(0, 4)) - Number(d.date.slice(0, 4)); return d.cal === 'h' ? null : n; }

/** The "Upcoming Events" block on the home page. */
export function upcoming(today) {
  const res = {};
  const evs = all('events').filter((e) => (e.end_date || e.date) >= today).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  res.event = evs[0] || null;
  const occ = datesWithSince().map((d) => ({ d, o: nextOccurrence(d, today) })).filter((x) => x.o && x.o.date >= today).sort((a, b) => a.o.date.localeCompare(b.o.date));
  res.occasion = occ.find((x) => x.d.kind !== 'birthday') || null;
  res.birthday = occ.find((x) => x.d.kind === 'birthday') || null;
  res.nextDate = occ[0] || null;
  res.trip = all('trips').filter((t) => t.start_date && (t.end_date || t.start_date) >= today && t.status !== 'done').sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;
  return res;
}
export const isOverdue = (t, today) => t.status !== 'completed' && t.due_date && t.due_date < today;
export const mineOrBoth = (row, field = 'assignee') => row[field] === store.me.id || row[field] === 'both' || !row[field];
