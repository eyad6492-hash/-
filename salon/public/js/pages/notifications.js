import { html, icon, mount, dateTime, empty } from '../ui.js';
import { get, post } from '../api.js';
import { setTitle, setUnread } from '../app.js';

const IC = { check_in: 'login', check_out: 'logout', late: 'clock', absent: 'alert', attempt: 'mapPin', invoice: 'receipt', invoice_review: 'receipt', invoice_edit_request: 'edit', leave: 'palm', payment: 'banknote', report: 'file', schedule: 'calendar', rate: 'percent', closure: 'closeLock' };
export async function render(view, { isCurrent }) {
  setTitle('الإشعارات');
  const d = await get('/api/notifications');
  if (!isCurrent()) return;
  mount(view, html`
    <div class="page-head"><div><h2>الإشعارات</h2><p>${d.unread ? `${d.unread} غير مقروء` : 'لا جديد'}</p></div>
      ${d.unread ? html`<div class="actions"><button class="btn sm" data-all>${icon('check', 'sm')} تعليم الكل كمقروء</button></div>` : ''}</div>
    <div class="list">${d.items.length ? d.items.map((x) => html`<a class="row" href="${x.link || '#/notifications'}" data-id="${x.id}" style="${x.read_at ? 'opacity:.62' : 'border-color:var(--line-2)'}">
      <span class="thumb" style="display:grid;place-items:center;color:var(--gold-2)">${icon(IC[x.type] || 'bell')}</span>
      <div class="main"><div class="t" style="white-space:normal">${x.title}</div><div class="s">${x.body ? html`<span>${x.body}</span>` : ''}<span>${dateTime(x.created_at)}</span></div></div>
      ${!x.read_at ? html`<span class="badge gold">جديد</span>` : ''}</a>`) : empty('لا توجد إشعارات', 'bell')}</div>`);
  view.querySelector('[data-all]')?.addEventListener('click', async () => { await post('/api/notifications/read', {}); setUnread(0); render(view, { isCurrent }); });
  view.querySelectorAll('[data-id]').forEach((a) => a.addEventListener('click', () => { post('/api/notifications/read', { id: a.dataset.id }).then(() => get('/api/notifications/unread')).then((r) => setUnread(r.unread)).catch(() => {}); }));
}
