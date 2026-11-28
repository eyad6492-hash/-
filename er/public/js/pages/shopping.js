// Shopping List — one-tap add, tap to tick off, show/hide completed, grouped by category.
import { all, byId, store, update, create, remove } from '../store.js';
import { esc, icon, avatar, pageHead, empty, toastErr, confirmBox, toast } from '../ui.js';
import { L } from '../labels.js';
import { editShopping } from '../editors.js';

const st = { cat: 'all', showDone: false, addCat: 'groceries' };

export default {
  render(el) {
    const items = all('shopping');
    let list = st.cat === 'all' ? items : items.filter((x) => (x.category || 'other') === st.cat);
    const open = list.filter((x) => !x.done), done = list.filter((x) => x.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
    const groups = Object.keys(L.shopCats).map((c) => [c, open.filter((x) => (x.category || 'other') === c).sort((a, b) => a.created_at.localeCompare(b.created_at))]).filter(([, l]) => l.length);
    const row = (x) => `<div class="shop-item ${x.done ? 'done' : ''}" data-tick="${x.id}">
      <span class="check round ${x.done ? 'on' : ''}">${icon('check', 'sm')}</span>
      <div class="grow" style="min-width:0"><div class="${x.done ? 'done-text' : ''}" style="font-weight:500">${esc(x.name)}${x.qty ? ` <span class="muted small">× ${esc(x.qty)}</span>` : ''}</div>
        <div class="tiny muted ellipsis">${x.done && x.done_by ? `اشتراه ${esc(store.partner?.id === x.done_by ? store.partner.name : store.me.name)}` : `أضافه ${esc(x.created_by === store.me.id ? store.me.name : store.partner?.name || '')}`}${x.notes ? ' · ' + esc(x.notes) : ''}${x.remind === 'custom' && x.remind_at ? ' · ⏰' : ''}</div></div>
      ${x.buyer ? avatar(x.buyer, 'sm') : ''}<button class="icon-btn plain" data-edit="${x.id}" aria-label="تعديل">${icon('edit', 'sm')}</button></div>`;
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'مشترياتنا', ar: 'المقاضي', back: '#/more' })}
      <form class="quick-add" id="qa"><input class="input" id="qn" placeholder="أضف منتجًا… (مثال: حليب × 2)" autocomplete="off" enterkeyhint="done"><button class="btn" type="submit" aria-label="إضافة">${icon('plus')}</button></form>
      <div class="chips" style="margin-top:-4px">${Object.entries(L.shopCats).map(([k, l]) => `<button class="chip ${st.addCat === k ? 'on' : ''}" data-addcat="${k}" style="height:30px;font-size:12px">${l}</button>`).join('')}</div>
      <div class="row between" style="margin:4px 0 10px"><div class="tabs grow" style="margin:0;overflow-x:auto"><button data-cat="all" class="${st.cat === 'all' ? 'on' : ''}">الكل · ${items.filter((x) => !x.done).length}</button>${Object.entries(L.shopCats).map(([k, l]) => items.some((x) => (x.category || 'other') === k) ? `<button data-cat="${k}" class="${st.cat === k ? 'on' : ''}">${L.shopCats[k]}</button>` : '').join('')}</div></div>
      ${groups.length ? groups.map(([c, l]) => `<div class="section-title" style="margin-top:14px"><h2>${L.shopCats[c]}</h2><span class="en"></span></div>${l.map(row).join('')}`).join('') : !done.length ? empty('كل شيء متوفر', 'القائمة فارغة — أضف أول منتج من الأعلى') : '<div class="card soft center small muted">تم شراء كل شيء ✓</div>'}
      ${done.length ? `<div class="row between" style="margin-top:20px"><button class="link" style="border:0;background:none;cursor:pointer" data-showdone>${st.showDone ? 'إخفاء' : 'عرض'} المكتملة (${done.length})</button>${st.showDone ? '<button class="link" style="border:0;background:none;cursor:pointer;color:var(--danger)" data-clear>حذف المكتملة</button>' : ''}</div>${st.showDone ? `<div style="margin-top:8px">${done.map(row).join('')}</div>` : ''}` : ''}
    </div>`;
    const qa = el.querySelector('#qa');
    qa.onsubmit = async (e) => {
      e.preventDefault();
      const inp = el.querySelector('#qn'); let name = inp.value.trim(); if (!name) return;
      let qty = null; const m = name.match(/^(.*?)\s*[×x*]\s*(\S.*)$/i); if (m) { name = m[1]; qty = m[2]; }
      inp.value = '';
      try { await create('shopping', { name, qty, category: st.cat !== 'all' ? st.cat : st.addCat }); el.querySelector('#qn')?.focus(); } catch (err) { inp.value = name; toastErr(err); }
    };
    el.onclick = async (e) => {
      const q = (s) => e.target.closest(s); let b;
      try {
        if ((b = q('[data-edit]'))) { e.stopPropagation(); return editShopping(byId('shopping', b.dataset.edit)); }
        if ((b = q('[data-addcat]'))) { st.addCat = b.dataset.addcat; el.querySelectorAll('[data-addcat]').forEach((x) => x.classList.toggle('on', x === b)); return; }
        if ((b = q('[data-cat]'))) { st.cat = b.dataset.cat; return this.render(el); }
        if (q('[data-showdone]')) { st.showDone = !st.showDone; return this.render(el); }
        if (q('[data-clear]')) { if (!(await confirmBox('حذف كل المنتجات المكتملة؟', { ok: 'حذف' }))) return; for (const x of done) await remove('shopping', x.id); toast('تم التنظيف'); return; }
        if ((b = q('[data-tick]'))) { const x = byId('shopping', b.dataset.tick); b.classList.toggle('done'); b.querySelector('.check').classList.toggle('on'); await update('shopping', x.id, { done: !x.done }); }
      } catch (err) { toastErr(err); }
    };
  },
};
