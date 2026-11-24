// Reusable form sheets. Each returns the API result (truthy) when saved, or undefined when cancelled.
import { html, raw, icon, field, inp, sel, ta, checks, formSheet, toast, readImageAsDataURL, esc, moneyText, date } from './ui.js';
import { get, post, put, lookups, invalidate } from './api.js';
import { state } from './app.js';
import { PLATFORMS, PAY_METHODS, PAY_TYPES, TASK_PRIORITY, TASK_STATUS, RECURRENCE, CAMPAIGN_STATUS, VAULT_TYPES, SUB_TYPES, BILLING_MODES, addMonths, addDays, tenure, defaultFirstDue } from './shared.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: state.settings.timezone || 'Asia/Riyadh' }).format(new Date());
export { today };

async function clientOptions(selected, { required = true, allowNone = false } = {}) {
  const list = await lookups.clients();
  return sel('client_id', list.filter((c) => c.status !== 'former' || c.id === selected).map((c) => ({ v: c.id, l: c.name + (c.store_name ? ` — ${c.store_name}` : '') })), selected, { req: required, empty: allowNone ? 'بدون عميل' : 'اختر العميل' });
}
export { clientOptions };

// ---------------- Client ----------------
export async function clientForm(c = {}) {
  const editing = !!c.id;
  const cats = await lookups.categories();
  const links = c.other_links || [];
  const custom = c.custom_fields || [];
  const body = html`
    <div class="row" style="gap:14px">
      <label style="cursor:pointer" title="شعار النشاط"><input type="file" accept="image/*" name="logo_file" hidden>
        <span class="logo lg" data-logo-prev style="background:var(--surface-2);border:1px dashed var(--border-2)">${c.logo ? raw(`<img src="${esc(c.logo)}" style="width:100%;height:100%;object-fit:cover">`) : icon('image')}</span></label>
      <input type="hidden" name="logo" value="${c.logo || ''}">
      <div class="grow form-grid">${field('اسم العميل *', inp('name', c.name, { req: true, ph: 'مثال: متجر العطور الفاخرة' }))}</div>
    </div>
    <div class="form-grid cols-2">
      ${field('اسم المتجر / النشاط التجاري', inp('store_name', c.store_name))}
      ${field('نوع النشاط', inp('business_type', c.business_type, { ph: 'عطور، مطعم، ملابس…' }))}
      ${field('رقم الجوال', inp('phone', c.phone, { type: 'tel', ph: '05xxxxxxxx' }))}
      ${field('البريد الإلكتروني', inp('email', c.email, { type: 'email' }))}
    </div>
    ${field('التصنيفات', checks('category_ids', cats.map((x) => ({ v: x.id, l: x.name })), c.category_ids))}
    ${field('الوسوم (Tags) — افصل بفاصلة', inp('tags', (c.tags || []).join('، '), { ph: 'VIP، سلة، زد' }))}
    ${field('المنصات التي تتم إدارتها', checks('platforms', PLATFORMS, c.platforms))}
    <div class="form-grid cols-2">
      ${field('رابط المتجر', inp('store_url', c.store_url, { type: 'url', ph: 'https://' }))}
      ${field('رابط حساب TikTok', inp('tiktok_url', c.tiktok_url, { type: 'url', ph: 'https://www.tiktok.com/@' }))}
      ${field('رابط TikTok Ads', inp('tiktok_ads_url', c.tiktok_ads_url, { type: 'url' }))}
      ${field('تاريخ بداية العمل الفعلي مع العميل', inp('start_date', c.start_date || (editing ? '' : today()), { type: 'date' }))}
      <div class="xs muted" data-tenure style="align-self:end;padding-bottom:12px">${tenure(c.start_date, today())?.label ? `مدة التعامل: ${tenure(c.start_date, today()).label}` : ''}</div>
      ${field('ميزانية الإعلانات اليومية', inp('daily_budget', c.daily_budget, { type: 'number', step: 'any', min: 0 }))}
      ${field('المراجعة كل (يوم)', inp('followup_every', c.followup_every || state.settings.followup_default_every || 1, { type: 'number', min: 1 }))}
      ${field('موعد التواصل القادم', inp('next_contact_date', c.next_contact_date, { type: 'date' }))}
    </div>
    <fieldset><legend>روابط منصات أخرى</legend><div class="stack" data-links>${(links.length ? links : [{}]).map((l) => linkRow(l))}</div>
      <button type="button" class="btn sm ghost" data-add-link style="margin-top:8px">${icon('plus', 'sm')} رابط</button></fieldset>
    <fieldset><legend>تنبيه الدفع</legend><div class="form-grid cols-2"><label class="check"><input type="checkbox" name="pay_alert_enabled" ${c.pay_alert_enabled ? raw('checked') : ''}> تفعيل التنبيه قبل موعد الدفع</label>
      ${field('التنبيه قبل الدفع بـ (يوم)', inp('pay_alert_days', c.pay_alert_days || state.settings.default_pay_alert_days || 3, { type: 'number', min: 1, attrs: 'max="90"' }))}</div></fieldset>
    ${!editing ? html`<fieldset><legend>الاشتراك الأول (اختياري)</legend><label class="check" style="margin-bottom:8px"><input type="checkbox" name="with_sub"> إضافة اشتراك الآن</label><div data-subbox class="hidden stack">${subscriptionFields({}, { start: today(), prefix: 'sub_' })}${field('الخدمات', inp('sub_services', 'إدارة حملات إعلانية'))}</div></fieldset>` : ''}
    <fieldset><legend>بيانات إضافية مخصصة</legend><div class="stack" data-custom>${(custom.length ? custom : [{}]).map((x) => customRow(x))}</div>
      <button type="button" class="btn sm ghost" data-add-custom style="margin-top:8px">${icon('plus', 'sm')} حقل</button></fieldset>
    ${field('ملاحظات', ta('notes', c.notes))}`;
  return formSheet({
    title: editing ? 'تعديل بيانات العميل' : 'إضافة عميل جديد', body, submit: editing ? 'حفظ التعديلات' : 'إضافة العميل', wide: true,
    onMount: (el) => {
      if (!editing) { bindSubscriptionFields(el, 'sub_'); el.querySelector('[name=with_sub]').addEventListener('change', (e) => el.querySelector('[data-subbox]').classList.toggle('hidden', !e.target.checked)); }
      el.querySelector('[name=start_date]').addEventListener('change', (e) => { const t = tenure(e.target.value, today()); el.querySelector('[data-tenure]').textContent = t ? `مدة التعامل: ${t.label} (${t.days} يوم)` : ''; });
      el.querySelector('[data-add-link]').addEventListener('click', () => el.querySelector('[data-links]').insertAdjacentHTML('beforeend', String(linkRow({}))));
      el.querySelector('[data-add-custom]').addEventListener('click', () => el.querySelector('[data-custom]').insertAdjacentHTML('beforeend', String(customRow({}))));
      el.querySelector('[name=logo_file]').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const d = await readImageAsDataURL(f, 256); el.querySelector('[name=logo]').value = d; el.querySelector('[data-logo-prev]').innerHTML = `<img src="${d}" style="width:100%;height:100%;object-fit:cover">`; }
        catch (err) { toast(err.message, 'err'); }
      });
    },
    onSubmit: async (d, el) => {
      const rows = (sel2) => [...el.querySelectorAll(sel2)];
      const body = {
        name: d.name, store_name: d.store_name, business_type: d.business_type, phone: d.phone, email: d.email,
        category_ids: d.category_ids || [], tags: String(d.tags || '').split(/[,،]/).map((s) => s.trim()).filter(Boolean), platforms: d.platforms || [],
        store_url: d.store_url, tiktok_url: d.tiktok_url, tiktok_ads_url: d.tiktok_ads_url, start_date: d.start_date || null, daily_budget: d.daily_budget,
        followup_every: d.followup_every, next_contact_date: d.next_contact_date || null, notes: d.notes, logo: d.logo || null,
        other_links: rows('[data-link-row]').map((r) => ({ label: r.querySelector('[data-l]').value, url: r.querySelector('[data-u]').value })).filter((l) => l.url),
        custom_fields: rows('[data-custom-row]').map((r) => ({ label: r.querySelector('[data-l]').value, value: r.querySelector('[data-u]').value })).filter((x) => x.label),
      };
      body.pay_alert_enabled = !!d.pay_alert_enabled; body.pay_alert_days = d.pay_alert_days;
      if (!editing && d.with_sub) body.subscription = { ...pickSub(d, 'sub_'), services: d.sub_services, platforms: body.platforms };
      const r = editing ? await put(`/api/clients/${c.id}`, body) : await post('/api/clients', body);
      invalidate('clients'); toast(editing ? 'تم حفظ التعديلات' : 'تمت إضافة العميل');
      return editing ? { id: c.id } : r;
    },
  });
}
const linkRow = (l) => html`<div class="row" data-link-row><input data-l placeholder="المنصة" value="${l.label || ''}" style="flex:0 0 32%"><input data-u type="url" placeholder="https://" value="${l.url || ''}"></div>`;
const customRow = (x) => html`<div class="row" data-custom-row><input data-l placeholder="اسم الحقل" value="${x.label || ''}" style="flex:0 0 40%"><input data-u placeholder="القيمة" value="${x.value || ''}"></div>`;

