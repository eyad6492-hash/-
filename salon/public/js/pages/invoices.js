// Invoice review for managers: filters, pending queue, quick approve.
import { html, icon, mount, money, empty, sel, toast } from '../ui.js';
import { get, post, qs, lookups } from '../api.js';
import { setTitle, can, go, state } from '../app.js';
import { invoiceRow, periodChips, bindPeriod, periodFromQuery, periodLabel, downloadCsv } from './common.js';
import { INVOICE_STATUS } from '../shared.js';

export async function render(view, { query, isCurrent }) {
  setTitle('مراجعة الفواتير');
  const pending = query.pending === '1';
  const p = pending ? { type: 'all', from: '', to: '' } : periodFromQuery(query, 'day');
  const [staff, d] = await Promise.all([lookups.staff(), get('/api/invoices' + qs({ from: p.from, to: p.to, user_id: query.user_id, status: query.status, pending: pending ? 1 : '' }))]);
  if (!isCurrent()) return;
  const nav = (o) => go('#/invoices' + qs({ type: o.type, from: o.type === 'custom' ? o.from : '', to: o.type === 'custom' ? o.to : '', user_id: o.user_id ?? query.user_id, status: o.status ?? query.status, pending: o.pending ?? '' }));
  mount(view, html`
    <div class="page-head"><div><h2>مراجعة الفواتير</h2><p>${pending ? 'بانتظار المراجعة أو بها طلب تعديل' : periodLabel(p)}</p></div>
      <div class="actions"><button class="btn sm" data-csv>${icon('download', 'sm')} تصدير CSV</button></div></div>
    <div class="chips" style="margin-bottom:10px"><button class="chip ${pending ? 'active' : ''}" data-pending>${icon('clock', 'sm')} بانتظار المراجعة</button></div>
    ${pending ? '' : periodChips(p, { allowAll: true })}
    <div class="toolbar" style="margin-top:10px">${sel('u', staff.filter((s) => s.works_shifts).map((s) => ({ v: s.id, l: s.full_name })), query.user_id || '', { empty: 'كل الحلاقين' })}
      ${sel('s', INVOICE_STATUS, query.status || '', { empty: 'كل الحالات' })}</div>
    <div class="grid g3" style="margin:12px 0">
      <div class="kpi hl"><div class="lbl">الإجمالي المحتسب</div><div class="val">${money(d.totals.sales)}</div><div class="sub"><span class="num">${d.items.length}</span> فاتورة معروضة</div></div>
      <div class="kpi"><div class="lbl">حصة الحلاقين</div><div class="val">${money(d.totals.barber_share)}</div></div>
      <div class="kpi"><div class="lbl">حصة المحل</div><div class="val gold">${money(d.totals.shop_share)}</div></div></div>
    ${can('invoices.review') && d.items.some((i) => i.status === 'registered' || i.status === 'under_review') ? html`<button class="btn ok sm" data-bulk style="margin-bottom:10px">${icon('check', 'sm')} اعتماد كل المعروض (مسجلة/قيد المراجعة)</button>` : ''}
    <div class="list">${d.items.length ? d.items.map((i) => invoiceRow(i, { showName: true })) : empty('لا توجد فواتير', 'receipt')}</div>`);
  if (!pending) bindPeriod(view, p, (o) => nav(o));
  view.querySelector('[data-pending]').addEventListener('click', () => nav({ ...p, pending: pending ? '' : '1' }));
  view.querySelector('[name=u]').addEventListener('change', (e) => nav({ ...p, user_id: e.target.value, pending: pending ? 1 : '' }));
  view.querySelector('[name=s]').addEventListener('change', (e) => nav({ ...p, status: e.target.value, pending: pending ? 1 : '' }));
  view.querySelector('[data-csv]').addEventListener('click', () => downloadCsv([['رقم', 'الحلاق', 'التاريخ', 'المبلغ', 'نسبة الحلاق', 'حصة الحلاق', 'نسبة المحل', 'حصة المحل', 'الحالة', 'الخدمة', 'ملاحظات'],
    ...d.items.map((i) => [i.number, i.full_name, i.work_date, i.amount, i.barber_rate, i.barber_share, i.shop_rate, i.shop_share, INVOICE_STATUS[i.status], i.service_type, i.notes])], `invoices-${state.today}.csv`));
  view.querySelector('[data-bulk]')?.addEventListener('click', async (e) => {
    const list = d.items.filter((i) => i.status === 'registered' || i.status === 'under_review');
    e.currentTarget.disabled = true; let ok = 0;
    for (const i of list) { try { await post(`/api/invoices/${i.id}/review`, { status: 'approved' }); ok++; } catch (err) { toast(`#${i.number}: ${err.message}`, 'err'); } }
    toast(`تم اعتماد ${ok} فاتورة`); render(view, { query, isCurrent });
  });
}
