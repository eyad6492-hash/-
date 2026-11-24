import { html, icon, mount, n, logo, empty, kpi, sheet, field, sel, inp, debounce } from '../ui.js';
import { get, lookups } from '../api.js';
import { can, setTitle, go } from '../app.js';
import { CAMPAIGN_STATUS, PLATFORMS, computeMetrics } from '../shared.js';
import { campaignForm } from '../forms.js';
import { CAMP_BADGE } from './client.js';

export default async function campaignsPage(main, _p, q, stale) {
  setTitle('الحملات الإعلانية');
  const [{ items }, clients] = await Promise.all([get('/api/campaigns'), lookups.clients()]);
  if (stale()) return;
  const st = { f: q.f || 'all', platform: '', client: q.client || '', from: '', to: '', q: '' };
  const selected = new Set();
  const FL = [['all', 'الكل'], ['attention', 'تحتاج تدخل'], ...Object.entries(CAMPAIGN_STATUS)];
  const match = (k, f) => f === 'all' || k.status === f || (f === 'attention' && ['optimize', 'rejected'].includes(k.status));
  mount(main, html`
    <div class="row" style="margin-bottom:12px"><div class="input-icon grow">${icon('search')}<input type="search" data-q placeholder="ابحث باسم الحملة أو العميل…"></div>
      <button class="btn icon ghost" data-filter>${icon('filter')}</button>${can('campaigns.edit') ? html`<button class="btn primary icon" data-add>${icon('plus')}</button>` : ''}</div>
    <div class="chips">${FL.map(([k, l]) => html`<button class="chip ${st.f === k ? 'active' : ''}" data-f="${k}">${l} <span class="cnt">${items.filter((x) => match(x, k)).length}</span></button>`)}</div>
    <div class="row between" style="margin:10px 2px"><span class="muted small" data-count></span><button class="btn sm ghost" data-compare disabled>${icon('layers', 'sm')} مقارنة (<span data-sel>0</span>)</button></div>
    <div class="list" data-list></div>`);
  const draw = () => {
    let r = items.filter((k) => match(k, st.f));
    if (st.platform) r = r.filter((k) => k.platform === st.platform);
    if (st.client) r = r.filter((k) => k.client_id === st.client);
    if (st.from) r = r.filter((k) => (k.end_date || '9999') >= st.from);
    if (st.to) r = r.filter((k) => (k.start_date || '0000') <= st.to);
    if (st.q) r = r.filter((k) => `${k.name} ${k.client_name} ${k.platform}`.toLowerCase().includes(st.q.toLowerCase()));
    main.querySelector('[data-count]').textContent = `${r.length} حملة`;
    mount(main.querySelector('[data-list]'), r.length ? r.map((k) => { const m = computeMetrics(k); return html`<div class="item" data-id="${k.id}">
      <button class="chk ${selected.has(k.id) ? 'on' : ''}" data-pick title="تحديد للمقارنة">${icon('check', 'sm')}</button>
      ${logo({ name: k.client_name, logo: k.logo }, 'sm')}
      <div class="it-body"><div class="it-title">${k.name}</div><div class="it-sub">${k.client_name} • ${k.platform}</div>
        <div class="row wrap xs" style="gap:6px;margin-top:4px"><span class="badge b-gray">مصروف ${n(k.spend, 0)}</span><span class="badge ${m.roas === null ? 'b-gray' : m.roas >= 3 ? 'b-green' : m.roas >= 1.5 ? 'b-gold' : 'b-red'}">ROAS ${kpi.roas(m.roas)}</span><span class="badge b-gray">CPA ${kpi.cpa(m.cpa)}</span><span class="badge b-gray">CTR ${kpi.ctr(m.ctr)}</span></div></div>
      <span class="badge ${CAMP_BADGE[k.status]}">${CAMPAIGN_STATUS[k.status]}</span></div>`; }) : empty('لا توجد حملات', 'megaphone'));
  };
  draw();
  main.querySelector('[data-q]').addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); draw(); }, 150));
  main.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-f]'); if (f) { st.f = f.dataset.f; main.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('active', b === f)); draw(); return; }
    if (e.target.closest('[data-add]')) { const r = await campaignForm({}); if (r?.id) go(`#/campaigns/${r.id}`); return; }
    if (e.target.closest('[data-filter]')) {
      const r = await sheet({ title: 'تصفية الحملات', body: html`<div class="form-grid">${field('المنصة', sel('platform', PLATFORMS, st.platform, { empty: 'كل المنصات' }))}${field('العميل', sel('client', clients.map((c) => ({ v: c.id, l: c.name })), st.client, { empty: 'كل العملاء' }))}<div class="grid-2">${field('الفترة من', inp('from', st.from, { type: 'date' }))}${field('إلى', inp('to', st.to, { type: 'date' }))}</div></div>`,
        foot: html`<button class="btn ghost" data-reset>مسح</button><button class="btn primary" data-ok>تطبيق</button>`,
        onMount: (el, close) => { const v = (nm) => el.querySelector(`[name=${nm}]`).value; el.querySelector('[data-ok]').addEventListener('click', () => close({ platform: v('platform'), client: v('client'), from: v('from'), to: v('to') })); el.querySelector('[data-reset]').addEventListener('click', () => close({ platform: '', client: '', from: '', to: '' })); } });
      if (r) { Object.assign(st, r); draw(); }
      return;
    }
    if (e.target.closest('[data-compare]')) return compare(items.filter((k) => selected.has(k.id)));
    const it = e.target.closest('[data-id]'); if (!it) return;
    if (e.target.closest('[data-pick]')) {
      const id = it.dataset.id; selected.has(id) ? selected.delete(id) : selected.add(id);
      it.querySelector('.chk').classList.toggle('on', selected.has(id));
      main.querySelector('[data-sel]').textContent = selected.size; main.querySelector('[data-compare]').disabled = selected.size < 2;
      return;
    }
    go(`#/campaigns/${it.dataset.id}`);
  });
}

function compare(list) {
  const rows = [['المنصة', (k) => k.platform], ['المصروف', (k) => n(k.spend)], ['المشاهدات', (k) => n(k.impressions)], ['النقرات', (k) => n(k.clicks)], ['الطلبات', (k) => n(k.orders)], ['المبيعات', (k) => n(k.sales)],
    ['ROAS', (k) => kpi.roas(computeMetrics(k).roas)], ['CPA', (k) => kpi.cpa(computeMetrics(k).cpa)], ['CPC', (k) => kpi.cpc(computeMetrics(k).cpc)], ['CTR', (k) => kpi.ctr(computeMetrics(k).ctr)], ['CPM', (k) => kpi.cpm(computeMetrics(k).cpm)], ['معدل التحويل', (k) => kpi.cvr(computeMetrics(k).cvr)], ['متوسط الطلب', (k) => kpi.aov(computeMetrics(k).aov)]];
  sheet({ title: 'مقارنة الحملات', wide: true, body: html`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:${list.length * 120 + 110}px">
    <tr><th style="text-align:start;padding:8px"></th>${list.map((k) => html`<th style="padding:8px;text-align:start">${k.name}<div class="xs muted">${k.client_name}</div></th>`)}</tr>
    ${rows.map(([l, f]) => html`<tr style="border-top:1px solid var(--border)"><td style="padding:8px;color:var(--muted)">${l}</td>${list.map((k) => html`<td style="padding:8px" class="num">${f(k)}</td>`)}</tr>`)}</table></div>` });
}
