// Our Honeymoon — candidate destinations, side-by-side comparison, final choice, full planning sections, convert to a real trip.
import { all, byId, update, create, remove, syncNow } from '../store.js';
import { post } from '../api.js';
import { esc, icon, pageHead, img, money, openSheet, toast, toastErr, stars, confirmBox, empty } from '../ui.js';
import { fmtGreg } from '../dates.js';
import { L, opts } from '../labels.js';
import { openForm } from '../form.js';
import { fileUrl } from '../api.js';

const st = { tab: 'dest', sec: 'flight' };

function editDest(row = null) {
  openForm({
    title: row ? 'تعديل الوجهة' : 'وجهة مقترحة', en: 'Destination',
    values: row || {},
    fields: [
      { type: 'pair', fields: [{ k: 'name', label: 'الوجهة', required: true, placeholder: 'مثال: المالديف' }, { k: 'country', label: 'الدولة / المنطقة' }] },
      { type: 'pair', fields: [{ k: 'budget', label: 'الميزانية التقديرية', type: 'number' }, { k: 'duration', label: 'عدد الأيام', type: 'number' }] },
      { type: 'pair', fields: [{ k: 'flight_cost', label: 'تكلفة الطيران', type: 'number' }, { k: 'hotel_cost', label: 'تكلفة الفندق', type: 'number' }] },
      { k: 'best_time', label: 'أفضل وقت للزيارة' },
      { k: 'pros', label: 'المميزات', type: 'textarea', rows: 2 },
      { k: 'cons', label: 'العيوب', type: 'textarea', rows: 2 },
      { k: 'rating', label: 'تقييمنا', type: 'stars' },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'image_id', label: 'صورة', type: 'image' },
    ],
    onSubmit: async (v) => { if (row) await update('honeymoon', row.id, v); else await create('honeymoon', v); },
    onDelete: row ? () => remove('honeymoon', row.id) : null,
  });
}

function editHItem(section, row = null) {
  const dests = all('honeymoon');
  openForm({
    title: row ? 'تعديل' : `إضافة — ${L.honeySections[section]}`, en: L.honeySectionsEn[section],
    values: { section, destination_id: dests.find((d) => d.chosen)?.id || '', ...(row || {}) },
    fields: [
      { k: 'title', label: 'العنوان', required: true },
      ...(dests.length ? [{ k: 'destination_id', label: 'الوجهة', type: 'select', options: [{ v: '', l: 'عام (لكل الوجهات)' }, ...dests.map((d) => ({ v: d.id, l: d.name }))] }] : []),
      ...(['packing', 'shopping', 'note', 'photo'].includes(section) ? [] : [{ type: 'pair', fields: [{ k: 'date', label: 'التاريخ', type: 'date' }, { k: 'amount', label: 'المبلغ', type: 'number' }] }]),
      ...(section === 'shopping' ? [{ k: 'amount', label: 'السعر التقريبي', type: 'number' }] : []),
      ...(['note', 'photo', 'packing'].includes(section) ? [] : [{ k: 'url', label: 'رابط', type: 'url', dir: 'ltr', placeholder: 'https://' }]),
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: section === 'note' ? 5 : 2 },
      ...(section === 'photo' ? [{ k: 'image_id', label: 'الصورة', type: 'image' }] : []),
      ...(['packing', 'shopping', 'booking', 'flight', 'hotel', 'activity', 'sight', 'restaurant'].includes(section) ? [{ k: 'done', label: section === 'packing' || section === 'shopping' ? 'تم' : 'تم الحجز / التأكيد', type: 'toggle' }] : []),
    ],
    onSubmit: async (v) => { if (v.destination_id === '') v.destination_id = null; if (row) await update('honey_items', row.id, v); else await create('honey_items', { ...v, section }); },
    onDelete: row ? () => remove('honey_items', row.id) : null,
  });
}

