import { html, icon, mount, date, dateTime, badge, empty, toast, formSheet, field, inp, ta, confirmBox } from '../ui.js';
import { get, post } from '../api.js';
import { setTitle, refresh, state } from '../app.js';
import { diffDays } from '../shared.js';

export async function render(view, { isCurrent }) {
  setTitle('الإجازات');
  const d = await get('/api/me/leaves');
  if (!isCurrent()) return;
  mount(view, html`
    <div class="page-head"><div><h2>إجازاتي</h2><p>قدّم طلب إجازة وتابع حالته</p></div>
      <div class="actions"><button class="btn primary" data-new>${icon('plus')} طلب إجازة</button></div></div>
    <div class="list">${d.items.length ? d.items.map((l) => html`<div class="row">
      <span class="thumb" style="display:grid;place-items:center;color:var(--gold-2)">${icon('palm')}</span>
      <div class="main"><div class="t">${date(l.start_date)} → ${date(l.end_date)} <span class="muted num">(${diffDays(l.start_date, l.end_date) + 1} يوم)</span></div>
        <div class="s">${l.reason ? html`<span>${l.reason}</span>` : ''}<span>قُدم ${dateTime(l.created_at)}</span></div>
        ${l.decision_note || l.decided_by_name ? html`<div class="s"><span>${l.decided_by_name || ''}</span>${l.decision_note ? html`<span class="gold">${l.decision_note}</span>` : ''}</div>` : ''}</div>
      <div class="end">${badge(l.status)}${l.status === 'pending' ? html`<div style="margin-top:6px"><button class="btn sm ghost" data-cancel="${l.id}">إلغاء</button></div>` : ''}</div></div>`) : empty('لا توجد طلبات إجازة', 'palm')}</div>`);
  view.querySelector('[data-new]').addEventListener('click', () => formSheet({
    title: 'طلب إجازة', submit: 'إرسال الطلب',
    body: html`<div class="form-grid two">${field('من تاريخ *', inp('start_date', state.today, { type: 'date', req: true }))}${field('إلى تاريخ *', inp('end_date', state.today, { type: 'date', req: true }))}</div>
      ${field('السبب', ta('reason', '', 'اختياري', 3))}<div class="hint">الإجازة المعتمدة لا تُحسب غياباً.</div>`,
    onSubmit: async (b) => { await post('/api/me/leaves', b); toast('تم إرسال طلب الإجازة'); refresh(); },
  }));
  view.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox('إلغاء طلب الإجازة؟'))) return;
    await post(`/api/me/leaves/${b.dataset.cancel}/cancel`); toast('تم الإلغاء'); refresh();
  }));
}
