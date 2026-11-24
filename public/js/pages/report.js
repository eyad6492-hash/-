import { html, icon, mount, n, fixed, date, kpi, toast, copyText, confirmBox } from '../ui.js';
import { get, del } from '../api.js';
import { can, setTitle, go, state, identitySrc } from '../app.js';
import { computeMetrics } from '../shared.js';
import { exportPdf } from '../pdf.js';
import { waLink } from './client.js';

const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
function delta(cur, prev, invert = false) {
  if (cur === null || cur === undefined || prev === null || prev === undefined || !prev) return '';
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  if (!Number.isFinite(p) || Math.abs(p) < 0.5) return '';
  const good = invert ? p < 0 : p > 0;
  return html` <span class="${good ? 'delta-up' : 'delta-down'}">${p > 0 ? '▲' : '▼'}${Math.abs(p).toFixed(0)}%</span>`;
}

/** The printable report card (used in preview, view and PDF). */
export function reportPaper(r, prev) {
  const m = computeMetrics(r), pm = prev ? computeMetrics(prev) : {};
  const notes = lines(r.notes), recs = lines(r.recommendations);
  const cur = state.settings.currency_symbol || 'ر.س';
  const show = state.settings.report_show_identity !== false;
  return html`<div class="paper" data-paper>
    <div class="p-head">
      ${show ? html`<img src="${identitySrc()}" alt="">` : ''}
      <div class="grow"><h2>تقرير أداء الحملة الإعلانية</h2><div class="p-meta"><b>${r.client_name || ''}</b>${r.store_name && r.store_name !== r.client_name ? ` • ${r.store_name}` : ''}</div>
        <div class="p-meta">${r.platform} • الفترة: ${date(r.period_from)} – ${date(r.period_to)}</div></div>
      ${r.logo ? html`<img src="${r.logo}" alt="" style="width:52px;height:52px;border-radius:12px">` : ''}
    </div>
    <div class="p-grid">
      <div class="p-cell"><div class="k">المبيعات</div><div class="v"><span class="num">${n(r.sales)}</span> <small style="font-size:12px">${cur}</small>${delta(r.sales, prev?.sales)}</div></div>
      <div class="p-cell"><div class="k">الإنفاق</div><div class="v"><span class="num">${n(r.spend)}</span> <small style="font-size:12px">${cur}</small></div></div>
      <div class="p-cell"><div class="k">ROAS</div><div class="v num">${kpi.roas(m.roas)}${delta(m.roas, pm.roas)}</div></div>
      <div class="p-cell"><div class="k">الطلبات</div><div class="v num">${n(r.orders)}${delta(r.orders, prev?.orders)}</div></div>
    </div>
    <div class="p-grid4">
      <div class="p-cell alt"><div class="k">المشاهدات</div><div class="v num">${n(r.impressions)}</div></div>
      <div class="p-cell alt"><div class="k">النقرات</div><div class="v num">${n(r.clicks)}</div></div>
      <div class="p-cell alt"><div class="k">CPA</div><div class="v num">${kpi.cpa(m.cpa)}${delta(m.cpa, pm.cpa, true)}</div></div>
      <div class="p-cell alt"><div class="k">CTR</div><div class="v num">${kpi.ctr(m.ctr)}</div></div>
      <div class="p-cell alt"><div class="k">CPC</div><div class="v num">${kpi.cpc(m.cpc)}</div></div>
      <div class="p-cell alt"><div class="k">CPM</div><div class="v num">${kpi.cpm(m.cpm)}</div></div>
      <div class="p-cell alt"><div class="k">معدل التحويل</div><div class="v num">${kpi.cvr(m.cvr)}</div></div>
      <div class="p-cell alt"><div class="k">الميزانية اليومية</div><div class="v num">${n(r.daily_budget)}</div></div>
    </div>
    ${r.summary ? html`<div class="p-sec"><h4>📊 ملخص الأداء</h4><p>${r.summary}</p></div>` : ''}
    ${notes.length ? html`<div class="p-sec"><h4>📈 ملاحظات الأداء</h4><ul>${notes.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
    ${recs.length ? html`<div class="p-sec"><h4>💡 التوصيات</h4><ul>${recs.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
    ${prev ? html`<div class="p-sec"><p style="font-size:12px;color:#6b7097">مقارنة بالتقرير السابق (${date(prev.period_from)} – ${date(prev.period_to)})</p></div>` : ''}
    <div class="p-foot"><span>${state.settings.provider_name || state.user?.display_name || ''} ${state.settings.provider_title ? '• ' + state.settings.provider_title : ''}</span><span>${state.settings.report_footer || ''}</span></div>
  </div>`;
}

export function whatsappText(r) {
  const m = computeMetrics(r), cur = 'ريال';
  const out = ['*تقرير أداء الحملة الإعلانية*', '', `العميل: ${r.client_name}`, '', `الفترة: ${date(r.period_from)} - ${date(r.period_to)}`, '', `المنصة: ${r.platform}`, ''];
  const add = (l, v) => { if (v !== null && v !== undefined && v !== '—') out.push(`${l}: ${v}`, ''); };
  add('المصروف الإعلاني', r.spend != null ? `${n(r.spend)} ${cur}` : null);
  add('المشاهدات', r.impressions != null ? n(r.impressions) : null);
  add('النقرات', r.clicks != null ? n(r.clicks) : null);
  add('الطلبات', r.orders != null ? n(r.orders) : null);
  add('قيمة المبيعات', r.sales != null ? `${n(r.sales)} ${cur}` : null);
  add('ROAS', m.roas !== null ? `${fixed(m.roas)}x` : null);
  add('CPA', m.cpa !== null ? `${fixed(m.cpa)} ${cur}` : null);
  add('CPC', m.cpc !== null ? `${fixed(m.cpc)} ${cur}` : null);
  add('CTR', m.ctr !== null ? `${fixed(m.ctr)}%` : null);
  if (r.summary || r.notes) out.push('*ملخص الأداء:*', '', [r.summary, ...lines(r.notes).map((x) => `• ${x}`)].filter(Boolean).join('\n'), '');
  if (r.recommendations) out.push('*التوصيات:*', '', lines(r.recommendations).map((x) => `• ${x}`).join('\n'));
  return out.join('\n').trim();
}

export default async function reportPage(main, { id }, q, stale) {
  const { report: r, previous } = await get(`/api/reports/${id}`);
  if (stale()) return;
  setTitle('التقرير الجاهز');
  const client = await get(`/api/clients/${r.client_id}`).then((d) => d.client).catch(() => null);
  const fname = `تقرير-${r.client_name}-${r.period_to}.pdf`.replace(/\s+/g, '-');
  mount(main, html`
    ${q.saved ? html`<div class="success-banner" style="margin-bottom:12px">${icon('checkCircle')} تم إنشاء التقرير بنجاح</div>` : ''}
    <div style="max-width:720px;margin:0 auto">
      ${reportPaper(r, previous)}
      <div class="grid-3" style="margin-top:14px">
        <button class="btn success" data-wa>${icon('whatsapp')} نسخ للواتساب</button>
        <button class="btn ghost" data-share>${icon('share')} مشاركة</button>
        <button class="btn primary" data-pdf>${icon('download')} PDF تنزيل</button>
      </div>
      <div class="grid-4" style="margin-top:10px">
        <button class="btn sm ghost" data-copy>${icon('copy', 'sm')} نسخ النص</button>
        ${client?.phone ? html`<a class="btn sm ghost" target="_blank" rel="noopener" href="${waLink(client.phone, whatsappText(r))}">${icon('send', 'sm')} إرسال</a>` : html`<span></span>`}
        ${can('reports.create') ? html`<a class="btn sm ghost" href="#/reports/${r.id}/edit">${icon('edit', 'sm')} تعديل</a><button class="btn sm danger" data-del>${icon('trash', 'sm')} حذف</button>` : ''}
      </div>
      <div class="section"><a class="link" href="#/clients/${r.client_id}?tab=reports">${icon('history', 'sm')} التقارير السابقة لهذا العميل</a></div>
    </div>`);
  main.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-wa]')) return copyText(whatsappText(r), 'تم نسخ التقرير — الصقه في واتساب');
    if (t.closest('[data-copy]')) return copyText(whatsappText(r).replace(/\*/g, ''), 'تم نسخ نص التقرير');
    const pdfBtn = t.closest('[data-pdf],[data-share]');
    if (pdfBtn) {
      if (pdfBtn.matches('[data-share]') && !navigator.canShare && navigator.share) { try { await navigator.share({ title: 'تقرير أداء', text: whatsappText(r) }); } catch {} return; }
      pdfBtn.disabled = true;
      try { await exportPdf(main.querySelector('[data-paper]'), fname, { share: pdfBtn.matches('[data-share]') }); } catch (err) { toast(err.message, 'err'); } finally { pdfBtn.disabled = false; }
      return;
    }
    if (t.closest('[data-del]') && await confirmBox('حذف هذا التقرير؟', { danger: true, ok: 'حذف' })) { await del(`/api/reports/${r.id}`); toast('تم حذف التقرير'); go('#/reports'); }
  });
}
