import { html, icon, mount, money, n, logo, date, empty, raw } from '../ui.js';
import { get } from '../api.js';
import { can, setTitle, refresh } from '../app.js';
import { PAY_METHODS, PAY_TYPES, PAY_STATUS, addDays } from '../shared.js';
import { paymentForm, today } from '../forms.js';
import { PAY_BADGE } from './client.js';

export default async function paymentsPage(main, _p, q, stale) {
  setTitle('المدفوعات والتحصيل');
  const [{ items: pays }, { items: clients }] = await Promise.all([get('/api/payments'), get('/api/clients')]);
  if (stale()) return;
  const t = today(), month = t.slice(0, 7), year = t.slice(0, 4);
  const subs = clients.filter((c) => c.sub && c.sub.amount > 0);
  const sum = (a) => a.reduce((s, x) => s + (Number(x) || 0), 0);
  const late = subs.filter((c) => c.sub.pay_status === 'late');
  const withDue = subs.filter((c) => c.sub.remaining > 0.009);
  const partial = subs.filter((c) => c.sub.partial);
  const soon = subs.filter((c) => c.sub.pay_status === 'due' || (c.sub.days_left >= 0 && c.sub.days_left <= 7));
  let tab = q.tab || 'board';
  const stats = {
    total: sum(subs.map((c) => c.sub.amount)), paid: sum(subs.map((c) => c.sub.paid)), due: sum(withDue.map((c) => c.sub.remaining)), late: sum(late.map((c) => c.sub.remaining)),
    month: sum(pays.filter((p) => p.date.startsWith(month)).map((p) => p.amount)), year: sum(pays.filter((p) => p.date.startsWith(year)).map((p) => p.amount)),
  };
  const tile = (l, v, ic, c) => html`<div class="tile ${c}" style="cursor:default"><div class="t-body"><div class="t-label">${l}</div><div class="t-value">${raw(`<small>ر.س</small><span class="num">${n(v, 0)}</span>`)}</div></div><span class="t-icon">${icon(ic)}</span></div>`;
  const cRow = (c, extra) => html`<a class="item" href="#/clients/${c.id}?tab=payments">${logo(c)}<div class="it-body"><div class="it-title">${c.name}</div><div class="it-sub">المتبقي ${money(c.sub.remaining, 0)} من ${money(c.sub.amount, 0)} • يستحق ${date(addDays(c.sub.start_date, 0))}</div></div>${extra || html`<span class="badge ${PAY_BADGE[c.sub.pay_status]}">${PAY_STATUS[c.sub.pay_status]}</span>`}</a>`;
  mount(main, html`
    <div class="tiles">
      ${tile('إجمالي قيمة الاشتراكات الحالية', stats.total, 'receipt', 't-purple')}${tile('إجمالي المدفوع', stats.paid, 'coins', 't-green')}
      ${tile('إجمالي المتبقي / المستحقات', stats.due, 'wallet', 't-gold')}${tile('المبالغ المتأخرة', stats.late, 'alert', 't-red')}
      ${tile('المدفوع خلال الشهر', stats.month, 'calendar', 't-blue')}${tile('المدفوع خلال السنة', stats.year, 'trending', 't-teal')}
    </div>
    <div class="row" style="margin-top:14px"><div class="seg grow" style="display:flex"><button class="grow ${tab === 'board' ? 'active' : ''}" data-tab="board">لوحة التحصيل</button><button class="grow ${tab === 'log' ? 'active' : ''}" data-tab="log">سجل الدفعات</button></div>
      ${can('payments.create') ? html`<button class="btn primary" data-add>${icon('plus')} دفعة</button>` : ''}</div>
    <div data-panel style="margin-top:12px"></div>`);
  const panel = main.querySelector('[data-panel]');
  const sec = (title, arr, badge) => html`<div class="section"><div class="section-head"><h3>${title}</h3><span class="badge ${badge}">${arr.length}</span></div><div class="list grid-auto">${arr.length ? arr.map((c) => cRow(c)) : html`<p class="muted small" style="margin:0 4px">لا يوجد</p>`}</div></div>`;
  const draw = () => {
    if (tab === 'board') mount(panel, html`${sec('العملاء المتأخرون', late, 'b-red')}${sec('عملاء لديهم مستحقات', withDue, 'b-gold')}${sec('دفعوا جزئيًا', partial, 'b-purple')}${sec('مستحق عليهم الدفع قريبًا', soon.filter((c) => c.sub.remaining > 0), 'b-blue')}`);
    else mount(panel, pays.length ? html`<div class="list">${pays.map((p) => html`<a class="item" href="#/clients/${p.client_id}?tab=payments">${logo({ name: p.client_name, logo: p.logo }, 'sm')}<div class="it-body"><div class="it-title">${p.client_name}</div><div class="it-sub">${date(p.date)} • ${PAY_METHODS[p.method]} • ${PAY_TYPES[p.type]}${p.period ? ' • ' + p.period : ''}</div></div><b style="color:#4ade80">${money(p.amount)}</b></a>`)}</div>` : empty('لا توجد دفعات مسجلة', 'coins'));
  };
  draw();
  main.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; main.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b)); draw(); return; }
    if (e.target.closest('[data-add]')) { if (await paymentForm({})) refresh(); }
  });
}
