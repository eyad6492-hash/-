// Our Monthly Plan — one board per month, with previous months always reachable.
import { all, today, update, pref } from '../store.js';
import { esc, icon, avatar, empty, toastErr, pageHead, img } from '../ui.js';
import { addMonths, monthKey, GREG_MONTHS, GREG_MONTHS_EN, fmtDate, toHijri, HIJRI_MONTHS, countdown, diffDays } from '../dates.js';
import { L } from '../labels.js';
import { editPlan } from '../editors.js';

const ORDER = ['in_progress', 'not_started', 'postponed', 'completed'];
const NEXT = { not_started: 'in_progress', in_progress: 'completed', completed: 'not_started', postponed: 'in_progress' };
const tone = { not_started: '', in_progress: 'rose', completed: 'ok', postponed: 'warn' };
const mName = (k) => `${GREG_MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;

export default {
  render(el, params) {
    const t = today();
    const mk = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : monthKey(t);
    const plans = all('plans').filter((p) => p.month === mk);
    const done = plans.filter((p) => p.status === 'completed').length;
    const h1 = toHijri(`${mk}-01`), h2 = toHijri(`${mk}-28`);
    const months = [...new Set(all('plans').map((p) => p.month))].sort().reverse();
    const groups = ORDER.map((s) => [s, plans.filter((p) => (p.status || 'not_started') === s)]).filter(([, l]) => l.length);
    const card = (p) => `<div class="task" data-open="${p.id}" style="cursor:pointer">
      ${p.image_id ? img(p.image_id, 'thumb') : `<span class="ic-box ${p.priority === 'high' ? 'rose' : ''}">${icon('flag')}</span>`}
      <div class="grow" style="min-width:0"><div style="font-weight:500" class="${p.status === 'completed' ? 'done-text' : ''}">${esc(p.title)}</div>
        <div class="meta">${p.date ? `<span class="small muted">${fmtDate(p.date, pref(), { year: false })}${p.status !== 'completed' && p.date >= t ? ' · ' + countdown(diffDays(t, p.date)) : ''}</span>` : ''}<span class="badge">${L.priority[p.priority || 'medium']}</span>${p.link ? `<span class="small muted">${icon('link', 'sm')}</span>` : ''}</div></div>
      <div class="row" style="gap:6px;flex-direction:column;align-items:flex-end">${avatar(p.assignee || 'both', 'sm')}<button class="badge ${tone[p.status || 'not_started']}" data-cycle="${p.id}" style="border:0;cursor:pointer">${L.planStatus[p.status || 'not_started']}</button></div>
    </div>`;
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'خطتنا الشهرية', ar: 'خطة الشهر', actions: `<button class="btn sm" data-new>${icon('plus', 'sm')} خطة</button>` })}
      <div class="card" style="margin-bottom:14px"><div class="cal-head" style="margin:0"><a class="icon-btn plain" href="#/plans/${addMonths(mk, -1)}" aria-label="الشهر السابق">${icon('chevR')}</a>
        <div class="t"><b>${mName(mk)}</b><span>${HIJRI_MONTHS[h1.m - 1]}${h1.m !== h2.m ? ' – ' + HIJRI_MONTHS[h2.m - 1] : ''}</span></div>
        <a class="icon-btn plain" href="#/plans/${addMonths(mk, 1)}" aria-label="الشهر التالي">${icon('chevL')}</a></div>
        ${plans.length ? `<div class="row between small" style="margin-top:12px"><span>${done} من ${plans.length} مكتملة</span><span class="muted">${Math.round((done / plans.length) * 100)}%</span></div><div class="progress" style="margin-top:6px"><i style="width:${(done / plans.length) * 100}%"></i></div>` : ''}
      </div>
      ${groups.length ? groups.map(([s, l]) => `<div class="section-title"><h2>${L.planStatus[s]}</h2><span class="en">${L.planStatusEn[s]} · ${l.length}</span></div>${l.map(card).join('')}`).join('')
        : empty('صفحة بيضاء', 'لا توجد خطط لهذا الشهر بعد — زيارة مطعم، هدية، موعد، مكان جديد…', `<br><button class="btn sm" data-new>${icon('plus', 'sm')} أضف أول خطة</button>`)}
      ${months.filter((m) => m !== mk).length ? `<div class="section-title"><h2>أشهر أخرى</h2><span class="en">الأرشيف</span></div><div class="chips" style="flex-wrap:wrap">${months.filter((m) => m !== mk).map((m) => { const ps = all('plans').filter((p) => p.month === m); return `<a class="chip" href="#/plans/${m}">${mName(m)} · ${ps.filter((p) => p.status === 'completed').length}/${ps.length}</a>`; }).join('')}</div>` : ''}
    </div>`;
    el.onclick = async (e) => {
      const q = (s) => e.target.closest(s); let b;
      if ((b = q('[data-cycle]'))) { e.stopPropagation(); const p = all('plans').find((x) => x.id === b.dataset.cycle); try { await update('plans', p.id, { status: NEXT[p.status || 'not_started'] }); } catch (err) { toastErr(err); } return; }
      if (q('[data-new]')) return editPlan(null, { month: mk });
      if ((b = q('[data-open]'))) editPlan(all('plans').find((x) => x.id === b.dataset.open));
    };
  },
};
