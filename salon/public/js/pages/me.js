// Barber home: today's status, big check-in / check-out / new-invoice buttons, income & dues.
import { html, icon, mount, money, n, clock, badge, dayLabel } from '../ui.js';
import { get } from '../api.js';
import { state, setTitle, setUnread } from '../app.js';
import { doAttendance, newInvoiceSheet } from './common.js';
import { minutesLabel } from '../shared.js';

export async function render(view, { isCurrent }) {
  setTitle('الرئيسية');
  const d = await get('/api/me/summary');
  if (!isCurrent()) return;
  setUnread(d.unread);
  const day = d.day, open = d.open_attendance;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  const canIn = !open && !(day.check_in_at);
  const canOut = !!open;
  const statusBadge = open ? badge('open') : badge(day.status);
  mount(view, html`
    <section class="hero">
      <div class="hello">${greet} 👋 • ${dayLabel(d.today)}</div>
      <div class="name">${state.user.full_name}</div>
      <div class="state">${statusBadge}${day.shift ? html`<span class="badge">${icon('clock', 'sm')} دوامك <span class="num">${day.shift}</span></span>` : html`<span class="badge">لا يوجد دوام مجدول اليوم</span>`}</div>
      <div class="times">
        <div><span>الحضور</span><b>${open ? clock(open.check_in_at) : day.check_in_at ? clock(day.check_in_at) : '—'}</b></div>
        <div><span>الانصراف</span><b>${day.check_out_at ? clock(day.check_out_at) : '—'}</b></div>
        <div><span>التأخير</span><b class="${(open?.late_minutes || day.late_minutes) ? 'warn-t' : ''}">${minutesLabel(open?.late_minutes || day.late_minutes)}</b></div>
      </div>
    </section>

    <div class="big-actions" style="margin-top:14px">
      <button class="big-btn ${canIn ? 'primary' : ''}" data-in ${canIn ? '' : 'disabled'}>
        <span class="ic">${icon('login', 'lg')}</span><span><b>تسجيل حضور</b><small>${canIn ? 'سيتم التحقق من موقعك' : 'تم التسجيل'}</small></span></button>
      <button class="big-btn ${canOut ? 'primary' : ''}" data-out ${canOut ? '' : 'disabled'}>
        <span class="ic">${icon('logout', 'lg')}</span><span><b>تسجيل انصراف</b><small>${canOut ? 'عند نهاية الدوام' : 'سجّل الحضور أولاً'}</small></span></button>
      <button class="big-btn wide" data-inv>
        <span class="ic">${icon('camera', 'lg')}</span><span style="flex:1"><b>تسجيل فاتورة</b><small>صوّر الفاتورة وأدخل المبلغ</small></span>${icon('plus', 'lg')}</button>
    </div>

    <h3 class="section-title">دخلي</h3>
    <div class="grid g3">
      <div class="kpi hl"><div class="lbl">${icon('receipt', 'sm')} اليوم</div><div class="val">${money(d.income.day.sales)}</div><div class="sub"><span class="num">${d.income.day.count}</span> فاتورة • حصتي ${n(d.income.day.barber_due)}</div></div>
      <div class="kpi"><div class="lbl">هذا الأسبوع</div><div class="val">${money(d.income.week.sales)}</div><div class="sub"><span class="num">${d.income.week.count}</span> فاتورة • حصتي ${n(d.income.week.barber_due)}</div></div>
      <div class="kpi"><div class="lbl">هذا الشهر</div><div class="val">${money(d.income.month.sales)}</div><div class="sub"><span class="num">${d.income.month.count}</span> فاتورة • حصتي ${n(d.income.month.barber_due)}</div></div>
    </div>

    <h3 class="section-title">مستحقاتي</h3>
    <a class="card gold-edge" href="#/me/dues" style="display:block">
      <div class="grid g3" style="gap:10px">
        <div><div class="muted" style="font-size:12.5px">مستحقي الإجمالي</div><b style="font-size:18px">${money(d.dues.barber_due)}</b></div>
        <div><div class="muted" style="font-size:12.5px">المدفوع</div><b style="font-size:18px">${money(d.dues.paid)}</b></div>
        <div><div class="muted" style="font-size:12.5px">المتبقي</div><b style="font-size:18px" class="gold">${money(d.dues.remaining)}</b></div>
      </div>
      <div class="sep"></div>
      <div class="muted" style="font-size:12.5px;display:flex;justify-content:space-between"><span>نسبتي <b class="gold num">${n(d.rate?.barber_rate)}%</b> • نسبة المحل <b class="num">${n(d.rate?.shop_rate)}%</b></span><span>حصة المحل ${money(d.dues.shop_share)}</span></div>
    </a>

    <div class="grid g2" style="margin-top:14px">
      <a class="row" href="#/me/attendance">${icon('clock')}<div class="main"><div class="t">سجل الحضور</div></div>${icon('chevL', 'sm')}</a>
      <a class="row" href="#/me/leaves">${icon('palm')}<div class="main"><div class="t">الإجازات</div></div>${icon('chevL', 'sm')}</a>
      <a class="row" href="#/me/reports">${icon('fileCheck')}<div class="main"><div class="t">تقاريري</div></div>${icon('chevL', 'sm')}</a>
      <a class="row" href="#/install">${icon('phoneApp')}<div class="main"><div class="t">تثبيت التطبيق</div></div>${icon('chevL', 'sm')}</a>
    </div>`);
  const reload = () => render(view, { isCurrent });
  view.querySelector('[data-in]').addEventListener('click', async (e) => { if (await doAttendance('in', e.currentTarget)) reload(); });
  view.querySelector('[data-out]').addEventListener('click', async (e) => { if (await doAttendance('out', e.currentTarget)) reload(); });
  view.querySelector('[data-inv]').addEventListener('click', () => newInvoiceSheet(() => reload()));
}