function destSheet(d) {
  openSheet({
    title: d.name, en: d.chosen ? 'Our final choice ✦' : 'Destination',
    body: `${d.image_id ? img(d.image_id, 'cover') + '<div style="height:12px"></div>' : ''}
      <dl class="kv">${d.country ? `<dt>المنطقة</dt><dd>${esc(d.country)}</dd>` : ''}${d.budget ? `<dt>الميزانية</dt><dd>${money(d.budget)}</dd>` : ''}${d.flight_cost ? `<dt>الطيران</dt><dd>${money(d.flight_cost)}</dd>` : ''}${d.hotel_cost ? `<dt>الفندق</dt><dd>${money(d.hotel_cost)}</dd>` : ''}${d.duration ? `<dt>المدة</dt><dd>${d.duration} أيام</dd>` : ''}${d.best_time ? `<dt>أفضل وقت</dt><dd>${esc(d.best_time)}</dd>` : ''}${d.rating ? `<dt>تقييمنا</dt><dd>${stars(d.rating)}</dd>` : ''}${d.pros ? `<dt>المميزات</dt><dd>${esc(d.pros)}</dd>` : ''}${d.cons ? `<dt>العيوب</dt><dd>${esc(d.cons)}</dd>` : ''}${d.notes ? `<dt>ملاحظات</dt><dd>${esc(d.notes)}</dd>` : ''}</dl>`,
    foot: `${d.chosen ? `<button class="btn rose" data-trip>${icon('plane', 'sm')} ${d.trip_id && byId('trips', d.trip_id) ? 'فتح الرحلة' : 'تحويل إلى رحلة'}</button>` : `<button class="btn" data-choose>${icon('star', 'sm')} اختيارها كوجهة نهائية</button>`}<button class="icon-btn" data-edit>${icon('edit')}</button>`,
    onMount: (sh, close) => {
      sh.querySelector('[data-edit]').onclick = () => { close(); setTimeout(() => editDest(d), 240); };
      sh.querySelector('[data-choose]')?.addEventListener('click', async () => {
        try { for (const x of all('honeymoon')) if (x.chosen && x.id !== d.id) await update('honeymoon', x.id, { chosen: 0 }); await update('honeymoon', d.id, { chosen: 1 }); toast('تم اختيار الوجهة النهائية ✦'); close(); } catch (e) { toastErr(e); }
      });
      sh.querySelector('[data-trip]')?.addEventListener('click', async () => {
        if (d.trip_id && byId('trips', d.trip_id)) { close(); location.hash = `#/trips/${d.trip_id}`; return; }
        if (!(await confirmBox('سيتم إنشاء رحلة فعلية في «رحلاتنا» ونقل الطيران والفندق والأنشطة والجدول والتجهيزات إليها.', { ok: 'إنشاء الرحلة', danger: false, title: 'تحويل إلى رحلة' }))) return;
        try { const r = await post(`/api/honeymoon/${d.id}/convert`); await syncNow(); toast('تم إنشاء الرحلة ✈️'); close(); setTimeout(() => { location.hash = `#/trips/${r.trip_id}`; }, 250); } catch (e) { toastErr(e); }
      });
    },
  });
}

