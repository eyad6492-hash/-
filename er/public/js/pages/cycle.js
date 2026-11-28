// Cycle Tracker — private to its owner (server-enforced), optional PIN lock, approximate predictions.
import { get, post, patch, del } from '../api.js';
import { store, today, syncNow } from '../store.js';
import { esc, icon, pageHead, toast, toastErr, confirmBox, openSheet } from '../ui.js';
import { openForm } from '../form.js';
import { addDays, addMonths, daysInMonth, diffDays, fmtGreg, fmtHijri, GREG_MONTHS, iso, monthKey, weekday, WEEKDAYS_SHORT, countdown, daysWord } from '../dates.js';
import { cycleStats } from '../cycle-math.js';
import { L, opts } from '../labels.js';

const st = { entries: null, locked: null, month: null, pin: '' };
const DISCLAIMER = 'التوقعات تقريبية مبنية على سجلك السابق، وليست دقيقة طبيًا ولا تُستخدم كوسيلة لمنع الحمل.';

async function setCycle(patchObj) {
  await patch('/api/me', { settings: { cycle: patchObj } });
  Object.assign(store.me.settings.cycle, patchObj);
  syncNow();
}
async function load() {
  try { const r = await get('/api/c/cycles'); st.entries = r.items; st.locked = false; }
  catch (e) { if (e.code === 'locked') { st.locked = true; st.entries = null; } else throw e; }
}

function editEntry(row, rerender) {
  openForm({
    title: row ? 'تعديل السجل' : 'تسجيل دورة', en: 'Cycle Log',
    values: { start_date: today(), flow: 'medium', pain: 0, symptoms: [], ...(row || {}) },
    fields: [
      { type: 'pair', fields: [{ k: 'start_date', label: 'أول يوم', type: 'date', required: true }, { k: 'end_date', label: 'آخر يوم', type: 'date', hint: 'اتركه فارغًا إن لم تنتهِ بعد' }] },
      { k: 'flow', label: 'الكثافة', type: 'seg', options: opts(L.flow).filter((o) => o.v) },
      { k: 'symptoms', label: 'الأعراض', type: 'multi', options: opts(L.symptoms) },
      { k: 'pain', label: 'مستوى الألم', type: 'range', min: 0, max: 10, labels: ['لا يوجد', '1', '2', '3 خفيف', '4', '5 متوسط', '6', '7', '8 شديد', '9', '10 شديد جدًا'] },
      { k: 'mood', label: 'الحالة المزاجية', placeholder: 'مثال: حساسة قليلًا' },
      { k: 'notes', label: 'ملاحظات / أعراض إضافية', type: 'textarea', rows: 2 },
    ],
    onSubmit: async (v) => {
      if (v.end_date && v.end_date < v.start_date) { toast('آخر يوم قبل أول يوم', 'err'); return false; }
      if (row) await patch(`/api/c/cycles/${row.id}`, v); else await post('/api/c/cycles', v);
      toast('تم الحفظ'); await load(); rerender();
    },
    onDelete: row ? async () => { await del(`/api/c/cycles/${row.id}`); await load(); rerender(); } : null,
  });
}