// ---------------- Payment ----------------
export async function paymentForm({ client_id, payment, remaining, amount_due, next_due } = {}) {
  const editing = !!payment?.id;
  const p = payment || {};
  return formSheet({
    title: editing ? 'تعديل دفعة' : 'تسجيل دفعة',
    body: html`${editing ? '' : field('العميل *', await clientOptions(client_id))}
      ${remaining ? html`<div class="badge b-gold" style="justify-self:start">المستحق حاليًا: ${moneyText(remaining)}</div>` : ''}
      ${next_due ? html`<div class="badge b-blue" style="justify-self:start">الدفعة القادمة ${date(next_due)}: ${moneyText(amount_due)}</div>` : ''}
      <div class="form-grid cols-2">
        ${field('المبلغ *', inp('amount', p.amount ?? (remaining || amount_due || ''), { type: 'number', step: 'any', min: 0, req: true }))}
        ${field('تاريخ الدفع', inp('date', p.date || today(), { type: 'date' }))}
        ${field('طريقة الدفع', sel('method', PAY_METHODS, p.method || 'transfer'))}
        ${field('نوع الدفعة', sel('type', PAY_TYPES, p.type || 'subscription'))}
        ${field('الفترة التي تغطيها', inp('period', p.period, { ph: 'مثال: نوفمبر 2026' }))}
        ${field('رقم مرجع (اختياري)', inp('reference', p.reference))}
      </div>${field('ملاحظات', ta('notes', p.notes, '', 2))}`,
    submit: editing ? 'حفظ' : 'تسجيل الدفعة',
    onSubmit: async (d) => {
      const r = editing ? await put(`/api/payments/${p.id}`, d) : await post(`/api/clients/${d.client_id || client_id}/payments`, d);
      toast(editing ? 'تم تعديل الدفعة' : 'تم تسجيل الدفعة'); return r;
    },
  });
}

