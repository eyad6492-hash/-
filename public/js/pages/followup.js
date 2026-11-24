import { html, raw, icon, mount, logo, date, empty, toast, esc, n } from '../ui.js';
import { get, post } from '../api.js';
import { can, setTitle, go, state } from '../app.js';
import { RATINGS, CAMPAIGN_STATUS } from '../shared.js';
import { RATE_BADGE } from './client.js';

export default async function followupPage(main, _p, q, stale) {
  setTitle('المتابعة اليومية');
  const [queue, hist] = await Promise.all([get('/api/followups/queue'), get('/api/followups')]);
  if (stale()) return;
  const due = queue.items.filter((c) => c.due);
  if (q.client) return runWizard(main, queue, queue.items.filter((c) => c.id === q.client).length ? queue.items.filter((c) => c.id === q.client) : [{ id: q.client, name: '' }], true);
  if (q.start) return runWizard(main, queue, due, false);

  const doneToday = queue.items.filter((c) => c.done_today);
  mount(main, html`
    <div class="cta-review" data-start style="padding:18px">
      <span class="ic">${icon('calendarCheck', 'xl')}</span>
      <div class="grow"><div class="bold" style="font-size:18px">ابدأ مراجعة اليوم</div>
        <div class="muted small">${due.length ? `${due.length} عميل مطلوب مراجعتهم اليوم` : 'لا يوجد عملاء بانتظار المراجعة 🎉'} • تمت مراجعة ${doneToday.length}</div>
        <div class="progress" style="margin-top:8px"><i style="width:${due.length + doneToday.length ? (doneToday.length / (due.length + doneToday.length)) * 100 : 100}%"></i></div></div>
      ${icon('chevL')}</div>
    <div class="section"><div class="section-head"><h3>قائمة مراجعة اليوم (${due.length})</h3></div>
      <div class="list grid-auto">${due.length ? due.map((c) => html`<a class="item" href="#/followup?client=${c.id}">${logo(c)}<div class="it-body"><div class="it-title">${c.name}</div><div class="it-sub">${c.platforms.join(' / ') || '—'} • ${c.campaigns} حملة • آخر متابعة ${c.last_followup ? date(c.last_followup) : 'لا يوجد'}</div></div><span class="badge b-pink">مراجعة</span></a>`) : empty('أنجزت كل المراجعات المطلوبة اليوم', 'checkCircle')}</div></div>
    ${doneToday.length ? html`<div class="section"><div class="section-head"><h3>تمت مراجعتهم اليوم (${doneToday.length})</h3></div><div class="list grid-auto">${doneToday.map((c) => html`<a class="item" href="#/clients/${c.id}?tab=followups">${logo(c)}<div class="it-body"><div class="it-title">${c.name}</div></div><span class="badge b-green">${icon('check', 'sm')} تم</span></a>`)}</div></div>` : ''}
    <div class="section"><div class="section-head"><h3>السجل التاريخي</h3></div>
      <div class="list">${hist.items.length ? hist.items.slice(0, 60).map((f) => html`<a class="item" href="#/clients/${f.client_id}?tab=followups">${logo({ name: f.client_name, logo: f.logo }, 'sm')}<div class="it-body"><div class="it-title">${f.client_name}</div><div class="it-sub">${date(f.date)} • ${f.user_name || ''}${f.notes ? ' • ' + f.notes : ''}</div></div>${f.rating ? html`<span class="badge ${RATE_BADGE[f.rating]}">${RATINGS[f.rating]}</span>` : ''}</a>`) : empty('لا يوجد سجل بعد', 'history')}</div></div>`);
  main.querySelector('[data-start]').addEventListener('click', () => (due.length ? go('#/followup?start=1') : toast('لا يوجد عملاء بانتظار المراجعة')));
}

