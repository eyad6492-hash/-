// UI primitives: escaping, avatars, bottom sheets, toasts, confirmations, small display helpers.
import { icon } from './icons.js';
import { fileUrl } from './api.js';
import { person, store, currency } from './store.js';
import { countdown, diffDays } from './dates.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = esc;
export { icon };

export function avatar(idOrUser, cls = '') {
  if (idOrUser === 'both') return `<span class="av both ${cls}" title="سوا">E&R</span>`;
  const u = typeof idOrUser === 'object' ? idOrUser : person(idOrUser);
  if (!u) return `<span class="av ${cls}">?</span>`;
  const inner = u.avatar_id ? `<img src="${fileUrl(u.avatar_id)}" alt="">` : esc(u.letter);
  return `<span class="av ${u.letter} ${cls}" title="${esc(u.name)}">${inner}</span>`;
}
export function byline(row) {
  if (!row) return '';
  const c = person(row.created_by), up = person(row.updated_by);
  let s = c ? `أضافه ${c.name}` : '';
  if (c && c.letter === 'R') s = `أضافته ${c.name}`;
  if (up && row.updated_at && row.updated_at !== row.created_at) s += ` · آخر تعديل ${up.name}`;
  return s;
}

export function money(n) {
  const v = Number(n || 0);
  return `${v.toLocaleString('en-US', { maximumFractionDigits: v % 1 ? 2 : 0 })} ${currency()}`;
}
export function stars(n, max = 5) { let s = ''; for (let i = 1; i <= max; i++) s += `<span class="${i <= n ? 'on' : ''}">★</span>`; return `<span class="stars">${s}</span>`; }
export function cdBox(n) {
  if (n === null || n === undefined) return '';
  if (n === 0) return '<div class="cd today"><b>✦</b><span>اليوم</span></div>';
  if (n < 0) return `<div class="cd"><b>${-n}</b><span>مضى</span></div>`;
  return `<div class="cd"><b>${n}</b><span>${n === 1 ? 'غدًا' : n <= 10 ? 'أيام' : 'يومًا'}</span></div>`;
}
export const cdText = (today, date) => countdown(diffDays(today, date));

export function pageHead({ en, ar, back, actions = '' }) {
  return `${back ? `<a class="back" href="${back}">${icon('chevR', 'sm')} رجوع</a>` : ''}
  <div class="page-head"><div><div class="kicker">${esc(en)}</div><h1>${esc(ar)}</h1></div><div class="row">${actions}</div></div>`;
}
export function empty(en, ar, btn = '') { return `<div class="empty"><span class="en">${esc(en)}</span>${esc(ar)}${btn}</div>`; }
export const img = (id, cls = '', alt = '') => (id ? `<img class="${cls}" src="${fileUrl(id)}" alt="${esc(alt)}" loading="lazy">` : '');

// ---------------- toast ----------------
export function toast(msg, type = '') {
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.innerHTML = `${type === 'err' ? icon('x', 'sm') : icon('check', 'sm')}<span>${esc(msg)}</span>`;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, type === 'err' ? 4200 : 2600);
}
export const toastErr = (e) => toast(e?.message || String(e), 'err');

// ---------------- sheets ----------------
const stack = [];
export function openSheet({ title, en = '', body = '', foot = '', onMount, onClose, wide = false }) {
  const bd = document.createElement('div'); bd.className = 'backdrop';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
  if (wide) sh.style.width = 'min(720px, 100%)';
  sh.innerHTML = `<div class="grab"></div><div class="sheet-head"><div>${en ? `<span class="en">${esc(en)}</span>` : ''}<h3>${esc(title)}</h3></div><button class="icon-btn plain" data-close aria-label="إغلاق">${icon('x')}</button></div><div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
  document.body.append(bd, sh);
  document.body.style.overflow = 'hidden';
  const entry = { bd, sh, onClose, closed: false };
  stack.push(entry);
  history.pushState({ sheet: stack.length }, '');
  const close = (fromPop = false) => {
    if (entry.closed) return; entry.closed = true;
    const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1);
    sh.classList.add('closing'); bd.style.opacity = '0'; bd.style.transition = 'opacity .2s';
    setTimeout(() => { sh.remove(); bd.remove(); if (!stack.length) document.body.style.overflow = ''; }, 220);
    if (!fromPop) history.back();
    onClose?.();
  };
  entry.close = close;
  bd.onclick = () => close();
  sh.querySelector('[data-close]').onclick = () => close();
  // swipe down to close (mobile)
  let y0 = null;
  sh.querySelector('.grab').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  sh.querySelector('.sheet-head').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  sh.addEventListener('touchmove', (e) => { if (y0 === null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sh.addEventListener('touchend', (e) => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (dy > 110) close(); else sh.style.transform = ''; });
  onMount?.(sh, close);
  return { el: sh, close };
}
window.addEventListener('popstate', () => { const top = stack[stack.length - 1]; if (top) top.close(true); });
export const closeAllSheets = (fromPop = true) => { while (stack.length) stack[stack.length - 1].close(fromPop); };
export const sheetOpen = () => stack.length > 0;

export function confirmBox(message, { ok = 'تأكيد', danger = true, title = 'تأكيد' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const { close } = openSheet({
      title, body: `<p style="margin:4px 0 8px;color:var(--ink2)">${esc(message)}</p>`,
      foot: `<button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(ok)}</button><button class="btn ghost" data-no>إلغاء</button>`,
      onMount: (sh, cl) => { sh.querySelector('[data-ok]').onclick = () => { done = true; resolve(true); cl(); }; sh.querySelector('[data-no]').onclick = () => cl(); },
      onClose: () => { if (!done) resolve(false); },
    });
    void close;
  });
}

/** Action menu (list of choices) → resolves the chosen key. */
export function choose(title, items, en = '') {
  return new Promise((resolve) => {
    let picked = null;
    openSheet({
      title, en,
      body: `<div class="menu-grid">${items.map((it) => `<button data-k="${esc(it.k)}"><span class="ic-box ${it.tone || ''}">${icon(it.icon)}</span>${esc(it.l)}</button>`).join('')}</div>`,
      onMount: (sh, cl) => sh.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { picked = b.dataset.k; cl(); }; }),
      onClose: () => setTimeout(() => resolve(picked), 230),
    });
  });
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => toast('تم النسخ'));
  const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('تم النسخ');
  return Promise.resolve();
}
export function shareOrCopy(text, title = 'E&R') {
  if (navigator.share) return navigator.share({ title, text }).catch(() => {});
  return copyText(text);
}
export const greetingFor = (h) => (h < 5 ? 'مساء الخير' : h < 12 ? 'صباح الخير' : h < 17 ? 'يومك سعيد' : 'مساء الخير');
export const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '');
export const store_ = store;