// ---------------- Task ----------------
export async function taskForm({ task, client_id } = {}) {
  const t = task || {}, editing = !!t.id;
  const users = await lookups.users().catch(() => []);
  return formSheet({
    title: editing ? 'تعديل مهمة' : 'إضافة مهمة',
    body: html`${field('اسم المهمة *', inp('title', t.title, { req: true }))}
      ${field('التفاصيل', ta('details', t.details, '', 2))}
      <div class="form-grid cols-2">
        ${field('العميل', await clientOptions(t.client_id || client_id, { required: false, allowNone: true }))}
        ${field('تاريخ الاستحقاق', inp('due_date', t.due_date || today(), { type: 'date' }))}
        ${field('الأولوية', sel('priority', TASK_PRIORITY, t.priority || state.settings.task_default_priority || 'medium'))}
        ${field('الحالة', sel('status', TASK_STATUS, t.status || 'new'))}
        ${field('التكرار', sel('recurrence', RECURRENCE, t.recurrence || 'none'))}
        ${field('كل (يوم) — للتكرار المخصص', inp('recurrence_days', t.recurrence_days, { type: 'number', min: 1 }))}
        ${users.length > 1 ? field('المسؤول', sel('assignee_id', users.map((u) => ({ v: u.id, l: u.display_name })), t.assignee_id, { empty: '—' })) : ''}
      </div>${field('ملاحظات', ta('notes', t.notes, '', 2))}`,
    onSubmit: async (d) => {
      const r = editing ? await put(`/api/tasks/${t.id}`, d) : await post('/api/tasks', d);
      toast(r.next_due ? `تم — أُنشئ التكرار التالي ${r.next_due}` : 'تم حفظ المهمة'); return r;
    },
  });
}

