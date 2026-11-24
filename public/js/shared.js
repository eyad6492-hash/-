// Shared between the Worker (backend) and the browser app.
// Pure functions only — no DOM, no network.

/** Returns a number or null when the value is missing / not finite. */
export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Advertising KPIs. Each KPI is null when its inputs are missing or the
 * denominator is zero, so the UI only shows metrics backed by real data.
 */
export function computeMetrics(d = {}) {
  const spend = num(d.spend), imp = num(d.impressions), clicks = num(d.clicks);
  const orders = num(d.orders), sales = num(d.sales);
  const conv = num(d.conversions) ?? orders;
  const div = (a, b) => (a === null || b === null || b === 0 ? null : a / b);
  return {
    roas: div(sales, spend),
    cpa: div(spend, conv),
    cpc: div(spend, clicks),
    ctr: div(clicks, imp) === null ? null : (clicks / imp) * 100,
    cpm: div(spend, imp) === null ? null : (spend / imp) * 1000,
    cvr: div(conv, clicks) === null ? null : (conv / clicks) * 100,
    aov: div(sales, orders),
  };
}

export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** Quote totals: subtotal → discount → tax. */
export function computeQuote(q) {
  const items = Array.isArray(q.items) ? q.items : [];
  const subtotal = round2(items.reduce((s, it) => s + (num(it.qty) ?? 1) * (num(it.price) ?? 0), 0));
  const dRaw = num(q.discount) ?? 0;
  let discount = q.discount_type === 'percent' ? subtotal * Math.min(Math.max(dRaw, 0), 100) / 100 : Math.max(dRaw, 0);
  discount = round2(Math.min(discount, subtotal));
  const base = subtotal - discount;
  const tax = q.tax_enabled ? round2(base * (num(q.tax_rate) ?? 0) / 100) : 0;
  return { subtotal, discount_value: discount, tax_value: tax, total: round2(base + tax) };
}