function settingsSheet(rerender) {
  const c = store.me.settings.cycle;
  const tg = (k, label, hint, on) => `<div class="set-row"><div><div style="font-weight:500">${label}</div><div class="tiny muted">${hint}</div></div><label class="toggle"><input type="checkbox" data-t="${k}" ${on ? 'checked' : ''}><i></i></label></div>`;
  openSheet({
    title: 'خصوصية القسم', en: 'Privacy',
    body: `${tg('show_home', 'إظهار ملخص في الرئيسية', 'لك فقط — لا يظهر للطرف الآخر', c.show_home)}
      ${tg('share', `مشاركة الموعد المتوقع مع ${esc(store.partner?.name || 'الطرف الآخر')}`, 'يرى الموعد التقريبي فقط، بدون أي تفاصيل أو أعراض', c.share === 'prediction')}
      ${tg('fertility', 'عرض فترة الخصوبة التقديرية', 'اختياري — تقدير تقريبي', c.fertility)}
      ${tg('hide', 'إخفاء القسم من قائمة المزيد', 'يبقى متاحًا من الإعدادات ← الخصوصية', c.hide)}
      <div class="divider"></div>
      <div class="set-row"><div><div style="font-weight:500">قفل برمز سري</div><div class="tiny muted">${c.has_pin ? 'مفعّل — يُطلب الرمز عند فتح القسم' : 'غير مفعّل'}</div></div><button class="btn sm soft" data-pin>${c.has_pin ? 'تغيير/إزالة' : 'تفعيل'}</button></div>
      ${c.has_pin ? '<button class="btn ghost block" data-lock style="margin-top:10px">قفل الآن</button>' : ''}
      <div class="divider"></div>
      <button class="btn danger block" data-wipe>حذف كل بيانات الدورة</button>`,
    onMount: (sh, close) => {
      sh.addEventListener('change', async (e) => {
        const k = e.target.dataset.t; if (!k) return;
        try { await setCycle(k === 'share' ? { share: e.target.checked ? 'prediction' : 'none' } : { [k]: e.target.checked }); toast('تم الحفظ'); } catch (err) { toastErr(err); }
      });
      sh.querySelector('[data-pin]').onclick = () => { close(); setTimeout(() => pinSheet(rerender), 240); };
      sh.querySelector('[data-lock]')?.addEventListener('click', async () => { await post('/api/cycle/lock'); st.locked = true; close(); rerender(); });
      sh.querySelector('[data-wipe]').onclick = () => { close(); setTimeout(() => openForm({ title: 'حذف بيانات الدورة', fields: [{ type: 'info', html: 'سيتم حذف كل السجلات نهائيًا ولا يمكن استرجاعها.' }, { k: 'password', label: 'كلمة مرور الحساب', type: 'password', required: true }], submit: 'حذف نهائي', onSubmit: async (v) => { await post('/api/data/wipe', { scope: 'cycle', password: v.password }); toast('تم الحذف'); await load(); rerender(); } }), 240); };
    },
  });
}
function pinSheet(rerender) {
  openForm({
    title: 'الرمز السري للقسم', en: 'PIN Lock',
    fields: [
      { k: 'pin', label: 'الرمز الجديد (4–8 أرقام) — اتركه فارغًا لإزالة القفل', type: 'password', autocomplete: 'off', dir: 'ltr' },
      { k: 'password', label: 'كلمة مرور الحساب للتأكيد', type: 'password', required: true, dir: 'ltr' },
    ],
    onSubmit: async (v) => {
      if (v.pin && !/^\d{4,8}$/.test(v.pin)) { toast('الرمز من 4 إلى 8 أرقام', 'err'); return false; }
      await post('/api/cycle/pin', v); store.me.settings.cycle.has_pin = !!v.pin; toast(v.pin ? 'تم تفعيل القفل' : 'تمت إزالة القفل'); syncNow(); rerender();
    },
  });
}

