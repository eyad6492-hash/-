import { html, raw, icon, mount, money, logo, date, dateTime, empty, toast, confirmBox, formSheet, field, inp, ta, checks, relDays, n } from '../ui.js';
import { get, post, put, del, invalidate } from '../api.js';
import { can, setTitle, go, refresh, state } from '../app.js';
import { TRIAL_STATUS, PLATFORMS, addDays } from '../shared.js';
import { today, subscriptionFields, bindSubscriptionFields, pickSub } from '../forms.js';
import { waLink } from './client.js';

export const TRIAL_BADGE = { active: 'b-cyan', ending: 'b-gold', ended: 'b-red', converted: 'b-green', no_deal: 'b-gray', stopped: 'b-gray', converting: 'b-gray' };

export async function trialForm(t = {}) {
  const editing = !!t.id;
  const presets = [3, 5, 7, 14];
  const days = t.days || 3;
  return formSheet({
    title: editing ? 'تعديل عميل التجربة' : 'إضافة عميل تجربة', wide: true, submit: editing ? 'حفظ' : 'إضافة التجربة',
    body: html`<div class="form-grid cols-2">
      ${field('اسم العميل *', inp('name', t.name, { req: true }))}${field('اسم المتجر أو النشاط', inp('store_name', t.store_name))}
      ${field('رقم الجوال', inp('phone', t.phone, { type: 'tel' }))}${field('نوع النشاط', inp('business_type', t.business_type))}</div>
      ${field('المنصة الإعلانية', checks('platforms', PLATFORMS, t.platforms || ['TikTok']))}
      <fieldset><legend>مدة التجربة</legend>
        <div class="chips" style="flex-wrap:wrap" data-presets>${presets.map((d) => html`<button type="button" class="chip ${d === days ? 'active' : ''}" data-days="${d}">${d} أيام</button>`)}<span class="muted small" style="align-self:center">أو مخصص ↓</span></div>
        <div class="grid-3" style="margin-top:8px">${field('تاريخ البداية', inp('start_date', t.start_date || today(), { type: 'date', req: true }))}${field('عدد الأيام', inp('days', days, { type: 'number', min: 1, req: true }))}${field('تاريخ الانتهاء', inp('end_date_view', t.end_date || addDays(today(), days - 1), { type: 'date', attrs: 'readonly' }))}</div></fieldset>
      <fieldset><legend>ميزانية التجربة</legend><div class="grid-3">
        ${field('الميزانية اليومية', inp('daily_budget', t.daily_budget, { type: 'number', step: 'any', min: 0 }))}
        <div class="field"><span>الإجمالية المتوقعة</span><div class="bold" style="padding-top:12px" data-total>${t.daily_budget ? money(t.daily_budget * days) : '—'}</div></div>
        ${field('المصروف الفعلي', inp('actual_spend', t.actual_spend, { type: 'number', step: 'any', min: 0 }))}</div></fieldset>
      <div class="form-grid cols-2">
        ${field('رابط المتجر', inp('store_url', t.store_url, { type: 'url', ph: 'https://' }))}${field('رابط الحساب', inp('account_url', t.account_url, { type: 'url', ph: 'https://' }))}
        ${field('رابط الحساب الإعلاني', inp('ads_url', t.ads_url, { type: 'url', ph: 'https://' }))}
        ${field('تنبيه قبل انتهاء التجربة (يوم)', inp('alert_days', t.alert_days ?? 1, { type: 'number', min: 0, attrs: 'max="30"' }))}</div>
      ${field('ملاحظات', ta('notes', t.notes, '', 3))}`,
    onMount: (el, _c, form) => {
      const upd = () => {
        const d = Number(form.days.value) || 1;
        if (form.start_date.value) form.end_date_view.value = addDays(form.start_date.value, d - 1);
        const b = Number(form.daily_budget.value);
        el.querySelector('[data-total]').innerHTML = b ? String(money(b * d)) + ` <span class="xs muted">(${b} × ${d})</span>` : '—';
        el.querySelectorAll('[data-days]').forEach((x) => x.classList.toggle('active', Number(x.dataset.days) === d));
      };
      el.querySelector('[data-presets]').addEventListener('click', (e) => { const b = e.target.closest('[data-days]'); if (b) { form.days.value = b.dataset.days; upd(); } });
      ['days', 'start_date', 'daily_budget'].forEach((k) => form[k].addEventListener('input', upd));
    },
    onSubmit: async (d) => {
      delete d.end_date_view;
      const r = editing ? await put(`/api/trials/${t.id}`, d) : await post('/api/trials', d);
      toast(editing ? 'تم الحفظ' : 'تمت إضافة عميل التجربة'); return editing ? { id: t.id } : r;
    },
  });
}

