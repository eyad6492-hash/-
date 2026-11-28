// Dashboard — the essentials only: greeting, today's dates, nearest occasion countdown, upcoming,
// our mood, today's tasks, our month, upcoming plans and this month's expenses.
import { all, store, today, pref, isMe, update } from '../store.js';
import { esc, icon, avatar, cdBox, money, img, greetingFor, toastErr } from '../ui.js';
import { diffDays, fmtGreg, fmtHijri, fmtDate, fmtTime, monthKey, GREG_MONTHS, countdown, nowLocal } from '../dates.js';
import { upcoming, isOverdue } from '../agenda.js';
import { L } from '../labels.js';
import { cycleStats } from '../cycle-math.js';
import { get } from '../api.js';
import { openMoodForm } from './mood.js';
import { sinceCard } from './since.js';

let cycleCache = null;

export default {
  async render(el) {
    const t = today(), me = store.me, partner = store.partner;
    const p = pref();
    const hour = Number(nowLocal(me.settings.tz).slice(11, 13));
    const up = upcoming(t);
    const mk = monthKey(t);

    // ---- hero: nearest important date ----
    let hero = '';
    if (up.nextDate) {
      const { d, o } = up.nextDate; const n = diffDays(t, o.date);
      hero = `<a class="hero tap" href="#/dates" style="display:block">
        <div class="row between"><span class="en" style="color:var(--rose-ink);font-size:14px">المناسبة القادمة</span>${icon(L.dateKindIcon[d.kind] || 'sparkle')}</div>
        <div class="row" style="align-items:flex-end;margin-top:14px;gap:14px">
          <div><div class="big num">${n === 0 ? '✦' : n}</div><div class="unit">${n === 0 ? 'اليوم!' : n === 1 ? 'يوم — غدًا' : n <= 10 ? 'أيام متبقية' : 'يومًا متبقيًا'}</div></div>
          <div class="grow" style="padding-bottom:4px"><div style="font-weight:600;font-size:17px">${esc(d.title)}</div>
          <div class="small" style="color:var(--ink2)">${fmtDate(o.date, p, { weekday: false })}${o.years > 0 && d.cal !== 'h' ? ` · ${o.years === 1 ? 'السنة الأولى' : `${o.years} سنوات`}` : ''}</div></div>
        </div></a>`;
    } else {
      hero = `<a class="hero tap" href="#/dates" style="display:block"><span class="en" style="color:var(--rose-ink);font-size:14px">تواريخنا المهمة</span><div style="font-weight:600;font-size:17px;margin-top:8px">أضيفوا مناسباتكم المهمة</div><div class="small muted">أعياد الميلاد، الخطوبة، أول لقاء… وسنعدّ الأيام عنكم.</div></a>`;
    }

    // ---- upcoming events ----
    const upRow = (ic, label, title, date, href, tone = '') => `<a class="item" href="${href}"><span class="ic-box ${tone}">${icon(ic)}</span><div class="grow"><div class="sub">${label}</div><div class="title ellipsis">${esc(title)}</div></div>${cdBox(diffDays(t, date))}</a>`;
    const ups = [
      up.event && upRow('clock', `أقرب موعد${up.event.time ? ' · ' + fmtTime(up.event.time) : ''}`, up.event.title, up.event.date < t ? t : up.event.date, `#/calendar/${up.event.date}`, 'rose'),
      up.occasion && up.occasion !== up.nextDate && upRow(L.dateKindIcon[up.occasion.d.kind] || 'gift', 'أقرب مناسبة', up.occasion.d.title, up.occasion.o.date, '#/dates', 'brown'),
      up.birthday && up.birthday !== up.nextDate && upRow('cake', 'أقرب عيد ميلاد', up.birthday.d.title, up.birthday.o.date, '#/dates', 'rose'),
      up.trip && upRow('plane', up.trip.start_date <= t ? 'رحلة جارية' : 'أقرب سفر', up.trip.name, up.trip.start_date < t ? t : up.trip.start_date, `#/trips/${up.trip.id}`, 'sage'),
    ].filter(Boolean);

    // ---- mood ----
    const moodOf = (uid) => all('moods').find((m) => m.created_by === uid && m.date === t);
    const moodCell = (u) => {
      if (!u) return `<a class="mood-cell" href="#/settings"><span class="emo">✉️</span><span class="small muted">ادعُ الطرف الآخر</span></a>`;
      const m = moodOf(u.id); const mo = m && L.moods[m.mood];
      return `<div class="mood-cell" data-mood="${isMe(u.id) ? 'me' : 'p'}"><div class="row between">${avatar(u, 'sm')}<span class="emo">${mo ? mo[0] : '·'}</span></div>
        <div style="font-weight:500;font-size:13.5px">${mo ? esc(mo[1]) : isMe(u.id) ? 'كيف حالك اليوم؟' : 'لم يُسجَّل بعد'}</div>
        ${m?.message ? `<div class="small muted ellipsis">${esc(m.message)}</div>` : ''}</div>`;
    };

    // ---- tasks ----
    const tasks = all('tasks');
    const open = tasks.filter((x) => x.status !== 'completed');
    const todays = open.filter((x) => x.due_date && x.due_date <= t).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const mineOpen = open.filter((x) => x.assignee === me.id || x.assignee === 'both');
    const list = (todays.length ? todays : mineOpen.sort((a, b) => (a.due_date || '9').localeCompare(b.due_date || '9'))).slice(0, 4);
    const taskRow = (x) => `<div class="item" style="min-height:0;padding:9px 0"><button class="check round" data-done="${x.id}" aria-label="إنجاز">${icon('check', 'sm')}</button><a class="grow" href="#/tasks/${x.id}"><div class="title ellipsis" style="font-size:14px">${esc(x.title)}</div>${x.due_date ? `<div class="sub ${isOverdue(x, t) ? 'prio-high' : ''}">${countdown(diffDays(t, x.due_date))}</div>` : ''}</a>${avatar(x.assignee || 'both', 'sm')}</div>`;
    const overdue = open.filter((x) => isOverdue(x, t)).length;

    // ---- month ----
    const plans = all('plans').filter((x) => x.month === mk);
    const plansDone = plans.filter((x) => x.status === 'completed').length;
    const monthTasks = tasks.filter((x) => (x.due_date && monthKey(x.due_date) === mk) || (!x.due_date && monthKey(x.created_at.slice(0, 10)) === mk));
    const mtDone = monthTasks.filter((x) => x.status === 'completed').length;
    const apps = all('events').filter((e) => monthKey(e.date) === mk && e.date >= t).length;

    // ---- plans/places ----
    const toTry = all('places').filter((x) => !x.visited).slice(0, 3);
    const bucketPlanned = all('bucket').filter((x) => x.status === 'planned').slice(0, 2);
    const trips = all('trips').filter((x) => x.start_date && x.start_date >= t && x.status !== 'done').length;

    // ---- expenses ----
    const exps = all('expenses').filter((x) => monthKey(x.date) === mk);
    const total = exps.reduce((s, x) => s + (x.amount || 0), 0);
    const budget = all('budgets').find((b) => b.month === mk)?.amount;

    // ---- cycle (only for its owner, only if enabled & shown on home) ----
    let cycleCard = '';
    const cs = me.settings.cycle;
    if (cs.enabled && cs.show_home && !cs.has_pin) {
      if (!cycleCache) get('/api/c/cycles').then((r) => { cycleCache = r.items; this.render(el); }).catch(() => { cycleCache = []; });
      const st = cycleCache ? cycleStats(cycleCache, t) : null;
      if (st?.next) cycleCard = `<a class="card tap" href="#/cycle" style="display:block"><div class="card-head"><span class="en">الدورة</span>${icon('drop', 'sm')}</div><div class="small">${st.inPeriod ? `اليوم ${st.dayOfCycle} من الدورة` : `الدورة المتوقعة ${countdown(st.daysToNext)}`}</div></a>`;
    } else if (store.partner_cycle?.next && !cs.enabled) {
      const pc = store.partner_cycle;
      cycleCard = `<div class="card soft"><div class="card-head"><span class="en">${esc(partner?.name || '')}—الدورة</span>${icon('drop', 'sm')}</div><div class="small">${pc.in_period ? 'في فترة الدورة الآن — كن لطيفًا 🤍' : `الموعد المتوقع ${countdown(pc.days_to_next)}`}</div></div>`;
    }

    el.innerHTML = `<div class="page">
      <div class="topbar"><div class="logo">E<i>&amp;</i>R</div>
        <div class="row" style="gap:8px"><a class="icon-btn" href="#/notifications" aria-label="الإشعارات">${icon('bell')}${store.unread ? `<span class="pill-count">${store.unread > 9 ? '9+' : store.unread}</span>` : ''}</a><a href="#/settings">${avatar(me)}</a></div></div>
      <div class="greet" style="margin:6px 2px 16px"><h1>${greetingFor(hour)}، ${esc(me.name)}</h1>
        <div class="date">${fmtGreg(t, { weekday: true })} · ${fmtHijri(t)}</div></div>
      ${sinceCard()}
      ${hero}
      ${ups.length ? `<div class="section-title"><h2>القادم</h2><span class="en">الأيام القادمة</span></div><div class="card upc">${ups.join('')}</div>` : ''}

      <div class="section-title"><h2>مزاجنا اليوم</h2><a href="#/mood">السجل</a></div>
      <div class="mood-pair">${moodCell(me)}${moodCell(partner)}</div>

      <div class="section-title"><h2>${todays.length ? 'مهام اليوم' : 'مهامي'}</h2><a href="#/tasks">الكل${overdue ? ` · <span class="prio-high">${overdue} متأخرة</span>` : ''}</a></div>
      <div class="card">${list.length ? list.map(taskRow).join('') : `<div class="muted small center" style="padding:8px">لا توجد مهام مفتوحة ✨</div>`}</div>

      <div class="section-title"><h2>شهرنا</h2><span class="en">${GREG_MONTHS[Number(mk.slice(5)) - 1]}</span></div>
      <a class="card tap" href="#/plans/${mk}" style="display:block">
        <div class="row between small"><span>الخطط ${plansDone}/${plans.length}</span><span class="muted">${plans.length ? Math.round((plansDone / plans.length) * 100) : 0}%</span></div>
        <div class="progress" style="margin:8px 0 14px"><i style="width:${plans.length ? (plansDone / plans.length) * 100 : 0}%"></i></div>
        <div class="stats3"><div class="stat"><b class="num">${monthTasks.length - mtDone}</b><span>مهام متبقية</span></div><div class="stat"><b class="num">${mtDone}</b><span>مهام منجزة</span></div><div class="stat"><b class="num">${apps}</b><span>مواعيد قادمة</span></div></div>
      </a>

      <div class="grid2" style="margin-top:12px">
        <a class="card tap" href="#/places" style="display:block"><div class="card-head"><span class="en">خططنا</span>${icon('compass', 'sm')}</div>
          ${toTry.length || bucketPlanned.length || trips ? `<div class="small">${toTry.map((x) => `<div class="ellipsis">🍽 ${esc(x.name)}</div>`).join('')}${bucketPlanned.map((x) => `<div class="ellipsis">✦ ${esc(x.title)}</div>`).join('')}${trips ? `<div>✈️ ${trips} ${trips === 1 ? 'رحلة قادمة' : 'رحلات قادمة'}</div>` : ''}</div>` : '<div class="small muted">أماكن نخطط لزيارتها</div>'}</a>
        <a class="card tap" href="#/expenses" style="display:block"><div class="card-head"><span class="en">المصروفات</span>${icon('wallet', 'sm')}</div>
          <div class="stat"><b class="num" style="font-size:22px">${money(total)}</b><span>هذا الشهر</span></div>
          ${budget ? `<div class="progress ${total > budget ? 'over' : ''}" style="margin-top:8px"><i style="width:${Math.min(100, (total / budget) * 100)}%"></i></div><div class="tiny muted" style="margin-top:4px">${total > budget ? `تجاوز ${money(total - budget)}` : `المتبقي ${money(budget - total)}`}</div>` : ''}</a>
      </div>
      ${cycleCard ? `<div style="margin-top:12px">${cycleCard}</div>` : ''}
      <div style="height:12px"></div>
    </div>`;

    el.onclick = async (e) => {
      const d = e.target.closest('[data-done]');
      if (d) { e.preventDefault(); d.classList.add('on'); try { await update('tasks', d.dataset.done, { status: 'completed' }); } catch (err) { d.classList.remove('on'); toastErr(err); } return; }
      const m = e.target.closest('[data-mood]');
      if (m) { if (m.dataset.mood === 'me') openMoodForm(); else location.hash = '#/mood'; }
    };
  },
};
