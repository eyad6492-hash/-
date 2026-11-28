// مواعيد تسميع القرآن 🤍 — Rawan schedules and documents her recitation sessions; Eyad follows (view only).
// Next-session card with countdown, upcoming list, searchable log grouped by month, and a month calendar.
import { all, byId, store, today, create, update, remove } from '../store.js';
import { esc, icon, pageHead, empty, toast, toastErr, openSheet, confirmBox } from '../ui.js';
import { openForm } from '../form.js';
import { fmtGreg, fmtHijri, fmtTime, diffDays, addMonths, monthKey, daysInMonth, iso, weekday, GREG_MONTHS, WEEKDAYS_SHORT, nowLocal } from '../dates.js';
import { SURAHS, surahName, surahAyahs } from '../quran-data.js';

const st = { tab: 'up', q: '', month: null, sel: null };
const STATUS = { scheduled: 'مجدول', done: 'تم', partial: 'جزئي', missed: 'لم يتم' };
const TONE = { scheduled: 'rose', done: 'ok', partial: 'warn', missed: '' };
const REMIND = { '': 'بدون تذكير', d1: 'قبل يوم', h3: 'قبل 3 ساعات', h1: 'قبل ساعة', m30: 'قبل نصف ساعة' };
const canWrite = () => store.me?.letter === 'R';
const owner = () => (store.me?.letter === 'R' ? store.me : store.partner);
const surahOpts = SURAHS.map(([n, c], i) => ({ v: i + 1, l: `${i + 1}. ${n} (${c} آية)` }));
const range = (s, a, b) => (s ? `${surahName(s)}${a ? ` · من الآية ${a}${b ? ` إلى ${b}` : ''}` : ''}` : '');
const ayahCount = (r) => (r.done_from && r.done_to ? r.done_to - r.done_from + 1 : r.from_ayah && r.to_ayah ? r.to_ayah - r.from_ayah + 1 : 0);

function countdownText(r) {
  const t = today(), n = diffDays(t, r.date);
  if (n > 1) return { big: n, small: n <= 10 ? 'أيام' : 'يومًا', line: `باقي ${n} ${n <= 10 ? 'أيام' : 'يومًا'}` };
  if (n === 1) return { big: 1, small: 'غدًا', line: 'غدًا إن شاء الله' };
  if (n < 0) return { big: '!', small: 'فات', line: 'فات موعده — سجّلي ما تم' };
  if (!r.time) return { big: '✦', small: 'اليوم', line: 'اليوم إن شاء الله' };
  const now = nowLocal(store.me.settings.tz).slice(11, 16);
  const mins = (Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3))) - (Number(now.slice(0, 2)) * 60 + Number(now.slice(3)));
  if (mins <= 0) return { big: '✦', small: 'الآن', line: 'حان وقت التسميع 🤍' };
  return mins >= 60 ? { big: Math.floor(mins / 60), small: 'ساعة', line: `بعد ${Math.floor(mins / 60)} ساعة${mins % 60 ? ` و${mins % 60} دقيقة` : ''}` } : { big: mins, small: 'دقيقة', line: `بعد ${mins} دقيقة` };
}

export function editSession(row = null, defaults = {}) {
  if (!canWrite()) return toast('الإضافة والتعديل من حساب روان 🤍', 'err');
  openForm({
    title: row ? 'تعديل موعد التسميع' : 'موعد تسميع جديد', en: 'مواعيد تسميع القرآن 🤍',
    values: { date: today(), remind: 'h1', status: 'scheduled', ...defaults, ...(row || {}) },
    fields: [
      { type: 'pair', fields: [{ k: 'date', label: 'تاريخ التسميع', type: 'date', required: true }, { k: 'time', label: 'الوقت', type: 'time' }] },
      { k: 'surah', label: 'السورة', type: 'select', options: [{ v: '', l: 'اختاري السورة' }, ...surahOpts], required: true },
      { type: 'pair', fields: [{ k: 'from_ayah', label: 'من الآية', type: 'number' }, { k: 'to_ayah', label: 'إلى الآية', type: 'number' }] },
      { k: 'part', label: 'الجزء أو الصفحة (اختياري)', placeholder: 'مثال: الجزء 30 أو ص 582' },
      { k: 'teacher', label: 'المعلمة أو من ستسمّعين لها (اختياري)' },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'remind', label: 'التذكير', type: 'seg', options: Object.entries(REMIND).map(([v, l]) => ({ v, l })) },
    ],
    onSubmit: async (v) => { v.surah = Number(v.surah) || null; if (!v.surah) { toast('اختاري السورة', 'err'); return false; } if (row) await update('quran', row.id, v); else { await create('quran', v); toast('أُضيف الموعد 🤍'); } },
    onDelete: row ? () => remove('quran', row.id) : null,
  });
}

