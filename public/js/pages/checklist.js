import { html, icon, mount, logo, date, empty, toast, sel } from '../ui.js';
import { get, put, lookups } from '../api.js';
import { setTitle, go } from '../app.js';
import { CHECK_STATUS, addDays } from '../shared.js';
import { today } from '../forms.js';

const BADGE = { done: 'b-green', progress: 'b-gold', none: 'b-gray', attention: 'b-red' };
let curDate = null, filter = 'all', cat = '';

export default async function checklistPage(main, _p, q, stale) {
  setTitle('Checklist – المتابعة السريعة');
  curDate = q.date || today();
  const [data, cats, hist] = await Promise.all([get(`/api/checklist?date=${curDate}`), lookups.categories(), get('/api/checklist/history?days=30')]);
  if (stale()) return;
  const items = data.items, clients = data.clients;
  const state = Object.fromEntries(clients.map((c) => [c.id, { items: { ...(c.entry?.items || {}) }, needs_attention: !!c.entry?.needs_attention, status: c.check_status }]));
  const isToday = curDate === data.today;

  const counts = () => { const o = { all: clients.length, none: 0, progress: 0, done: 0, attention: 0 }; for (const c of clients) o[state[c.id].status]++; return o; };
  const card = (c) => {
    const st = state[c.id];
    return html`<div class="card flat" style="padding:12px" data-cid="${c.id}">
      <div class="row">${logo(c, 'sm')}<a class="grow bold ellipsis" href="#/clients/${c.id}" style="min-width:0">${c.name}</a>
        <span class="badge ${BADGE[st.status]}" data-badge>${CHECK_STATUS[st.status]}</span>
        <button class="icon-btn" data-att title="يحتاج تدخل" style="${st.needs_attention ? 'color:#fb7185;background:rgba(244,63,94,.15)' : ''}">${icon('alert', 'sm')}</button></div>
      <div class="ck-grid">${items.map((it) => html`<button class="ck ${st.items[it.id] ? 'on' : ''}" data-item="${it.id}" ${data.editable ? '' : 'disabled'}><span class="box">${icon('check', 'sm')}</span><span>${it.label}${it.core ? '' : ''}</span></button>`)}</div></div>`;
  };
  const header = () => {
    const k = counts();
    const pct = k.all ? Math.round((k.done / k.all) * 100) : 0;
    return html`
      <div class="card" style="padding:12px">
        <div class="row between"><button class="icon-btn" data-day="1">${icon('chevR')}</button>
          <div class="center"><div class="bold">${isToday ? 'اليوم' : 'سجل'} — ${date(curDate)}</div>${!isToday ? html`<button class="link" data-goto-today>العودة لليوم</button>` : ''}</div>
          <button class="icon-btn" data-day="-1" ${isToday ? 'disabled style="opacity:.3"' : ''}>${icon('chevL')}</button></div>
        <div class="row" style="margin-top:10px"><div class="progress grow"><i style="width:${pct}%"></i></div><span class="small num">${k.done}/${k.all}</span></div>
        <div class="grid-4" style="margin-top:10px;text-align:center">
          ${[['done', 'مكتمل', '#4ade80'], ['progress', 'قيد المتابعة', 'var(--gold)'], ['none', 'لم يبدأ', 'var(--muted)'], ['attention', 'يحتاج تدخل', '#fb7185']].map(([key, l, col]) => html`<div><div class="bold num" style="color:${col};font-size:18px">${k[key]}</div><div class="xs muted">${l}</div></div>`)}</div></div>`;
  };
  const filters = () => html`<div class="chips" style="margin-top:12px">${[['all', 'الكل'], ['none', 'لم تتم متابعتهم'], ['progress', 'قيد المتابعة'], ['done', 'المكتملين'], ['attention', 'يحتاجون تدخل']].map(([key, l]) => html`<button class="chip ${filter === key ? 'active' : ''}" data-f="${key}">${l} <span class="cnt">${counts()[key]}</span></button>`)}</div>
    <div style="margin-top:8px">${sel('cat', cats.map((x) => ({ v: x.id, l: x.name })), cat, { empty: 'كل التصنيفات' })}</div>`;

  mount(main, html`<div data-head>${header()}</div><div data-filters>${filters()}</div>
    ${!data.editable ? html`<p class="muted small">لا يمكن تسجيل متابعة لتاريخ مستقبلي.</p>` : ''}
    <div class="stack" data-list style="margin-top:12px"></div>
    <div class="section"><div class="section-head"><h3>${icon('history', 'sm')} سجل الأيام السابقة</h3><a href="#/settings" data-settings>تعديل البنود</a></div>
      <div class="list">${hist.days.length ? hist.days.map((d) => html`<button class="item" data-hist="${d.date}" style="width:100%;text-align:start"><div class="it-body"><div class="it-title">${date(d.date)}${d.date === data.today ? ' (اليوم)' : ''}</div><div class="it-sub">${d.done} مكتمل • ${d.progress} قيد المتابعة • ${d.attention} يحتاج تدخل</div></div>${icon('chevL', 'sm')}</button>`) : empty('لا يوجد سجل بعد', 'history')}</div></div>`);

  const list = main.querySelector('[data-list]');
  const draw = () => {
    const r = clients.filter((c) => (filter === 'all' || state[c.id].status === filter) && (!cat || c.category_ids.includes(cat)));
    mount(list, r.length ? r.map(card) : empty(clients.length ? 'لا يوجد عملاء في هذا التصنيف' : 'لا يوجد عملاء نشطون للمتابعة', 'checkCircle'));
  };
  const refreshSummary = () => { mount(main.querySelector('[data-head]'), header()); main.querySelectorAll('[data-f] .cnt').forEach((el) => { el.textContent = counts()[el.parentElement.dataset.f]; }); };
  draw();

  const save = async (cid) => {
    const st = state[cid];
    try { const r = await put(`/api/checklist/${curDate}/${cid}`, { items: st.items, needs_attention: st.needs_attention }); st.status = r.check_status; }
    catch (err) { toast(err.message, 'err'); }
    const el = list.querySelector(`[data-cid="${cid}"] [data-badge]`);
    if (el) { el.className = `badge ${BADGE[st.status]}`; el.textContent = CHECK_STATUS[st.status]; }
    refreshSummary();
  };
  main.addEventListener('change', (e) => { if (e.target.name === 'cat') { cat = e.target.value; draw(); } });
  main.addEventListener('click', (e) => {
    const t = e.target;
    const it = t.closest('[data-item]');
    if (it && data.editable) {
      const cid = it.closest('[data-cid]').dataset.cid, st = state[cid];
      st.items[it.dataset.item] = !st.items[it.dataset.item]; if (!st.items[it.dataset.item]) delete st.items[it.dataset.item];
      it.classList.toggle('on', !!st.items[it.dataset.item]);
      if (navigator.vibrate) navigator.vibrate(8);
      save(cid); return;
    }
    const att = t.closest('[data-att]');
    if (att && data.editable) { const cid = att.closest('[data-cid]').dataset.cid; state[cid].needs_attention = !state[cid].needs_attention; att.style.cssText = state[cid].needs_attention ? 'color:#fb7185;background:rgba(244,63,94,.15)' : ''; save(cid); return; }
    const f = t.closest('[data-f]'); if (f) { filter = f.dataset.f; main.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('active', b === f)); draw(); return; }
    const d = t.closest('[data-day]'); if (d && !d.disabled) { const nd = addDays(curDate, -Number(d.dataset.day)); if (nd <= data.today) { curDate = nd; go('#/checklist?date=' + nd); } return; }
    if (t.closest('[data-goto-today]')) { curDate = data.today; go('#/checklist'); return; }
    const h = t.closest('[data-hist]'); if (h) { curDate = h.dataset.hist; go('#/checklist?date=' + curDate); window.scrollTo(0, 0); }
  });
}
