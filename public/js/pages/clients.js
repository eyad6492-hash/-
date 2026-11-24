import { html, raw, icon, mount, money, n, logo, date, dateShort, empty, debounce, sheet, field, sel } from '../ui.js';
import { get, lookups } from '../api.js';
import { can, setTitle, go } from '../app.js';
import { CLIENT_STATUS, PLATFORMS } from '../shared.js';
import { clientForm } from '../forms.js';

export const STATUS_BADGE = { active: 'b-green', expiring: 'b-gold', expired: 'b-red', stopped: 'b-gray', frozen: 'b-blue', late: 'b-red', partial: 'b-gold', renewal: 'b-purple', former: 'b-gray' };
export const statusBadge = (k) => html`<span class="badge ${STATUS_BADGE[k] || 'b-gray'}">${CLIENT_STATUS[k] || k}</span>`;

const FILTERS = [['all', 'الكل'], ['active', 'نشط'], ['expiring', 'قريب الانتهاء'], ['expired', 'منتهي'], ['late', 'متأخر'], ['partial', 'جزئي'], ['renewal', 'يحتاج تجديد'], ['frozen', 'مجمد'], ['stopped', 'متوقف']];

export function clientRow(c, extra = '') {
  return html`<a class="item" href="#/clients/${c.id}">
    ${logo(c)}
    <div class="it-body"><div class="it-title">${c.name}</div>
      <div class="it-sub">${[c.store_name, c.business_type, (c.platforms || []).join(' / ')].filter(Boolean).join(' • ') || '—'}</div>
      <div class="xs muted" style="margin-top:2px">${c.tenure ? html`<span style="color:var(--cyan)">${icon('clock', 'sm')} ${c.tenure.label}</span>` : ''}${c.sub ? html`${c.tenure ? ' • ' : ''}${c.sub.open ? html`مفتوح${c.sub.next_due ? ` • الدفعة ${dateShort(c.sub.next_due)}` : ''}` : html`ينتهي ${date(c.sub.end_date)}`}${c.sub.remaining > 0 ? html` • <span style="color:var(--gold)">مستحق ${money(c.sub.remaining, 0)}</span>` : ''}` : ''}</div>
    </div>
    <div class="stack" style="gap:4px;justify-items:end">${statusBadge(c.status_display)}${extra}</div>
  </a>`;
}

