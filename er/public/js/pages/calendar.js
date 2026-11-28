// Calendar — Gregorian or Hijri (Umm al-Qura) month grid, week and day views, everything with a date in one place.
import { store, today, pref, byId } from '../store.js';
import { esc, icon, avatar, openSheet, choose } from '../ui.js';
import { addDays, daysInMonth, fromHijri, toHijri, hijriMonthLength, iso, parse, weekday, fmtGreg, fmtHijri, fmtTime, GREG_MONTHS, HIJRI_MONTHS, WEEKDAYS, WEEKDAYS_SHORT } from '../dates.js';
import { agenda } from '../agenda.js';
import { editEvent, editDate, editPlan, editBucket, editTask, editTrip, quickAdd } from '../editors.js';

const st = { view: 'month', basis: null, sel: null, cur: null };

function monthFrame() {
  if (st.basis === 'h') { const first = fromHijri(st.cur.y, st.cur.m, 1); return { first, len: hijriMonthLength(st.cur.y, st.cur.m) }; }
  return { first: iso(st.cur.y, st.cur.m, 1), len: daysInMonth(st.cur.y, st.cur.m) };
}
function setCurFrom(date) { if (st.basis === 'h') { const h = toHijri(date); st.cur = { y: h.y, m: h.m }; } else { const g = parse(date); st.cur = { y: g.y, m: g.m }; } }
function shiftMonth(n) { let { y, m } = st.cur; m += n; if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; } st.cur = { y, m }; }

const itemHtml = (it) => `<div class="ev ${it.kind}" data-open="${it.col}:${it.id}">
  <span class="bar"></span><div class="time num">${it.time ? fmtTime(it.time) : it.col === 'dates' ? '✦' : it.col === 'trips' ? '✈︎' : 'طوال اليوم'}</div>
  <div class="grow"><div class="title ${it.done ? 'done-text' : ''}">${esc(it.title)}</div><div class="sub small muted">${esc({ events: it.row.type === 'appointment' ? 'موعد' : 'حدث', dates: 'مناسبة', tasks: 'مهمة', plans: 'خطة', trips: 'رحلة', bucket: 'من قائمة الأمنيات', appointments: 'موعد', outings: 'خطة يوم', daily_tasks: 'مهمة يومية', reminders: 'تذكير', urgent: 'عاجل', wishes: 'أمنية', requests: 'طلب', anniv: 'ذكرى' }[it.col] || '')}${it.sub ? ' · ' + esc(it.sub) : ''}${it.years > 0 ? ` · ${it.years} سنة` : ''}</div></div>
  ${it.assignee ? avatar(it.assignee, 'sm') : ''}</div>`;