export default {
  async render(el, _p, { full } = {}) {
    const me = store.me, c = me.settings.cycle, t = today();
    const rerender = () => this.render(el, {}, { full: false });
    const isOwner = me.letter === 'R' || c.enabled;
    if (!isOwner) {
      const pc = store.partner_cycle;
      el.innerHTML = `<div class="page">${pageHead({ en: 'Cycle', ar: `دورة ${store.partner?.name || ''}`, back: '#/more' })}
        ${pc ? `<div class="hero"><span class="en" style="color:var(--rose-ink)">Shared with you</span><div style="font-weight:600;font-size:18px;margin-top:8px">${pc.in_period ? 'في فترة الدورة الآن' : `الموعد المتوقع ${countdown(pc.days_to_next)}`}</div><div class="small" style="color:var(--ink2)">${pc.next ? fmtGreg(pc.next, { weekday: true }) : ''}</div><p class="small" style="margin:12px 0 0">كن لطيفًا ومتفهمًا 🤍</p></div><p class="tiny muted" style="margin-top:12px">${DISCLAIMER}</p>`
          : `<div class="card soft center">${icon('lock', 'lg')}<p>هذا القسم خاص بـ${esc(store.partner?.name || 'الطرف الآخر')}، ولا تُعرض تفاصيله لغيرها.</p></div>`}</div>`;
      return;
    }
    if (!c.enabled) {
      el.innerHTML = `<div class="page">${pageHead({ en: 'Cycle Tracker', ar: 'الدورة الشهرية', back: '#/more' })}
        <div class="hero"><span class="en" style="color:var(--rose-ink);font-size:17px">Just for you</span><h2 style="margin:8px 0 6px;font-size:19px">مساحة خاصة لمتابعة دورتك</h2>
        <p class="small" style="color:var(--ink2);margin:0">سجّلي مواعيدك وأعراضك واحصلي على توقعات تقريبية للدورة القادمة. البيانات خاصة بك فقط — لا يراها ${esc(store.partner?.name || 'أحد')} ولا تدخل في أي تقرير، ويمكنك قفل القسم برمز سري.</p>
        <button class="btn" style="margin-top:14px" data-enable>تفعيل القسم</button></div><p class="tiny muted" style="margin-top:12px">${DISCLAIMER}</p></div>`;
      el.querySelector('[data-enable]').onclick = async () => { try { await setCycle({ enabled: true }); rerender(); } catch (e) { toastErr(e); } };
      return;
    }
    if (full || st.entries === null && !st.locked) { el.innerHTML = '<div class="page"><div class="splash" style="min-height:40vh"><div class="logo" style="font-size:30px">E<i>&amp;</i>R</div></div></div>'; try { await load(); } catch (e) { el.innerHTML = `<div class="page"><div class="empty">${esc(e.message)}</div></div>`; return; } }
    if (st.locked) {
      el.innerHTML = `<div class="page">${pageHead({ en: 'Locked', ar: 'القسم مقفل', back: '#/more' })}
        <div class="center" style="margin-top:30px">${icon('lock', 'lg')}<p class="muted">أدخلي الرمز السري</p><div class="pin-dots" id="dots">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div></div>
        <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div>
        <button class="btn block" data-go>فتح</button></div>`;
      const dots = () => { const n = Math.max(4, st.pin.length); el.querySelector('#dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < st.pin.length ? 'on' : ''}"></i>`).join(''); };
      const tryUnlock = async () => {
        try { await post('/api/cycle/unlock', { pin: st.pin }); st.pin = ''; await load(); rerender(); }
        catch (e) { st.pin = ''; dots(); el.querySelector('#dots').classList.add('shake'); setTimeout(() => el.querySelector('#dots')?.classList.remove('shake'), 450); toastErr(e); }
      };
      el.onclick = (e) => {
        const b = e.target.closest('[data-k]');
        if (b) { const k = b.dataset.k; if (k === '⌫') st.pin = st.pin.slice(0, -1); else if (st.pin.length < 8) st.pin += k; dots(); return; }
        if (e.target.closest('[data-go]') && st.pin.length >= 4) tryUnlock();
      };
      return;
    }

    const entries = st.entries || [];
    const s = cycleStats(entries, t);
    if (!st.month) st.month = monthKey(t);
    const sorted = [...entries].sort((a, b) => b.start_date.localeCompare(a.start_date));
    const open = sorted.find((e) => !e.end_date && diffDays(e.start_date, t) < 15);
    // ring
    const pct = s.dayOfCycle ? Math.min(1, s.dayOfCycle / s.avgCycle) : 0;
    const R = 80, C = 2 * Math.PI * R;
    // calendar marks
    const [y, mo] = st.month.split('-').map(Number);
    const first = iso(y, mo, 1), len = daysInMonth(y, mo);
    const periodDays = new Set();
    for (const e of entries) { const end = e.end_date || (e === open ? t : addDays(e.start_date, s.avgPeriod - 1)); for (let d = e.start_date; d <= end; d = addDays(d, 1)) periodDays.add(d); }
    const predDays = new Set(); const fertDays = new Set();
    if (s.next) {
      for (let k = 0; k < 3; k++) {
        const ns = addDays(s.next, k * s.avgCycle);
        for (let i = 0; i < s.avgPeriod; i++) predDays.add(addDays(ns, i));
        if (c.fertility) { const ov = addDays(ns, -14); for (let i = -5; i <= 1; i++) fertDays.add(addDays(ov, i)); }
      }
    }
    const ws = me.settings.week_start ?? 6; const off = (weekday(first) - ws + 7) % 7;
    let grid = ''; for (let i = 0; i < 7; i++) grid += `<div class="wd">${WEEKDAYS_SHORT[(ws + i) % 7]}</div>`;
    for (let i = 0; i < off; i++) grid += '<div></div>';
    for (let d = 1; d <= len; d++) { const ds = iso(y, mo, d); const cls = periodDays.has(ds) ? 'period' : predDays.has(ds) && ds >= t ? 'pred' : fertDays.has(ds) && ds >= t ? 'fert' : ''; grid += `<div class="cal-day ${cls} ${ds === t ? 'today' : ''}"><span class="g num">${d}</span></div>`; }

    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'Cycle Tracker', ar: 'الدورة الشهرية', back: '#/more', actions: `<button class="icon-btn" data-settings aria-label="الخصوصية">${icon('shield')}</button>` })}
      <div class="card center">
        <div class="ring"><svg viewBox="0 0 190 190"><circle cx="95" cy="95" r="${R}" stroke="var(--field)" stroke-width="12" fill="none"/><circle cx="95" cy="95" r="${R}" stroke="#C77A8A" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
          <div class="c">${s.last ? (s.inPeriod ? `<span class="small muted">اليوم</span><b class="num">${diffDays(s.last.start_date, t) + 1}</b><span class="small">من الدورة</span>` : `<span class="small muted">الدورة القادمة</span><b class="num">${s.daysToNext}</b><span class="small">${s.daysToNext === 1 ? 'يوم' : s.daysToNext <= 10 ? 'أيام' : 'يومًا'} تقريبًا</span>`) : '<span class="small muted">ابدئي بتسجيل<br>أول دورة</span>'}</div></div>
        ${s.next ? `<div class="small">الموعد المتوقع: <b>${fmtGreg(s.next, { weekday: true })}</b></div><div class="tiny muted">${fmtHijri(s.next)}</div>` : ''}
        ${c.fertility && s.fertileFrom ? `<div class="small" style="margin-top:6px">فترة الخصوبة التقديرية: ${fmtGreg(s.fertileFrom, { year: false })} – ${fmtGreg(s.fertileTo, { year: false })}</div>` : ''}
        <div class="row" style="justify-content:center;margin-top:14px;gap:8px">${open ? `<button class="btn rose" data-end="${open.id}">انتهت اليوم</button>` : '<button class="btn rose" data-start>بدأت اليوم</button>'}<button class="btn soft" data-new>${icon('plus', 'sm')} تسجيل</button></div>
      </div>
      <div class="stats3" style="margin-top:12px"><div class="stat"><b class="num">${s.avgCycle}</b><span>متوسط طول الدورة</span></div><div class="stat"><b class="num">${s.avgPeriod}</b><span>متوسط المدة</span></div><div class="stat"><b class="num">${s.count}</b><span>دورات مسجلة</span></div></div>
      ${s.last ? `<div class="card" style="margin-top:12px"><div class="card-head"><h3>آخر دورة</h3><span class="en">Last cycle</span></div><dl class="kv"><dt>البداية</dt><dd>${fmtGreg(s.last.start_date, { weekday: true })}</dd><dt>النهاية</dt><dd>${s.last.end_date ? fmtGreg(s.last.end_date, { weekday: true }) : 'لم تُسجَّل بعد'}</dd>${s.last.end_date ? `<dt>المدة</dt><dd>${daysWord(diffDays(s.last.start_date, s.last.end_date) + 1)}</dd>` : ''}</dl></div>` : ''}
      <div class="section-title"><h2>تقويم الدورة</h2><span class="en">Calendar</span></div>
      <div class="card ccal" style="padding:12px"><div class="cal-head"><button class="icon-btn plain" data-m="-1">${icon('chevR')}</button><div class="t"><b>${GREG_MONTHS[mo - 1]} ${y}</b></div><button class="icon-btn plain" data-m="1">${icon('chevL')}</button></div><div class="cal-grid">${grid}</div>
      <div class="legend"><span><i style="background:#C77A8A"></i>الدورة</span><span><i style="background:color-mix(in srgb,#C77A8A 22%,transparent)"></i>متوقعة</span>${c.fertility ? '<span><i style="background:var(--sage-soft)"></i>خصوبة تقديرية</span>' : ''}</div></div>
      <div class="section-title"><h2>السجل</h2><span class="en">History</span></div>
      <div class="card">${sorted.length ? sorted.map((e, i) => { const next = sorted[i - 1]; const L2 = next ? diffDays(e.start_date, next.start_date) : null; return `<div class="item" data-open="${e.id}" style="cursor:pointer"><span class="ic-box rose">${icon('drop')}</span><div class="grow"><div class="title">${fmtGreg(e.start_date)}${e.end_date ? ' – ' + fmtGreg(e.end_date, { year: false }) : ''}</div><div class="sub">${e.end_date ? daysWord(diffDays(e.start_date, e.end_date) + 1) : 'جارية'}${L2 ? ` · طول الدورة ${L2} يومًا` : ''}${e.pain ? ` · الألم ${e.pain}/10` : ''}${(e.symptoms || []).length ? ' · ' + e.symptoms.map((x) => L.symptoms[x]).filter(Boolean).join('، ') : ''}</div></div></div>`; }).join('') : '<div class="small muted">لا توجد سجلات بعد</div>'}</div>
      <p class="tiny muted" style="margin-top:14px">${icon('shield', 'sm')} ${DISCLAIMER} هذه البيانات خاصة بك ولا تُشارك مع أي جهة.</p>
    </div>`;
    el.onclick = async (e) => {
      const q = (x) => e.target.closest(x); let b;
      try {
        if (q('[data-settings]')) return settingsSheet(rerender);
        if (q('[data-new]')) return editEntry(null, rerender);
        if (q('[data-start]')) { await post('/api/c/cycles', { start_date: t, flow: 'medium' }); toast('تم تسجيل بداية الدورة'); await load(); return rerender(); }
        if ((b = q('[data-end]'))) { await patch(`/api/c/cycles/${b.dataset.end}`, { end_date: t }); toast('تم تسجيل نهاية الدورة'); await load(); return rerender(); }
        if ((b = q('[data-m]'))) { st.month = addMonths(st.month, Number(b.dataset.m)); return rerender(); }
        if ((b = q('[data-open]'))) return editEntry(entries.find((x) => x.id === b.dataset.open), rerender);
      } catch (err) { if (err.code === 'locked') { st.locked = true; rerender(); } toastErr(err); }
    };
  },
};
