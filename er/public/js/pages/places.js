// Places We Love — restaurants, cafés, desserts, activities; want-to-try vs visited; cards, list or map.
import { all, byId, today, update } from '../store.js';
import { esc, icon, empty, pageHead, img, stars, byline, openSheet, toastErr } from '../ui.js';
import { fmtGreg } from '../dates.js';
import { L } from '../labels.js';
import { editPlace, editEvent } from '../editors.js';
import { fileUrl } from '../api.js';

const st = { cat: 'all', tab: 'try', view: 'cards' };
const price = (n) => (n ? '$'.repeat(n) : '');

let leafletLoading = null;
function loadLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (!leafletLoading) leafletLoading = new Promise((ok, no) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.js'; s.onload = () => ok(window.L); s.onerror = no; document.head.appendChild(s);
  });
  return leafletLoading;
}

export function placeSheet(p) {
  if (!p) return;
  openSheet({
    title: p.name, en: L.placeCats[p.category] || 'مكان',
    body: `${p.image_id ? img(p.image_id, 'cover') : ''}
      <div class="row between" style="margin-top:12px"><div>${stars(p.rating || 0)} <span class="muted small">${price(p.price)}</span></div><span class="badge ${p.visited ? 'ok' : 'rose'}">${p.visited ? 'زرناه ✓' : 'نريد تجربته'}</span></div>
      <dl class="kv" style="margin-top:12px">${p.location ? `<dt>الموقع</dt><dd>${esc(p.location)}</dd>` : ''}${p.cuisine ? `<dt>النوع</dt><dd>${esc(p.cuisine)}</dd>` : ''}${p.visit_date ? `<dt>زيارتنا</dt><dd>${fmtGreg(p.visit_date)}</dd>` : ''}${p.to_try ? `<dt>نحب نجرب</dt><dd>${esc(p.to_try)}</dd>` : ''}${p.notes ? `<dt>ملاحظات</dt><dd>${esc(p.notes)}</dd>` : ''}</dl>
      ${(p.photos || []).length ? `<div class="section-title"><h2>من زيارتنا</h2></div><div class="gallery">${p.photos.map((id) => `<a href="${fileUrl(id)}" target="_blank"><img src="${fileUrl(id)}" loading="lazy" alt=""></a>`).join('')}</div>` : ''}
      <div class="small muted" style="margin-top:12px">${esc(byline(p))}</div>`,
    foot: `${p.maps_url ? `<a class="btn" href="${esc(p.maps_url)}" target="_blank" rel="noopener">${icon('pin', 'sm')} الخريطة</a>` : ''}<button class="btn soft" data-visit>${p.visited ? 'لم نزره' : 'زرناه ✓'}</button><button class="icon-btn" data-cal aria-label="إضافة للتقويم">${icon('calendar')}</button><button class="icon-btn" data-edit aria-label="تعديل">${icon('edit')}</button>`,
    onMount: (sh, close) => {
      sh.querySelector('[data-edit]').onclick = () => { close(); setTimeout(() => editPlace(p), 240); };
      sh.querySelector('[data-cal]').onclick = () => { close(); setTimeout(() => editEvent(null, { title: `زيارة ${p.name}`, type: 'event', location: p.location || p.name }), 240); };
      sh.querySelector('[data-visit]').onclick = async () => { try { await update('places', p.id, p.visited ? { visited: 0 } : { visited: 1, visit_date: p.visit_date || today() }); close(); } catch (e) { toastErr(e); } };
    },
  });
}

