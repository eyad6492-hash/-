import { html, icon, mount, money, moneyText, logo, date, empty, relDays } from '../ui.js';
import { get } from '../api.js';
import { can, setTitle, refresh } from '../app.js';
import { PAY_STATUS, SUB_STATUS, dueLabel } from '../shared.js';
import { paymentForm } from '../forms.js';
import { PAY_BADGE, waLink } from './client.js';

const FILTERS = [['week', 'خلال 7 أيام'], ['today', 'اليوم'], ['3', 'خلال 3 أيام'], ['30', 'خلال 30 يومًا'], ['late', 'المتأخرة'], ['unpaid', 'غير المدفوعة'], ['paid', 'المدفوعة'], ['all', 'الكل']];
let filter = 'week';

export default async function upcomingPage(main, _p, q, stale) {
  setTitle('الدفعات القادمة');
  const { items } = await get('/api/payments/upcoming');
  if (stale()) return;
  if (q.f) filter = q.f;
  const within = (r, n) => r.next_due && r.days_to_due !== null && r.days_to_due <= n && r.status !== 'paid';
  const match = {
    today: (r) => r.next_due && r.days_to_due <= 0 && r.status !== 'paid',
    3: (r) => within(r, 3), week: (r) => within(r, 7), 30: (r) => within(r, 30),
    late: (r) => r.status === 'late', unpaid: (r) => !['paid', 'frozen'].includes(r.status), paid: (r) => r.status === 'paid', all: () => true,
  };
  const total = (list) => list.reduce((s, r) => s + (r.status === 'late' ? r.owed_now : r.amount_due || 0), 0);
  const late = items.filter(match.late), soon = items.filter(match.week);
  mount(main, html`
    <div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <div class="tile t-red" data-f="late"><div class="t-body"><div class="t-label">متأخرة</div><div class="t-value num">${late.length}</div><div class="xs">${moneyText(total(late))}</div></div></div>
      <div class="tile t-gold" data-f="week"><div class="t-body"><div class="t-label">خلال 7 أيام</div><div class="t-value num">${soon.length}</div><div class="xs">${moneyText(total(soon))}</div></div></div>
      <div class="tile t-green" data-f="paid"><div class="t-body"><div class="t-label">مدفوعة</div><div class="t-value num">${items.filter(match.paid).length}</div></div></div>
    </div>
    <div class="chips" style="margin-top:14px">${FILTERS.map(([k, l]) => html`<button class="chip ${filter === k ? 'active' : ''}" data-f="${k}">${l} <span class="cnt">${items.filter(match[k]).length}</span></button>`)}</div>
    <div class="list" data-list style="margin-top:12px"></div>`);
  const draw = () => {
    const r = items.filter(match[filter]);
    mount(main.querySelector('[data-list]'), r.length ? r.map((x) => html`<div class="card flat" style="padding:12px" data-id="${x.client_id}">
      <div class="row">${logo(x)}<div class="grow" style="min-width:0"><div class="bold ellipsis">${x.name}</div><div class="xs muted ellipsis">${[x.store_name, x.phone].filter(Boolean).join(' • ') || '—'}</div></div>
        <span class="badge ${PAY_BADGE[x.status]}">${x.status === 'frozen' ? PAY_STATUS.frozen : dueLabel(x.status, x.days_to_due)}${x.partial ? ' • جزئي' : ''}</span></div>
      <div class="grid-3" style="margin-top:10px;text-align:center">
        <div><div class="xs muted">الاشتراك${x.cycle_days ? ` / ${x.cycle_days} يوم` : x.monthly ? ' الشهري' : ''}</div><div class="bold">${x.amount_unset ? html`<span style="color:var(--gold)">غير محدد</span>` : money(x.monthly ?? x.one_time_amount, 0)}</div></div>
        <div><div class="xs muted">المدفوع</div><div class="bold" style="color:#4ade80">${x.amount_unset || x.current_paid == null ? '—' : money(x.current_paid, 0)}</div></div>
        <div><div class="xs muted">المتبقي</div><div class="bold" style="color:${x.status === 'paid' ? 'inherit' : '#fb7185'}">${x.amount_unset || x.status === 'frozen' ? '—' : money(x.owed_now > 0 ? x.owed_now : ['due', 'late'].includes(x.status) ? x.amount_due : 0, 0)}</div></div>
      </div>
      <div class="grid-3" style="margin-top:8px;text-align:center">
        <div><div class="xs muted">التحصيل القادم</div><div class="bold small">${x.next_due ? date(x.next_due) : '—'}</div></div>
        <div><div class="xs muted">حالة الاشتراك</div><div class="small bold">${SUB_STATUS[x.sub_state] || x.sub_state}</div></div>
        <div><div class="xs muted">الموعد</div><div class="bold small" style="color:${x.days_to_due < 0 ? '#fb7185' : x.days_to_due <= 3 ? 'var(--gold)' : 'inherit'}">${x.next_due ? relDays(x.days_to_due) : '—'}</div></div>
      </div>
      ${x.periods_due > 1 ? html`<div class="xs" style="color:#fb7185;margin-top:6px">${x.periods_due} دفعات شهرية متأخرة</div>` : ''}
      ${x.pay_alert_enabled ? html`<div class="xs muted" style="margin-top:4px">${icon('bell', 'sm')} تنبيه قبل ${x.pay_alert_days} أيام</div>` : ''}
      <div class="grid-3" style="margin-top:10px">
        ${can('payments.create') ? html`<button class="btn sm success" data-pay>${icon('coins', 'sm')} تسجيل الدفع</button>` : html`<span></span>`}
        ${x.phone ? html`<a class="btn sm ghost" target="_blank" rel="noopener" href="${waLink(x.phone, `السلام عليكم ${x.name}، نذكركم بموعد دفعة الاشتراك ${x.next_due ? `بتاريخ ${date(x.next_due)}` : ''} بمبلغ ${moneyText(x.status === 'late' ? x.owed_now : x.amount_due)}. شكرًا لكم 🌹`)}">${icon('whatsapp', 'sm')} تواصل</a>` : html`<span></span>`}
        <a class="btn sm ghost" href="#/clients/${x.client_id}?tab=payments">${icon('user', 'sm')} الملف</a></div></div>`) : empty('لا توجد دفعات في هذا التصنيف', 'coins'));
  };
  draw();
  main.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-f]');
    if (f) { filter = f.dataset.f; main.querySelectorAll('.chip[data-f]').forEach((b) => b.classList.toggle('active', b.dataset.f === filter)); draw(); return; }
    if (e.target.closest('[data-pay]')) {
      const x = items.find((i) => i.client_id === e.target.closest('[data-id]').dataset.id);
      if (await paymentForm({ client_id: x.client_id, remaining: x.status === 'late' ? x.owed_now : 0, amount_due: x.amount_due, next_due: x.next_due })) refresh();
    }
  });
}
