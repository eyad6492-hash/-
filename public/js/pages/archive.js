import { html, icon, mount, logo, date, empty, toast, debounce } from '../ui.js';
import { get, post, invalidate } from '../api.js';
import { can, setTitle, refresh } from '../app.js';

export default async function archivePage(main, _p, _q, stale) {
  setTitle('العملاء السابقون');
  const { items } = await get('/api/clients?scope=archived');
  if (stale()) return;
  mount(main, html`<p class="muted small" style="margin:0 2px 12px">العملاء المؤرشفون محفوظون بكامل بياناتهم (التقارير، الحملات، المدفوعات، الاشتراكات، المتابعة، الملاحظات). يمكنك إعادة تفعيل أي عميل في أي وقت.</p>
    <div class="input-icon" style="margin-bottom:12px">${icon('search')}<input type="search" data-q placeholder="بحث في الأرشيف…"></div><div class="list grid-auto" data-list></div>`);
  const draw = (s = '') => {
    const r = items.filter((c) => !s || `${c.name} ${c.store_name || ''} ${c.phone || ''}`.includes(s));
    mount(main.querySelector('[data-list]'), r.length ? r.map((c) => html`<div class="item"><a href="#/clients/${c.id}" class="row grow" style="min-width:0">${logo(c)}<div class="it-body"><div class="it-title">${c.name}</div><div class="it-sub">${c.store_name || ''} • أُرشف ${date(c.archived_at)}</div></div></a>${can('clients.edit') ? html`<button class="btn sm success" data-re="${c.id}">${icon('rotate', 'sm')} تفعيل</button>` : ''}</div>`) : empty('لا يوجد عملاء سابقون', 'archive'));
  };
  draw();
  main.querySelector('[data-q]').addEventListener('input', debounce((e) => draw(e.target.value.trim()), 150));
  main.addEventListener('click', async (e) => { const b = e.target.closest('[data-re]'); if (b) { try { await post(`/api/clients/${b.dataset.re}/reactivate`, {}); invalidate('clients'); toast('تمت إعادة تفعيل العميل'); refresh(); } catch (err) { toast(err.message, 'err'); } } });
}
