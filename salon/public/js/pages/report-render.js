// Builds the printable Arabic RTL employee report from a frozen snapshot.
import { html, n, date, dateTime, clock, dayLabel, statusText, esc } from '../ui.js';
import { minutesLabel, INVOICE_STATUS } from '../shared.js';

const TYPE = { day: 'تقرير يومي', week: 'تقرير أسبوعي', month: 'تقرير شهري', custom: 'تقرير فترة مخصصة' };
const sar = (v) => `${n(v)} ر.س`;

export function reportHtml(s, { periodType = 'custom', includeImages = false } = {}) {
  const f = s.financial, a = s.attendance.summary, e = s.employee;
  const counted = s.invoices.filter((i) => i.counted);
  const byDay = {};
  for (const i of counted) byDay[i.work_date] = (byDay[i.work_date] || 0) + i.amount;
  const days = s.attendance.rows.map((r) => r.date);
  const max = Math.max(1, ...Object.values(byDay));
  const imgs = includeImages ? s.invoices.flatMap((i) => i.images.map((fid) => ({ fid, i }))) : [];
  return html`<div class="rpt">
    <div class="cover">
      <img class="lg" src="/img/logo-original.jpg" alt="">
      <div style="flex:1">
        <h1>${TYPE[periodType] || 'تقرير الموظف'}</h1>
        <div class="meta">الفترة: <b class="n">${s.from}</b> إلى <b class="n">${s.to}</b> • رقم التقرير <b class="n">${s.report_number ?? '—'}</b></div>
        <div class="meta">تاريخ الإصدار: ${dateTime(s.generated_at)}</div>
        <div class="emp">${e.photo_file_id ? html`<img src="/api/files/${e.photo_file_id}" alt="">` : ''}<div><b>${e.full_name}</b><div class="meta" style="margin:0">${e.job_title || 'حلاق'}${e.start_date ? html` • منذ <span class="n">${e.start_date}</span>` : ''}</div></div></div>
      </div>
    </div>
    <div class="goldline"></div>
    <div class="page">
      <h2>الملخص المالي</h2>
      <div class="boxes">
        <div class="box hl"><span>إجمالي المبيعات</span><b>${sar(f.sales)}</b></div>
        <div class="box"><span>عدد الفواتير المحتسبة</span><b>${f.count}</b></div>
        <div class="box"><span>نسبة الحلاق / المحل (الحالية)</span><b>${n(s.rate?.barber_rate)}% / ${n(s.rate?.shop_rate)}%</b></div>
        <div class="box hl"><span>مستحق الحلاق</span><b>${sar(f.barber_due)}</b></div>
        <div class="box"><span>حصة المحل</span><b>${sar(f.shop_share)}</b></div>
        <div class="box"><span>المدفوع خلال الفترة</span><b>${sar(f.paid)}</b></div>
        <div class="box"><span>المتبقي للفترة</span><b>${sar(f.remaining)}</b></div>
        <div class="box hl"><span>الرصيد المتبقي الإجمالي</span><b>${sar(f.balance_all_time)}</b></div>
      </div>
      ${days.length > 1 ? html`<div class="no-break" style="margin-top:14px"><div style="font-size:11px;color:#7a7064;margin-bottom:4px">المبيعات اليومية</div>
        <div class="bars">${days.map((d) => html`<i style="height:${((byDay[d] || 0) / max) * 100}%" title="${d}"></i>`)}</div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#7a7064" class="n"><span>${days[0]}</span><span>${days[days.length - 1]}</span></div></div>` : ''}

      <h2>ملخص الحضور</h2>
      <div class="boxes">
        <div class="box"><span>أيام الدوام</span><b>${a.scheduled_days}</b></div>
        <div class="box"><span>أيام الحضور</span><b>${a.present_days}</b></div>
        <div class="box"><span>أيام الغياب</span><b>${a.absent_days}</b></div>
        <div class="box"><span>أيام الإجازة</span><b>${a.leave_days}</b></div>
        <div class="box"><span>مرات التأخير</span><b>${a.late_count}</b></div>
        <div class="box"><span>مجموع دقائق التأخير</span><b>${a.late_minutes}</b></div>
        <div class="box"><span>مرات الخروج المبكر</span><b>${a.early_count}</b></div>
        <div class="box hl"><span>ساعات العمل (المتوسط)</span><b>${minutesLabel(a.worked_minutes)} (${minutesLabel(a.avg_worked_minutes)})</b></div>
      </div>

      <h2>جدول الحضور</h2>
      <table><thead><tr><th>التاريخ</th><th>الدوام</th><th>الحضور</th><th>الانصراف</th><th>التأخير</th><th>ساعات العمل</th><th>الحالة</th></tr></thead>
        <tbody>${s.attendance.rows.map((r) => html`<tr><td>${dayLabel(r.date)}</td><td class="n">${r.shift || '—'}</td><td class="n">${r.check_in_at ? clock(r.check_in_at) : '—'}</td><td class="n">${r.check_out_at ? clock(r.check_out_at) : '—'}</td>
          <td>${r.late_minutes ? minutesLabel(r.late_minutes) : '—'}</td><td>${r.worked_minutes ? minutesLabel(r.worked_minutes) : '—'}</td><td>${statusText(r.status)}</td></tr>`)}</tbody></table>

      <h2>جدول الفواتير</h2>
      ${s.invoices.length ? html`<table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الوقت</th><th>المبلغ</th><th>نسبة الحلاق</th><th>مستحق الحلاق</th><th>مستحق المحل</th><th>الحالة</th></tr></thead>
        <tbody>${s.invoices.map((i) => html`<tr style="${i.counted ? '' : 'color:#a39a8c'}"><td class="n">#${i.number}</td><td class="n">${i.work_date}</td><td class="n">${clock(i.created_at)}</td><td class="n">${n(i.amount)}</td><td class="n">${n(i.barber_rate)}%</td><td class="n">${n(i.barber_share)}</td><td class="n">${n(i.shop_share)}</td><td>${INVOICE_STATUS[i.status]}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="3">الإجمالي المحتسب</td><td class="n">${n(f.sales)}</td><td></td><td class="n">${n(f.barber_due)}</td><td class="n">${n(f.shop_share)}</td><td></td></tr></tfoot></table>
        ${counted.length !== s.invoices.length ? html`<div style="font-size:11px;color:#7a7064;margin-top:4px">الفواتير الباهتة غير محتسبة مالياً (${s.salon.count_mode === 'on_approve' ? 'تُحتسب بعد الاعتماد فقط' : 'مرفوضة'}).</div>` : ''}`
      : html`<div style="color:#7a7064">لا توجد فواتير في هذه الفترة.</div>`}

      ${s.payments.length ? html`<h2>الدفعات خلال الفترة</h2><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>رقم العملية</th></tr></thead>
        <tbody>${s.payments.map((p) => html`<tr><td class="n">${p.paid_on}</td><td class="n">${n(p.amount)}</td><td>${p.method}</td><td class="n">${p.reference || '—'}</td></tr>`)}</tbody></table>` : ''}

      <div class="foot"><span>${s.salon.name} – ${s.salon.name_ar}${s.salon.phone ? ' • ' + s.salon.phone : ''}</span><span>المبالغ بالريال السعودي • ${s.salon.footer || ''}</span></div>
      ${imgs.length ? html`<div class="page-break"></div><h2>ملحق: صور الفواتير</h2><div class="imgs">${imgs.map(({ fid, i }) => html`<figure><img src="/api/files/${fid}" alt=""><figcaption>#<span class="n">${i.number}</span> • <span class="n">${i.work_date}</span> • <span class="n">${n(i.amount)}</span> ر.س</figcaption></figure>`)}</div>` : ''}
    </div>
  </div>`;
}

/** Fit the 794px-wide report into its preview container. */
export function fitPreview(box) {
  const r = box.querySelector('.rpt'); if (!r) return;
  const s = Math.min(1, (box.clientWidth - 20) / 794);
  r.style.transform = `scale(${s})`;
  r.parentElement.style.height = `${r.offsetHeight * s + 4}px`;
}
