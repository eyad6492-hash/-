import { html, mount, empty } from '../ui.js';
import { get, qs } from '../api.js';
import { setTitle, go } from '../app.js';
import { periodChips, bindPeriod, periodFromQuery, periodLabel, attendanceRow, attendanceSummaryCards } from './common.js';

export async function render(view, { query, isCurrent }) {
  setTitle('سجل الحضور');
  const p = periodFromQuery(query, 'month');
  const d = await get('/api/me/attendance' + qs({ from: p.from, to: p.to }));
  if (!isCurrent()) return;
  mount(view, html`
    <div class="page-head"><div><h2>سجل الحضور</h2><p>${periodLabel(p)}</p></div></div>
    ${periodChips(p)}
    <div style="margin:14px 0">${attendanceSummaryCards(d.summary)}</div>
    <div class="list">${d.rows.length ? d.rows.map(attendanceRow) : empty('لا توجد بيانات')}</div>`);
  bindPeriod(view, p, (o) => go('#/me/attendance' + qs({ type: o.type, from: o.type === 'custom' ? o.from : '', to: o.type === 'custom' ? o.to : '' })));
}
