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
