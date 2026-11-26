import { html, icon, mount, badge, avatar, n, empty, toast, formSheet, field, inp, sel, ta, checks } from '../ui.js';
import { get, post, upload, invalidate } from '../api.js';
import { setTitle, can, state, go } from '../app.js';
import { ROLES, PERMISSIONS, EMP_STATUS } from '../shared.js';
import { compressImage } from '../media.js';

export function employeeForm(e = null, locations = []) {
  const isNew = !e;
  const admin = state.user.role === 'admin';
  const roles = admin ? ROLES : { barber: ROLES.barber };
  let photoBlob = null;
  return formSheet({
    title: isNew ? 'إضافة موظف' : 'تعديل بيانات الموظف', wide: true, submit: isNew ? 'إضافة' : 'حفظ',
    body: html`<div class="form-grid two">
      ${field('الاسم الكامل *', inp('full_name', e?.full_name, { req: true }))}
      ${field('البريد الإلكتروني (للدخول) *', inp('email', e?.email, { type: 'email', req: true, attrs: 'dir="ltr"' }))}
      ${field('رقم الجوال', inp('phone', e?.phone, { type: 'tel', attrs: 'dir="ltr"' }))}
      ${field('المسمى الوظيفي', inp('job_title', e?.job_title ?? 'حلاق'))}
      ${field('تاريخ بداية العمل', inp('start_date', e?.start_date ?? state.today, { type: 'date' }))}
      ${field('الحالة', sel('status', EMP_STATUS, e?.status ?? 'active'))}
      ${(admin || isNew) ? field('نوع الحساب', sel('role', roles, e?.role ?? 'barber')) : ''}
      <label class="field"><span>صورة الموظف (اختياري)</span><input type="file" accept="image/*" data-photo></label>
      ${isNew ? html`${field('كلمة مرور مؤقتة *', inp('password', '', { req: true, attrs: 'dir="ltr" autocomplete="new-password"' }))}
        ${field('نسبة الحلاق % *', inp('barber_rate', 50, { type: 'number', min: 0, step: '0.5', req: true }))}
        ${field('نسبة المحل %', inp('shop_rate', 50, { type: 'number', min: 0, step: '0.5', attrs: 'readonly' }))}` : ''}
      <label class="check full"><input type="checkbox" name="works_shifts" ${(e ? e.works_shifts : true) ? 'checked' : ''}> يعمل بدوام ويسجل حضوراً وفواتير</label>
      ${field('موقع الحضور المسموح', sel('location_id', locations.map((l) => ({ v: l.id, l: l.name })), e?.location_id ?? '', { empty: 'أي موقع للصالون' }))}
      ${field('نطاق خاص بالمتر (اختياري)', inp('radius_override_m', e?.radius_override_m, { type: 'number', min: 10, ph: 'يستخدم نطاق الموقع' }))}
      ${admin ? html`<div class="field full" data-perms style="${(e?.role ?? 'barber') === 'supervisor' ? '' : 'display:none'}"><span>صلاحيات المشرف</span>
        ${checks('permissions', Object.entries(PERMISSIONS).map(([v, l]) => ({ v, l })), e?.permissions || [])}</div>` : ''}
      ${field('ملاحظات', ta('notes', e?.notes, '', 2), 'full')}
      ${isNew ? html`<div class="hint full">سيُطلب من الموظف تغيير كلمة المرور المؤقتة عند أول دخول. أرسل له رابط التطبيق والبريد وكلمة المرور.</div>` : ''}
    </div>`,
    onMount: (el) => {
      const role = el.querySelector('[name=role]'); const perms = el.querySelector('[data-perms]');
      role?.addEventListener('change', () => { if (perms) perms.style.display = role.value === 'supervisor' ? '' : 'none'; const ws = el.querySelector('[name=works_shifts]'); if (isNew) ws.checked = role.value === 'barber'; });
      const br = el.querySelector('[name=barber_rate]'), sr = el.querySelector('[name=shop_rate]');
      br?.addEventListener('input', () => { sr.value = Math.max(0, 100 - Number(br.value || 0)); });
      el.querySelector('[data-photo]').addEventListener('change', async (ev) => { try { photoBlob = await compressImage(ev.target.files[0], { max: 600 }); } catch (err) { toast(err.message, 'err'); } });
    },
    onSubmit: async (d) => {
      if (photoBlob) d.photo_file_id = (await upload('avatar', photoBlob)).id;
      if (d.role !== 'supervisor') delete d.permissions;
      if (!admin) { delete d.role; delete d.permissions; }
      if (isNew) { const r = await post('/api/employees', d); invalidate('staff'); toast('تمت إضافة الموظف'); return r; }
      await put_(`/api/employees/${e.id}`, d); invalidate('staff'); toast('تم الحفظ'); return true;
    },
  });
}
import { put as put_ } from '../api.js';

export async function render(view, { query, isCurrent }) {
  setTitle('الموظفون');
  const [d, st] = await Promise.all([get('/api/employees'), can('settings.manage') ? get('/api/settings') : Promise.resolve({ locations: [] })]);
  if (!isCurrent()) return;
  const show = query.all ? d.items : d.items.filter((x) => x.active);
  mount(view, html`
    <div class="page-head"><div><h2>الموظفون</h2><p>${d.items.filter((x) => x.active).length} حساب نشط</p></div>
      <div class="actions">${can('employees.manage') ? html`<button class="btn primary" data-new>${icon('user_plus')} إضافة موظف</button>` : ''}</div></div>
    <div class="chips" style="margin-bottom:12px"><a class="chip ${!query.all ? 'active' : ''}" href="#/employees">النشطون</a><a class="chip ${query.all ? 'active' : ''}" href="#/employees?all=1">الكل (مع المعطلين)</a></div>
    <div class="list">${show.length ? show.map((e) => html`<a class="row" href="#/employees/${e.id}" style="${e.active ? '' : 'opacity:.55'}">${avatar(e)}
      <div class="main"><div class="t">${e.full_name} ${!e.active ? html`<span class="badge red">معطل</span>` : ''}</div>
        <div class="s"><span>${ROLES[e.role]?.label}</span>${e.job_title ? html`<span>${e.job_title}</span>` : ''}${e.phone ? html`<span class="num">${e.phone}</span>` : ''}</div></div>
      <div class="end">${e.works_shifts ? html`<b class="gold num">${n(e.barber_rate)}% / ${n(e.shop_rate)}%</b><small class="muted">الحلاق / المحل</small>` : ''}<div style="margin-top:4px">${badge(e.status === 'active' ? 'present' : 'off', EMP_STATUS[e.status])}</div></div></a>`) : empty('لا يوجد موظفون بعد — أضف أول حلاق', 'users')}</div>`);
  view.querySelector('[data-new]')?.addEventListener('click', async () => { const r = await employeeForm(null, st.locations || []); if (r?.id) go(`#/employees/${r.id}`); });
}
