// Add / edit forms for every collection — shared by the pages, the calendar and the quick-add button.
import { openForm } from './form.js';
import { create, update, remove, store, today, all } from './store.js';
import { L, opts } from './labels.js';
import { choose, toast } from './ui.js';
import { monthKey } from './dates.js';
import { coordsFromText } from './geo.js';
import { get } from './api.js';

/** Coordinates for the map: parse the link locally, or let the server resolve a short link. */
async function withCoords(v, row) {
  if (!v.maps_url) { v.lat = null; v.lng = null; return v; }
  if (row && row.maps_url === v.maps_url && row.lat) return v;
  let c = coordsFromText(v.maps_url);
  if (!c) { try { c = await get('/api/resolve-map?url=' + encodeURIComponent(v.maps_url)); } catch { c = null; } }
  v.lat = c?.lat ?? null; v.lng = c?.lng ?? null;
  return v;
}

const save = (col, row, msg) => async (v) => {
  if (row?.id) await update(col, row.id, v); else await create(col, v);
  toast(row?.id ? 'تم الحفظ' : msg || 'تمت الإضافة');
};
const delFn = (col, row) => (row?.id ? () => remove(col, row.id) : null);

export function editDate(row = null, defaults = {}) {
  openForm({
    title: row ? 'تعديل المناسبة' : 'مناسبة جديدة', en: 'تواريخنا المهمة',
    values: { cal: 'g', recurring: 1, kind: 'special', remind: '1', ...defaults, ...(row || {}) },
    fields: [
      { k: 'title', label: 'اسم المناسبة', required: true, placeholder: 'مثال: ذكرى أول لقاء' },
      { k: 'kind', label: 'النوع', type: 'seg', options: opts(L.dateKinds) },
      { k: 'date', label: 'التاريخ', type: 'dualdate', required: true },
      { k: 'recurring', label: 'تتكرر سنويًا', type: 'toggle', hint: 'تُحسب الذكرى القادمة تلقائيًا بنفس التقويم المختار' },
      { k: 'description', label: 'وصف', type: 'textarea', rows: 2 },
      { k: 'note', label: 'ملاحظة', type: 'textarea', rows: 2 },
      { k: 'image_id', label: 'صورة (اختياري)', type: 'image' },
      { k: 'remind', type: 'remind', label: 'التذكير' },
    ],
    onSubmit: save('dates', row, 'تمت إضافة المناسبة'), onDelete: delFn('dates', row),
  });
}

export function editEvent(row = null, defaults = {}) {
  openForm({
    title: row ? 'تعديل الموعد' : 'إضافة إلى التقويم', en: 'التقويم',
    values: { type: 'appointment', date: today(), assignee: 'both', remind: '', ...defaults, ...(row || {}) },
    fields: [
      { k: 'title', label: 'العنوان', required: true, placeholder: 'مثال: عشاء، موعد طبيب…' },
      { k: 'type', label: 'النوع', type: 'seg', options: opts(L.eventTypes) },
      { type: 'pair', fields: [{ k: 'date', label: 'التاريخ', type: 'date', required: true }, { k: 'time', label: 'الوقت', type: 'time' }] },
      { type: 'pair', fields: [{ k: 'end_date', label: 'ينتهي (اختياري)', type: 'date' }, { k: 'end_time', label: 'وقت الانتهاء', type: 'time' }] },
      { k: 'assignee', label: 'المسؤول', type: 'user' },
      { k: 'location', label: 'المكان', placeholder: 'اختياري' },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'remind', type: 'remind' },
    ],
    onSubmit: async (v) => { if (v.end_date && v.end_date < v.date) v.end_date = null; await save('events', row)(v); defaults.after?.(); },
    onDelete: delFn('events', row),
  });
}

