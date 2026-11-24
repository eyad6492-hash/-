import { html, icon, mount, n, logo, dateShort, dateTime, empty, kpi, debounce } from '../ui.js';
import { get } from '../api.js';
import { can, setTitle } from '../app.js';
import { computeMetrics } from '../shared.js';

export default async function reportsPage(main, _p, q, stale) {
  setTitle('تقارير العملاء');
  const { items } = await get('/api/reports');
  if (stale()) return;
  mount(main, html`
    ${can('reports.create') ? html`<a class="cta-review" href="#/reports/new" style="margin-bottom:14px"><span class="ic">${icon('bars', 'lg')}</span><div class="grow"><div class="bold" style="font-size:17px">إنشاء تقرير سريع</div><div class="muted small">تقرير احترافي جاهز للواتساب و PDF في أقل من دقيقة</div></div>${icon('chevL')}</a>` : ''}
    <div class="input-icon" style="margin:12px 0">${icon('search')}<input type="search" data-q placeholder="ابحث بالعميل أو المنصة…" value="${q.q || ''}"></div>
    <div class="list grid-auto" data-list></div>`);
  const draw = (s = '') => {
    const r = items.filter((x) => !s || `${x.client_name} ${x.platform} ${x.store_name || ''}`.toLowerCase().includes(s.toLowerCase()));
    mount(main.querySelector('[data-list]'), r.length ? r.map((x) => { const m = computeMetrics(x); return html`<a class="item" href="#/reports/${x.id}">${logo({ name: x.client_name, logo: x.logo })}<div class="it-body"><div class="it-title">${x.client_name}</div><div class="it-sub">${x.platform} • ${dateShort(x.period_from)} ← ${dateShort(x.period_to)}</div><div class="xs muted">مصروف ${n(x.spend, 0)} • مبيعات ${n(x.sales, 0)} • ${dateTime(x.created_at)}</div></div><span class="badge ${m.roas >= 3 ? 'b-green' : m.roas ? 'b-gold' : 'b-gray'}">ROAS ${kpi.roas(m.roas)}</span></a>`; }) : empty('لا توجد تقارير بعد', 'bars'));
  };
  draw(q.q || '');
  main.querySelector('[data-q]').addEventListener('input', debounce((e) => draw(e.target.value.trim()), 150));
}
