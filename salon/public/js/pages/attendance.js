// Attendance: live board for a day, log with manual corrections, rejected attempts with map.
import { html, icon, mount, badge, avatar, date, dateTime, clock, empty, toast, formSheet, field, inp, ta, sel, sheet } from '../ui.js';
import { get, post, put, qs, lookups } from '../api.js';
import { setTitle, can, state, go, refresh } from '../app.js';
import { minutesLabel, addDays } from '../shared.js';
import { mapEmbed, mapsLink, downloadCsv } from './common.js';

const toLocal = (iso) => { if (!iso) return ''; const d = new Date(Date.parse(iso) + 3 * 3600e3); return d.toISOString().slice(0, 16); };

export async function render(view, { query, isCurrent }) {
  setTitle('الحضور والانصراف');
  const tab = query.tab || 'board';
  const tabs = [['board', 'اليوم'], ['log', 'السجل'], ['attempts', 'المحاولات المرفوضة']];
  mount(view, html`<div class="page-head"><div><h2>الحضور والانصراف</h2><p>التحقق بالموقع الجغرافي GPS</p></div>
    <div class="actions">${can('attendance.manage') ? html`<button class="btn" data-manual>${icon('plus', 'sm')} حضور يدوي</button>` : ''}</div></div>
    <div class="chips" style="margin-bottom:14px">${tabs.map(([k, l]) => html`<a class="chip ${tab === k ? 'active' : ''}" href="#/attendance?tab=${k}">${l}</a>`)}</div><div id="t"></div>`);
  const t = view.querySelector('#t');
  view.querySelector('[data-manual]')?.addEventListener('click', manualForm);

  if (tab === 'board') {
    const date_ = query.date || state.today;
    const d = await get(`/api/attendance/board?date=${date_}`);
    if (!isCurrent()) return;
    mount(t, html`<div class="toolbar"><button class="btn sm" data-d="${addDays(date_, -1)}">${icon('chevR', 'sm')}</button><input type="date" value="${date_}" data-date><button class="btn sm" data-d="${addDays(date_, 1)}">${icon('chevL', 'sm')}</button></div>
      <div class="list">${d.items.length ? d.items.map((r) => html`<div class="row">${avatar(r.user)}
        <div class="main"><div class="t">${r.user.full_name}</div><div class="s">${r.shift ? html`<span>الدوام <span class="num">${r.shift}</span></span>` : ''}
          ${r.check_in_at ? html`<span>حضور ${clock(r.check_in_at)}</span>` : ''}${r.check_out_at ? html`<span>انصراف ${clock(r.check_out_at)}</span>` : ''}
          ${r.late_minutes ? html`<span class="warn-t">تأخير ${minutesLabel(r.late_minutes)}</span>` : ''}${r.early_leave_minutes ? html`<span class="warn-t">خروج مبكر ${minutesLabel(r.early_leave_minutes)}</span>` : ''}${r.worked_minutes ? html`<span>${minutesLabel(r.worked_minutes)}</span>` : ''}</div>
          ${JSON.parse(r.flags || '[]').length ? html`<div class="flag">${icon('alert', 'sm')} ${JSON.parse(r.flags).join('، ')}</div>` : ''}</div>
        <div class="end">${badge(r.status)}</div></div>`) : empty('لا يوجد موظفون بدوام', 'users')}</div>`);
    t.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => go(`#/attendance?tab=board&date=${b.dataset.d}`)));
    t.querySelector('[data-date]').addEventListener('change', (e) => go(`#/attendance?tab=board&date=${e.target.value}`));
  }

  if (tab === 'log') {
    const staff = await lookups.staff();
    const from = query.from || addDays(state.today, -6), to = query.to || state.today;
    const d = await get('/api/attendance' + qs({ from, to, user_id: query.user_id }));
    if (!isCurrent()) return;
    mount(t, html`<div class="toolbar">${sel('u', staff.filter((s) => s.works_shifts).map((s) => ({ v: s.id, l: s.full_name })), query.user_id || '', { empty: 'كل الموظفين' })}
      <input type="date" value="${from}" data-f><input type="date" value="${to}" data-t><button class="btn sm primary" data-go>عرض</button><button class="btn sm" data-csv>${icon('download', 'sm')} CSV</button></div>
      <div class="list">${d.items.length ? d.items.map((a) => html`<div class="row click" data-id="${a.id}"><div class="main"><div class="t">${a.full_name} • ${date(a.work_date)}</div><div class="s">
        <span>حضور ${clock(a.check_in_at)}</span><span>انصراف ${a.check_out_at ? clock(a.check_out_at) : '—'}</span>${a.late_minutes ? html`<span class="warn-t">تأخير ${minutesLabel(a.late_minutes)}</span>` : ''}
        ${a.early_leave_minutes ? html`<span class="warn-t">خروج مبكر ${minutesLabel(a.early_leave_minutes)}</span>` : ''}${a.worked_minutes ? html`<span>${minutesLabel(a.worked_minutes)}</span>` : ''}<span class="num">${a.in_distance_m ?? '—'}م</span>
        ${a.source === 'manual' ? html`<span class="badge violet">معدل يدوياً</span>` : ''}</div>${JSON.parse(a.flags || '[]').length ? html`<div class="flag">${icon('alert', 'sm')} ${JSON.parse(a.flags).join('، ')}</div>` : ''}</div>${icon('chevL', 'sm')}</div>`) : empty('لا توجد سجلات')}</div>`);
    t.querySelector('[data-go]').addEventListener('click', () => go('#/attendance' + qs({ tab: 'log', user_id: t.querySelector('[name=u]').value, from: t.querySelector('[data-f]').value, to: t.querySelector('[data-t]').value })));
    t.querySelector('[data-csv]').addEventListener('click', () => downloadCsv([['الموظف', 'التاريخ', 'الحضور', 'الانصراف', 'التأخير (د)', 'الخروج المبكر (د)', 'ساعات العمل (د)', 'المسافة (م)', 'المصدر'],
      ...d.items.map((a) => [a.full_name, a.work_date, toLocal(a.check_in_at).replace('T', ' '), toLocal(a.check_out_at).replace('T', ' '), a.late_minutes, a.early_leave_minutes, a.worked_minutes ?? '', a.in_distance_m ?? '', a.source])], `attendance-${from}-${to}.csv`));
    t.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => detail(d.items.find((a) => a.id === r.dataset.id))));
  }

  if (tab === 'attempts') {
    const d = await get('/api/attendance/attempts' + qs({ from: addDays(state.today, -30) }));
    if (!isCurrent()) return;
    mount(t, html`<div class="hint" style="margin-bottom:12px">محاولات الحضور/الانصراف المرفوضة خلال آخر 30 يوماً مع السبب والموقع إن توفر.</div>
      <div class="list">${d.items.length ? d.items.map((a) => html`<div class="row click" data-id="${a.id}">
        <span class="thumb" style="display:grid;place-items:center;color:var(--red)">${icon('mapPin')}</span>
        <div class="main"><div class="t">${a.full_name} • ${a.kind === 'check_in' ? 'حضور' : 'انصراف'}</div><div class="s"><span>${dateTime(a.created_at)}</span><span class="bad-t">${a.reason}</span>${a.distance_m != null ? html`<span class="num">${a.distance_m}م</span>` : ''}</div>
          ${JSON.parse(a.flags || '[]').length ? html`<div class="flag">${icon('alert', 'sm')} ${JSON.parse(a.flags).join('، ')}</div>` : ''}</div>${icon('chevL', 'sm')}</div>`) : empty('لا توجد محاولات مرفوضة 👌', 'checkCircle')}</div>`);
    t.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => {
      const a = d.items.find((x) => x.id === r.dataset.id);
      sheet({ title: 'تفاصيل المحاولة', body: html`<dl class="kv"><dt>الموظف</dt><dd>${a.full_name}</dd><dt>الوقت</dt><dd>${dateTime(a.created_at)}</dd><dt>السبب</dt><dd class="bad-t">${a.reason}</dd>
        <dt>الدقة</dt><dd class="num">${a.accuracy != null ? Math.round(a.accuracy) + 'م' : '—'}</dd><dt>المسافة</dt><dd class="num">${a.distance_m ?? '—'}م</dd><dt>الشبكة</dt><dd>${[a.ip_country, a.ip_city].filter(Boolean).join(' / ') || '—'}</dd></dl>
        <div style="margin-top:12px">${mapEmbed(a.lat, a.lng)}</div><div style="margin-top:8px">${mapsLink(a.lat, a.lng)}</div>` });
    }));
  }
}

