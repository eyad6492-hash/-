// Renders any v3 section from its configuration (sections.js): tabs, filters, search, cards / timeline / map,
// detail sheet with workflow buttons and conversions, add/edit forms. Route: #/s/:key
import { all, byId, store, today, update } from '../store.js';
import { esc, icon, avatar, pageHead, empty, img, openSheet, toastErr, byline } from '../ui.js';
import { post } from '../api.js';
import { syncNow } from '../store.js';
import { fmtGreg, GREG_MONTHS } from '../dates.js';
import { SECTIONS, editIn } from '../sections.js';
import { L } from '../labels.js';

const state = {};
export const PLEDGE = 'نتعهد بأن نقرأ الاعترافات والمصارحات بكل صدر رحب، وأن نحاول فهم مشاعر الطرف الآخر قبل الرد، وألا يكون الهدف من المصارحة هو اللوم أو الغضب أو الانتقام، بل التفاهم والاستماع والتعامل باحترام. نتعهد بأن نمنح بعضنا مساحة للتعبير، وأن نناقش ما نقرأه بهدوء، وأن نحرص على حل الخلافات بطريقة ناضجة دون التقليل من مشاعر الطرف الآخر.';

function cardHtml(key, S, r) {
  const c = S.card(r);
  const lead = c.check ? `<button class="check ${c.check.on ? 'on' : ''}" data-check="${r.id}" aria-label="إنجاز">${icon('check', 'sm')}</button>`
    : c.img ? img(c.img, 'thumb') : c.emoji ? `<span class="thumb" style="font-size:24px">${c.emoji}</span>` : `<span class="ic-box ${S.calm ? 'sage' : 'rose'}">${icon(c.icon || S.icon)}</span>`;
  const badges = (c.badges || []).filter(Boolean).map((b) => `<span class="badge ${b.tone || ''}">${esc(b.t)}</span>`).join('');
  return `<div class="task tap" data-open="${r.id}" style="cursor:pointer">${lead}
    <div class="grow" style="min-width:0"><div style="font-weight:500" class="${c.check?.on ? 'done-text' : ''}">${esc(c.title)}</div>
      ${c.sub ? `<div class="small muted" style="margin-top:2px">${esc(c.sub)}</div>` : ''}${badges ? `<div class="meta">${badges}</div>` : ''}</div>
    ${c.avatar ? avatar(c.avatar, 'sm') : ''}</div>`;
}

function timelineHtml(S, rows) {
  let out = '', cur = '';
  for (const r of rows) {
    const k = r.date.slice(0, 7);
    if (k !== cur) { cur = k; out += `<div class="tl-month">${GREG_MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}</div>`; }
    const c = S.card(r);
    out += `<div class="tl-item" data-open="${r.id}"><div class="tl-dot"></div><div class="tl-card">
      ${(r.photos || []).length ? `<div class="tl-photos">${r.photos.slice(0, 3).map((id) => img(id)).join('')}</div>` : ''}
      <div class="tiny muted">${fmtGreg(r.date, { weekday: true })}</div><div style="font-weight:600;margin:2px 0">${esc(c.title)}</div>
      ${c.sub ? `<div class="small muted">${esc(c.sub)}</div>` : ''}${c.text ? `<div class="small" style="margin-top:6px;color:var(--ink2)">${esc(c.text.length > 140 ? c.text.slice(0, 140) + '…' : c.text)}</div>` : ''}</div></div>`;
  }
  return `<div class="timeline">${out}</div>`;
}

export function openDetail(key, id) {
  const S = SECTIONS[key];
  const r = byId(key, id); if (!r) return;
  S.onOpen?.(r);
  const actions = S.actions ? S.actions(r) : [];
  const canEdit = S.canEdit ? S.canEdit(r) : true;
  openSheet({
    title: S.card(r).title, en: S.title,
    body: `${S.detail ? S.detail(r) : ''}
      ${actions.length ? `<div class="act-grid">${actions.map((a, i) => (a.href ? `<a class="btn ${a.primary ? 'rose' : 'soft'} sm" href="${esc(a.href)}" target="_blank" rel="noopener">${icon(a.icon, 'sm')} ${esc(a.l)}</a>` : `<button class="btn ${a.primary ? 'rose' : 'soft'} sm" data-a="${i}">${icon(a.icon, 'sm')} ${esc(a.l)}</button>`)).join('')}</div>` : ''}
      <div class="tiny muted" style="margin-top:14px">${esc(byline(r))}</div>`,
    foot: canEdit ? `<button class="btn ghost" data-edit>${icon('edit', 'sm')} تعديل</button>` : '',
    onMount: (sh, close) => {
      sh.querySelectorAll('[data-a]').forEach((b) => { b.onclick = async () => { const a = actions[Number(b.dataset.a)]; close(); await new Promise((ok) => setTimeout(ok, 240)); try { await a.run(); } catch (e) { toastErr(e); } }; });
      sh.querySelector('[data-edit]')?.addEventListener('click', () => { close(); setTimeout(() => editIn(key, byId(key, id)), 240); });
      sh.querySelectorAll('[data-setstatus]').forEach((b) => { b.onclick = async () => { try { await S.setStatus(r, b.dataset.setstatus); sh.querySelectorAll('[data-setstatus]').forEach((x) => x.classList.toggle('on', x === b)); } catch (e) { toastErr(e); } }; });
    },
  });
}

