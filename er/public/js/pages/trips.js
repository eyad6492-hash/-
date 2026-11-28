// Our Travel Plans — list of trips (upcoming / past).
import { all, today } from '../store.js';
import { esc, icon, empty, pageHead, img, money } from '../ui.js';
import { diffDays, fmtGreg, countdown } from '../dates.js';
import { L } from '../labels.js';
import { editTrip } from '../editors.js';

export const tripDays = (t) => (t.start_date && t.end_date ? diffDays(t.start_date, t.end_date) + 1 : t.start_date ? 1 : null);

export default {
  render(el) {
    const t = today();
    const trips = all('trips');
    const up = trips.filter((x) => !x.start_date || (x.end_date || x.start_date) >= t).filter((x) => x.status !== 'done').sort((a, b) => (a.start_date || '9').localeCompare(b.start_date || '9'));
    const past = trips.filter((x) => !up.includes(x)).sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
    const card = (x) => {
      const n = x.start_date ? diffDays(t, x.start_date) : null; const days = tripDays(x);
      const spent = all('trip_items').filter((i) => i.trip_id === x.id && i.section === 'expense').reduce((s, i) => s + (i.amount || 0), 0);
      return `<a class="card tap" href="#/trips/${x.id}" style="display:block;padding:0;overflow:hidden">
        <div style="position:relative">${x.image_id ? img(x.image_id, 'cover') : `<div class="cover" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--sage-soft),var(--brown-soft));color:var(--brown)">${icon(x.honeymoon ? 'palm' : 'plane', 'lg')}</div>`}
        ${n !== null && n >= 0 ? `<span class="badge dark" style="position:absolute;top:12px;right:12px">${countdown(n)}</span>` : n !== null && x.end_date >= t ? '<span class="badge dark" style="position:absolute;top:12px;right:12px">الآن ✈️</span>' : ''}</div>
        <div style="padding:14px 16px"><div class="row between"><div style="font-weight:600;font-size:16px">${esc(x.name)}</div><span class="badge">${L.tripStatus[x.status || 'planning']}</span></div>
        <div class="small muted">${esc(x.destination || '')}${x.start_date ? ` · ${fmtGreg(x.start_date, { year: false })}${x.end_date ? ' – ' + fmtGreg(x.end_date) : ''}` : ''}${days ? ` · ${days} ${days <= 10 ? 'أيام' : 'يومًا'}` : ''}</div>
        ${x.budget ? `<div class="progress ${spent > x.budget ? 'over' : ''}" style="margin-top:10px"><i style="width:${Math.min(100, (spent / x.budget) * 100)}%"></i></div><div class="tiny muted" style="margin-top:4px">${money(spent)} من ${money(x.budget)}</div>` : ''}</div></a>`;
    };
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'خطط السفر', ar: 'رحلاتنا', back: '#/more', actions: `<button class="btn sm" data-new>${icon('plus', 'sm')} رحلة</button>` })}
      ${up.length ? up.map(card).join('') : empty('إلى أين بعد ذلك؟', 'خططوا لرحلتكم القادمة: الطيران، الفندق، الأماكن، الميزانية وقائمة التجهيز', `<br><button class="btn sm" data-new>${icon('plus', 'sm')} رحلة جديدة</button>`)}
      ${past.length ? `<div class="section-title"><h2>رحلات سابقة</h2><span class="en">ذكريات</span></div>${past.map(card).join('')}` : ''}
    </div>`;
    el.onclick = (e) => { if (e.target.closest('[data-new]')) editTrip(); };
  },
};
