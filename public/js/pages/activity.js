import { html, icon, mount, dateTime, empty, debounce, sel } from '../ui.js';
import { get, lookups } from '../api.js';
import { setTitle } from '../app.js';

const ENT = { client: 'العملاء', subscription: 'الاشتراكات', freeze: 'التجميد', payment: 'المدفوعات', campaign: 'الحملات', report: 'التقارير', task: 'المهام', followup: 'المتابعة', quote: 'عروض الأسعار', vault: 'الخزنة', user: 'المستخدمون', settings: 'الإعدادات', backup: 'النسخ الاحتياطي', category: 'التصنيفات', export: 'التصدير', demo: 'بيانات تجريبية' };
const ENT_IC = { client: 'users', subscription: 'subs', freeze: 'snow', payment: 'coins', campaign: 'megaphone', report: 'bars', task: 'checkSquare', followup: 'calendarCheck', quote: 'file', vault: 'key', user: 'shield', settings: 'settings', backup: 'cloud', category: 'tag', export: 'download', demo: 'box' };

export default async function activityPage(main, _p, q, stale) {
  setTitle('سجل النشاط');
  const [users, clients] = await Promise.all([lookups.users().catch(() => []), lookups.clients()]);
  if (stale()) return;
  const st = { q: '', entity: '', user_id: '', client_id: q.client || '' };
  let items = [];
  mount(main, html`<div class="stack">
    <div class="input-icon">${icon('search')}<input type="search" data-q placeholder="ابحث في العمليات والتفاصيل…"></div>
    <div class="grid-3">${sel('entity', ENT, '', { empty: 'كل الأقسام' })}${sel('user_id', users.map((u) => ({ v: u.id, l: u.display_name })), '', { empty: 'كل المستخدمين' })}${sel('client_id', clients.map((c) => ({ v: c.id, l: c.name })), st.client_id, { empty: 'كل العملاء' })}</div></div>
    <div class="list" data-list style="margin-top:12px"></div><button class="btn ghost block hidden" data-more style="margin-top:10px">تحميل المزيد</button>`);
  const row = (a) => html`<div class="item" style="cursor:default;align-items:flex-start"><span class="logo sm" style="background:var(--surface-2);color:var(--pink)">${icon(ENT_IC[a.entity] || 'history', 'sm')}</span>
    <div class="it-body"><div class="it-title" style="white-space:normal">${a.action}${a.client_name ? html` — <a class="link" href="#/clients/${a.client_id}">${a.client_name}</a>` : ''}</div>
      ${a.details ? html`<div class="small" style="color:var(--text-2);word-break:break-word">${a.details}</div>` : ''}<div class="xs muted">${dateTime(a.created_at)} • ${a.user_name || '—'}</div></div></div>`;
  const load = async (more = false) => {
    const p = new URLSearchParams(Object.entries(st).filter(([, v]) => v));
    if (more && items.length) p.set('before', items[items.length - 1].created_at);
    const r = await get('/api/activity?' + p);
    items = more ? items.concat(r.items) : r.items;
    mount(main.querySelector('[data-list]'), items.length ? items.map(row) : empty('لا توجد عمليات', 'history'));
    main.querySelector('[data-more]').classList.toggle('hidden', r.items.length < 100);
  };
  await load();
  main.querySelector('[data-q]').addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); load(); }, 300));
  main.addEventListener('change', (e) => { if (e.target.name in st) { st[e.target.name] = e.target.value; load(); } });
  main.querySelector('[data-more]').addEventListener('click', () => load(true));
}