function pledgeGate(el) {
  const pl = store.space?.pledge || {};
  const mine = pl[store.me.id], theirs = store.partner && pl[store.partner.id];
  const row = (u, p) => (u ? `<div class="set-row"><div class="row">${avatar(u, 'sm')} ${esc(u.name)}</div>${p ? `<span class="badge ok">وافق · ${fmtGreg(p.at.slice(0, 10), { year: false })}</span>` : '<span class="badge">لم يوافق بعد</span>'}</div>` : '');
  return `<div class="pledge"><div class="pledge-h">${icon('shield')} تعهد التفاهم</div><p>${PLEDGE}</p>
    ${row(store.me, mine)}${row(store.partner, theirs)}
    ${mine ? '' : '<button class="btn rose block" data-pledge style="margin-top:12px">أوافق على التعهد</button>'}</div>`;
}

export default {
  render(el, { key }) {
    const S = SECTIONS[key];
    if (!S) { el.innerHTML = `<div class="page"><div class="empty">القسم غير موجود</div></div>`; return; }
    const st = (state[key] ||= { tab: null, chip: 'all', q: '', view: 'list', pledgeOpen: false });
    let rows = all(key);
    const tabs = S.tabs ? S.tabs() : null;
    if (tabs && !tabs.some((t) => t.k === st.tab)) st.tab = tabs[0].k;
    const counts = tabs ? Object.fromEntries(tabs.map((t) => [t.k, rows.filter(t.f).length])) : {};
    if (tabs) rows = rows.filter(tabs.find((t) => t.k === st.tab).f);
    if (S.chips && st.chip !== 'all') rows = rows.filter((r) => (r[S.chips.field] || '') === st.chip);
    if (S.search && st.q) { const q = st.q.toLowerCase(); rows = rows.filter((r) => S.search.some((f) => String(r[f] || '').toLowerCase().includes(q))); }
    if (S.sort) rows.sort(S.sort);

    // confessions: both sign the understanding pledge; each must agree before reading/writing
    const gateOpen = S.gate === 'pledge' ? !!(store.space?.pledge || {})[store.me.id] : true;
    let body;
    if (!gateOpen) body = pledgeGate(el);
    else if (!rows.length && !S.grouped) body = empty(S.empty[0], S.empty[1], `<br><button class="btn sm" data-new>${icon('plus', 'sm')} ${esc(S.addLabel)}</button>`);
    else if (S.timeline) body = timelineHtml(S, rows);
    else if (S.map && st.view === 'map') body = '<div class="map" id="smap"></div>';
    else if (S.grouped) body = Object.entries(L.joyKinds).map(([k, l]) => { const g = rows.filter((r) => r[S.grouped] === k); return `<div class="section-title"><h2>${k === 'joy' ? '🌷' : '🍂'} ${l}</h2><button class="link" style="border:0;background:none;cursor:pointer" data-newk="${k}">+ إضافة</button></div>${g.length ? g.map((r) => cardHtml(key, S, r)).join('') : '<div class="card soft small muted center">لا شيء بعد</div>'}`; }).join('');
    else body = rows.map((r) => cardHtml(key, S, r)).join('');

    const noPartner = S.needsPartner && !store.partner;
    el.innerHTML = `<div class="page ${S.calm ? 'calm' : ''}">
      ${pageHead({ en: S.kicker, ar: S.title, back: '#/more', actions: gateOpen && !noPartner ? `<button class="btn sm" data-new>${icon('plus', 'sm')} ${esc(S.addLabel)}</button>` : '' })}
      ${gateOpen && S.gate === 'pledge' ? `<button class="pledge-mini" data-showpledge>${icon('shield', 'sm')} تعهد التفاهم — ${Object.keys(store.space?.pledge || {}).length === 2 ? 'وافق الطرفان ✓' : 'بانتظار موافقة الطرف الآخر'}</button>${st.pledgeOpen ? pledgeGate(el) : ''}` : ''}
      ${noPartner ? '<div class="notice rose" style="margin-bottom:12px">يحتاج هذا القسم إلى انضمام الطرف الآخر — ادعُه من الإعدادات.</div>' : ''}
      ${gateOpen && tabs ? `<div class="chips">${tabs.map((t) => `<button class="chip ${st.tab === t.k ? 'on' : ''}" data-tab="${t.k}">${esc(t.l)}${counts[t.k] ? ` <span class="tiny" style="opacity:.7">${counts[t.k]}</span>` : ''}</button>`).join('')}</div>` : ''}
      ${gateOpen && S.chips ? `<div class="chips" style="margin-top:-4px"><button class="chip ${st.chip === 'all' ? 'on' : ''}" data-chip="all" style="height:30px;font-size:12px">الكل</button>${Object.entries(S.chips.labels).map(([k, l]) => `<button class="chip ${st.chip === k ? 'on' : ''}" data-chip="${k}" style="height:30px;font-size:12px">${esc(l)}</button>`).join('')}</div>` : ''}
      ${gateOpen && (S.search || S.map) ? `<div class="row" style="margin-bottom:12px;gap:8px">${S.search ? `<input class="input grow" id="sq" placeholder="بحث…" value="${esc(st.q)}" autocomplete="off">` : ''}${S.map ? `<button class="icon-btn ${st.view === 'map' ? '' : 'plain'}" data-view aria-label="${st.view === 'map' ? 'قائمة' : 'خريطة'}">${icon(st.view === 'map' ? 'list' : 'map')}</button>` : ''}</div>` : ''}
      ${body}
    </div>`;

    if (S.map && st.view === 'map' && rows.length && gateOpen) {
      import('./places.js').then(({ loadLeaflet }) => loadLeaflet()).then((Lf) => {
        const box = el.querySelector('#smap'); if (!box) return;
        const map = Lf.map(box, { zoomControl: false }); Lf.control.zoom({ position: 'topleft', zoomInTitle: 'تكبير', zoomOutTitle: 'تصغير' }).addTo(map);
        Lf.tileLayer(`https://{s}.basemaps.cartocdn.com/${document.documentElement.dataset.theme === 'dark' ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, { maxZoom: 19, attribution: '© OpenStreetMap © CARTO' }).addTo(map);
        const pts = rows.filter((r) => r.lat && r.lng).map((r) => { Lf.circleMarker([r.lat, r.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#C4958D', fillOpacity: 1 }).addTo(map).bindTooltip(r.name).on('click', () => openDetail(key, r.id)); return [r.lat, r.lng]; });
        if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); else map.setView([24.7136, 46.6753], 10);
      }).catch(() => {});
    }
    const sq = el.querySelector('#sq');
    if (sq) sq.oninput = () => { st.q = sq.value; clearTimeout(st._t); st._t = setTimeout(() => { this.render(el, { key }); const n = el.querySelector('#sq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
    el.onclick = async (e) => {
      const q = (s) => e.target.closest(s); let b;
      try {
        if (q('[data-pledge]')) { await post('/api/pledge/agree'); await syncNow(); return this.render(el, { key }); }
        if (q('[data-showpledge]')) { st.pledgeOpen = !st.pledgeOpen; return this.render(el, { key }); }
        if ((b = q('[data-newk]'))) return editIn(key, null, { kind: b.dataset.newk });
        if (q('[data-new]')) return editIn(key);
        if ((b = q('[data-tab]'))) { st.tab = b.dataset.tab; return this.render(el, { key }); }
        if ((b = q('[data-chip]'))) { st.chip = b.dataset.chip; return this.render(el, { key }); }
        if (q('[data-view]')) { st.view = st.view === 'map' ? 'list' : 'map'; return this.render(el, { key }); }
        if ((b = q('[data-check]'))) { e.stopPropagation(); b.classList.toggle('on'); const r = byId(key, b.dataset.check); return S.card(r).check.run(); }
        if ((b = q('[data-open]'))) { if (S.link) { location.hash = S.link(byId(key, b.dataset.open)); return; } openDetail(key, b.dataset.open); }
      } catch (err) { toastErr(err); }
    };
  },
};
export { update, today };
