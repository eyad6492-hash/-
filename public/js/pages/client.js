import { html, raw, icon, mount, money, moneyText, n, logo, date, dateShort, dateTime, empty, toast, sheet, confirmBox, copyText, kpi, relDays } from '../ui.js';
import { get, post, del, put, invalidate, lookups } from '../api.js';
import { can, setTitle, go, refresh, state } from '../app.js';
import { BILLING_MODELS, SUB_TYPES, BILLING_MODES, SUB_STATUS, PAY_STATUS, PAY_METHODS, PAY_TYPES, CAMPAIGN_STATUS, TASK_PRIORITY, TASK_STATUS, RATINGS, QUOTE_STATUS, computeMetrics } from '../shared.js';
import * as F from '../forms.js';
import { statusBadge } from './clients.js';

export const waLink = (phone, text = '') => {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2); else if (p.startsWith('05')) p = '966' + p.slice(1); else if (p.startsWith('5') && p.length === 9) p = '966' + p;
  return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`;
};
const PAY_BADGE = { paid: 'b-green', partial: 'b-gold', unpaid: 'b-red', late: 'b-red', due: 'b-pink', soon: 'b-gold', none: 'b-gray', frozen: 'b-blue' };
const SUB_BADGE = { active: 'b-green', expiring: 'b-gold', expired: 'b-red', frozen: 'b-blue', stopped: 'b-gray', pending_renewal: 'b-purple', ended: 'b-gray' };
const CAMP_BADGE = { active: 'b-green', stopped: 'b-gray', review: 'b-blue', optimize: 'b-gold', rejected: 'b-red', ended: 'b-gray', paused: 'b-purple' };
const PRIO_BADGE = { low: 'b-gray', medium: 'b-blue', high: 'b-gold', urgent: 'b-red' };
const RATE_BADGE = { excellent: 'b-green', good: 'b-cyan', improve: 'b-gold', problem: 'b-red', urgent: 'b-red' };
export { PAY_BADGE, SUB_BADGE, CAMP_BADGE, PRIO_BADGE, RATE_BADGE };

const TABS = [
  ['summary', 'الملخص'], ['info', 'المعلومات والنشاط'], ['campaigns', 'الحملات', 'campaigns.view'], ['accounts', 'الحسابات والمنصات'], ['followups', 'المتابعة'],
  ['tasks', 'المهام', 'tasks.manage'], ['subscription', 'الاشتراك'], ['payments', 'المدفوعات', 'payments.view'], ['reports', 'التقارير'], ['quotes', 'عروض الأسعار', 'quotes.view'],
  ['notes', 'الملاحظات'], ['activity', 'سجل النشاط', 'activity.view'],
];
let lastTab = {};

export default async function clientPage(main, { id }, q, stale) {
  const [d, cats] = await Promise.all([get(`/api/clients/${id}`), lookups.categories()]);
  if (stale()) return;
  const c = d.client, s = c.sub;
  c.category_names = c.category_ids.map((x) => cats.find((k) => k.id === x)?.name).filter(Boolean).join('، ');
  setTitle('تفاصيل العميل');
  let tab = q.tab || lastTab[id] || 'summary';
  const tabs = TABS.filter((t) => !t[2] || can(t[2]));
  const lastPayment = d.payments?.[0];

  mount(main, html`
    <div class="card" style="padding:14px">
      <div class="row" style="align-items:flex-start">
        ${logo(c, 'lg')}
        <div class="grow"><h2 style="margin:0;font-size:20px;font-weight:800">${c.name}</h2>
          <div class="muted small">${[c.store_name, c.business_type].filter(Boolean).join(' • ') || '—'}</div>
          ${c.tenure ? html`<div class="small" style="color:var(--cyan);margin-top:2px">${icon('clock', 'sm')} معك منذ ${c.tenure.label}</div>` : ''}
          <div class="row wrap" style="gap:6px;margin-top:6px">${statusBadge(c.status_display)}${c.flags.filter((f) => f !== c.status_display).slice(0, 3).map((f) => statusBadge(f))}${c.billing_model === 'commission' ? html`<span class="badge b-cyan">نسبة / عمولة</span>` : ''}${c.tags.map((t) => html`<span class="badge b-purple">#${t}</span>`)}</div></div>
        <button class="icon-btn" data-menu aria-label="خيارات">${icon('more')}</button>
      </div>
      <div class="grid-4" style="margin-top:14px">
        ${c.phone ? html`<a class="btn ghost" style="height:58px;flex-direction:column;gap:2px;font-size:12px" href="tel:${c.phone}">${icon('phone')}اتصال</a>` : html`<button class="btn ghost" disabled style="height:58px;flex-direction:column;gap:2px;font-size:12px">${icon('phone')}اتصال</button>`}
        ${c.phone ? html`<a class="btn ghost" style="height:58px;flex-direction:column;gap:2px;font-size:12px" target="_blank" rel="noopener" href="${waLink(c.phone)}">${icon('whatsapp')}واتساب</a>` : html`<button class="btn ghost" disabled style="height:58px;flex-direction:column;gap:2px;font-size:12px">${icon('whatsapp')}واتساب</button>`}
        <button class="btn ghost" style="height:58px;flex-direction:column;gap:2px;font-size:12px" data-act="links">${icon('link')}روابط</button>
        <button class="btn ghost" style="height:58px;flex-direction:column;gap:2px;font-size:12px" data-act="notes">${icon('note')}ملاحظات</button>
      </div>
    </div>
    <div class="section"><div class="tabs" data-tabs>${tabs.map(([k, l]) => html`<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${l}</button>`)}</div></div>
    <div class="section" data-panel></div>`);

  const panel = main.querySelector('[data-panel]');
  const kv = (k, v, ic, color, cls = '') => html`<div class="kv ${cls}"><span class="kv-ic ${color}">${icon(ic, 'sm')}</span><div class="grow"><div class="k">${k}</div><div class="v">${v}</div></div></div>`;
  const qaBtn = (act, ic, color, label, perm) => (!perm || can(perm) ? html`<button data-act="${act}"><span class="q-ic ${color}">${icon(ic)}</span>${label}</button>` : '');

  const panels = {
    summary: () => html`
      ${c.tenure || c.start_date ? html`<div class="card" style="margin-bottom:12px;padding:14px;background:linear-gradient(135deg,rgba(34,211,238,.12),rgba(124,92,255,.12))">
        <div class="row"><span class="kv-ic qc-cyan" style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center">${icon('clock')}</span>
          <div class="grow"><div class="xs muted">العميل منذ ${date(c.start_date)}</div><div class="bold" style="font-size:18px">مدة التعامل: ${c.tenure ? c.tenure.label : 'يبدأ ' + date(c.start_date)}</div>
          ${c.tenure ? html`<div class="xs muted"><span class="num">${c.tenure.total_months}</span> شهر • <span class="num">${n(c.tenure.days, 0)}</span> يوم حتى اليوم</div>` : ''}</div></div></div>` : ''}
      ${s && can('payments.view') ? billingCard() : ''}
      ${c.billing_model === 'commission' && can('payments.view') ? html`<div class="card" style="margin-bottom:12px;padding:14px"><div class="row between"><b>${icon('percent', 'sm')} عميل بنظام نسبة / عمولة</b><span class="badge b-cyan">بدون اشتراك ثابت</span></div>
        <p class="small muted" style="margin:6px 0 10px">لا تُنشأ له دفعات شهرية. سجّل الإيرادات أو النسبة المستحقة عند الحاجة.</p>
        <div class="row between small"><span>إجمالي الإيرادات المسجلة</span><b>${money((d.payments || []).filter((p) => p.type === 'commission').reduce((a, p) => a + p.amount, 0))}</b></div>
        ${can('payments.create') ? html`<button class="btn sm success block" style="margin-top:10px" data-act="payment">${icon('coins', 'sm')} تسجيل إيراد / نسبة</button>` : ''}</div>` : ''}
      <div class="grid-2">
        ${kv('تاريخ الاشتراك', s ? date(s.start_date) : '—', 'calendar', 'qc-purple')}
        ${kv('تاريخ الانتهاء', s ? (s.open ? html`بدون انتهاء<div class="xs muted">اشتراك مفتوح / مستمر</div>` : html`${date(s.end_date)}<div class="xs muted">${s.days_left >= 0 ? `متبقي ${s.days_left} يوم` : `منتهي منذ ${-s.days_left} يوم`}</div>`) : '—', 'calendar', 'qc-pink')}
        ${can('payments.view') ? kv(s?.billing?.monthly ? 'قيمة الاشتراك الشهرية' : 'قيمة الاشتراك', s ? money(s.billing?.monthly || s.amount) : '—', 'receipt', 'qc-blue') : ''}
        ${s ? kv('حالة الاشتراك', html`<span class="badge ${SUB_BADGE[s.state] || 'b-gray'}" style="font-size:14px">${SUB_STATUS[s.state] || s.state}</span>`, 'subs', 'qc-cyan') : ''}
        ${can('payments.view') ? kv('المدفوع', s ? money(s.paid) : '—', 'coins', 'qc-green') : ''}
        ${can('payments.view') ? kv(s?.billing?.monthly ? 'المستحق حاليًا' : 'المتبقي', s ? money(s.remaining) : '—', 'wallet', 'qc-red') : ''}
        ${can('payments.view') && s ? kv('حالة الدفع', html`<span class="badge ${PAY_BADGE[s.pay_status]}" style="font-size:14px">${PAY_STATUS[s.pay_status]}</span>`, 'alert', 'qc-gold', s.pay_status === 'partial' || s.pay_status === 'late' ? 'warn' : '') : ''}
        ${kv('الميزانية اليومية', c.daily_budget ? money(c.daily_budget) : '—', 'target', 'qc-orange')}
        ${kv('الحملات النشطة', n(c.campaigns_active), 'megaphone', 'qc-purple')}
        ${kv('آخر متابعة', c.last_followup ? date(c.last_followup) : '—', 'calendarCheck', 'qc-cyan')}
        ${kv('آخر تقرير', c.last_report ? date(c.last_report) : '—', 'bars', 'qc-blue')}
        ${can('payments.view') ? kv('آخر دفعة', lastPayment ? html`${money(lastPayment.amount)}<div class="xs muted">${date(lastPayment.date)}</div>` : '—', 'banknote', 'qc-green') : ''}
      </div>
      <div class="section card"><div class="section-head"><h3>إجراءات سريعة</h3></div><div class="qa">
        ${qaBtn('payment', 'coins', 'qc-gold', 'تسجيل دفعة', 'payments.create')}
        ${c.status === 'frozen' ? qaBtn('unfreeze', 'play', 'qc-green', 'فك التجميد', 'subscriptions.unfreeze') : qaBtn('freeze', 'pause', 'qc-orange', 'تجميد الاشتراك', 'subscriptions.freeze')}
        ${qaBtn('quote', 'file', 'qc-blue', 'عرض سعر', 'quotes.create')}
        ${qaBtn('report', 'bars', 'qc-cyan', 'إنشاء تقرير', 'reports.create')}
        ${qaBtn('campaign', 'megaphone', 'qc-purple', 'إضافة حملة', 'campaigns.edit')}
        ${qaBtn('renew', 'refresh', 'qc-green', 'تجديد الاشتراك', 'subscriptions.edit')}
        ${qaBtn('task', 'checkSquare', 'qc-pink', 'إضافة مهمة', 'tasks.manage')}
        ${qaBtn('followup', 'calendarCheck', 'qc-cyan', 'متابعة الآن', 'followups.manage')}
        ${qaBtn('notes', 'note', 'qc-gold', 'إضافة ملاحظة')}
        ${qaBtn('copy', 'copy', 'qc-blue', 'نسخ البيانات')}
        ${qaBtn('links', 'link', 'qc-purple', 'فتح الروابط')}
        ${qaBtn('vault', 'key', 'qc-red', 'بيانات الحسابات', 'vault.view')}
        ${qaBtn('alert', 'bell', c.pay_alert_enabled ? 'qc-green' : 'qc-orange', c.pay_alert_enabled ? `تنبيه الدفع (${c.pay_alert_days} أيام)` : 'تنبيه الدفع', 'clients.edit')}
      </div></div>`,

    info: () => html`<div class="card"><div class="kvlist">
      ${[['اسم العميل', c.name], ['المتجر / النشاط', c.store_name], ['نوع النشاط', c.business_type], ['الجوال', c.phone ? html`<a class="num" href="tel:${c.phone}">${c.phone}</a>` : null], ['البريد', c.email],
        ['التصنيفات', c.category_names || null], ['المنصات', c.platforms.join('، ')], ['بداية العمل الفعلي', c.start_date ? date(c.start_date) : null], ['مدة التعامل', c.tenure ? `${c.tenure.label} (${n(c.tenure.days, 0)} يوم)` : null], ['تنبيه الدفع', c.pay_alert_enabled ? `مفعّل — قبل ${c.pay_alert_days} أيام` : 'غير مفعّل'], ['الميزانية اليومية', c.daily_budget ? money(c.daily_budget) : null],
        ['المراجعة كل', `${c.followup_every} يوم`], ['موعد التواصل القادم', c.next_contact_date ? date(c.next_contact_date) : null], ['تاريخ الإضافة', dateTime(c.created_at)],
        ...c.custom_fields.map((x) => [x.label, x.value])].map(([k, v]) => html`<div><span>${k}</span><span>${v || '—'}</span></div>`)}
      </div>${can('clients.edit') ? html`<button class="btn block ghost" style="margin-top:12px" data-act="edit">${icon('edit')} تعديل البيانات</button>` : ''}
      ${state.user.role === 'owner' ? html`<button class="btn block danger" style="margin-top:10px" data-act="delete">${icon('trash')} حذف العميل نهائيًا</button>` : ''}</div>
      ${d.trial ? html`<div class="card"><div class="section-head"><h3>${icon('sparkles', 'sm')} بدأ كعميل تجربة</h3><a href="#/trials/${d.trial.id}">عرض التجربة</a></div><div class="kvlist">
        <div><span>فترة التجربة</span><span>${date(d.trial.start_date)} ← ${date(d.trial.end_date)} (${d.trial.days} أيام)</span></div>
        <div><span>الميزانية اليومية / الإجمالية</span><span>${money(d.trial.daily_budget)} / ${money(d.trial.total_budget)}</span></div>
        ${d.trial.actual_spend != null ? html`<div><span>المصروف الفعلي</span><span>${money(d.trial.actual_spend)}</span></div>` : ''}
        <div><span>تحوّل إلى عميل</span><span>${dateTime(d.trial.converted_at)}</span></div>${d.trial.notes ? html`<div><span>ملاحظات التجربة</span><span>${d.trial.notes}</span></div>` : ''}</div></div>` : ''}`,

    campaigns: () => html`${can('campaigns.edit') ? html`<button class="btn primary block" data-act="campaign">${icon('plus')} إضافة حملة</button>` : ''}
      <div class="list" style="margin-top:10px">${d.campaigns?.length ? d.campaigns.map((k) => { const m = computeMetrics(k); return html`<a class="item" href="#/campaigns/${k.id}"><span class="logo sm" style="background:var(--surface-2);color:var(--pink)">${icon('megaphone', 'sm')}</span><div class="it-body"><div class="it-title">${k.name}</div><div class="it-sub">${k.platform} • مصروف ${n(k.spend)} • ROAS ${kpi.roas(m.roas)} • CPA ${kpi.cpa(m.cpa)}</div></div><span class="badge ${CAMP_BADGE[k.status]}">${CAMPAIGN_STATUS[k.status]}</span></a>`; }) : empty('لا توجد حملات', 'megaphone')}</div>`,

    accounts: () => html`<div class="card"><div class="section-head"><h3>روابط المنصات</h3></div><div class="stack">${linksList()}</div></div>
      ${can('vault.view') ? html`<div class="card"><div class="section-head"><h3>${icon('vault', 'sm')} حسابات الخزنة</h3><a href="#/vault?client=${c.id}">فتح الخزنة</a></div>
        <div class="list">${d.vault?.length ? d.vault.map((v) => html`<a class="item" href="#/vault?client=${c.id}"><span class="logo sm" style="background:var(--surface-2);color:var(--gold)">${icon('key', 'sm')}</span><div class="it-body"><div class="it-title">${v.platform}</div><div class="it-sub">${[v.account_name, v.ad_account_id].filter(Boolean).join(' • ') || '—'}</div></div>${icon('lock', 'sm')}</a>`) : empty('لا توجد حسابات محفوظة لهذا العميل', 'key')}</div></div>` : ''}`,

    followups: () => html`${can('followups.manage') ? html`<button class="btn primary block" data-act="followup">${icon('calendarCheck')} متابعة الآن</button>` : ''}
      <div class="list" style="margin-top:10px">${d.followups.length ? d.followups.map((f) => html`<div class="card flat" style="padding:12px"><div class="row between"><b>${date(f.date)}</b>${f.rating ? html`<span class="badge ${RATE_BADGE[f.rating]}">${RATINGS[f.rating]}</span>` : ''}</div>
        ${f.checklist.length ? html`<div class="row wrap xs" style="gap:4px;margin-top:6px">${f.checklist.filter((x) => x.value !== 'na').map((x) => html`<span class="badge ${x.value === 'yes' ? 'b-green' : 'b-red'}">${x.value === 'yes' ? '✓' : '✗'} ${x.label}</span>`)}</div>` : ''}
        ${f.notes ? html`<p class="small" style="margin:8px 0 0">${f.notes}</p>` : ''}${f.actions ? html`<p class="small muted" style="margin:4px 0 0"><b>الإجراءات:</b> ${f.actions}</p>` : ''}</div>`) : empty('لا يوجد سجل متابعة', 'calendarCheck')}</div>`,

    tasks: () => html`<button class="btn primary block" data-act="task">${icon('plus')} إضافة مهمة</button>
      <div class="list" style="margin-top:10px">${d.tasks.length ? d.tasks.map((t) => html`<div class="item" data-task="${t.id}"><button class="chk ${t.status === 'done' ? 'on' : ''}" data-done="${t.id}">${icon('check', 'sm')}</button><div class="it-body"><div class="it-title" style="${t.status === 'done' ? 'text-decoration:line-through;opacity:.6' : ''}">${t.title}</div><div class="it-sub">${t.due_date ? date(t.due_date) : 'بدون تاريخ'} • ${TASK_STATUS[t.status]}</div></div><span class="badge ${PRIO_BADGE[t.priority]}">${TASK_PRIORITY[t.priority]}</span></div>`) : empty('لا توجد مهام', 'checkSquare')}</div>`,

    subscription: () => html`
      ${s ? html`<div class="card"><div class="row between"><h3 style="margin:0">الاشتراك الحالي</h3><span class="badge ${SUB_BADGE[s.state]}">${SUB_STATUS[s.state]}</span></div>
        <div class="kvlist" style="margin-top:8px">
          <div><span>نوع الاشتراك</span><span>${SUB_TYPES[s.sub_type] || SUB_TYPES.fixed}</span></div>
          <div><span>الفترة</span><span>${date(s.start_date)} ← ${s.open ? 'مستمر بلا انتهاء' : date(s.end_date)}</span></div>
          ${s.open ? '' : html`<div><span>الأيام المتبقية</span><span>${s.days_left >= 0 ? `${s.days_left} يوم` : `منتهي منذ ${-s.days_left} يوم`}</span></div><div><span>المدة</span><span>${n(s.duration_months)} شهر</span></div>`}
          ${s.billing?.monthly ? html`<div><span>القيمة الشهرية</span><span>${money(s.billing.monthly)}</span></div><div><span>يوم الدفع الشهري</span><span>${s.billing.pay_day} من كل شهر</span></div><div><span>طريقة الدفع</span><span>${BILLING_MODES[s.billing_mode] || BILLING_MODES.advance}</span></div>` : ''}
          ${s.next_due ? html`<div><span>موعد الدفعة القادمة</span><span>${date(s.next_due)} <span class="badge ${PAY_BADGE[s.pay_status]}">${PAY_STATUS[s.pay_status]}</span></span></div>` : ''}
          ${can('payments.view') ? html`<div><span>القيمة</span><span>${money(s.amount)}</span></div><div><span>المدفوع / المتبقي</span><span>${money(s.paid)} / ${money(s.remaining)}</span></div>` : ''}
          <div><span>ميزانية الإعلانات</span><span>${s.ad_budget ? money(s.ad_budget) : '—'}</span></div>
          <div><span>الخدمات</span><span>${s.services || '—'}</span></div><div><span>المنصات</span><span>${s.platforms.join('، ') || '—'}</span></div>
          ${s.notes ? html`<div><span>ملاحظات</span><span>${s.notes}</span></div>` : ''}
        </div>
        <div class="grid-2" style="margin-top:12px">
          ${can('subscriptions.edit') ? html`<button class="btn success" data-act="renew">${icon('refresh')} تجديد</button><button class="btn ghost" data-act="edit-sub">${icon('edit')} تعديل</button>` : ''}
          ${c.status === 'frozen' ? (can('subscriptions.unfreeze') ? html`<button class="btn primary" data-act="unfreeze">${icon('play')} فك التجميد</button>` : '') : can('subscriptions.freeze') ? html`<button class="btn ghost" data-act="freeze">${icon('pause')} تجميد</button>` : ''}
        </div></div>` : html`<div class="card">${empty('لا يوجد اشتراك', 'subs', can('subscriptions.edit') ? html`<button class="btn primary" data-act="new-sub">${icon('plus')} إضافة اشتراك</button>` : '')}</div>`}
      <div class="card"><div class="section-head"><h3>${icon('snow', 'sm')} سجل التجميد</h3><span class="muted small">${d.freezes.length}</span></div>
        <div class="stack">${d.freezes.length ? d.freezes.map((f) => html`<div class="card flat" style="padding:10px"><div class="row between"><b>${date(f.start_date)} ← ${f.end_date ? date(f.end_date) : html`<span class="badge b-blue">مجمد حاليًا</span>`}</b>${f.actual_days !== null ? html`<span class="badge b-cyan">${f.actual_days} يوم</span>` : ''}</div>
          <div class="small muted">${f.reason || 'بدون سبب'}${f.expected_days ? ` • متوقع ${f.expected_days} يوم` : ''}</div>
          ${f.end_after && f.end_after !== '9999-12-31' ? html`<div class="xs">نهاية الاشتراك: ${date(f.end_before)} ← <b>${date(f.end_after)}</b></div>` : f.end_after ? html`<div class="xs">اشتراك مفتوح — تمت إزاحة مواعيد الدفع ${f.actual_days} يوم</div>` : ''}${f.notes ? html`<div class="xs muted">${f.notes}</div>` : ''}</div>`) : html`<p class="muted small" style="margin:0">لم يتم تجميد الاشتراك من قبل.</p>`}</div></div>
      <div class="card"><div class="section-head"><h3>الاشتراكات السابقة</h3></div><div class="stack">${d.subscriptions.filter((x) => !x.is_current).map((x) => html`<div class="row small" style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="grow">${date(x.start_date)} ← ${x.open ? 'مفتوح' : date(x.end_date)}</span>${can('payments.view') ? html`<span>${money(x.amount)}</span>` : ''}<span class="badge ${PAY_BADGE[x.pay_status]}">${PAY_STATUS[x.pay_status]}</span></div>`)}${d.subscriptions.filter((x) => !x.is_current).length ? '' : html`<p class="muted small" style="margin:0">لا يوجد</p>`}</div></div>`,

    payments: () => html`${can('payments.create') ? html`<button class="btn primary block" data-act="payment">${icon('coins')} تسجيل دفعة</button>` : ''}
      ${s ? html`<div class="grid-3" style="margin-top:10px">${kv('الإجمالي', money(s.amount, 0), 'receipt', 'qc-blue')}${kv('المدفوع', money(s.paid, 0), 'coins', 'qc-green')}${kv('المتبقي', money(s.remaining, 0), 'wallet', 'qc-red')}</div>` : ''}
      <div class="list" style="margin-top:10px">${d.payments.length ? d.payments.map((p) => html`<div class="item" data-pay="${p.id}"><span class="logo sm" style="background:rgba(34,197,94,.15);color:#4ade80">${icon('banknote', 'sm')}</span><div class="it-body"><div class="it-title">${money(p.amount)}</div><div class="it-sub">${date(p.date)} • ${PAY_METHODS[p.method]} • ${PAY_TYPES[p.type]}${p.period ? ' • ' + p.period : ''}${p.reference ? ' • #' + p.reference : ''}</div></div>${icon('chevL', 'sm')}</div>`) : empty('لا توجد دفعات', 'coins')}</div>`,

    reports: () => html`${can('reports.create') ? html`<button class="btn primary block" data-act="report">${icon('bars')} إنشاء تقرير سريع</button>` : ''}
      <div class="list" style="margin-top:10px">${d.reports?.length ? d.reports.map((r) => { const m = computeMetrics(r); return html`<a class="item" href="#/reports/${r.id}"><span class="logo sm" style="background:var(--surface-2);color:var(--cyan)">${icon('bars', 'sm')}</span><div class="it-body"><div class="it-title">${r.platform} • ${dateShort(r.period_from)} ← ${dateShort(r.period_to)}</div><div class="it-sub">مصروف ${n(r.spend)} • مبيعات ${n(r.sales)} • ROAS ${kpi.roas(m.roas)}</div></div>${icon('chevL', 'sm')}</a>`; }) : empty('لا توجد تقارير', 'bars')}</div>`,

    quotes: () => html`${can('quotes.create') ? html`<button class="btn primary block" data-act="quote">${icon('file')} إنشاء عرض سعر</button>` : ''}
      <div class="list" style="margin-top:10px">${d.quotes?.length ? d.quotes.map((x) => html`<a class="item" href="#/quotes/${x.id}"><span class="logo sm" style="background:var(--surface-2);color:var(--orange)">${icon('file', 'sm')}</span><div class="it-body"><div class="it-title">${x.number}</div><div class="it-sub">${date(x.date)} • ${moneyText(x.total)}</div></div><span class="badge b-gray">${QUOTE_STATUS[x.status]}</span></a>`) : empty('لا توجد عروض أسعار', 'file')}</div>`,

    notes: () => html`<div class="card"><p style="white-space:pre-wrap;margin:0;line-height:1.9">${c.notes || html`<span class="muted">لا توجد ملاحظات</span>`}</p>${can('clients.edit') ? html`<button class="btn ghost block" style="margin-top:12px" data-act="notes">${icon('edit')} تعديل الملاحظات</button>` : ''}</div>`,

    activity: () => html`<div class="list">${d.activity?.length ? d.activity.map((a) => html`<div class="item" style="cursor:default"><span class="logo sm" style="background:var(--surface-2);color:var(--muted)">${icon('history', 'sm')}</span><div class="it-body"><div class="it-title">${a.action}</div><div class="it-sub">${dateTime(a.created_at)} • ${a.user_name}${a.details ? ' • ' + a.details : ''}</div></div></div>`) : empty('لا يوجد نشاط', 'history')}</div>`,
  };

  function billingCard() {
    const b = s.billing || {};
    const st = s.pay_status;
    return html`<div class="card" style="margin-bottom:12px;padding:14px;${st === 'late' ? 'border-color:rgba(244,63,94,.5)' : st === 'due' || st === 'soon' ? 'border-color:rgba(245,181,68,.45)' : ''}">
      <div class="row between"><b>${icon('coins', 'sm')} الدفع ${b.cycle_days ? `كل ${b.cycle_days} يوم` : b.monthly || b.amount_unset ? 'الشهري' : ''}</b><span class="badge ${PAY_BADGE[st]}" style="font-size:13px">${PAY_STATUS[st]}${s.partial ? ' • جزئي' : ''}</span></div>
      <div class="grid-2" style="margin-top:10px">
        <div><div class="xs muted">الدفعة القادمة</div><div class="bold">${s.next_due ? date(s.next_due) : '—'}</div>${s.next_due ? html`<div class="xs" style="color:${s.days_to_due < 0 ? '#fb7185' : 'var(--muted)'}">${relDays(s.days_to_due)}</div>` : ''}</div>
        <div><div class="xs muted">المبلغ</div><div class="bold">${b.amount_unset ? html`<span style="color:var(--gold)">غير محدد</span>` : s.next_due ? money(s.amount_due) : '—'}</div>${b.period_paid > 0 && s.partial ? html`<div class="xs muted">مدفوع ${money(b.period_paid)} من ${money(b.monthly)}</div>` : ''}${b.periods_due > 1 ? html`<div class="xs" style="color:#fb7185">${b.periods_due} دفعات متأخرة</div>` : ''}</div>
        <div><div class="xs muted">آخر دفعة</div><div class="bold">${lastPayment ? date(lastPayment.date) : '—'}</div></div>
        <div><div class="xs muted">${b.monthly || b.amount_unset ? 'موعد التحصيل' : 'نوع الدفع'}</div><div class="bold">${b.cycle_days ? `كل ${b.cycle_days} يوم` : b.monthly || b.amount_unset ? `${b.pay_day} من كل شهر` : 'دفعة واحدة'}</div></div>
      </div>
      <div class="row" style="margin-top:10px;gap:8px">${can('payments.create') && s.next_due ? html`<button class="btn sm success grow" data-act="payment">${icon('coins', 'sm')} تسجيل الدفعة</button>` : ''}
        ${can('clients.edit') ? html`<button class="btn sm ghost grow" data-act="alert">${icon('bell', 'sm')} ${c.pay_alert_enabled ? `التنبيه قبل ${c.pay_alert_days} أيام` : 'تفعيل التنبيه'}</button>` : ''}</div></div>`;
  }
  function linksList() {
    const links = [['رابط المتجر', c.store_url, 'store'], ['حساب TikTok', c.tiktok_url, 'globe'], ['TikTok Ads', c.tiktok_ads_url, 'megaphone'], ...c.other_links.map((l) => [l.label, l.url, 'link'])].filter((l) => l[1]);
    return links.length ? links.map(([l, u, ic]) => html`<a class="item" target="_blank" rel="noopener noreferrer" href="${u}">${icon(ic)}<div class="it-body"><div class="it-title">${l}</div><div class="it-sub ltr" style="text-align:right">${u}</div></div>${icon('chevL', 'sm')}</a>`) : html`<p class="muted small" style="margin:0">لا توجد روابط — أضفها من تعديل بيانات العميل.</p>`;
  }
  const showTab = () => { mount(panel, panels[tab]()); lastTab[id] = tab; };
  showTab();

  const copyClient = () => copyText([`العميل: ${c.name}`, c.store_name && `المتجر: ${c.store_name}`, c.business_type && `النشاط: ${c.business_type}`, c.phone && `الجوال: ${c.phone}`, c.email && `البريد: ${c.email}`,
    c.platforms.length && `المنصات: ${c.platforms.join('، ')}`, c.store_url && `المتجر: ${c.store_url}`, c.tiktok_url && `TikTok: ${c.tiktok_url}`, s && `الاشتراك: ${s.start_date} → ${s.end_date}`].filter(Boolean).join('\n'), 'تم نسخ بيانات العميل');

  const after = (r) => { if (r) { invalidate('clients'); refresh(); } };
  const actions = {
    edit: async () => after(await F.clientForm(c)),
    notes: async () => after(await F.noteForm(c)),
    links: () => sheet({ title: 'روابط حسابات العميل', body: html`<div class="stack">${linksList()}</div>` }),
    copy: copyClient,
    payment: async () => after(await F.paymentForm({ client_id: c.id, remaining: s?.remaining, amount_due: s?.amount_due, next_due: s?.next_due, commission: c.billing_model === 'commission' })),
    delete: () => deleteClient(c),
    alert: async () => after(await F.alertForm(c)),
    freeze: async () => after(await F.freezeForm(c)),
    unfreeze: async () => after(await F.unfreezeForm(c)),
    renew: async () => after(await F.subscriptionForm({ client: c, sub: s, renew: true })),
    'new-sub': async () => after(await F.subscriptionForm({ client: c })),
    'edit-sub': async () => after(await F.subscriptionForm({ client: c, sub: s })),
    campaign: async () => after(await F.campaignForm({ client_id: c.id })),
    task: async () => after(await F.taskForm({ client_id: c.id })),
    report: () => go(`#/reports/new?client=${c.id}`),
    quote: () => go(`#/quotes/new?client=${c.id}`),
    followup: () => go(`#/followup?client=${c.id}`),
    vault: () => go(`#/vault?client=${c.id}`),
  };

  main.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) { tab = tb.dataset.tab; main.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === tb)); tb.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); showTab(); return; }
    const a = e.target.closest('[data-act]'); if (a) { actions[a.dataset.act]?.(); return; }
    const dn = e.target.closest('[data-done]');
    if (dn) { const t = d.tasks.find((x) => x.id === dn.dataset.done); await put(`/api/tasks/${t.id}`, { status: t.status === 'done' ? 'new' : 'done' }).then((r) => { toast(r.next_due ? `تم — التكرار التالي ${r.next_due}` : 'تم التحديث'); refresh(); }).catch((err) => toast(err.message, 'err')); return; }
    const tk = e.target.closest('[data-task]'); if (tk) { after(await F.taskForm({ task: d.tasks.find((x) => x.id === tk.dataset.task) })); return; }
    const py = e.target.closest('[data-pay]');
    if (py) { const p = d.payments.find((x) => x.id === py.dataset.pay); return paymentMenu(p, after); }
    if (e.target.closest('[data-menu]')) return clientMenu(c, copyClient);
  });
}