// ---------------- Campaign ----------------
export async function campaignForm({ campaign, client_id } = {}) {
  const k = campaign || {}, editing = !!k.id;
  return formSheet({
    title: editing ? 'تعديل الحملة' : 'إضافة حملة', wide: true,
    body: html`<div class="form-grid cols-2">
      ${field('اسم الحملة *', inp('name', k.name, { req: true }))}
      ${editing ? '' : field('العميل *', await clientOptions(client_id))}
      ${field('المنصة *', sel('platform', PLATFORMS, k.platform || 'TikTok', { req: true }))}
      ${field('نوع الحملة', inp('type', k.type, { ph: 'Conversions / Traffic / Reach…' }))}
      ${field('الهدف', inp('objective', k.objective, { ph: 'زيادة المبيعات' }))}
      ${field('الحالة', sel('status', CAMPAIGN_STATUS, k.status || 'active'))}
      ${field('تاريخ البداية', inp('start_date', k.start_date || today(), { type: 'date' }))}
      ${field('تاريخ النهاية', inp('end_date', k.end_date, { type: 'date' }))}
      ${field('الميزانية اليومية', inp('daily_budget', k.daily_budget, { type: 'number', step: 'any', min: 0 }))}
      ${field('الميزانية الإجمالية', inp('total_budget', k.total_budget, { type: 'number', step: 'any', min: 0 }))}
    </div>
    <fieldset><legend>الأداء الإجمالي (اختياري — تُحسب المؤشرات تلقائيًا)</legend><div class="grid-2">
      ${field('المصروف', inp('spend', k.spend, { type: 'number', step: 'any', min: 0 }))}
      ${field('المشاهدات', inp('impressions', k.impressions, { type: 'number', min: 0 }))}
      ${field('النقرات', inp('clicks', k.clicks, { type: 'number', min: 0 }))}
      ${field('الطلبات', inp('orders', k.orders, { type: 'number', min: 0 }))}
      ${field('قيمة المبيعات', inp('sales', k.sales, { type: 'number', step: 'any', min: 0 }))}
      ${field('عدد التحويلات', inp('conversions', k.conversions, { type: 'number', min: 0 }))}
    </div></fieldset>
    ${field('روابط الحملة', ta('links', k.links, 'رابط في كل سطر', 2))}${field('ملاحظات', ta('notes', k.notes, '', 2))}`,
    onSubmit: async (d) => {
      const r = editing ? await put(`/api/campaigns/${k.id}`, d) : await post('/api/campaigns', { ...d, client_id: d.client_id || client_id });
      toast(editing ? 'تم تحديث الحملة' : 'تمت إضافة الحملة'); return r;
    },
  });
}

export async function snapshotForm(campaign) {
  return formSheet({
    title: 'تسجيل أداء الفترة',
    body: html`<p class="muted small" style="margin:0">تُضاف الأرقام إلى إجماليات الحملة وتُحفظ في تاريخ أدائها وتظهر في رسوم لوحة التحكم.</p>
      ${field('التاريخ', inp('date', today(), { type: 'date' }))}
      <div class="grid-2">${field('المصروف', inp('spend', '', { type: 'number', step: 'any', min: 0 }))}${field('المبيعات', inp('sales', '', { type: 'number', step: 'any', min: 0 }))}
      ${field('المشاهدات', inp('impressions', '', { type: 'number', min: 0 }))}${field('النقرات', inp('clicks', '', { type: 'number', min: 0 }))}
      ${field('الطلبات', inp('orders', '', { type: 'number', min: 0 }))}${field('التحويلات', inp('conversions', '', { type: 'number', min: 0 }))}</div>
      ${field('ملاحظة', inp('note', ''))}`,
    onSubmit: async (d) => { const r = await post(`/api/campaigns/${campaign.id}/snapshots`, d); toast('تم تسجيل الأداء'); return r; },
  });
}