export default {
  render(el) {
    const dests = all('honeymoon').sort((a, b) => (b.chosen || 0) - (a.chosen || 0) || (b.rating || 0) - (a.rating || 0));
    const chosen = dests.find((d) => d.chosen);
    const items = all('honey_items');
    const totalBudget = items.filter((i) => i.section === 'budget' || i.amount).reduce((s, i) => s + (i.amount || 0), 0);
    let body = '';
    if (st.tab === 'dest') {
      body = dests.length ? `<div class="pcards">${dests.map((d) => `<div class="pcard ${d.chosen ? 'chosen-ring' : ''}" data-dest="${d.id}"><div class="img">${d.image_id ? img(d.image_id) : icon('palm', 'lg')}${d.chosen ? '<span class="badge">✦ اخترناها</span>' : ''}</div><div class="body"><div class="title">${esc(d.name)}</div><div class="small muted">${esc(d.country || '')}${d.budget ? ' · ' + money(d.budget) : ''}</div>${d.rating ? stars(d.rating) : ''}</div></div>`).join('')}</div>`
        : empty('Dream destinations', 'أضيفوا الوجهات المقترحة ثم قارنوا بينها واختاروا الوجهة النهائية', '');
      body += `<button class="btn soft block" style="margin-top:12px" data-newdest>${icon('plus', 'sm')} وجهة مقترحة</button>`;
    } else if (st.tab === 'compare') {
      const rows = [['الميزانية', (d) => (d.budget ? money(d.budget) : '—')], ['الطيران', (d) => (d.flight_cost ? money(d.flight_cost) : '—')], ['الفندق', (d) => (d.hotel_cost ? money(d.hotel_cost) : '—')], ['الإجمالي التقريبي', (d) => ((d.flight_cost || 0) + (d.hotel_cost || 0) ? money((d.flight_cost || 0) + (d.hotel_cost || 0)) : '—')], ['المدة', (d) => (d.duration ? `${d.duration} أيام` : '—')], ['أفضل وقت', (d) => esc(d.best_time || '—')], ['التقييم', (d) => (d.rating ? stars(d.rating) : '—')], ['المميزات', (d) => esc(d.pros || '—')], ['العيوب', (d) => esc(d.cons || '—')]];
      body = dests.length >= 1 ? `<div class="card compare-wrap" style="padding:8px 16px"><table class="compare"><thead><tr><th></th>${dests.map((d) => `<th style="color:var(--ink)">${d.chosen ? '✦ ' : ''}${esc(d.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([l, f]) => `<tr><th>${l}</th>${dests.map((d) => `<td style="white-space:pre-wrap">${f(d)}</td>`).join('')}</tr>`).join('')}<tr><th></th>${dests.map((d) => `<td>${d.chosen ? '<span class="badge rose">الوجهة النهائية</span>' : `<button class="btn sm soft" data-dest="${d.id}">اختيار</button>`}</td>`).join('')}</tr></tbody></table></div>` : empty('Compare', 'أضيفوا وجهتين أو أكثر للمقارنة', '');
    } else {
      const list = items.filter((i) => i.section === st.sec).sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.created_at.localeCompare(b.created_at));
      const destName = (id) => dests.find((d) => d.id === id)?.name;
      body = `<div class="chips">${Object.entries(L.honeySections).map(([k, l]) => `<button class="chip ${st.sec === k ? 'on' : ''}" data-sec="${k}">${icon(L.honeyIcon[k], 'sm')} ${l}${items.filter((i) => i.section === k).length ? ` <span class="tiny" style="opacity:.7">${items.filter((i) => i.section === k).length}</span>` : ''}</button>`).join('')}</div>
        ${st.sec === 'photo' ? (list.length ? `<div class="gallery">${list.map((i) => i.image_id ? `<img src="${fileUrl(i.image_id)}" data-hitem="${i.id}" alt="">` : '').join('')}</div>` : '<div class="card soft center small muted">لا توجد صور بعد — صور إلهام، فنادق، أماكن…</div>')
          : list.length ? `<div class="card">${list.map((i) => `<div class="item" data-hitem="${i.id}" style="cursor:pointer">${['packing', 'shopping', 'booking', 'flight', 'hotel', 'activity', 'sight', 'restaurant'].includes(i.section) ? `<button class="check ${i.done ? 'on' : ''}" data-hcheck="${i.id}">${icon('check', 'sm')}</button>` : `<span class="ic-box rose">${icon(L.honeyIcon[i.section])}</span>`}<div class="grow" style="min-width:0"><div class="title ${i.done && ['packing', 'shopping'].includes(i.section) ? 'done-text' : ''}">${esc(i.title)}</div><div class="sub">${[i.date && fmtGreg(i.date, { year: false }), destName(i.destination_id), i.notes].filter(Boolean).map(esc).join(' · ')}</div></div>${i.amount ? `<span class="small num">${money(i.amount)}</span>` : ''}${i.url ? `<a class="icon-btn plain" href="${esc(i.url)}" target="_blank" rel="noopener" data-stop>${icon('link', 'sm')}</a>` : ''}</div>`).join('')}</div>` : '<div class="card soft center small muted">لا يوجد شيء بعد</div>'}
        <button class="btn soft block" style="margin-top:12px" data-additem>${icon('plus', 'sm')} إضافة — ${L.honeySections[st.sec]}</button>`;
    }
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'Our Honeymoon', ar: 'شهر العسل', back: '#/more' })}
      <div class="hero" style="margin-bottom:14px"><div class="row between"><span class="en" style="color:var(--rose-ink);font-size:17px">${chosen ? 'We’re going to…' : 'Somewhere beautiful'}</span>${icon('palm')}</div>
        <div style="font-size:22px;font-weight:600;margin-top:6px">${chosen ? esc(chosen.name) : 'لم نختر الوجهة بعد'}</div>
        <div class="small" style="color:var(--ink2)">${dests.length} وجهات مقترحة${totalBudget ? ` · مبالغ مسجلة ${money(totalBudget)}` : ''}${chosen?.budget ? ` · الميزانية ${money(chosen.budget)}` : ''}</div>
        ${chosen ? `<button class="btn sm" style="margin-top:12px" data-dest="${chosen.id}">${icon('plane', 'sm')} ${chosen.trip_id && byId('trips', chosen.trip_id) ? 'فتح الرحلة' : 'تحويل إلى رحلة'}</button>` : ''}</div>
      <div class="tabs"><button data-tab="dest" class="${st.tab === 'dest' ? 'on' : ''}">الوجهات</button><button data-tab="compare" class="${st.tab === 'compare' ? 'on' : ''}">المقارنة</button><button data-tab="plan" class="${st.tab === 'plan' ? 'on' : ''}">التخطيط</button></div>
      ${body}
    </div>`;
    el.onclick = async (e) => {
      const q = (s) => e.target.closest(s); let b;
      if (q('[data-stop]')) return;
      try {
        if ((b = q('[data-tab]'))) { st.tab = b.dataset.tab; return this.render(el); }
        if ((b = q('[data-sec]'))) { st.sec = b.dataset.sec; return this.render(el); }
        if (q('[data-newdest]')) return editDest();
        if ((b = q('[data-hcheck]'))) { e.stopPropagation(); const i = byId('honey_items', b.dataset.hcheck); b.classList.toggle('on'); return update('honey_items', i.id, { done: !i.done }); }
        if ((b = q('[data-dest]'))) return destSheet(byId('honeymoon', b.dataset.dest));
        if (q('[data-additem]')) return editHItem(st.sec);
        if ((b = q('[data-hitem]'))) { const i = byId('honey_items', b.dataset.hitem); return editHItem(i.section, i); }
      } catch (err) { toastErr(err); }
    };
  },
};
export { opts };