export default async function clientsPage(main, _p, q, stale) {
  setTitle('العملاء');
  const [{ items }, cats] = await Promise.all([get('/api/clients'), lookups.categories()]);
  if (stale()) return;
  const st = { f: q.f || 'all', q: q.q || '', sort: 'recent', platform: '', cat: q.cat || '', tag: '' };
  const tags = [...new Set(items.flatMap((c) => c.tags))];

  mount(main, html`
    <div class="row" style="margin-bottom:12px">
      <div class="input-icon grow">${icon('search')}<input type="search" data-q placeholder="ابحث بالاسم، المتجر، الجوال، النشاط…" value="${st.q}"></div>
      <button class="btn icon ghost" data-filter aria-label="تصفية">${icon('filter')}</button>
      ${can('clients.create') ? html`<button class="btn primary icon" data-add aria-label="إضافة عميل">${icon('user_plus')}</button>` : ''}
    </div>
    <div class="chips" data-chips>${FILTERS.map(([k, l]) => html`<button class="chip ${st.f === k ? 'active' : ''}" data-f="${k}">${l} <span class="cnt">${count(items, k)}</span></button>`)}</div>
    <div class="row between" style="margin:12px 2px 8px"><span class="muted small" data-count></span>
      <select data-sort style="width:auto;min-height:36px;padding:4px 36px 4px 12px;font-size:13px">
        <option value="recent">الأحدث تعديلًا</option><option value="name">الاسم</option><option value="due">المستحق الأعلى</option><option value="end">الأقرب انتهاءً</option><option value="start">تاريخ الاشتراك</option></select></div>
    <div class="list grid-auto" data-list></div>`);

  const listEl = main.querySelector('[data-list]');
  const draw = () => {
    let r = items.filter((c) => st.f === 'all' || c.flags.includes(st.f) || c.status_display === st.f || (st.f === 'active' && c.status === 'active' && !c.flags.length));
    if (st.q) { const s = st.q.toLowerCase(); r = r.filter((c) => [c.name, c.store_name, c.phone, c.email, c.business_type, ...(c.tags || []), ...(c.platforms || [])].some((x) => String(x || '').toLowerCase().includes(s))); }
    if (st.platform) r = r.filter((c) => c.platforms.includes(st.platform));
    if (st.cat) r = r.filter((c) => c.category_ids.includes(st.cat));
    if (st.tag) r = r.filter((c) => c.tags.includes(st.tag));
    const by = { name: (a, b) => a.name.localeCompare(b.name, 'ar'), due: (a, b) => (b.sub?.remaining || 0) - (a.sub?.remaining || 0), end: (a, b) => (a.sub?.end_date || '9999').localeCompare(b.sub?.end_date || '9999'), start: (a, b) => (b.sub?.start_date || '').localeCompare(a.sub?.start_date || ''), recent: () => 0 }[st.sort];
    r = [...r].sort(by);
    main.querySelector('[data-count]').textContent = `${r.length} عميل` + (st.cat ? ` • ${cats.find((c) => c.id === st.cat)?.name || ''}` : '') + (st.platform ? ` • ${st.platform}` : '') + (st.tag ? ` • #${st.tag}` : '');
    mount(listEl, r.length ? r.map((c) => clientRow(c)) : empty(items.length ? 'لا توجد نتائج مطابقة' : 'لا يوجد عملاء بعد — ابدأ بإضافة أول عميل', 'users', can('clients.create') && !items.length ? html`<button class="btn primary" data-add>${icon('user_plus')} إضافة عميل</button>` : ''));
  };
  draw();
  main.querySelector('[data-q]').addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); draw(); }, 150));
  main.querySelector('[data-sort]').addEventListener('change', (e) => { st.sort = e.target.value; draw(); });
  main.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-f]');
    if (f) { st.f = f.dataset.f; main.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('active', b === f)); draw(); return; }
    if (e.target.closest('[data-add]')) { const r = await clientForm(); if (r?.id) go(`#/clients/${r.id}`); return; }
    if (e.target.closest('[data-filter]')) {
      const r = await sheet({
        title: 'تصفية العملاء',
        body: html`<div class="form-grid">${field('المنصة', sel('platform', PLATFORMS, st.platform, { empty: 'كل المنصات' }))}
          ${field('التصنيف', sel('cat', cats.map((c) => ({ v: c.id, l: `${c.name} (${c.count})` })), st.cat, { empty: 'كل التصنيفات' }))}
          ${tags.length ? field('الوسم', sel('tag', tags, st.tag, { empty: 'كل الوسوم' })) : ''}</div>`,
        foot: html`<button class="btn ghost" data-reset>مسح</button><button class="btn primary" data-ok>تطبيق</button>`,
        onMount: (el, close) => {
          el.querySelector('[data-ok]').addEventListener('click', () => close({ platform: el.querySelector('[name=platform]').value, cat: el.querySelector('[name=cat]').value, tag: el.querySelector('[name=tag]')?.value || '' }));
          el.querySelector('[data-reset]').addEventListener('click', () => close({ platform: '', cat: '', tag: '' }));
        },
      });
      if (r) { Object.assign(st, r); draw(); }
    }
  });
}

function count(items, k) {
  if (k === 'all') return items.length;
  return items.filter((c) => c.flags.includes(k) || c.status_display === k || (k === 'active' && c.status === 'active' && !c.flags.length)).length;
}
export { raw, n };
