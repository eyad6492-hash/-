import { html, icon, mount, date, dateTime, badge, toast } from '../ui.js';
import { get, post } from '../api.js';
import { setTitle, can } from '../app.js';
import { reportHtml, fitPreview } from './report-render.js';

const ACT = { issued: 'إصدار', sent: 'إرسال', resent: 'إعادة إرسال', viewed: 'فتح الموظف للتقرير', downloaded: 'تنزيل' };
export async function render(view, { params, isCurrent }) {
  setTitle('التقرير');
  const d = await get(`/api/employee-reports/${params.id}`);
  if (!isCurrent()) return;
  const r = d.report, admin = can('employee_reports.manage') && location.hash.startsWith('#/emp-reports');
  mount(view, html`
    <a class="back" href="${admin ? '#/emp-reports' : '#/me/reports'}">${icon('arrowR', 'sm')} رجوع</a>
    <div class="page-head"><div><h2>تقرير #<span class="num">${r.number}</span> — ${r.full_name}</h2><p class="num">${r.date_from} → ${r.date_to}</p></div>
      <div class="actions">${admin ? badge(r.status) : ''}
        ${r.pdf_file_id ? html`<a class="btn primary" href="/api/files/${r.pdf_file_id}?download=MrVibe-report-${r.number}.pdf">${icon('download', 'sm')} تنزيل PDF</a><a class="btn" href="/api/files/${r.pdf_file_id}" target="_blank" rel="noopener">${icon('eye', 'sm')} فتح PDF</a>` : ''}
        ${admin && r.pdf_file_id ? html`<button class="btn" data-send>${icon('send', 'sm')} ${r.send_count ? 'إعادة الإرسال' : 'إرسال للموظف'}</button>` : ''}</div></div>
    ${admin ? html`<div class="card" style="margin-bottom:12px"><h3>سجل التقرير</h3><div class="list">${d.trail.map((t) => html`<div class="row"><div class="main"><div class="t">${ACT[t.action] || t.action}</div><div class="s"><span>${t.full_name || ''}</span><span>${dateTime(t.created_at)}</span></div></div></div>`)}</div></div>` : ''}
    <div class="rpt-preview"><div>${reportHtml(d.snapshot, { periodType: r.period_type, includeImages: !!r.include_images })}</div></div>`);
  const box = view.querySelector('.rpt-preview'); fitPreview(box); setTimeout(() => fitPreview(box), 500);
  view.querySelector('[data-send]')?.addEventListener('click', async (e) => { e.currentTarget.disabled = true; await post(`/api/employee-reports/${r.id}/send`); toast('تم الإرسال'); render(view, { params, isCurrent }); });
}
