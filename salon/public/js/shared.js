// Logic shared by the browser and the Worker (pure functions, no DOM / no env).

export const ROLES = {
  admin: { label: 'مدير (Admin)' },
  supervisor: { label: 'مشرف (Supervisor)' },
  barber: { label: 'حلاق (Barber)' },
};

export const PERMISSIONS = {
  'dashboard.view': 'لوحة التحكم والمؤشرات',
  'employees.view': 'عرض الموظفين وملفاتهم',
  'employees.manage': 'إضافة وتعديل الحلاقين وكلمات المرور',
  'schedules.manage': 'إدارة أوقات الدوام',
  'rates.manage': 'تعديل نسب الحلاقين',
  'attendance.view': 'عرض الحضور والمحاولات المرفوضة',
  'attendance.manage': 'تعديل الحضور يدوياً',
  'invoices.view': 'عرض جميع الفواتير وصورها',
  'invoices.review': 'مراجعة واعتماد الفواتير',
  'payments.view': 'عرض المستحقات والدفعات',
  'payments.manage': 'تسجيل وإلغاء الدفعات',
  'reports.view': 'التقارير العامة',
  'employee_reports.manage': 'إصدار وإرسال تقارير الموظفين PDF',
  'leaves.manage': 'اعتماد ورفض الإجازات',
  'closures.manage': 'إغلاق الأيام والفترات المالية',
  'closures.override': 'التعديل بعد الإغلاق (مع توثيق)',
  'audit.view': 'سجل العمليات',
  'settings.manage': 'إعدادات الصالون والموقع',
};

export const INVOICE_STATUS = {
  registered: 'مسجلة',
  under_review: 'قيد المراجعة',
  approved: 'معتمدة',
  rejected: 'مرفوضة',
  needs_edit: 'تحتاج تعديل',
};
export const LEAVE_STATUS = { pending: 'بانتظار القرار', approved: 'معتمدة', rejected: 'مرفوضة', cancelled: 'ملغاة' };
export const EMP_STATUS = { active: 'نشط', on_leave: 'في إجازة', suspended: 'موقوف', left: 'ترك العمل' };
export const DAY_STATUS = {
  present: 'حاضر', late: 'متأخر', absent: 'غائب', leave: 'إجازة', off: 'راحة', upcoming: 'لم يبدأ',
  open: 'داخل الدوام', extra: 'عمل إضافي', waiting: 'لم يسجل بعد', unscheduled: 'بدون جدول',
};
export const PAY_METHODS = ['تحويل بنكي', 'نقداً', 'STC Pay', 'شيك', 'أخرى'];
export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** Which invoice statuses count financially, by the salon's setting. */
export function countedStatuses(mode) {
  return mode === 'on_approve' ? ['approved'] : ['registered', 'under_review', 'approved', 'needs_edit'];
}

export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** Splits an invoice amount. The shop share is the remainder so both always add up to the amount. */
export function splitAmount(amount, barberRate) {
  const a = round2(amount);
  const barber = round2((a * Number(barberRate)) / 100);
  return { barber_share: barber, shop_share: round2(a - barber) };
}

export function validRates(barber, shop) {
  const b = Number(barber), s = Number(shop);
  return Number.isFinite(b) && Number.isFinite(s) && b >= 0 && s >= 0 && b <= 100 && s <= 100 && Math.abs(b + s - 100) < 0.001;
}

