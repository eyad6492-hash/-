// "منذ أن عرفنا بعض" — exact elapsed time since the moment we met, in calendar units (years, months, days,
// hours, minutes, seconds), computed on local wall-clock time in the chosen time zone with real month lengths.
import { store } from './store.js';
import { daysInMonth } from './dates.js';
import { toDigits } from './numerals.js';

const pad = (n) => String(n).padStart(2, '0');

/** Wall-clock components of an instant in a time zone. */
export function wallClock(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
export function parseAt(at) {
  const m = String(at || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  return m ? { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0) } : null;
}
/** Local wall-clock time in `tz` → UTC milliseconds. */
export function zonedToUtc(c, tz) {
  const guess = Date.UTC(c.y, c.mo - 1, c.d, c.h, c.mi, c.s);
  let utc = guess;
  for (let i = 0; i < 2; i++) { const w = wallClock(utc, tz); utc = guess - (Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - utc); }
  return utc;
}

/** Calendar difference start → now (both as wall clocks in the same zone). */
export function elapsed(since, nowMs = Date.now()) {
  const a = parseAt(since?.at); if (!a) return null;
  const tz = since.tz || 'Asia/Riyadh';
  const startMs = zonedToUtc(a, tz);
  const future = nowMs < startMs;
  const b = wallClock(nowMs, tz);
  const [from, to] = future ? [b, a] : [a, b];
  let s = to.s - from.s, mi = to.mi - from.mi, h = to.h - from.h, d = to.d - from.d, mo = to.mo - from.mo, y = to.y - from.y;
  if (s < 0) { s += 60; mi--; }
  if (mi < 0) { mi += 60; h--; }
  if (h < 0) { h += 24; d--; }
  if (d < 0) { // borrow the length of the month before the end month (real month lengths)
    const pm = to.mo === 1 ? 12 : to.mo - 1, py = to.mo === 1 ? to.y - 1 : to.y;
    d += Math.max(daysInMonth(py, pm), from.d); mo--;
  }
  if (mo < 0) { mo += 12; y--; }
  const totalSec = Math.floor(Math.abs(nowMs - startMs) / 1000);
  return { y, mo, d, h, mi, s, future, startMs, totalSec, totalMin: Math.floor(totalSec / 60), totalHours: Math.floor(totalSec / 3600), totalDays: Math.floor(totalSec / 86400) };
}

// Arabic plural forms: [one, two, few (3–10), many (11+ / 0)]
const FORMS = { y: ['سنة', 'سنتان', 'سنوات', 'سنة'], mo: ['شهر', 'شهران', 'أشهر', 'شهرًا'], d: ['يوم', 'يومان', 'أيام', 'يومًا'], h: ['ساعة', 'ساعتان', 'ساعات', 'ساعة'], mi: ['دقيقة', 'دقيقتان', 'دقائق', 'دقيقة'], s: ['ثانية', 'ثانيتان', 'ثوانٍ', 'ثانية'] };
export function unit(k, n) { const f = FORMS[k]; return n === 1 ? f[0] : n === 2 ? f[1] : n >= 3 && n <= 10 ? f[2] : f[3]; }
export const UNITS = ['y', 'mo', 'd', 'h', 'mi', 's'];

/** Sentence: "3 سنوات و5 أشهر و12 يومًا و8 ساعات و24 دقيقة و35 ثانية". */
export function sentence(e) {
  const parts = UNITS.filter((k) => e[k] > 0 || k === 's').map((k) => (e[k] === 1 || e[k] === 2 ? unit(k, e[k]) : `${e[k]} ${unit(k, e[k])}`));
  return parts.join(' و');
}

/** Next yearly anniversary of the first day (date only). */
export function nextAnniversary(since, todayStr) {
  const a = parseAt(since?.at); if (!a) return null;
  const ty = +todayStr.slice(0, 4);
  for (const y of [ty, ty + 1]) {
    const dd = Math.min(a.d, daysInMonth(y, a.mo));
    const iso = `${y}-${pad(a.mo)}-${pad(dd)}`;
    if (iso >= todayStr && y > a.y) return { date: iso, years: y - a.y };
  }
  return null;
}

/** Markup with live cells; the ticker below refreshes them every second. */
export function counterCells(e, { compact = false } = {}) {
  const keys = UNITS.filter((k) => k !== 'y' || e.y > 0); // years appear once at least one has passed; compact only changes sizing
  return keys.map((k) => `<div class="since-cell"><b class="num" data-u="${k}">${e[k]}</b><span data-ul="${k}">${unit(k, e[k])}</span></div>`).join('');
}

function tick() {
  const nodes = document.querySelectorAll('[data-since-live]');
  if (!nodes.length) return;
  const e = elapsed(store.space?.since);
  if (!e) return;
  const set = (el, v) => { v = toDigits(v); if (el.textContent !== v) el.textContent = v; }; // respects the numerals setting
  for (const root of nodes) {
    root.querySelectorAll('[data-u]').forEach((el) => set(el, String(e[el.dataset.u])));
    root.querySelectorAll('[data-ul]').forEach((el) => set(el, unit(el.dataset.ul, e[el.dataset.ul])));
    root.querySelectorAll('[data-total]').forEach((el) => set(el, e[el.dataset.total].toLocaleString('en-US')));
    root.querySelectorAll('[data-sentence]').forEach((el) => set(el, sentence(e)));
  }
}
let timer = null;
export function startSinceTicker() {
  if (timer) return;
  // align with the wall-clock second so the seconds digit changes exactly on time
  setTimeout(() => { tick(); timer = setInterval(tick, 1000); }, 1000 - (Date.now() % 1000));
}
export { pad };

/** Monthly anniversaries of the first day: day D of every month (D > month length → last day of that month). */
export function monthlyAt(since, n) {
  const a = parseAt(since?.at); if (!a) return null;
  let y = a.y, m = a.mo + n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(a.d, daysInMonth(y, m)))}`;
}
export function monthlies(since, todayStr) {
  const a = parseAt(since?.at); if (!a) return { past: [], next: null };
  const past = []; let next = null;
  for (let n = 1; n < 1200; n++) {
    const d = monthlyAt(since, n);
    if (d <= todayStr) past.push({ n, date: d, yearly: n % 12 === 0 }); else { next = { n, date: d, yearly: n % 12 === 0 }; break; }
  }
  return { past: past.reverse(), next };
}
