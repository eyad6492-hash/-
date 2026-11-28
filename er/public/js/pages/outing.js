// جدول يومنا — one day plan: activities ordered by time, budget, links, photos; "وثّق يومنا كذكرى".
import { all, byId, today, update, create, remove } from '../store.js';
import { esc, icon, pageHead, img, money, toast, toastErr, cdBox } from '../ui.js';
import { openForm } from '../form.js';
import { fmtGreg, fmtHijri, fmtTime, diffDays } from '../dates.js';
import { L, opts } from '../labels.js';
import { editIn, convert } from '../sections.js';
import { fileUrl } from '../api.js';

function editItem(o, row = null) {
  const saved = [...all('places').map((p) => ({ v: `p:${p.id}`, l: `🍽 ${p.name}` })), ...all('visited').map((p) => ({ v: `v:${p.id}`, l: `📍 ${p.name}` }))];
  const last = all('outing_items').filter((i) => i.outing_id === o.id && i.time).map((i) => i.time).sort().pop();
  const nextTime = last ? `${String(Math.min(23, Number(last.slice(0, 2)) + 1)).padStart(2, '0')}:${last.slice(3)}` : (o.start_time || '17:00');
  openForm({
    title: row ? 'تعديل النشاط' : 'إضافة إلى الجدول', en: o.title,
    values: { kind: 'activity', time: nextTime, ...(row || {}) },
    fields: [
      ...(saved.length && !row ? [{ k: 'from', label: 'اختر من أماكننا (اختياري)', type: 'select', options: [{ v: '', l: '—' }, ...saved] }] : []),
      { type: 'pair', fields: [{ k: 'time', label: 'الوقت', type: 'time' }, { k: 'kind', label: 'النوع', type: 'select', options: opts(L.outingKinds) }] },
      { k: 'title', label: 'النشاط', placeholder: 'مثال: العشاء في المطعم', required: !saved.length || !!row },
      { k: 'place', label: 'المكان' }, { k: 'maps_url', label: 'رابط Google Maps', type: 'url', dir: 'ltr', placeholder: 'https://' },
      { k: 'cost', label: 'التكلفة المتوقعة', type: 'number' }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
    ],
    onSubmit: async (v) => {
      if (v.from) {
        const [t, id] = v.from.split(':'); const p = byId(t === 'p' ? 'places' : 'visited', id);
        if (p) { v.title ||= p.name; v.place ||= p.location || p.name; v.maps_url ||= p.maps_url; if (t === 'p' && v.kind === 'activity') v.kind = { cafe: 'cafe', dessert: 'dessert', restaurant: 'restaurant' }[p.category] || 'place'; }
      }
      delete v.from;
      if (!v.title) { toast('اكتب النشاط أو اختر مكانًا', 'err'); return false; }
      if (row) await update('outing_items', row.id, v); else await create('outing_items', { ...v, outing_id: o.id });
    },
    onDelete: row ? () => remove('outing_items', row.id) : null,
  });
}