// ---------------- Dates & time (fixed salon UTC offset; Saudi Arabia has no DST) ----------------
const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseDate = (s) => new Date(s + 'T00:00:00Z');
export function addDays(s, n) { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return fmtDate(d); }
export const weekday = (s) => parseDate(s).getUTCDay();
export const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 864e5);
export function eachDay(from, to, max = 400) {
  const out = []; let d = from;
  while (d <= to && out.length < max) { out.push(d); d = addDays(d, 1); }
  return out;
}
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const hmToMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/** Local wall-clock date/time of an instant. */
export function localParts(ms, offsetMin) {
  const d = new Date(ms + offsetMin * 60e3);
  return { date: fmtDate(d), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}
/** Business date: the salon "day" starts at dayStartHour (e.g. 05:00), so a 02:00 checkout belongs to the previous day. */
export function businessDate(ms, offsetMin, dayStartHour = 5) {
  return localParts(ms - dayStartHour * 3600e3, offsetMin).date;
}
/** UTC instant (ms) of a local date + HH:MM. */
export function instant(date, hm, offsetMin) {
  return parseDate(date).getTime() + hmToMin(hm) * 60e3 - offsetMin * 60e3;
}
/** Shift window for a work date. An end time <= start time means the shift ends after midnight. */
export function shiftWindow(date, start, end, offsetMin) {
  const s = instant(date, start, offsetMin);
  let e = instant(date, end, offsetMin);
  if (e <= s) e += 864e5;
  return { start: s, end: e };
}
export function shiftMinutes(start, end) { let m = hmToMin(end) - hmToMin(start); if (m <= 0) m += 1440; return m; }

/** Period presets relative to a business date. Week starts on Saturday (Saudi convention). */
export function periodRange(type, today) {
  if (type === 'day') return { from: today, to: today };
  if (type === 'week') { const back = (weekday(today) + 1) % 7; const from = addDays(today, -back); return { from, to: addDays(from, 6) }; }
  if (type === 'month') { const from = today.slice(0, 8) + '01'; const d = parseDate(from); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return { from, to: fmtDate(d) }; }
  return { from: today, to: today };
}

/**
 * Resolve an employee's planned shift for a work date.
 * schedules: [{effective_from, grace_minutes, days:{0..6:{is_off,start_time,end_time}}}] sorted ascending by effective_from
 * overrides: {date: {is_off,start_time,end_time}}
 * Returns null when no schedule applies, {off:true} for a rest day, or {start,end,grace,startMs,endMs}.
 */
export function resolveShift(date, schedules, overrides, offsetMin) {
  let sch = null;
  for (const s of schedules) if (s.effective_from <= date) sch = s; else break;
  const ov = overrides?.[date];
  const grace = sch ? Number(sch.grace_minutes) || 0 : 0;
  if (ov) {
    if (ov.is_off) return { off: true, override: true };
    if (isTime(ov.start_time) && isTime(ov.end_time)) {
      const w = shiftWindow(date, ov.start_time, ov.end_time, offsetMin);
      return { start: ov.start_time, end: ov.end_time, grace, startMs: w.start, endMs: w.end, override: true };
    }
  }
  if (!sch) return null;
  const day = sch.days?.[weekday(date)];
  if (!day || day.is_off || !isTime(day.start_time) || !isTime(day.end_time)) return { off: true };
  const w = shiftWindow(date, day.start_time, day.end_time, offsetMin);
  return { start: day.start_time, end: day.end_time, grace, startMs: w.start, endMs: w.end };
}

/** Great-circle distance in metres. */
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Day-by-day attendance status for one employee.
 * shiftFor(date) -> resolveShift result; att: {date: attendanceRow}; leaves: Set(date)
 */
export function attendanceDays({ from, to, nowMs, shiftFor, att, leaves }) {
  const rows = [];
  for (const date of eachDay(from, to)) {
    const sh = shiftFor(date);
    const a = att[date];
    const onLeave = leaves.has(date);
    let status;
    if (a) {
      if (!a.check_out_at) status = 'open';
      else if (!a.sched_start) status = 'extra';
      else status = a.late_minutes > 0 ? 'late' : 'present';
    } else if (onLeave) status = 'leave';
    else if (!sh) status = 'unscheduled';
    else if (sh.off) status = 'off';
    else if (nowMs < sh.startMs) status = 'upcoming';
    else if (nowMs < sh.endMs) status = nowMs > sh.startMs + sh.grace * 60e3 ? 'waiting' : 'upcoming';
    else status = 'absent';
    rows.push({
      date, status, shift: sh && !sh.off ? `${sh.start} – ${sh.end}` : null,
      check_in_at: a?.check_in_at || null, check_out_at: a?.check_out_at || null,
      late_minutes: a?.late_minutes || 0, early_leave_minutes: a?.early_leave_minutes || 0, worked_minutes: a?.worked_minutes || 0,
      flags: a?.flags || '[]', id: a?.id || null,
    });
  }
  return rows;
}

export function attendanceSummary(rows) {
  const s = { scheduled_days: 0, present_days: 0, absent_days: 0, leave_days: 0, off_days: 0, late_count: 0, late_minutes: 0, early_count: 0, early_minutes: 0, worked_minutes: 0 };
  for (const r of rows) {
    if (['present', 'late', 'absent', 'open', 'waiting'].includes(r.status)) s.scheduled_days++;
    if (['present', 'late', 'open', 'extra'].includes(r.status)) s.present_days++;
    if (r.status === 'absent') s.absent_days++;
    if (r.status === 'leave') s.leave_days++;
    if (r.status === 'off') s.off_days++;
    if (r.late_minutes > 0) { s.late_count++; s.late_minutes += r.late_minutes; }
    if (r.early_leave_minutes > 0) { s.early_count++; s.early_minutes += r.early_leave_minutes; }
    s.worked_minutes += r.worked_minutes || 0;
  }
  s.avg_worked_minutes = s.present_days ? Math.round(s.worked_minutes / s.present_days) : 0;
  return s;
}

export const minutesLabel = (m) => {
  m = Math.round(Number(m) || 0);
  if (!m) return '0د';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}س${r ? ` ${r}د` : ''}` : `${r}د`;
};
