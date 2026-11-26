// Invoice detail — barber (own) or reviewer. Review actions, edit requests, corrections, audit trail.
import { html, icon, mount, money, n, date, dateTime, badge, toast, formSheet, field, inp, ta, confirmBox } from '../ui.js';
import { get, post, put, upload } from '../api.js';
import { state, can, setTitle, refresh } from '../app.js';
import { withClosureReason } from './common.js';
import { photoPicker } from '../media.js';

export async function render(view, { params, isCurrent }) {
  setTitle('تفاصيل الفاتورة');
  const { invoice: i, history, counted } = await get(`/api/invoices/${params.id}`);
  if (!isCurrent()) return;
  const mine = i.user_id === state.user.id;
  const reviewer = can('invoices.review');
  mount(view, html`
    <a class="back" href="${mine && !reviewer ? '#/me/invoices' : '#/invoices'}">${icon('arrowR', 'sm')} رجوع</a>
    <div class="page-head"><div><h2>فاتورة #<span class="num">${i.number}</span></h2><p>${i.full_name} • ${dateTime(i.created_at)}</p></div><div class="actions">${badge(i.status)}</div></div>
    <div class="split">
      <div>
        <div class="card gold-edge">
          <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px">
            <div><div class="muted" style="font-size:13px">قيمة الفاتورة</div><div style="font-size:30px;font-weight:800">${money(i.amount)}</div></div>
            <span class="badge ${counted ? 'green' : ''}">${counted ? 'محتسبة مالياً' : 'غير محتسبة'}</span></div>
          <div class="split-bar" style="margin:14px 0 8px"><span style="width:${i.barber_rate}%"></span><span style="width:${i.shop_rate}%"></span></div>
          <div class="grid g2">
            <div><div class="muted" style="font-size:12.5px">حصة الحلاق (<span class="num">${n(i.barber_rate)}%</span>)</div><b class="gold" style="font-size:18px">${money(i.barber_share)}</b></div>
            <div><div class="muted" style="font-size:12.5px">حصة المحل (<span class="num">${n(i.shop_rate)}%</span>)</div><b style="font-size:18px">${money(i.shop_share)}</b></div>
          </div>
          <div class="sep"></div>
          <dl class="kv">
            <dt>التاريخ</dt><dd>${date(i.work_date)}</dd>
            <dt>نوع الخدمة</dt><dd>${i.service_type || '—'}</dd>
            <dt>عدد الخدمات</dt><dd class="num">${i.service_count ?? '—'}</dd>
            <dt>ملاحظات</dt><dd style="white-space:pre-wrap">${i.notes || '—'}</dd>
            ${i.review_note ? html`<dt>ملاحظة المراجعة</dt><dd class="warn-t">${i.review_note}</dd>` : ''}
            ${i.reviewer_name ? html`<dt>راجعها</dt><dd>${i.reviewer_name} • ${dateTime(i.reviewed_at)}</dd>` : ''}
          </dl>
        </div>
        ${i.edit_request ? html`<div class="card" style="border-color:rgba(251,191,36,.35)"><h3 class="warn-t">${icon('alert', 'sm')} طلب تعديل من الحلاق</h3><p style="margin:0">${i.edit_request}</p><small class="muted">${dateTime(i.edit_requested_at)}</small></div>` : ''}
        <div class="card"><h3>صورة الفاتورة</h3><div class="gallery">${i.images.map((f) => html`<img src="/api/files/${f}" data-zoom alt="صورة الفاتورة">`)}</div></div>
        <div class="card" style="margin-top:12px"><div style="display:flex;gap:8px;flex-wrap:wrap" id="acts"></div></div>
      </div>
      <div>
        <h3 class="section-title">سجل الفاتورة</h3>
        <div class="list">${history.map((h) => html`<div class="row"><div class="main"><div class="t">${h.action}</div><div class="s"><span>${h.user_name}</span><span>${dateTime(h.created_at)}</span>${h.reason ? html`<span class="warn-t">${h.reason}</span>` : ''}</div></div></div>`)}</div>
      </div>
    </div>`);
  const acts = view.querySelector('#acts');
  const btn = (label, cls, fn, ic) => { const b = document.createElement('button'); b.className = `btn ${cls}`; b.innerHTML = String(html`${icon(ic, 'sm')} ${label}`); b.onclick = fn; acts.appendChild(b); };

  const review = (status, title, needNote) => formSheet({
    title, submit: 'تأكيد',
    body: html`${field(needNote ? 'ملاحظة للحلاق *' : 'ملاحظة (اختياري)', ta('note', '', '', 3))}`,
    onSubmit: async (d) => {
      if (needNote && !d.note?.trim()) throw new Error('اكتب ملاحظة توضح السبب');
      const r = await withClosureReason((reason) => post(`/api/invoices/${i.id}/review`, { status, note: d.note, reason }));
      if (r) { toast('تم الحفظ'); refresh(); }
    },
  });

  if (reviewer) {
    if (i.status !== 'approved') btn('اعتماد', 'ok', () => review('approved', 'اعتماد الفاتورة', false), 'check');
    if (i.status !== 'needs_edit') btn('طلب تعديل', '', () => review('needs_edit', 'طلب تعديل من الحلاق', true), 'edit');
    if (i.status !== 'rejected') btn('رفض', 'danger', () => review('rejected', 'رفض الفاتورة', true), 'x');
    if (i.status === 'registered') btn('تحويل للمراجعة', 'ghost', () => review('under_review', 'تحويل للمراجعة', false), 'clock');
    btn('تصحيح البيانات', 'ghost', () => correct(i, true), 'edit');
  }
  if (mine && !reviewer) {
    if (i.status === 'needs_edit') btn('تعديل الفاتورة', 'primary', () => correct(i, false), 'edit');
    else btn('طلب تعديل', '', () => formSheet({
      title: 'طلب تعديل الفاتورة', submit: 'إرسال الطلب',
      body: html`<div class="hint">لا يمكن تعديل الفاتورة مباشرة بعد تسجيلها. اكتب التعديل المطلوب وسيصل للإدارة.</div>${field('التعديل المطلوب وسببه *', ta('text', '', 'مثال: المبلغ الصحيح 120 بدلاً من 100', 3))}`,
      onSubmit: async (d) => { await post(`/api/invoices/${i.id}/edit-request`, { text: d.text }); toast('تم إرسال طلب التعديل'); refresh(); },
    }), 'send');
  }
  if (!acts.children.length) acts.parentElement.remove();
}

