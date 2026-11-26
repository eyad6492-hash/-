// Building blocks shared by several pages.
import { html, raw, icon, money, n, date, dateShort, dateTime, clock, dayLabel, badge, toast, formSheet, field, inp, ta, sheet, empty, esc } from '../ui.js';
import { get, post, upload, qs } from '../api.js';
import { photoPicker, gpsFix } from '../media.js';
import { periodRange, minutesLabel, INVOICE_STATUS, round2 } from '../shared.js';
import { state } from '../app.js';

export const today = () => state.today;

/** Period selector chips (today / week / month / custom). Calls onChange({type, from, to}). */
export function periodChips(cur, { allowAll = false } = {}) {
  const opts = [['day', 'اليوم'], ['week', 'الأسبوع'], ['month', 'الشهر'], ['custom', 'فترة مخصصة']];
  if (allowAll) opts.push(['all', 'الكل']);
  return html`<div class="chips" data-period>${opts.map(([k, l]) => html`<button class="chip ${cur.type === k ? 'active' : ''}" data-p="${k}" type="button">${l}</button>`)}</div>
    <div class="toolbar ${cur.type === 'custom' ? '' : 'hidden'}" data-custom style="margin-top:10px">
      <input type="date" data-from value="${cur.from || ''}"> <span class="muted">إلى</span> <input type="date" data-to value="${cur.to || ''}">
      <button class="btn sm primary" type="button" data-apply>عرض</button></div>`;
}
export function bindPeriod(root, cur, onChange) {
  root.querySelectorAll('[data-period] [data-p]').forEach((b) => b.addEventListener('click', () => {
    const type = b.dataset.p;
    if (type === 'custom') { root.querySelector('[data-custom]').classList.remove('hidden'); root.querySelectorAll('[data-period] .chip').forEach((c) => c.classList.toggle('active', c === b)); return; }
    onChange(type === 'all' ? { type, from: '', to: '' } : { type, ...periodRange(type, today()) });
  }));
  root.querySelector('[data-apply]')?.addEventListener('click', () => {
    const from = root.querySelector('[data-from]').value, to = root.querySelector('[data-to]').value;
    if (!from || !to || to < from) return toast('حدد فترة صحيحة', 'err');
    onChange({ type: 'custom', from, to });
  });
}
export const periodFromQuery = (q, def = 'month') => {
  if (q.from && q.to) return { type: q.type || 'custom', from: q.from, to: q.to };
  if (q.type === 'all') return { type: 'all', from: '', to: '' };
  const t = q.type || def; return { type: t, ...periodRange(t, today()) };
};
export const periodLabel = (p) => (p.type === 'all' ? 'كل الفترات' : p.from === p.to ? date(p.from) : `${dateShort(p.from)} – ${date(p.to)}`);

export function invoiceRow(i, { showName = false } = {}) {
  return html`<a class="row" href="#/invoices/${i.id}">
    ${i.images?.[0] ? html`<img class="thumb" src="/api/files/${i.images[0]}" alt="" loading="lazy">` : html`<span class="thumb" style="display:grid;place-items:center">${icon('receipt')}</span>`}
    <div class="main"><div class="t">${showName ? i.full_name + ' • ' : ''}فاتورة #<span class="num">${i.number}</span></div>
      <div class="s"><span>${dateShort(i.work_date)} ${clock(i.created_at)}</span>${i.service_type ? html`<span>${i.service_type}</span>` : ''}${i.edit_request ? html`<span class="warn-t">طلب تعديل</span>` : ''}</div></div>
    <div class="end"><b>${money(i.amount)}</b><div style="margin-top:4px">${badge(i.status)}</div></div></a>`;
}

