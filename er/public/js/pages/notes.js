// Little Notes — short messages to each other; pinned first.
import { all, byId, store, update, isMe } from '../store.js';
import { esc, icon, avatar, pageHead, empty, img, openSheet, toastErr } from '../ui.js';
import { fmtGreg } from '../dates.js';
import { L } from '../labels.js';
import { editNote } from '../editors.js';

const st = { who: 'all' };

export default {
  render(el) {
    let notes = all('notes');
    if (st.who === 'me') notes = notes.filter((n) => isMe(n.created_by));
    if (st.who === 'partner') notes = notes.filter((n) => !isMe(n.created_by));
    notes.sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || (b.date || b.created_at).localeCompare(a.date || a.created_at) || b.created_at.localeCompare(a.created_at));
    const p = store.partner;
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'Little Notes', ar: 'رسائلنا الصغيرة', back: '#/more', actions: `<button class="btn sm" data-new>${icon('plus', 'sm')} رسالة</button>` })}
      <div class="tabs"><button data-who="all" class="${st.who === 'all' ? 'on' : ''}">الكل</button><button data-who="partner" class="${st.who === 'partner' ? 'on' : ''}">من ${esc(p?.name || 'الطرف الآخر')}</button><button data-who="me" class="${st.who === 'me' ? 'on' : ''}">مني</button></div>
      ${notes.length ? `<div class="notes-grid">${notes.map((n) => `<div class="note ${n.color || 'cream'}" data-open="${n.id}">${n.pinned ? `<span class="pin">${icon('pin', 'sm')}</span>` : ''}
        ${n.image_id ? img(n.image_id) : ''}
        <div class="tiny ${n.color === 'charcoal' ? '' : 'muted'}" style="margin-bottom:4px;opacity:.8">${esc(L.noteKinds[n.kind] || '')}</div>
        ${n.title ? `<div style="font-weight:600;margin-bottom:4px">${esc(n.title)}</div>` : ''}
        ${n.body ? `<div class="body">${esc(n.body.length > 220 ? n.body.slice(0, 220) + '…' : n.body)}</div>` : ''}
        <div class="row between" style="margin-top:10px">${avatar(n.created_by, 'sm')}<span class="tiny muted">${fmtGreg(n.date || n.created_at.slice(0, 10), { year: false })}</span></div></div>`).join('')}</div>`
        : empty('Leave a little note', 'رسالة صباحية، مفاجأة، فكرة، تذكير أو شيء نريد تذكّره…', `<br><button class="btn sm" data-new>${icon('plus', 'sm')} اكتب رسالة</button>`)}
    </div>`;
    el.onclick = (e) => {
      const q = (s) => e.target.closest(s); let b;
      if (q('[data-new]')) return editNote();
      if ((b = q('[data-who]'))) { st.who = b.dataset.who; return this.render(el); }
      if ((b = q('[data-open]'))) {
        const n = byId('notes', b.dataset.open);
        openSheet({
          title: n.title || L.noteKinds[n.kind] || 'رسالة', en: 'Little Note',
          body: `${n.image_id ? img(n.image_id, 'cover') + '<div style="height:12px"></div>' : ''}<div style="white-space:pre-wrap;font-size:16px;line-height:1.8">${esc(n.body || '')}</div><div class="row" style="margin-top:16px;gap:8px">${avatar(n.created_by, 'sm')}<span class="small muted">${fmtGreg(n.date || n.created_at.slice(0, 10), { weekday: true })}</span></div>`,
          foot: `<button class="btn soft" data-pin>${icon('pin', 'sm')} ${n.pinned ? 'إلغاء التثبيت' : 'تثبيت'}</button><button class="icon-btn" data-edit>${icon('edit')}</button>`,
          onMount: (sh, close) => {
            sh.querySelector('[data-pin]').onclick = async () => { try { await update('notes', n.id, { pinned: !n.pinned }); close(); } catch (err) { toastErr(err); } };
            sh.querySelector('[data-edit]').onclick = () => { close(); setTimeout(() => editNote(n), 240); };
          },
        });
      }
    };
  },
};
