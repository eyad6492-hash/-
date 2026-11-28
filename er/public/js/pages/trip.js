// One trip: overview (flight, hotel, budget, notes), places, restaurants, activities, itinerary, checklist, budget, photos, trip calendar.
import { all, byId, today, update, create, remove } from '../store.js';
import { esc, icon, pageHead, img, money, toastErr, toast } from '../ui.js';
import { addDays, diffDays, fmtGreg, fmtHijri, fmtTime, countdown, WEEKDAYS, weekday } from '../dates.js';
import { L, opts } from '../labels.js';
import { editTrip } from '../editors.js';
import { openForm } from '../form.js';
import { fileUrl } from '../api.js';
import { tripDays } from './trips.js';

const st = { tab: 'overview', tripId: null };
const TABS = [['overview', 'نظرة عامة'], ['place', 'أماكن'], ['restaurant', 'مطاعم'], ['activity', 'أنشطة'], ['itinerary', 'الجدول'], ['checklist', 'التجهيز'], ['expense', 'الميزانية'], ['photos', 'الصور'], ['calendar', 'التقويم']];

function editItem(trip, section, row = null) {
  const dated = ['itinerary', 'activity', 'place', 'restaurant', 'expense'].includes(section);
  openForm({
    title: row ? 'تعديل' : `إضافة — ${L.tripSections[section]}`, en: L.tripSectionsEn[section],
    values: { section, date: section === 'itinerary' ? trip.start_date : null, ...(row || {}) },
    fields: [
      { k: 'title', label: section === 'checklist' ? 'الغرض' : section === 'expense' ? 'البند' : 'العنوان', required: true },
      ...(dated ? [{ type: 'pair', fields: [{ k: 'date', label: 'اليوم', type: 'date' }, { k: 'time', label: 'الوقت', type: 'time' }] }] : []),
      ...(section === 'expense' ? [{ k: 'amount', label: 'المبلغ', type: 'number', required: true }] : section !== 'checklist' ? [{ k: 'amount', label: 'التكلفة التقريبية', type: 'number' }] : []),
      ...(section !== 'checklist' ? [{ k: 'url', label: 'رابط', type: 'url', dir: 'ltr', placeholder: 'https://' }] : []),
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      ...(section === 'checklist' || section === 'expense' ? [] : [{ k: 'done', label: section === 'itinerary' ? 'تم' : 'زرناه / جربناه', type: 'toggle' }]),
    ],
    onSubmit: async (v) => { if (row) await update('trip_items', row.id, v); else await create('trip_items', { ...v, trip_id: trip.id, section }); },
    onDelete: row ? () => remove('trip_items', row.id) : null,
  });
}