// ---------------- Subscription (add / renew / edit) ----------------
/** Fields shared by the subscription form, the client form and trial conversion. */
export function subscriptionFields(s = {}, { start, prefix = '' } = {}) {
  const type = s.sub_type || 'fixed';
  const months = s.duration_months || state.settings.default_sub_months || 1;
  const n = (k) => prefix + k;
  return html`
    <div class="seg" style="display:flex" data-subtype>${Object.entries(SUB_TYPES).map(([k, l]) => html`<button type="button" class="grow ${type === k ? 'active' : ''}" data-type="${k}">${l}</button>`)}</div>
    <input type="hidden" name="${n('sub_type')}" value="${type}">
    <div class="form-grid cols-2">
      ${field('تاريخ بداية الاشتراك', inp(n('start_date'), start, { type: 'date', req: true }))}
      <div data-fixed-only class="${type === 'open' ? 'hidden' : ''}">${field('مدة الاشتراك (أشهر)', inp(n('duration_months'), months, { type: 'number', step: 'any', min: 0.25 }))}</div>
      <div data-fixed-only class="${type === 'open' ? 'hidden' : ''}">${field('تاريخ النهاية (يُحسب تلقائيًا)', inp(n('end_date'), s.end_date && s.end_date !== '9999-12-31' ? s.end_date : addDays(addMonths(start, months), -1), { type: 'date' }))}</div>
      <div data-fixed-only class="${type === 'open' ? 'hidden' : ''}">${field('قيمة الاشتراك الإجمالية', inp(n('amount'), type === 'open' ? '' : s.amount ?? '', { type: 'number', step: 'any', min: 0 }))}</div>
      ${field(html`قيمة الاشتراك الشهرية <span data-open-req class="${type === 'open' ? '' : 'hidden'}">*</span>`, inp(n('monthly_amount'), s.monthly_amount ?? '', { type: 'number', step: 'any', min: 0, ph: type === 'open' ? 'مطلوب' : 'اتركه فارغًا لدفعة واحدة' }))}
      ${field('يوم الدفع الشهري (1–31)', inp(n('pay_day'), s.pay_day ?? '', { type: 'number', min: 1, attrs: 'max="31"', ph: 'مثال: 25' }))}
      ${field('تاريخ أول استحقاق (اختياري)', inp(n('first_due_date'), s.first_due_date || '', { type: 'date' }))}
      ${field('طريقة الدفع الشهري', sel(n('billing_mode'), BILLING_MODES, s.billing_mode || 'advance'))}
    </div>
    <p class="xs muted" style="margin:0" data-sub-hint>${type === 'open' ? 'اشتراك مستمر بلا تاريخ انتهاء — يُنشأ موعد دفع كل شهر تلقائيًا.' : 'إذا أدخلت قيمة شهرية سيُقسَّم الدفع على الأشهر، وإلا تُعتبر دفعة واحدة في بداية الاشتراك.'}</p>`;
}
/** Wires the fixed/open switch and end-date auto-calculation inside `root`. */
export function bindSubscriptionFields(root, prefix = '') {
  const q = (k) => root.querySelector(`[name="${prefix + k}"]`);
  const upd = () => { const st = q('start_date'), m = q('duration_months'), e = q('end_date'); if (st?.value && m?.value && e) e.value = addDays(addMonths(st.value, Number(m.value)), -1); };
  q('start_date')?.addEventListener('change', upd); q('duration_months')?.addEventListener('input', upd);
  root.querySelector('[data-subtype]')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]'); if (!b) return;
    const t = b.dataset.type; q('sub_type').value = t;
    root.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('active', x === b));
    root.querySelectorAll('[data-fixed-only]').forEach((x) => x.classList.toggle('hidden', t === 'open'));
    root.querySelector('[data-open-req]')?.classList.toggle('hidden', t !== 'open');
    const h = root.querySelector('[data-sub-hint]'); if (h) h.textContent = t === 'open' ? 'اشتراك مستمر بلا تاريخ انتهاء — يُنشأ موعد دفع كل شهر تلقائيًا.' : 'إذا أدخلت قيمة شهرية سيُقسَّم الدفع على الأشهر، وإلا تُعتبر دفعة واحدة في بداية الاشتراك.';
  });
}
/** Extracts subscription fields (with prefix) from form data. */
export function pickSub(d, prefix = '') {
  const g = (k) => d[prefix + k];
  const out = { sub_type: g('sub_type') || 'fixed', start_date: g('start_date'), monthly_amount: g('monthly_amount'), pay_day: g('pay_day'), first_due_date: g('first_due_date') || null, billing_mode: g('billing_mode') };
  if (out.sub_type === 'open') { if (!out.monthly_amount) throw new Error('أدخل قيمة الاشتراك الشهرية للاشتراك المفتوح'); }
  else Object.assign(out, { duration_months: g('duration_months'), end_date: g('end_date'), amount: g('amount') ?? (out.monthly_amount ? out.monthly_amount * (g('duration_months') || 1) : null) });
  return out;
}

