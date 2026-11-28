// Our Important Dates — birthdays, engagement, firsts, family occasions… with automatic countdowns (Gregorian or Hijri).
import { all, today, pref } from '../store.js';
import { esc, icon, empty, pageHead, img, byline, openSheet } from '../ui.js';
import { diffDays, fmtGreg, fmtHijri, nextOccurrence, countdown } from '../dates.js';
import { L } from '../labels.js';
import { editDate } from '../editors.js';
import { datesWithSince } from '../agenda.js';

const st = { kind: 'all' };
const milestone = (n) => (n === 0 ? 'اليوم' : n === 1 ? 'غدًا' : n <= 3 ? 'باقي 3 أيام أو أقل' : n <= 10 ? 'باقي 10 أيام أو أقل' : n <= 30 ? 'باقي أقل من شهر' : '');

export default {
  render(el) {
    const t = today();
    let items = datesWithSince().map((d) => { const o = nextOccurrence(d, t); return { d, o, n: o ? diffDays(t, o.date) : null }; });
    if (st.kind !== 'all') items = items.filter((x) => x.d.kind === st.kind);
    const upcoming = items.filter((x) => x.n !== null && x.n >= 0).sort((a, b) => a.n - b.n);
    const past = items.filter((x) => x.n === null || x.n < 0).sort((a, b) => b.d.date.localeCompare(a.d.date));
    const kinds = [...new Set(datesWithSince().map((d) => d.kind))];
    const row = ({ d, o, n }) => `<div class="item" data-open="${d.id}" style="cursor:pointer">
      ${d.image_id ? img(d.image_id, 'thumb') : `<span class="ic-box ${d.kind === 'birthday' ? 'rose' : 'brown'}">${icon(L.dateKindIcon[d.kind] || 'calendar')}</span>`}
      <div class="grow" style="min-width:0"><div class="title">${esc(d.title)}</div>
        <div class="sub">${o ? `${fmtGreg(o.date)} · ${fmtHijri(o.date)}` : ''}</div>
        <div class="sub">${esc(L.dateKinds[d.kind] || '')}${d.recurring ? ' · سنويًا' + (d.cal === 'h' ? ' (هجري)' : '') : ''}${o?.years > 0 && d.cal !== 'h' ? ` · ${o.years} سنة` : ''}</div></div>
      <div class="cd ${n === 0 ? 'today' : ''}">${n === null ? '' : n === 0 ? '<b>✦</b><span>اليوم</span>' : n < 0 ? `<b>${-n}</b><span>مضى</span>` : `<b class="num">${n}</b><span>${n === 1 ? 'غدًا' : n <= 10 ? 'أيام' : 'يومًا'}</span>`}</div>
    </div>`;
    const first = upcoming[0];
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'لا تنسوها', ar: 'تواريخنا المهمة', back: '#/more', actions: `<button class="btn sm" data-new>${icon('plus', 'sm')} مناسبة</button>` })}
      ${first ? `<div class="hero tap" data-open="${first.d.id}" style="margin-bottom:14px">
        <span class="en" style="color:var(--rose-ink);font-size:14px">${first.n === 0 ? 'اليوم' : 'قريبًا'}</span>
        <div class="row" style="align-items:flex-end;gap:14px;margin-top:10px"><div><div class="big num">${first.n === 0 ? '✦' : first.n}</div><div class="unit">${countdown(first.n)}</div></div>
        <div class="grow"><div style="font-weight:600;font-size:17px">${esc(first.d.title)}</div><div class="small" style="color:var(--ink2)">${fmtGreg(first.o.date, { weekday: true })}<br>${fmtHijri(first.o.date)}</div></div></div>
        ${milestone(first.n) ? `<div class="badge dark" style="margin-top:12px">${milestone(first.n)}</div>` : ''}</div>` : ''}
      ${kinds.length > 1 ? `<div class="chips"><button class="chip ${st.kind === 'all' ? 'on' : ''}" data-k="all">الكل</button>${kinds.map((k) => `<button class="chip ${st.kind === k ? 'on' : ''}" data-k="${k}">${esc(L.dateKinds[k] || k)}</button>`).join('')}</div>` : ''}
      ${upcoming.length ? `<div class="card">${upcoming.map(row).join('')}</div>` : ''}
      ${past.length ? `<div class="section-title"><h2>تواريخ مضت</h2><span class="en">ذكريات</span></div><div class="card">${past.map(row).join('')}</div>` : ''}
      ${!items.length ? empty('كل تاريخ يعني لنا', 'سجّلوا أعياد الميلاد، تاريخ الخطوبة، أول لقاء، أول محادثة…', `<br><button class="btn sm" data-new>${icon('plus', 'sm')} أول مناسبة</button>`) : ''}
    </div>`;
    el.onclick = (e) => {
      const q = (s) => e.target.closest(s); let b;
      if (q('[data-new]')) return editDate();
      if ((b = q('[data-k]'))) { st.kind = b.dataset.k; return this.render(el); }
      if ((b = q('[data-open]'))) { if (b.dataset.open === 'since') { location.hash = '#/anniv'; return; } view(all('dates').find((d) => d.id === b.dataset.open)); }
    };
  },
};

function view(d) {
  if (!d) return;
  const t = today(); const o = nextOccurrence(d, t); const n = o ? diffDays(t, o.date) : null;
  openSheet({
    title: d.title, en: L.dateKinds[d.kind] || 'مناسبة',
    body: `${d.image_id ? img(d.image_id, 'cover') + '<div style="height:12px"></div>' : ''}
      <div class="row between"><div><div class="small muted">${d.recurring ? 'الموعد القادم' : 'التاريخ'}</div><div style="font-weight:600">${o ? fmtGreg(o.date, { weekday: true }) : ''}</div><div class="small">${o ? fmtHijri(o.date) : ''}</div></div>${n !== null ? `<div class="cd ${n === 0 ? 'today' : ''}" style="padding:10px 14px"><b class="num">${n === 0 ? '✦' : Math.abs(n)}</b><span>${countdown(n)}</span></div>` : ''}</div>
      <div class="divider"></div>
      <dl class="kv"><dt>التاريخ الأصلي</dt><dd>${fmtGreg(d.date)} · ${fmtHijri(d.date)}</dd><dt>التقويم</dt><dd>${d.cal === 'h' ? 'هجري (أم القرى)' : 'ميلادي'}${d.recurring ? ' · يتكرر سنويًا' : ''}</dd>
      ${o?.years > 0 && d.cal !== 'h' ? `<dt>المدة</dt><dd>${o.years} سنة</dd>` : ''}
      ${d.description ? `<dt>الوصف</dt><dd>${esc(d.description)}</dd>` : ''}${d.note ? `<dt>ملاحظة</dt><dd>${esc(d.note)}</dd>` : ''}
      <dt>التذكير</dt><dd>${d.remind === 'custom' ? esc((d.remind_at || '').replace('T', ' ')) : L.remind[d.remind || ''] }</dd></dl>
      <div class="small muted" style="margin-top:12px">${esc(byline(d))}</div>`,
    foot: `<button class="btn" data-edit>${icon('edit', 'sm')} تعديل</button>`,
    onMount: (sh, close) => { sh.querySelector('[data-edit]').onclick = () => { close(); setTimeout(() => editDate(d), 240); }; },
  });
}
export { pref };
