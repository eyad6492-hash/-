// One employee's statement: dues, payments (with proofs), record / void payments.
import { html, icon, mount, money, toast, formSheet, field, inp, ta, sel, confirmBox } from '../ui.js';
import { get, post, upload, qs, lookups } from '../api.js';
import { setTitle, can, go, state } from '../app.js';
import { periodChips, bindPeriod, periodFromQuery, downloadCsv, withClosureReason } from './common.js';
import { duesBlock, paymentsList } from './my-dues.js';
import { PAY_METHODS } from '../shared.js';
import { compressImage } from '../media.js';

export async function paymentForm(userId, onDone) {
  const staff = (await lookups.staff()).filter((s) => s.works_shifts);
  let proof = null;
  return formSheet({
    title: 'تسجيل دفعة لموظف', submit: 'حفظ الدفعة',
    body: html`${field('الموظف *', sel('user_id', staff.map((s) => ({ v: s.id, l: s.full_name })), userId || '', { req: true, empty: 'اختر' }))}
      <div class="hint" data-rem>اختر الموظف لعرض المتبقي له.</div>
      <div class="form-grid two">${field('المبلغ *', inp('amount', '', { type: 'number', step: '0.01', min: 0.01, req: true }))}${field('التاريخ *', inp('paid_on', state.today, { type: 'date', req: true }))}
      ${field('طريقة الدفع *', sel('method', PAY_METHODS, 'تحويل بنكي'))}${field('رقم العملية', inp('reference', '', { attrs: 'dir="ltr"' }))}</div>
      <label class="field"><span>صورة إثبات التحويل</span><input type="file" accept="image/*" data-proof></label>
      ${field('ملاحظات', ta('notes', '', '', 2))}
      <div class="hint">المسؤول: ${state.user.full_name} — يُحدّث المدفوع والمتبقي تلقائياً ويصل إشعار للموظف.</div>`,
    onMount: (el) => {
      const showRem = async () => { const id = el.querySelector('[name=user_id]').value; if (!id) return; const d = await get(`/api/dues/${id}`); el.querySelector('[data-rem]').innerHTML = `المتبقي الحالي للموظف: <b class="gold">${d.dues.total.remaining.toLocaleString('en-US')} ر.س</b>`; };
      el.querySelector('[name=user_id]').addEventListener('change', showRem); showRem();
      el.querySelector('[data-proof]').addEventListener('change', async (e) => { try { proof = await compressImage(e.target.files[0]); } catch (err) { toast(err.message, 'err'); } });
    },
    onSubmit: async (b) => {
      if (proof) b.proof_file_id = (await upload('payment_proof', proof, `&user_id=${b.user_id}`)).id;
      const send = (over) => withClosureReason((reason) => post('/api/payments', { ...b, allow_over: over, reason }));
      let r;
      try { r = await send(false); } catch (e) {
        if (e.code !== 'over_remaining') throw e;
        if (!(await confirmBox(e.message, { ok: 'تسجيلها كدفعة مقدمة' }))) return false;
        r = await send(true);
      }
      if (!r) return false;
      toast(`تم تسجيل الدفعة — المتبقي ${r.remaining_after.toLocaleString('en-US')} ر.س`); onDone?.(); return true;
    },
  });
}

export async function render(view, { params, query, isCurrent }) {
  const p = periodFromQuery(query, 'all');
  const d = await get(`/api/dues/${params.id}` + qs({ from: p.from, to: p.to }));
  if (!isCurrent()) return;
  setTitle(`مستحقات ${d.user.full_name}`);
  mount(view, html`
    <a class="back" href="#/dues">${icon('arrowR', 'sm')} المستحقات</a>
    <div class="page-head"><div><h2>${d.user.full_name}</h2><p>كشف المستحقات والدفعات</p></div>
      <div class="actions">${can('payments.manage') ? html`<button class="btn primary" data-pay>${icon('banknote', 'sm')} تسجيل دفعة</button>` : ''}<button class="btn sm" data-csv>${icon('download', 'sm')} تصدير الدفعات</button><a class="btn sm" href="#/employees/${d.user.id}">الملف</a></div></div>
    ${periodChips(p, { allowAll: true })}
    <div style="margin-top:14px">${duesBlock(d)}</div>
    <h3 class="section-title">سجل الدفعات</h3>${paymentsList(d.payments, { manage: can('payments.manage') })}`);
  const reload = () => render(view, { params, query, isCurrent });
  bindPeriod(view, p, (o) => go(`#/dues/${params.id}` + qs({ type: o.type, from: o.type === 'custom' ? o.from : '', to: o.type === 'custom' ? o.to : '' })));
  view.querySelector('[data-pay]')?.addEventListener('click', () => paymentForm(params.id, reload));
  view.querySelector('[data-csv]').addEventListener('click', () => downloadCsv([['التاريخ', 'المبلغ', 'الطريقة', 'رقم العملية', 'ملاحظات', 'المسؤول', 'ملغاة'], ...d.payments.map((x) => [x.paid_on, x.amount, x.method, x.reference, x.notes, x.by_name, x.voided ? 'نعم' : ''])], `payments-${d.user.full_name}.csv`));
  view.querySelectorAll('[data-void]').forEach((b) => b.addEventListener('click', () => formSheet({
    title: 'إلغاء الدفعة', submit: 'إلغاء الدفعة',
    body: html`<div class="hint">لا تُحذف الدفعات — تُلغى مع توثيق السبب في سجل العمليات.</div>${field('سبب الإلغاء *', ta('reason', '', '', 2))}`,
    onSubmit: async (x) => { const r = await withClosureReason((cr) => post(`/api/payments/${b.dataset.void}/void`, { reason: x.reason, closure_reason: cr })); if (r) { toast('تم إلغاء الدفعة'); reload(); } },
  })));
}