export function editTask(row = null, defaults = {}) {
  const partner = store.partner;
  openForm({
    title: row ? 'تعديل المهمة' : 'مهمة جديدة', en: 'مهامنا',
    values: { priority: 'medium', status: 'pending', assignee: partner ? 'both' : store.me.id, remind: '', ...defaults, ...(row || {}) },
    fields: [
      { k: 'title', label: 'اسم المهمة', required: true },
      { k: 'assignee', label: 'المسؤول عن المهمة', type: 'user' },
      { type: 'pair', fields: [{ k: 'due_date', label: 'تاريخ الاستحقاق', type: 'date' }, { k: 'priority', label: 'الأولوية', type: 'select', options: opts(L.priority) }] },
      { k: 'status', label: 'الحالة', type: 'seg', options: opts(L.taskStatus) },
      { k: 'description', label: 'وصف المهمة', type: 'textarea', rows: 2 },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'attachment_id', label: 'مرفق', type: 'attach', nameKey: 'attachment_name' },
      { k: 'remind', type: 'remind' },
    ],
    onSubmit: save('tasks', row, 'تمت إضافة المهمة'), onDelete: delFn('tasks', row),
  });
}

export function editPlan(row = null, defaults = {}) {
  openForm({
    title: row ? 'تعديل الخطة' : 'خطة جديدة', en: 'خطة الشهر',
    values: { month: monthKey(today()), priority: 'medium', status: 'not_started', assignee: 'both', remind: '', ...defaults, ...(row || {}) },
    fields: [
      { k: 'title', label: 'الخطة', required: true, placeholder: 'مثال: زيارة مطعم جديد' },
      { type: 'pair', fields: [{ k: 'month', label: 'الشهر', type: 'month', required: true }, { k: 'date', label: 'موعد التنفيذ', type: 'date' }] },
      { k: 'assignee', label: 'المسؤول', type: 'user' },
      { k: 'priority', label: 'الأولوية', type: 'seg', options: opts(L.priority) },
      { k: 'status', label: 'الحالة', type: 'seg', options: opts(L.planStatus) },
      { k: 'description', label: 'وصف', type: 'textarea', rows: 2 },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'link', label: 'رابط', type: 'url', placeholder: 'https://', dir: 'ltr' },
      { k: 'image_id', label: 'صورة', type: 'image' },
      { k: 'remind', type: 'remind' },
    ],
    onSubmit: save('plans', row, 'تمت إضافة الخطة'), onDelete: delFn('plans', row),
  });
}

export function editTrip(row = null, defaults = {}) {
  openForm({
    title: row ? 'تعديل الرحلة' : 'رحلة جديدة', en: 'رحلاتنا',
    values: { status: 'planning', remind: '3', ...defaults, ...(row || {}) },
    fields: [
      { k: 'name', label: 'اسم الرحلة', required: true, placeholder: 'مثال: إجازة الصيف' },
      { k: 'destination', label: 'الوجهة' },
      { type: 'pair', fields: [{ k: 'start_date', label: 'تاريخ السفر', type: 'date' }, { k: 'end_date', label: 'تاريخ العودة', type: 'date' }] },
      { type: 'pair', fields: [{ k: 'budget', label: 'الميزانية', type: 'number' }, { k: 'status', label: 'الحالة', type: 'select', options: opts(L.tripStatus) }] },
      { k: 'flight_url', label: 'رابط الطيران', type: 'url', dir: 'ltr', placeholder: 'https://' },
      { k: 'flight_details', label: 'تفاصيل الطيران', type: 'textarea', rows: 2, placeholder: 'رقم الرحلة، الأوقات، رقم الحجز…' },
      { k: 'hotel_url', label: 'رابط الفندق', type: 'url', dir: 'ltr', placeholder: 'https://' },
      { k: 'hotel_details', label: 'تفاصيل الفندق', type: 'textarea', rows: 2 },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'image_id', label: 'صورة الغلاف', type: 'image' },
      { k: 'remind', type: 'remind', label: 'تذكير قبل السفر', only: ['', '1', '3', '7', 'custom'] },
    ],
    onSubmit: async (v) => { if (v.end_date && v.start_date && v.end_date < v.start_date) { toast('تاريخ العودة قبل تاريخ السفر', 'err'); return false; } await save('trips', row, 'تمت إضافة الرحلة')(v); },
    onDelete: delFn('trips', row),
  });
}