function detail(a) {
  return sheet({
    title: `${a.full_name} • ${date(a.work_date)}`,
    body: html`<dl class="kv"><dt>الدوام</dt><dd class="num">${a.sched_start ? `${clock(a.sched_start)} – ${clock(a.sched_end)}` : 'بدون جدول'}</dd>
      <dt>الحضور</dt><dd>${dateTime(a.check_in_at)} <span class="muted num">(${a.in_distance_m ?? '—'}م، دقة ${a.in_accuracy ? Math.round(a.in_accuracy) : '—'}م)</span></dd>
      <dt>الانصراف</dt><dd>${a.check_out_at ? dateTime(a.check_out_at) : '—'} ${a.out_distance_m != null ? html`<span class="muted num">(${a.out_distance_m}م)</span>` : ''}</dd>
      <dt>التأخير</dt><dd>${minutesLabel(a.late_minutes)}</dd><dt>الخروج المبكر</dt><dd>${minutesLabel(a.early_leave_minutes)}</dd><dt>ساعات العمل</dt><dd>${minutesLabel(a.worked_minutes)}</dd>
      ${a.note ? html`<dt>ملاحظة</dt><dd>${a.note}</dd>` : ''}</dl>
      <div style="margin-top:12px">${mapEmbed(a.in_lat, a.in_lng)}</div><div style="margin-top:8px">${mapsLink(a.in_lat, a.in_lng)}</div>`,
    foot: can('attendance.manage') ? html`<button class="btn" data-edit>${icon('edit', 'sm')} تعديل يدوي</button>` : '',
    onMount: (el, close) => el.querySelector('[data-edit]')?.addEventListener('click', () => { close(); formSheet({
      title: 'تعديل الحضور', submit: 'حفظ',
      body: html`${field('وقت الحضور', inp('check_in_local', toLocal(a.check_in_at), { type: 'datetime-local', req: true }))}${field('وقت الانصراف', inp('check_out_local', toLocal(a.check_out_at), { type: 'datetime-local' }))}
        ${field('سبب التعديل *', ta('reason', '', 'يُحفظ في سجل العمليات', 2))}`,
      onSubmit: async (b) => { await put(`/api/attendance/${a.id}`, b); toast('تم التعديل'); refresh(); },
    }); }),
  });
}

async function manualForm() {
  const staff = (await lookups.staff()).filter((s) => s.works_shifts && s.active);
  formSheet({
    title: 'إضافة حضور يدوي', submit: 'حفظ',
    body: html`${field('الموظف', sel('user_id', staff.map((s) => ({ v: s.id, l: s.full_name })), '', { req: true, empty: 'اختر' }))}${field('يوم العمل', inp('work_date', state.today, { type: 'date', req: true }))}
      <div class="form-grid two">${field('الحضور', inp('check_in_local', '', { type: 'datetime-local', req: true }))}${field('الانصراف', inp('check_out_local', '', { type: 'datetime-local' }))}</div>
      ${field('السبب *', ta('reason', '', 'مثال: تعطل جوال الموظف', 2))}`,
    onSubmit: async (b) => { await post('/api/attendance/manual', b); toast('تمت الإضافة'); refresh(); },
  });
}
