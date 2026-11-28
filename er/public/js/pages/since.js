// منذ أن عرفنا بعض ❤️ — live counter since the moment we met, with the date (Gregorian & Hijri), time, memory and photo.
import { patch } from '../api.js';
import { store, today, syncNow, person } from '../store.js';
import { esc, icon, pageHead, img, toast, avatar } from '../ui.js';
import { openForm } from '../form.js';
import { fmtGreg, fmtHijri, fmtTime, countdown, diffDays, todayIn } from '../dates.js';
import { tzName } from '../labels.js';
import { elapsed, counterCells, sentence, nextAnniversary, parseAt, pad } from '../since.js';

export const SINCE_TITLE = 'منذ أن عرفنا بعض ❤️';

export function editSince() {
  const s = store.space?.since || null;
  const a = parseAt(s?.at);
  const tz = store.me.settings.tz || 'Asia/Riyadh';
  openForm({
    title: s ? 'تعديل لحظة البداية' : 'متى عرفنا بعض؟', en: SINCE_TITLE,
    values: {
      date: a ? `${a.y}-${pad(a.mo)}-${pad(a.d)}` : '', time: a ? `${pad(a.h)}:${pad(a.mi)}${a.s ? ':' + pad(a.s) : ''}` : '',
      note: s?.note || '', image_id: s?.image_id || null, show_home: s ? s.show_home !== false : true,
    },
    fields: [
      { type: 'pair', fields: [{ k: 'date', label: 'تاريخ أول يوم', type: 'date', required: true }, { k: 'time', label: 'الساعة بالضبط', type: 'time', step: 1, required: true }] },
      { type: 'info', html: `يُحسب العداد بالتوقيت المحلي (${esc(tzName(s?.tz || tz))}) مع مراعاة عدد أيام كل شهر وسنة.` },
      { k: 'note', label: 'ذكرى عن أول يوم', type: 'textarea', rows: 4, placeholder: 'أين كنا؟ ماذا قلنا؟ ما الذي نتذكره عن تلك اللحظة…' },
      { k: 'image_id', label: 'صورة من ذلك اليوم', type: 'image' },
      { k: 'show_home', label: 'عرض العداد في الصفحة الرئيسية', type: 'toggle' },
    ],
    onSubmit: async (v) => {
      const t = v.time.length === 5 ? v.time : v.time.slice(0, 8);
      const at = `${v.date}T${t}`;
      if (!parseAt(at)) { toast('الوقت غير صحيح', 'err'); return false; }
      await patch('/api/space', { since: { at, tz: s?.tz || tz, note: v.note, image_id: v.image_id, show_home: !!v.show_home } });
      store.space.since = { ...(s || {}), at, tz: s?.tz || tz, note: v.note, image_id: v.image_id, show_home: !!v.show_home, updated_by: store.me.id };
      await syncNow();
      toast('تم الحفظ ❤️');
    },
    onDelete: s ? async () => { await patch('/api/space', { since: null }); store.space.since = null; await syncNow(); } : null,
    deleteLabel: 'إزالة',
  });
}

/** Home-page card (live). */
export function sinceCard() {
  const s = store.space?.since;
  if (!s) return `<a class="card since-card tap" href="#/since" style="display:block"><div class="row between"><span class="since-title">${SINCE_TITLE}</span>${icon('clock', 'sm')}</div><div class="small muted" style="margin-top:6px">حدّدوا تاريخ وساعة أول يوم تعرفتم فيه، وسيبدأ العداد فورًا.</div></a>`;
  if (s.show_home === false) return '';
  const e = elapsed(s); if (!e) return '';
  return `<a class="card since-card tap" href="#/since" style="display:block" data-since-live>
    <div class="row between"><span class="since-title">${SINCE_TITLE}</span><span class="tiny muted">${e.future ? 'باقي' : 'وما زال العدّ'}</span></div>
    <div class="since-grid compact" style="--n:${e.y > 0 ? 6 : 5}">${counterCells(e, { compact: true })}</div></a>`;
}

