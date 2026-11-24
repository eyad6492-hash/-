import { html, icon, mount, money, date, empty, logo } from '../ui.js';
import { get } from '../api.js';
import { can, setTitle } from '../app.js';
import { QUOTE_STATUS } from '../shared.js';

export const QUOTE_BADGE = { draft: 'b-gray', sent: 'b-blue', review: 'b-purple', accepted: 'b-green', rejected: 'b-red', expired: 'b-gold' };

export default async function quotesPage(main, _p, q, stale) {
  setTitle('عروض الأسعار');
  const { items } = await get('/api/quotes');
  if (stale()) return;
  let f = q.f || 'all';
  const status = (x) => (x.expired ? 'expired' : x.status);
  const F = [['all', 'الكل'], ['pending', 'بلا رد'], ...Object.entries(QUOTE_STATUS)];
  const match = (x, k) => k === 'all' || status(x) === k || (k === 'pending' && ['sent', 'review'].includes(x.status) && !x.expired);
  mount(main, html`
    ${can('quotes.create') ? html`<a class="cta-review" href="#/quotes/new" style="margin-bottom:12px"><span class="ic">${icon('file', 'lg')}</span><div class="grow"><div class="bold" style="font-size:17px">إنشاء عرض سعر</div><div class="muted small">عرض احترافي PDF جاهز للواتساب والبريد</div></div>${icon('chevL')}</a>` : ''}
    <div class="chips">${F.map(([k, l]) => html`<button class="chip ${f === k ? 'active' : ''}" data-f="${k}">${l} <span class="cnt">${items.filter((x) => match(x, k)).length}</span></button>`)}</div>
    <div class="list grid-auto" data-list style="margin-top:12px"></div>`);
  const draw = () => {
    const r = items.filter((x) => match(x, f));
    mount(main.querySelector('[data-list]'), r.length ? r.map((x) => html`<a class="item" href="#/quotes/${x.id}">${logo({ name: x.client_name })}<div class="it-body"><div class="it-title">${x.client_name}${x.company && x.company !== x.client_name ? ` — ${x.company}` : ''}</div><div class="it-sub"><span class="num">${x.number}</span> • ${date(x.date)} • صالح حتى ${date(x.valid_until)}</div><div class="small bold" style="margin-top:2px">${money(x.total)}</div></div><span class="badge ${QUOTE_BADGE[status(x)]}">${QUOTE_STATUS[status(x)]}</span></a>`) : empty('لا توجد عروض أسعار', 'file'));
  };
  draw();
  main.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { f = b.dataset.f; main.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b)); draw(); } });
}
