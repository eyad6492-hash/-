import { html, icon, mount, dateTime, empty, sheet, sel } from '../ui.js';
import { get, qs } from '../api.js';
import { setTitle, go } from '../app.js';

const ENT = { user: 'المستخدمون', rate: 'النسب', schedule: 'الدوام', schedule_override: 'دوام يوم', attendance: 'الحضور', invoice: 'الفواتير', payment: 'الدفعات', leave: 'الإجازات', report: 'التقارير', closure: 'الإغلاق', settings: 'الإعدادات', location: 'الموقع' };
export async function render(view, { query, isCurrent }) {
  setTitle('سجل العمليات');
  const d = await get('/api/audit' + qs({ entity: query.entity, q: query.q, from: query.from, to: query.to, before: query.before }));
  if (!isCurrent()) return;
  mount(view, html`
    <div class="page-head"><div><h2>سجل العمليات</h2><p>من قام بالعملية، نوعها، وقتها، والبيانات قبل وبعد</p></div></div>
    <form class="toolbar" data-f>${sel('entity', ENT, query.entity || '', { empty: 'كل الأنواع' })}<input name="q" placeholder="بحث بالعملية أو الاسم" value="${query.q || ''}"><input type="date" name="from" value="${query.from || ''}"><input type="date" name="to" value="${query.to || ''}"><button class="btn sm primary">بحث</button></form>
    <div class="list">${d.items.length ? d.items.map((a) => html`<div class="row click" data-id="${a.id}"><div class="main"><div class="t">${a.action}</div>
      <div class="s"><span>${a.user_name || 'النظام'}</span><span>${dateTime(a.created_at)}</span>${a.entity ? html`<span class="badge">${ENT[a.entity] || a.entity}</span>` : ''}${a.reason ? html`<span class="warn-t">${a.reason}</span>` : ''}</div></div>${icon('chevL', 'sm')}</div>`) : empty('لا توجد عمليات', 'history')}</div>
    ${d.items.length === 100 ? html`<a class="btn ghost block" style="margin-top:10px" href="#/audit${qs({ ...query, before: d.items[99].created_at })}">الأقدم</a>` : ''}`);
  view.querySelector('[data-f]').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; go('#/audit' + qs({ entity: f.entity.value, q: f.q.value, from: f.from.value, to: f.to.value })); });
  view.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => {
    const a = d.items.find((x) => x.id === r.dataset.id);
    const pretty = (s) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };
    sheet({ title: a.action, wide: true, body: html`<dl class="kv"><dt>بواسطة</dt><dd>${a.user_name}</dd><dt>الوقت</dt><dd>${dateTime(a.created_at)}</dd><dt>النوع</dt><dd>${ENT[a.entity] || a.entity || '—'}</dd><dt>المعرف</dt><dd class="num">${a.entity_id || '—'}</dd>${a.reason ? html`<dt>السبب</dt><dd>${a.reason}</dd>` : ''}<dt>IP</dt><dd class="num">${a.ip || '—'}</dd></dl>
      ${a.before_json ? html`<h4>قبل</h4><pre class="ltr" style="white-space:pre-wrap;font-size:12px;background:#000;padding:10px;border-radius:10px;text-align:left;max-height:240px;overflow:auto">${pretty(a.before_json)}</pre>` : ''}
      ${a.after_json ? html`<h4>بعد</h4><pre class="ltr" style="white-space:pre-wrap;font-size:12px;background:#000;padding:10px;border-radius:10px;text-align:left;max-height:240px;overflow:auto">${pretty(a.after_json)}</pre>` : ''}` });
  }));
}
