import { html, icon, mount, money, n, date, empty } from '../ui.js';
import { get, qs } from '../api.js';
import { setTitle, go } from '../app.js';
import { periodChips, bindPeriod, periodFromQuery, periodLabel } from './common.js';

export function duesBlock(d) {
  const t = d.dues.total, p = d.dues.period;
  return html`
    <div class="grid g3">
      <div class="kpi"><div class="lbl">إجمالي مستحقي</div><div class="val">${money(t.barber_due)}</div><div class="sub">من مبيعات ${n(t.sales)} • <span class="num">${t.count}</span> فاتورة</div></div>
      <div class="kpi"><div class="lbl">المدفوع</div><div class="val ok-t">${money(t.paid)}</div></div>
      <div class="kpi hl"><div class="lbl">المتبقي</div><div class="val">${money(t.remaining)}</div><div class="sub">${t.remaining < 0 ? 'دفعات مقدمة' : 'الرصيد الحالي'}</div></div>
    </div>
    ${p ? html`<h3 class="section-title">خلال الفترة: ${periodLabel({ type: 'custom', ...p })}</h3>
    <div class="grid g4">
      <div class="kpi"><div class="lbl">المبيعات</div><div class="val">${money(p.sales)}</div><div class="sub"><span class="num">${p.count}</span> فاتورة</div></div>
      <div class="kpi"><div class="lbl">مستحق الحلاق</div><div class="val gold">${money(p.barber_due)}</div></div>
      <div class="kpi"><div class="lbl">حصة المحل</div><div class="val">${money(p.shop_share)}</div></div>
      <div class="kpi"><div class="lbl">مدفوع في الفترة</div><div class="val">${money(p.paid)}</div></div>
    </div>` : ''}`;
}
export function paymentsList(items, { manage = false } = {}) {
  if (!items.length) return empty('لا توجد دفعات مسجلة', 'banknote');
  return html`<div class="list">${items.map((p) => html`<div class="row" style="${p.voided ? 'opacity:.55' : ''}">
    <span class="thumb" style="display:grid;place-items:center;color:var(--gold-2)">${icon('banknote')}</span>
    <div class="main"><div class="t">${money(p.amount)} ${p.voided ? html`<span class="badge red">ملغاة</span>` : ''}</div>
      <div class="s"><span>${date(p.paid_on)}</span><span>${p.method}</span>${p.reference ? html`<span class="num">${p.reference}</span>` : ''}${p.by_name ? html`<span>بواسطة ${p.by_name}</span>` : ''}</div>
      ${p.notes ? html`<div class="s">${p.notes}</div>` : ''}${p.voided ? html`<div class="s bad-t">سبب الإلغاء: ${p.void_reason}</div>` : ''}</div>
    <div class="end" style="display:flex;gap:6px">${p.proofs.map((f) => html`<img class="thumb" src="/api/files/${f}" data-zoom alt="إثبات">`)}
      ${manage && !p.voided ? html`<button class="icon-btn" data-void="${p.id}" title="إلغاء الدفعة">${icon('x', 'sm')}</button>` : ''}</div></div>`)}</div>`;
}

export async function render(view, { query, isCurrent }) {
  setTitle('مستحقاتي');
  const p = periodFromQuery(query, 'month');
  const d = await get('/api/me/dues' + qs({ from: p.from, to: p.to }));
  if (!isCurrent()) return;
  mount(view, html`
    <div class="page-head"><div><h2>مستحقاتي</h2><p>المستحق، المدفوع والمتبقي</p></div></div>
    ${periodChips(p, { allowAll: true })}
    <div style="margin-top:14px">${duesBlock(d)}</div>
    <h3 class="section-title">سجل الدفعات</h3>
    ${paymentsList(d.payments)}`);
  bindPeriod(view, p, (o) => go('#/me/dues' + qs({ type: o.type, from: o.type === 'custom' ? o.from : '', to: o.type === 'custom' ? o.to : '' })));
}
