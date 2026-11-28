// Scheduled reminders (Cron every 15 min). Each reminder is delivered once (reminder_log), in each person's time zone.
import { addDays, diffDays, fmtGreg, nextOccurrence, nowLocal, countdown, daysInMonth, addMonths, fmtTime } from '../public/js/dates.js';
import { parseSettings, users } from './lib/session.js';
import { notify } from './lib/notify.js';
import { nowISO } from './lib/util.js';

/** The monthly anniversary date of `day` in month 'YYYY-MM' (31 → last day of shorter months). */
export function monthlyDate(monthKey, day) { const [y, m] = monthKey.split('-').map(Number); return `${monthKey}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`; }
const nextRepeat = (date, rep, anchorDay) => (rep === 'daily' ? addDays(date, 1) : rep === 'weekly' ? addDays(date, 7) : monthlyDate(addMonths(date.slice(0, 7), 1), anchorDay));

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
  const sinceRow = await env.DB.prepare("SELECT value FROM space_settings WHERE key = 'since'").first();
  const since = sinceRow ? JSON.parse(sinceRow.value) : null;
  const today0 = nowLocal(parseSettings(all[0].settings).tz).slice(0, 10);
  const [appts, urgent, dailyTasks, reminders] = await Promise.all([
    q("SELECT * FROM appointments WHERE date >= date('now', '-1 day')"), q("SELECT * FROM urgent WHERE status != 'done'"),
    q("SELECT * FROM daily_tasks WHERE status != 'done' AND date >= date('now', '-14 day')"), q("SELECT * FROM reminders WHERE (status = 'pending' OR status IS NULL) AND fired_at IS NULL"),
  ]);
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

    // ---- v3: monthly / yearly anniversary of the day we met ----
    if (since?.at && daily) {
      const sd = since.at.slice(0, 10), day = Number(sd.slice(8, 10));
      if (today > sd && today === monthlyDate(today.slice(0, 7), day)) {
        const months = (Number(today.slice(0, 4)) - Number(sd.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(sd.slice(5, 7));
        const yearly = months % 12 === 0;
        await send(u, `since:${today}`, { kind: 'anniversary', group: 'anniversary', title: yearly ? `اليوم ذكرى سنوية ليوم عرفنا بعض — ${months / 12} ${months / 12 === 1 ? 'سنة' : months / 12 === 2 ? 'سنتان' : 'سنوات'} ❤️` : 'اليوم ذكرى شهرية ليوم عرفنا بعض ❤️', body: `${months} ${months <= 10 ? 'أشهر' : 'شهرًا'} منذ أن عرفنا بعض`, link: '#/anniv' });
      }
    }
    // ---- appointments: day before (daily hour), N hours before, custom time, and a same-day note ----
    for (const a of appts) {
      if (!mine(a, 'person') || a.status === 'cancelled' || a.status === 'done') continue;
      const at = `${a.date}T${a.time || '09:00'}`;
      const msg = { kind: 'appointment', group: 'appointments', title: `موعد قريب: ${a.title}`, body: `${fmtGreg(a.date, { weekday: true })}${a.time ? ' — ' + fmtTime(a.time) : ''}${a.location ? ' — ' + a.location : ''}`, link: '#/s/appointments' };
      if (a.remind === '1' && daily && diffDays(today, a.date) === 1) await send(u, `appt:${a.id}:${a.date}:d1`, msg);
      if (/^h\d$/.test(a.remind || '') && a.time) {
        const hrs = Number(a.remind.slice(1));
        const fire = nowLocal('UTC', new Date(Date.parse(at + ':00Z') - hrs * 3600000));
        if (local >= fire && local < at) await send(u, `appt:${a.id}:${at}:${a.remind}`, msg);
      }
      if (a.remind === 'custom' && isDue('custom', a.remind_at)) await send(u, `appt:${a.id}:${a.remind_at}`, msg);
      if (daily && a.date === today) await send(u, `appt:${a.id}:${a.date}:today`, { ...msg, title: `موعد اليوم: ${a.title}` });
    }
    // ---- urgent & daily tasks digest ----
    const urg = urgent.filter((x) => mine(x, 'assignee'));
    if (daily && urg.length) await send(u, `urgent-digest:${today}`, { kind: 'urgent', group: 'urgent', title: `${urg.length} ${urg.length <= 10 ? 'أمور عاجلة' : 'أمرًا عاجلًا'} بانتظار الإنجاز`, body: urg.slice(0, 3).map((x) => x.title).join('، '), link: '#/s/urgent' });
    const dt = dailyTasks.filter((x) => mine(x, 'assignee') && x.date <= today);
    if (daily && dt.length) await send(u, `daily-digest:${today}`, { kind: 'daily', group: 'daily', title: 'مهامك اليومية', body: `${dt.filter((x) => x.date === today).length} لليوم${dt.some((x) => x.date < today) ? ` · ${dt.filter((x) => x.date < today).length} متأخرة` : ''}`, link: '#/s/daily_tasks' });
  }

  // ---- "ذكرني بشيء": fire at date+time in the target's zone; repeating ones move to the next date ----
  for (const r of reminders) {
    const u = all.find((x) => x.id === r.target) || null;
    const targets_ = r.target === 'both' || !u ? all : [u];
    const tz = parseSettings((targets_[0] || all[0]).settings).tz;
    const s0 = parseSettings((targets_[0] || all[0]).settings);
    const due = `${r.date}T${r.time || String(s0.remind_hour).padStart(2, '0') + ':00'}`;
    if (nowLocal(tz) < due) continue;
    const from = all.find((x) => x.id === r.created_by);
    for (const t of targets_) await send(t, `rem:${r.id}:${due}`, { kind: 'reminder', group: 'reminders', title: `تذكير${from && from.id !== t.id ? ' من ' + from.name : ''}: ${r.title}`, body: r.details || '', link: '#/s/reminders' });
    let patch = { fired_at: nowISO() };
    if (r.repeat && r.repeat !== 'none') { // move a repeating reminder to its next date (skipping missed ones)
      const anchor = Number(r.date.slice(8, 10));
      let d = nextRepeat(r.date, r.repeat, anchor); while (d < today0) d = nextRepeat(d, r.repeat, anchor);
      patch = { date: d };
    }
    const keys = Object.keys(patch);
    await env.DB.prepare(`UPDATE reminders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => patch[k]), nowISO(), r.id).run();
    await env.DB.prepare('INSERT INTO changes (col, row_id, op, actor, at) VALUES (?, ?, ?, ?, ?)').bind('reminders', r.id, 'update', 'system', nowISO()).run();
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
