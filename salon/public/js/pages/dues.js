// Dues overview: every barber's due / paid / remaining and the shop's share.
import { html, icon, mount, money, avatar, empty } from '../ui.js';
import { get, qs } from '../api.js';
import { setTitle, can, go } from '../app.js';
import { periodChips, bindPeriod, periodFromQuery, periodLabel, downloadCsv } from './common.js';
import { paymentForm } from './dues-employee.js';

export async function render(view, { query, isCurrent }) {
  setTitle('المستحقات والدفعات');
  const p = periodFromQuery(query, 'month');
  const d = await get('/api/dues' + qs({ from: p.from, to: p.to }));
  if (!isCurrent()) return;
  const P = d.period;
  mount(view, html`
    <div class="page-head"><div><h2>المستحقات والدفعات</h2><p>الرصيد الإجمالي لكل حلاق + نشاط ${periodLabel(p)}</p></div>
      <div class="actions">${can('payments.manage') ? html`<button class="btn primary" data-pay>${icon('banknote', 'sm')} تسجيل دفعة</button>` : ''}<button class="btn sm" data-csv>${icon('download', 'sm')} CSV</button></div></div>
    ${periodChips(p)}
    <div class="grid g4" style="margin:14px 0">
      <div class="kpi"><div class="lbl">مبيعات الفترة</div><div class="val">${money(P?.sales)}</div></div>
      <div class="kpi"><div class="lbl">مستحق الحلاقين (الفترة)</div><div class="val">${money(P?.barber_due)}</div><div class="sub">مدفوع في الفترة ${money(P?.paid)}</div></div>
      <div class="kpi"><div class="lbl">حصة المحل (الفترة)</div><div class="val gold">${money(P?.shop_share)}</div></div>
      <div class="kpi hl"><div class="lbl">المتبقي الإجمالي للحلاقين</div><div class="val">${money(d.totals.remaining)}</div><div class="sub">مستحق ${money(d.totals.barber_due)} • مدفوع ${money(d.totals.paid)}</div></div>
    </div>
    <div class="only-desk"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الحلاق</th><th>مبيعات الفترة</th><th>مستحق الفترة</th><th>حصة المحل</th><th>مدفوع الفترة</th><th>إجمالي المستحق</th><th>إجمالي المدفوع</th><th>المتبقي</th></tr></thead><tbody>
      ${d.items.map((x) => html`<tr class="click" data-href="#/dues/${x.user.id}"><td><div style="display:flex;align-items:center;gap:10px">${avatar(x.user)}<b>${x.user.full_name}</b></div></td>
        <td>${money(x.period?.sales)}</td><td>${money(x.period?.barber_due)}</td><td>${money(x.period?.shop_share)}</td><td>${money(x.period?.paid)}</td><td>${money(x.total.barber_due)}</td><td>${money(x.total.paid)}</td><td><b class="gold">${money(x.total.remaining)}</b></td></tr>`)}</tbody>
      <tfoot><tr><td>الإجمالي</td><td>${money(P?.sales)}</td><td>${money(P?.barber_due)}</td><td>${money(P?.shop_share)}</td><td>${money(P?.paid)}</td><td>${money(d.totals.barber_due)}</td><td>${money(d.totals.paid)}</td><td>${money(d.totals.remaining)}</td></tr></tfoot></table></div></div>
    <div class="only-mob list">${d.items.length ? d.items.map((x) => html`<a class="row" href="#/dues/${x.user.id}">${avatar(x.user)}<div class="main"><div class="t">${x.user.full_name}</div>
      <div class="s"><span>الفترة: مستحق ${money(x.period?.barber_due)}</span><span>مدفوع ${money(x.total.paid)}</span></div></div><div class="end"><small class="muted">المتبقي</small><b class="gold">${money(x.total.remaining)}</b></div></a>`) : empty('لا يوجد حلاقون', 'users')}</div>`);
  bindPeriod(view, p, (o) => go('#/dues' + qs({ type: o.type, from: o.type === 'custom' ? o.from : '', to: o.type === 'custom' ? o.to : '' })));
  view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  view.querySelector('[data-pay]')?.addEventListener('click', () => paymentForm(null, () => render(view, { query, isCurrent })));
  view.querySelector('[data-csv]').addEventListener('click', () => downloadCsv([['الحلاق', 'مبيعات الفترة', 'مستحق الفترة', 'حصة المحل', 'مدفوع الفترة', 'إجمالي المستحق', 'إجمالي المدفوع', 'المتبقي'],
    ...d.items.map((x) => [x.user.full_name, x.period?.sales, x.period?.barber_due, x.period?.shop_share, x.period?.paid, x.total.barber_due, x.total.paid, x.total.remaining])], `dues-${p.from}-${p.to}.csv`));
}
