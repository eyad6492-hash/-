import { html, icon, mount, empty, toast, confirmBox, formSheet, field, inp, colorFor } from '../ui.js';
import { get, post, put, del, invalidate } from '../api.js';
import { can, setTitle, refresh, go } from '../app.js';

export default async function categoriesPage(main, _p, _q, stale) {
  setTitle('الأنشطة والتصنيفات');
  const [{ items }, { items: clients }] = await Promise.all([get('/api/categories'), get('/api/clients')]);
  if (stale()) return;
  const tags = {}; for (const c of clients) for (const t of c.tags) tags[t] = (tags[t] || 0) + 1;
  const types = {}; for (const c of clients) if (c.business_type) types[c.business_type] = (types[c.business_type] || 0) + 1;
  mount(main, html`
    <div class="row between" style="margin-bottom:12px"><span class="muted small">اضغط على التصنيف لعرض عملائه</span>${can('clients.edit') ? html`<button class="btn primary sm" data-add>${icon('plus', 'sm')} تصنيف جديد</button>` : ''}</div>
    <div class="grid-2 md-grid-3">${items.length ? items.map((c) => html`<div class="card flat" style="padding:12px;cursor:pointer" data-open="${c.id}">
      <div class="row"><span class="logo sm" style="background:${c.color || colorFor(c.name)}">${icon('tag', 'sm')}</span><div class="grow"><b>${c.name}</b><div class="muted xs">${c.count} عميل</div></div>
      ${can('clients.edit') ? html`<button class="icon-btn" data-edit="${c.id}">${icon('edit', 'sm')}</button>` : ''}</div></div>`) : empty('لا توجد تصنيفات', 'tag')}</div>
    ${Object.keys(tags).length ? html`<div class="section"><div class="section-head"><h3>الوسوم (Tags)</h3></div><div class="chips" style="flex-wrap:wrap">${Object.entries(tags).map(([t, n]) => html`<a class="chip" href="#/search?q=${encodeURIComponent(t)}">#${t} <span class="cnt">${n}</span></a>`)}</div></div>` : ''}
    ${Object.keys(types).length ? html`<div class="section"><div class="section-head"><h3>أنواع النشاط التجاري</h3></div><div class="chips" style="flex-wrap:wrap">${Object.entries(types).map(([t, n]) => html`<a class="chip" href="#/search?q=${encodeURIComponent(t)}">${t} <span class="cnt">${n}</span></a>`)}</div></div>` : ''}`);
  const edit = (c = {}) => formSheet({
    title: c.id ? 'تعديل التصنيف' : 'تصنيف جديد',
    body: html`${field('اسم التصنيف', inp('name', c.name, { req: true }))}${field('اللون', inp('color', c.color || '#7c5cff', { type: 'color', attrs: 'style="height:48px;padding:4px"' }))}`,
    extraFoot: c.id ? html`<button type="button" class="btn danger icon" data-delcat>${icon('trash')}</button>` : '',
    onMount: (el, close) => el.querySelector('[data-delcat]')?.addEventListener('click', async () => { if (await confirmBox(`حذف تصنيف «${c.name}»؟ لن يُحذف أي عميل.`, { danger: true, ok: 'حذف' })) { await del(`/api/categories/${c.id}`); close(true); } }),
    onSubmit: async (d) => { c.id ? await put(`/api/categories/${c.id}`, d) : await post('/api/categories', d); toast('تم الحفظ'); return true; },
  });
  main.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { e.stopPropagation(); if (await edit(items.find((x) => x.id === ed.dataset.edit))) { invalidate('categories'); refresh(); } return; }
    if (e.target.closest('[data-add]')) { if (await edit()) { invalidate('categories'); refresh(); } return; }
    const o = e.target.closest('[data-open]'); if (o) go(`#/clients?cat=${o.dataset.open}`);
  });
}
