// How Are We Today? — optional daily mood for each of us, history and a monthly mood calendar.
import { all, store, today, create, isMe, person } from '../store.js';
import { esc, icon, avatar, pageHead, toast } from '../ui.js';
import { openForm } from '../form.js';
import { addDays, addMonths, daysInMonth, fmtGreg, GREG_MONTHS, iso, monthKey, weekday, WEEKDAYS_SHORT } from '../dates.js';
import { L } from '../labels.js';

const st = { month: null };

export function openMoodForm(date = null) {
  const d = date || today();
  const existing = all('moods').find((m) => m.created_by === store.me.id && m.date === d);
  openForm({
    title: d === today() ? 'كيف حالك اليوم؟' : `مزاجك يوم ${fmtGreg(d, { year: false })}`, en: 'How Are We Today?',
    values: { energy: 3, ...(existing || {}), date: d },
    fields: [
      { k: 'mood', label: 'المزاج', type: 'seg', required: true, options: Object.entries(L.moods).map(([v, [e, l]]) => ({ v, l: `${e} ${l}` })) },
      { k: 'message', label: 'رسالة قصيرة عن يومك', placeholder: 'مثال: اليوم مزاجي ممتاز' },
      { k: 'needs', label: 'ماذا تحتاج اليوم؟', placeholder: 'مثال: محتاج شوية هدوء / نفسي نطلع سوا' },
      { k: 'energy', label: 'مستوى الطاقة', type: 'range', min: 1, max: 5, labels: L.energy },
      { k: 'private_note', label: 'ملاحظة خاصة (لا يراها غيرك)', type: 'textarea', rows: 2 },
    ],
    onSubmit: async (v) => { await create('moods', { ...v, date: d }); toast('تم تسجيل مزاجك'); },
  });
}

export default {
  render(el) {
    const t = today(), me = store.me, p = store.partner;
    if (!st.month) st.month = monthKey(t);
    const moods = all('moods');
    const todayOf = (u) => u && moods.find((m) => m.created_by === u.id && m.date === t);
    const card = (u) => {
      if (!u) return '';
      const m = todayOf(u); const mo = m && L.moods[m.mood];
      return `<div class="card ${isMe(u.id) ? 'tap' : ''}" ${isMe(u.id) ? 'data-mine' : ''}>
        <div class="row between">${avatar(u)}<span style="font-size:34px">${mo ? mo[0] : '·'}</span></div>
        <div style="font-weight:600;margin-top:8px">${esc(u.name)}</div>
        <div class="small">${mo ? esc(mo[1]) : isMe(u.id) ? 'اضغط لتسجيل مزاجك' : 'لم يُسجَّل اليوم'}</div>
        ${m?.message ? `<div class="small muted" style="margin-top:6px">«${esc(m.message)}»</div>` : ''}
        ${m?.needs ? `<div class="small" style="margin-top:6px;color:var(--rose-ink)">يحتاج: ${esc(m.needs)}</div>` : ''}
        ${m?.energy ? `<div class="tiny muted" style="margin-top:6px">الطاقة: ${'●'.repeat(m.energy)}${'○'.repeat(5 - m.energy)}</div>` : ''}
        ${m?.private_note && isMe(u.id) ? `<div class="tiny muted" style="margin-top:6px">${icon('lock', 'sm')} ${esc(m.private_note)}</div>` : ''}
      </div>`;
    };
    // month calendar
    const [y, mo] = st.month.split('-').map(Number);
    const first = iso(y, mo, 1), len = daysInMonth(y, mo);
    const ws = me.settings.week_start ?? 6;
    const off = (weekday(first) - ws + 7) % 7;
    let grid = ''; for (let i = 0; i < 7; i++) grid += `<div class="wd">${WEEKDAYS_SHORT[(ws + i) % 7]}</div>`;
    for (let i = 0; i < off; i++) grid += '<div></div>';
    for (let d = 1; d <= len; d++) {
      const ds = iso(y, mo, d);
      const ms = moods.filter((m) => m.date === ds);
      const e = ms.find((m) => m.created_by === me.id), r = p && ms.find((m) => m.created_by === p.id);
      grid += `<button class="cal-day ${ds === t ? 'today' : ''}" data-day="${ds}" ${ds > t ? 'disabled' : ''}><span class="g num">${d}</span><span class="emos">${e ? L.moods[e.mood]?.[0] : ''}${r ? L.moods[r.mood]?.[0] : ''}</span></button>`;
    }
    const recent = moods.filter((m) => m.date < t).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'How Are We Today?', ar: 'مزاجنا', back: '#/more' })}
      <div class="grid2">${card(me)}${card(p) || `<div class="card soft small muted">ادعُ الطرف الآخر من الإعدادات ليشارككم مزاجه</div>`}</div>
      <p class="tiny muted center" style="margin:10px 0 0">تسجيل المزاج اختياري تمامًا 🤍</p>
      <div class="section-title"><h2>تقويم المزاج</h2><span class="en">Mood Calendar</span></div>
      <div class="card mcal" style="padding:12px"><div class="cal-head"><button class="icon-btn plain" data-m="-1">${icon('chevR')}</button><div class="t"><b>${GREG_MONTHS[mo - 1]} ${y}</b><span>${me.letter} ${p ? '· ' + p.letter : ''}</span></div><button class="icon-btn plain" data-m="1" ${st.month >= monthKey(t) ? 'disabled' : ''}>${icon('chevL')}</button></div>
      <div class="cal-grid">${grid}</div></div>
      ${recent.length ? `<div class="section-title"><h2>الأيام السابقة</h2><span class="en">History</span></div><div class="card">${recent.map((m) => `<div class="item"><span style="font-size:24px">${L.moods[m.mood]?.[0] || ''}</span><div class="grow"><div class="title">${esc(person(m.created_by)?.name || '')} · ${esc(L.moods[m.mood]?.[1] || '')}</div><div class="sub">${fmtGreg(m.date, { weekday: true })}${m.message ? ' — ' + esc(m.message) : ''}</div></div>${avatar(m.created_by, 'sm')}</div>`).join('')}</div>` : ''}
    </div>`;
    el.onclick = (e) => {
      const q = (s) => e.target.closest(s); let b;
      if (q('[data-mine]')) return openMoodForm();
      if ((b = q('[data-m]'))) { st.month = addMonths(st.month, Number(b.dataset.m)); return this.render(el); }
      if ((b = q('[data-day]'))) {
        const ds = b.dataset.day; const ms = moods.filter((m) => m.date === ds);
        if (!ms.length || ms.every((m) => !isMe(m.created_by))) { if (ds <= t) openMoodForm(ds); return; }
        openMoodForm(ds);
      }
    };
  },
};
export { addDays };
