import { html, icon, mount, money, n, date, toast, confirmBox, copyText, formSheet, field, inp, moneyText } from '../ui.js';
import { get, post, put, del, invalidate } from '../api.js';
import { can, setTitle, go, refresh, state, identitySrc } from '../app.js';
import { QUOTE_STATUS } from '../shared.js';
import { exportPdf } from '../pdf.js';
import { QUOTE_BADGE } from './quotes.js';
import { waLink } from './client.js';

export function quotePaper(qt) {
  const s = state.settings;
  return html`<div class="qpaper" data-paper>
    <div class="qh"><img src="${identitySrc()}" alt=""><div class="grow"><div style="font-size:21px;font-weight:800">عرض سعر</div><div style="opacity:.85;font-size:13px">${s.provider_name || state.user.display_name} • ${s.provider_title || 'Media Buyer'}</div>
      <div style="opacity:.7;font-size:12px" class="ltr">${[s.provider_phone, s.provider_email, s.provider_website].filter(Boolean).join(' • ')}</div></div>
      <div style="text-align:left"><div class="num" style="font-weight:800">${qt.number || 'مسودة'}</div><div style="font-size:12px;opacity:.8">${date(qt.date)}</div></div></div>
    <div class="qb">
      <div class="grid-2" style="gap:14px;font-size:13.5px">
        <div><div style="color:#6b7097;font-size:12px;font-weight:700">مقدم إلى</div><b style="font-size:15px">${qt.client_name}</b>${qt.company ? html`<div>${qt.company}</div>` : ''}<div class="ltr" style="text-align:right">${[qt.phone, qt.email].filter(Boolean).join(' • ')}</div></div>
        <div><div style="color:#6b7097;font-size:12px;font-weight:700">صلاحية العرض</div><b>حتى ${date(qt.valid_until)}</b>${s.provider_tax_no ? html`<div style="font-size:12px;color:#6b7097">الرقم الضريبي: <span class="num">${s.provider_tax_no}</span></div>` : ''}</div></div>
      <table style="margin-top:16px"><thead><tr><th>الخدمة</th><th style="width:60px">الكمية</th><th style="width:90px">السعر</th><th style="width:100px">الإجمالي</th></tr></thead>
        <tbody>${qt.items.map((it) => html`<tr><td><b>${it.name}</b>${it.details ? html`<div style="color:#6b7097;font-size:12px;white-space:pre-wrap">${it.details}</div>` : ''}</td><td class="num">${n(it.qty)}</td><td class="num">${n(it.price)}</td><td class="num"><b>${n(it.qty * it.price)}</b></td></tr>`)}</tbody></table>
      <div class="tot"><div><span>الإجمالي قبل الخصم</span><span class="num">${moneyText(qt.subtotal)}</span></div>
        ${qt.discount_value ? html`<div><span>الخصم${qt.discount_type === 'percent' ? ` (${n(qt.discount)}%)` : ''}</span><span class="num">- ${moneyText(qt.discount_value)}</span></div>` : ''}
        ${qt.tax_enabled ? html`<div><span>${s.tax_label || 'الضريبة'} (${n(qt.tax_rate)}%)</span><span class="num">${moneyText(qt.tax_value)}</span></div>` : ''}
        <div class="grand"><span>المبلغ النهائي</span><span class="num">${moneyText(qt.total)}</span></div></div>
      ${qt.terms ? html`<div style="margin-top:16px"><div style="font-weight:800;margin-bottom:4px">الشروط والأحكام</div><div style="font-size:12.5px;color:#454a75;white-space:pre-wrap;line-height:1.8">${qt.terms}</div></div>` : ''}
      ${qt.notes ? html`<div style="margin-top:10px"><div style="font-weight:800;margin-bottom:4px">ملاحظات</div><div style="font-size:12.5px;color:#454a75;white-space:pre-wrap">${qt.notes}</div></div>` : ''}
      <div style="margin-top:18px;padding-top:10px;border-top:1px dashed #d5d8ec;font-size:11.5px;color:#8a8fb2;display:flex;justify-content:space-between"><span>${s.provider_address || ''}</span><span>شكرًا لثقتكم</span></div>
    </div></div>`;
}

function quoteText(qt) {
  return [`*عرض سعر ${qt.number}*`, `العميل: ${qt.client_name}`, `التاريخ: ${date(qt.date)} — صالح حتى ${date(qt.valid_until)}`, '', ...qt.items.map((it) => `• ${it.name}${it.qty !== 1 ? ` ×${n(it.qty)}` : ''}: ${moneyText(it.qty * it.price)}`), '',
    qt.discount_value ? `الخصم: ${moneyText(qt.discount_value)}` : null, qt.tax_enabled ? `الضريبة: ${moneyText(qt.tax_value)}` : null, `*المبلغ النهائي: ${moneyText(qt.total)}*`].filter((x) => x !== null).join('\n');
}

