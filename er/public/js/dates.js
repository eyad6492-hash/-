// Shared date helpers — Gregorian + Hijri (Umm al-Qura via Intl). Used by the app AND the Worker.
// All dates are plain 'YYYY-MM-DD' strings interpreted as calendar days (no time zone drift).

export const HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
export const GREG_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const GREG_MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return { y, m, d }; };
const utc = (s) => { const { y, m, d } = parse(s); return Date.UTC(y, m - 1, d, 12); };
const fromUtc = (ms) => { const t = new Date(ms); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
export const addDays = (s, n) => fromUtc(utc(s) + n * 86400000);
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 86400000); // b - a
export const weekday = (s) => new Date(utc(s)).getUTCDay();
export const monthKey = (s) => String(s).slice(0, 7);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const addMonths = (key, n) => { let [y, m] = key.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${pad(m)}`; };

/** Today's date in a time zone (default Riyadh). */
export function todayIn(tz = 'Asia/Riyadh', at = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return at.toISOString().slice(0, 10); }
}
/** Local wall-clock 'YYYY-MM-DDTHH:MM' in a time zone. */
export function nowLocal(tz = 'Asia/Riyadh', at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// ---------------- Hijri (Umm al-Qura) ----------------
let fmt = null;
function hFmt() {
  if (!fmt) fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
  return fmt;
}
const hCache = new Map();
/** Gregorian 'YYYY-MM-DD' → { y, m, d } Hijri (Umm al-Qura). */
export function toHijri(s) {
  const k = String(s).slice(0, 10);
  if (hCache.has(k)) return hCache.get(k);
  const parts = hFmt().formatToParts(new Date(utc(k)));
  const g = (t) => Number(parts.find((p) => p.type === t)?.value);
  const r = { y: g('year') || g('relatedYear'), m: g('month'), d: g('day') };
  if (hCache.size > 5000) hCache.clear();
  hCache.set(k, r);
  return r;
}
const hOrd = (h) => h.y * 400 + h.m * 31 + h.d;
/** Hijri (y, m, d) → Gregorian 'YYYY-MM-DD'. Day 30 in a 29-day month falls back to day 29. */
export function fromHijri(y, m, d) {
  const H_EPOCH = Date.UTC(622, 6, 19, 12); // ~1 Muharram 1 AH (proleptic Gregorian)
  let est = fromUtc(H_EPOCH + Math.round(((y - 1) * 354.36667 + (m - 1) * 29.5306 + (d - 1)) * 86400000));
  for (let i = 0; i < 8; i++) {
    const h = toHijri(est);
    const delta = (y - h.y) * 354 + (m - h.m) * 29.5 + (d - h.d);
    if (Math.abs(delta) < 1) break;
    est = addDays(est, Math.round(delta));
  }
  for (let i = 0; i < 4 && hOrd(toHijri(est)) > hOrd({ y, m, d }); i++) est = addDays(est, -1);
  for (let i = 0; i < 4 && hOrd(toHijri(est)) < hOrd({ y, m, d }); i++) est = addDays(est, 1);
  const h = toHijri(est);
  if (h.d !== d || h.m !== m) { // requested day doesn't exist in this month (e.g. 30) → last day of month
    if (d > 1) return fromHijri(y, m, d - 1);
  }
  return est;
}
export function hijriMonthLength(y, m) { const a = fromHijri(y, m, 1); const b = m === 12 ? fromHijri(y + 1, 1, 1) : fromHijri(y, m + 1, 1); return diffDays(a, b); }

export function fmtHijri(s, { year = true } = {}) { const h = toHijri(s); return `${h.d} ${HIJRI_MONTHS[h.m - 1]}${year ? ` ${h.y}هـ` : ''}`; }
export function fmtGreg(s, { year = true, weekday: wd = false } = {}) {
  const { y, m, d } = parse(s);
  return `${wd ? WEEKDAYS[weekday(s)] + '، ' : ''}${d} ${GREG_MONTHS[m - 1]}${year ? ` ${y}` : ''}`;
}
/** Display according to the user's preference: 'g' | 'h' | 'both'. */
export function fmtDate(s, pref = 'both', opts = {}) {
  if (!s) return '';
  if (pref === 'h') return fmtHijri(s, opts);
  if (pref === 'g') return fmtGreg(s, opts);
  return `${fmtGreg(s, opts)} · ${fmtHijri(s, opts)}`;
}
export const fmtTime = (t) => {
  if (!t) return '';
  const [H, M] = t.split(':').map(Number);
  const h12 = ((H + 11) % 12) + 1;
  return `${h12}:${pad(M)} ${H < 12 ? 'ص' : 'م'}`;
};

/** Next occurrence (>= today) of an important date. Returns { date, years } or the original date if not recurring. */
export function nextOccurrence(item, today) {
  if (!item.date) return null;
  if (!item.recurring) return { date: item.date, years: null };
  if (item.cal === 'h') {
    const base = toHijri(item.date);
    const hm = item.h_month || base.m, hd = item.h_day || base.d;
    const ty = toHijri(today).y;
    for (const y of [ty - 1, ty, ty + 1, ty + 2]) {
      const g = fromHijri(y, hm, hd);
      if (g >= today) return { date: g, years: y - (item.h_year || base.y) };
    }
  }
  const { y: oy, m, d } = parse(item.date);
  const ty = parse(today).y;
  for (const y of [ty, ty + 1]) {
    const dd = Math.min(d, daysInMonth(y, m));
    const g = iso(y, m, dd);
    if (g >= today) return { date: g, years: y - oy };
  }
  return null;
}

/** All occurrences of a recurring date within [from, to]. */
export function occurrencesBetween(item, from, to) {
  if (!item.date) return [];
  if (!item.recurring) return item.date >= from && item.date <= to ? [item.date] : [];
  const out = [];
  if (item.cal === 'h') {
    const base = toHijri(item.date);
    const hm = item.h_month || base.m, hd = item.h_day || base.d;
    const y0 = toHijri(from).y - 1, y1 = toHijri(to).y + 1;
    for (let y = y0; y <= y1; y++) { const g = fromHijri(y, hm, hd); if (g >= from && g <= to && g >= item.date) out.push(g); }
    return out;
  }
  const { y: oy, m, d } = parse(item.date);
  for (let y = Math.max(oy, parse(from).y); y <= parse(to).y; y++) { const g = iso(y, m, Math.min(d, daysInMonth(y, m))); if (g >= from && g <= to) out.push(g); }
  return out;
}

/** Arabic countdown label for n days ahead. */
export function countdown(n) {
  if (n === null || n === undefined) return '';
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غدًا';
  if (n === 2) return 'بعد يومين';
  if (n < 0) { const a = -n; return a === 1 ? 'أمس' : a === 2 ? 'قبل يومين' : `قبل ${a} ${a <= 10 ? 'أيام' : 'يومًا'}`; }
  return `باقي ${n} ${n <= 10 ? 'أيام' : 'يومًا'}`;
}
export const daysWord = (n) => (n === 1 ? 'يوم' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يومًا`);
