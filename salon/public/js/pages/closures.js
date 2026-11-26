// Day closing & per-employee period closing with frozen summaries; reopen with documented reason.
import { html, icon, mount, money, date, dateTime, badge, empty, toast, formSheet, field, inp, ta, sel, sheet, confirmBox } from '../ui.js';
import { get, post, qs, lookups } from '../api.js';
import { setTitle, can, state, refresh } from '../app.js';
import { periodRange } from '../shared.js';

export async function render(view, { isCurrent }) {
  setTitle('إغلاق الأيام والفترات');
  const d = await get('/api/closures');
  if (!isCurrent()) return;
  mount(view, html`
    <div class="page-head"><div><h2>إغلاق الأيام والفترات المالية</h2><p>تثبيت الملخص ومنع التعديل بعد الإغلاق إلا بصلاحية مع توثيق</p></div>
      ${can('closures.manage') ? html`<div class="actions"><button class="btn primary" data-day>${icon('closeLock', 'sm')} إغلاق يوم</button><button class="btn" data-period>${icon('calendar', 'sm')} إغلاق فترة موظف</button></div>` : ''}</div>
    <div class="list">${d.items.length ? d.items.map((c) => html`<div class="row click" data-id="${c.id}">
      <span class="thumb" style="display:grid;place-items:center;color:var(--gold-2)">${icon(c.kind === 'day' ? 'closeLock' : 'calendar')}</span>
      <div class="main"><div class="t">${c.kind === 'day' ? `إغلاق يوم ${date(c.date_from)}` : `فترة ${c.full_name}: ${date(c.date_from)} → ${date(c.date_to)}`}</div>
        <div class="s"><span>${c.closed_by_name} • ${dateTime(c.closed_at)}</span>${c.reopened_at ? html`<span class="warn-t">أعيد فتحه: ${c.reopen_reason} (${c.reopened_by_name})</span>` : ''}</div></div>
      <div class="end">${badge(c.status)}</div></div>`) : empty('لا توجد إغلاقات بعد', 'closeLock')}</div>`);

  view.querySelector('[data-day]')?.addEventListener('click', () => {
    let previewed = null;
    formSheet({
      title: 'إغلاق يوم مالي', submit: 'إغلاق اليوم', wide: true,
      body: html`${field('اليوم', inp('date', state.today, { type: 'date', req: true }))}<div data-prev class="hint">جارٍ تحميل الملخص…</div>${field('ملاحظة', inp('note', ''))}`,
      onMount: (el) => { const load = async () => { const s = (await get('/api/closures/preview' + qs({ kind: 'day', date: el.querySelector('[name=date]').value }))).summary; previewed = s; el.querySelector('[data-prev]').innerHTML = String(daySummaryHtml(s)); }; el.querySelector('[name=date]').addEventListener('change', load); load(); },
      onSubmit: async (b) => {
        try { await post('/api/closures', { kind: 'day', ...b }); }
        catch (e) { if (e.code !== 'pending_invoices') throw e; if (!(await confirmBox(e.message, { ok: 'إغلاق رغم ذلك' }))) return false; await post('/api/closures', { kind: 'day', ...b, force: true }); }
        toast('تم إغلاق اليوم'); refresh();
      },
    });
  });
  view.querySelector('[data-period]')?.addEventListener('click', async () => {
    const staff = (await lookups.staff()).filter((s) => s.works_shifts);
    const m = periodRange('month', state.today);
    formSheet({
      title: 'إغلاق فترة / شهر لموظف', submit: 'إغلاق الفترة', wide: true,
      body: html`${field('الموظف', sel('user_id', staff.map((s) => ({ v: s.id, l: s.full_name })), '', { req: true, empty: 'اختر' }))}
        <div class="form-grid two">${field('من', inp('from', m.from, { type: 'date', req: true }))}${field('إلى', inp('to', state.today, { type: 'date', req: true }))}</div>
        <div data-prev class="hint">اختر الموظف لعرض كشف الحساب.</div>${field('ملاحظة', inp('note', ''))}`,
      onMount: (el) => {
        const load = async () => { const u = el.querySelector('[name=user_id]').value; if (!u) return; try { const s = (await get('/api/closures/preview' + qs({ kind: 'period', user_id: u, from: el.querySelector('[name=from]').value, to: el.querySelector('[name=to]').value }))).summary; el.querySelector('[data-prev]').innerHTML = String(statementHtml(s)); } catch (e) { el.querySelector('[data-prev]').textContent = e.message; } };
        el.querySelectorAll('[name=user_id],[name=from],[name=to]').forEach((x) => x.addEventListener('change', load));
      },
      onSubmit: async (b) => { await post('/api/closures', { kind: 'period', ...b }); toast('تم إغلاق الفترة وحفظ كشف الحساب'); refresh(); },
    });
  });
  view.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', async () => {
    const c = (await get(`/api/closures/${r.dataset.id}`)).closure;
    sheet({
      title: c.kind === 'day' ? `ملخص يوم ${date(c.date_from)}` : `كشف حساب ${c.full_name}`, wide: true,
      body: html`${c.kind === 'day' ? daySummaryHtml(c.summary) : statementHtml(c.summary)}<div class="sep"></div><small class="muted">نسخة ثابتة محفوظة وقت الإغلاق ${dateTime(c.closed_at)}</small>`,
      foot: c.status === 'closed' && can('closures.override') ? html`<button class="btn danger" data-reopen>${icon('unlock', 'sm')} إعادة فتح</button>` : '',
      onMount: (el, close) => el.querySelector('[data-reopen]')?.addEventListener('click', () => { close(); formSheet({
        title: 'إعادة فتح الفترة', submit: 'إعادة فتح', body: field('السبب *', ta('reason', '', 'يُوثّق في سجل العمليات', 2)),
        onSubmit: async (b) => { await post(`/api/closures/${c.id}/reopen`, b); toast('أعيد الفتح'); refresh(); },
      }); }),
    });
  }));
}