export function editExpense(row = null, defaults = {}) {
  openForm({
    title: row ? 'تعديل المصروف' : 'مصروف جديد', en: 'مصروفاتنا',
    values: { date: today(), category: 'food', paid_by: store.me.id, ...defaults, ...(row || {}) },
    fields: [
      { k: 'title', label: 'اسم المصروف', required: true },
      { type: 'pair', fields: [{ k: 'amount', label: 'المبلغ', type: 'number', required: true }, { k: 'date', label: 'التاريخ', type: 'date', required: true }] },
      { k: 'category', label: 'التصنيف', type: 'seg', options: opts(L.expCats) },
      { k: 'paid_by', label: 'من دفع', type: 'user' },
      ...(all('trips').length ? [{ k: 'trip_id', label: 'مرتبط برحلة (اختياري)', type: 'select', options: [{ v: '', l: '—' }, ...all('trips').map((t) => ({ v: t.id, l: t.name }))] }] : []),
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'receipt_id', label: 'صورة الفاتورة (اختياري)', type: 'image' },
    ],
    onSubmit: async (v) => { if (!(v.amount > 0)) { toast('أدخل مبلغًا صحيحًا', 'err'); return false; } await save('expenses', row, 'تمت إضافة المصروف')(v); },
    onDelete: delFn('expenses', row),
  });
}

export function editShopping(row = null, defaults = {}) {
  openForm({
    title: row ? 'تعديل المنتج' : 'منتج جديد', en: 'المقاضي',
    values: { category: 'groceries', remind: '', ...defaults, ...(row || {}) },
    fields: [
      { k: 'name', label: 'المنتج', required: true },
      { k: 'qty', label: 'الكمية', placeholder: 'مثال: 2 أو 1 كيلو' },
      { k: 'category', label: 'التصنيف', type: 'seg', options: opts(L.shopCats) },
      { k: 'buyer', label: 'من سيشتريه', type: 'user', none: 'غير محدد' },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'remind', type: 'remind', label: 'تذكير بالشراء', only: ['', 'custom'] },
    ],
    onSubmit: save('shopping', row), onDelete: delFn('shopping', row),
  });
}

export function editNote(row = null, defaults = {}) {
  openForm({
    title: row ? 'تعديل الرسالة' : 'رسالة صغيرة', en: 'رسائلنا الصغيرة',
    values: { kind: 'morning', color: 'cream', date: today(), ...defaults, ...(row || {}) },
    fields: [
      { k: 'kind', label: 'النوع', type: 'seg', options: opts(L.noteKinds) },
      { k: 'title', label: 'العنوان', placeholder: 'اختياري' },
      { k: 'body', label: 'الرسالة', type: 'textarea', rows: 4, placeholder: 'اكتب شيئًا لطيفًا…' },
      { k: 'color', label: 'اللون', type: 'seg', options: [{ v: 'cream', l: 'كريمي' }, { v: 'rose', l: 'وردي' }, { v: 'sand', l: 'رملي' }, { v: 'sage', l: 'زيتي' }, { v: 'charcoal', l: 'داكن' }] },
      { k: 'date', label: 'التاريخ', type: 'date' },
      { k: 'image_id', label: 'صورة', type: 'image' },
      { k: 'pinned', label: 'تثبيت الملاحظة', type: 'toggle' },
    ],
    onSubmit: async (v) => { if (!v.title && !v.body && !v.image_id) { toast('اكتب الرسالة أولًا', 'err'); return false; } await save('notes', row, 'تم إرسال الرسالة')(v); },
    onDelete: delFn('notes', row),
  });
}

