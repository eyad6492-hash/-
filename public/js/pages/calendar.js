import { html, icon, mount, empty, monthName, date } from '../ui.js';
import { get } from '../api.js';
import { setTitle, go, refresh } from '../app.js';
import { addDays, addMonths, parseDate } from '../shared.js';
import { today } from '../forms.js';

const TYPES = { renewal: 'تجديد اشتراك', subscription: 'بداية اشتراك', task: 'مهمة', followup: 'متابعة منجزة', followup_due: 'متابعة مجدولة', payment: 'موعد دفع', quote: 'انتهاء عرض سعر', contact: 'تواصل مع عميل' };
const DOW = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
let view = 'month', cursor = null, selected = null;

export default async function calendarPage(main, _p, _q, stale) {
  setTitle('التقويم');
  cursor ||= today(); selected ||= today();
  let from, to;
  if (view === 'month') { const first = cursor.slice(0, 8) + '01'; from = addDays(first, -parseDate(first).getUTCDay()); to = addDays(from, 41); }
  else if (view === 'week') { from = addDays(cursor, -parseDate(cursor).getUTCDay()); to = addDays(from, 6); }
  else { from = cursor; to = cursor; }
  const { events } = await get(`/api/calendar?from=${from}&to=${to}`);
  if (stale()) return;
  const byDay = {}; for (const e of events) (byDay[e.date] ||= []).push(e);
  const t0 = today();
  const evList = (list) => (list?.length ? html`<div class="list">${list.map((e) => html`<div class="item" data-ev="${e.client_id ? `#/clients/${e.client_id}` : e.task_id ? `#/tasks?open=${e.task_id}` : e.quote_id ? `#/quotes/${e.quote_id}` : ''}"><span class="lv ev-${e.type}" style="width:10px;height:10px;border-radius:50%;flex:none"></span><div class="it-body"><div class="it-title" style="${e.done ? 'opacity:.6' : ''}">${e.title}</div><div class="it-sub">${TYPES[e.type]}${e.done ? ' • منجز' : ''}</div></div>${icon('chevL', 'sm')}</div>`)}</div>` : empty('لا توجد أحداث', 'calendar'));
  const title = view === 'month' ? monthName(cursor) : view === 'week' ? `${date(from)} – ${date(to)}` : date(cursor);
  mount(main, html`
    <div class="row between" style="margin-bottom:12px">
      <div class="seg">${[['day', 'يومي'], ['week', 'أسبوعي'], ['month', 'شهري']].map(([k, l]) => html`<button class="${view === k ? 'active' : ''}" data-view="${k}">${l}</button>`)}</div>
      <button class="btn sm ghost" data-today>اليوم</button></div>
    <div class="row between" style="margin-bottom:10px"><button class="icon-btn" data-nav="1">${icon('chevR')}</button><b>${title}</b><button class="icon-btn" data-nav="-1">${icon('chevL')}</button></div>
    ${view === 'month' ? html`<div class="cal">${DOW.map((d) => html`<div class="dow">${d}</div>`)}${Array.from({ length: 42 }, (_, i) => {
      const d = addDays(from, i), ev = byDay[d] || [];
      return html`<div class="day ${d.slice(0, 7) !== cursor.slice(0, 7) ? 'out' : ''} ${d === t0 ? 'today' : ''} ${d === selected ? 'sel' : ''}" data-day="${d}"><div class="dn num">${+d.slice(8)}</div><div class="dots">${ev.slice(0, 8).map((e) => html`<i class="ev-${e.type}"></i>`)}</div>${ev.length > 8 ? html`<div class="xs muted">+${ev.length - 8}</div>` : ''}</div>`;
    })}</div>
      <div class="section"><div class="section-head"><h3>${date(selected)}</h3><span class="muted small">${(byDay[selected] || []).length} حدث</span></div>${evList(byDay[selected])}</div>`
    : view === 'week' ? Array.from({ length: 7 }, (_, i) => { const d = addDays(from, i); return html`<div class="section"><div class="section-head"><h3 style="font-size:15px;${d === t0 ? 'color:var(--pink)' : ''}">${DOW[i]} • ${date(d)}</h3><span class="muted small">${(byDay[d] || []).length}</span></div>${byDay[d]?.length ? evList(byDay[d]) : html`<p class="muted xs" style="margin:0 4px">—</p>`}</div>`; })
    : evList(byDay[cursor])}
    <div class="legend" style="margin-top:16px">${Object.entries(TYPES).map(([k, l]) => html`<span><i class="ev-${k}"></i>${l}</span>`)}</div>`);
  main.addEventListener('click', (e) => {
    const t = e.target;
    const v = t.closest('[data-view]'); if (v) { view = v.dataset.view; return refresh(); }
    if (t.closest('[data-today]')) { cursor = selected = today(); return refresh(); }
    const nv = t.closest('[data-nav]');
    if (nv) { const dir = -Number(nv.dataset.nav); cursor = view === 'month' ? addMonths(cursor.slice(0, 8) + '01', dir) : addDays(cursor, view === 'week' ? dir * 7 : dir); return refresh(); }
    const d = t.closest('[data-day]'); if (d) { selected = d.dataset.day; if (d.classList.contains('out')) cursor = selected; return refresh(); }
    const ev = t.closest('[data-ev]'); if (ev?.dataset.ev) go(ev.dataset.ev);
  });
}