export default {
  render(el, { id }) {
    const o = byId('outings', id), t = today();
    if (!o) { el.innerHTML = `<div class="page">${pageHead({ en: 'جدول يومنا', ar: 'خطة اليوم', back: '#/s/outings' })}<div class="empty">الخطة غير موجودة</div></div>`; return; }
    const items = all('outing_items').filter((i) => i.outing_id === id).sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.created_at.localeCompare(b.created_at));
    const cost = items.reduce((s, i) => s + (i.cost || 0), 0);
    const n = diffDays(t, o.date);
    const memory = o.memory_id && byId('memories', o.memory_id);
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'جدول يومنا', ar: o.title, back: '#/s/outings', actions: `<button class="icon-btn" data-edit aria-label="تعديل">${icon('edit')}</button>` })}
      <div class="row between" style="margin:-4px 2px 14px"><div><div style="font-weight:500">${fmtGreg(o.date, { weekday: true })}</div><div class="small muted">${fmtHijri(o.date)}${o.start_time ? ` · نبدأ ${fmtTime(o.start_time)}` : ''}</div></div>${o.status === 'planned' && n >= 0 ? cdBox(n) : `<span class="badge ${o.status === 'done' ? 'ok' : ''}">${L.outingStatus[o.status || 'planned']}</span>`}</div>
      ${o.description ? `<div class="card soft" style="margin-bottom:12px;white-space:pre-wrap">${esc(o.description)}</div>` : ''}
      <div class="schedule">${items.length ? items.map((i) => `<div class="sch-row ${i.done ? 'done' : ''}" data-item="${i.id}">
          <div class="sch-time num">${i.time ? fmtTime(i.time) : '—'}</div><div class="sch-dot"><i></i></div>
          <div class="sch-card"><div class="row" style="gap:10px"><span class="ic-box rose" style="width:34px;height:34px">${icon(L.outingIcon[i.kind] || 'sparkle', 'sm')}</span><div class="grow" style="min-width:0"><div style="font-weight:500" class="${i.done ? 'done-text' : ''}">${esc(i.title)}</div><div class="tiny muted">${[L.outingKinds[i.kind], i.place, i.cost ? money(i.cost) : '', i.notes].filter(Boolean).map(esc).join(' · ')}</div></div>
          ${i.maps_url ? `<a class="icon-btn plain" href="${esc(i.maps_url)}" target="_blank" rel="noopener" data-stop>${icon('map', 'sm')}</a>` : ''}<button class="check round ${i.done ? 'on' : ''}" data-done="${i.id}">${icon('check', 'sm')}</button></div></div></div>`).join('') : '<div class="card soft center small muted">أضيفوا أول نشاط: الخروج، المطعم، النشاط، القهوة…</div>'}</div>
      <button class="btn soft block" style="margin-top:12px" data-add>${icon('plus', 'sm')} إضافة نشاط</button>
      <div class="grid2" style="margin-top:14px">
        <div class="card"><div class="stat"><b class="num" style="font-size:20px">${money(cost)}</b><span>التكلفة المتوقعة للأنشطة</span></div>${o.budget ? `<div class="progress ${cost > o.budget ? 'over' : ''}" style="margin-top:8px"><i style="width:${Math.min(100, (cost / o.budget) * 100)}%"></i></div><div class="tiny muted" style="margin-top:4px">الميزانية ${money(o.budget)}</div>` : ''}</div>
        <div class="card"><div class="stat"><b class="num" style="font-size:20px">${items.length}</b><span>${items.length === 1 ? 'نشاط' : 'أنشطة'} · ${items.filter((i) => i.done).length} تمت</span></div></div>
      </div>
      ${o.maps_url ? `<a class="btn soft block" style="margin-top:12px" href="${esc(o.maps_url)}" target="_blank" rel="noopener">${icon('map', 'sm')} موقع اليوم على الخريطة</a>` : ''}
      ${o.notes ? `<div class="section-title"><h2>ملاحظات</h2></div><div class="card" style="white-space:pre-wrap">${esc(o.notes)}</div>` : ''}
      ${(o.photos || []).length ? `<div class="section-title"><h2>صور قبل الخروج</h2></div><div class="gallery">${o.photos.map((p) => `<a href="${fileUrl(p)}" target="_blank"><img src="${fileUrl(p)}" alt=""></a>`).join('')}</div>` : ''}
      <div style="margin-top:18px">${memory ? `<a class="btn block" href="#/s/memories">${icon('image', 'sm')} هذا اليوم موثّق كذكرى — «${esc(memory.title)}»</a>`
        : `<button class="btn rose block" data-memory>${icon('image', 'sm')} وثّق يومنا كذكرى</button><div class="tiny muted center" style="margin-top:6px">تبقى الخطة كما هي، وتُنشأ ذكرى مرتبطة بها في «ذكرياتنا»</div>`}</div>
    </div>`;
    el.onclick = async (e) => {
      const q = (s) => e.target.closest(s); let b;
      if (q('[data-stop]')) return;
      try {
        if (q('[data-edit]')) return editIn('outings', o);
        if (q('[data-add]')) return editItem(o);
        if ((b = q('[data-done]'))) { e.stopPropagation(); const i = byId('outing_items', b.dataset.done); b.classList.toggle('on'); return update('outing_items', i.id, { done: !i.done }); }
        if ((b = q('[data-item]'))) return editItem(o, byId('outing_items', b.dataset.item));
        if (q('[data-memory]')) {
          const pick = (kinds) => items.filter((i) => kinds.includes(i.kind)).map((i) => i.title + (i.place && i.place !== i.title ? ` (${i.place})` : '')).join('، ') || null;
          return convert('memories', { title: o.title, date: o.date, description: o.description, places: pick(['place', 'event']), restaurants: pick(['restaurant', 'cafe', 'dessert']), activities: pick(['activity', 'other']), photos: o.photos || [], location: items.find((i) => i.place)?.place || null, source_col: 'outings', source_id: o.id },
            async (m) => { if (m) { await update('outings', o.id, { memory_id: m.id, status: 'done' }); toast('تم توثيق اليوم كذكرى 💛'); } });
        }
      } catch (err) { toastErr(err); }
    };
  },
};
export { img };