export async function convertTrial(t) {
  const start = addDays(t.end_date, 1) <= today() ? today() : addDays(t.end_date, 1);
  const r = await formSheet({
    title: `تحويل ${t.name} إلى عميل`, wide: true, submit: 'تحويل إلى عميل',
    body: html`<p class="small muted" style="margin:0">سيُنقل العميل إلى قسم العملاء مع بياناته وروابطه وملاحظاته، ويُحتفظ بتاريخ التجربة (${date(t.start_date)} ← ${date(t.end_date)}) وميزانيتها في ملفه. لا يتم إنشاء عميل مكرر.</p>
      ${field('تاريخ بداية العمل الفعلي', inp('work_start_date', t.start_date, { type: 'date', req: true }))}
      <b class="small">الاشتراك الرسمي</b>${subscriptionFields({ sub_type: 'open' }, { start })}
      <label class="check"><input type="checkbox" name="pay_alert_enabled" checked> تفعيل تنبيه قبل موعد الدفع بـ <input type="number" name="pay_alert_days" value="${state.settings.default_pay_alert_days || 3}" min="1" style="width:70px;min-height:36px;padding:4px 8px"> أيام</label>`,
    onMount: (el) => bindSubscriptionFields(el),
    onSubmit: async (d) => post(`/api/trials/${t.id}/convert`, { work_start_date: d.work_start_date, subscription: { ...pickSub(d), services: 'إدارة حملات إعلانية', platforms: t.platforms }, pay_alert_enabled: d.pay_alert_enabled, pay_alert_days: d.pay_alert_days }),
  });
  if (r?.client_id) { invalidate('clients'); toast('تم تحويل التجربة إلى عميل رسمي 🎉'); go(`#/clients/${r.client_id}`); }
}

export default async function trialsPage(main, params, q, stale) {
  if (params.id) return trialDetail(main, params.id, stale);
  setTitle('عملاء التجارب');
  const { items } = await get('/api/trials');
  if (stale()) return;
  let f = q.f || 'current';
  const F = [['current', 'الجارية'], ['ending', 'تنتهي قريبًا'], ['ended', 'انتهت'], ['converted', 'تحولت لعملاء'], ['no_deal', 'لم يتم الاتفاق'], ['stopped', 'متوقفة'], ['all', 'الكل']];
  const match = (t, k) => k === 'all' || t.state === k || (k === 'current' && ['active', 'ending', 'ended'].includes(t.state));
  mount(main, html`
    <div class="row" style="margin-bottom:12px"><div class="grow"><div class="bold" style="font-size:18px">عملاء التجارب</div><div class="muted small">${items.filter((t) => match(t, 'current')).length} تجربة جارية</div></div>
      ${can('clients.create') ? html`<button class="btn primary" data-add>${icon('plus')} تجربة</button>` : ''}</div>
    <div class="chips">${F.map(([k, l]) => html`<button class="chip ${f === k ? 'active' : ''}" data-f="${k}">${l} <span class="cnt">${items.filter((t) => match(t, k)).length}</span></button>`)}</div>
    <div class="list grid-auto" data-list style="margin-top:12px"></div>`);
  const draw = () => {
    const r = items.filter((t) => match(t, f));
    mount(main.querySelector('[data-list]'), r.length ? r.map((t) => html`<a class="card flat" style="padding:12px;display:block" href="#/trials/${t.id}">
      <div class="row">${logo(t)}<div class="grow" style="min-width:0"><div class="bold ellipsis">${t.name}</div><div class="xs muted ellipsis">${[t.store_name, t.platforms.join(' / ')].filter(Boolean).join(' • ')}</div></div><span class="badge ${TRIAL_BADGE[t.state]}">${TRIAL_STATUS[t.state] || t.state}</span></div>
      ${['active', 'ending', 'ended'].includes(t.state) ? html`<div class="row" style="margin-top:10px"><div class="progress grow"><i style="width:${Math.min(100, (t.day_no / t.days) * 100)}%"></i></div><span class="xs num">يوم ${t.day_no}/${t.days}</span></div>` : ''}
      <div class="grid-3 xs" style="margin-top:8px;text-align:center"><div><div class="muted">النهاية</div><b>${date(t.end_date)}</b></div><div><div class="muted">يومي</div><b>${t.daily_budget != null ? money(t.daily_budget, 0) : '—'}</b></div><div><div class="muted">الإجمالي</div><b>${t.total_budget != null ? money(t.total_budget, 0) : '—'}</b></div></div></a>`) : empty('لا توجد تجارب في هذا التصنيف', 'sparkles'));
  };
  draw();
  main.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-f]'); if (b) { f = b.dataset.f; main.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b)); draw(); return; }
    if (e.target.closest('[data-add]')) { const r = await trialForm(); if (r?.id) go(`#/trials/${r.id}`); }
  });
}

