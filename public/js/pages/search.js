import { html, icon, mount, empty, debounce, logo } from '../ui.js';
import { get } from '../api.js';
import { setTitle } from '../app.js';

const TYPE = { client: ['عميل', 'users', 'b-purple'], campaign: ['حملة', 'megaphone', 'b-pink'], task: ['مهمة', 'checkSquare', 'b-green'], report: ['تقرير', 'bars', 'b-cyan'], quote: ['عرض سعر', 'file', 'b-gold'] };

export default async function searchPage(main, _p, q) {
  setTitle('البحث');
  mount(main, html`<div class="input-icon">${icon('search')}<input type="search" data-q placeholder="اسم العميل، المتجر، الجوال، النشاط، المنصة، حملة، مهمة، تقرير…" value="${q.q || ''}" autofocus></div>
    <div class="chips" style="margin-top:10px" data-types>${[['', 'الكل'], ...Object.entries(TYPE).map(([k, v]) => [k, v[0]])].map(([k, l]) => html`<button class="chip ${!k ? 'active' : ''}" data-t="${k}">${l}</button>`)}</div>
    <div class="list" data-list style="margin-top:12px">${empty('ابدأ الكتابة للبحث في كل التطبيق', 'search')}</div>`);
  let results = [], type = '';
  const draw = () => {
    const r = results.filter((x) => !type || x.type === type);
    mount(main.querySelector('[data-list]'), r.length ? r.map((x) => html`<a class="item" href="${x.link}">${x.type === 'client' ? logo({ name: x.title, logo: x.logo }) : html`<span class="logo" style="background:var(--surface-2);color:var(--pink)">${icon(TYPE[x.type][1])}</span>`}<div class="it-body"><div class="it-title">${x.title}</div><div class="it-sub">${x.sub || ''}</div></div><span class="badge ${TYPE[x.type][2]}">${TYPE[x.type][0]}</span></a>`) : empty('لا توجد نتائج', 'search'));
  };
  const run = debounce(async (s) => { if (!s) { results = []; return mount(main.querySelector('[data-list]'), empty('ابدأ الكتابة للبحث في كل التطبيق', 'search')); } results = (await get('/api/search?q=' + encodeURIComponent(s))).results; draw(); }, 250);
  const input = main.querySelector('[data-q]');
  input.addEventListener('input', (e) => run(e.target.value.trim()));
  main.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { type = b.dataset.t; main.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b)); draw(); } });
  if (q.q) run(q.q);
  setTimeout(() => input.focus(), 50);
}
