// Browser test (Playwright/Chromium): real UI flows on mobile + desktop against a local Worker + D1.
// Run: npm run test:ui   (screenshots are written to ./screenshots)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 8797, BASE = `http://localhost:${PORT}`;
const STATE = '.wrangler/ui-state';
const SETUP_TOKEN = 'ui-setup-token-123456';
const SHOTS = 'screenshots';
const SALON = { latitude: 24.7136, longitude: 46.6753 };
const INVOICE_IMG = process.env.INVOICE_IMG || path.resolve('tests/fixtures/invoice.jpg');

fs.rmSync(STATE, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true });
execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${STATE}`, { stdio: 'ignore' });
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', STATE, '--var', `SETUP_TOKEN:${SETUP_TOKEN}`], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let devLog = ''; dev.stdout.on('data', (d) => (devLog += d)); dev.stderr.on('data', (d) => (devLog += d));

let cookie = '';
async function api(method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'mvs', cookie }, body: body && JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const d = await r.json(); if (!r.ok) throw new Error(`${p}: ${d.error}`); return d;
}
const hm = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(11, 16);

const errors = [];
let passed = 0, failed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n    ', e.message.split('\n')[0]); }
}
function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|401|403|404|422|409|423/.test(m.text())) errors.push(`[${label}] console: ${m.text()}`); });
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const toastText = async (page, re = /./) => {
  const t = page.locator('.toast', { hasText: re }).last();
  try { return (await t.textContent({ timeout: 20000 })).trim(); } catch { return (await page.locator('.toast').allTextContents()).join(' | ') || 'no toast'; }
};

async function main() {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/api/auth/status')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  // ---- seed through the API (admin, salon location, one barber with a shift around "now") ----
  await api('POST', '/api/auth/setup', { setup_token: SETUP_TOKEN, email: 'owner@salon.test', password: 'Owner12345', full_name: 'إياد المدير' });
  await api('POST', '/api/locations', { name: 'الفرع الرئيسي', lat: SALON.latitude, lng: SALON.longitude, radius_m: 100 });
  const { id: barberId } = await api('POST', '/api/employees', { email: 'khaled@salon.test', full_name: 'خالد الحلاق', password: 'Barber1234', role: 'barber', barber_rate: 50, shop_rate: 50, must_change_password: false, phone: '0551234567' });
  await api('POST', '/api/employees', { email: 'fahad@salon.test', full_name: 'فهد', password: 'Barber1234', role: 'barber', barber_rate: 40, shop_rate: 60, must_change_password: false });
  const now = Date.now();
  const start = hm(now - 20 * 60e3), end = hm(now + 5 * 3600e3);
  await api('POST', `/api/employees/${barberId}/schedules`, { effective_from: '2026-01-01', grace_minutes: 10, days: [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, start_time: start, end_time: end })) });

  const browser = await chromium.launch();
  // ================= Barber on a phone =================
  console.log('\nالحلاق (جوال)');
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, geolocation: { ...SALON, accuracy: 12 }, permissions: ['geolocation'], locale: 'ar-SA', timezoneId: 'Asia/Riyadh' });
  const b = await mob.newPage(); watch(b, 'barber');
  await step('شاشة تسجيل الدخول بالشعار الأصلي', async () => {
    await b.goto(BASE + '/'); await b.waitForSelector('#login'); await b.waitForTimeout(500); await shot(b, '01-login-mobile');
  });
  await step('تسجيل دخول الحلاق', async () => {
    await b.fill('[name=email]', 'khaled@salon.test'); await b.fill('[name=password]', 'Barber1234'); await b.click('#login button[type=submit]');
    await b.waitForSelector('.hero'); await shot(b, '02-barber-home');
  });
  await step('تسجيل حضور بالموقع GPS', async () => {
    await b.click('[data-in]'); const t = await toastText(b, /حضورك|خارج|تعذر/); if (!/تم تسجيل حضورك/.test(t)) throw new Error(t);
    await b.waitForTimeout(600); await shot(b, '03-barber-checked-in');
  });
  await step('تسجيل فاتورة بصورة (إلزامية)', async () => {
    await b.click('[data-inv]'); await b.waitForSelector('.sheet [name=amount]');
    await b.fill('.sheet [name=amount]', '150');
    await b.click('.sheet [data-submit]'); const t1 = await toastText(b, /إلزامية/); if (!/إلزامية/.test(t1)) throw new Error('expected image-required error, got: ' + t1);
    await b.setInputFiles('.sheet [data-gal]', INVOICE_IMG); await b.waitForSelector('.sheet .photo-drop.has img');
    await b.fill('.sheet [name=service_type]', 'قص + ذقن');
    await shot(b, '04-new-invoice');
    await b.click('.sheet [data-submit]'); const t = await toastText(b, /تم حفظ الفاتورة/); if (!/تم حفظ الفاتورة/.test(t)) throw new Error(t);
  });
  await step('صفحة فواتيري', async () => { await b.goto(BASE + '/#/me/invoices'); await b.waitForSelector('.list .row'); await shot(b, '05-my-invoices'); });
  await step('تفاصيل الفاتورة وطلب تعديل', async () => {
    await b.click('.list a.row'); await b.waitForSelector('.gallery img'); await shot(b, '06-invoice-detail');
    await b.click('#acts button'); await b.fill('.sheet [name=text]', 'المبلغ الصحيح 160'); await b.click('.sheet [data-submit]'); await toastText(b);
  });
  await step('مستحقاتي', async () => { await b.goto(BASE + '/#/me/dues'); await b.waitForSelector('.kpi'); await shot(b, '07-my-dues'); });
  await step('طلب إجازة', async () => {
    await b.goto(BASE + '/#/me/leaves'); await b.click('[data-new]'); await b.click('.sheet [data-submit]'); const t = await toastText(b, /إرسال|خطأ|يوجد/); if (!/تم إرسال/.test(t)) throw new Error(t);
    await b.waitForTimeout(400); await shot(b, '08-my-leaves');
  });
  await step('سجل حضوري', async () => { await b.goto(BASE + '/#/me/attendance'); await b.waitForSelector('.list .row'); await shot(b, '09-my-attendance'); });
  await step('قسم تثبيت التطبيق', async () => { await b.goto(BASE + '/#/install'); await b.waitForSelector('.steps'); await shot(b, '10-install'); });
  await step('الحلاق ممنوع من صفحات الإدارة', async () => {
    await b.goto(BASE + '/#/dashboard'); await b.waitForSelector('.empty'); const txt = await b.textContent('.empty'); if (!/صلاحية/.test(txt)) throw new Error(txt);
  });

  // ================= Admin on desktop =================
  console.log('\nالمدير (كمبيوتر)');
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'ar-SA', timezoneId: 'Asia/Riyadh', geolocation: { ...SALON, accuracy: 10 }, permissions: ['geolocation'], acceptDownloads: true });
  const a = await desk.newPage(); watch(a, 'admin');
  await step('دخول المدير ولوحة التحكم', async () => {
    await a.goto(BASE + '/'); await a.fill('[name=email]', 'owner@salon.test'); await a.fill('[name=password]', 'Owner12345'); await a.click('#login button[type=submit]');
    await a.waitForSelector('.kpi'); await a.waitForTimeout(500); await shot(a, '11-admin-dashboard');
    const sales = await a.textContent('.kpi.hl .val'); if (!/150/.test(sales)) throw new Error('today revenue: ' + sales);
  });
  await step('الموظفون وملف الموظف', async () => {
    await a.goto(BASE + '/#/employees'); await a.waitForSelector('.list .row'); await shot(a, '12-employees');
    await a.goto(BASE + `/#/employees/${barberId}?tab=schedule`); await a.waitForSelector('.card h3'); await shot(a, '13-employee-schedule');
    await a.goto(BASE + `/#/employees/${barberId}?tab=rates`); await a.waitForSelector('.list .row');
  });
  await step('إضافة موظف من الواجهة', async () => {
    await a.goto(BASE + '/#/employees'); await a.click('[data-new]'); await a.waitForSelector('.sheet [name=full_name]');
    await a.fill('.sheet [name=full_name]', 'سعد'); await a.fill('.sheet [name=email]', 'saad@salon.test'); await a.fill('.sheet [name=password]', 'Temp12345'); await a.fill('.sheet [name=barber_rate]', '60');
    await shot(a, '14-add-employee'); await a.click('.sheet [data-submit]'); await a.waitForURL(/#\/employees\/u_/);
  });
  await step('الحضور: اللوحة والسجل', async () => {
    await a.goto(BASE + '/#/attendance'); await a.waitForSelector('.list .row'); await shot(a, '15-attendance-board');
    await a.goto(BASE + '/#/attendance?tab=log'); await a.waitForSelector('.list .row'); await a.click('.list .row'); await a.waitForSelector('.sheet .map-frame'); await shot(a, '16-attendance-detail'); await a.keyboard.press('Escape');
  });
  await step('مراجعة الفواتير واعتمادها', async () => {
    await a.goto(BASE + '/#/invoices?pending=1'); await a.waitForSelector('.list a.row'); await shot(a, '17-invoices-review');
    await a.click('.list a.row'); await a.waitForSelector('#acts'); await shot(a, '18-invoice-review-detail');
    await a.click('#acts .btn.ok'); await a.click('.sheet [data-submit]'); await toastText(a);
  });
  await step('تسجيل دفعة مع إثبات تحويل', async () => {
    await a.goto(BASE + `/#/dues/${barberId}`); await a.waitForSelector('[data-pay]'); await a.click('[data-pay]');
    await a.waitForSelector('.sheet [data-rem] b');
    await a.fill('.sheet [name=amount]', '50'); await a.fill('.sheet [name=reference]', 'TRX-778');
    await a.setInputFiles('.sheet [data-proof]', INVOICE_IMG); await a.waitForTimeout(500);
    await a.click('.sheet [data-submit]'); const t = await toastText(a, /تم تسجيل الدفعة/); if (!/تم تسجيل الدفعة/.test(t)) throw new Error(t);
    await a.waitForTimeout(600); await shot(a, '19-dues-employee');
    await a.goto(BASE + '/#/dues'); await a.waitForSelector('.tbl'); await shot(a, '20-dues-overview');
  });
  await step('التقارير العامة', async () => { await a.goto(BASE + '/#/reports'); await a.waitForSelector('.kpi'); await shot(a, '21-reports'); });
  await step('تقرير PDF للموظف: إنشاء، حفظ وإرسال', async () => {
    await a.goto(BASE + `/#/emp-reports?user_id=${barberId}`); await a.waitForSelector('[data-gen]');
    await a.check('[name=imgs]'); await a.click('[data-gen]'); await a.waitForSelector('.rpt-preview .rpt'); await a.waitForTimeout(800);
    await shot(a, '22-report-preview');
    await a.click('[data-save-send]'); const t = await toastText(a, /تم حفظ التقرير وإرساله/); if (!/تم حفظ التقرير وإرساله/.test(t)) throw new Error(t);
    const dl = a.waitForEvent('download'); await a.click('[data-dl]'); const file = await dl; const p = await file.path();
    const head = fs.readFileSync(p).subarray(0, 5).toString(); if (head !== '%PDF-') throw new Error('not a pdf');
    fs.copyFileSync(p, `${SHOTS}/employee-report.pdf`);
  });
  await step('اعتماد طلب الإجازة', async () => {
    await a.goto(BASE + '/#/leaves'); await a.waitForSelector('[data-a]'); await a.click('[data-a]'); await a.click('.sheet [data-submit]'); await toastText(a); await shot(a, '23-leaves');
  });
  await step('إغلاق اليوم', async () => {
    await a.goto(BASE + '/#/closures'); await a.click('[data-day]'); await a.waitForSelector('.sheet [data-prev] .grid'); await shot(a, '24-close-day');
    await a.click('.sheet [data-submit]'); await toastText(a);
  });
  await step('سجل العمليات والإعدادات', async () => {
    await a.goto(BASE + '/#/audit'); await a.waitForSelector('.list .row'); await shot(a, '25-audit');
    await a.goto(BASE + '/#/settings'); await a.waitForSelector('#st'); await shot(a, '26-settings');
  });
  await step('الإشعارات للمدير', async () => { await a.goto(BASE + '/#/notifications'); await a.waitForSelector('.list .row'); await shot(a, '27-admin-notifications'); });

  // ================= Barber sees the report =================
  console.log('\nالحلاق يستلم التقرير');
  await step('تقاريري + إشعار التقرير', async () => {
    await b.goto(BASE + '/#/me/reports'); await b.waitForSelector('.list .row'); await shot(b, '28-my-reports');
    await b.click('.list .row a.main'); await b.waitForSelector('.rpt-preview .rpt'); await b.waitForTimeout(600); await shot(b, '29-report-view-mobile');
  });
  await step('تسجيل الانصراف', async () => {
    await b.goto(BASE + '/#/me'); await b.waitForSelector('[data-out]'); await b.click('[data-out]'); const t = await toastText(b, /انصراف|خارج|تعذر|لا يوجد/); if (!/انصرافك/.test(t)) throw new Error(t);
  });
  await step('تسجيل الخروج لا يترك بيانات المستخدم السابق', async () => {
    await b.goto(BASE + '/#/account'); await b.click('[data-out]'); await b.waitForSelector('#login');
    const body = await b.textContent('body'); if (/خالد الحلاق/.test(body)) throw new Error('previous user data still visible');
  });
  // admin on mobile for the visual check
  const am = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar-SA', timezoneId: 'Asia/Riyadh' });
  const ap = await am.newPage(); watch(ap, 'admin-mobile');
  await step('لوحة المدير على الجوال', async () => {
    await ap.goto(BASE + '/'); await ap.fill('[name=email]', 'owner@salon.test'); await ap.fill('[name=password]', 'Owner12345'); await ap.click('#login button[type=submit]');
    await ap.waitForSelector('.kpi'); await ap.waitForTimeout(400); await shot(ap, '30-admin-dashboard-mobile');
    await ap.click('.bottom-nav a[href="#more"]'); await ap.waitForSelector('.sheet'); await shot(ap, '31-admin-menu-mobile');
  });
  await browser.close();
}

main().catch((e) => { console.error(e); failed++; }).finally(() => {
  try { process.kill(-dev.pid); } catch {}
  if (errors.length) { console.log('\nأخطاء المتصفح:'); for (const e of errors) console.log('  ', e); }
  console.log(`\n${passed} ناجح، ${failed} فاشل، ${errors.length} خطأ متصفح`);
  if (failed) console.log(devLog.split('\n').filter((l) => /rror/.test(l)).slice(-10).join('\n'));
  process.exit(failed || errors.length ? 1 : 0);
});