/** "تم تسميعه" — document a session (from a scheduled one, or directly). */
export function documentSession(row = null) {
  if (!canWrite()) return toast('التوثيق من حساب روان 🤍', 'err');
  const now = nowLocal(store.me.settings.tz);
  openForm({
    title: 'تم تسميعه 🤍', en: row ? range(row.surah, row.from_ayah, row.to_ayah) : 'توثيق تسميع',
    values: { done_date: row?.done_date || (row && row.date <= today() ? row.date : today()), done_time: row?.done_time || row?.time || now.slice(11, 16), done_surah: row?.done_surah || row?.surah || '', done_from: row?.done_from ?? row?.from_ayah, done_to: row?.done_to ?? row?.to_ayah, status: row && row.status !== 'scheduled' ? row.status : 'done', rating: row?.rating || 0, review_notes: row?.review_notes, done_notes: row?.done_notes },
    fields: [
      { type: 'pair', fields: [{ k: 'done_date', label: 'التاريخ الفعلي', type: 'date', required: true }, { k: 'done_time', label: 'الوقت', type: 'time' }] },
      { k: 'done_surah', label: 'السورة', type: 'select', options: [{ v: '', l: 'اختاري السورة' }, ...surahOpts], required: true },
      { type: 'pair', fields: [{ k: 'done_from', label: 'من الآية', type: 'number' }, { k: 'done_to', label: 'إلى الآية', type: 'number' }] },
      { k: 'status', label: 'هل تم التسميع؟', type: 'seg', options: [{ v: 'done', l: 'كاملًا ✓' }, { v: 'partial', l: 'جزئيًا' }, { v: 'missed', l: 'لم يتم' }] },
      { k: 'rating', label: 'التقييم (اختياري)', type: 'stars' },
      { k: 'review_notes', label: 'ملاحظات حول الحفظ أو المراجعة', type: 'textarea', rows: 2, placeholder: 'مواضع تحتاج مراجعة، أخطاء متكررة…' },
      { k: 'done_notes', label: 'ملاحظات أخرى', type: 'textarea', rows: 2 },
    ],
    submit: 'حفظ في السجل',
    onSubmit: async (v) => {
      v.done_surah = Number(v.done_surah) || null; if (!v.done_surah) { toast('اختاري السورة', 'err'); return false; }
      if (row) await update('quran', row.id, v);
      else await create('quran', { ...v, date: v.done_date, time: v.done_time, surah: v.done_surah, from_ayah: v.done_from, to_ayah: v.done_to });
      toast(v.status === 'missed' ? 'حُفظ — لعلّ الموعد القادم أيسر 🤍' : 'ما شاء الله، بارك الله في حفظك 🤍');
    },
  });
}