/** New invoice sheet (barber). Image is mandatory: camera or gallery, preview, upload, then save. */
export function newInvoiceSheet(onDone) {
  const pp = photoPicker({ label: 'صورة الفاتورة' });
  return formSheet({
    title: 'تسجيل فاتورة جديدة', submit: 'حفظ الفاتورة',
    body: html`
      ${field('المبلغ (ر.س) *', html`<input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required class="input-lg" placeholder="0.00">`)}
      ${pp.markup}
      <div class="form-grid two">
        ${field('نوع الخدمة (اختياري)', inp('service_type', '', { ph: 'قص، حلاقة ذقن، صبغة…', attrs: 'list="svc-list"' }))}
        ${field('عدد الخدمات (اختياري)', inp('service_count', '', { type: 'number', min: 1, step: 1 }))}
      </div>
      <datalist id="svc-list"><option value="قص شعر"><option value="حلاقة ذقن"><option value="قص + ذقن"><option value="صبغة"><option value="تنظيف بشرة"><option value="استشوار"></datalist>
      ${field('ملاحظات', ta('notes', '', 'اختياري', 2))}
      <div class="hint">يُسجل التاريخ والوقت والحلاق تلقائياً. لا يمكن تعديل الفاتورة بعد الحفظ إلا بطلب تعديل للإدارة.</div>`,
    onMount: (el) => { pp.bind(el); setTimeout(() => el.querySelector('[name=amount]').focus(), 80); },
    onSubmit: async (d, el) => {
      const amount = Number(d.amount);
      if (!(amount > 0)) throw new Error('أدخل مبلغ الفاتورة');
      const blob = pp.getBlob();
      if (!blob) throw new Error('صورة الفاتورة إلزامية — صوّر الفاتورة أولاً');
      const btn = el.querySelector('[data-submit]'); btn.textContent = 'جارٍ رفع الصورة…';
      try {
        const f = await upload('invoice', blob);
        btn.textContent = 'جارٍ الحفظ…';
        const r = await post('/api/invoices', { amount, service_type: d.service_type, service_count: d.service_count, notes: d.notes, image_file_id: f.id });
        toast(`تم حفظ الفاتورة #${r.invoice.number} — حصتك ${n(r.invoice.barber_share)} ر.س`);
        onDone?.(r.invoice);
      } finally { btn.textContent = 'حفظ الفاتورة'; }
    },
  });
}

/** Check-in / check-out with GPS. */
export async function doAttendance(kind, btn) {
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.querySelector('b') && (btn.querySelector('b').textContent = 'جارٍ تحديد موقعك…'); }
  try {
    const fix = await gpsFix();
    if (fix.denied) {
      await sheet({ title: 'صلاحية الموقع مطلوبة', body: html`<p style="line-height:1.9">لتسجيل ${kind === 'in' ? 'الحضور' : 'الانصراف'} يجب السماح للتطبيق بالوصول إلى موقعك.<br>
        <b>Android/Chrome:</b> اضغط على رمز القفل بجانب الرابط ← الأذونات ← الموقع ← سماح.<br><b>iPhone:</b> الإعدادات ← Safari ← الموقع ← السماح.</p>` });
    }
    const r = await post(`/api/attendance/check-${kind === 'in' ? 'in' : 'out'}`, fix);
    const a = r.attendance;
    if (kind === 'in') toast(a.late_minutes ? `تم تسجيل حضورك — متأخر ${minutesLabel(a.late_minutes)}` : 'تم تسجيل حضورك ✓ يوم موفق');
    else toast(`تم تسجيل انصرافك ✓ ساعات العمل ${minutesLabel(a.worked_minutes)}`);
    return true;
  } catch (e) {
    toast(e.message, 'err');
    return false;
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}

export function attendanceRow(r) {
  const flags = JSON.parse(r.flags || '[]');
  return html`<div class="row">
    <div class="main"><div class="t">${dayLabel(r.date)}</div>
      <div class="s">${r.shift ? html`<span>الدوام <span class="num">${r.shift}</span></span>` : ''}
        ${r.check_in_at ? html`<span>حضور ${clock(r.check_in_at)}</span>` : ''}${r.check_out_at ? html`<span>انصراف ${clock(r.check_out_at)}</span>` : ''}
        ${r.late_minutes ? html`<span class="warn-t">تأخير ${minutesLabel(r.late_minutes)}</span>` : ''}${r.early_leave_minutes ? html`<span class="warn-t">خروج مبكر ${minutesLabel(r.early_leave_minutes)}</span>` : ''}
        ${r.worked_minutes ? html`<span>عمل ${minutesLabel(r.worked_minutes)}</span>` : ''}</div>
      ${flags.length ? html`<div class="flag">${icon('alert', 'sm')} ${flags.join('، ')}</div>` : ''}</div>
    <div class="end">${badge(r.status)}</div></div>`;
}