export async function subscriptionForm({ client, sub, renew } = {}) {
  const editing = !!sub && !renew;
  const s = sub || {};
  const start = editing ? s.start_date : renew && s.end_date && s.end_date >= today() ? addDays(s.end_date, 1) : today();
  const base = renew ? { ...s, first_due_date: null, end_date: null } : s;
  return formSheet({
    title: editing ? 'تعديل الاشتراك' : renew ? 'تجديد الاشتراك' : 'إضافة اشتراك', wide: true,
    body: html`${renew && s.end_date ? html`<div class="badge b-blue" style="justify-self:start">الاشتراك الحالي ينتهي ${date(s.end_date)}</div>` : ''}
      ${subscriptionFields(base, { start })}
      <div class="form-grid cols-2">
        ${field('ميزانية الإعلانات', inp('ad_budget', s.ad_budget ?? client?.daily_budget ?? '', { type: 'number', step: 'any', min: 0 }))}
        ${editing ? field('الحالة', sel('status', { active: 'نشط', pending_renewal: 'ينتظر التجديد', stopped: 'متوقف', ended: 'منتهي' }, s.status === 'frozen' ? 'active' : s.status)) : ''}
      </div>
      ${field('الخدمات المقدمة', ta('services', s.services || 'إدارة حملات إعلانية', '', 2))}
      ${field('المنصات', checks('platforms', PLATFORMS, s.platforms?.length ? s.platforms : client?.platforms || []))}
      ${!editing ? html`<label class="check"><input type="checkbox" name="update_budget"> تحديث الميزانية اليومية للعميل بهذه القيمة</label>` : ''}
      ${field('ملاحظات', ta('notes', s.notes, '', 2))}`,
    submit: editing ? 'حفظ' : renew ? 'تجديد' : 'إضافة',
    onMount: (el) => bindSubscriptionFields(el),
    onSubmit: async (d) => {
      const body = { ...pickSub(d), ad_budget: d.ad_budget, services: d.services, platforms: d.platforms || [], notes: d.notes, update_budget: d.update_budget };
      if (editing && s.status !== 'frozen') body.status = d.status;
      const r = editing ? await put(`/api/subscriptions/${s.id}`, body) : await post(`/api/clients/${client.id}/subscriptions`, body);
      toast(editing ? 'تم تعديل الاشتراك' : renew ? 'تم تجديد الاشتراك' : 'تمت إضافة الاشتراك'); return r;
    },
  });
}

export async function alertForm(client) {
  const days = [1, 3, 5, 7, 10, 15];
  const cur = client.pay_alert_days || state.settings.default_pay_alert_days || 3;
  return formSheet({
    title: `تنبيه الدفع — ${client.name}`, submit: 'حفظ',
    body: html`<label class="check" style="font-size:16px"><input type="checkbox" name="pay_alert_enabled" ${client.pay_alert_enabled ? raw('checked') : ''}> تفعيل تنبيه قبل موعد الدفع</label>
      ${field('التنبيه قبل موعد الدفع بـ', html`<div class="chips" style="flex-wrap:wrap" data-days>${days.map((x) => html`<button type="button" class="chip ${x === cur ? 'active' : ''}" data-d="${x}">${x === 1 ? 'يوم' : `${x} أيام`}</button>`)}</div>`)}
      ${field('أو عدد أيام مخصص', inp('pay_alert_days', cur, { type: 'number', min: 1, attrs: 'max="90"' }))}
      <p class="xs muted" style="margin:0">يظهر التنبيه في الرئيسية وصفحة الدفعات القادمة من بداية الفترة، ويبقى ظاهرًا حتى تسجيل الدفعة. وإذا فعّلت إشعارات الجوال من الإعدادات يصلك ملخص يومي.</p>`,
    onMount: (el) => el.querySelector('[data-days]').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (!b) return; el.querySelector('[name=pay_alert_days]').value = b.dataset.d; el.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('active', x === b)); }),
    onSubmit: async (d) => { await put(`/api/clients/${client.id}`, { pay_alert_enabled: d.pay_alert_enabled, pay_alert_days: d.pay_alert_days }); toast('تم حفظ إعداد التنبيه'); return true; },
  });
}

