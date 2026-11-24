import { html, raw, icon, mount, money, toast, field, inp, sel, ta, sheet, formSheet, esc, n } from '../ui.js';
import { get, post, put, lookups } from '../api.js';
import { setTitle, go, state } from '../app.js';
import { QUOTE_STATUS, computeQuote, addDays } from '../shared.js';
import { today } from '../forms.js';

export default async function quoteEdit(main, params, q, stale) {
  const editing = !!params.id;
  const [clients, tpl] = await Promise.all([lookups.clients(), get('/api/service-templates').then((r) => r.items)]);
  let qt;
  if (editing) qt = (await get(`/api/quotes/${params.id}`)).quote;
  else {
    qt = { client_id: q.client || '', client_name: '', company: '', phone: '', email: '', date: today(), valid_until: addDays(today(), Number(state.settings.quote_validity_days) || 14), items: [{ name: '', details: '', qty: 1, price: 0 }], discount: 0, discount_type: 'amount', tax_enabled: !!state.settings.tax_default_enabled, tax_rate: state.settings.tax_rate ?? 15, terms: state.settings.quote_terms || '', notes: '', status: 'draft' };
    if (q.client) { const c = (await get(`/api/clients/${q.client}`)).client; Object.assign(qt, { client_name: c.name, company: c.store_name || '', phone: c.phone || '', email: c.email || '' }); }
  }
  if (stale()) return;
  setTitle(editing ? `تعديل ${qt.number}` : 'عرض سعر جديد');

  const itemRow = (it, i) => html`<div class="card flat" style="padding:10px" data-item="${i}">
    <div class="row"><input data-k="name" placeholder="اسم الخدمة" value="${it.name}" class="grow"><button type="button" class="icon-btn" data-rm="${i}" aria-label="حذف">${icon('trash', 'sm')}</button></div>
    <textarea data-k="details" rows="1" placeholder="تفاصيل الخدمة" style="margin-top:6px;min-height:44px">${it.details || ''}</textarea>
    <div class="grid-3" style="margin-top:6px"><label class="field"><span>الكمية</span><input type="number" data-k="qty" min="0" step="any" value="${it.qty}"></label><label class="field"><span>السعر</span><input type="number" data-k="price" min="0" step="any" value="${it.price}"></label><div class="field"><span>الإجمالي</span><div class="bold" style="padding-top:12px" data-line="${i}">${money((Number(it.qty) || 0) * (Number(it.price) || 0))}</div></div></div></div>`;
  const totals = () => { const t = computeQuote(qt); return html`<div class="kvlist"><div><span>الإجمالي قبل الخصم</span><span>${money(t.subtotal)}</span></div><div><span>الخصم</span><span>${money(t.discount_value)}</span></div>${qt.tax_enabled ? html`<div><span>الضريبة (${n(qt.tax_rate)}%)</span><span>${money(t.tax_value)}</span></div>` : ''}<div style="font-size:17px"><span>الإجمالي النهائي</span><span style="color:var(--pink)">${money(t.total)}</span></div></div>`; };

  mount(main, html`<form class="stack lg" data-form>
    <div class="card"><div class="section-head"><h3>بيانات العميل</h3></div><div class="form-grid cols-2">
      ${field('اختيار من العملاء (اختياري)', sel('client_id', clients.map((c) => ({ v: c.id, l: c.name })), qt.client_id, { empty: 'عميل جديد / محتمل' }))}
      ${field('اسم العميل *', inp('client_name', qt.client_name, { req: true }))}
      ${field('الشركة أو المتجر', inp('company', qt.company))}${field('رقم الجوال', inp('phone', qt.phone, { type: 'tel' }))}
      ${field('البريد الإلكتروني', inp('email', qt.email, { type: 'email' }))}${field('الحالة', sel('status', QUOTE_STATUS, qt.status))}
      ${field('تاريخ العرض', inp('date', qt.date, { type: 'date' }))}${field('تاريخ انتهاء العرض', inp('valid_until', qt.valid_until, { type: 'date' }))}</div></div>
    <div class="card"><div class="section-head"><h3>الخدمات</h3><button type="button" class="link" data-tpl>${icon('layers', 'sm')} من القوالب</button></div>
      <div class="stack" data-items>${qt.items.map(itemRow)}</div>
      <div class="row" style="margin-top:10px"><button type="button" class="btn sm ghost grow" data-add-item>${icon('plus', 'sm')} إضافة خدمة</button><button type="button" class="btn sm ghost" data-save-tpl>${icon('save', 'sm')} حفظ كقالب</button></div></div>
    <div class="card"><div class="form-grid cols-2">
      ${field('الخصم', html`<div class="row"><input type="number" name="discount" min="0" step="any" value="${qt.discount}" class="grow">${sel('discount_type', { amount: 'مبلغ', percent: '%' }, qt.discount_type)}</div>`)}
      ${field('الضريبة', html`<div class="row"><label class="check" style="flex:none"><input type="checkbox" name="tax_enabled" ${qt.tax_enabled ? raw('checked') : ''}> تفعيل</label><input type="number" name="tax_rate" min="0" step="any" value="${qt.tax_rate}" class="grow"><span class="muted">%</span></div>`)}</div>
      <div data-totals style="margin-top:10px">${totals()}</div></div>
    <div class="card form-grid">${field('الشروط', ta('terms', qt.terms, '', 4))}${field('ملاحظات', ta('notes', qt.notes, '', 2))}</div>
    <div class="row" style="position:sticky;bottom:calc(var(--nav-h) + 10px + var(--safe-b));z-index:5"><button type="submit" class="btn primary lg grow">${icon('save')} حفظ العرض</button></div>
  </form>`);

  const form = main.querySelector('[data-form]');
  const refreshTotals = () => mount(main.querySelector('[data-totals]'), totals());
  const redrawItems = () => mount(main.querySelector('[data-items]'), qt.items.map(itemRow));
  form.addEventListener('input', (e) => {
    const t = e.target, row = t.closest('[data-item]');
    if (row) { const it = qt.items[+row.dataset.item]; it[t.dataset.k] = t.type === 'number' ? Number(t.value) || 0 : t.value; const ln = row.querySelector('[data-line]'); if (ln) ln.innerHTML = String(money((Number(it.qty) || 0) * (Number(it.price) || 0))); }
    else if (t.name) qt[t.name] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) || 0 : t.value;
    refreshTotals();
  });
  form.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.name === 'tax_enabled' || t.name === 'discount_type') { qt[t.name] = t.type === 'checkbox' ? t.checked : t.value; refreshTotals(); }
    if (t.name === 'client_id' && t.value) {
      const c = (await get(`/api/clients/${t.value}`)).client; qt.client_id = c.id;
      for (const [k, v] of [['client_name', c.name], ['company', c.store_name], ['phone', c.phone], ['email', c.email]]) { qt[k] = v || ''; form.querySelector(`[name=${k}]`).value = v || ''; }
    } else if (t.name === 'client_id') qt.client_id = '';
  });
  form.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-add-item]')) { qt.items.push({ name: '', details: '', qty: 1, price: 0 }); redrawItems(); refreshTotals(); return; }
    const rm = t.closest('[data-rm]'); if (rm) { qt.items.splice(+rm.dataset.rm, 1); if (!qt.items.length) qt.items.push({ name: '', details: '', qty: 1, price: 0 }); redrawItems(); refreshTotals(); return; }
    if (t.closest('[data-tpl]')) {
      if (!tpl.length) return toast('لا توجد قوالب بعد — احفظ خدمة كقالب أولًا');
      const pick = await sheet({ title: 'قوالب الخدمات', body: html`<div class="list">${tpl.map((s, i) => html`<button type="button" class="item" data-i="${i}" style="width:100%;text-align:start"><div class="it-body"><div class="it-title">${s.name}</div><div class="it-sub">${s.description || ''}</div></div><b>${money(s.price)}</b></button>`)}</div>`,
        onMount: (el, close) => el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-i]'); if (b) close(tpl[+b.dataset.i]); }) });
      if (pick) { const blank = qt.items.findIndex((x) => !x.name); const it = { name: pick.name, details: pick.description || '', qty: 1, price: pick.price }; if (blank >= 0) qt.items[blank] = it; else qt.items.push(it); redrawItems(); refreshTotals(); }
      return;
    }
    if (t.closest('[data-save-tpl]')) {
      const it = qt.items.filter((x) => x.name).at(-1);
      if (!it) return toast('اكتب اسم خدمة أولًا', 'err');
      const r = await post('/api/service-templates', { name: it.name, description: it.details, price: it.price }); tpl.push({ id: r.id, name: it.name, description: it.details, price: it.price }); toast('تم حفظ الخدمة كقالب');
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const body = { ...qt, items: qt.items.filter((x) => x.name) };
    if (!body.items.length) return toast('أضف خدمة واحدة على الأقل', 'err');
    try { const r = editing ? await put(`/api/quotes/${qt.id}`, body) : await post('/api/quotes', body); toast('تم حفظ عرض السعر'); go(`#/quotes/${editing ? qt.id : r.id}`); }
    catch (err) { toast(err.message, 'err'); }
  });
  void formSheet; void esc;
}
