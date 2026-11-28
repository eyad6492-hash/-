// أعياد ميلادنا ❤️🎂 — each person sees the OTHER person's birthday: countdown, age, both calendars,
// messages that change as the day approaches, a quiet celebration on the day, and a hidden letter
// that unlocks only on the reader's own birthday. Admin panel: #/birthday/admin
import { get, put, patch, del, post } from '../api.js';
import { store, today, syncNow } from '../store.js';
import { esc, icon, pageHead, openSheet, toast, toastErr, confirmBox } from '../ui.js';
import { openForm } from '../form.js';
import { fmtGreg, fmtHijri, toHijri, fromHijri, HIJRI_MONTHS, WEEKDAYS, weekday } from '../dates.js';
import { birthdaysOf, cfgOf, nextBirthday, exactAge, pickMessage, hijriParts, hijriMatches } from '../bday.js';

let letters = null, loading = null;
function loadLetters(force = false) {
  if (!force && (letters || loading)) return loading || Promise.resolve(letters);
  loading = get('/api/bday').then((r) => { letters = { mine: r.mine, for_me: r.for_me }; loading = null; return letters; }).catch(() => { loading = null; letters = letters || { mine: null, for_me: null }; return letters; });
  return loading;
}

/** The other person: name + letter (works even before the partner joins). */
function other() {
  const me = store.me, p = store.partner;
  const L = me.letter === 'E' ? 'R' : 'E';
  return { name: p?.name || (L === 'R' ? 'روان' : 'إياد'), letter: L, fem: L === 'R' };
}
const pl = (n, f) => (n === 1 ? f[0] : n === 2 ? f[1] : n >= 3 && n <= 10 ? `${n} ${f[2]}` : `${n} ${f[3]}`);
const daysLeftText = (n) => (n === 0 ? 'اليوم عيد الميلاد ❤️🎂' : `باقي ${pl(n, ['يوم واحد', 'يومان', 'أيام', 'يومًا'])}`);
const yearsText = (n) => pl(n, ['سنة واحدة', 'سنتان', 'سنوات', 'سنة']);
const hijriText = (p) => `${p.d} ${HIJRI_MONTHS[p.m - 1]} ${p.y}هـ`;