export function editPlace(row = null, defaults = {}) {
  openForm({
    title: row ? 'تعديل المكان' : 'مكان جديد', en: 'أماكننا',
    values: { category: 'restaurant', visited: 0, ...defaults, ...(row || {}) },
    fields: [
      { k: 'name', label: 'الاسم', required: true },
      { k: 'category', label: 'التصنيف', type: 'seg', options: opts(L.placeCats) },
      { k: 'maps_url', label: 'رابط Google Maps', type: 'url', dir: 'ltr', placeholder: 'https://maps.app.goo.gl/…', hint: 'يُستخدم لفتح الموقع وعرضه على الخريطة' },
      { type: 'pair', fields: [{ k: 'location', label: 'المنطقة / الحي' }, { k: 'cuisine', label: 'نوع المطبخ / المكان' }] },
      { k: 'price', label: 'السعر التقريبي', type: 'price' },
      { k: 'rating', label: 'تقييمنا', type: 'stars' },
      { k: 'to_try', label: 'أشياء نحب نجربها', type: 'textarea', rows: 2 },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'visited', label: 'زرناه', type: 'toggle' },
      { k: 'visit_date', label: 'تاريخ الزيارة', type: 'date', show: (v) => !!v.visited },
      { k: 'favorite', label: 'من الأماكن المفضلة', type: 'toggle' },
      { k: 'image_id', label: 'الصورة الرئيسية', type: 'image' },
      { k: 'photos', label: 'صور من زيارتنا', type: 'images' },
    ],
    onSubmit: async (v) => save('places', row, 'تمت إضافة المكان')(await withCoords(v, row)), onDelete: delFn('places', row),
  });
}

export function editBucket(row = null, defaults = {}) {
  openForm({
    title: row ? 'تعديل' : 'إضافة للقائمة', en: 'قائمة الأمنيات',
    values: { status: 'wishlist', ...defaults, ...(row || {}) },
    fields: [
      { k: 'title', label: 'المكان أو النشاط', required: true },
      { k: 'description', label: 'وصف', type: 'textarea', rows: 2 },
      { type: 'pair', fields: [{ k: 'cost', label: 'التكلفة المتوقعة', type: 'number' }, { k: 'suggested_date', label: 'تاريخ مقترح', type: 'date' }] },
      { k: 'url', label: 'رابط الموقع', type: 'url', dir: 'ltr', placeholder: 'https://' },
      { k: 'status', label: 'الحالة', type: 'seg', options: opts(L.bucketStatus) },
      { k: 'image_id', label: 'صورة', type: 'image' },
    ],
    onSubmit: save('bucket', row), onDelete: delFn('bucket', row),
  });
}

/** The "+" button: one place to add anything. */
export async function quickAdd(date = null) {
  const k = await choose('إضافة سريعة', [
    { k: 'event', l: 'موعد', icon: 'clock', tone: 'rose' }, { k: 'task', l: 'مهمة', icon: 'tasks', tone: 'sage' },
    { k: 'date', l: 'مناسبة', icon: 'gift', tone: 'brown' }, { k: 'plan', l: 'خطة', icon: 'plans' },
    { k: 'trip', l: 'رحلة', icon: 'plane' }, { k: 'expense', l: 'مصروف', icon: 'wallet', tone: 'brown' },
    { k: 'shop', l: 'مقاضي', icon: 'bag', tone: 'sage' }, { k: 'note', l: 'رسالة', icon: 'note', tone: 'rose' },
  ], 'أضف ما تريد');
  const d = date || undefined;
  ({
    event: () => editEvent(null, d ? { date: d } : {}), task: () => editTask(null, d ? { due_date: d } : {}),
    date: () => editDate(null, d ? { date: d } : {}), plan: () => editPlan(null, d ? { date: d, month: monthKey(d) } : {}),
    trip: () => editTrip(null, d ? { start_date: d } : {}), expense: () => editExpense(null, d ? { date: d } : {}),
    shop: () => editShopping(), note: () => editNote(),
  })[k]?.();
}
export { all };
