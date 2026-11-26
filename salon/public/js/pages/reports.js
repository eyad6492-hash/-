// General reports for any period: revenue, shares, attendance & performance per employee.
import { html, icon, mount, money, n, avatar, empty } from '../ui.js';
import { get, qs } from '../api.js';
import { setTitle, go } from '../app.js';
import { periodChips, bindPeriod, periodFromQuery, periodLabel, barChart, downloadCsv } from './common.js';
import { minutesLabel } from '../shared.js';

export async function render(view, { query, isCurrent }) {
  setTitle('التقارير العامة');
  const p = periodFromQuery(query, 'month');
  const d = await get('/api/reports/summary' + qs({ from: p.from, to: p.to }));
  if (!isCurrent()) return;
  const T = d.totals;
  mount(view, html`
    <div class="page-head"><div><h2>التقارير العامة</h2><p>${periodLabel(p)}</p></div><div class="actions"><button class="btn sm" data-csv>${icon('download', 'sm')} تصدير CSV</button><button class="btn sm" data-print>${icon('printer', 'sm')} طباعة</button></div></div>
    ${periodChips(p)}
    <div class="grid g4" style="margin:14px 0">
      <div class="kpi hl"><div class="lbl">الإيرادات</div><div class="val">${money(T.sales)}</div><div class="sub"><span class="num">${T.count}</span> فاتورة</div></div>
      <div class="kpi"><div class="lbl">حصة الحلاقين</div><div class="val">${money(T.barber)}</div><div class="sub">مدفوع في الفترة ${n(T.paid)}</div></div>
      <div class="kpi"><div class="lbl">حصة المحل</div><div class="val gold">${money(T.shop)}</div></div>
      <div class="kpi"><div class="lbl">الحضور</div><div class="val" style="font-size:17px">${minutesLabel(T.worked_minutes)}</div><div class="sub">تأخير ${T.late_count} مرة • غياب ${T.absent_days} يوم</div></div>
    </div>
    ${d.series.length > 1 ? html`<div class="card" style="margin-bottom:14px"><h3>الإيرادات اليومية</h3>${barChart(d.series.map((s) => ({ label: s.date, short: s.date.slice(8), value: s.sales })))}</div>` : ''}
    <h3 class="section-title">الأداء لكل موظف</h3>
    <div class="only-desk"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الموظف</th><th>الفواتير</th><th>المبيعات</th><th>حصة الحلاق</th><th>حصة المحل</th><th>المدفوع</th><th>حضور</th><th>غياب</th><th>إجازة</th><th>تأخير</th><th>دقائق التأخير</th><th>خروج مبكر</th><th>ساعات العمل</th></tr></thead><tbody>
      ${d.rows.map((r) => html`<tr class="click" data-href="#/employees/${r.user.id}"><td><div style="display:flex;align-items:center;gap:10px">${avatar(r.user)}<b>${r.user.full_name}</b></div></td>
        <td class="num">${r.invoices.count}</td><td>${money(r.invoices.sales)}</td><td>${money(r.invoices.barber_due)}</td><td>${money(r.invoices.shop_share)}</td><td>${money(r.paid)}</td>
        <td class="num">${r.attendance.present_days}</td><td class="num ${r.attendance.absent_days ? 'bad-t' : ''}">${r.attendance.absent_days}</td><td class="num">${r.attendance.leave_days}</td>
        <td class="num ${r.attendance.late_count ? 'warn-t' : ''}">${r.attendance.late_count}</td><td class="num">${r.attendance.late_minutes}</td><td class="num">${r.attendance.early_count}</td><td>${minutesLabel(r.attendance.worked_minutes)}</td></tr>`)}</tbody></table></div></div>
    <div class="only-mob list">${d.rows.length ? d.rows.map((r) => html`<a class="card" href="#/employees/${r.user.id}" style="display:block">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">${avatar(r.user)}<b style="flex:1">${r.user.full_name}</b><b class="gold">${money(r.invoices.sales)}</b></div>
      <div class="grid g3" style="gap:6px;font-size:12.5px"><div><span class="muted">فواتير</span><br><b class="num">${r.invoices.count}</b></div><div><span class="muted">حصة الحلاق</span><br><b>${n(r.invoices.barber_due)}</b></div><div><span class="muted">حصة المحل</span><br><b>${n(r.invoices.shop_share)}</b></div>
        <div><span class="muted">حضور/غياب</span><br><b class="num">${r.attendance.present_days}/${r.attendance.absent_days}</b></div><div><span class="muted">تأخير</span><br><b>${r.attendance.late_count} (${minutesLabel(r.attendance.late_minutes)})</b></div><div><span class="muted">ساعات</span><br><b>${minutesLabel(r.attendance.worked_minutes)}</b></div></div></a>`) : empty('لا توجد بيانات')}</div>`);
  bindPeriod(view, p, (o) => go('#/reports' + qs({ type: o.type, from: o.type === 'custom' ? o.from : '', to: o.type === 'custom' ? o.to : '' })));
  view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  view.querySelector('[data-print]').addEventListener('click', () => print());
  view.querySelector('[data-csv]').addEventListener('click', () => downloadCsv([['الموظف', 'الفواتير', 'المبيعات', 'حصة الحلاق', 'حصة المحل', 'المدفوع', 'أيام الحضور', 'الغياب', 'الإجازة', 'مرات التأخير', 'دقائق التأخير', 'الخروج المبكر', 'دقائق العمل'],
    ...d.rows.map((r) => [r.user.full_name, r.invoices.count, r.invoices.sales, r.invoices.barber_due, r.invoices.shop_share, r.paid, r.attendance.present_days, r.attendance.absent_days, r.attendance.leave_days, r.attendance.late_count, r.attendance.late_minutes, r.attendance.early_count, r.attendance.worked_minutes])], `report-${p.from}-${p.to}.csv`));
}