export default {
  render(el) {
    const s = store.space?.since;
    if (!s) {
      el.innerHTML = `<div class="page">${pageHead({ en: 'لحظة لا تُنسى', ar: 'منذ أن عرفنا بعض', back: '#/more' })}
        <div class="since-hero center"><div style="font-size:34px">❤️</div><h2 style="margin:8px 0 6px;font-size:19px">متى بدأت حكايتنا؟</h2>
        <p class="small" style="color:var(--ink2);margin:0 0 16px">أدخلوا تاريخ وساعة أول يوم تعرفتم فيه على بعض، وسيعدّ التطبيق كل سنة وشهر ويوم وساعة ودقيقة وثانية مرّت منذ تلك اللحظة.</p>
        <button class="btn" data-edit>${icon('plus', 'sm')} تحديد التاريخ والوقت</button></div></div>`;
      el.onclick = (e) => { if (e.target.closest('[data-edit]')) editSince(); };
      return;
    }
    const e = elapsed(s);
    const a = parseAt(s.at);
    const day = `${a.y}-${pad(a.mo)}-${pad(a.d)}`;
    const t = today();
    const ann = nextAnniversary(s, t);
    const annN = ann ? diffDays(t, ann.date) : null;
    const who = person(s.updated_by);
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'لحظة لا تُنسى', ar: 'منذ أن عرفنا بعض ❤️', back: '#/more', actions: `<button class="icon-btn" data-edit aria-label="تعديل">${icon('edit')}</button>` })}
      <div class="since-hero" data-since-live>
        <div class="center small" style="color:var(--rose-ink)">${e.future ? 'باقي على اللحظة' : 'مرّ على أول لقاء'}</div>
        <div class="since-grid">${counterCells(e)}</div>
        <div class="center small" style="color:var(--ink2);margin-top:12px;line-height:1.9" data-sentence>${esc(sentence(e))}</div>
      </div>
      <div class="card" style="margin-top:12px">
        <dl class="kv">
          <dt>الميلادي</dt><dd>${fmtGreg(day, { weekday: true })}</dd>
          <dt>الهجري</dt><dd>${fmtHijri(day)}</dd>
          <dt>الساعة</dt><dd>${fmtTime(`${pad(a.h)}:${pad(a.mi)}`)}${a.s ? ` و${a.s} ثانية` : ''}</dd>
          ${ann ? `<dt>الذكرى القادمة</dt><dd>${ann.years === 1 ? 'الذكرى الأولى' : `الذكرى رقم ${ann.years}`} · ${annN === 0 ? 'اليوم 🎉' : countdown(annN)}<div class="tiny muted">${fmtGreg(ann.date, { weekday: true })}</div></dd>` : ''}
        </dl>
      </div>
      <div class="section-title"><h2>المدة الكاملة</h2><span class="en">بالأرقام</span></div>
      <div class="since-totals" data-since-live>
        <div><b class="num" data-total="totalDays">${e.totalDays.toLocaleString('en-US')}</b><span>يومًا</span></div>
        <div><b class="num" data-total="totalHours">${e.totalHours.toLocaleString('en-US')}</b><span>ساعة</span></div>
        <div><b class="num" data-total="totalMin">${e.totalMin.toLocaleString('en-US')}</b><span>دقيقة</span></div>
        <div><b class="num" data-total="totalSec">${e.totalSec.toLocaleString('en-US')}</b><span>ثانية</span></div>
      </div>
      ${s.image_id || s.note ? `<div class="section-title"><h2>ذكرى أول يوم</h2></div><div class="card">${s.image_id ? img(s.image_id, 'cover') : ''}${s.note ? `<p style="white-space:pre-wrap;line-height:1.9;margin:${s.image_id ? '12px' : '0'} 0 0">${esc(s.note)}</p>` : ''}</div>`
        : `<button class="btn soft block" style="margin-top:14px" data-edit>${icon('image', 'sm')} أضيفوا ذكرى أو صورة من ذلك اليوم</button>`}
      ${who ? `<div class="row tiny muted" style="margin-top:12px;gap:6px">${avatar(who, 'sm')} آخر تعديل: ${esc(who.name)}</div>` : ''}
    </div>`;
    el.onclick = (ev) => { if (ev.target.closest('[data-edit]')) editSince(); };
  },
};
export { todayIn };