// ---------- date helpers (YYYY-MM-DD strings, UTC arithmetic) ----------
export function parseDate(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function fmtISO(dt) { return dt.toISOString().slice(0, 10); }
export function addDays(s, n) { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + Number(n)); return fmtISO(d); }
export function addMonths(s, n) {
  const d = parseDate(s); const day = d.getUTCDate();
  const whole = Math.trunc(n); const frac = n - whole;
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + whole);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  let out = fmtISO(d);
  if (frac) out = addDays(out, Math.round(frac * 30));
  return out;
}
export function diffDays(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
export function todayIn(tz = 'Asia/Riyadh') {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}

// ---------- labels ----------
export const CLIENT_STATUS = {
  active: 'نشط', expiring: 'قريب الانتهاء', expired: 'منتهي', stopped: 'متوقف', frozen: 'مجمد',
  late: 'متأخر في السداد', partial: 'مدفوع جزئيًا', renewal: 'يحتاج تجديد', former: 'عميل سابق',
};
export const SUB_STATUS = {
  active: 'نشط', expiring: 'قريب الانتهاء', expired: 'منتهي', frozen: 'مجمد', stopped: 'متوقف',
  pending_renewal: 'ينتظر التجديد', unpaid: 'غير مدفوع', partial: 'مدفوع جزئيًا', ended: 'منتهي',
};
export const PAY_STATUS = { paid: 'مدفوع', partial: 'مدفوع جزئيًا', unpaid: 'غير مدفوع', late: 'متأخر', due: 'مستحق', none: '—' };
export const PAY_METHODS = { transfer: 'تحويل بنكي', cash: 'نقدي', card: 'بطاقة', other: 'أخرى' };
export const PAY_TYPES = { subscription: 'اشتراك', ads_budget: 'ميزانية إعلانات', setup: 'تأسيس', other: 'أخرى' };
export const CAMPAIGN_STATUS = {
  active: 'نشطة', stopped: 'متوقفة', review: 'قيد المراجعة', optimize: 'تحتاج تحسين',
  rejected: 'مرفوضة', ended: 'منتهية', paused: 'متوقفة مؤقتًا',
};
export const PLATFORMS = ['TikTok', 'Snapchat', 'Meta', 'Instagram', 'Facebook', 'Google', 'X', 'YouTube', 'LinkedIn', 'أخرى'];
export const VAULT_TYPES = ['TikTok', 'TikTok Ads Manager', 'Meta Ads', 'Snapchat Ads', 'Google Ads', 'Instagram', 'Facebook', 'المتجر الإلكتروني', 'البريد الإلكتروني', 'أخرى'];
export const TASK_PRIORITY = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة' };
export const TASK_STATUS = { new: 'جديدة', in_progress: 'قيد التنفيذ', done: 'مكتملة', postponed: 'مؤجلة', cancelled: 'ملغاة' };
export const RECURRENCE = { none: 'بدون تكرار', daily: 'يومية', weekly: 'أسبوعية', monthly: 'شهرية', custom: 'كل عدد أيام' };
export const RATINGS = { excellent: 'ممتاز', good: 'جيد', improve: 'يحتاج تحسين', problem: 'مشكلة', urgent: 'عاجل' };
export const QUOTE_STATUS = { draft: 'مسودة', sent: 'مرسل', review: 'قيد المراجعة', accepted: 'مقبول', rejected: 'مرفوض', expired: 'منتهي' };

export const DEFAULT_CHECKLIST = [
  'هل الحساب الإعلاني يعمل؟', 'هل الحملة تعمل؟', 'هل المصروف مناسب؟', 'هل الميزانية مناسبة؟',
  'هل توجد طلبات؟', 'هل توجد مبيعات؟', 'هل ROAS مناسب؟', 'هل CPA مناسب؟', 'هل الإعلانات تعمل بشكل جيد؟',
  'هل توجد إعلانات مرفوضة؟', 'هل توجد مشكلة في الحساب؟', 'هل تحتاج الحملة إلى تعديل؟',
  'هل يحتاج العميل إلى تواصل؟', 'هل يوجد إجراء مطلوب؟',
];

export const DEFAULT_CATEGORIES = ['متاجر إلكترونية', 'مطاعم', 'مقاهي', 'عقارات', 'سيارات', 'عطور', 'ملابس', 'خدمات', 'عيادات', 'سياحة', 'منتجات رقمية', 'شركات', 'أخرى'];

// ---------- permissions ----------
export const PERMISSIONS = {
  'clients.view': 'مشاهدة العملاء', 'clients.create': 'إضافة العملاء', 'clients.edit': 'تعديل العملاء', 'clients.delete': 'حذف العملاء',
  'campaigns.view': 'مشاهدة الحملات', 'campaigns.edit': 'إضافة وتعديل الحملات',
  'reports.view': 'مشاهدة التقارير', 'reports.create': 'إنشاء التقارير',
  'followups.manage': 'المتابعة اليومية', 'tasks.manage': 'إدارة المهام',
  'payments.view': 'مشاهدة المدفوعات', 'payments.create': 'تسجيل الدفعات',
  'subscriptions.edit': 'تعديل الاشتراكات', 'subscriptions.freeze': 'تجميد الاشتراكات', 'subscriptions.unfreeze': 'فك التجميد',
  'quotes.view': 'مشاهدة عروض الأسعار', 'quotes.create': 'إنشاء وتعديل عروض الأسعار',
  'vault.view': 'مشاهدة الخزنة', 'vault.reveal': 'عرض كلمات المرور', 'vault.edit': 'تعديل بيانات الخزنة',
  'activity.view': 'مشاهدة سجل النشاط', 'users.manage': 'إدارة المستخدمين', 'settings.manage': 'إدارة الإعدادات', 'data.export': 'تصدير البيانات والنسخ الاحتياطي',
};
const ALL = Object.keys(PERMISSIONS);
export const ROLES = {
  owner: { label: 'المالك (Owner)', perms: ALL },
  admin: { label: 'مدير (Admin)', perms: ALL.filter((p) => p !== 'users.manage') },
  media_buyer: { label: 'Media Buyer', perms: ['clients.view', 'clients.create', 'clients.edit', 'campaigns.view', 'campaigns.edit', 'reports.view', 'reports.create', 'followups.manage', 'tasks.manage', 'vault.view', 'vault.reveal', 'quotes.view'] },
  followup: { label: 'موظف متابعة', perms: ['clients.view', 'campaigns.view', 'reports.view', 'followups.manage', 'tasks.manage'] },
  finance: { label: 'موظف مالي', perms: ['clients.view', 'payments.view', 'payments.create', 'subscriptions.edit', 'quotes.view', 'quotes.create'] },
  custom: { label: 'صلاحيات مخصصة', perms: [] },
};

// ======================= v1.1: tenure, billing schedule, trials, checklist =======================
export const OPEN_END = '9999-12-31'; // stored end_date for open (no-expiry) subscriptions
export const SUB_TYPES = { fixed: 'محدد المدة', open: 'اشتراك مفتوح / مستمر' };
export const BILLING_MODES = { advance: 'مقدّم (أول الشهر)', arrears: 'بعد انتهاء الشهر' };
PAY_STATUS.soon = 'قريب الاستحقاق';
PAY_STATUS.frozen = 'مجمد — بدون استحقاق';
PAY_TYPES.commission = 'نسبة / عمولة';
export const BILLING_MODELS = { subscription: 'اشتراك', commission: 'نسبة / عمولة' };
export const TRIAL_STATUS = { active: 'تجربة نشطة', ending: 'تنتهي قريبًا', ended: 'انتهت التجربة', converted: 'تحولت إلى عميل', no_deal: 'لم يتم الاتفاق', stopped: 'متوقفة' };
export const CHECK_STATUS = { done: 'مكتمل', progress: 'قيد المتابعة', none: 'لم يبدأ', attention: 'يحتاج تدخل' };
export const DEFAULT_QUICK_CHECKLIST = [
  ['acct', 'مراجعة الحساب الإعلاني', true], ['camps', 'مراجعة الحملات', true], ['spend', 'مراجعة المصروف', true], ['orders', 'مراجعة الطلبات', false],
  ['sales', 'مراجعة المبيعات', false], ['roas', 'مراجعة ROAS', true], ['ads', 'مراجعة الإعلانات', false], ['budget', 'مراجعة الميزانية', false],
  ['issue', 'متابعة أي مشكلة', false], ['action', 'اتخاذ الإجراء المطلوب', false],
].map(([id, label, core]) => ({ id, label, core }));

const arPlural = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`);
/** Time since `start` (YYYY-MM-DD) until `today`: years/months/days + Arabic label. */
export function tenure(start, today) {
  if (!start || start > today) return null;
  const s = parseDate(start), t = parseDate(today);
  let months = (t.getUTCFullYear() - s.getUTCFullYear()) * 12 + (t.getUTCMonth() - s.getUTCMonth());
  if (t.getUTCDate() < s.getUTCDate()) months--;
  const years = Math.floor(months / 12), rem = months % 12;
  const days = diffDays(start, today);
  const parts = [];
  if (years) parts.push(arPlural(years, 'سنة', 'سنتان', 'سنوات', 'سنة'));
  if (rem) parts.push(arPlural(rem, 'شهر', 'شهران', 'أشهر', 'شهرًا'));
  const label = parts.length ? parts.join(' و') : arPlural(days || 0, 'يوم', 'يومان', 'أيام', 'يومًا').replace(/^0 يومًا$/, 'بدأ اليوم');
  return { years, months: rem, total_months: months, days, label };
}

/** i-th due date of a monthly schedule starting at `first`, on `payDay` (clamped to month length). */
export function nthDue(first, payDay, i) {
  const f = parseDate(first);
  const y = f.getUTCFullYear(), m = f.getUTCMonth() + i;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(payDay || f.getUTCDate(), last);
  return fmtISO(new Date(Date.UTC(y, m, day)));
}
export function defaultFirstDue(sub) {
  if (sub.billing_mode === 'arrears') return addMonths(sub.start_date, 1);
  if (sub.pay_day) { const d = nthDue(sub.start_date.slice(0, 8) + '01', sub.pay_day, 0); return d >= sub.start_date ? d : nthDue(sub.start_date.slice(0, 8) + '01', sub.pay_day, 1); }
  return sub.start_date;
}

/**
 * Billing state of a subscription given the total paid towards it.
 * Monthly schedule when monthly_amount > 0 (always for open subscriptions); otherwise one payment.
 * status: paid | soon | due | late | none ; partial = an installment is partly paid.
 */
/** k-th due date of a schedule (monthly on pay_day, or every cycle_days days). */
export function dueAt(first, payDay, cycleDays, k) {
  return cycleDays ? addDays(first, k * cycleDays) : nthDue(first, payDay, k);
}

/**
 * Billing state of a subscription given the total paid towards it.
 * Recurring schedule when monthly_amount > 0 or the subscription is open (even with no amount set yet);
 * otherwise one payment. status: paid | soon | due | late | none ; partial = an installment is partly paid.
 * amount_unset = open subscription whose amount has not been agreed yet (no amount is ever assumed).
 */
export function computeBilling(sub, paid, today, { grace = 5, soonDays = 3 } = {}) {
  if (!sub) return null;
  const open = sub.sub_type === 'open';
  const monthly = num(open ? sub.monthly_amount ?? (num(sub.amount) || null) : sub.monthly_amount) || 0;
  const cycle = num(sub.cycle_days) || null;
  const out = { monthly: monthly || null, cycle_days: cycle, paid, next_due: null, amount_due: 0, period_paid: 0, owed_now: 0, periods_due: 0, partial: false, status: 'none', days_to_due: null, amount_unset: open && !monthly };
  if (monthly > 0 || open) {
    const first = sub.first_due_date || defaultFirstDue(sub);
    const payDay = sub.pay_day || parseDate(first).getUTCDate();
    const end = open ? null : sub.end_date;
    let total = Infinity;
    if (end) { total = 0; while (total < 600 && dueAt(first, payDay, cycle, total) <= end) total++; total = Math.max(total, 1); }
    let elapsed = 0; while (elapsed < total && elapsed < 1200 && dueAt(first, payDay, cycle, elapsed) <= today) elapsed++;
    const covered = monthly > 0 ? Math.floor((paid + 0.009) / monthly) : 0;
    const remainder = monthly > 0 ? round2(paid - covered * monthly) : 0;
    out.periods_due = Math.max(elapsed - covered, 0);
    out.owed_now = monthly > 0 ? round2(Math.max(elapsed * monthly - paid, 0)) : 0;
    out.partial = remainder > 0.009;
    out.period_paid = remainder;
    out.first_due = first; out.pay_day = payDay;
    if (monthly > 0 && elapsed > 0) out.current_paid = round2(Math.min(Math.max(paid - (elapsed - 1) * monthly, 0), monthly));
    if (covered < total) { out.next_index = covered; out.next_due = dueAt(first, payDay, cycle, covered); out.amount_due = monthly > 0 ? round2(monthly - remainder) : null; }
  } else {
    const amount = num(sub.amount) || 0;
    if (amount <= 0) return out;
    const due = sub.first_due_date || sub.start_date;
    if (paid + 0.009 < amount) { out.next_due = due; out.amount_due = round2(amount - paid); out.owed_now = due <= today ? out.amount_due : 0; out.periods_due = due <= today ? 1 : 0; }
    out.partial = paid > 0 && paid + 0.009 < amount;
    out.period_paid = Math.min(paid, amount);
    out.current_paid = Math.min(paid, amount);
  }
  if (!out.next_due) { out.status = 'paid'; return out; }
  out.days_to_due = diffDays(today, out.next_due);
  out.status = out.days_to_due < -grace ? 'late' : out.days_to_due <= 0 ? 'due' : out.days_to_due <= soonDays ? 'soon' : 'paid';
  return out;
}

export function trialState(t, today) {
  if (t.status !== 'active') return t.status;
  if (t.end_date < today) return 'ended';
  if (diffDays(today, t.end_date) <= (t.alert_days ?? 1)) return 'ending';
  return 'active';
}
