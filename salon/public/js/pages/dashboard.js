import { html, icon, mount, money, n, clock, badge, avatar, dayLabel, dateShort } from '../ui.js';
import { get } from '../api.js';
import { setTitle, can, setUnread } from '../app.js';
import { barChart } from './common.js';
import { minutesLabel } from '../shared.js';

const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
export async function render(view, { isCurrent }) {
  setTitle('لوحة التحكم');
  const d = await get('/api/dashboard');
  if (!isCurrent()) return;
  get('/api/notifications/unread').then((r) => setUnread(r.unread)).catch(() => {});
  const c = d.counts, t = d.today_totals;
  const mChange = pct(d.month.sales, d.prev_month.sales);
  mount(view, html`
    <div class="page-head"><div><h2>لوحة التحكم</h2><p>${dayLabel(d.today)} • يوم العمل الحالي</p></div>
      <div class="actions">${can('invoices.review') && d.pending.invoices_pending ? html`<a class="btn" href="#/invoices?pending=1">${icon('receipt', 'sm')} ${d.pending.invoices_pending} بانتظار المراجعة</a>` : ''}
        ${can('leaves.manage') && d.pending.leaves_pending ? html`<a class="btn" href="#/leaves">${icon('palm', 'sm')} ${d.pending.leaves_pending} طلب إجازة</a>` : ''}
        ${can('attendance.view') && d.pending.attempts_rejected ? html`<a class="btn danger" href="#/attendance?tab=attempts">${icon('mapPin', 'sm')} ${d.pending.attempts_rejected} محاولة مرفوضة</a>` : ''}</div></div>

    <div class="grid g4">
      <div class="kpi hl"><span class="ic">${icon('coins', 'lg')}</span><div class="lbl">إيرادات اليوم</div><div class="val">${money(t.sales)}</div><div class="sub"><span class="num">${t.count}</span> فاتورة محتسبة • ${t.invoices_all} مسجلة</div></div>
      <div class="kpi"><span class="ic">${icon('scissors', 'lg')}</span><div class="lbl">مستحقات الحلاقين اليوم</div><div class="val">${money(t.barber)}</div></div>
      <div class="kpi"><span class="ic">${icon('building', 'lg')}</span><div class="lbl">حصة المحل اليوم</div><div class="val gold">${money(t.shop)}</div></div>
      <a class="kpi" href="#/dues"><span class="ic">${icon('wallet', 'lg')}</span><div class="lbl">المتبقي للحلاقين (إجمالي)</div><div class="val">${money(d.dues.remaining)}</div><div class="sub">مدفوع ${n(d.dues.paid)}</div></a>
    </div>

    <h3 class="section-title">الحضور اليوم</h3>
    <div class="grid g4">
      <div class="kpi"><div class="lbl">الموظفون</div><div class="val num">${c.employees}</div><div class="sub">راحة ${c.off} • إجازة ${c.on_leave}</div></div>
      <div class="kpi"><div class="lbl">الحاضرون</div><div class="val num ok-t">${c.present}</div><div class="sub">داخل الدوام الآن ${c.in_shift} • انصرف ${c.checked_out}</div></div>
      <div class="kpi"><div class="lbl">المتأخرون</div><div class="val num ${c.late ? 'warn-t' : ''}">${c.late}</div><div class="sub">لم يسجل بعد ${c.not_checked_in}</div></div>
      <div class="kpi"><div class="lbl">الغائبون</div><div class="val num ${c.absent ? 'bad-t' : ''}">${c.absent}</div></div>
    </div>

    <div class="split" style="margin-top:6px">
      <div>
        <h3 class="section-title">الموظفون اليوم</h3>
        <div class="only-desk"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الموظف</th><th>الحالة</th><th>الدوام</th><th>حضور</th><th>انصراف</th><th>تأخير</th><th>الفواتير</th><th>مبيعات اليوم</th><th>المتبقي له</th></tr></thead><tbody>
          ${d.employees.map((e) => html`<tr class="click" data-href="#/employees/${e.user.id}"><td><div style="display:flex;align-items:center;gap:10px">${avatar(e.user)}<b>${e.user.full_name}</b></div></td>
            <td>${badge(e.day.status)}</td><td class="num">${e.day.shift || '—'}</td><td class="num">${clock(e.day.check_in_at)}</td><td class="num">${clock(e.day.check_out_at)}</td>
            <td class="${e.day.late_minutes ? 'warn-t' : ''}">${e.day.late_minutes ? minutesLabel(e.day.late_minutes) : '—'}</td><td class="num">${e.invoices_today}</td><td>${money(e.sales_today)}</td><td>${money(e.remaining)}</td></tr>`)}
        </tbody></table></div></div>
        <div class="only-mob list">${d.employees.map((e) => html`<a class="row" href="#/employees/${e.user.id}">${avatar(e.user)}
          <div class="main"><div class="t">${e.user.full_name}</div><div class="s">${e.day.check_in_at ? html`<span>حضور ${clock(e.day.check_in_at)}</span>` : ''}${e.day.check_out_at ? html`<span>انصراف ${clock(e.day.check_out_at)}</span>` : ''}${e.day.late_minutes ? html`<span class="warn-t">تأخير ${minutesLabel(e.day.late_minutes)}</span>` : ''}<span><span class="num">${e.invoices_today}</span> فاتورة</span></div></div>
          <div class="end"><b>${money(e.sales_today)}</b><div style="margin-top:4px">${badge(e.day.status)}</div></div></a>`)}</div>
      </div>
      <div>
        <h3 class="section-title">الأسبوع والشهر</h3>
        <div class="grid g2">
          <div class="kpi"><div class="lbl">هذا الأسبوع</div><div class="val">${money(d.week.sales)}</div><div class="sub"><span class="num">${d.week.count}</span> فاتورة • المحل ${n(d.week.shop)}</div></div>
          <div class="kpi"><div class="lbl">هذا الشهر</div><div class="val">${money(d.month.sales)}</div><div class="sub">${mChange === null ? 'لا مقارنة' : html`<span class="${mChange >= 0 ? 'ok-t' : 'bad-t'}">${mChange >= 0 ? '▲' : '▼'} ${Math.abs(mChange)}%</span> عن الشهر الماضي`}</div></div>
          <div class="kpi"><div class="lbl">مستحقات الشهر</div><div class="val">${money(d.month.barber)}</div></div>
          <div class="kpi"><div class="lbl">حصة المحل للشهر</div><div class="val gold">${money(d.month.shop)}</div></div>
        </div>
        <div class="card" style="margin-top:12px"><h3>الإيرادات – آخر 30 يوماً</h3>${barChart(d.series.map((s) => ({ label: s.date, short: s.date.slice(8), value: s.sales })))}</div>
      </div>
    </div>`);
  view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
}
