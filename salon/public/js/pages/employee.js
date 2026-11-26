// Employee profile: data, schedules, rates history, attendance, invoices, dues, account actions.
import { html, icon, mount, badge, avatar, n, date, dateTime, money, empty, toast, formSheet, field, inp, ta, confirmBox, raw } from '../ui.js';
import { get, post, del, qs } from '../api.js';
import { setTitle, can, state, refresh, go } from '../app.js';
import { ROLES, EMP_STATUS, WEEKDAYS, periodRange, validRates, shiftMinutes, minutesLabel } from '../shared.js';
import { employeeForm } from './employees.js';
import { attendanceRow, attendanceSummaryCards, invoiceRow } from './common.js';

export async function render(view, { params, query, isCurrent }) {
  const [d, st] = await Promise.all([get(`/api/employees/${params.id}`), can('settings.manage') ? get('/api/settings') : Promise.resolve({ locations: [] })]);
  if (!isCurrent()) return;
  const e = d.employee;
  setTitle(e.full_name);
  const tab = query.tab || 'info';
  const month = periodRange('month', state.today);
  const tabs = [['info', 'البيانات'], ['schedule', 'الدوام'], ['rates', 'النسب'], ['attendance', 'الحضور'], ['invoices', 'الفواتير']];
  const manage = can('employees.manage') && (state.user.role === 'admin' || e.role === 'barber');
  mount(view, html`
    <a class="back" href="#/employees">${icon('arrowR', 'sm')} الموظفون</a>
    <div class="card gold-edge" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      ${avatar({ ...e, id: e.user_id }, 'lg')}
      <div style="flex:1;min-width:200px"><h2 style="margin:0;font-size:21px">${e.full_name} ${!e.active ? html`<span class="badge red">معطل</span>` : ''}</h2>
        <div class="muted ltr" style="text-align:right;font-size:13px">${e.email}</div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><span class="badge gold">${ROLES[e.role]?.label}</span><span class="badge">${EMP_STATUS[e.status] || ''}</span>
          ${e.works_shifts ? html`<span class="badge">نسبته <b class="num">&nbsp;${n(e.barber_rate)}%</b> • المحل <b class="num">&nbsp;${n(e.shop_rate)}%</b></span>` : ''}</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${manage ? html`<button class="btn sm" data-edit>${icon('edit', 'sm')} تعديل</button><button class="btn sm" data-reset>${icon('key', 'sm')} كلمة مرور</button>
          ${e.user_id !== state.user.id ? html`<button class="btn sm ${e.active ? 'danger' : 'ok'}" data-active>${e.active ? 'تعطيل' : 'تفعيل'}</button>` : ''}` : ''}
        ${can('payments.view') && e.works_shifts ? html`<a class="btn sm" href="#/dues/${e.user_id}">${icon('wallet', 'sm')} المستحقات</a>` : ''}
        ${can('employee_reports.manage') && e.works_shifts ? html`<a class="btn sm" href="#/emp-reports?user_id=${e.user_id}">${icon('file', 'sm')} تقرير PDF</a>` : ''}
      </div>
    </div>
    <div class="chips" style="margin:14px 0">${tabs.map(([k, l]) => html`<a class="chip ${tab === k ? 'active' : ''}" href="#/employees/${e.user_id}?tab=${k}">${l}</a>`)}</div>
    <div id="tab"></div>`);

  const t = view.querySelector('#tab');
  if (tab === 'info') {
    const loc = (st.locations || []).find((l) => l.id === e.location_id);
    mount(t, html`<div class="card"><dl class="kv">
      <dt>الجوال</dt><dd class="num">${e.phone || '—'}</dd><dt>المسمى</dt><dd>${e.job_title || '—'}</dd>
      <dt>بداية العمل</dt><dd>${date(e.start_date)}</dd><dt>يعمل بدوام</dt><dd>${e.works_shifts ? 'نعم' : 'لا'}</dd>
      <dt>موقع الحضور</dt><dd>${loc ? loc.name : 'أي موقع للصالون'}${e.radius_override_m ? html` • نطاق خاص <span class="num">${e.radius_override_m}</span>م` : ''}</dd>
      <dt>آخر دخول</dt><dd>${dateTime(e.last_login_at)}</dd><dt>أُنشئ</dt><dd>${dateTime(e.created_at)}</dd>
      ${e.role === 'supervisor' ? html`<dt>الصلاحيات</dt><dd style="white-space:normal">${e.permissions.length ? e.permissions.join('، ') : 'لا توجد'}</dd>` : ''}
      <dt>ملاحظات</dt><dd style="white-space:pre-wrap">${e.notes || '—'}</dd></dl></div>`);
  }
  if (tab === 'schedule') {
    mount(t, html`
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${can('schedules.manage') ? html`<button class="btn primary" data-sched>${icon('plus', 'sm')} جدول أسبوعي جديد</button><button class="btn" data-ovr>${icon('calendar', 'sm')} تعديل يوم محدد</button>` : ''}</div>
      ${d.schedules.length ? d.schedules.map((s) => html`<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <h3>${s.name || 'جدول الدوام'} • يسري من ${date(s.effective_from)} ${s.effective_from > state.today ? html`<span class="badge amber">مستقبلي</span>` : ''}</h3>
        <div style="display:flex;gap:6px"><span class="badge">سماح <span class="num">&nbsp;${s.grace_minutes}</span>د</span>
          ${can('schedules.manage') ? html`<button class="btn sm ghost" data-copy="${s.id}">${icon('copy', 'sm')} نسخ وتعديل</button>${s.effective_from > state.today ? html`<button class="btn sm danger" data-del="${s.id}">${icon('trash', 'sm')}</button>` : ''}` : ''}</div></div>
        <div class="grid g4" style="gap:8px">${s.days.map((x) => html`<div class="row" style="padding:9px 10px"><div class="main"><div class="t" style="font-size:13.5px">${WEEKDAYS[x.weekday]}</div>
          <div class="s">${x.is_off ? html`<span>راحة</span>` : html`<span class="num">${x.start_time} – ${x.end_time}</span><span>${minutesLabel(shiftMinutes(x.start_time, x.end_time))}</span>${x.end_time <= x.start_time ? html`<span class="gold">بعد منتصف الليل</span>` : ''}`}</div></div></div>`)}</div></div>`)
      : empty('لا يوجد جدول دوام — أضف جدولاً ليتم احتساب التأخير والغياب', 'calendar')}
      ${d.overrides.length ? html`<h3 class="section-title">تعديلات أيام محددة (قادمة)</h3><div class="list">${d.overrides.map((o) => html`<div class="row"><div class="main"><div class="t">${date(o.work_date)}</div>
        <div class="s">${o.is_off ? 'راحة' : html`<span class="num">${o.start_time} – ${o.end_time}</span>`}${o.note ? html`<span>${o.note}</span>` : ''}</div></div>${can('schedules.manage') ? html`<button class="icon-btn" data-delo="${o.id}">${icon('trash', 'sm')}</button>` : ''}</div>`)}</div>` : ''}`);
    t.querySelector('[data-sched]')?.addEventListener('click', () => scheduleForm(e, d.schedules[0]));
    t.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => scheduleForm(e, d.schedules.find((s) => s.id === b.dataset.copy))));
    t.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (await confirmBox('حذف هذا الجدول المستقبلي؟', { danger: true })) { await del(`/api/schedules/${b.dataset.del}`); refresh(); } }));
    t.querySelectorAll('[data-delo]').forEach((b) => b.addEventListener('click', async () => { await del(`/api/overrides/${b.dataset.delo}`); refresh(); }));
    t.querySelector('[data-ovr]')?.addEventListener('click', () => formSheet({
      title: 'تعديل دوام يوم محدد', submit: 'حفظ',
      body: html`${field('التاريخ', inp('work_date', state.today, { type: 'date', req: true }))}<label class="check"><input type="checkbox" name="is_off"> يوم راحة</label>
        <div class="form-grid two">${field('البداية', inp('start_time', '14:00', { type: 'time' }))}${field('النهاية', inp('end_time', '22:00', { type: 'time' }))}</div>${field('ملاحظة', inp('note', ''))}`,
      onSubmit: async (b) => { await post(`/api/employees/${e.user_id}/overrides`, b); toast('تم الحفظ وإشعار الموظف'); refresh(); },
    }));
  }
  if (tab === 'rates') {
    mount(t, html`
      ${can('rates.manage') ? html`<button class="btn primary" data-rate style="margin-bottom:12px">${icon('percent', 'sm')} تعديل النسبة</button>` : ''}
      <div class="hint" style="margin-bottom:12px">كل فاتورة تحفظ النسبة السارية وقت تسجيلها، لذلك تغيير النسبة لا يغيّر الحسابات السابقة.</div>
      <div class="list">${d.rates.map((r, i) => html`<div class="row"><div class="main"><div class="t">الحلاق <span class="gold num">${n(r.barber_rate)}%</span> • المحل <span class="num">${n(r.shop_rate)}%</span> ${i === 0 && r.effective_from <= state.today ? html`<span class="badge green">الحالية</span>` : r.effective_from > state.today ? html`<span class="badge amber">مستقبلية</span>` : ''}</div>
        <div class="s"><span>تسري من ${date(r.effective_from)}</span><span>بواسطة ${r.by_name || '—'}</span><span>${dateTime(r.created_at)}</span>${r.note ? html`<span>${r.note}</span>` : ''}</div></div></div>`)}</div>`);
    t.querySelector('[data-rate]')?.addEventListener('click', () => formSheet({
      title: 'تعديل نسبة الحلاق', submit: 'تطبيق النسبة',
      body: html`<div class="form-grid two">${field('نسبة الحلاق %', inp('barber_rate', e.barber_rate, { type: 'number', step: '0.5', min: 0, req: true }))}${field('نسبة المحل %', inp('shop_rate', e.shop_rate, { type: 'number', step: '0.5', min: 0, req: true }))}</div>
        <div class="hint" data-sum></div>${field('تاريخ بدء التطبيق', inp('effective_from', state.today, { type: 'date', req: true }))}${field('ملاحظة', inp('note', ''))}`,
      onMount: (el) => {
        const b = el.querySelector('[name=barber_rate]'), s = el.querySelector('[name=shop_rate]'), sum = el.querySelector('[data-sum]');
        const upd = () => { const tot = Number(b.value || 0) + Number(s.value || 0); sum.innerHTML = `المجموع: <b class="${tot === 100 ? 'ok-t' : 'bad-t'}">${tot}%</b> ${tot === 100 ? '✓' : '— يجب أن يساوي 100%'}`; };
        b.addEventListener('input', () => { s.value = Math.max(0, 100 - Number(b.value || 0)); upd(); }); s.addEventListener('input', upd); upd();
      },
      onSubmit: async (x) => { if (!validRates(x.barber_rate, x.shop_rate)) throw new Error('مجموع النسبتين يجب أن يساوي 100%'); await post(`/api/employees/${e.user_id}/rates`, x); toast('تم تحديث النسبة'); refresh(); },
    }));
  }
  if (tab === 'attendance' && !can('attendance.view')) mount(t, empty('ليست لديك صلاحية عرض الحضور', 'lock'));
  else if (tab === 'attendance') {
    const from = query.from || month.from, to = query.to || state.today;
    const log = await get('/api/attendance' + qs({ user_id: e.user_id, from, to }));
    if (!isCurrent()) return;
    mount(t, html`<div class="toolbar"><input type="date" value="${from}" data-f> <input type="date" value="${to}" data-t> <button class="btn sm" data-go>عرض</button></div>
      <div class="list">${log.items.length ? log.items.map((a) => html`<div class="row"><div class="main"><div class="t">${date(a.work_date)}</div><div class="s">
        <span>حضور ${dateTime(a.check_in_at)}</span><span>انصراف ${a.check_out_at ? dateTime(a.check_out_at) : '—'}</span>${a.late_minutes ? html`<span class="warn-t">تأخير ${minutesLabel(a.late_minutes)}</span>` : ''}
        ${a.early_leave_minutes ? html`<span class="warn-t">خروج مبكر ${minutesLabel(a.early_leave_minutes)}</span>` : ''}<span>${a.worked_minutes ? minutesLabel(a.worked_minutes) : ''}</span><span class="num">${a.in_distance_m ?? '—'}م</span>${a.source === 'manual' ? html`<span class="badge violet">يدوي</span>` : ''}</div></div></div>`) : empty('لا توجد سجلات حضور')}</div>`);
    t.querySelector('[data-go]').addEventListener('click', () => go(`#/employees/${e.user_id}?tab=attendance&from=${t.querySelector('[data-f]').value}&to=${t.querySelector('[data-t]').value}`));
  }
  if (tab === 'invoices') {
    if (!can('invoices.view') && !can('invoices.review')) { mount(t, empty('ليست لديك صلاحية عرض الفواتير', 'lock')); }
    else {
      const inv = await get('/api/invoices' + qs({ user_id: e.user_id, from: month.from, to: state.today }));
      if (!isCurrent()) return;
      mount(t, html`<div class="grid g3" style="margin-bottom:12px"><div class="kpi hl"><div class="lbl">مبيعات الشهر</div><div class="val">${money(inv.totals.sales)}</div><div class="sub"><span class="num">${inv.totals.count}</span> فاتورة</div></div>
        <div class="kpi"><div class="lbl">حصة الحلاق</div><div class="val">${money(inv.totals.barber_share)}</div></div><div class="kpi"><div class="lbl">حصة المحل</div><div class="val">${money(inv.totals.shop_share)}</div></div></div>
        <div class="list">${inv.items.length ? inv.items.map((i) => invoiceRow(i)) : empty('لا توجد فواتير هذا الشهر', 'receipt')}</div>
        <a class="btn ghost block" style="margin-top:10px" href="#/invoices?user_id=${e.user_id}">كل فواتير الموظف</a>`);
    }
  }

  view.querySelector('[data-edit]')?.addEventListener('click', async () => { if (await employeeForm({ ...e, id: e.user_id }, st.locations || [])) refresh(); });
  view.querySelector('[data-active]')?.addEventListener('click', async () => {
    if (!(await confirmBox(e.active ? 'تعطيل الحساب سيمنع الموظف من الدخول فوراً. متابعة؟' : 'إعادة تفعيل الحساب؟', { danger: !!e.active }))) return;
    await post(`/api/employees/${e.user_id}/active`, { active: !e.active }); toast('تم'); refresh();
  });
  view.querySelector('[data-reset]')?.addEventListener('click', () => formSheet({
    title: 'إعادة تعيين كلمة المرور', submit: 'تعيين',
    body: html`${field('كلمة مرور مؤقتة جديدة', inp('password', '', { req: true, attrs: 'dir="ltr" autocomplete="new-password"' }))}<div class="hint">سيتم تسجيل خروج الموظف من كل الأجهزة، وسيُطلب منه تغييرها عند الدخول.</div>`,
    onSubmit: async (x) => { await post(`/api/employees/${e.user_id}/reset-password`, x); toast('تم تعيين كلمة المرور'); },
  }));
}