async function trialDetail(main, id, stale) {
  const { trial: t, history } = await get(`/api/trials/${id}`);
  if (stale()) return;
  setTitle('ملف التجربة');
  const live = ['active', 'ending', 'ended'].includes(t.state);
  mount(main, html`
    <div class="card"><div class="row">${logo(t, 'lg')}<div class="grow"><h2 style="margin:0;font-size:20px">${t.name}</h2><div class="muted small">${[t.store_name, t.business_type].filter(Boolean).join(' • ')}</div>
      <span class="badge ${TRIAL_BADGE[t.state]}" style="margin-top:6px">${TRIAL_STATUS[t.state] || t.state}</span></div></div>
      ${live ? html`<div class="row" style="margin-top:12px"><div class="progress grow"><i style="width:${Math.min(100, (t.day_no / t.days) * 100)}%"></i></div><span class="small num">يوم ${t.day_no} من ${t.days}</span></div>
        <div class="small" style="margin-top:6px;color:${t.days_left < 0 ? '#fb7185' : t.days_left <= t.alert_days ? 'var(--gold)' : 'var(--muted)'}">${t.days_left < 0 ? `انتهت منذ ${-t.days_left} يوم` : t.days_left === 0 ? 'تنتهي اليوم' : `تنتهي ${relDays(t.days_left)}`}</div>` : ''}
      ${t.state === 'converted' ? html`<a class="btn success block" style="margin-top:12px" href="#/clients/${t.converted_client_id}">${icon('user')} فتح ملف العميل الرسمي</a>` : ''}
      ${live && can('clients.create') ? html`<button class="btn primary lg block" style="margin-top:12px" data-convert>${icon('user_plus')} تحويل إلى عميل</button>` : ''}</div>
    <div class="grid-3" style="margin-top:12px">
      ${t.phone ? html`<a class="btn ghost" href="tel:${t.phone}">${icon('phone')}</a><a class="btn ghost" target="_blank" rel="noopener" href="${waLink(t.phone)}">${icon('whatsapp')}</a>` : html`<span></span><span></span>`}
      ${can('clients.edit') ? html`<button class="btn ghost" data-edit>${icon('edit')} تعديل</button>` : ''}</div>
    <div class="section card"><div class="kvlist">
      <div><span>فترة التجربة</span><span>${date(t.start_date)} ← ${date(t.end_date)}</span></div><div><span>المدة</span><span>${t.days} أيام</span></div>
      <div><span>الميزانية اليومية</span><span>${money(t.daily_budget)}</span></div><div><span>الميزانية الإجمالية المتوقعة</span><span>${money(t.total_budget)}${t.daily_budget ? html` <span class="xs muted">(${n(t.daily_budget)} × ${t.days})</span>` : ''}</span></div>
      <div><span>المصروف الفعلي</span><span>${money(t.actual_spend)}</span></div><div><span>المنصات</span><span>${t.platforms.join('، ') || '—'}</span></div>
      <div><span>الجوال</span><span class="num">${t.phone || '—'}</span></div><div><span>تنبيه قبل الانتهاء</span><span>${t.alert_days} يوم</span></div>
      ${[['رابط المتجر', t.store_url], ['رابط الحساب', t.account_url], ['الحساب الإعلاني', t.ads_url]].filter((x) => x[1]).map(([k, v]) => html`<div><span>${k}</span><span><a class="link ltr" target="_blank" rel="noopener noreferrer" href="${v}">فتح</a></span></div>`)}
      ${t.notes ? html`<div><span>ملاحظات</span><span style="white-space:pre-wrap">${t.notes}</span></div>` : ''}</div></div>
    ${live && can('clients.edit') ? html`<div class="grid-3" style="margin-top:12px"><button class="btn sm ghost" data-st="no_deal">لم يتم الاتفاق</button><button class="btn sm ghost" data-st="stopped">إيقاف</button>${can('clients.delete') ? html`<button class="btn sm danger" data-del>${icon('trash', 'sm')} حذف</button>` : ''}</div>`
    : !live && t.state !== 'converted' && can('clients.edit') ? html`<button class="btn ghost block" style="margin-top:12px" data-st="active">${icon('rotate')} إعادة تفعيل التجربة</button>` : ''}
    <div class="section card"><div class="section-head"><h3>السجل</h3></div><div class="stack">${history.length ? history.map((h) => html`<div class="small" style="border-bottom:1px solid var(--border);padding:6px 0"><b>${h.action}</b> <span class="muted xs">• ${dateTime(h.created_at)} • ${h.user_name}</span>${h.details ? html`<div class="xs muted">${h.details}</div>` : ''}</div>`) : html`<p class="muted small" style="margin:0">—</p>`}</div></div>`);
  main.addEventListener('click', async (e) => {
    const x = e.target;
    try {
      if (x.closest('[data-convert]')) return convertTrial(t);
      if (x.closest('[data-edit]')) { if (await trialForm(t)) refresh(); return; }
      const st = x.closest('[data-st]'); if (st) { await put(`/api/trials/${t.id}`, { status: st.dataset.st }); toast('تم تحديث الحالة'); return refresh(); }
      if (x.closest('[data-del]') && await confirmBox(`حذف تجربة ${t.name}؟`, { danger: true, ok: 'حذف' })) { await del(`/api/trials/${t.id}`); toast('تم الحذف'); go('#/trials'); }
    } catch (err) { toast(err.message, 'err'); }
  });
  void raw;
}
