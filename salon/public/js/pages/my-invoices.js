import { html, icon, mount, money, n, empty } from '../ui.js';
import { get, qs } from '../api.js';
import { setTitle, go } from '../app.js';
import { periodChips, bindPeriod, periodFromQuery, periodLabel, invoiceRow, newInvoiceSheet } from './common.js';
import { INVOICE_STATUS } from '../shared.js';

export async function render(view, { query, isCurrent }) {
  setTitle('فواتيري');
  const p = periodFromQuery(query, 'day');
  const d = await get('/api/me/invoices' + qs({ from: p.from, to: p.to, status: query.status }));
  if (!isCurrent()) return;
  const nav = (o) => go('#/me/invoices' + qs({ type: o.type, from: o.type === 'custom' ? o.from : '', to: o.type === 'custom' ? o.to : '', status: o.status ?? query.status }));
  mount(view, html`
    <div class="page-head"><div><h2>فواتيري</h2><p>${periodLabel(p)}</p></div>
      <div class="actions"><button class="btn primary" data-new>${icon('camera')} تسجيل فاتورة</button></div></div>
    ${periodChips(p)}
    <div class="chips" style="margin-top:10px">
      <button class="chip ${!query.status ? 'active' : ''}" data-s="">كل الحالات</button>
      ${Object.entries(INVOICE_STATUS).map(([k, l]) => html`<button class="chip ${query.status === k ? 'active' : ''}" data-s="${k}">${l}</button>`)}</div>
    <div class="grid g3" style="margin:14px 0">
      <div class="kpi hl"><div class="lbl">الإجمالي المحتسب</div><div class="val">${money(d.totals.sales)}</div><div class="sub"><span class="num">${d.totals.count}</span> فاتورة</div></div>
      <div class="kpi"><div class="lbl">حصتي</div><div class="val">${money(d.totals.barber_share)}</div></div>
      <div class="kpi"><div class="lbl">حصة المحل</div><div class="val">${money(d.totals.shop_share)}</div></div>
    </div>
    <div class="list">${d.items.length ? d.items.map((i) => invoiceRow(i)) : empty('لا توجد فواتير في هذه الفترة', 'receipt')}</div>`);
  bindPeriod(view, p, nav);
  view.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => nav({ ...p, status: b.dataset.s })));
  const open = () => newInvoiceSheet(() => render(view, { query, isCurrent }));
  view.querySelector('[data-new]').addEventListener('click', open);
  if (query.new === '1') { history.replaceState(null, '', '#/me/invoices'); open(); }
}
