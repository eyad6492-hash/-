import { html, icon, mount, money, moneyText, n, logo, date, dateTime, empty, toast, confirmBox, debounce, sel, sheet } from '../ui.js';
import { get, put, del, lookups } from '../api.js';
import { can, setTitle, go, refresh } from '../app.js';
import { PAY_METHODS, PAY_TYPES, dueLabel, addDays } from '../shared.js';
import { paymentForm, today } from '../forms.js';

const ST_CLASS = { soon: 'st-soon', due: 'st-due', late: 'st-late', paid: 'st-paid', frozen: '', none: '' };
let view = 'all', q = '', month = '', clientF = '';

function readFile(file) {
  return import('../forms.js').then(() => new Promise((resolve, reject) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); const url = c.toDataURL('image/jpeg', 0.82); resolve({ mime: 'image/jpeg', data: url.split(',')[1] }); };
    img.onerror = () => reject(new Error('صورة غير صالحة')); img.src = u;
  }));
}

export default async function registerPage(main, params, query, stale) {
  if (params.id) return paymentDetail(main, params.id, stale);
  setTitle('تسجيل الدفعات');
  const [{ items, today: t }, clients] = await Promise.all([get('/api/payments'), lookups.clients()]);
  if (stale()) return;
  if (query.client) clientF = query.client;
  const weekStart = addDays(t, -6), monthStart = t.slice(0, 8) + '01';
  const sum = (a) => a.reduce((s, p) => s + p.amount, 0);
  const todayL = items.filter((p) => p.date === t), weekL = items.filter((p) => p.date >= weekStart), monthL = items.filter((p) => p.date >= monthStart);
  const months = [...new Set(items.map((p) => p.date.slice(0, 7)))];
  const norm = (x) => String(x || '').replace(/\D/g, '').replace(/^966/, '0');

  mount(main, html`
    ${can('payments.create') ? html`<button class="btn primary lg block" data-new>${icon('plus')} تسجيل دفعة جديدة</button>` : ''}
    <div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px">
      <div class="tile t-green" data-v="today"><div class="t-body"><div class="t-label">اليوم (${todayL.length})</div><div class="t-value" style="font-size:19px">${money(sum(todayL), 0)}</div></div></div>
      <div class="tile t-teal" data-v="week"><div class="t-body"><div class="t-label">هذا الأسبوع (${weekL.length})</div><div class="t-value" style="font-size:19px">${money(sum(weekL), 0)}</div></div></div>
      <div class="tile t-blue" data-v="month"><div class="t-body"><div class="t-label">هذا الشهر (${monthL.length})</div><div class="t-value" style="font-size:19px">${money(sum(monthL), 0)}</div></div></div>
    </div>
    <div class="input-icon" style="margin-top:12px">${icon('search')}<input type="search" data-q placeholder="ابحث باسم العميل أو الجوال أو المبلغ…" value="${q}"></div>
    <div class="chips" style="margin-top:10px">${[['all', 'الكل'], ['today', 'اليوم'], ['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['receipt', 'بصورة حوالة']].map(([k, l]) => html`<button class="chip ${view === k ? 'active' : ''}" data-v="${k}">${l}</button>`)}</div>
    <div class="grid-2" style="margin-top:8px">${sel('month', months.map((m) => ({ v: m, l: m })), month, { empty: 'كل الأشهر' })}${sel('client', clients.map((c) => ({ v: c.id, l: c.name })), clientF, { empty: 'كل العملاء' })}</div>
    <div class="row between" style="margin:12px 2px 6px"><span class="small muted" data-count></span><b class="small" data-total></b></div>
    <div class="stack" data-list></div>`);

  const draw = () => {
    const s = q.trim().toLowerCase(), digits = norm(q);
    let r = items;
    if (view === 'today') r = todayL; else if (view === 'week') r = weekL; else if (view === 'month') r = monthL; else if (view === 'receipt') r = items.filter((p) => p.has_receipt);
    if (month) r = r.filter((p) => p.date.startsWith(month));
    if (clientF) r = r.filter((p) => p.client_id === clientF);
    if (s) r = r.filter((p) => p.client_name.toLowerCase().includes(s) || (p.store_name || '').toLowerCase().includes(s) || (digits.length >= 3 && norm(p.client_phone).includes(digits)) || String(p.amount).includes(s.replace(/,/g, '')) || (p.notes || '').toLowerCase().includes(s));
    main.querySelector('[data-count]').textContent = `${r.length} دفعة`;
    main.querySelector('[data-total]').innerHTML = `الإجمالي: ${String(money(sum(r), 0))}`;
    mount(main.querySelector('[data-list]'), r.length ? r.map((p) => {
      const cd = p.client_due;
      return html`<a class="pay-row" href="#/payment/${p.id}" style="color:inherit">
        <div class="row">${logo({ name: p.client_name, logo: p.logo }, 'sm')}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${p.client_name}</b><span class="xs muted ltr">${p.client_phone || ''}</span></div>
          <div style="text-align:left"><b style="font-size:16px;color:#4ade80">${money(p.amount)}</b>${p.has_receipt ? html`<div class="xs" style="color:var(--cyan)">${icon('image', 'sm')} حوالة</div>` : ''}</div></div>
        <div class="pay-grid">
          <div><span>تاريخ التحويل</span><b>${date(p.date)}</b></div>
          <div><span>سُجّلت في التطبيق</span><b>${dateTime(p.created_at)}</b></div>
          <div><span>الاستحقاق القادم</span><b>${p.next_due_date ? date(p.next_due_date) : cd?.next_due ? date(cd.next_due) : '—'}</b></div>
          <div><span>حالة العميل الآن</span>${cd?.next_due ? html`<b class="up-badge ${ST_CLASS[cd.pay_status]}" style="display:inline-block">${dueLabel(cd.pay_status, cd.days_to_due)}${cd.days_to_due > 0 ? ` • ${cd.days_to_due} يوم` : ''}</b>` : html`<b>—</b>`}</div>
        </div>
        ${p.notes ? html`<div class="xs muted">📝 ${p.notes}</div>` : ''}</a>`;
    }) : empty(items.length ? 'لا توجد دفعات مطابقة' : 'لم تُسجَّل أي دفعة بعد', 'coins'));
  };
  draw();
  main.querySelector('[data-q]').addEventListener('input', debounce((e) => { q = e.target.value; draw(); }, 150));
  main.addEventListener('change', (e) => { if (e.target.name === 'month') { month = e.target.value; draw(); } if (e.target.name === 'client') { clientF = e.target.value; draw(); } });
  main.addEventListener('click', async (e) => {
    if (e.target.closest('[data-new]')) { if (await paymentForm({})) refresh(); return; }
    const v = e.target.closest('[data-v]'); if (v) { view = v.dataset.v; main.querySelectorAll('.chip[data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === view)); draw(); }
  });
}

async function paymentDetail(main, id, stale) {
  const d = await get(`/api/payments/${id}`);
  if (stale()) return;
  const p = d.payment, cd = d.client_due;
  setTitle('تفاصيل الدفعة');
  mount(main, html`<div style="max-width:720px;margin:0 auto">
    <div class="card"><div class="row">${logo({ name: p.client_name, logo: p.logo })}<div class="grow"><a class="bold" href="#/clients/${p.client_id}" style="font-size:17px">${p.client_name}</a><div class="xs muted ltr" style="text-align:right">${p.client_phone || ''}</div></div>
      <b style="font-size:22px;color:#4ade80">${money(p.amount)}</b></div></div>
    <div class="section card"><div class="kvlist">
      <div><span>تاريخ التحويل</span><span>${date(p.date)}</span></div>
      <div><span>تاريخ التسجيل في التطبيق</span><span>${dateTime(p.created_at)}${p.created_by_name ? ` — ${p.created_by_name}` : ''}</span></div>
      <div><span>الاستحقاق الذي سددته</span><span>${p.prev_due_date ? date(p.prev_due_date) : '—'}</span></div>
      <div><span>موعد الدفعة القادمة المحدد</span><span>${p.next_due_date ? date(p.next_due_date) : '—'}</span></div>
      <div><span>مدة الاستحقاق</span><span>${p.next_due_days ? `${p.next_due_days} يوم` : p.next_due_date ? 'حسب جدول الاشتراك' : '—'}</span></div>
      ${cd?.next_due ? html`<div><span>الاستحقاق الحالي للعميل</span><span>${date(cd.next_due)} — ${dueLabel(cd.pay_status, cd.days_to_due)}</span></div>` : ''}
      <div><span>طريقة الدفع / النوع</span><span>${PAY_METHODS[p.method]} • ${PAY_TYPES[p.type]}</span></div>
      ${p.reference ? html`<div><span>المرجع</span><span>${p.reference}</span></div>` : ''}
      <div><span>الملاحظات</span><span style="white-space:pre-wrap">${p.notes || '—'}</span></div>
      ${p.updated_at ? html`<div><span>آخر تعديل</span><span>${dateTime(p.updated_at)}</span></div>` : ''}</div></div>
    <div class="section card"><div class="section-head"><h3>${icon('image', 'sm')} صورة الحوالة</h3>${d.receipt ? html`<span class="xs muted">${Math.round(d.receipt.size / 1024)} KB • ${dateTime(d.receipt.uploaded_at)}</span>` : ''}</div>
      ${d.receipt ? html`<a href="/api/payments/${p.id}/receipt" target="_blank" rel="noopener"><img class="receipt-img" src="/api/payments/${p.id}/receipt" alt="صورة الحوالة"></a>` : html`<p class="muted small" style="margin:0">لا توجد صورة مرفقة.</p>`}
      ${can('payments.create') ? html`<div class="grid-2" style="margin-top:10px"><label class="btn sm ghost">${icon('upload', 'sm')} ${d.receipt ? 'استبدال الصورة' : 'إرفاق صورة'}<input type="file" accept="image/*" hidden data-rup></label>${d.receipt ? html`<button class="btn sm danger" data-rdel>${icon('trash', 'sm')} حذف الصورة</button>` : ''}</div>` : ''}</div>
    ${can('payments.create') ? html`<div class="grid-3" style="margin-top:12px"><button class="btn ghost" data-edit>${icon('edit', 'sm')} تعديل</button><a class="btn ghost" href="#/clients/${p.client_id}?tab=payments">${icon('user', 'sm')} ملف العميل</a><button class="btn danger" data-del>${icon('trash', 'sm')} حذف</button></div>` : ''}
    <div class="section card"><div class="section-head"><h3>سجل التعديلات</h3></div><div class="stack">${d.history.length ? d.history.map((h) => html`<div class="small" style="border-bottom:1px solid var(--border);padding:6px 0"><b>${h.action}</b> <span class="xs muted">• ${dateTime(h.created_at)} • ${h.user_name}</span>${h.details ? html`<div class="xs muted" style="word-break:break-word">${h.details}</div>` : ''}</div>`) : html`<p class="muted small" style="margin:0">—</p>`}</div></div>
  </div>`);
  main.querySelector('[data-rup]')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await readFile(f); await put(`/api/payments/${p.id}/receipt`, { receipt: r }); toast('تم حفظ صورة الحوالة'); refresh(); } catch (err) { toast(err.message, 'err'); }
  });
  main.addEventListener('click', async (e) => {
    try {
      if (e.target.closest('[data-rdel]') && await confirmBox('حذف صورة الحوالة؟ تبقى الدفعة وسجلها كما هي.', { danger: true, ok: 'حذف الصورة' })) { await del(`/api/payments/${p.id}/receipt`); toast('تم حذف الصورة'); return refresh(); }
      if (e.target.closest('[data-edit]')) { if (await paymentForm({ payment: p })) refresh(); return; }
      if (e.target.closest('[data-del]') && await confirmBox(`حذف دفعة ${moneyText(p.amount)} من ${p.client_name} نهائيًا؟`, { danger: true, ok: 'حذف' })) { await del(`/api/payments/${p.id}`); toast('تم حذف الدفعة'); go('#/payments/register'); }
    } catch (err) { toast(err.message, 'err'); }
  });
  void sheet; void n;
}