function details(r) {
  const done = r.status !== 'scheduled';
  openSheet({
    title: done ? range(r.done_surah || r.surah, r.done_from ?? r.from_ayah, r.done_to ?? r.to_ayah) : range(r.surah, r.from_ayah, r.to_ayah), en: done ? `سجل التسميع · ${STATUS[r.status]}` : 'موعد تسميع',
    body: `<dl class="kv">
      <dt>الموعد</dt><dd>${fmtGreg(r.date, { weekday: true })}${r.time ? ' · ' + fmtTime(r.time) : ''}<div class="tiny muted">${fmtHijri(r.date)}</div></dd>
      ${r.part ? `<dt>الجزء / الصفحة</dt><dd>${esc(r.part)}</dd>` : ''}${r.teacher ? `<dt>المعلمة</dt><dd>${esc(r.teacher)}</dd>` : ''}
      ${done ? `<dt>التسميع الفعلي</dt><dd>${r.done_date ? fmtGreg(r.done_date, { weekday: true }) : ''}${r.done_time ? ' · ' + fmtTime(r.done_time) : ''}</dd>
        <dt>ما تم تسميعه</dt><dd>${range(r.done_surah || r.surah, r.done_from ?? r.from_ayah, r.done_to ?? r.to_ayah)}${ayahCount(r) ? ` <span class="muted">(${ayahCount(r)} آية)</span>` : ''}</dd>
        <dt>الحالة</dt><dd>${STATUS[r.status]}</dd>${r.rating ? `<dt>التقييم</dt><dd style="color:var(--warn)">${'★'.repeat(r.rating)}</dd>` : ''}
        ${r.review_notes ? `<dt>الحفظ والمراجعة</dt><dd>${esc(r.review_notes)}</dd>` : ''}${r.done_notes ? `<dt>ملاحظات</dt><dd>${esc(r.done_notes)}</dd>` : ''}`
        : `<dt>التذكير</dt><dd>${REMIND[r.remind || '']}</dd>`}
      ${r.notes ? `<dt>ملاحظات الموعد</dt><dd>${esc(r.notes)}</dd>` : ''}</dl>`,
    foot: canWrite() ? `${done ? '' : `<button class="btn" data-doc>${icon('check', 'sm')} تم تسميعه</button>`}<button class="btn ${done ? '' : 'ghost'}" data-edit>${icon('edit', 'sm')} تعديل</button>` : '',
    onMount: (sh, close) => {
      sh.querySelector('[data-doc]')?.addEventListener('click', () => { close(); setTimeout(() => documentSession(r), 240); });
      sh.querySelector('[data-edit]')?.addEventListener('click', () => { close(); setTimeout(() => (done ? documentSession(r) : editSession(r)), 240); });
    },
  });
}

const rowHtml = (r) => {
  const done = r.status !== 'scheduled';
  const s = done ? (r.done_surah || r.surah) : r.surah, a = done ? (r.done_from ?? r.from_ayah) : r.from_ayah, b = done ? (r.done_to ?? r.to_ayah) : r.to_ayah;
  return `<div class="item" data-open="${r.id}" style="cursor:pointer"><span class="ic-box q-ic">${done ? (r.status === 'missed' ? '·' : '✓') : icon('clock', 'sm')}</span>
    <div class="grow" style="min-width:0"><div class="title ellipsis">${esc(surahName(s))}${a ? ` <span class="muted small">${a}${b ? '–' + b : ''}</span>` : ''}</div>
    <div class="sub">${fmtGreg(done && r.done_date ? r.done_date : r.date, { weekday: true, year: false })}${(done ? r.done_time : r.time) ? ' · ' + fmtTime(done ? r.done_time : r.time) : ''}${r.teacher ? ' · ' + esc(r.teacher) : ''}${(r.review_notes || r.notes) ? ' · ' + esc((r.review_notes || r.notes).slice(0, 40)) : ''}</div></div>
    <span class="badge ${TONE[r.status]}">${STATUS[r.status]}</span></div>`;
};