export default {
  render(el, { id }) {
    const trip = byId('trips', id), t = today();
    if (!trip) { el.innerHTML = `<div class="page">${pageHead({ en: 'Trip', ar: 'الرحلة', back: '#/trips' })}<div class="empty">الرحلة غير موجودة</div></div>`; return; }
    if (st.tripId !== id) { st.tripId = id; st.tab = 'overview'; }
    const items = all('trip_items').filter((i) => i.trip_id === id);
    const sec = (s) => items.filter((i) => i.section === s).sort((a, b) => ((a.date || '9') + (a.time || '')).localeCompare((b.date || '9') + (b.time || '')) || a.created_at.localeCompare(b.created_at));
    const spentItems = sec('expense');
    const tripExpenses = all('expenses').filter((x) => x.trip_id === id);
    const spent = spentItems.reduce((s, i) => s + (i.amount || 0), 0) + tripExpenses.reduce((s, x) => s + (x.amount || 0), 0);
    const planned = items.filter((i) => i.section !== 'expense').reduce((s, i) => s + (i.amount || 0), 0);
    const days = tripDays(trip);
    const n = trip.start_date ? diffDays(t, trip.start_date) : null;
    const checklist = sec('checklist');
    const itemRow = (i) => `<div class="item" data-item="${i.id}" style="cursor:pointer">
      ${i.section === 'checklist' ? `<button class="check ${i.done ? 'on' : ''}" data-check="${i.id}">${icon('check', 'sm')}</button>` : i.section !== 'expense' ? `<button class="check round ${i.done ? 'on' : ''}" data-check="${i.id}">${icon('check', 'sm')}</button>` : `<span class="ic-box brown">${icon('wallet')}</span>`}
      <div class="grow" style="min-width:0"><div class="title ${i.done ? 'done-text' : ''}">${esc(i.title)}</div><div class="sub">${[i.date && fmtGreg(i.date, { year: false }), i.time && fmtTime(i.time), i.notes].filter(Boolean).map(esc).join(' · ')}</div></div>
      ${i.amount ? `<span class="small num">${money(i.amount)}</span>` : ''}${i.url ? `<a class="icon-btn plain" href="${esc(i.url)}" target="_blank" rel="noopener" data-stop>${icon('link', 'sm')}</a>` : ''}</div>`;
    let body = '';
    if (st.tab === 'overview') {
      body = `<div class="stats3"><div class="stat"><b class="num">${days ?? '—'}</b><span>${days === 1 ? 'يوم' : 'أيام'}</span></div><div class="stat"><b class="num">${checklist.filter((c) => c.done).length}/${checklist.length}</b><span>التجهيز</span></div><div class="stat"><b class="num">${items.filter((i) => ['place', 'restaurant', 'activity'].includes(i.section)).length}</b><span>أماكن وأنشطة</span></div></div>
        <div class="card" style="margin-top:12px"><div class="card-head"><h3>${icon('plane', 'sm')} الطيران</h3><span class="en">Flight Details</span></div>${trip.flight_details ? `<div style="white-space:pre-wrap">${esc(trip.flight_details)}</div>` : '<div class="small muted">لم تُضف تفاصيل بعد</div>'}${trip.flight_url ? `<a class="btn sm soft" style="margin-top:10px" href="${esc(trip.flight_url)}" target="_blank" rel="noopener">${icon('link', 'sm')} رابط الحجز</a>` : ''}</div>
        <div class="card"><div class="card-head"><h3>${icon('hotel', 'sm')} الفندق</h3><span class="en">Hotel</span></div>${trip.hotel_details ? `<div style="white-space:pre-wrap">${esc(trip.hotel_details)}</div>` : '<div class="small muted">لم تُضف تفاصيل بعد</div>'}${trip.hotel_url ? `<a class="btn sm soft" style="margin-top:10px" href="${esc(trip.hotel_url)}" target="_blank" rel="noopener">${icon('link', 'sm')} رابط الفندق</a>` : ''}</div>
        <div class="card"><div class="card-head"><h3>${icon('wallet', 'sm')} الميزانية</h3><span class="en">Budget</span></div><div class="row between"><div class="stat"><b class="num" style="font-size:22px">${money(spent)}</b><span>المصروف</span></div>${trip.budget ? `<div class="stat" style="text-align:left"><b class="num" style="font-size:22px">${money(trip.budget - spent)}</b><span>المتبقي</span></div>` : ''}</div>${trip.budget ? `<div class="progress ${spent > trip.budget ? 'over' : ''}" style="margin-top:10px"><i style="width:${Math.min(100, (spent / trip.budget) * 100)}%"></i></div><div class="tiny muted" style="margin-top:4px">الميزانية ${money(trip.budget)}${planned ? ` · تكاليف مخططة ${money(planned)}` : ''}</div>` : ''}</div>
        ${trip.notes ? `<div class="card"><div class="card-head"><h3>ملاحظات</h3><span class="en">Notes</span></div><div style="white-space:pre-wrap">${esc(trip.notes)}</div></div>` : ''}`;
    } else if (st.tab === 'photos') {
      const photos = trip.photos || [];
      body = `${photos.length ? `<div class="gallery">${photos.map((p) => `<a href="${fileUrl(p)}" target="_blank"><img src="${fileUrl(p)}" loading="lazy" alt=""></a>`).join('')}</div>` : '<div class="card soft center small muted">لا توجد صور بعد</div>'}<button class="btn soft block" style="margin-top:12px" data-photos>${icon('image', 'sm')} إضافة / إدارة الصور</button>`;
    } else if (st.tab === 'calendar') {
      if (!trip.start_date) body = '<div class="card soft center small muted">حدد تاريخ السفر أولًا</div>';
      else {
        const end = trip.end_date || trip.start_date; let rows = '';
        for (let d = trip.start_date, k = 1; d <= end && k <= 60; d = addDays(d, 1), k++) {
          const its = items.filter((i) => i.date === d && i.section !== 'expense');
          rows += `<div class="week-row ${d === t ? 'today' : ''}"><div class="d"><b class="num">${k}</b><span>${WEEKDAYS[weekday(d)]}</span><span class="tiny">${fmtGreg(d, { year: false })}</span></div><div class="grow">${its.length ? its.map((i) => `<div class="small" style="padding:4px 0">${i.time ? `<span class="muted">${fmtTime(i.time)}</span> ` : ''}${esc(i.title)} <span class="tiny muted">${L.tripSections[i.section]}</span></div>`).join('') : '<div class="small muted" style="padding-top:8px">يوم حر</div>'}</div></div>`;
        }
        body = `<div class="card" style="padding:4px 16px">${rows}</div>`;
      }
    } else {
      const list = sec(st.tab);
      if (st.tab === 'itinerary' && trip.start_date) {
        const byDay = new Map(); for (const i of list) { const k = i.date || ''; (byDay.get(k) || byDay.set(k, []).get(k)).push(i); }
        body = [...byDay.keys()].sort().map((k) => `<div class="section-title"><h2>${k ? `اليوم ${diffDays(trip.start_date, k) + 1} · ${fmtGreg(k, { year: false, weekday: true })}` : 'بدون يوم'}</h2></div><div class="card">${byDay.get(k).map(itemRow).join('')}</div>`).join('') || '<div class="card soft center small muted">لا يوجد شيء بعد</div>';
      } else {
        body = list.length ? `<div class="card">${list.map(itemRow).join('')}</div>` : '<div class="card soft center small muted">لا يوجد شيء بعد</div>';
      }
      if (st.tab === 'expense') body = `<div class="card" style="margin-bottom:12px"><div class="row between"><div class="stat"><b class="num" style="font-size:22px">${money(spent)}</b><span>إجمالي المصروف</span></div>${trip.budget ? `<div class="stat"><b class="num" style="font-size:22px">${money(trip.budget)}</b><span>الميزانية</span></div>` : ''}</div>${tripExpenses.length ? `<div class="tiny muted" style="margin-top:6px">يشمل ${tripExpenses.length} مصروف مرتبط من قسم المصروفات</div>` : ''}</div>` + body;
      body += `<button class="btn soft block" style="margin-top:12px" data-add>${icon('plus', 'sm')} إضافة</button>`;
    }
    el.innerHTML = `<div class="page">
      ${pageHead({ en: trip.honeymoon ? 'Our Honeymoon Trip' : 'Our Trip', ar: trip.name, back: '#/trips', actions: `<button class="icon-btn" data-edit aria-label="تعديل">${icon('edit')}</button>` })}
      ${trip.image_id ? img(trip.image_id, 'cover') : ''}
      <div class="row between" style="margin:12px 2px"><div><div style="font-weight:500">${esc(trip.destination || '')}</div><div class="small muted">${trip.start_date ? `${fmtGreg(trip.start_date)}${trip.end_date ? ' ← ' + fmtGreg(trip.end_date) : ''}` : 'لم يُحدد التاريخ'}</div>${trip.start_date ? `<div class="tiny muted">${fmtHijri(trip.start_date)}</div>` : ''}</div>${n !== null && n >= 0 ? `<div class="cd ${n === 0 ? 'today' : ''}"><b class="num">${n === 0 ? '✈︎' : n}</b><span>${countdown(n)}</span></div>` : ''}</div>
      <div class="chips">${TABS.map(([k, l]) => `<button class="chip ${st.tab === k ? 'on' : ''}" data-tab="${k}">${l}${['place', 'restaurant', 'activity', 'itinerary', 'checklist', 'expense'].includes(k) && sec(k).length ? ` <span class="tiny" style="opacity:.7">${sec(k).length}</span>` : ''}</button>`).join('')}</div>
      ${body}
    </div>`;
    el.onclick = async (e) => {
      const q = (s) => e.target.closest(s); let b;
      if (q('[data-stop]')) return;
      try {
        if (q('[data-edit]')) return editTrip(trip);
        if ((b = q('[data-tab]'))) { st.tab = b.dataset.tab; return this.render(el, { id }); }
        if ((b = q('[data-check]'))) { e.stopPropagation(); const i = byId('trip_items', b.dataset.check); b.classList.toggle('on'); return update('trip_items', i.id, { done: !i.done }); }
        if (q('[data-add]')) return editItem(trip, st.tab);
        if ((b = q('[data-item]'))) { const i = byId('trip_items', b.dataset.item); return editItem(trip, i.section, i); }
        if (q('[data-photos]')) return openForm({ title: 'صور الرحلة', en: 'Photos', values: { photos: trip.photos || [] }, fields: [{ k: 'photos', label: 'الصور', type: 'images' }], onSubmit: async (v) => { await update('trips', id, { photos: v.photos || [] }); toast('تم الحفظ'); } });
      } catch (err) { toastErr(err); }
    };
  },
};
export { opts };