function daySummaryHtml(s) {
  return html`<div class="grid g4" style="gap:8px;margin-bottom:10px"><div><small class="muted">الإيرادات</small><br><b>${money(s.totals.sales)}</b></div><div><small class="muted">الفواتير</small><br><b class="num">${s.totals.count}</b></div>
    <div><small class="muted">مستحقات الحلاقين</small><br><b>${money(s.totals.barber_due)}</b></div><div><small class="muted">حصة المحل</small><br><b class="gold">${money(s.totals.shop_share)}</b></div></div>
    ${s.pending_invoices ? html`<div class="warn-t" style="margin-bottom:8px">${icon('alert', 'sm')} ${s.pending_invoices} فاتورة بانتظار المراجعة</div>` : ''}
    <div class="list">${s.rows.map((r) => html`<div class="row" style="padding:8px 10px"><div class="main"><div class="t">${r.name}</div><div class="s"><span class="num">${r.count} فاتورة</span><span>حلاق ${money(r.barber_due)}</span><span>محل ${money(r.shop_share)}</span></div></div><b>${money(r.sales)}</b></div>`)}</div>`;
}
function statementHtml(s) {
  return html`<dl class="kv"><dt>الرصيد الافتتاحي</dt><dd>${money(s.opening_balance)}</dd><dt>المبيعات</dt><dd>${money(s.period.sales)} (<span class="num">${s.period.count}</span> فاتورة)</dd>
    <dt>مستحق الفترة</dt><dd>${money(s.period.barber_due)}</dd><dt>حصة المحل</dt><dd>${money(s.period.shop_share)}</dd><dt>المدفوع</dt><dd>${money(s.period.paid)}</dd>
    <dt>الرصيد الختامي</dt><dd class="gold">${money(s.closing_balance)}</dd><dt>الحضور</dt><dd>${s.attendance.present_days} يوم • غياب ${s.attendance.absent_days} • تأخير ${s.attendance.late_count}</dd></dl>`;
}
