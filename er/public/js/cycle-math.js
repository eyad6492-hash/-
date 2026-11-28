// Cycle statistics & approximate predictions (shared by the app and the Worker). Not medical advice.
import { addDays, diffDays } from './dates.js';

export function cycleStats(entries, today) {
  const list = [...entries].filter((e) => e.start_date).sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const lengths = [];
  for (let i = 1; i < list.length; i++) {
    const L = diffDays(list[i - 1].start_date, list[i].start_date);
    if (L >= 18 && L <= 60) lengths.push(L);
  }
  const periods = list.filter((e) => e.end_date).map((e) => diffDays(e.start_date, e.end_date) + 1).filter((n) => n > 0 && n < 15);
  const recent = lengths.slice(-6);
  const avgCycle = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 28;
  const avgPeriod = periods.length ? Math.round(periods.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, periods.length)) : 5;
  const last = list[list.length - 1] || null;
  let next = null, ovulation = null, fertileFrom = null, fertileTo = null, inPeriod = false, dayOfCycle = null;
  if (last) {
    next = addDays(last.start_date, avgCycle);
    while (today && next < today) next = addDays(next, avgCycle); // keep the estimate in the future
    ovulation = addDays(next, -14);
    fertileFrom = addDays(ovulation, -5);
    fertileTo = addDays(ovulation, 1);
    const end = last.end_date || addDays(last.start_date, avgPeriod - 1);
    if (today) { inPeriod = today >= last.start_date && today <= end; dayOfCycle = diffDays(last.start_date, today) + 1; }
  }
  return { count: list.length, avgCycle, avgPeriod, hasHistory: recent.length > 0, last, next, ovulation, fertileFrom, fertileTo, inPeriod, dayOfCycle, daysToNext: next && today ? diffDays(today, next) : null };
}
