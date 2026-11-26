// Salon settings: identity, financial rules, attendance rules, salon GPS location(s) and radius.
import { html, icon, mount, toast, formSheet, field, inp, sel, badge } from '../ui.js';
import { get, put, post } from '../api.js';
import { setTitle, refresh } from '../app.js';
import { gpsFix } from '../media.js';
import { mapEmbed, mapsLink } from './common.js';

export async function render(view, { isCurrent }) {
  setTitle('الإعدادات');
  const d = await get('/api/settings');
  if (!isCurrent()) return;
  const s = d.settings;
  mount(view, html`
    <div class="page-head"><div><h2>الإعدادات</h2><p>الصالون، الحسابات المالية، الحضور والموقع</p></div></div>
    <h3 class="section-title">موقع الصالون ونطاق الحضور</h3>
    ${d.locations.length ? d.locations.map((l) => html`<div class="card gold-edge"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
      <div><b style="font-size:16px">${l.name}</b> ${l.active ? badge('present', 'فعّال') : badge('off', 'معطل')}<div class="muted num" style="font-size:13px">${l.lat.toFixed(6)}, ${l.lng.toFixed(6)} • نطاق ${l.radius_m}م</div></div>
      <div style="display:flex;gap:6px">${mapsLink(l.lat, l.lng)}<button class="btn sm" data-loc="${l.id}">${icon('edit', 'sm')} تعديل</button></div></div>
      <div style="margin-top:10px">${mapEmbed(l.lat, l.lng)}</div></div>`) : html`<div class="err-box">لم يُحدد موقع الصالون بعد — لن يتمكن الموظفون من تسجيل الحضور حتى تضيفه.</div>`}
    <button class="btn ${d.locations.length ? '' : 'primary'}" style="margin-top:10px" data-new-loc>${icon('mapPin', 'sm')} إضافة موقع/فرع</button>

    <form id="st">
    <h3 class="section-title">بيانات الصالون</h3>
    <div class="card form-grid two">
      ${field('اسم الصالون', inp('salon_name', s.salon_name, { req: true }))}${field('الاسم العربي', inp('salon_name_ar', s.salon_name_ar, { req: true }))}
      ${field('الجوال', inp('salon_phone', s.salon_phone, { attrs: 'dir="ltr"' }))}${field('العنوان', inp('salon_address', s.salon_address))}
      ${field('الرقم الضريبي', inp('salon_tax_no', s.salon_tax_no, { attrs: 'dir="ltr"' }))}${field('تذييل تقارير PDF', inp('report_footer', s.report_footer))}</div>
    <h3 class="section-title">الفواتير والحسابات</h3>
    <div class="card form-grid two">
      ${field('متى تدخل الفاتورة في الحساب المالي؟', sel('invoice_count_mode', { on_create: 'عند التسجيل (إلا المرفوضة)', on_approve: 'بعد الاعتماد فقط' }, s.invoice_count_mode))}
      ${field('حالة الفاتورة عند التسجيل', sel('invoice_initial_status', { registered: 'مسجلة', under_review: 'قيد المراجعة' }, s.invoice_initial_status))}
      ${field('النسبة الافتراضية للحلاق الجديد %', inp('default_barber_rate', s.default_barber_rate, { type: 'number', min: 0 }))}</div>
    <h3 class="section-title">الحضور والدوام</h3>
    <div class="card form-grid two">
      ${field('فترة السماح الافتراضية (دقائق)', inp('default_grace_minutes', s.default_grace_minutes, { type: 'number', min: 0 }))}
      ${field('السماح بالحضور قبل الدوام بـ (دقائق)', inp('early_checkin_minutes', s.early_checkin_minutes, { type: 'number', min: 0 }))}
      ${field('أقصى دقة GPS مقبولة (متر)', inp('max_gps_accuracy_m', s.max_gps_accuracy_m, { type: 'number', min: 10 }))}
      ${field('أقصى عمر للموقع (ثانية)', inp('max_location_age_sec', s.max_location_age_sec, { type: 'number', min: 10 }))}
      ${field('تنبيه إذا كان موقع الشبكة أبعد من (كم)', inp('ip_distance_flag_km', s.ip_distance_flag_km, { type: 'number', min: 10 }))}
      ${field('بداية يوم العمل (ساعة)', inp('day_start_hour', s.day_start_hour, { type: 'number', min: 0 }))}
      <div class="hint full">بداية يوم العمل: أي عملية قبل هذه الساعة (مثلاً 2 صباحاً) تُحسب لليوم السابق — مناسب للدوامات الممتدة بعد منتصف الليل.</div></div>
    <h3 class="section-title">الجلسات</h3>
    <div class="card form-grid two">${field('مدة الجلسة (ساعات)', inp('session_hours', s.session_hours, { type: 'number', min: 1 }))}${field('مدة «تذكرني» (أيام)', inp('remember_days', s.remember_days, { type: 'number', min: 1 }))}</div>
    <button class="btn primary lg" style="margin-top:14px" type="submit">${icon('save')} حفظ الإعدادات</button>
    </form>
    <div class="hint" style="margin-top:14px">تخزين الصور والملفات: <b>${d.storage === 'r2' ? 'Cloudflare R2 (خاص)' : 'قاعدة البيانات D1 (خاص)'}</b> — الملفات لا تُعرض إلا لأصحاب الصلاحية عبر الخادم.</div>`);

  view.querySelector('#st').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target); const b = {};
    for (const [k, v] of f.entries()) b[k] = v;
    try { await put('/api/settings', b); toast('تم حفظ الإعدادات'); } catch (err) { toast(err.message, 'err'); }
  });
  const locForm = (l) => formSheet({
    title: l ? 'تعديل الموقع' : 'إضافة موقع الصالون', submit: 'حفظ',
    body: html`${field('الاسم', inp('name', l?.name || 'الفرع الرئيسي', { req: true }))}
      <div class="form-grid two">${field('خط العرض (Latitude)', inp('lat', l?.lat, { type: 'number', step: 'any', req: true, attrs: 'dir="ltr"' }))}${field('خط الطول (Longitude)', inp('lng', l?.lng, { type: 'number', step: 'any', req: true, attrs: 'dir="ltr"' }))}</div>
      <button class="btn block" type="button" data-here>${icon('navigation', 'sm')} استخدم موقعي الحالي (وأنا داخل الصالون)</button>
      ${field('أو الصق رابط Google Maps', inp('gm', '', { ph: 'https://maps.google.com/...@24.71,46.67', attrs: 'dir="ltr"' }))}
      ${field('نطاق السماح بالمتر', inp('radius_m', l?.radius_m ?? 100, { type: 'number', min: 10, req: true }))}
      ${l ? html`<label class="check"><input type="checkbox" name="active" ${l.active ? 'checked' : ''}> فعّال</label>` : ''}
      <div class="hint">نطاق 50–100 متر مناسب لمعظم الصالونات. دقة GPS داخل المباني قد تكون 20–50 متراً.</div>`,
    onMount: (el) => {
      el.querySelector('[data-here]').addEventListener('click', async (ev) => {
        ev.currentTarget.disabled = true;
        const f = await gpsFix(); ev.currentTarget.disabled = false;
        if (f.geo_error) return toast(f.geo_error, 'err');
        el.querySelector('[name=lat]').value = f.lat.toFixed(7); el.querySelector('[name=lng]').value = f.lng.toFixed(7);
        toast(`تم تحديد الموقع (دقة ${Math.round(f.accuracy)}م)`);
      });
      el.querySelector('[name=gm]').addEventListener('input', (ev) => {
        const m = ev.target.value.match(/@?(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) || ev.target.value.match(/q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
        if (m) { el.querySelector('[name=lat]').value = m[1]; el.querySelector('[name=lng]').value = m[2]; }
      });
    },
    onSubmit: async (b) => { delete b.gm; if (l) await put(`/api/locations/${l.id}`, b); else await post('/api/locations', b); toast('تم حفظ الموقع'); refresh(); },
  });
  view.querySelector('[data-new-loc]').addEventListener('click', () => locForm(null));
  view.querySelectorAll('[data-loc]').forEach((b) => b.addEventListener('click', () => locForm(d.locations.find((l) => l.id === b.dataset.loc))));
}