function scheduleForm(e, base) {
  const byDay = Object.fromEntries((base?.days || []).map((x) => [x.weekday, x]));
  return formSheet({
    title: 'جدول دوام أسبوعي', wide: true, submit: 'حفظ الجدول',
    body: html`<div class="form-grid two">
        ${field('يسري اعتباراً من', inp('effective_from', state.today, { type: 'date', req: true }))}
        ${field('فترة السماح (دقائق)', inp('grace_minutes', base?.grace_minutes ?? 10, { type: 'number', min: 0 }))}
        ${field('اسم الجدول (اختياري)', inp('name', base?.name || ''), 'full')}</div>
      <div class="hint" style="margin:10px 0">إذا كان وقت النهاية أصغر من البداية (مثل 6م → 2ص) فالدوام يمتد بعد منتصف الليل ويُحسب ليوم البداية.</div>
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap"><input type="time" data-qs value="14:00" style="width:auto"><input type="time" data-qe value="22:00" style="width:auto"><button class="btn sm" type="button" data-fill>تطبيق على أيام العمل</button></div>
      <div class="list">${WEEKDAYS.map((w, i) => { const x = byDay[i]; const off = x ? !!x.is_off : i === 5; return html`<div class="row" data-day="${i}" style="padding:8px 10px;gap:8px">
        <b style="width:70px">${w}</b><label class="check" style="font-size:13px"><input type="checkbox" data-off ${off ? 'checked' : ''}> راحة</label>
        <input type="time" data-s value="${x?.start_time || '14:00'}" style="flex:1;min-width:0" ${off ? 'disabled' : ''}><input type="time" data-e value="${x?.end_time || '22:00'}" style="flex:1;min-width:0" ${off ? 'disabled' : ''}></div>`; })}</div>`,
    onMount: (el) => {
      el.querySelectorAll('[data-day]').forEach((r) => r.querySelector('[data-off]').addEventListener('change', (ev) => { r.querySelectorAll('input[type=time]').forEach((x) => { x.disabled = ev.target.checked; }); }));
      el.querySelector('[data-fill]').addEventListener('click', () => el.querySelectorAll('[data-day]').forEach((r) => { if (!r.querySelector('[data-off]').checked) { r.querySelector('[data-s]').value = el.querySelector('[data-qs]').value; r.querySelector('[data-e]').value = el.querySelector('[data-qe]').value; } }));
    },
    onSubmit: async (b, el) => {
      b.days = [...el.querySelectorAll('[data-day]')].map((r) => ({ weekday: Number(r.dataset.day), is_off: r.querySelector('[data-off]').checked, start_time: r.querySelector('[data-s]').value, end_time: r.querySelector('[data-e]').value }));
      await post(`/api/employees/${e.user_id}/schedules`, b); toast('تم حفظ الجدول وإشعار الموظف'); refresh();
    },
  });
}
