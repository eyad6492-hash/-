import { ICONS } from './icons.js';

// ---------- Safe HTML templating (all interpolations escaped unless raw()) ----------
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function val(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += val(vals[i]); });
  return new Raw(out);
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function mount(el, content) { el.innerHTML = Array.isArray(content) ? content.map(String).join('') : String(content); return el; }

export function icon(name, cls = '') {
  return raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`);
}

// ---------- Formatting ----------
let currency = 'ر.س';
export function setCurrency(sym) { currency = sym || 'ر.س'; }
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const n = (v, d) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? '—' : (d === 0 ? nf0 : nf).format(Number(v)));
export const money = (v, d) => (v === null || v === undefined ? '—' : raw(`<span class="num">${esc(n(v, d))}</span> <small>${esc(currency)}</small>`));
export const moneyText = (v) => (v === null || v === undefined ? '—' : `${n(v)} ${currency}`);
export const fixed = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Number(v).toFixed(d));
export const kpi = {
  roas: (v) => (v === null ? '—' : `${fixed(v, 2)}x`), cpa: (v) => (v === null ? '—' : `${fixed(v, 2)}`), cpc: (v) => (v === null ? '—' : `${fixed(v, 2)}`),
  ctr: (v) => (v === null ? '—' : `${fixed(v, 2)}%`), cpm: (v) => (v === null ? '—' : `${fixed(v, 2)}`), cvr: (v) => (v === null ? '—' : `${fixed(v, 2)}%`), aov: (v) => (v === null ? '—' : `${fixed(v, 2)}`),
};
const dfLong = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dfShort = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dfMonth = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dfTime = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const toD = (s) => new Date(String(s).length <= 10 ? s + 'T00:00:00Z' : s);
export const date = (s) => (s ? dfLong.format(toD(s)) : '—');
export const dateShort = (s) => (s ? dfShort.format(toD(s)) : '—');
export const monthName = (s) => (s ? dfMonth.format(toD(s.length === 7 ? s + '-01' : s)) : '—');
export const dateTime = (s) => (s ? dfTime.format(new Date(s)) : '—');
export function relDays(d) {
  if (d === null || d === undefined) return '';
  if (d === 0) return 'اليوم'; if (d === 1) return 'غدًا'; if (d === -1) return 'أمس';
  return d > 0 ? `بعد ${d} يوم` : `منذ ${-d} يوم`;
}

// ---------- Logos / initials ----------
const PALETTE = ['#7c5cff', '#ff2d78', '#14b8a6', '#f59e0b', '#3b82f6', '#a855f7', '#ef4444', '#10b981', '#0ea5e9', '#d946ef'];
export function colorFor(s) { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
export function logo(c, cls = '') {
  if (c?.logo) return html`<img class="logo ${cls}" src="${c.logo}" alt="">`;
  const name = (c?.name || c?.client_name || '?').trim();
  const initial = [...name.replace(/^(متجر|مطعم|مقهى|شركة|مؤسسة|عيادة|معرض|مكتب|مركز)\s+/, '').replace(/^ال(?=\S{2,})/, '')][0] || '?';
  return html`<span class="logo ${cls}" style="background:linear-gradient(135deg, ${colorFor(name)}, ${colorFor(name + 'x')})">${initial}</span>`;
}

// ---------- Toasts ----------
export function toast(msg, type = 'ok') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = String(html`${icon(type === 'ok' ? 'checkCircle' : 'alert')}<span>${msg}</span>`);
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, type === 'err' ? 4200 : 2600);
}

// ---------- Bottom sheet / dialog ----------
/**
 * Opens a sheet. `body` is html; `onMount(el, close)` binds events.
 * Resolves with whatever is passed to close().
 */
export function sheet({ title, body, foot, onMount, wide }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = String(html`<div class="sheet" role="dialog" aria-modal="true" style="${wide ? 'max-width:860px' : ''}">
      <div class="grab"></div>
      <div class="sh-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="إغلاق">${icon('x')}</button></div>
      <div class="sh-body">${body}</div>${foot ? html`<div class="sh-foot">${foot}</div>` : ''}</div>`);
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    let done = false;
    const close = (v) => {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey);
      wrap.remove(); if (!$('.sheet-wrap')) document.body.style.overflow = '';
      window.removeEventListener('popstate', onPop);
      resolve(v);
    };
    const onPop = () => close(undefined);
    window.addEventListener('popstate', onPop);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(undefined); });
    const onKey = (e) => { if (e.key === 'Escape' && [...document.querySelectorAll('.sheet-wrap')].pop() === wrap) close(undefined); };
    document.addEventListener('keydown', onKey);
    onMount?.(wrap.querySelector('.sheet'), close);
    const first = wrap.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
    if (first && window.innerWidth > 720) setTimeout(() => first.focus(), 50);
  });
}

export function confirmBox(message, { ok = 'تأكيد', danger = false, title = 'تأكيد الإجراء' } = {}) {
  return sheet({
    title, body: html`<p style="margin:4px 0 8px;line-height:1.8">${message}</p>`,
    foot: html`<button class="btn ghost" data-close>إلغاء</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${ok}</button>`,
    onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => close(true)),
  }).then((v) => !!v);
}

/** A sheet containing a <form>. `onSubmit(data, el)` may throw to keep it open. */
export function formSheet({ title, body, submit = 'حفظ', onSubmit, onMount, wide, extraFoot }) {
  return sheet({
    title, wide,
    body: html`<form class="form-grid" novalidate>${body}<button type="submit" hidden></button></form>`,
    foot: html`${extraFoot || ''}<button class="btn ghost" data-close type="button">إلغاء</button><button class="btn primary" data-submit type="button">${submit}</button>`,
    onMount: (el, close) => {
      const form = el.querySelector('form');
      const btn = el.querySelector('[data-submit]');
      const go = async (e) => {
        e?.preventDefault();
        if (!form.reportValidity()) return;
        btn.disabled = true;
        try { const r = await onSubmit(formData(form), el, form); if (r !== false) close(r ?? true); }
        catch (err) { toast(err.message || 'حدث خطأ', 'err'); }
        finally { btn.disabled = false; }
      };
      form.addEventListener('submit', go); btn.addEventListener('click', go);
      onMount?.(el, close, form);
    },
  });
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

// ---------- form field builders ----------
export const field = (label, input, cls = '') => html`<label class="field ${cls}"><span>${label}</span>${input}</label>`;
export function inp(name, value, { type = 'text', ph = '', req = false, step, min, attrs = '' } = {}) {
  return html`<input type="${type}" name="${name}" value="${value ?? ''}" placeholder="${ph}" ${req ? raw('required') : ''} ${step !== undefined ? raw(`step="${esc(step)}"`) : ''} ${min !== undefined ? raw(`min="${esc(min)}"`) : ''} ${raw(attrs)} ${type === 'number' ? raw('inputmode="decimal"') : ''}>`;
}
export function sel(name, options, value, { req = false, empty } = {}) {
  const opts = Array.isArray(options) ? options.map((o) => (typeof o === 'object' ? o : { v: o, l: o })) : Object.entries(options).map(([v, l]) => ({ v, l }));
  return html`<select name="${name}" ${req ? raw('required') : ''}>${empty !== undefined ? html`<option value="">${empty}</option>` : ''}${opts.map((o) => html`<option value="${o.v}" ${String(o.v) === String(value ?? '') ? raw('selected') : ''}>${o.l}</option>`)}</select>`;
}
export const ta = (name, value, ph = '', rows = 3) => html`<textarea name="${name}" placeholder="${ph}" rows="${rows}">${value ?? ''}</textarea>`;
export function checks(name, options, selected = []) {
  const set = new Set(selected || []);
  return html`<div class="chips" style="flex-wrap:wrap">${options.map((o) => {
    const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
    return html`<label class="chip ${set.has(v) ? 'active' : ''}" style="cursor:pointer"><input type="checkbox" data-multi name="${name}" value="${v}" ${set.has(v) ? raw('checked') : ''} hidden>${l}</label>`;
  })}</div>`;
}

document.addEventListener('change', (e) => { const t = e.target; if (t.matches?.('input[data-multi]')) t.parentElement.classList.toggle('active', t.checked); });

export function empty(text, ic = 'inbox', action = '') { return html`<div class="empty">${icon(ic)}<div>${text}</div>${action ? html`<div style="margin-top:12px">${action}</div>` : ''}</div>`; }

export async function copyText(text, msg = 'تم النسخ') {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); toast(msg); } catch { toast('تعذر النسخ', 'err'); } t.remove();
  }
}

export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function readImageAsDataURL(file, max = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('صورة غير صالحة'));
    img.src = url;
  });
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