export default {
  render(el) {
    const t = today(), rows = all('quran');
    const upcoming = rows.filter((r) => r.status === 'scheduled').sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const next = upcoming.find((r) => r.date >= t) || upcoming[0] || null;
    const log = rows.filter((r) => r.status !== 'scheduled').sort((a, b) => ((b.done_date || b.date) + (b.done_time || '')).localeCompare((a.done_date || a.date) + (a.done_time || '')));
    const doneN = log.filter((r) => r.status === 'done').length, ayat = log.filter((r) => r.status !== 'missed').reduce((s, r) => s + ayahCount(r), 0);
    const o = owner();
    let body = '';
    if (st.tab === 'up') body = upcoming.length ? `<div class="card">${upcoming.map(rowHtml).join('')}</div>` : empty('لا مواعيد قادمة', canWrite() ? 'أضيفي موعد التسميع القادم' : `لم تُضف ${esc(o?.name || 'روان')} مواعيد بعد`);
    else if (st.tab === 'log') {
      const q = st.q.trim();
      const list = q ? log.filter((r) => [surahName(r.done_surah || r.surah), r.review_notes, r.done_notes, r.notes, r.teacher, r.done_date, r.date].some((x) => String(x || '').includes(q))) : log;
      let cur = '', html = '';
      for (const r of list) { const k = monthKey(r.done_date || r.date); if (k !== cur) { cur = k; html += `${html ? '</div>' : ''}<div class="tl-month">${GREG_MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}</div><div class="card">`; } html += rowHtml(r); }
      body = `<input class="input" id="qq" placeholder="ابحثي باسم السورة أو الملاحظات أو التاريخ…" value="${esc(st.q)}" autocomplete="off" style="margin-bottom:6px">${list.length ? html + '</div>' : empty('السجل فارغ', q ? 'لا نتائج للبحث' : 'بعد كل تسميع اضغطي «تم تسميعه» ليُحفظ هنا')}`;
    } else {
      if (!st.month) st.month = monthKey(t);
      const [y, m] = st.month.split('-').map(Number), first = iso(y, m, 1), ws = store.me.settings.week_start ?? 6, off = (weekday(first) - ws + 7) % 7;
      let grid = ''; for (let i = 0; i < 7; i++) grid += `<div class="wd">${WEEKDAYS_SHORT[(ws + i) % 7]}</div>`;
      for (let i = 0; i < off; i++) grid += '<div></div>';
      for (let d = 1; d <= daysInMonth(y, m); d++) { const ds = iso(y, m, d); const its = rows.filter((r) => (r.status === 'scheduled' ? r.date : (r.done_date || r.date)) === ds); grid += `<button class="cal-day ${ds === t ? 'today' : ''} ${ds === st.sel ? 'sel' : ''}" data-day="${ds}"><span class="g num">${d}</span><span class="dots">${its.slice(0, 3).map((r) => `<i class="q-dot ${r.status}"></i>`).join('')}</span></button>`; }
      const dayRows = st.sel ? rows.filter((r) => (r.status === 'scheduled' ? r.date : (r.done_date || r.date)) === st.sel) : [];
      body = `<div class="card" style="padding:12px"><div class="cal-head"><button class="icon-btn plain" data-m="-1">${icon('chevR')}</button><div class="t"><b>${GREG_MONTHS[m - 1]} ${y}</b></div><button class="icon-btn plain" data-m="1">${icon('chevL')}</button></div><div class="cal-grid">${grid}</div>
        <div class="legend"><span><i class="q-dot scheduled"></i>موعد</span><span><i class="q-dot done"></i>تم</span><span><i class="q-dot partial"></i>جزئي</span></div></div>
        ${st.sel ? `<div class="section-title"><h2>${fmtGreg(st.sel, { weekday: true, year: false })}</h2>${canWrite() ? `<button class="link" style="border:0;background:none;cursor:pointer" data-addon="${st.sel}">+ موعد</button>` : ''}</div>${dayRows.length ? `<div class="card">${dayRows.map(rowHtml).join('')}</div>` : '<div class="card soft small muted center">لا يوجد تسميع في هذا اليوم</div>'}` : ''}`;
    }
    const cd = next && countdownText(next);
    el.innerHTML = `<div class="page quran">
      ${pageHead({ en: 'وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا', ar: 'مواعيد تسميع القرآن 🤍', back: '#/more', actions: canWrite() ? `<button class="btn sm" data-new>${icon('plus', 'sm')} موعد</button>` : '' })}
      ${!canWrite() ? `<div class="notice q-note" style="margin-bottom:12px">${icon('eye', 'sm')} تتابع هنا مواعيد وتسميعات ${esc(o?.name || 'روان')} — الإضافة والتعديل من حسابها.</div>` : ''}
      ${next ? `<div class="q-next">
        <div class="row between"><span class="q-kicker">موعد التسميع القادم</span>${canWrite() ? `<button class="icon-btn plain" data-edit-next aria-label="تعديل">${icon('edit', 'sm')}</button>` : ''}</div>
        <div class="q-surah">${esc(surahName(next.surah))}</div>
        <div class="q-ayat">${next.from_ayah ? `من الآية ${next.from_ayah}${next.to_ayah ? ` إلى الآية ${next.to_ayah}` : ''}` : 'السورة كاملة'}${next.part ? ` · ${esc(next.part)}` : ''}</div>
        <div class="q-row"><div class="q-count"><b class="num">${cd.big}</b><span>${cd.small}</span></div>
          <div class="grow"><div style="font-weight:500">${fmtGreg(next.date, { weekday: true })}</div><div class="small muted">${fmtHijri(next.date)}${next.time ? ` · ${fmtTime(next.time)}` : ''}</div><div class="small" style="color:var(--ok);margin-top:2px">${cd.line}</div></div></div>
        ${next.teacher ? `<div class="tiny muted" style="margin-top:8px">التسميع لـ ${esc(next.teacher)}</div>` : ''}
        ${canWrite() ? `<button class="btn block q-done" data-doc-next>${icon('check', 'sm')} تم تسميعه</button>` : ''}
      </div>` : canWrite() ? `<button class="q-next q-empty" data-new><span style="font-size:26px">🤍</span><div style="font-weight:600;margin-top:6px">أضيفي موعد التسميع القادم</div><div class="small muted">التاريخ، الوقت، السورة والآيات — وتذكير لطيف قبله</div></button>` : ''}
      ${log.length ? `<div class="stats3" style="margin-top:12px"><div class="stat"><b class="num">${doneN}</b><span>تسميع مكتمل</span></div><div class="stat"><b class="num">${ayat}</b><span>آية سُمّعت</span></div><div class="stat"><b class="num">${new Set(log.filter((r) => r.status !== 'missed').map((r) => r.done_surah || r.surah)).size}</b><span>سورة</span></div></div>` : ''}
      <div class="tabs" style="margin-top:14px"><button data-tab="up" class="${st.tab === 'up' ? 'on' : ''}">القادمة ${upcoming.length ? `· ${upcoming.length}` : ''}</button><button data-tab="log" class="${st.tab === 'log' ? 'on' : ''}">السجل ${log.length ? `· ${log.length}` : ''}</button><button data-tab="cal" class="${st.tab === 'cal' ? 'on' : ''}">التقويم</button></div>
      ${body}
      ${canWrite() ? `<button class="btn soft block" style="margin-top:14px" data-direct>${icon('note', 'sm')} سجّلي تسميعًا تم بدون موعد</button>` : ''}
    </div>`;
    const qq = el.querySelector('#qq');
    if (qq) qq.oninput = () => { st.q = qq.value; clearTimeout(st._t); st._t = setTimeout(() => { this.render(el); const n = el.querySelector('#qq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
    el.onclick = (e) => {
      const q = (s) => e.target.closest(s); let b;
      try {
        if (q('[data-new]')) return editSession();
        if (q('[data-direct]')) return documentSession();
        if (q('[data-edit-next]')) return editSession(next);
        if (q('[data-doc-next]')) return documentSession(next);
        if ((b = q('[data-tab]'))) { st.tab = b.dataset.tab; return this.render(el); }
        if ((b = q('[data-m]'))) { st.month = addMonths(st.month, Number(b.dataset.m)); st.sel = null; return this.render(el); }
        if ((b = q('[data-addon]'))) return editSession(null, { date: b.dataset.addon });
        if ((b = q('[data-day]'))) { st.sel = b.dataset.day; return this.render(el); }
        if ((b = q('[data-open]'))) details(byId('quran', b.dataset.open));
      } catch (err) { toastErr(err); }
    };
  },
};
export { confirmBox, surahAyahs };