export default {
  render(el, params) {
    const t = today(), p = pref();
    if (!st.basis) st.basis = p === 'h' ? 'h' : 'g';
    if (params.date && params.date !== st._lastParam) { st.sel = params.date; st._lastParam = params.date; setCurFrom(params.date); }
    if (!st.sel) st.sel = t;
    if (!st.cur) setCurFrom(st.sel);
    const ws = store.me.settings.week_start ?? 6;

    let body = '';
    if (st.view === 'month') {
      const { first, len } = monthFrame();
      const off = (weekday(first) - ws + 7) % 7;
      const start = addDays(first, -off);
      const cells = Math.ceil((off + len) / 7) * 7;
      const end = addDays(start, cells - 1);
      const ag = agenda(start, end);
      const last = addDays(first, len - 1);
      const title = st.basis === 'h' ? `${HIJRI_MONTHS[st.cur.m - 1]} ${st.cur.y}هـ` : `${GREG_MONTHS[st.cur.m - 1]} ${st.cur.y}`;
      const sub = st.basis === 'h' ? `${fmtGreg(first, { year: false })} – ${fmtGreg(last)}` : (() => { const a = toHijri(first), b = toHijri(last); return a.m === b.m ? `${HIJRI_MONTHS[a.m - 1]} ${a.y}هـ` : `${HIJRI_MONTHS[a.m - 1]} – ${HIJRI_MONTHS[b.m - 1]} ${b.y}هـ`; })();
      let grid = '';
      for (let i = 0; i < 7; i++) grid += `<div class="wd">${WEEKDAYS_SHORT[(ws + i) % 7]}</div>`;
      for (let i = 0; i < cells; i++) {
        const d = addDays(start, i);
        const g = parse(d).d, h = toHijri(d).d;
        const items = ag.get(d) || [];
        const out = d < first || d > last;
        grid += `<button class="cal-day ${out ? 'out' : ''} ${d === t ? 'today' : ''} ${d === st.sel ? 'sel' : ''}" data-day="${d}"><span class="g num">${st.basis === 'h' ? h : g}</span><span class="h num">${st.basis === 'h' ? g : h}</span><span class="dots">${items.slice(0, 3).map((x) => `<i class="${x.kind}"></i>`).join('')}</span></button>`;
      }
      const dayItems = agenda(st.sel, st.sel).get(st.sel) || [];
      body = `<div class="card" style="padding:12px">
        <div class="cal-head"><button class="icon-btn plain" data-nav="-1" aria-label="السابق">${icon('chevR')}</button><div class="t"><b>${title}</b><span>${sub}</span></div><button class="icon-btn plain" data-nav="1" aria-label="التالي">${icon('chevL')}</button></div>
        <div class="cal-grid">${grid}</div></div>
        <div class="section-title"><h2>${fmtGreg(st.sel, { weekday: true, year: false })}</h2><span class="muted small">${fmtHijri(st.sel)}</span></div>
        ${dayItems.length ? dayItems.map(itemHtml).join('') : `<div class="card soft center small muted">لا يوجد شيء في هذا اليوم</div>`}
        <button class="btn soft block" style="margin-top:12px" data-add>${icon('plus', 'sm')} إضافة في هذا اليوم</button>`;
    } else if (st.view === 'week') {
      const off = (weekday(st.sel) - ws + 7) % 7;
      const start = addDays(st.sel, -off), end = addDays(start, 6);
      const ag = agenda(start, end);
      let rows = '';
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i); const items = ag.get(d) || [];
        rows += `<div class="week-row ${d === t ? 'today' : ''}"><div class="d" data-dayview="${d}"><b class="num">${parse(d).d}</b><span>${WEEKDAYS[weekday(d)]}</span><span class="tiny">${toHijri(d).d} ${HIJRI_MONTHS[toHijri(d).m - 1].split(' ')[0]}</span></div><div class="grow">${items.length ? items.map(itemHtml).join('') : '<div class="small muted" style="padding-top:10px">—</div>'}</div></div>`;
      }
      body = `<div class="card" style="padding:12px 14px"><div class="cal-head"><button class="icon-btn plain" data-wk="-7">${icon('chevR')}</button><div class="t"><b>${fmtGreg(start, { year: false })} – ${fmtGreg(end, { year: false })}</b><span>${fmtHijri(start, { year: false })} – ${fmtHijri(end)}</span></div><button class="icon-btn plain" data-wk="7">${icon('chevL')}</button></div>${rows}</div>`;
    } else {
      const items = agenda(st.sel, st.sel).get(st.sel) || [];
      body = `<div class="card"><div class="cal-head"><button class="icon-btn plain" data-wk="-1">${icon('chevR')}</button><div class="t"><b>${fmtGreg(st.sel, { weekday: true })}</b><span>${fmtHijri(st.sel)}</span></div><button class="icon-btn plain" data-wk="1">${icon('chevL')}</button></div></div>
        <div style="margin-top:12px">${items.length ? items.map(itemHtml).join('') : `<div class="card soft center small muted">يوم هادئ — لا يوجد شيء</div>`}</div>
        <button class="btn soft block" style="margin-top:12px" data-add>${icon('plus', 'sm')} إضافة في هذا اليوم</button>`;
    }

    el.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="kicker">تقويمنا</div><h1>التقويم</h1></div>
        <div class="row" style="gap:8px"><button class="icon-btn" data-conv aria-label="تحويل التاريخ">${icon('repeat')}</button><button class="btn sm soft" data-today>اليوم</button></div></div>
      <div class="row" style="gap:8px;margin-bottom:12px"><div class="tabs grow" style="margin:0">${[['month', 'شهر'], ['week', 'أسبوع'], ['day', 'يوم']].map(([k, l]) => `<button data-view="${k}" class="${st.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${st.view === 'month' ? `<div class="tabs" style="margin:0">${[['g', 'ميلادي'], ['h', 'هجري']].map(([k, l]) => `<button data-basis="${k}" class="${st.basis === k ? 'on' : ''}" style="padding:0 10px">${l}</button>`).join('')}</div>` : ''}</div>
      ${body}
      <div class="legend"><span><i style="background:var(--rose)"></i>حدث</span><span><i style="background:var(--brown)"></i>موعد</span><span><i style="background:#C98C6B"></i>مناسبة</span><span><i style="background:var(--ok)"></i>مهمة</span><span><i style="background:var(--warn)"></i>خطة</span><span><i style="background:#7C93A8"></i>رحلة</span></div>
    </div>`;

    el.onclick = async (e) => {
      const q = (s) => e.target.closest(s);
      let b;
      if ((b = q('[data-day]'))) { st.sel = b.dataset.day; const inMonth = !b.classList.contains('out'); if (!inMonth) setCurFrom(st.sel); return this.render(el, {}); }
      if ((b = q('[data-nav]'))) { shiftMonth(Number(b.dataset.nav)); return this.render(el, {}); }
      if ((b = q('[data-wk]'))) { st.sel = addDays(st.sel, Number(b.dataset.wk)); setCurFrom(st.sel); return this.render(el, {}); }
      if ((b = q('[data-view]'))) { st.view = b.dataset.view; return this.render(el, {}); }
      if ((b = q('[data-basis]'))) { st.basis = b.dataset.basis; setCurFrom(st.sel); return this.render(el, {}); }
      if ((b = q('[data-dayview]'))) { st.sel = b.dataset.dayview; st.view = 'day'; return this.render(el, {}); }
      if (q('[data-today]')) { st.sel = t; setCurFrom(t); return this.render(el, {}); }
      if (q('[data-conv]')) return converter();
      if (q('[data-add]')) {
        const k = await choose('إضافة في ' + fmtGreg(st.sel, { year: false }), [
          { k: 'event', l: 'حدث', icon: 'sparkle', tone: 'rose' }, { k: 'appointment', l: 'موعد', icon: 'clock', tone: 'brown' }, { k: 'trip', l: 'رحلة', icon: 'plane' }, { k: 'task', l: 'مهمة', icon: 'tasks', tone: 'sage' },
          { k: 'date', l: 'مناسبة', icon: 'gift', tone: 'brown' }, { k: 'plan', l: 'خطة', icon: 'plans' }, { k: 'more', l: 'المزيد', icon: 'more' },
        ], 'إلى التقويم');
        if (k === 'event' || k === 'appointment') editEvent(null, { date: st.sel, type: k });
        else if (k === 'trip') editTrip(null, { start_date: st.sel });
        else if (k === 'task') editTask(null, { due_date: st.sel });
        else if (k === 'date') editDate(null, { date: st.sel });
        else if (k === 'plan') editPlan(null, { date: st.sel, month: st.sel.slice(0, 7) });
        else if (k === 'more') quickAdd(st.sel);
        return;
      }
      if ((b = q('[data-open]'))) {
        const [col, id] = b.dataset.open.split(':');
        if (col === 'anniv' || id === 'since') { location.hash = '#/anniv'; return; }
        if (col === 'outings') { location.hash = `#/outing/${id}`; return; }
        if (['appointments', 'daily_tasks', 'reminders', 'urgent', 'wishes', 'requests'].includes(col)) { (await import('./s.js')).openDetail(col, id); return; }
        const row = byId(col, id); if (!row) return;
        ({ events: () => editEvent(row), dates: () => editDate(row), plans: () => editPlan(row), bucket: () => editBucket(row), tasks: () => { location.hash = `#/tasks/${id}`; }, trips: () => { location.hash = `#/trips/${id}`; } })[col]?.();
      }
    };
  },
};

