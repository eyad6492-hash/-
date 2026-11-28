// أعياد ميلادنا — shared by the app and the Worker: defaults, next birthday, exact age, message selection.
import { addDays, diffDays, daysInMonth, iso, parse, toHijri, fromHijri } from './dates.js';

/** Stored birth dates (Gregorian is the reference for age & countdown; the original Hijri date is kept as entered). */
export const DEFAULT_BIRTHDAYS = {
  E: { greg: '2002-10-06', hijri: '1423-07-29' },
  R: { greg: '2004-02-27', hijri: '1425-01-07' },
};
export const DEFAULT_CFG = {
  rules: [
    { from: 31, to: null, text: 'كل يوم معك حكاية جميلة، وننتظر يومك بكل حب ❤️' },
    { from: 8, to: 30, text: 'بدأ العد التنازلي ليوم ميلاد أغلى شخص ❤️' },
    { from: 4, to: 7, text: 'باقي أسبوع على يومك المميز، وأتمنى أخلي هاليوم أجمل أيامك 🎂' },
    { from: 2, to: 3, text: 'ثلاثة أيام ونحتفل بيوم ميلاد شخص وجوده في حياتي أجمل هدية ❤️' },
    { from: 1, to: 1, text: 'باقي يوم واحد فقط على يومك، وكلّي حماس للحظة اللي أحتفل فيها فيك ❤️' },
  ],
  today_text: 'اليوم مو يوم عادي، اليوم ميلاد الشخص اللي له مكانة كبيرة في قلبي. كل عام وأنت أجمل أيامي ❤️🎂',
  after_text: 'خلص يومك، لكن الاحتفال فيك ما يخلص أبدًا ❤️',
  after_days: 3,
};
export const birthdaysOf = (space) => ({ E: { ...DEFAULT_BIRTHDAYS.E, ...(space?.birthdays?.E || {}) }, R: { ...DEFAULT_BIRTHDAYS.R, ...(space?.birthdays?.R || {}) } });
export const cfgOf = (space) => ({ ...DEFAULT_CFG, ...(space?.bday_cfg || {}), rules: space?.bday_cfg?.rules?.length ? space.bday_cfg.rules : DEFAULT_CFG.rules });

/** Birthday of year y (29 Feb → 28 Feb in non-leap years). */
export function birthdayIn(greg, y) { const { m, d } = parse(greg); return iso(y, m, Math.min(d, daysInMonth(y, m))); }
/** Next birthday on or after `today`, with the age it completes. */
export function nextBirthday(greg, today) {
  const b = parse(greg), ty = parse(today).y;
  let date = birthdayIn(greg, ty);
  if (date < today) date = birthdayIn(greg, ty + 1);
  return { date, age: parse(date).y - b.y, days: diffDays(today, date) };
}
export function lastBirthday(greg, today) {
  const ty = parse(today).y;
  let date = birthdayIn(greg, ty);
  if (date > today) date = birthdayIn(greg, ty - 1);
  return { date, daysAgo: diffDays(date, today) };
}
/** Exact age in calendar years, months and days (real month lengths). */
export function exactAge(greg, today) {
  const a = parse(greg), b = parse(today);
  if (a.m === 2 && a.d === 29 && b.m === 2 && b.d === 28 && daysInMonth(b.y, 2) === 28) return { y: b.y - a.y, m: 0, d: 0, totalDays: diffDays(greg, today) }; // celebrated on 28 Feb
  let y = b.y - a.y, m = b.m - a.m, d = b.d - a.d;
  if (d < 0) { const pm = b.m === 1 ? 12 : b.m - 1, py = b.m === 1 ? b.y - 1 : b.y; d += Math.max(daysInMonth(py, pm), a.d); m--; }
  if (m < 0) { m += 12; y--; }
  return { y, m, d, totalDays: diffDays(greg, today) };
}
/** Which message to show: today → celebration, just after → "after", otherwise the most specific matching rule. */
export function pickMessage(cfg, greg, today) {
  const nb = nextBirthday(greg, today);
  if (nb.days === 0) return { kind: 'today', text: cfg.today_text };
  const lb = lastBirthday(greg, today);
  if (lb.daysAgo > 0 && lb.daysAgo <= (Number(cfg.after_days) || 0)) return { kind: 'after', text: cfg.after_text };
  const hits = cfg.rules.filter((r) => nb.days >= Number(r.from || 0) && (r.to === null || r.to === '' || r.to === undefined || nb.days <= Number(r.to)));
  hits.sort((x, y) => ((x.to ?? 1e9) - x.from) - ((y.to ?? 1e9) - y.from));
  return { kind: 'countdown', text: hits[0]?.text || '' };
}
export function hijriParts(h) { const [y, m, d] = String(h || '').split('-').map(Number); return y && m && d ? { y, m, d } : null; }
/** Validate a pair: does the stored Hijri date match the Gregorian one under Umm al-Qura? (informational only) */
export function hijriMatches(greg, hijri) { const h = toHijri(greg), p = hijriParts(hijri); return !!p && h.y === p.y && h.m === p.m && h.d === p.d; }
export { addDays, fromHijri };
