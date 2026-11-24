import { html, icon, mount, n, logo, date, dateShort, dateTime, empty, kpi, toast, confirmBox, money } from '../ui.js';
import { get, del, put } from '../api.js';
import { can, setTitle, go, refresh } from '../app.js';
import { CAMPAIGN_STATUS, computeMetrics } from '../shared.js';
import { campaignForm, snapshotForm } from '../forms.js';
import { CAMP_BADGE } from './client.js';
import { chart } from '../charts.js';

export default async function campaignPage(main, { id }, _q, stale) {
  const d = await get(`/api/campaigns/${id}`);
  if (stale()) return;
  const k = d.campaign, m = computeMetrics(k);
  setTitle('تفاصيل الحملة');
  const snaps = [...d.snapshots].reverse();
  const metric = (l, v, c) => html`<div class="metric ${c}"><div class="m-k">${l}</div><div class="m-v num">${v}</div></div>`;
  mount(main, html`
    <div class="card"><div class="row">${logo({ name: k.client_name, logo: k.logo })}<div class="grow"><div class="bold" style="font-size:18px">${k.name}</div><a class="muted small" href="#/clients/${k.client_id}">${k.client_name} • ${k.platform}</a></div><span class="badge ${CAMP_BADGE[k.status]}">${CAMPAIGN_STATUS[k.status]}</span></div>
      ${can('campaigns.edit') ? html`<div class="chips" style="margin-top:12px">${Object.entries(CAMPAIGN_STATUS).map(([s, l]) => html`<button class="chip ${k.status === s ? 'active' : ''}" data-status="${s}">${l}</button>`)}</div>` : ''}</div>
    <div class="section"><div class="section-head"><h3>المؤشرات المحسوبة تلقائيًا</h3></div>
      <div class="metrics">${metric('ROAS', kpi.roas(m.roas), 'm-green')}${metric('CPA', kpi.cpa(m.cpa), 'm-blue')}${metric('CTR', kpi.ctr(m.ctr), 'm-purple')}${metric('CPC', kpi.cpc(m.cpc), 'm-gold')}
        ${metric('CPM', kpi.cpm(m.cpm), 'm-blue')}${metric('معدل التحويل', kpi.cvr(m.cvr), 'm-green')}${metric('متوسط الطلب', kpi.aov(m.aov), 'm-gold')}${metric('الطلبات', n(k.orders), 'm-purple')}</div>
      <p class="muted xs" style="margin:6px 2px 0">تظهر المؤشرات فقط عند توفر البيانات اللازمة لحسابها.</p></div>
    <div class="section card"><div class="kvlist">
      ${[['المصروف', money(k.spend)], ['المبيعات', money(k.sales)], ['المشاهدات', n(k.impressions)], ['النقرات', n(k.clicks)], ['التحويلات', n(k.conversions)], ['الميزانية اليومية', money(k.daily_budget)], ['الميزانية الإجمالية', money(k.total_budget)],
        ['نوع الحملة', k.type], ['الهدف', k.objective], ['الفترة', `${k.start_date ? date(k.start_date) : '—'} ← ${k.end_date ? date(k.end_date) : 'مستمرة'}`]].map(([a, b]) => html`<div><span>${a}</span><span>${b || '—'}</span></div>`)}
      ${k.links ? html`<div><span>الروابط</span><span>${k.links.split('\n').filter(Boolean).map((u) => html`<a class="link ltr" target="_blank" rel="noopener noreferrer" href="${/^https?:/.test(u) ? u : '#'}">${u}</a><br>`)}</span></div>` : ''}
      ${k.notes ? html`<div><span>ملاحظات</span><span style="white-space:pre-wrap">${k.notes}</span></div>` : ''}</div>
      ${can('campaigns.edit') ? html`<div class="grid-3" style="margin-top:12px"><button class="btn primary" data-snap>${icon('plus', 'sm')} تسجيل أداء</button><button class="btn ghost" data-edit>${icon('edit', 'sm')} تعديل</button><button class="btn danger" data-del>${icon('trash', 'sm')} حذف</button></div>` : ''}</div>
    <div class="section card"><div class="section-head"><h3>تاريخ أداء الحملة</h3><span class="muted small">${snaps.length} سجل</span></div>
      ${snaps.length > 1 ? html`${raw2(chart({ labels: snaps.map((s) => dateShort(s.date)), height: 180, series: [{ name: 'المصروف', values: snaps.map((s) => s.spend), color: '#f5b544', type: 'bar' }, { name: 'المبيعات', values: snaps.map((s) => s.sales), color: '#22c55e', type: 'bar' }, { name: 'ROAS', values: snaps.map((s) => computeMetrics(s).roas), color: '#ff2d78', type: 'line', axis: 'right', unit: 'x' }] }))}` : ''}
      <div class="list" style="margin-top:10px">${d.snapshots.length ? d.snapshots.map((s) => { const sm = computeMetrics(s); return html`<div class="item" style="cursor:default"><div class="it-body"><div class="it-title">${date(s.date)}</div><div class="it-sub">مصروف ${n(s.spend)} • مبيعات ${n(s.sales)} • طلبات ${n(s.orders)} • ROAS ${kpi.roas(sm.roas)}${s.note ? ' • ' + s.note : ''}</div></div>${can('campaigns.edit') ? html`<button class="icon-btn" data-del-snap="${s.id}">${icon('trash', 'sm')}</button>` : ''}</div>`; }) : empty('سجّل أداء الحملة دوريًا لمتابعة تطورها', 'activity')}</div></div>
    <div class="section card"><div class="section-head"><h3>سجل التعديلات</h3></div>
      <div class="stack">${d.history.length ? d.history.map((h) => html`<div class="small" style="border-bottom:1px solid var(--border);padding:8px 0"><b>${h.action}</b> <span class="muted">• ${dateTime(h.created_at)} • ${h.user_name}</span><div class="xs muted" style="word-break:break-word">${h.details}</div></div>`) : html`<p class="muted small" style="margin:0">لا يوجد</p>`}</div></div>`);
  main.addEventListener('click', async (e) => {
    try {
      const s = e.target.closest('[data-status]');
      if (s) { await put(`/api/campaigns/${k.id}`, { status: s.dataset.status }); toast('تم تحديث الحالة'); return refresh(); }
      if (e.target.closest('[data-snap]')) { if (await snapshotForm(k)) refresh(); return; }
      if (e.target.closest('[data-edit]')) { if (await campaignForm({ campaign: k })) refresh(); return; }
      if (e.target.closest('[data-del]') && await confirmBox(`حذف الحملة «${k.name}» وسجل أدائها؟`, { danger: true, ok: 'حذف' })) { await del(`/api/campaigns/${k.id}`); toast('تم حذف الحملة'); return go('#/campaigns'); }
      const ds = e.target.closest('[data-del-snap]');
      if (ds && await confirmBox('حذف هذا السجل؟ سيتم خصم أرقامه من إجماليات الحملة.', { danger: true, ok: 'حذف' })) { await del(`/api/snapshots/${ds.dataset.delSnap}`); refresh(); }
    } catch (err) { toast(err.message, 'err'); }
  });
}
import { raw as raw2 } from '../ui.js';