function converter() {
  const t = today(); const h = toHijri(t);
  const hy = h.y; const years = []; for (let y = hy + 10; y >= hy - 100; y--) years.push(y);
  openSheet({
    title: 'تحويل التاريخ', en: 'هجري ⇄ ميلادي',
    body: `<label class="field"><span>من الميلادي</span><input type="date" class="input" id="g" value="${t}"></label><div class="card soft" id="gOut"></div>
      <div class="divider"></div>
      <div class="field"><span>من الهجري (أم القرى)</span><div class="inline-fields three"><select class="input" id="hd">${Array.from({ length: 30 }, (_, i) => `<option ${i + 1 === h.d ? 'selected' : ''}>${i + 1}</option>`).join('')}</select><select class="input" id="hm">${HIJRI_MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === h.m ? 'selected' : ''}>${n}</option>`).join('')}</select><select class="input" id="hy">${years.map((y) => `<option ${y === hy ? 'selected' : ''}>${y}</option>`).join('')}</select></div></div><div class="card soft" id="hOut"></div>`,
    onMount: (sh) => {
      const upd = () => {
        const g = sh.querySelector('#g').value; if (g) sh.querySelector('#gOut').innerHTML = `<b>${fmtHijri(g)}</b><div class="small muted">${WEEKDAYS[weekday(g)]}</div>`;
        const r = fromHijri(Number(sh.querySelector('#hy').value), Number(sh.querySelector('#hm').value), Number(sh.querySelector('#hd').value));
        sh.querySelector('#hOut').innerHTML = `<b>${fmtGreg(r, { weekday: true })}</b><div class="small muted">${fmtHijri(r)}</div>`;
      };
      sh.addEventListener('input', upd); sh.addEventListener('change', upd); upd();
    },
  });
}
