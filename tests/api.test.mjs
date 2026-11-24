// End-to-end API tests. Starts a throwaway local Worker + D1 (separate state dir) and
// exercises the real endpoints. Run: npm test
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const PORT = 8799, BASE = `http://localhost:${PORT}`;
const STATE = '.wrangler/test-state';
const SETUP_TOKEN = 'test-setup-token-123456';
const VAULT_KEY = Buffer.alloc(32, 7).toString('base64');

fs.rmSync(STATE, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${STATE}`, { stdio: 'ignore' });
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', STATE, '--var', `SETUP_TOKEN:${SETUP_TOKEN}`, '--var', `VAULT_KEY:${VAULT_KEY}`], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let devLog = ''; dev.stdout.on('data', (d) => (devLog += d)); dev.stderr.on('data', (d) => (devLog += d));

function client() {
  let cookie = '';
  return async function api(method, path, body, raw = false) {
    const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'mbcc', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    if (raw) return res;
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
}
const ok = (r, msg) => { if (r.status >= 300) throw new Error(`${msg}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n    ', e.message); }
}

async function main() {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/api/auth/status'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const owner = client(), anon = client(), staff = client();
  const today = new Date().toISOString().slice(0, 10);
  let clientId, subId, campId, quoteId, staffId, vaultId;

  console.log('\nالمصادقة والأمان');
  await test('لا يمكن الوصول للبيانات بدون تسجيل دخول', async () => { assert.equal((await anon('GET', '/api/clients')).status, 401); });
  await test('رفض الطلبات بدون ترويسة CSRF', async () => { const r = await fetch(BASE + '/api/auth/login', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }); assert.equal(r.status, 403); });
  await test('إعداد المالك يرفض رمزًا خاطئًا', async () => { assert.equal((await anon('POST', '/api/auth/setup', { setup_token: 'wrong', username: 'owner', password: 'very-strong-pass', display_name: 'المالك' })).status, 403); });
  await test('إنشاء حساب المالك', async () => { ok(await owner('POST', '/api/auth/setup', { setup_token: SETUP_TOKEN, username: 'owner', password: 'very-strong-pass', display_name: 'المالك' }), 'setup'); });
  await test('لا يمكن إنشاء مالك ثانٍ (لا تسجيل عام)', async () => { assert.equal((await anon('POST', '/api/auth/setup', { setup_token: SETUP_TOKEN, username: 'x', password: 'very-strong-pass', display_name: 'x' })).status, 409); });
  await test('تسجيل الدخول بكلمة مرور خاطئة يفشل', async () => { assert.equal((await anon('POST', '/api/auth/login', { username: 'owner', password: 'wrong-pass' })).status, 401); });
  await test('تسجيل الدخول الصحيح', async () => { const c = client(); ok(await c('POST', '/api/auth/login', { username: 'owner', password: 'very-strong-pass' }), 'login'); assert.equal((await c('GET', '/api/auth/me')).data.user.role, 'owner'); });

  console.log('\nالعملاء');
  await test('إضافة عميل مع اشتراك', async () => {
    const d = ok(await owner('POST', '/api/clients', { name: 'متجر اختبار', store_name: 'متجر', phone: '0500000000', platforms: ['TikTok'], tags: ['VIP'], subscription: { start_date: today, duration_months: 1, amount: 3000 } }), 'create');
    clientId = d.id; subId = d.subscription_id; assert.ok(clientId && subId);
  });
  await test('تعديل العميل', async () => {
    ok(await owner('PUT', `/api/clients/${clientId}`, { business_type: 'عطور', phone: '0511111111' }), 'edit');
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'get');
    assert.equal(d.client.phone, '0511111111'); assert.equal(d.client.business_type, 'عطور');
  });
  await test('رفض الروابط الخطرة (javascript:)', async () => { assert.equal((await owner('PUT', `/api/clients/${clientId}`, { store_url: 'javascript:alert(1)' })).status, 400); });
  await test('البحث يجد العميل', async () => { const d = ok(await owner('GET', '/api/search?q=' + encodeURIComponent('اختبار')), 's'); assert.ok(d.results.some((r) => r.id === clientId)); });

  console.log('\nالمدفوعات والمتبقي');
  await test('تسجيل دفعة جزئية وحساب المتبقي', async () => {
    ok(await owner('POST', `/api/clients/${clientId}/payments`, { amount: 1000, method: 'transfer' }), 'pay');
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'get');
    assert.equal(d.client.sub.paid, 1000); assert.equal(d.client.sub.remaining, 2000); assert.ok(d.client.flags.includes('partial'));
  });
  await test('دفعات متعددة حتى السداد الكامل', async () => {
    ok(await owner('POST', `/api/clients/${clientId}/payments`, { amount: 2000, method: 'cash' }), 'pay2');
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'get');
    assert.equal(d.client.sub.remaining, 0); assert.equal(d.client.sub.pay_status, 'paid'); assert.equal(d.payments.length, 2);
  });

  console.log('\nالتجميد وفك التجميد');
  let endBefore;
  await test('تجميد الاشتراك', async () => {
    const before = ok(await owner('GET', `/api/clients/${clientId}`), 'get'); endBefore = before.client.sub.end_date;
    const start = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
    ok(await owner('POST', `/api/clients/${clientId}/freeze`, { start_date: start, reason: 'سفر' }), 'freeze');
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'get');
    assert.equal(d.client.status, 'frozen'); assert.equal(d.freezes.length, 1);
  });
  await test('لا يمكن التجميد مرتين', async () => { assert.equal((await owner('POST', `/api/clients/${clientId}/freeze`, {})).status, 400); });
  await test('فك التجميد يمدد نهاية الاشتراك بمدة التجميد', async () => {
    const r = ok(await owner('POST', `/api/clients/${clientId}/unfreeze`, { end_date: today }), 'unfreeze');
    assert.equal(r.days, 10);
    const exp = new Date(Date.parse(endBefore) + 10 * 864e5).toISOString().slice(0, 10);
    assert.equal(r.end_after, exp);
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'get');
    assert.equal(d.client.status, 'active'); assert.equal(d.client.sub.end_date, exp); assert.equal(d.freezes[0].actual_days, 10);
  });
  await test('تجميد متكرر يُحفظ في السجل', async () => {
    ok(await owner('POST', `/api/clients/${clientId}/freeze`, { start_date: today }), 'f2');
    ok(await owner('POST', `/api/clients/${clientId}/unfreeze`, { end_date: today }), 'u2');
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'get'); assert.equal(d.freezes.length, 2);
  });
  await test('تجديد الاشتراك يحفظ الاشتراك السابق', async () => {
    ok(await owner('POST', `/api/clients/${clientId}/subscriptions`, { duration_months: 3, amount: 8000 }), 'renew');
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'get');
    assert.equal(d.subscriptions.length, 2); assert.equal(d.client.sub.amount, 8000); assert.equal(d.client.sub.paid, 0);
  });

  console.log('\nالحملات والمؤشرات');
  await test('إضافة حملة وحساب المؤشرات', async () => {
    campId = ok(await owner('POST', '/api/campaigns', { client_id: clientId, name: 'حملة تحويلات', platform: 'TikTok', spend: 1500, impressions: 250000, clicks: 3200, orders: 45, sales: 18000 }), 'camp').id;
    const { computeMetrics } = await import('../public/js/shared.js');
    const m = computeMetrics({ spend: 1500, impressions: 250000, clicks: 3200, orders: 45, sales: 18000 });
    assert.equal(m.roas, 12); assert.equal(m.cpa.toFixed(2), '33.33'); assert.equal(m.ctr.toFixed(2), '1.28'); assert.equal(m.cpc.toFixed(2), '0.47'); assert.equal(m.cpm, 6); assert.equal(m.aov.toFixed(2), '400.00');
    assert.equal(computeMetrics({ spend: 100 }).roas, null, 'ROAS hidden without sales');
    assert.equal(computeMetrics({ spend: 100, clicks: 0 }).cpc, null, 'no divide by zero');
  });
  await test('تسجيل أداء يومي يحدث إجماليات الحملة', async () => {
    ok(await owner('POST', `/api/campaigns/${campId}/snapshots`, { date: today, spend: 100, sales: 500 }), 'snap');
    const d = ok(await owner('GET', `/api/campaigns/${campId}`), 'g'); assert.equal(d.campaign.spend, 1600); assert.equal(d.campaign.sales, 18500); assert.equal(d.snapshots.length, 1);
  });
  await test('تعديل الحملة يُسجل التغييرات', async () => {
    ok(await owner('PUT', `/api/campaigns/${campId}`, { status: 'optimize' }), 'u');
    const d = ok(await owner('GET', `/api/campaigns/${campId}`), 'g'); assert.ok(d.history.some((h) => h.action === 'تعديل حملة'));
  });

  console.log('\nالتقارير');
  await test('إنشاء تقرير سريع ومقارنة بتقرير سابق', async () => {
    ok(await owner('POST', '/api/reports', { client_id: clientId, platform: 'TikTok', period_from: '2026-10-01', period_to: '2026-10-07', spend: 1000, sales: 5000 }), 'r1');
    const id = ok(await owner('POST', '/api/reports', { client_id: clientId, platform: 'TikTok', period_from: '2026-11-01', period_to: '2026-11-24', spend: 1500, impressions: 250000, clicks: 3200, orders: 45, sales: 18000, summary: 'جيد' }), 'r2').id;
    const d = ok(await owner('GET', `/api/reports/${id}`), 'g'); assert.equal(d.report.spend, 1500); assert.equal(d.previous.spend, 1000);
  });

  console.log('\nالمهام والمتابعة اليومية');
  await test('مهمة متكررة تنشئ التكرار التالي عند الإكمال', async () => {
    const id = ok(await owner('POST', '/api/tasks', { title: 'مراجعة أسبوعية', client_id: clientId, due_date: today, recurrence: 'weekly', priority: 'high' }), 't').id;
    const r = ok(await owner('PUT', `/api/tasks/${id}`, { status: 'done' }), 'done');
    const exp = new Date(Date.parse(today) + 7 * 864e5).toISOString().slice(0, 10);
    assert.equal(r.next_due, exp);
  });
  await test('المتابعة اليومية: العميل في قائمة اليوم ثم يختفي بعد المراجعة', async () => {
    let q = ok(await owner('GET', '/api/followups/queue'), 'q'); assert.ok(q.items.find((i) => i.id === clientId).due);
    ok(await owner('POST', '/api/followups', { client_id: clientId, rating: 'good', checklist: [{ label: 'هل الحملة تعمل؟', value: 'yes' }], notes: 'تمام', tasks: [{ title: 'رفع الميزانية' }] }), 'fu');
    q = ok(await owner('GET', '/api/followups/queue'), 'q'); assert.equal(q.items.find((i) => i.id === clientId).due, false);
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'g'); assert.ok(d.tasks.some((t) => t.title === 'رفع الميزانية'));
  });

  console.log('\nعروض الأسعار والضريبة');
  await test('حساب الخصم والضريبة', async () => {
    const d = ok(await owner('POST', '/api/quotes', { client_name: 'عميل محتمل', items: [{ name: 'إدارة TikTok', qty: 2, price: 1000 }, { name: 'محتوى', qty: 1, price: 500 }], discount: 10, discount_type: 'percent', tax_enabled: true, tax_rate: 15 }), 'q');
    quoteId = d.id;
    const q = ok(await owner('GET', `/api/quotes/${quoteId}`), 'g').quote;
    assert.equal(q.subtotal, 2500); assert.equal(q.discount_value, 250); assert.equal(q.tax_value, 337.5); assert.equal(q.total, 2587.5);
  });
  await test('إلغاء الضريبة لعرض معين', async () => {
    ok(await owner('PUT', `/api/quotes/${quoteId}`, { tax_enabled: false }), 'u');
    assert.equal(ok(await owner('GET', `/api/quotes/${quoteId}`), 'g').quote.total, 2250);
  });
  await test('تحويل عرض مقبول إلى عميل واشتراك', async () => {
    const r = ok(await owner('POST', `/api/quotes/${quoteId}/convert`, { duration_months: 1 }), 'conv');
    const d = ok(await owner('GET', `/api/clients/${r.client_id}`), 'g');
    assert.equal(d.client.name, 'عميل محتمل'); assert.equal(d.client.sub.amount, 2250);
    assert.equal(ok(await owner('GET', `/api/quotes/${quoteId}`), 'g').quote.status, 'accepted');
  });

  console.log('\nالخزنة');
  await test('الخزنة مقفلة افتراضيًا', async () => { const d = ok(await owner('GET', '/api/vault'), 'v'); assert.equal(d.locked, true); assert.equal((await owner('POST', '/api/vault', { platform: 'TikTok' })).status, 423); });
  await test('فتح الخزنة يتطلب كلمة المرور', async () => {
    assert.equal((await owner('POST', '/api/auth/vault/unlock', { password: 'nope' })).status, 401);
    ok(await owner('POST', '/api/auth/vault/unlock', { password: 'very-strong-pass' }), 'unlock');
  });
  await test('حفظ كلمة مرور مشفرة وعدم ظهورها في القائمة أو السجل', async () => {
    vaultId = ok(await owner('POST', '/api/vault', { client_id: clientId, platform: 'TikTok Ads Manager', username: 'shop', password: 'S3cret!Pass' }), 'add').id;
    const list = ok(await owner('GET', '/api/vault'), 'list');
    assert.ok(!JSON.stringify(list).includes('S3cret!Pass'));
    const r = ok(await owner('POST', `/api/vault/${vaultId}/reveal`, {}), 'reveal'); assert.equal(r.secret.password, 'S3cret!Pass');
    const log = ok(await owner('GET', '/api/activity'), 'log'); assert.ok(!JSON.stringify(log).includes('S3cret!Pass'));
    assert.ok(log.items.some((l) => l.action.includes('عرض بيانات دخول')));
    const raw = execSync(`npx wrangler d1 execute DB --local --persist-to ${STATE} --json --command "SELECT secret FROM vault_entries"`).toString();
    assert.ok(!raw.includes('S3cret') && raw.includes('v1:'), 'stored encrypted');
  });
  await test('إعادة قفل الخزنة', async () => { ok(await owner('POST', '/api/auth/vault/lock', {}), 'lock'); assert.equal((await owner('POST', `/api/vault/${vaultId}/reveal`, {})).status, 423); });

  console.log('\nالصلاحيات');
  await test('إضافة موظف متابعة بصلاحيات محدودة', async () => {
    staffId = ok(await owner('POST', '/api/users', { username: 'staff1', password: 'staff-password-1', display_name: 'موظف', role: 'followup' }), 'u').id;
    ok(await staff('POST', '/api/auth/login', { username: 'staff1', password: 'staff-password-1' }), 'login');
    assert.equal((await staff('GET', '/api/clients')).status, 200);
    assert.equal((await staff('GET', '/api/payments')).status, 403);
    assert.equal((await staff('POST', '/api/clients', { name: 'x' })).status, 403);
    assert.equal((await staff('DELETE', `/api/clients/${clientId}`)).status, 403);
    assert.equal((await staff('GET', '/api/vault')).status, 403);
    assert.equal((await staff('GET', '/api/users')).status, 403);
    const c = ok(await staff('GET', `/api/clients/${clientId}`), 'g'); assert.equal(c.client.sub.amount, null, 'money hidden'); assert.equal(c.payments, undefined);
  });
  await test('صلاحية مخصصة تُطبق فورًا', async () => {
    ok(await owner('PUT', `/api/users/${staffId}`, { role: 'custom', permissions: ['clients.view', 'payments.view'] }), 'u');
    assert.equal((await staff('GET', '/api/payments')).status, 200);
  });
  await test('تعطيل المستخدم يلغي جلساته', async () => {
    ok(await owner('PUT', `/api/users/${staffId}`, { role: 'custom', permissions: [], active: false }), 'u');
    assert.equal((await staff('GET', '/api/clients')).status, 401);
    assert.equal((await client()('POST', '/api/auth/login', { username: 'staff1', password: 'staff-password-1' })).status, 401);
  });
  await test('قفل الحساب بعد 5 محاولات خاطئة', async () => {
    const c = client();
    for (let i = 0; i < 5; i++) await c('POST', '/api/auth/login', { username: 'staff1', password: 'bad' });
    assert.equal((await c('POST', '/api/auth/login', { username: 'staff1', password: 'bad' })).status, 429);
  });

  console.log('\nالأرشيف والحذف');
  await test('أرشفة العميل تحتفظ بكل بياناته', async () => {
    ok(await owner('POST', `/api/clients/${clientId}/archive`, { reason: 'انتهى التعاقد' }), 'a');
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'g');
    assert.equal(d.client.status, 'former'); assert.ok(d.payments.length >= 2 && d.campaigns.length && d.reports.length && d.subscriptions.length);
    const list = ok(await owner('GET', '/api/clients?scope=archived'), 'l'); assert.ok(list.items.some((c) => c.id === clientId));
  });
  await test('إعادة تفعيل العميل', async () => { ok(await owner('POST', `/api/clients/${clientId}/reactivate`, {}), 'r'); assert.equal(ok(await owner('GET', `/api/clients/${clientId}`), 'g').client.status, 'active'); });

  console.log('\nالنسخ الاحتياطي');
  let plainBackup, encBackup;
  await test('نسخة عادية لا تحتوي كلمات مرور', async () => {
    plainBackup = ok(await owner('POST', '/api/backup/export', {}), 'b');
    assert.equal(plainBackup.format, 'mbcc-backup'); assert.equal(plainBackup.includes_vault, false);
    const s = JSON.stringify(plainBackup); assert.ok(!s.includes('S3cret') && !s.includes('password_hash') && !s.includes('vault_entries'));
  });
  await test('نسخة مشفرة تشمل الخزنة', async () => {
    assert.equal((await owner('POST', '/api/backup/export', { include_vault: true, passphrase: 'backup-pass-123' })).status, 423);
    ok(await owner('POST', '/api/auth/vault/unlock', { password: 'very-strong-pass' }), 'unlock');
    encBackup = ok(await owner('POST', '/api/backup/export', { include_vault: true, passphrase: 'backup-pass-123' }), 'b');
    assert.equal(encBackup.encrypted, true); assert.ok(!JSON.stringify(encBackup).includes('S3cret') && !JSON.stringify(encBackup).includes('متجر اختبار'));
  });
  await test('التحقق من سلامة الملف يرفض ملفًا معدلًا', async () => {
    const tampered = JSON.parse(JSON.stringify(plainBackup)); tampered.data.clients[0].name = 'تلاعب';
    assert.equal((await owner('POST', '/api/backup/restore', { file: tampered, mode: 'merge' })).status, 400);
    assert.equal((await owner('POST', '/api/backup/inspect', { file: encBackup, passphrase: 'wrong-pass-0000' })).status, 400);
  });
  await test('استعادة (استبدال) من النسخة المشفرة بعد حذف عميل', async () => {
    ok(await owner('DELETE', `/api/clients/${clientId}`), 'del');
    assert.equal((await owner('GET', `/api/clients/${clientId}`)).status, 404);
    ok(await owner('POST', '/api/backup/restore', { file: encBackup, passphrase: 'backup-pass-123', mode: 'replace' }), 'restore');
    const d = ok(await owner('GET', `/api/clients/${clientId}`), 'g'); assert.equal(d.client.name, 'متجر اختبار'); assert.ok(d.payments.length >= 2);
    const r = ok(await owner('POST', `/api/vault/${vaultId}/reveal`, {}), 'reveal'); assert.equal(r.secret.password, 'S3cret!Pass');
  });

  console.log('\nv1.1 — مدة التعامل والاشتراك المفتوح والدفع الشهري');
  const iso = (d) => d.toISOString().slice(0, 10);
  const addD = (s0, n) => iso(new Date(Date.parse(s0) + n * 864e5));
  let openId;
  await test('حساب مدة التعامل (15 يناير 2025)', async () => {
    const { tenure } = await import('../public/js/shared.js');
    const t = tenure('2025-01-15', '2026-11-24'); assert.equal(t.label, 'سنة و10 أشهر'); assert.equal(t.total_months, 22); assert.equal(t.days, 678);
    assert.equal(tenure('2024-11-24', '2026-11-24').label, 'سنتان'); assert.equal(tenure('2026-11-30', '2026-11-24'), null);
    openId = ok(await owner('POST', '/api/clients', { name: 'عميل مفتوح', phone: '0501234567', start_date: '2025-01-15', pay_alert_enabled: true, pay_alert_days: 5,
      subscription: { sub_type: 'open', monthly_amount: 1000, pay_day: Number(addD(today, 3).slice(8)), first_due_date: addD(today, 3) } }), 'open').id;
    const d = ok(await owner('GET', `/api/clients/${openId}`), 'g');
    assert.equal(d.client.tenure.total_months >= 22, true); assert.ok(d.client.tenure.label);
  });
  await test('الاشتراك المفتوح لا ينتهي ولا يُعتبر منتهيًا', async () => {
    const d = ok(await owner('GET', `/api/clients/${openId}`), 'g');
    assert.equal(d.client.sub.open, true); assert.equal(d.client.sub.end_date, null); assert.equal(d.client.sub.days_left, null);
    assert.ok(!d.client.flags.includes('expired') && !d.client.flags.includes('expiring'));
  });
  await test('موعد الدفعة القادمة وحالة «قريب الاستحقاق» والتنبيه المخصص', async () => {
    const d = ok(await owner('GET', `/api/clients/${openId}`), 'g');
    assert.equal(d.client.sub.next_due, addD(today, 3)); assert.equal(d.client.sub.pay_status, 'soon'); assert.equal(d.client.sub.pay_alert, true); assert.equal(d.client.sub.amount_due, 1000);
    const dash = ok(await owner('GET', '/api/dashboard'), 'd'); assert.ok(dash.alerts.some((a) => a.type === 'pay_alert' && a.client_id === openId));
  });
  await test('تسجيل دفعة يحدّث الموعد القادم تلقائيًا (+شهر) والدفع الجزئي', async () => {
    ok(await owner('POST', `/api/clients/${openId}/payments`, { amount: 400 }), 'p1');
    let d = ok(await owner('GET', `/api/clients/${openId}`), 'g'); assert.equal(d.client.sub.partial, true); assert.equal(d.client.sub.amount_due, 600); assert.equal(d.client.sub.next_due, addD(today, 3));
    ok(await owner('POST', `/api/clients/${openId}/payments`, { amount: 600 }), 'p2');
    d = ok(await owner('GET', `/api/clients/${openId}`), 'g');
    const { nthDue } = await import('../public/js/shared.js');
    assert.equal(d.client.sub.next_due, nthDue(addD(today, 3), Number(addD(today, 3).slice(8)), 1)); assert.equal(d.client.sub.pay_status, 'paid'); assert.equal(d.client.sub.pay_alert, false);
  });
  await test('حالة «متأخر» عند تجاوز موعد الدفع', async () => {
    const id = ok(await owner('POST', '/api/clients', { name: 'متأخر شهري', subscription: { sub_type: 'open', monthly_amount: 500, start_date: addD(today, -70), first_due_date: addD(today, -40) } }), 'c').id;
    const d = ok(await owner('GET', `/api/clients/${id}`), 'g'); assert.equal(d.client.sub.pay_status, 'late'); assert.equal(d.client.sub.remaining, 1000); assert.equal(d.client.sub.billing.periods_due, 2);
  });
  await test('اشتراك محدد المدة بدفع شهري', async () => {
    const { computeBilling } = await import('../public/js/shared.js');
    const b = computeBilling({ sub_type: 'fixed', start_date: '2026-01-01', end_date: '2026-03-31', monthly_amount: 1000, amount: 3000, pay_day: 1 }, 3000, '2026-02-15');
    assert.equal(b.next_due, null); assert.equal(b.status, 'paid');
    const b2 = computeBilling({ sub_type: 'fixed', start_date: '2026-01-01', end_date: '2026-03-31', monthly_amount: 1000, amount: 3000, pay_day: 1 }, 1000, '2026-02-15', { grace: 5 });
    assert.equal(b2.next_due, '2026-02-01'); assert.equal(b2.status, 'late');
  });
  await test('صفحة الدفعات القادمة مرتبة حسب التاريخ', async () => {
    const r = ok(await owner('GET', '/api/payments/upcoming'), 'u');
    const dates = r.items.filter((x) => x.next_due).map((x) => x.next_due); assert.deepEqual(dates, [...dates].sort());
    const row = r.items.find((x) => x.client_id === openId); assert.ok(row && row.phone === '0501234567' && row.monthly === 1000);
  });
  await test('فك التجميد يزيح مواعيد الدفع الشهرية بمدة التجميد', async () => {
    const before = ok(await owner('GET', `/api/clients/${openId}`), 'g').client.sub.next_due;
    ok(await owner('POST', `/api/clients/${openId}/freeze`, { start_date: addD(today, -6) }), 'f');
    ok(await owner('POST', `/api/clients/${openId}/unfreeze`, { end_date: today }), 'u');
    const after = ok(await owner('GET', `/api/clients/${openId}`), 'g').client.sub.next_due;
    assert.equal(after, addD(before, 6));
  });
  await test('تعطيل التنبيه وتعديل موعد الدفع لكل عميل', async () => {
    ok(await owner('PUT', `/api/clients/${openId}`, { pay_alert_enabled: false }), 'p');
    const d = ok(await owner('GET', `/api/clients/${openId}`), 'g'); assert.equal(d.client.pay_alert_enabled, false);
    ok(await owner('PUT', `/api/subscriptions/${d.client.sub.id}`, { pay_day: 10 }), 's');
    const d2 = ok(await owner('GET', `/api/clients/${openId}`), 'g'); assert.equal(d2.client.sub.pay_day, 10); assert.equal(d2.client.sub.next_due.slice(8), '10');
  });

  console.log('\nv1.1 — Checklist المتابعة السريعة');
  await test('حفظ علامات الصح وحالة الإنجاز', async () => {
    const r = ok(await owner('GET', '/api/checklist'), 'c'); assert.ok(r.items.length >= 5); assert.ok(r.clients.some((c) => c.id === openId));
    const core = r.items.filter((i) => i.core).map((i) => i.id);
    let x = ok(await owner('PUT', `/api/checklist/${today}/${openId}`, { items: { [core[0]]: true } }), 'p'); assert.equal(x.check_status, 'progress');
    x = ok(await owner('PUT', `/api/checklist/${today}/${openId}`, { items: Object.fromEntries(core.map((k) => [k, true])) }), 'p'); assert.equal(x.check_status, 'done');
    const r2 = ok(await owner('GET', '/api/checklist'), 'c'); assert.equal(r2.clients.find((c) => c.id === openId).check_status, 'done');
    x = ok(await owner('PUT', `/api/checklist/${today}/${openId}`, { items: {}, needs_attention: true }), 'p'); assert.equal(x.check_status, 'attention');
  });
  await test('سجل الأيام السابقة محفوظ ويوم جديد يبدأ فارغًا', async () => {
    const y = addD(today, -1);
    ok(await owner('PUT', `/api/checklist/${y}/${openId}`, { items: { acct: true } }), 'y');
    const past = ok(await owner('GET', `/api/checklist?date=${y}`), 'past'); assert.equal(past.clients.find((c) => c.id === openId).entry.items.acct, true);
    const h = ok(await owner('GET', '/api/checklist/history'), 'h'); assert.ok(h.days.some((d) => d.date === y) && h.days.some((d) => d.date === today));
    assert.equal((await owner('PUT', `/api/checklist/${addD(today, 1)}/${openId}`, { items: {} })).status, 400);
  });

  console.log('\nv1.1 — عملاء التجارب');
  let trialId;
  await test('إضافة تجربة وحساب تاريخ النهاية والميزانية', async () => {
    trialId = ok(await owner('POST', '/api/trials', { name: 'تجربة متجر', phone: '0555555555', start_date: today, days: 3, daily_budget: 100, platforms: ['TikTok'], alert_days: 1 }), 't').id;
    const t = ok(await owner('GET', `/api/trials/${trialId}`), 'g').trial; assert.equal(t.end_date, addD(today, 2)); assert.equal(t.total_budget, 300); assert.equal(t.state, 'active');
  });
  await test('حالات التجربة: تنتهي قريبًا / انتهت', async () => {
    const e = ok(await owner('POST', '/api/trials', { name: 'تنتهي', start_date: addD(today, -2), days: 3 }), 't').id;
    assert.equal(ok(await owner('GET', `/api/trials/${e}`), 'g').trial.state, 'ending');
    const f = ok(await owner('POST', '/api/trials', { name: 'منتهية', start_date: addD(today, -10), days: 3 }), 't').id;
    assert.equal(ok(await owner('GET', `/api/trials/${f}`), 'g').trial.state, 'ended');
    const dash = ok(await owner('GET', '/api/dashboard'), 'd'); assert.ok(dash.stats.trials_ending >= 1 && dash.stats.trials_ended >= 1);
  });
  await test('تحويل التجربة إلى عميل رسمي مع الاحتفاظ بتاريخها', async () => {
    const r = ok(await owner('POST', `/api/trials/${trialId}/convert`, { work_start_date: today, subscription: { sub_type: 'open', monthly_amount: 2000, pay_day: 1 } }), 'conv');
    const d = ok(await owner('GET', `/api/clients/${r.client_id}`), 'g');
    assert.equal(d.client.name, 'تجربة متجر'); assert.equal(d.client.sub.open, true); assert.equal(d.client.sub.monthly_amount, 2000);
    assert.equal(d.trial.id, trialId); assert.equal(d.trial.total_budget, 300); assert.ok(d.activity.some((a) => a.action === 'بدأ كعميل تجربة'));
    assert.equal(ok(await owner('GET', `/api/trials/${trialId}`), 'g').trial.state, 'converted');
  });
  await test('لا يتم إنشاء عميل مكرر عند تكرار التحويل', async () => {
    const before = ok(await owner('GET', '/api/clients'), 'l').items.filter((c) => c.name === 'تجربة متجر').length;
    const results = await Promise.all([1, 2, 3].map(() => owner('POST', `/api/trials/${trialId}/convert`, {})));
    assert.ok(results.every((x) => x.status === 409));
    const after = ok(await owner('GET', '/api/clients'), 'l').items.filter((c) => c.name === 'تجربة متجر').length; assert.equal(before, 1); assert.equal(after, 1);
  });

  console.log('\nv1.1 — إشعارات الجوال');
  await test('تشفير الإشعار (RFC 8291) يُفك بشكل صحيح من جهة الجوال', async () => {
    const nodeCrypto = await import('node:crypto');
    const ua = nodeCrypto.createECDH('prime256v1'); ua.generateKeys();
    const authSecret = nodeCrypto.randomBytes(16);
    const sub = { p256dh: ua.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') };
    const { encryptPayload } = await import('../worker/lib/push.js');
    const body = Buffer.from(await encryptPayload(sub, JSON.stringify({ title: 'اختبار', body: 'مرحبا' })));
    const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
    const shared = ua.computeSecret(asPub);
    const hk = (s0, ikm, info, len) => Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, s0, info, len));
    const ikm = hk(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32);
    const cek = hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
    const dec = nodeCrypto.createDecipheriv('aes-128-gcm', cek, nonce); dec.setAuthTag(ct.subarray(ct.length - 16));
    const pt = Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()]);
    assert.equal(pt[pt.length - 1], 2); assert.equal(JSON.parse(pt.subarray(0, -1).toString()).title, 'اختبار');
  });
  await test('مفتاح VAPID وتسجيل جهاز وملخص التنبيهات', async () => {
    const k = ok(await owner('GET', '/api/push/key'), 'k'); assert.equal(Buffer.from(k.publicKey, 'base64url').length, 65);
    assert.equal(ok(await owner('GET', '/api/push/key'), 'k2').publicKey, k.publicKey, 'stable key');
    const ua = (await import('node:crypto')).createECDH('prime256v1'); ua.generateKeys();
    ok(await owner('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example.invalid/x', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } } }), 's');
    assert.equal(ok(await owner('GET', '/api/push/status'), 'st').devices, 1);
    const p = ok(await owner('GET', '/api/push/preview'), 'pv'); assert.ok(p.lines.some((l) => l.includes('تجربة')));
    ok(await owner('POST', '/api/push/unsubscribe', { endpoint: 'https://push.example.invalid/x' }), 'u');
  });
  await test('النسخة الاحتياطية تشمل التجارب والـChecklist ولا تشمل مفاتيح الخادم', async () => {
    const b = ok(await owner('POST', '/api/backup/export', {}), 'b');
    assert.ok(b.data.trials.length >= 3 && b.data.checklist_entries.length >= 2); assert.ok(!JSON.stringify(b).includes('privateJwk'));
    const st = ok(await owner('GET', '/api/settings'), 's'); assert.ok(!JSON.stringify(st).includes('privateJwk'));
  });

  console.log('\nلوحة التحكم والتقويم والبيانات التجريبية');
  await test('لوحة التحكم والرسوم', async () => {
    const d = ok(await owner('GET', '/api/dashboard'), 'd'); assert.ok(d.stats.clients_total >= 1);
    for (const r of ['today', 'week', 'month', '3m', '6m', 'year']) { const c = ok(await owner('GET', '/api/dashboard/charts?range=' + r), r); assert.equal(c.labels.length, c.collected.length); }
    const c = ok(await owner('GET', '/api/dashboard/charts?range=custom&from=2026-01-01&to=2026-03-31'), 'custom'); assert.equal(c.labels.length, 3);
  });
  await test('التقويم', async () => { const d = ok(await owner('GET', `/api/calendar?from=${today.slice(0, 8)}01&to=${today}`), 'cal'); assert.ok(Array.isArray(d.events)); });
  await test('إضافة وحذف البيانات التجريبية', async () => {
    ok(await owner('POST', '/api/demo/seed', {}), 'seed');
    assert.ok(ok(await owner('GET', '/api/demo/status'), 's').demo_clients === 8);
    ok(await owner('GET', '/api/dashboard'), 'dash with demo');
    ok(await owner('POST', '/api/demo/clear', {}), 'clear');
    assert.equal(ok(await owner('GET', '/api/demo/status'), 's').demo_clients, 0);
    assert.equal((await owner('GET', `/api/clients/${clientId}`)).status, 200, 'real data untouched');
  });
  await test('تصدير CSV', async () => { const r = await owner('GET', '/api/export/clients', undefined, true); assert.equal(r.status, 200); assert.ok((await r.text()).includes('متجر اختبار')); });
  await test('ترويسات الأمان', async () => { const r = await fetch(BASE + '/'); assert.ok(r.headers.get('content-security-policy')); assert.equal(r.headers.get('x-frame-options'), 'DENY'); });
}

main().catch((e) => { console.error(e); failed++; }).finally(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed && process.env.SHOW_LOG) console.log(devLog.slice(-4000));
  try { process.kill(-dev.pid, 'SIGTERM'); } catch { dev.kill('SIGTERM'); }
  process.exit(failed ? 1 : 0);
});
