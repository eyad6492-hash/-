// Our Monthly Expenses — monthly total, optional budget, by category, by person, 6-month history.
import { all, store, today, create, byId, person } from '../store.js';
import { esc, icon, avatar, pageHead, empty, money, img, openSheet, toast } from '../ui.js';
import { addMonths, monthKey, GREG_MONTHS, GREG_MONTHS_EN, fmtGreg } from '../dates.js';
import { L } from '../labels.js';
import { editExpense } from '../editors.js';
import { openForm } from '../form.js';
import { fileUrl } from '../api.js';

const st = { month: null, cat: 'all' };
const sum = (l) => l.reduce((s, x) => s + (x.amount || 0), 0);

export default {
  render(el) {
    const t = today();
    if (!st.month) st.month = monthKey(t);
    const mk = st.month;
    const all_ = all('expenses');
    const exps = all_.filter((x) => monthKey(x.date) === mk);
    const total = sum(exps);
    const budget = all('budgets').find((b) => b.month === mk);
    const byCat = Object.keys(L.expCats).map((c) => [c, sum(exps.filter((x) => (x.category || 'other') === c))]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...byCat.map(([, v]) => v));
    const me = store.me, p = store.partner;
    const byMe = sum(exps.filter((x) => x.paid_by === me.id)), byP = p ? sum(exps.filter((x) => x.paid_by === p.id)) : 0, byBoth = sum(exps.filter((x) => x.paid_by === 'both' || !x.paid_by));
    const hist = Array.from({ length: 6 }, (_, i) => addMonths(mk, i - 5)).map((m) => [m, sum(all_.filter((x) => monthKey(x.date) === m))]);
    const hmax = Math.max(1, ...hist.map(([, v]) => v));
    const list = (st.cat === 'all' ? exps : exps.filter((x) => (x.category || 'other') === st.cat)).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'Our Monthly Expenses', ar: 'مصروفاتنا', back: '#/more', actions: `<button class="btn sm" data-new>${icon('plus', 'sm')} مصروف</button>` })}
      <div class="card"><div class="cal-head"><button class="icon-btn plain" data-m="-1">${icon('chevR')}</button><div class="t"><b>${GREG_MONTHS[Number(mk.slice(5)) - 1]} ${mk.slice(0, 4)}</b><span class="en">${GREG_MONTHS_EN[Number(mk.slice(5)) - 1]}</span></div><button class="icon-btn plain" data-m="1">${icon('chevL')}</button></div>
        <div class="center" style="margin:6px 0 4px"><div class="stat"><b class="num" style="font-size:36px">${money(total)}</b><span>إجمالي الشهر · ${exps.length} مصروف</span></div></div>
        ${budget?.amount ? `<div class="progress ${total > budget.amount ? 'over' : ''}" style="margin-top:12px"><i style="width:${Math.min(100, (total / budget.amount) * 100)}%"></i></div><div class="row between small" style="margin-top:6px"><span class="muted">الميزانية ${money(budget.amount)}</span><span class="${total > budget.amount ? 'prio-high' : ''}">${total > budget.amount ? `تجاوزنا ${money(total - budget.amount)}` : `المتبقي ${money(budget.amount - total)}`}</span></div>` : ''}
        <button class="btn sm ghost block" style="margin-top:12px" data-budget>${budget?.amount ? 'تعديل الميزانية' : 'تحديد ميزانية للشهر (اختياري)'}</button></div>
      ${exps.length ? `
      <div class="grid2" style="margin-top:12px">
        <div class="card"><div class="row" style="gap:8px">${avatar(me, 'sm')}<span class="small">${esc(me.name)}</span></div><div class="stat" style="margin-top:6px"><b class="num" style="font-size:20px">${money(byMe)}</b></div></div>
        <div class="card"><div class="row" style="gap:8px">${p ? avatar(p, 'sm') : ''}<span class="small">${esc(p?.name || '—')}</span></div><div class="stat" style="margin-top:6px"><b class="num" style="font-size:20px">${money(byP)}</b></div></div></div>
      ${byBoth ? `<div class="small muted center" style="margin-top:6px">مشترك: ${money(byBoth)}</div>` : ''}
      <div class="section-title"><h2>حسب التصنيف</h2><span class="en">By Category</span></div>
      <div class="card bars">${byCat.map(([c, v]) => `<div class="bar-row"><span>${L.expCats[c]}</span><div class="progress"><i style="width:${(v / max) * 100}%"></i></div><span class="num small">${money(v)}</span></div>`).join('')}</div>` : ''}
      <div class="section-title"><h2>آخر 6 أشهر</h2><span class="en">History</span></div>
      <div class="card"><div class="cols">${hist.map(([m, v]) => `<div class="${m === mk ? 'cur' : ''}" data-goto="${m}" style="cursor:pointer"><span class="num tiny">${v ? Math.round(v).toLocaleString('en-US') : ''}</span><i style="height:${(v / hmax) * 100}%"></i><span>${GREG_MONTHS[Number(m.slice(5)) - 1].slice(0, 5)}</span></div>`).join('')}</div></div>
      <div class="section-title"><h2>المصروفات</h2></div>
      ${exps.length ? `<div class="chips"><button class="chip ${st.cat === 'all' ? 'on' : ''}" data-cat="all">الكل</button>${byCat.map(([c]) => `<button class="chip ${st.cat === c ? 'on' : ''}" data-cat="${c}">${L.expCats[c]}</button>`).join('')}</div>` : ''}
      ${list.length ? `<div class="card">${list.map((x) => `<div class="item" data-open="${x.id}" style="cursor:pointer"><span class="ic-box brown">${icon(L.expIcon[x.category] || 'wallet')}</span><div class="grow" style="min-width:0"><div class="title ellipsis">${esc(x.title)}</div><div class="sub">${fmtGreg(x.date, { year: false })} · ${L.expCats[x.category || 'other']}${x.receipt_id ? ' · 🧾' : ''}</div></div><div style="text-align:left"><div class="num" style="font-weight:600">${money(x.amount)}</div>${x.paid_by ? avatar(x.paid_by, 'sm') : ''}</div></div>`).join('')}</div>`
        : empty('No expenses yet', 'لا توجد مصروفات في هذا الشهر')}
    </div>`;
    el.onclick = (e) => {
      const q = (s) => e.target.closest(s); let b;
      if (q('[data-new]')) return editExpense(null, mk !== monthKey(t) ? { date: `${mk}-01` } : {});
      if ((b = q('[data-m]'))) { st.month = addMonths(st.month, Number(b.dataset.m)); st.cat = 'all'; return this.render(el); }
      if ((b = q('[data-goto]'))) { st.month = b.dataset.goto; return this.render(el); }
      if ((b = q('[data-cat]'))) { st.cat = b.dataset.cat; return this.render(el); }
      if (q('[data-budget]')) return openForm({ title: 'ميزانية الشهر', en: 'Monthly Budget', values: { amount: budget?.amount ?? null }, fields: [{ k: 'amount', label: `الميزانية (${store.space.currency || 'ر.س'})`, type: 'number', hint: 'اتركها فارغة لإلغاء الميزانية' }], onSubmit: async (v) => { await create('budgets', { month: mk, amount: v.amount }); toast('تم الحفظ'); } });
      if ((b = q('[data-open]'))) {
        const x = byId('expenses', b.dataset.open);
        openSheet({ title: x.title, en: L.expCats[x.category || 'other'], body: `<div class="stat center"><b class="num" style="font-size:32px">${money(x.amount)}</b></div><dl class="kv" style="margin-top:12px"><dt>التاريخ</dt><dd>${fmtGreg(x.date, { weekday: true })}</dd><dt>من دفع</dt><dd>${esc(x.paid_by === 'both' ? 'سوا' : person(x.paid_by)?.name || '—')}</dd>${x.trip_id && byId('trips', x.trip_id) ? `<dt>الرحلة</dt><dd>${esc(byId('trips', x.trip_id).name)}</dd>` : ''}${x.notes ? `<dt>ملاحظات</dt><dd>${esc(x.notes)}</dd>` : ''}</dl>${x.receipt_id ? `<a href="${fileUrl(x.receipt_id)}" target="_blank" style="display:block;margin-top:12px">${img(x.receipt_id, 'cover')}</a>` : ''}`, foot: `<button class="btn" data-e>${icon('edit', 'sm')} تعديل</button>`, onMount: (sh, close) => { sh.querySelector('[data-e]').onclick = () => { close(); setTimeout(() => editExpense(x), 240); }; } });
      }
    };
  },
};