export default {
  render(el) {
    let items = all('places');
    const counts = { try: items.filter((x) => !x.visited).length, visited: items.filter((x) => x.visited).length };
    items = items.filter((x) => (st.tab === 'all' ? true : st.tab === 'try' ? !x.visited : x.visited));
    if (st.cat === 'favorite') items = items.filter((x) => x.favorite || x.category === 'favorite');
    else if (st.cat !== 'all') items = items.filter((x) => x.category === st.cat);
    items.sort((a, b) => (b.favorite || 0) - (a.favorite || 0) || (b.rating || 0) - (a.rating || 0) || b.created_at.localeCompare(a.created_at));
    const card = (p) => `<div class="pcard" data-open="${p.id}"><div class="img">${p.image_id ? img(p.image_id) : icon(L.placeIcon[p.category] || 'pin', 'lg')}${p.favorite ? '<span class="badge">★</span>' : ''}</div>
      <div class="body"><div class="title ellipsis">${esc(p.name)}</div><div class="small muted ellipsis">${esc(L.placeCats[p.category] || '')}${p.location ? ' · ' + esc(p.location) : ''}</div>${p.rating ? `<div class="small">${stars(p.rating)}</div>` : ''}</div></div>`;
    const row = (p) => `<div class="item" data-open="${p.id}" style="cursor:pointer">${p.image_id ? img(p.image_id, 'thumb') : `<span class="thumb">${icon(L.placeIcon[p.category] || 'pin')}</span>`}<div class="grow" style="min-width:0"><div class="title ellipsis">${esc(p.name)} ${p.favorite ? '★' : ''}</div><div class="sub ellipsis">${esc(L.placeCats[p.category] || '')}${p.cuisine ? ' · ' + esc(p.cuisine) : ''}${p.location ? ' · ' + esc(p.location) : ''}</div></div><div class="small muted">${price(p.price)}</div></div>`;
    const mapped = items.filter((p) => p.lat && p.lng);
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'أماكن نحبها', ar: 'أماكننا', back: '#/more', actions: `<button class="btn sm" data-new>${icon('plus', 'sm')} مكان</button>` })}
      <div class="tabs"><button data-tab="try" class="${st.tab === 'try' ? 'on' : ''}">نريد تجربتها · ${counts.try}</button><button data-tab="visited" class="${st.tab === 'visited' ? 'on' : ''}">زرناها · ${counts.visited}</button><button data-tab="all" class="${st.tab === 'all' ? 'on' : ''}">الكل</button></div>
      <div class="chips"><button class="chip ${st.cat === 'all' ? 'on' : ''}" data-cat="all">الكل</button>${Object.entries(L.placeCats).map(([k, l]) => `<button class="chip ${st.cat === k ? 'on' : ''}" data-cat="${k}">${icon(L.placeIcon[k], 'sm')} ${l}</button>`).join('')}</div>
      <div class="row between" style="margin-bottom:10px"><span class="en muted" style="font-size:13px">${st.tab === 'try' ? 'أماكن نريد تجربتها' : st.tab === 'visited' ? 'زرناها سوا' : 'كل الأماكن'}</span>
        <div class="row" style="gap:4px">${[['cards', 'grid'], ['list', 'list'], ['map', 'map']].map(([v, ic]) => `<button class="icon-btn ${st.view === v ? '' : 'plain'}" data-view="${v}" aria-label="${{ cards: 'بطاقات', list: 'قائمة', map: 'خريطة' }[v]}">${icon(ic, 'sm')}</button>`).join('')}</div></div>
      ${!items.length ? empty('مكان جديد', 'أضيفوا المطاعم والكافيهات والأماكن التي تحبونها أو تخططون لزيارتها', `<br><button class="btn sm" data-new>${icon('plus', 'sm')} إضافة مكان</button>`)
        : st.view === 'cards' ? `<div class="pcards">${items.map(card).join('')}</div>`
          : st.view === 'list' ? `<div class="card">${items.map(row).join('')}</div>`
            : `<div class="map" id="map"></div>${mapped.length < items.length ? `<p class="tiny muted">${items.length - mapped.length} مكان بدون موقع — أضف رابط Google Maps ليظهر على الخريطة</p>` : ''}`}
    </div>`;
    if (st.view === 'map' && items.length) {
      loadLeaflet().then((Lf) => {
        const box = el.querySelector('#map'); if (!box) return;
        const dark = document.documentElement.dataset.theme === 'dark';
        const map = Lf.map(box, { zoomControl: false, attributionControl: true });
        Lf.control.zoom({ position: 'topleft', zoomInTitle: 'تكبير', zoomOutTitle: 'تصغير' }).addTo(map);
        Lf.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, { maxZoom: 19, attribution: '© OpenStreetMap © CARTO' }).addTo(map);
        const pts = [];
        for (const p of mapped) {
          const m = Lf.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 2, fillColor: p.visited ? '#8B6E5A' : '#C4958D', fillOpacity: 1 }).addTo(map);
          m.on('click', () => placeSheet(byId('places', p.id))); m.bindTooltip(p.name, { direction: 'top' }); pts.push([p.lat, p.lng]);
        }
        if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); else map.setView([24.7136, 46.6753], 10);
      }).catch(() => { const box = el.querySelector('#map'); if (box) box.innerHTML = '<div class="empty">تعذر تحميل الخريطة</div>'; });
    }
    el.onclick = (e) => {
      const q = (s) => e.target.closest(s); let b;
      if (q('[data-new]')) return editPlace(null, st.cat !== 'all' ? { category: st.cat } : {});
      if ((b = q('[data-tab]'))) { st.tab = b.dataset.tab; return this.render(el); }
      if ((b = q('[data-cat]'))) { st.cat = b.dataset.cat; return this.render(el); }
      if ((b = q('[data-view]'))) { st.view = b.dataset.view; return this.render(el); }
      if ((b = q('[data-open]'))) placeSheet(byId('places', b.dataset.open));
    };
  },
};