export async function freezeForm(client) {
  return formSheet({
    title: `تجميد اشتراك ${client.name}`,
    body: html`<div class="form-grid cols-2">${field('تاريخ بداية التجميد', inp('start_date', today(), { type: 'date', req: true }))}
      ${field('المدة المتوقعة (يوم) — اختياري', inp('expected_days', '', { type: 'number', min: 1 }))}</div>
      ${field('السبب', inp('reason', '', { ph: 'سفر، توقف المتجر مؤقتًا…' }))}
      ${field('ملاحظات', ta('notes', '', '', 2))}
      <label class="check"><input type="checkbox" name="pause_work" ${state.settings.freeze_pause_work ? raw('checked') : ''}> إيقاف المتابعة اليومية والمهام خلال التجميد</label>
      <p class="muted small" style="margin:0">عند فك التجميد ${state.settings.freeze_extend ? 'سيتم تمديد نهاية الاشتراك تلقائيًا بمدة التجميد الفعلية.' : 'لن يتم تمديد الاشتراك (حسب الإعدادات).'}</p>`,
    submit: 'تجميد الاشتراك',
    onSubmit: async (d) => { const r = await post(`/api/clients/${client.id}/freeze`, d); toast('تم تجميد الاشتراك'); return r; },
  });
}
export async function unfreezeForm(client) {
  return formSheet({
    title: `فك تجميد ${client.name}`,
    body: html`${field('تاريخ فك التجميد', inp('end_date', today(), { type: 'date', req: true }))}
      <label class="check"><input type="checkbox" name="extend" ${state.settings.freeze_extend ? raw('checked') : ''}> تمديد نهاية الاشتراك بمدة التجميد</label>`,
    submit: 'فك التجميد',
    onSubmit: async (d) => {
      const r = await post(`/api/clients/${client.id}/unfreeze`, d);
      toast(`تم فك التجميد — مدة التجميد ${r.days} يوم${r.end_after !== r.end_before ? ` — النهاية الجديدة ${r.end_after}` : ''}`); return r;
    },
  });
}

export async function noteForm(client) {
  return formSheet({
    title: 'ملاحظات العميل',
    body: field('الملاحظات', ta('notes', client.notes, 'اكتب ملاحظاتك…', 8)),
    onSubmit: async (d) => { await put(`/api/clients/${client.id}`, { notes: d.notes }); toast('تم حفظ الملاحظات'); return true; },
  });
}

export async function vaultForm(entry = {}, client_id) {
  const editing = !!entry.id;
  return formSheet({
    title: editing ? 'تعديل حساب' : 'إضافة حساب إلى الخزنة',
    body: html`<div class="form-grid cols-2">
      ${field('نوع الحساب / المنصة', sel('platform', VAULT_TYPES, entry.platform || 'TikTok Ads Manager'))}
      ${field('العميل المرتبط', await clientOptions(entry.client_id || client_id, { required: false, allowNone: true }))}
      ${field('اسم الحساب', inp('account_name', entry.account_name))}
      ${field('رقم الحساب الإعلاني', inp('ad_account_id', entry.ad_account_id, { attrs: 'dir="ltr"' }))}
      ${field('رابط تسجيل الدخول', inp('login_url', entry.login_url, { type: 'url', ph: 'https://' }))}
      ${field('اسم المستخدم', inp('username', entry.secret?.username, { attrs: 'dir="ltr" autocomplete="off"' }))}
      ${field('البريد الإلكتروني', inp('email', entry.secret?.email, { type: 'email', attrs: 'autocomplete="off"' }))}
      ${field(editing ? 'كلمة المرور (اتركها فارغة لعدم التغيير)' : 'كلمة المرور', inp('password', '', { type: 'password', attrs: 'dir="ltr" autocomplete="new-password"' }))}
      </div>${field('ملاحظات (مشفرة)', ta('notes', entry.secret?.notes, '', 2))}
      <p class="muted xs" style="margin:0">${icon('lock', 'sm')} تُشفّر بيانات الدخول بـ AES-256-GCM على الخادم ولا تظهر في التقارير أو السجلات.</p>`,
    onSubmit: async (d) => { const r = editing ? await put(`/api/vault/${entry.id}`, d) : await post('/api/vault', d); toast('تم الحفظ في الخزنة'); return r; },
  });
}
