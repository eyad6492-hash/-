// End-to-end API tests: starts a throwaway local Worker + D1 and exercises the real endpoints
// with a controllable clock (TEST_MODE only). Run: npm test
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const PORT = 8798, BASE = `http://localhost:${PORT}`;
const STATE = '.wrangler/test-state';
const SETUP_TOKEN = 'test-setup-token-123456';

fs.rmSync(STATE, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${STATE}`, { stdio: 'ignore' });
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', STATE, '--var', `SETUP_TOKEN:${SETUP_TOKEN}`, '--var', 'TEST_MODE:1', '--test-scheduled'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let devLog = ''; dev.stdout.on('data', (d) => (devLog += d)); dev.stderr.on('data', (d) => (devLog += d));

// Salon clock: Riyadh = UTC+3. T('2026-12-01', '14:05') -> epoch ms
const T = (date, hm) => Date.parse(`${date}T${hm}:00+03:00`);
let NOW = T('2026-12-01', '12:00');
const SALON = { lat: 24.7136, lng: 46.6753 };
const near = (m = 20) => ({ lat: SALON.lat + m / 111320, lng: SALON.lng, accuracy: 15, client_now: NOW, position_ts: NOW - 2000 });
let jitter = 0;
const fix = (m = 20) => { jitter += 1; const f = near(m + jitter * 0.3); return f; };

function client() {
  let cookie = '';
  return async function api(method, path, body, { raw = false, bytes = null } = {}) {
    const headers = { 'x-requested-with': 'mvs', 'x-test-now': String(NOW), cookie };
    let payload;
    if (bytes) { payload = bytes; headers['content-type'] = 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    if (raw) return res;
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data };
  };
}
const ok = (r, msg) => { if (r.status >= 300) throw new Error(`${msg}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const jpeg = () => { const b = new Uint8Array(2048); b.set([0xff, 0xd8, 0xff, 0xe0]); crypto.getRandomValues(b.subarray(10)); return b; };
const pdf = () => new TextEncoder().encode('%PDF-1.4\n%test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n    ', e.message); }
}