async function deleteClient(c) {
  try {
    const p = await get(`/api/clients/${c.id}/delete-preview`);
    const L = { subscriptions: 'اشتراكات', payments: 'دفعات', freezes: 'سجلات تجميد', campaigns: 'حملات', reports: 'تقارير', followups: 'متابعات', checklist: 'سجلات Checklist', vault: 'حسابات في الخزنة' };
    const rows = Object.entries(L).map(([k, l]) => [l, p.counts[k]]).filter(([, v]) => v);
    const r = await sheet({ title: 'حذف العميل نهائيًا',
      body: html`<p style="margin:0 0 10px;line-height:1.8">سيتم حذف <b>${c.name}</b> نهائيًا ولا يمكن التراجع. البيانات المرتبطة التي ستُحذف معه:</p>
        <div class="kvlist">${rows.length ? rows.map(([l, v]) => html`<div><span>${l}</span><span class="num" style="color:#fb7185">${v}</span></div>`) : html`<div><span>لا توجد بيانات مرتبطة</span><span>—</span></div>`}
        ${p.counts.tasks ? html`<div><span>مهام (تبقى بدون عميل)</span><span class="num">${p.counts.tasks}</span></div>` : ''}${p.counts.quotes ? html`<div><span>عروض أسعار (تبقى)</span><span class="num">${p.counts.quotes}</span></div>` : ''}</div>
        <p class="small muted" style="margin:10px 0 0">💡 إذا أردت الاحتفاظ بالبيانات استخدم «الأرشفة» بدل الحذف.</p>
        <label class="field" style="margin-top:12px"><span>للتأكيد اكتب: حذف</span><input data-confirm-word autocomplete="off"></label>`,
      foot: html`<button class="btn ghost" data-close>إلغاء</button><button class="btn danger" data-ok disabled>حذف نهائي</button>`,
      onMount: (el, close) => {
        const ok = el.querySelector('[data-ok]');
        el.querySelector('[data-confirm-word]').addEventListener('input', (e) => { ok.disabled = e.target.value.trim() !== 'حذف'; });
        ok.addEventListener('click', () => close(true));
      } });
    if (!r) return;
    await del(`/api/clients/${c.id}`); toast('تم حذف العميل نهائيًا'); invalidate('clients'); go('#/clients');
  } catch (err) { toast(err.message, 'err'); }
}

