import { html, icon, mount, money, logo, date, empty } from '../ui.js';
import { get } from '../api.js';
import { can, setTitle } from '../app.js';
import { SUB_STATUS, PAY_STATUS } from '../shared.js';
import { SUB_BADGE, PAY_BADGE } from './client.js';

const F = [['all', 'الكل'], ['active', 'نشط'], ['expiring', 'قريب الانتهاء'], ['expired', 'منتهي'], ['frozen', 'مجمد'], ['stopped', 'متوقف'], ['pending_renewal', 'ينتظر التجديد'], ['unpaid', 'غير مدفوع'], ['partial', 'مدفوع جزئيًا']];

export default async function subsPage(main, _p, q, stale) {
  setTitle('الاشتراكات');
  const { items } = await get('/api/subscriptions');
  if (stale()) return;
  let f = q.f || 'all';
  const match = (x, k) => k === 'all' || x.sub.state === k || (k === 'unpaid' && ['late', 'due'].includes(x.sub.pay_status) && x.sub.paid === 0) || (k === 'partial' && x.sub.partial);
  mount(main, html`
    <div class="chips">${F.map(([k, l]) => html`<button class="chip ${f === k ? 'active' : ''}" data-f="${k}">${l} <span class="cnt">${items.filter((x) => match(x, k)).length}</span></button>`)}</div>
    <div class="list grid-auto" data-list style="margin-top:12px"></div>`);
  const draw = () => {
    const r = items.filter((x) => match(x, f)).sort((a, b) => a.sub.end_date.localeCompare(b.sub.end_date));
    mount(main.querySelector('[data-list]'), r.length ? r.map(({ client: c, sub: s }) => html`<a class="item" href="#/clients/${c.id}?tab=subscription">${logo(c)}
      <div class="it-body"><div class="it-title">${c.name}</div><div class="it-sub">${date(s.start_date)} ← ${date(s.end_date)}</div>
        <div class="xs" style="margin-top:3px">${s.days_left >= 0 ? `متبقي ${s.days_left} يوم` : `منتهي منذ ${-s.days_left} يوم`}${can('payments.view') ? html` • ${money(s.amount, 0)} • <span class="badge ${PAY_BADGE[s.pay_status]}" style="padding:0 6px">${PAY_STATUS[s.pay_status]}</span>` : ''}</div></div>
      <span class="badge ${SUB_BADGE[s.state] || 'b-gray'}">${SUB_STATUS[s.state] || s.state}</span></a>`) : empty('لا توجد اشتراكات', 'subs'));
  };
  draw();
  main.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { f = b.dataset.f; main.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b)); draw(); } });
  void icon;
}
