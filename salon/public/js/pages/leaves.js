import { html, icon, mount, date, dateTime, badge, empty, toast, formSheet, field, ta } from '../ui.js';
import { get, post, qs } from '../api.js';
import { setTitle, go } from '../app.js';
import { diffDays, LEAVE_STATUS } from '../shared.js';

export async function render(view, { query, isCurrent }) {
  setTitle('الإجازات');
  const d = await get('/api/leaves' + qs({ status: query.status }));
  if (!isCurrent()) return;
  mount(view, html`
    <div class="page-head"><div><h2>طلبات الإجازة</h2><p>الإجازة المعتمدة لا تُحسب غياباً</p></div></div>
    <div class="chips" style="margin-bottom:12px"><a class="chip ${!query.status ? 'active' : ''}" href="#/leaves">الكل</a>${Object.entries(LEAVE_STATUS).map(([k, l]) => html`<a class="chip ${query.status === k ? 'active' : ''}" href="#/leaves?status=${k}">${l}</a>`)}</div>
    <div class="list">${d.items.length ? d.items.map((l) => html`<div class="row">
      <div class="main"><div class="t">${l.full_name} • ${date(l.start_date)} → ${date(l.end_date)} <span class="muted num">(${diffDays(l.start_date, l.end_date) + 1} يوم)</span></div>
        <div class="s">${l.reason ? html`<span>${l.reason}</span>` : ''}<span>${dateTime(l.created_at)}</span>${l.decided_by_name ? html`<span>القرار: ${l.decided_by_name}</span>` : ''}${l.decision_note ? html`<span class="gold">${l.decision_note}</span>` : ''}</div></div>
      <div class="end">${badge(l.status)}${l.status === 'pending' ? html`<div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm ok" data-a="${l.id}">قبول</button><button class="btn sm danger" data-r="${l.id}">رفض</button></div>` : ''}</div></div>`) : empty('لا توجد طلبات', 'palm')}</div>`);
  const decide = (id, status) => formSheet({
    title: status === 'approved' ? 'اعتماد الإجازة' : 'رفض الإجازة', submit: 'تأكيد',
    body: field('ملاحظة للموظف (اختياري)', ta('note', '', '', 2)),
    onSubmit: async (b) => { await post(`/api/leaves/${id}/decide`, { status, note: b.note }); toast('تم وإشعار الموظف'); render(view, { query, isCurrent }); },
  });
  view.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.a, 'approved')));
  view.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.r, 'rejected')));
}