async function paymentMenu(p, after) {
  const r = await sheet({ title: `دفعة ${moneyText(p.amount)}`, body: html`<div class="kvlist"><div><span>التاريخ</span><span>${date(p.date)}</span></div><div><span>الطريقة</span><span>${PAY_METHODS[p.method]}</span></div><div><span>النوع</span><span>${PAY_TYPES[p.type]}</span></div><div><span>الفترة</span><span>${p.period || '—'}</span></div><div><span>المرجع</span><span>${p.reference || '—'}</span></div><div><span>ملاحظات</span><span>${p.notes || '—'}</span></div></div>`,
    foot: can('payments.create') ? html`<button class="btn danger" data-x="del">${icon('trash')} حذف</button><button class="btn primary" data-x="edit">${icon('edit')} تعديل</button>` : '',
    onMount: (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) close(b.dataset.x); }) });
  if (r === 'edit') after(await F.paymentForm({ payment: p }));
  if (r === 'del' && await confirmBox('هل تريد حذف هذه الدفعة؟', { danger: true, ok: 'حذف' })) { await del(`/api/payments/${p.id}`); toast('تم حذف الدفعة'); after(true); }
}

async function clientMenu(c, copyClient) {
  const items = [
    can('clients.edit') && ['edit', 'edit', 'تعديل البيانات'],
    ['copy', 'copy', 'نسخ بيانات العميل'],
    can('clients.edit') && c.status !== 'stopped' && c.status !== 'former' && ['stop', 'pause', 'إيقاف العميل'],
    can('clients.edit') && c.status === 'stopped' && ['reactivate', 'play', 'إعادة تفعيل'],
    can('clients.edit') && c.status !== 'former' && ['archive', 'archive', 'نقل إلى العملاء السابقين (أرشفة)'],
    can('clients.edit') && c.status === 'former' && ['reactivate', 'rotate', 'إعادة تفعيل العميل'],
    state.user.role === 'owner' && ['delete', 'trash', 'حذف العميل نهائيًا'],
  ].filter(Boolean);
  const r = await sheet({ title: c.name, body: html`<div class="list">${items.map(([k, ic, l]) => html`<button class="item" data-k="${k}" style="width:100%;text-align:start;color:${k === 'delete' ? '#fb7185' : 'inherit'}">${icon(ic)}<span class="grow">${l}</span></button>`)}</div>`,
    onMount: (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) close(b.dataset.k); }) });
  if (!r) return;
  try {
    if (r === 'edit') { if (await F.clientForm(c)) { invalidate('clients'); refresh(); } }
    if (r === 'copy') copyClient();
    if (r === 'stop' && await confirmBox(`إيقاف ${c.name}؟ سيتوقف الاشتراك الحالي ويمكن إعادة التفعيل لاحقًا.`, { ok: 'إيقاف' })) { await post(`/api/clients/${c.id}/stop`, {}); toast('تم إيقاف العميل'); refresh(); }
    if (r === 'reactivate') { await post(`/api/clients/${c.id}/reactivate`, {}); toast('تمت إعادة التفعيل'); invalidate('clients'); refresh(); }
    if (r === 'archive' && await confirmBox(`نقل ${c.name} إلى العملاء السابقين؟ لن تُحذف أي بيانات (التقارير، الحملات، المدفوعات، الاشتراكات، المتابعة والملاحظات تبقى محفوظة) ويمكن إعادة تفعيله في أي وقت.`, { ok: 'أرشفة' })) { await post(`/api/clients/${c.id}/archive`, {}); toast('تم نقل العميل إلى الأرشيف'); invalidate('clients'); refresh(); }
    if (r === 'delete') await deleteClient(c);
  } catch (err) { toast(err.message, 'err'); }
}
export { raw, relDays };