export default async function quotePage(main, { id }, _q, stale) {
  const { quote: qt } = await get(`/api/quotes/${id}`);
  if (stale()) return;
  setTitle(`عرض سعر ${qt.number}`);
  const st = qt.status;
  mount(main, html`<div style="max-width:760px;margin:0 auto">
    <div class="row between" style="margin-bottom:10px"><span class="badge ${QUOTE_BADGE[st]}" style="font-size:14px">${QUOTE_STATUS[st]}</span>${qt.converted_client_id ? html`<a class="link" href="#/clients/${qt.converted_client_id}">${icon('user', 'sm')} فتح ملف العميل</a>` : ''}</div>
    ${quotePaper(qt)}
    <div class="grid-3" style="margin-top:14px"><button class="btn success" data-wa>${icon('whatsapp')} واتساب</button><button class="btn ghost" data-share>${icon('share')} مشاركة</button><button class="btn primary" data-pdf>${icon('download')} PDF</button></div>
    ${can('quotes.create') ? html`
      <div class="section card"><div class="section-head"><h3>حالة العرض</h3></div><div class="chips" style="flex-wrap:wrap">${Object.entries(QUOTE_STATUS).map(([k, l]) => html`<button class="chip ${st === k ? 'active' : ''}" data-status="${k}">${l}</button>`)}</div></div>
      <div class="grid-2" style="margin-top:12px">
        ${!qt.converted_client_id ? html`<button class="btn success" data-convert>${icon('user_plus')} تحويل إلى عميل / اشتراك</button>` : html`<button class="btn ghost" data-convert>${icon('refresh')} إضافة كاشتراك جديد</button>`}
        <a class="btn ghost" href="#/quotes/${qt.id}/edit">${icon('edit')} تعديل</a>
        <button class="btn ghost" data-dup>${icon('copy')} نسخ / إعادة استخدام</button>
        <button class="btn danger" data-del>${icon('trash')} حذف</button></div>` : ''}
  </div>`);
  const fname = `عرض-سعر-${qt.number}-${qt.client_name}.pdf`.replace(/\s+/g, '-');
  main.addEventListener('click', async (e) => {
    const t = e.target;
    try {
      if (t.closest('[data-wa]')) { if (qt.phone) window.open(waLink(qt.phone, quoteText(qt)), '_blank', 'noopener'); else copyText(quoteText(qt), 'تم نسخ ملخص العرض للواتساب'); return; }
      const pb = t.closest('[data-pdf],[data-share]');
      if (pb) { pb.disabled = true; try { await exportPdf(main.querySelector('[data-paper]'), fname, { share: pb.matches('[data-share]') }); } finally { pb.disabled = false; } return; }
      const s = t.closest('[data-status]'); if (s) { await put(`/api/quotes/${qt.id}`, { status: s.dataset.status }); toast('تم تحديث الحالة'); return refresh(); }
      if (t.closest('[data-dup]')) { const r = await post(`/api/quotes/${qt.id}/duplicate`, {}); toast('تم إنشاء نسخة جديدة'); return go(`#/quotes/${r.id}/edit`); }
      if (t.closest('[data-del]') && await confirmBox('حذف عرض السعر؟', { danger: true, ok: 'حذف' })) { await del(`/api/quotes/${qt.id}`); toast('تم الحذف'); return go('#/quotes'); }
      if (t.closest('[data-convert]')) {
        const r = await formSheet({ title: 'تحويل العرض المقبول', submit: 'تحويل', body: html`<p class="muted small" style="margin:0">سيتم ${qt.client_id ? 'إضافة اشتراك جديد للعميل' : 'إنشاء عميل جديد باشتراك'} بقيمة ${money(qt.total)} وبيانات العرض دون إعادة إدخال.</p>
          <div class="grid-2">${field('بداية الاشتراك', inp('start_date', new Date().toISOString().slice(0, 10), { type: 'date' }))}${field('المدة (أشهر)', inp('duration_months', 1, { type: 'number', step: 'any', min: 0.5 }))}</div>`,
          onSubmit: (d) => post(`/api/quotes/${qt.id}/convert`, d) });
        if (r?.client_id) { invalidate('clients'); toast('تم التحويل بنجاح'); go(`#/clients/${r.client_id}`); }
      }
    } catch (err) { toast(err.message, 'err'); }
  });
}