function correct(i, asReviewer) {
  const pp = photoPicker({ label: 'إضافة صورة جديدة (اختياري)', required: false });
  return formSheet({
    title: 'تعديل الفاتورة', submit: 'حفظ التعديل',
    body: html`
      ${field('المبلغ', inp('amount', i.amount, { type: 'number', step: '0.01', req: true }))}
      <div class="form-grid two">${field('نوع الخدمة', inp('service_type', i.service_type))}${field('عدد الخدمات', inp('service_count', i.service_count, { type: 'number', min: 1 }))}</div>
      ${field('ملاحظات', ta('notes', i.notes, '', 2))}
      ${pp.markup}
      ${asReviewer ? field('سبب التصحيح', ta('reason', '', 'يُحفظ في سجل العمليات', 2)) : ''}
      <div class="hint">تبقى نسبة الحلاق كما كانت وقت تسجيل الفاتورة (${n(i.barber_rate)}%).</div>`,
    onMount: (el) => pp.bind(el),
    onSubmit: async (d) => {
      const add = [];
      if (pp.getBlob()) add.push((await upload('invoice', pp.getBlob(), asReviewer ? `&user_id=${i.user_id}` : '')).id);
      const body = { amount: d.amount, service_type: d.service_type, service_count: d.service_count, notes: d.notes, add_image_file_ids: add };
      const r = await withClosureReason((reason) => put(`/api/invoices/${i.id}`, { ...body, reason: reason || d.reason }));
      if (r) { toast(asReviewer ? 'تم التصحيح' : 'تم التعديل وإرساله للمراجعة'); refresh(); }
    },
  });
}
