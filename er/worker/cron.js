// Scheduled reminders (Cron every 15 min). Each reminder is delivered once (reminder_log), in each person's time zone.
import { addDays, diffDays, fmtGreg, nextOccurrence, nowLocal, countdown } from '../public/js/dates.js';
import { parseSettings, users } from './lib/session.js';
import { notify } from './lib/notify.js';
import { nowISO } from './lib/util.js';

const DEFAULT_REMIND = { dates_birthday: '1', trips: '3' }; // sensible defaults when nothing was chosen

async function once(env, key) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO reminder_log (key, at) VALUES (?, ?)').bind(key, nowISO()).run();
  return r.meta.changes > 0;
}
const targets = (row, field, all) => {
  const v = row[field];
  return v && v !== 'both' ? all.filter((u) => u.id === v) : all;
};

export async function runReminders(env, ctx) {
  const all = await users(env);
  if (!all.length) return 0;
  const q = async (sql) => (await env.DB.prepare(sql).all()).results;
  const [dates, events, tasks, trips, plans, shopping] = await Promise.all([
    q('SELECT * FROM dates'), q('SELECT * FROM events WHERE date >= date(\'now\', \'-2 day\') OR remind = \'custom\''),
    q("SELECT * FROM tasks WHERE status != 'completed'"), q("SELECT * FROM trips WHERE status != 'done'"),
    q("SELECT * FROM plans WHERE status NOT IN ('completed', 'postponed')"), q("SELECT * FROM shopping WHERE done = 0 OR done IS NULL"),
  ]);
  let sent = 0;
  const send = async (u, key, msg) => { if (await once(env, `${key}:${u.id}`)) { await notify(ctx, u, msg); sent++; } };

  for (const u of all) {
    const s = parseSettings(u.settings);
    const local = nowLocal(s.tz);
    const today = local.slice(0, 10), hour = Number(local.slice(11, 13));
    const daily = hour === s.remind_hour; // the daily batch goes out at the person's reminder hour
    const isDue = (remind, remindAt, date) => {
      if (remind === 'custom') return remindAt && remindAt <= local && remindAt > nowLocal(s.tz, new Date(Date.now() - 86400000));
      if (!daily || remind === '' || remind == null || !date) return false;
      return diffDays(today, date) === Number(remind);
    };
    const mine = (row, field) => targets(row, field, all).some((x) => x.id === u.id);

    for (const d of dates) {
      const occ = nextOccurrence(d, today); if (!occ) continue;
      const remind = d.remind || (d.kind === 'birthday' ? DEFAULT_REMIND.dates_birthday : '');
      const n = diffDays(today, occ.date);
      // the reminder day itself, plus a gentle "today" note on the day
      if (isDue(remind, d.remind_at, occ.date) || (daily && n === 0 && remind !== 'custom')) await send(u, `dates:${d.id}:${occ.date}:${n}`, { kind: 'date', group: 'dates', title: n === 0 ? `اليوم: ${d.title}` : `${d.title} — ${countdown(n)}`, body: fmtGreg(occ.date, { weekday: true }), link: '#/dates' });
    }
    for (const e of events) {
      if (!mine(e, 'assignee')) continue;
      if (isDue(e.remind, e.remind_at, e.date)) await send(u, `events:${e.id}:${e.date}:${e.remind}:${e.remind_at || ''}`, { kind: 'event', group: 'events', title: `تذكير: ${e.title}`, body: `${countdown(diffDays(today, e.date))}${e.time ? ' — ' + e.time : ''}${e.location ? ' — ' + e.location : ''}`, link: `#/calendar/${e.date}` });
    }
    let dueToday = 0, overdue = 0;
    for (const t of tasks) {
      if (!mine(t, 'assignee')) continue;
      if (isDue(t.remind, t.remind_at, t.due_date)) await send(u, `tasks:${t.id}:${t.due_date}:${t.remind}:${t.remind_at || ''}`, { kind: 'task_reminder', group: 'tasks', title: `تذكير بمهمة: ${t.title}`, body: t.due_date ? `موعد التسليم ${countdown(diffDays(today, t.due_date))}` : '', link: `#/tasks/${t.id}` });
      if (t.due_date === today) dueToday++; else if (t.due_date && t.due_date < today) overdue++;
    }
    if (daily && (dueToday || overdue)) await send(u, `tasks-digest:${today}`, { kind: 'tasks_digest', group: 'tasks', title: 'مهامك اليوم', body: [dueToday && `${dueToday} مستحقة اليوم`, overdue && `${overdue} متأخرة`].filter(Boolean).join(' · '), link: '#/tasks' });
    for (const t of trips) {
      const remind = t.remind || DEFAULT_REMIND.trips;
      if (t.start_date && isDue(remind, t.remind_at, t.start_date)) await send(u, `trips:${t.id}:${t.start_date}:${remind}`, { kind: 'trip', group: 'trips', title: `رحلتنا «${t.name}» ${countdown(diffDays(today, t.start_date))}`, body: 'راجعوا قائمة التجهيزات ✈️', link: `#/trips/${t.id}` });
    }
    for (const p of plans) {
      if (!mine(p, 'assignee')) continue;
      if (isDue(p.remind, p.remind_at, p.date)) await send(u, `plans:${p.id}:${p.date}:${p.remind}`, { kind: 'plan', group: 'plans', title: `خطة: ${p.title}`, body: p.date ? countdown(diffDays(today, p.date)) : '', link: `#/plans/${p.month}` });
    }
    if (daily && today.endsWith('-01')) await send(u, `month:${today}`, { kind: 'month', group: 'plans', title: 'شهر جديد 🌙', body: 'وقت مناسب لكتابة خطة هذا الشهر سوا', link: `#/plans/${today.slice(0, 7)}` });
    for (const it of shopping) {
      if (!mine(it, 'buyer')) continue;
      if (isDue(it.remind, it.remind_at, today)) await send(u, `shopping:${it.id}:${it.remind_at || today}`, { kind: 'shopping', group: 'shopping', title: `تذكير بالشراء: ${it.name}`, body: it.qty || '', link: '#/shopping' });
    }
  }
  // housekeeping
  const old = (d) => new Date(Date.now() - d * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM changes WHERE at < ?').bind(old(45)),
    env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(old(1)),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowISO()),
    env.DB.prepare('DELETE FROM tokens WHERE expires_at < ?').bind(old(1)),
    env.DB.prepare('DELETE FROM reminder_log WHERE at < ?').bind(old(400)),
    env.DB.prepare('DELETE FROM notifications WHERE created_at < ?').bind(old(120)),
  ]);
  return sent;
}
export { addDays };