function model() {
  const o = other(), t = today();
  const bd = birthdaysOf(store.space)[o.letter];
  const cfg = cfgOf(store.space);
  const nb = nextBirthday(bd.greg, t);
  const age = exactAge(bd.greg, t);
  const msg = pickMessage(cfg, bd.greg, t);
  return { o, bd, nb, age, msg, isToday: nb.days === 0, h: toHijri(nb.date), wd: WEEKDAYS[weekday(nb.date)] };
}
const confetti = () => `<div class="bd-confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 6) * 0.45}s;--r:${(i * 53) % 360}deg;--c:${['var(--rose)', '#E8C9A0', 'var(--sage)', '#F2D7D2', 'var(--brown)'][i % 5]}"></i>`).join('')}${['✦', '✧', '✦', '✧'].map((s, i) => `<b style="--x:${12 + i * 24}%;--d:${i * 0.6}s">${s}</b>`).join('')}</div>`;

function letterButton(compact) {
  const f = letters?.for_me;
  if (!f?.exists) return '';
  return f.unlocked
    ? `<button class="btn rose ${compact ? 'sm' : 'block'} bd-letter-btn" data-letter>${icon('note', 'sm')} رسالة خاصة لك ❤️${f.opened_at ? '' : ' <span class="bd-new">جديدة</span>'}</button>`
    : `<button class="btn ghost ${compact ? 'sm' : 'block'} bd-letter-btn" data-letter-locked>${icon('lock', 'sm')} رسالتك الخاصة تنتظرك في يوم ميلادك ❤️</button>`;
}

/** Birthday card (used on the home page and at the top of the birthday page). */
export function birthdayCard({ compact = true } = {}) {
  if (!store.me) return '';
  if (!letters) loadLetters().then(() => window.dispatchEvent(new Event('er:rerender')));
  const m = model();
  const { o, nb, age } = m;
  return `<div class="bd-card ${m.isToday ? 'party' : ''} ${compact ? 'compact tap' : ''}" data-bd-card>
    ${m.isToday ? confetti() : ''}
    <div class="bd-head"><div><div class="bd-kicker">أعياد ميلادنا</div><div class="bd-title">${m.isToday ? `كل عام و${esc(o.name)} بخير` : `يوم ميلاد ${esc(o.name)}`} <span>🎂</span></div></div>
      ${compact ? `<a class="icon-btn plain" href="#/birthday" aria-label="التفاصيل">${icon('chevL', 'sm')}</a>` : ''}</div>
    <p class="bd-msg">${esc(m.msg.text)}</p>
    ${m.isToday
      ? `<div class="bd-today"><div class="bd-age-new num">${nb.age}</div><div>${o.fem ? 'أكملت' : 'أكمل'} ${esc(o.name)} ${o.fem ? 'عامها' : 'عامه'} الـ${nb.age} اليوم ❤️</div></div>`
      : `<div class="bd-count"><b class="num">${nb.days}</b><span>${esc(daysLeftText(nb.days))}</span><em>على يوم ميلاد${o.fem ? 'ها' : 'ه'} ${o.fem ? 'القادم' : 'القادم'}</em></div>`}
    <div class="bd-age"><span>العمر الآن <b class="num">${yearsText(age.y)}</b></span>${m.isToday ? '' : `<span class="bd-next">${o.fem ? 'تكمل' : 'يكمل'} <b class="num">${nb.age}</b> في يوم ${m.wd}</span>`}</div>
    <div class="bd-boxes">
      <div class="bd-box"><span>التاريخ الميلادي</span><b>${fmtGreg(nb.date, { weekday: true })}</b></div>
      <div class="bd-box"><span>التاريخ الهجري</span><b>${hijriText(m.h)}</b></div>
    </div>
    <div class="bd-actions">${letterButton(true)}${compact ? '' : ''}</div>
  </div>`;
}

export function openLetterLocked() {
  toast('رسالتك الخاصة تنتظرك في يوم ميلادك ❤️');
}
export async function openLetter() {
  try {
    const l = await post('/api/bday/letter/open');
    if (letters?.for_me) letters.for_me.opened_at = letters.for_me.opened_at || new Date().toISOString();
    const paras = String(l.body).split(/\n{2,}|\n/).filter((x) => x.trim());
    openSheet({
      title: l.title || 'رسالة خاصة لك ❤️', en: `من ${l.from}`,
      body: `<div class="bd-paper">${paras.map((p, i) => `<p style="animation-delay:${0.25 + i * 0.35}s">${esc(p)}</p>`).join('')}<div class="bd-sign" style="animation-delay:${0.4 + paras.length * 0.35}s">— ${esc(l.from)} ❤️</div></div>`,
    });
  } catch (e) { toastErr(e); }
}

export function bindCard(el) {
  el.querySelectorAll('[data-bd-card].compact').forEach((c) => { c.onclick = (e) => { if (!e.target.closest('button,a')) location.hash = '#/birthday'; }; });
  el.querySelectorAll('[data-letter]').forEach((b) => { b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openLetter(); }; });
  el.querySelectorAll('[data-letter-locked]').forEach((b) => { b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openLetterLocked(); }; });
}

// ======================= admin panel =======================
async function saveCfg(patchObj) { await patch('/api/bday/config', patchObj); await syncNow(); }

function editBirthdays() {
  const b = birthdaysOf(store.space);
  const hj = (L) => (b[L].hijri || '').replace(/-/g, '/');
  openForm({
    title: 'تواريخ الميلاد', en: 'أعياد ميلادنا',
    values: { eg: b.E.greg, eh: hj('E'), rg: b.R.greg, rh: hj('R') },
    fields: [
      { type: 'info', html: 'التاريخ الميلادي هو المعتمد لحساب العمر والعد التنازلي، والهجري الأصلي يُحفظ كما هو. صيغة الهجري: سنة/شهر/يوم' },
      { type: 'pair', fields: [{ k: 'eg', label: 'إياد — الميلادي', type: 'date', required: true }, { k: 'eh', label: 'إياد — الهجري', placeholder: '1423/07/29', dir: 'ltr', required: true }] },
      { type: 'pair', fields: [{ k: 'rg', label: 'روان — الميلادي', type: 'date', required: true }, { k: 'rh', label: 'روان — الهجري', placeholder: '1425/01/07', dir: 'ltr', required: true }] },
    ],
    onSubmit: async (v) => {
      const norm = (h) => { const m = String(h).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null; };
      const eh = norm(v.eh), rh = norm(v.rh);
      if (!eh || !rh) { toast('صيغة التاريخ الهجري: سنة/شهر/يوم', 'err'); return false; }
      await saveCfg({ birthdays: { E: { greg: v.eg, hijri: eh }, R: { greg: v.rg, hijri: rh } } });
      toast('تم حفظ تواريخ الميلاد');
    },
  });
}
function editRule(i) {
  const cfg = cfgOf(store.space);
  const rules = [...cfg.rules];
  const r = i === null ? { from: 0, to: null, text: '' } : rules[i];
  openForm({
    title: i === null ? 'رسالة جديدة' : 'تعديل الرسالة', en: 'رسائل العد التنازلي',
    values: { from: r.from, to: r.to ?? '', text: r.text },
    fields: [
      { type: 'pair', fields: [{ k: 'from', label: 'من (يوم متبقٍ)', type: 'number', required: true }, { k: 'to', label: 'إلى (فارغ = بلا حد)', type: 'number' }] },
      { k: 'text', label: 'نص الرسالة', type: 'textarea', rows: 3, required: true },
      { type: 'info', html: 'تظهر الرسالة عندما يكون عدد الأيام المتبقية داخل هذا النطاق. إن تداخلت نطاقات تظهر الأدق (الأضيق).' },
    ],
    onSubmit: async (v) => {
      const nr = { from: Number(v.from), to: v.to === null || v.to === '' ? null : Number(v.to), text: v.text };
      if (i === null) rules.push(nr); else rules[i] = nr;
      await saveCfg({ cfg: { rules } }); toast('تم الحفظ');
    },
    onDelete: i === null ? null : async () => { rules.splice(i, 1); await saveCfg({ cfg: { rules } }); },
  });
}
function editTexts() {
  const c = cfgOf(store.space);
  openForm({
    title: 'رسائل الاحتفال', en: 'أعياد ميلادنا',
    values: { today_text: c.today_text, after_text: c.after_text, after_days: c.after_days },
    fields: [
      { k: 'today_text', label: 'رسالة يوم الميلاد (البطاقة الاحتفالية)', type: 'textarea', rows: 3, required: true },
      { k: 'after_text', label: 'رسالة بعد انتهاء يوم الميلاد', type: 'textarea', rows: 2, required: true },
      { k: 'after_days', label: 'كم يومًا تظهر رسالة ما بعد الميلاد؟', type: 'number' },
    ],
    onSubmit: async (v) => { await saveCfg({ cfg: v }); toast('تم الحفظ'); },
  });
}
function editMyLetter() {
  const o = other(), mine = letters?.mine;
  openForm({
    title: `رسالة خاصة لـ${o.name} ❤️`, en: 'رسالة مخفية',
    values: { title: mine?.title || '', body: mine?.body || '' },
    fields: [
      { type: 'info', html: `تبقى الرسالة مقفلة ولا يستطيع ${esc(o.name)} قراءتها أو تعديلها، وتُفتح ${o.fem ? 'لها' : 'له'} تلقائيًا في يوم ميلاد${o.fem ? 'ها' : 'ه'}.` },
      { k: 'title', label: 'عنوان (اختياري)', placeholder: 'مثال: إلى أجمل أيامي' },
      { k: 'body', label: 'الرسالة', type: 'textarea', rows: 10, required: true, placeholder: 'اكتب من قلبك…' },
    ],
    submit: 'حفظ الرسالة',
    onSubmit: async (v) => { const r = await put('/api/bday/letter', v); await loadLetters(true); toast(`حُفظت — تُفتح يوم ${fmtGreg(r.unlock_date, { weekday: true })} 🔒`); rerender?.(); },
    onDelete: mine ? async () => { await del('/api/bday/letter'); await loadLetters(true); rerender?.(); } : null,
  });
}
let rerender = null;

function adminHtml() {
  const b = birthdaysOf(store.space), c = cfgOf(store.space), o = other(), mine = letters?.mine;
  const person = (L, name) => { const h = hijriParts(b[L].hijri); const ok = hijriMatches(b[L].greg, b[L].hijri); return `<div class="set-row"><div><div style="font-weight:500">${name}</div><div class="small muted">${fmtGreg(b[L].greg)} · ${h ? hijriText(h) : '—'}</div>${ok ? '' : '<div class="tiny" style="color:var(--warn)">التاريخ الهجري المسجل يختلف يومًا عن تقويم أم القرى — يُحفظ كما أدخلته</div>'}</div></div>`; };
  const sorted = c.rules.map((r, i) => ({ ...r, i })).sort((x, y) => y.from - x.from);
  return `<div class="page">${pageHead({ en: 'لوحة التحكم', ar: 'إدارة أعياد الميلاد', back: '#/birthday' })}
    <div class="section-title"><h2>تواريخ الميلاد</h2><button class="link" style="border:0;background:none;cursor:pointer" data-a="dates">تعديل</button></div>
    <div class="card">${person('E', 'إياد')}${person('R', 'روان')}</div>
    <div class="section-title"><h2>رسالتي الخاصة لـ${esc(o.name)}</h2><span class="en">مخفية حتى يوم ميلاد${o.fem ? 'ها' : 'ه'}</span></div>
    <div class="card">${mine ? `<div style="font-weight:500">${esc(mine.title || 'رسالة بدون عنوان')}</div><div class="small muted" style="margin-top:4px">${mine.opened_at ? `${o.fem ? 'فتحتها' : 'فتحها'} ${esc(o.name)} ❤️` : `🔒 تُفتح تلقائيًا ${fmtGreg(mine.unlock_date, { weekday: true })}`}</div><div class="small" style="margin-top:8px;color:var(--ink2);white-space:pre-wrap">${esc(mine.body.slice(0, 160))}${mine.body.length > 160 ? '…' : ''}</div>`
      : `<div class="small muted">لم تكتب رسالة بعد — اكتب شيئًا ${o.fem ? 'تقرؤه' : 'يقرؤه'} ${esc(o.name)} في يوم ميلاد${o.fem ? 'ها' : 'ه'} فقط.</div>`}
      <button class="btn ${mine ? 'soft' : 'rose'} block sm" style="margin-top:12px" data-a="letter">${icon('edit', 'sm')} ${mine ? 'تعديل الرسالة' : 'اكتب الرسالة'}</button>
      <div class="tiny muted" style="margin-top:8px">كل شخص يكتب رسالته للطرف الآخر من حسابه، ولا يستطيع المستلم رؤيتها قبل يوم ميلاده أو تعديلها أبدًا.</div></div>
    <div class="section-title"><h2>رسائل العد التنازلي</h2><button class="link" style="border:0;background:none;cursor:pointer" data-a="addrule">+ رسالة</button></div>
    <div class="card">${sorted.map((r) => `<div class="item" data-rule="${r.i}" style="cursor:pointer"><span class="badge rose num" style="min-width:74px;justify-content:center">${r.to === null ? `${r.from}+ يوم` : r.from === r.to ? `${r.from} ${r.from === 1 ? 'يوم' : 'أيام'}` : `${r.from}–${r.to}`}</span><div class="grow small" style="min-width:0">${esc(r.text)}</div>${icon('edit', 'sm')}</div>`).join('')}</div>
    <div class="section-title"><h2>رسائل الاحتفال</h2><button class="link" style="border:0;background:none;cursor:pointer" data-a="texts">تعديل</button></div>
    <div class="card"><div class="tiny muted">يوم الميلاد</div><div class="small" style="margin-bottom:10px">${esc(c.today_text)}</div><div class="tiny muted">بعد انتهاء اليوم (${c.after_days} ${c.after_days === 1 ? 'يوم' : 'أيام'})</div><div class="small">${esc(c.after_text)}</div></div>
    <button class="btn ghost block sm" style="margin-top:14px" data-a="reset">استعادة الرسائل الافتراضية</button>
  </div>`;
}

export default {
  async render(el, params, { full } = {}) {
    if (full || !letters) await loadLetters(full);
    rerender = () => this.render(el, params, {});
    if (params.sub === 'admin') {
      el.innerHTML = adminHtml();
      el.onclick = async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a, rr = e.target.closest('[data-rule]');
        try {
          if (rr) return editRule(Number(rr.dataset.rule));
          if (a === 'dates') return editBirthdays();
          if (a === 'letter') return editMyLetter();
          if (a === 'addrule') return editRule(null);
          if (a === 'texts') return editTexts();
          if (a === 'reset' && await confirmBox('استعادة رسائل العد التنازلي والاحتفال الافتراضية؟', { ok: 'استعادة', danger: false })) { await saveCfg({ cfg: { rules: [], today_text: '', after_text: '', after_days: 3 } }); toast('تمت الاستعادة'); }
        } catch (err) { toastErr(err); }
      };
      return;
    }
    const m = model(), o = m.o, bd = m.bd, oh = hijriParts(bd.hijri);
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'أعياد ميلادنا ❤️🎂', ar: `يوم ميلاد ${o.name}`, back: '#/', actions: `<a class="icon-btn" href="#/birthday/admin" aria-label="الإدارة">${icon('settings')}</a>` })}
      ${birthdayCard({ compact: false })}
      <div class="section-title"><h2>عمر${o.fem ? 'ها' : 'ه'} بالتفصيل</h2></div>
      <div class="since-grid" style="margin-top:0"><div class="since-cell"><b class="num">${m.age.y}</b><span>${m.age.y === 1 ? 'سنة' : m.age.y === 2 ? 'سنتان' : m.age.y <= 10 ? 'سنوات' : 'سنة'}</span></div><div class="since-cell"><b class="num">${m.age.m}</b><span>${m.age.m === 1 ? 'شهر' : m.age.m === 2 ? 'شهران' : m.age.m <= 10 ? 'أشهر' : 'شهرًا'}</span></div><div class="since-cell"><b class="num">${m.age.d}</b><span>${m.age.d === 1 ? 'يوم' : m.age.d === 2 ? 'يومان' : m.age.d <= 10 ? 'أيام' : 'يومًا'}</span></div></div>
      <div class="small muted center" style="margin-top:8px">أي ما يقارب <span class="num">${m.age.totalDays.toLocaleString('en-US')}</span> يومًا من الحياة الجميلة</div>
      <div class="section-title"><h2>يوم الميلاد الأصلي</h2></div>
      <div class="bd-boxes"><div class="bd-box"><span>الميلادي</span><b>${fmtGreg(bd.greg, { weekday: true })}</b></div><div class="bd-box"><span>الهجري</span><b>${oh ? hijriText(oh) : '—'}</b></div></div>
      <a class="btn soft block" style="margin-top:16px" href="#/birthday/admin">${icon('note', 'sm')} اكتب رسالة خاصة لـ${esc(o.name)} أو عدّل الرسائل</a>
    </div>`;
    bindCard(el);
  },
};
export { fromHijri };