export function attendanceSummaryCards(s) {
  return html`<div class="grid g4">
    <div class="kpi"><div class="lbl">أيام الحضور</div><div class="val num">${s.present_days}</div><div class="sub">من ${s.scheduled_days} يوم دوام</div></div>
    <div class="kpi"><div class="lbl">الغياب</div><div class="val num ${s.absent_days ? 'bad-t' : ''}">${s.absent_days}</div><div class="sub">إجازات: ${s.leave_days}</div></div>
    <div class="kpi"><div class="lbl">مرات التأخير</div><div class="val num ${s.late_count ? 'warn-t' : ''}">${s.late_count}</div><div class="sub">المجموع ${minutesLabel(s.late_minutes)}</div></div>
    <div class="kpi"><div class="lbl">ساعات العمل</div><div class="val">${minutesLabel(s.worked_minutes)}</div><div class="sub">خروج مبكر ${s.early_count} • متوسط ${minutesLabel(s.avg_worked_minutes)}</div></div>
  </div>`;
}

export function mapEmbed(lat, lng) {
  if (lat == null || lng == null) return '';
  const d = 0.004;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`;
  return html`<iframe class="map-frame" src="${src}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
}
export const mapsLink = (lat, lng) => (lat == null ? '' : html`<a class="gold" href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener">${icon('mapPin', 'sm')} فتح في الخرائط</a>`);

export function downloadCsv(rows, filename) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Ask for a reason when a closed period must be edited (users with closures.override). */
export async function withClosureReason(fn) {
  try { return await fn(undefined); } catch (e) {
    if (e.code !== 'closed_reason_required') throw e;
    const reason = await formSheet({
      title: 'الفترة مغلقة', submit: 'متابعة مع التوثيق',
      body: html`<div class="hint">${e.message}</div>${field('سبب التعديل بعد الإغلاق *', ta('reason', '', 'سيتم حفظه في سجل العمليات', 2))}`,
      onSubmit: (d) => { if (!d.reason || d.reason.trim().length < 3) throw new Error('اكتب السبب'); return d.reason; },
    });
    if (!reason) return null;
    return fn(reason);
  }
}

/** Simple SVG bar chart. points: [{label, value}] */
export function barChart(points, { height = 190 } = {}) {
  const w = 600, h = height, pad = 22, max = Math.max(1, ...points.map((p) => p.value));
  const bw = (w - pad) / Math.max(points.length, 1);
  const bars = points.map((p, i) => {
    const bh = Math.max(p.value ? 2 : 0, ((h - pad - 8) * p.value) / max);
    const x = pad + i * bw + bw * 0.18, y = h - pad - bh;
    return `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${bh.toFixed(1)}" rx="3"><title>${esc(p.label)}: ${n(p.value)}</title></rect>` +
      (points.length <= 16 || i % Math.ceil(points.length / 10) === 0 ? `<text x="${(x + bw * 0.32).toFixed(1)}" y="${h - 6}" text-anchor="middle">${esc(p.short ?? p.label)}</text>` : '');
  }).join('');
  const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line class="gridline" x1="${pad}" x2="${w}" y1="${(h - pad - (h - pad - 8) * f).toFixed(1)}" y2="${(h - pad - (h - pad - 8) * f).toFixed(1)}"/><text x="0" y="${(h - pad - (h - pad - 8) * f + 3).toFixed(1)}">${n(max * f, 0)}</text>`).join('');
  return raw(`<svg class="chart" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="gbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2bd78"/><stop offset="1" stop-color="#8a6630"/></linearGradient></defs>${grid}${bars}</svg>`);
}

export { round2 };
