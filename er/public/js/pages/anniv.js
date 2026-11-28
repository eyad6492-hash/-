// ذكرى يوم عرفنا بعض — the day's story + automatic monthly anniversaries (with a note, what we did and photos for each).
import { all, store, today, create } from '../store.js';
import { esc, icon, pageHead, img, cdBox } from '../ui.js';
import { openForm } from '../form.js';
import { fmtGreg, fmtHijri, fmtTime, diffDays } from '../dates.js';
import { monthlies, parseAt, pad } from '../since.js';
import { editSince } from './since.js';
import { fileUrl } from '../api.js';

const st = { more: false };
const label = (m) => (m.yearly ? `الذكرى السنوية ${m.n / 12 === 1 ? 'الأولى' : `رقم ${m.n / 12}`}` : `الذكرى الشهرية رقم ${m.n}`);

export function editMonthly(m) {
  const row = all('monthlies').find((x) => x.date === m.date);
  openForm({
    title: label(m), en: fmtGreg(m.date, { weekday: true }),
    values: row || {},
    fields: [{ k: 'note', label: 'رسالة أو ملاحظة لهذه الذكرى', type: 'textarea', rows: 3 }, { k: 'did', label: 'ماذا فعلنا في هذا اليوم؟', type: 'textarea', rows: 3 }, { k: 'photos', label: 'صور', type: 'images' }],
    onSubmit: (v) => create('monthlies', { ...v, date: m.date }),
  });
}

export default {
  render(el) {
    const s = store.space?.since, t = today();
    if (!s) {
      el.innerHTML = `<div class="page">${pageHead({ en: 'يومنا الأول', ar: 'ذكرى يوم عرفنا بعض', back: '#/more' })}<div class="since-hero center"><div style="font-size:30px">🌙</div><p class="small" style="color:var(--ink2)">حدّدوا تاريخ ووقت أول يوم تعرفتم فيه، وسيذكّركم التطبيق تلقائيًا بالذكرى الشهرية والسنوية.</p><button class="btn" data-set>${icon('plus', 'sm')} تحديد اليوم</button></div></div>`;
      el.onclick = (e) => { if (e.target.closest('[data-set]')) editSince(); };
      return;
    }
    const a = parseAt(s.at), first = `${a.y}-${pad(a.mo)}-${pad(a.d)}`;
    const { past, next } = monthlies(s, t);
    const todayOne = past[0]?.date === t ? past[0] : null;
    const rows = st.more ? past : past.slice(0, 12);
    const notes = new Map(all('monthlies').map((x) => [x.date, x]));
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'يومنا الأول', ar: 'ذكرى يوم عرفنا بعض', back: '#/more', actions: `<button class="icon-btn" data-set aria-label="تعديل">${icon('edit')}</button>` })}
      ${todayOne ? `<div class="since-hero center" style="margin-bottom:12px"><div style="font-size:30px">❤️</div><div style="font-weight:600;font-size:18px">اليوم ${todayOne.yearly ? 'ذكرى سنوية' : 'ذكرى شهرية'} ليوم عرفنا بعض</div><div class="small" style="color:var(--ink2)">${label(todayOne)}</div><button class="btn sm" style="margin-top:12px" data-m="${todayOne.date}">${icon('note', 'sm')} اكتبوا ماذا فعلتم اليوم</button></div>` : ''}
      ${next ? `<div class="hero" style="margin-bottom:12px"><div class="row between"><span class="en" style="color:var(--rose-ink);font-size:14px">الذكرى القادمة</span>${icon('heart')}</div>
        <div class="row" style="align-items:flex-end;gap:14px;margin-top:10px"><div><div class="big num">${diffDays(t, next.date)}</div><div class="unit">${diffDays(t, next.date) === 1 ? 'يوم — غدًا' : diffDays(t, next.date) <= 10 ? 'أيام متبقية' : 'يومًا متبقيًا'}</div></div>
        <div class="grow"><div style="font-weight:600">${label(next)}</div><div class="small" style="color:var(--ink2)">${fmtGreg(next.date, { weekday: true })}<br>${fmtHijri(next.date)}</div></div></div></div>` : ''}
      <div class="card">
        <div class="card-head"><h3>يومنا الأول</h3><span class="en">${fmtGreg(first, { weekday: true })}</span></div>
        <dl class="kv"><dt>الميلادي</dt><dd>${fmtGreg(first)}</dd><dt>الهجري</dt><dd>${fmtHijri(first)}</dd><dt>الوقت</dt><dd>${fmtTime(`${pad(a.h)}:${pad(a.mi)}`)}</dd></dl>
        ${s.image_id ? `<div style="margin-top:12px">${img(s.image_id, 'cover')}</div>` : ''}
        ${s.note ? `<p style="white-space:pre-wrap;line-height:1.9;margin:12px 0 0">${esc(s.note)}</p>` : `<button class="btn soft sm" style="margin-top:12px" data-set>${icon('note', 'sm')} اكتبوا قصة هذا اليوم</button>`}
        <a class="link" href="#/since" style="display:inline-block;margin-top:10px">العداد المباشر منذ ذلك اليوم ←</a>
      </div>
      <div class="section-title"><h2>الذكريات الشهرية السابقة</h2><span class="en">${past.length}</span></div>
      ${past.length ? `<div class="card">${rows.map((m) => { const nn = notes.get(m.date); return `<div class="item" data-m="${m.date}" style="cursor:pointer"><span class="ic-box ${m.yearly ? 'rose' : ''}">${m.yearly ? '🎉' : m.n}</span><div class="grow" style="min-width:0"><div class="title">${label(m)}</div><div class="sub">${fmtGreg(m.date, { weekday: true })}${nn?.note ? ' · ' + esc(nn.note.slice(0, 50)) : ''}${nn?.did ? ' · ' + esc(nn.did.slice(0, 40)) : ''}</div></div>${(nn?.photos || []).length ? `<img class="thumb" style="width:40px;height:40px" src="${fileUrl(nn.photos[0])}" alt="">` : nn ? icon('note', 'sm') : `<span class="tiny muted">+ ملاحظة</span>`}</div>`; }).join('')}</div>
        ${past.length > 12 && !st.more ? '<button class="btn ghost block sm" style="margin-top:10px" data-moreall>عرض كل الذكريات</button>' : ''}` : '<div class="card soft small muted center">أول ذكرى شهرية لم تأتِ بعد</div>'}
      <p class="tiny muted" style="margin-top:12px">تُحسب الذكرى الشهرية في نفس رقم اليوم من كل شهر، وإن كان الشهر أقصر تكون في آخر يوم منه. يصلكما تذكير تلقائي في يومها، والذكرى السنوية تظهر ضمن المناسبات والتقويم.</p>
    </div>`;
    el.onclick = (e) => {
      const q = (x) => e.target.closest(x); let b;
      if (q('[data-set]')) return editSince();
      if (q('[data-moreall]')) { st.more = true; return this.render(el); }
      if ((b = q('[data-m]'))) { const m = past.find((x) => x.date === b.dataset.m); if (m) editMonthly(m); }
    };
  },
};