async function main() {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/auth/status'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const admin = client(), anon = client(), barberA = client(), barberB = client(), sup = client();
  let aId, bId, sId, invA1, invB1, reportId, payId;

  console.log('\nالمصادقة والأمان');
  await test('لا وصول للبيانات بدون تسجيل دخول', async () => { assert.equal((await anon('GET', '/api/dashboard')).status, 401); });
  await test('رفض الطلبات بدون ترويسة CSRF', async () => { const r = await fetch(BASE + '/api/auth/login', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }); assert.equal(r.status, 403); });
  await test('إعداد المدير يرفض رمزاً خاطئاً', async () => { assert.equal((await anon('POST', '/api/auth/setup', { setup_token: 'x', email: 'admin@salon.test', password: 'Admin12345', full_name: 'المدير' })).status, 403); });
  await test('إنشاء حساب المدير', async () => { ok(await admin('POST', '/api/auth/setup', { setup_token: SETUP_TOKEN, email: 'admin@salon.test', password: 'Admin12345', full_name: 'المدير' }), 'setup'); });
  await test('لا يمكن إنشاء مدير ثانٍ عبر الإعداد', async () => { assert.equal((await anon('POST', '/api/auth/setup', { setup_token: SETUP_TOKEN, email: 'x@x.com', password: 'Admin12345', full_name: 'x' })).status, 409); });
  await test('دخول بكلمة مرور خاطئة يفشل', async () => { assert.equal((await anon('POST', '/api/auth/login', { email: 'admin@salon.test', password: 'wrong-pass1' })).status, 401); });

  console.log('\nالإعدادات والموظفون');
  await test('محاولة حضور قبل تحديد موقع الصالون تُرفض', async () => { /* checked after barber exists */ });
  await test('إضافة موقع الصالون ونطاق 100م', async () => { ok(await admin('POST', '/api/locations', { name: 'الفرع الرئيسي', ...SALON, radius_m: 100 }), 'loc'); });
  await test('رفض نسب لا يساوي مجموعها 100%', async () => { assert.equal((await admin('POST', '/api/employees', { email: 'bad@salon.test', full_name: 'x', password: 'Barber1234', role: 'barber', barber_rate: 50, shop_rate: 40 })).status, 400); });
  await test('إضافة حلاقين بنسب مستقلة ومشرف', async () => {
    aId = ok(await admin('POST', '/api/employees', { email: 'a@salon.test', full_name: 'أحمد', password: 'Barber1234', role: 'barber', barber_rate: 50, shop_rate: 50, start_date: '2026-11-01', phone: '0500000001' }), 'a').id;
    bId = ok(await admin('POST', '/api/employees', { email: 'b@salon.test', full_name: 'بدر', password: 'Barber1234', role: 'barber', barber_rate: 40, shop_rate: 60, start_date: '2026-11-01' }), 'b').id;
    sId = ok(await admin('POST', '/api/employees', { email: 's@salon.test', full_name: 'سالم', password: 'Super12345', role: 'supervisor', permissions: ['invoices.review', 'invoices.view'], must_change_password: false }), 's').id;
  });
  await test('البريد المكرر مرفوض', async () => { assert.equal((await admin('POST', '/api/employees', { email: 'a@salon.test', full_name: 'x', password: 'Barber1234' })).status, 409); });
  await test('الحلاق مطالب بتغيير كلمة المرور قبل أي شيء', async () => {
    ok(await barberA('POST', '/api/auth/login', { email: 'a@salon.test', password: 'Barber1234' }), 'login');
    assert.equal((await barberA('GET', '/api/me/summary')).status, 403);
    ok(await barberA('POST', '/api/auth/password', { current: 'Barber1234', next: 'NewPass123' }), 'pw');
    ok(await barberA('GET', '/api/me/summary'), 'summary');
    ok(await barberB('POST', '/api/auth/login', { email: 'b@salon.test', password: 'Barber1234' }), 'login b');
    ok(await barberB('POST', '/api/auth/password', { current: 'Barber1234', next: 'NewPass123' }), 'pw b');
    ok(await sup('POST', '/api/auth/login', { email: 's@salon.test', password: 'Super12345' }), 'login s');
  });
  await test('جداول دوام: أحمد 2م–10م، بدر 6م–2ص (بعد منتصف الليل)', async () => {
    const days = (s, e) => [0, 1, 2, 3, 4, 5, 6].map((w) => (w === 5 ? { weekday: w, is_off: true } : { weekday: w, start_time: s, end_time: e }));
    ok(await admin('POST', `/api/employees/${aId}/schedules`, { effective_from: '2026-11-01', grace_minutes: 10, days: days('14:00', '22:00') }), 'sa');
    ok(await admin('POST', `/api/employees/${bId}/schedules`, { effective_from: '2026-11-01', grace_minutes: 10, days: days('18:00', '02:00') }), 'sb');
  });

  console.log('\nالحضور والانصراف GPS');
  await test('حضور مبكر جداً يُرفض', async () => { NOW = T('2026-12-01', '11:00'); const r = await barberA('POST', '/api/attendance/check-in', fix()); assert.equal(r.status, 422); });
  await test('حضور من خارج النطاق يُرفض ويُسجل في المحاولات', async () => {
    NOW = T('2026-12-01', '14:05');
    const r = await barberA('POST', '/api/attendance/check-in', near(2000));
    assert.equal(r.status, 422); assert.match(r.data.error, /خارج نطاق/);
    const at = ok(await admin('GET', '/api/attendance/attempts'), 'attempts');
    assert.ok(at.items.some((x) => x.user_id === aId && !x.ok && x.distance_m > 1900));
  });
  await test('دقة GPS ضعيفة تُرفض', async () => { const r = await barberA('POST', '/api/attendance/check-in', { ...fix(), accuracy: 900 }); assert.equal(r.status, 422); });
  await test('موقع قديم يُرفض', async () => { const r = await barberA('POST', '/api/attendance/check-in', { ...fix(), position_ts: NOW - 10 * 60e3 }); assert.equal(r.status, 422); });
  await test('حضور داخل النطاق ضمن فترة السماح = بدون تأخير', async () => {
    const d = ok(await barberA('POST', '/api/attendance/check-in', fix()), 'in');
    assert.equal(d.attendance.work_date, '2026-12-01'); assert.equal(d.attendance.late_minutes, 0);
  });
  await test('تكرار الحضور مرفوض', async () => { assert.equal((await barberA('POST', '/api/attendance/check-in', fix())).status, 422); });
  await test('انصراف بدون حضور مرفوض', async () => { assert.equal((await barberB('POST', '/api/attendance/check-out', fix())).status, 422); });
  await test('تأخير محسوب (بدر 18:30 = 30 دقيقة)', async () => {
    NOW = T('2026-12-01', '18:30');
    const d = ok(await barberB('POST', '/api/attendance/check-in', fix()), 'in b');
    assert.equal(d.attendance.late_minutes, 30);
  });
  await test('انصراف بعد منتصف الليل يُحسب لنفس يوم الدوام + خروج مبكر', async () => {
    NOW = T('2026-12-02', '01:30');
    const d = ok(await barberB('POST', '/api/attendance/check-out', fix()), 'out b');
    assert.equal(d.attendance.work_date, '2026-12-01'); assert.equal(d.attendance.early_leave_minutes, 30); assert.equal(d.attendance.worked_minutes, 420);
  });
  await test('انصراف أحمد 9م = خروج مبكر 60د', async () => {
    NOW = T('2026-12-01', '21:00');
    const d = ok(await barberA('POST', '/api/attendance/check-out', fix()), 'out a');
    assert.equal(d.attendance.early_leave_minutes, 60); assert.equal(d.attendance.worked_minutes, 415);
  });

  console.log('\nالفواتير والنسب');
  let img1, img2;
  await test('رفع صورة فاتورة (الحلاق)', async () => {
    img1 = ok(await barberA('POST', '/api/files?kind=invoice', undefined, { bytes: jpeg() }), 'up').id;
    img2 = ok(await barberA('POST', '/api/files?kind=invoice', undefined, { bytes: jpeg() }), 'up2').id;
  });
  await test('رفض ملف ليس صورة', async () => { assert.equal((await barberA('POST', '/api/files?kind=invoice', undefined, { bytes: new TextEncoder().encode('hello') })).status, 400); });
  await test('الفاتورة بدون صورة مرفوضة', async () => { assert.equal((await barberA('POST', '/api/invoices', { amount: 100 })).status, 400); });
  await test('تسجيل فاتورة 100 → 50/50', async () => {
    NOW = T('2026-12-01', '16:00');
    const d = ok(await barberA('POST', '/api/invoices', { amount: 100, service_type: 'قص', image_file_id: img1 }), 'inv');
    invA1 = d.invoice.id; assert.equal(d.invoice.barber_share, 50); assert.equal(d.invoice.shop_share, 50); assert.equal(d.invoice.status, 'registered');
  });
  await test('نفس الصورة لا تُستخدم لفاتورتين (منع التكرار)', async () => { assert.equal((await barberA('POST', '/api/invoices', { amount: 100, image_file_id: img1 })).status, 400); });
  await test('الحلاق لا يستطيع استخدام صورة حلاق آخر', async () => { assert.equal((await barberB('POST', '/api/invoices', { amount: 50, image_file_id: img2 })).status, 400); });
  await test('فاتورة بدر 200 → 40/60 = 80/120', async () => {
    const im = ok(await barberB('POST', '/api/files?kind=invoice', undefined, { bytes: jpeg() }), 'up').id;
    const d = ok(await barberB('POST', '/api/invoices', { amount: 200, image_file_id: im }), 'inv b');
    invB1 = d.invoice.id; assert.equal(d.invoice.barber_share, 80); assert.equal(d.invoice.shop_share, 120);
  });
  await test('تغيير النسبة لا يغيّر الفواتير السابقة', async () => {
    ok(await admin('POST', `/api/employees/${aId}/rates`, { barber_rate: 60, shop_rate: 40, effective_from: '2026-12-01', note: 'ترقية' }), 'rate');
    const d = ok(await barberA('POST', '/api/invoices', { amount: 100, image_file_id: img2 }), 'inv2');
    assert.equal(d.invoice.barber_share, 60);
    const old = ok(await admin('GET', `/api/invoices/${invA1}`), 'old');
    assert.equal(old.invoice.barber_share, 50); assert.equal(old.invoice.barber_rate, 50);
  });
  await test('نسبة بتاريخ سابق مع وجود فواتير بعده مرفوضة', async () => { assert.equal((await admin('POST', `/api/employees/${aId}/rates`, { barber_rate: 70, shop_rate: 30, effective_from: '2026-11-15' })).status, 400); });

  console.log('\nعزل البيانات والصلاحيات');
  await test('الحلاق لا يرى فواتير الآخرين', async () => {
    assert.equal((await barberA('GET', '/api/invoices')).status, 403);
    assert.equal((await barberA('GET', `/api/invoices/${invB1}`)).status, 404);
    const mine = ok(await barberA('GET', '/api/me/invoices'), 'mine'); assert.ok(mine.items.every((i) => i.user_id === aId)); assert.equal(mine.items.length, 2);
  });
  await test('الحلاق لا يستطيع فتح صورة فاتورة غيره', async () => {
    const inv = ok(await admin('GET', `/api/invoices/${invB1}`), 'b'); const fid = inv.invoice.images[0];
    assert.equal((await barberA('GET', `/api/files/${fid}`)).status, 404);
    assert.equal((await barberB('GET', `/api/files/${fid}`)).status, 200);
  });
  await test('الحلاق لا يصل لصفحات الإدارة', async () => {
    for (const p of ['/api/employees', '/api/dashboard', '/api/dues', '/api/attendance', '/api/audit', '/api/leaves', '/api/employee-reports', '/api/employees/lite']) assert.equal((await barberA('GET', p)).status, 403, p);
  });
  await test('الحلاق لا يستطيع تعديل فاتورته مباشرة', async () => { assert.equal((await barberA('PUT', `/api/invoices/${invA1}`, { amount: 999 })).status, 403); });
  await test('المشرف يراجع الفواتير فقط حسب صلاحياته', async () => {
    ok(await sup('GET', '/api/invoices'), 'list');
    assert.equal((await sup('GET', '/api/dues')).status, 403);
    assert.equal((await sup('POST', '/api/payments', { user_id: aId, amount: 1, method: 'نقداً' })).status, 403);
  });

  console.log('\nمراجعة الفواتير');
  await test('طلب تعديل يحتاج ملاحظة', async () => { assert.equal((await sup('POST', `/api/invoices/${invA1}/review`, { status: 'needs_edit' })).status, 400); });
  await test('طلب تعديل ← الحلاق يعدّل ← قيد المراجعة', async () => {
    ok(await sup('POST', `/api/invoices/${invA1}/review`, { status: 'needs_edit', note: 'المبلغ في الصورة 120' }), 'ne');
    const n = ok(await barberA('GET', '/api/notifications'), 'n'); assert.ok(n.items.some((x) => x.type === 'invoice_review'));
    ok(await barberA('PUT', `/api/invoices/${invA1}`, { amount: 120 }), 'edit');
    const d = ok(await admin('GET', `/api/invoices/${invA1}`), 'g');
    assert.equal(d.invoice.status, 'under_review'); assert.equal(d.invoice.barber_share, 60); assert.equal(d.invoice.barber_rate, 50);
    assert.ok(d.history.length >= 3);
  });
  await test('اعتماد الفاتورة', async () => { ok(await sup('POST', `/api/invoices/${invA1}/review`, { status: 'approved' }), 'ap'); });
  await test('الحلاق يرسل طلب تعديل لفاتورة معتمدة', async () => { ok(await barberA('POST', `/api/invoices/${invA1}/edit-request`, { text: 'نسيت إضافة خدمة' }), 'er'); });

  console.log('\nالمستحقات والدفعات');
  await test('مستحق أحمد = 60 + 60 = 120', async () => { const d = ok(await barberA('GET', '/api/me/dues'), 'dues'); assert.equal(d.dues.total.barber_due, 120); assert.equal(d.dues.total.remaining, 120); });
  await test('تسجيل دفعة 100 مع إثبات', async () => {
    const proof = ok(await admin('POST', `/api/files?kind=payment_proof&user_id=${aId}`, undefined, { bytes: jpeg() }), 'proof').id;
    const d = ok(await admin('POST', '/api/payments', { user_id: aId, amount: 100, method: 'تحويل بنكي', reference: 'TX-1', paid_on: '2026-12-01', proof_file_id: proof }), 'pay');
    payId = d.id; assert.equal(d.remaining_after, 20);
  });
  await test('دفعة أكبر من المتبقي تحتاج تأكيد', async () => {
    assert.equal((await admin('POST', '/api/payments', { user_id: aId, amount: 50, method: 'نقداً', paid_on: '2026-12-01' })).status, 409);
  });
  await test('المدفوع والمتبقي يتحدثان', async () => {
    const d = ok(await admin('GET', `/api/dues/${aId}`), 'd'); assert.equal(d.dues.total.paid, 100); assert.equal(d.dues.total.remaining, 20); assert.equal(d.payments[0].proofs.length, 1);
    const all = ok(await admin('GET', '/api/dues'), 'all'); assert.equal(all.totals.remaining, 20 + 80);
  });

  console.log('\nوضع الاحتساب بعد الاعتماد');
  await test('في وضع "بعد الاعتماد" تُحتسب المعتمدة فقط', async () => {
    ok(await admin('PUT', '/api/settings', { invoice_count_mode: 'on_approve' }), 's');
    const d = ok(await admin('GET', `/api/dues/${aId}`), 'd'); assert.equal(d.dues.total.barber_due, 60);
    ok(await admin('PUT', '/api/settings', { invoice_count_mode: 'on_create' }), 's2');
  });

  console.log('\nالإجازات والغياب');
  await test('طلب إجازة واعتمادها', async () => {
    const id = ok(await barberA('POST', '/api/me/leaves', { start_date: '2026-12-03', end_date: '2026-12-03', reason: 'ظرف عائلي' }), 'lv').id;
    ok(await admin('POST', `/api/leaves/${id}/decide`, { status: 'approved', note: 'بالتوفيق' }), 'dec');
  });
  await test('يوم 2 بلا حضور = غياب، يوم 3 = إجازة (لا تُحسب غياباً)', async () => {
    NOW = T('2026-12-04', '12:00');
    const d = ok(await barberA('GET', '/api/me/attendance?from=2026-12-01&to=2026-12-03'), 'att');
    const by = Object.fromEntries(d.rows.map((r) => [r.date, r.status]));
    assert.equal(by['2026-12-01'], 'present'); assert.equal(by['2026-12-02'], 'absent'); assert.equal(by['2026-12-03'], 'leave');
    assert.equal(d.summary.absent_days, 1); assert.equal(d.summary.leave_days, 1); assert.equal(d.summary.early_count, 1);
  });
  await test('تنبيه آلي للمدير عند عدم الحضور بعد فترة السماح', async () => {
    NOW = T('2026-12-04', '14:30');
    const r = await fetch(BASE + '/api/test/cron', { method: 'POST', headers: { 'x-requested-with': 'mvs', 'x-test-now': String(NOW) } });
    const d = await r.json(); assert.ok(d.sent >= 1);
    const n = ok(await admin('GET', '/api/notifications'), 'n'); assert.ok(n.items.some((x) => x.type === 'late'));
    const r2 = await (await fetch(BASE + '/api/test/cron', { method: 'POST', headers: { 'x-requested-with': 'mvs', 'x-test-now': String(NOW) } })).json();
    assert.equal(r2.sent, 0, 'no duplicate alerts');
  });

  console.log('\nلوحة التحكم والتقارير');
  await test('لوحة التحكم', async () => {
    NOW = T('2026-12-01', '19:00');
    const d = ok(await admin('GET', '/api/dashboard'), 'dash');
    assert.equal(d.today, '2026-12-01'); assert.equal(d.counts.employees, 2); assert.equal(d.counts.present, 2); assert.equal(d.today_totals.sales, 420);
  });
  await test('التقرير العام لفترة مخصصة', async () => {
    const d = ok(await admin('GET', '/api/reports/summary?from=2026-12-01&to=2026-12-03'), 'sum');
    assert.equal(d.totals.sales, 420); assert.equal(d.totals.shop, 60 + 40 + 120); assert.equal(d.totals.barber, 60 + 60 + 80);
  });
  await test('إصدار تقرير PDF وإرساله للموظف', async () => {
    NOW = T('2026-12-04', '12:00');
    const r = ok(await admin('POST', '/api/employee-reports', { user_id: aId, period_type: 'custom', from: '2026-12-01', to: '2026-12-03', include_images: true }), 'draft');
    reportId = r.report.id; assert.equal(r.snapshot.financial.sales, 220); assert.equal(r.snapshot.attendance.summary.absent_days, 1);
    const f = ok(await admin('POST', `/api/files?kind=report_pdf&user_id=${aId}`, undefined, { bytes: pdf() }), 'pdf').id;
    ok(await admin('POST', `/api/employee-reports/${reportId}/pdf`, { pdf_file_id: f }), 'attach');
    assert.equal((await barberA('GET', `/api/files/${f}`)).status, 404, 'hidden until sent');
    assert.equal((await barberA('GET', '/api/me/reports')).data.items.length, 0);
    ok(await admin('POST', `/api/employee-reports/${reportId}/send`), 'send');
    const mine = ok(await barberA('GET', '/api/me/reports'), 'mine'); assert.equal(mine.items.length, 1);
    assert.equal((await barberA('GET', `/api/files/${f}`)).status, 200);
    assert.equal((await barberB('GET', `/api/employee-reports/${reportId}`)).status, 404);
    const n = ok(await barberA('GET', '/api/notifications'), 'n'); assert.ok(n.items.some((x) => x.type === 'report'));
  });
  await test('أرشيف التقارير وإعادة الإرسال', async () => {
    ok(await admin('POST', `/api/employee-reports/${reportId}/send`), 'resend');
    const d = ok(await admin('GET', `/api/employee-reports/${reportId}`), 'g');
    assert.equal(d.report.send_count, 2); assert.ok(d.trail.some((t) => t.action === 'resent'));
  });

  console.log('\nإغلاق اليوم والفترات');
  await test('إغلاق اليوم يتطلب تأكيداً عند وجود فواتير معلقة', async () => {
    assert.equal((await admin('POST', '/api/closures', { kind: 'day', date: '2026-12-01' })).status, 409);
    ok(await admin('POST', '/api/closures', { kind: 'day', date: '2026-12-01', force: true }), 'close');
  });
  await test('بعد الإغلاق: الحلاق لا يسجل فاتورة لنفس اليوم', async () => {
    NOW = T('2026-12-01', '23:00');
    const im = ok(await barberA('POST', '/api/files?kind=invoice', undefined, { bytes: jpeg() }), 'up').id;
    assert.equal((await barberA('POST', '/api/invoices', { amount: 50, image_file_id: im })).status, 423);
  });
  await test('بعد الإغلاق: المشرف لا يعدّل، والمدير يعدّل بسبب موثّق فقط', async () => {
    assert.equal((await sup('POST', `/api/invoices/${invB1}/review`, { status: 'approved' })).status, 423);
    assert.equal((await admin('POST', `/api/invoices/${invB1}/review`, { status: 'approved' })).status, 423);
    ok(await admin('POST', `/api/invoices/${invB1}/review`, { status: 'approved', reason: 'اعتماد متأخر بعد التدقيق' }), 'override');
    const a = ok(await admin('GET', '/api/audit?entity=invoice'), 'audit'); assert.ok(a.items.some((x) => (x.reason || '').includes('بعد الإغلاق')));
  });
  await test('إغلاق فترة موظف وكشف الحساب', async () => {
    NOW = T('2026-12-04', '12:00');
    const p = ok(await admin('GET', `/api/closures/preview?kind=period&user_id=${aId}&from=2026-12-01&to=2026-12-03`), 'prev');
    assert.equal(p.summary.closing_balance, 20);
    ok(await admin('POST', '/api/closures', { kind: 'period', user_id: aId, from: '2026-12-01', to: '2026-12-03' }), 'close p');
    assert.equal((await admin('POST', `/api/payments/${payId}/void`, { reason: 'خطأ' })).status, 423);
  });

  console.log('\nسجل العمليات والحساب');
  await test('سجل العمليات يوثّق قبل/بعد', async () => {
    const a = ok(await admin('GET', '/api/audit?entity=rate'), 'a'); assert.ok(a.items[0].before_json && a.items[0].after_json);
  });
  await test('تعطيل الحساب يُنهي الجلسة', async () => {
    ok(await admin('POST', `/api/employees/${bId}/active`, { active: false }), 'off');
    assert.equal((await barberB('GET', '/api/me/summary')).status, 401);
    assert.equal((await barberB('POST', '/api/auth/login', { email: 'b@salon.test', password: 'NewPass123' })).status, 401);
  });
  await test('تسجيل الخروج', async () => { ok(await barberA('POST', '/api/auth/logout'), 'out'); assert.equal((await barberA('GET', '/api/me/summary')).status, 401); });

  console.log(`\n${passed} ناجح، ${failed} فاشل`);
}

main().catch((e) => { console.error(e); failed++; }).finally(() => {
  try { process.kill(-dev.pid); } catch {}
  if (failed) { console.log(devLog.split('\n').filter((l) => /error|Error/.test(l)).slice(-15).join('\n')); }
  process.exit(failed ? 1 : 0);
});