async function runWizard(main, queue, list, single) {
  if (!list.length) { toast('لا يوجد عملاء بانتظار المراجعة'); return go('#/followup'); }
  let i = 0;
  const checklist = (queue.checklist || []).map((l) => (typeof l === 'string' ? l : l.label));
  const step = async () => {
    const c0 = list[i];
    const d = await get(`/api/clients/${c0.id}`);
    const c = d.client;
    const camps = (d.campaigns || []).filter((k) => !['ended'].includes(k.status));
    const st = { items: checklist.map((label) => ({ label, value: 'na' })), rating: null };
    setTitle(single ? `متابعة ${c.name}` : `مراجعة اليوم ${i + 1}/${list.length}`);
    mount(main, html`
      ${!single ? html`<div class="row" style="margin-bottom:10px"><div class="progress grow"><i style="width:${(i / list.length) * 100}%"></i></div><span class="small muted num">${i + 1}/${list.length}</span></div>` : ''}
      <div class="card"><div class="row">${logo(c)}<div class="grow"><div class="bold" style="font-size:17px">${c.name}</div><div class="muted small">${c.platforms.join(' / ')} • ميزانية يومية ${c.daily_budget ? n(c.daily_budget) : '—'} • آخر متابعة ${c.last_followup ? date(c.last_followup) : 'لا يوجد'}</div></div><a class="btn sm ghost" href="#/clients/${c.id}">${icon('user', 'sm')}</a></div></div>
      ${camps.length ? html`<div class="section card"><div class="section-head"><h3>الحملات التي تمت مراجعتها</h3></div><div class="stack" style="gap:6px">${camps.map((k) => html`<label class="check" style="justify-content:space-between;padding:6px 2px"><span><input type="checkbox" data-camp value="${k.id}" checked> ${k.name} <span class="muted xs">(${k.platform})</span></span><span class="badge b-gray">${CAMPAIGN_STATUS[k.status]}</span></label>`)}</div></div>` : ''}
      <div class="section"><div class="section-head"><h3>قائمة المتابعة</h3><button class="link" data-all-yes>الكل ✓</button></div>
        <div class="stack" style="gap:6px" data-cl>${st.items.map((x, j) => clRow(x, j))}</div>
        <div class="row" style="margin-top:8px"><input data-new-item placeholder="إضافة بند آخر لهذه المتابعة…"><button class="btn sm" data-add-item>${icon('plus', 'sm')}</button></div></div>
      <div class="section"><div class="section-head"><h3>تقييم الأداء</h3></div>
        <div class="rating">${Object.entries(RATINGS).map(([k, l]) => html`<button class="r-${k}" data-rate="${k}">${l}</button>`)}</div></div>
      <div class="section form-grid">
        <label class="field"><span>ملاحظات</span><textarea data-notes rows="2" placeholder="ما الذي لاحظته؟"></textarea></label>
        <label class="field"><span>الإجراءات التي تم اتخاذها</span><textarea data-actions rows="2" placeholder="مثال: رفع الميزانية 20%، إيقاف إعلان ضعيف"></textarea></label>
        ${can('tasks.manage') ? html`<label class="field"><span>مهام ناتجة عن المراجعة (سطر لكل مهمة)</span><textarea data-tasks rows="2" placeholder="مثال: تجهيز محتوى جديد"></textarea></label>` : ''}
      </div>
      <div class="row" style="margin-top:16px;position:sticky;bottom:calc(var(--nav-h) + 10px + var(--safe-b));z-index:5">
        ${!single ? html`<button class="btn ghost" data-skip>تخطي</button>` : ''}
        <button class="btn primary lg grow" data-save>${single || i === list.length - 1 ? 'حفظ المتابعة' : 'حفظ والتالي'} ${icon('arrowL')}</button></div>`);

    const cl = main.querySelector('[data-cl]');
    const redraw = () => mount(cl, st.items.map((x, j) => clRow(x, j)));
    const onClick = async (e) => {
      const yn = e.target.closest('[data-yn]');
      if (yn) { st.items[+yn.dataset.j].value = yn.dataset.yn; redraw(); return; }
      if (e.target.closest('[data-all-yes]')) { st.items.forEach((x) => (x.value = 'yes')); redraw(); return; }
      if (e.target.closest('[data-add-item]')) { const inpEl = main.querySelector('[data-new-item]'); if (inpEl.value.trim()) { st.items.push({ label: inpEl.value.trim(), value: 'yes' }); inpEl.value = ''; redraw(); } return; }
      const r = e.target.closest('[data-rate]');
      if (r) { st.rating = r.dataset.rate; main.querySelectorAll('[data-rate]').forEach((b) => b.classList.toggle('on', b === r)); return; }
      if (e.target.closest('[data-skip]')) { main.removeEventListener('click', onClick); next(); return; }
      const sv = e.target.closest('[data-save]');
      if (sv) {
        sv.disabled = true;
        try {
          await post('/api/followups', {
            client_id: c.id, rating: st.rating, checklist: st.items,
            campaign_ids: [...main.querySelectorAll('[data-camp]:checked')].map((x) => x.value),
            notes: main.querySelector('[data-notes]').value, actions: main.querySelector('[data-actions]').value,
            tasks: (main.querySelector('[data-tasks]')?.value || '').split('\n').map((t) => t.trim()).filter(Boolean).map((title) => ({ title, priority: st.rating === 'urgent' ? 'urgent' : 'medium' })),
          });
          toast(`تم حفظ متابعة ${c.name}`);
          main.removeEventListener('click', onClick); next();
        } catch (err) { toast(err.message, 'err'); sv.disabled = false; }
      }
    };
    main.addEventListener('click', onClick);
  };
  const next = () => {
    i++;
    if (single) return go(`#/clients/${list[0].id}?tab=followups`);
    if (i >= list.length) { toast('🎉 أنهيت مراجعة اليوم'); return go('#/followup'); }
    window.scrollTo(0, 0); step();
  };
  await step();
}

function clRow(x, j) {
  return html`<div class="cl-item"><span class="q">${x.label}</span><span class="yn">
    <button data-yn="yes" data-j="${j}" class="${x.value === 'yes' ? 'on-yes' : ''}">نعم</button>
    <button data-yn="no" data-j="${j}" class="${x.value === 'no' ? 'on-no' : ''}">لا</button>
    <button data-yn="na" data-j="${j}" class="${x.value === 'na' ? 'on-na' : ''}">—</button></span></div>`;
}
export { raw, esc, state };
