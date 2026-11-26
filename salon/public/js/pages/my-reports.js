import { html, icon, mount, date, dateTime, empty } from '../ui.js';
import { get } from '../api.js';
import { setTitle } from '../app.js';

const TYPE = { day: 'يومي', week: 'أسبوعي', month: 'شهري', custom: 'فترة مخصصة' };
export async function render(view, { isCurrent }) {
  setTitle('تقاريري');
  const d = await get('/api/me/reports');
  if (!isCurrent()) return;
  mount(view, html`
    <div class="page-head"><div><h2>تقاريري</h2><p>التقارير التي أصدرتها الإدارة لك</p></div></div>
    <div class="list">${d.items.length ? d.items.map((r) => html`<div class="row">
      <span class="thumb" style="display:grid;place-items:center;color:var(--gold-2)">${icon('file')}</span>
      <a class="main" href="#/me/reports/${r.id}"><div class="t">تقرير ${TYPE[r.period_type]} • ${date(r.date_from)}${r.date_to !== r.date_from ? ' → ' + date(r.date_to) : ''}</div>
        <div class="s"><span>رقم <span class="num">${r.number}</span></span><span>وصل ${dateTime(r.sent_at)}</span>${!r.viewed_at ? html`<span class="badge gold">جديد</span>` : ''}</div></a>
      <div class="end" style="display:flex;gap:6px"><a class="btn sm" href="#/me/reports/${r.id}">${icon('eye', 'sm')} فتح</a>
        <a class="btn sm primary" href="/api/files/${r.pdf_file_id}?download=MrVibe-report-${r.number}.pdf">${icon('download', 'sm')}</a></div></div>`) : empty('لا توجد تقارير بعد', 'file')}</div>`);
}
