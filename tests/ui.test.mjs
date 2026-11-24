// UI smoke test: boots a throwaway Worker, creates the owner through the real setup screen,
// loads demo data, visits every page at phone size and fails on any JS error.
// Run: npm run test:ui   (screenshots are written to ./screenshots, which is git-ignored)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const PORT = 8798, BASE = `http://localhost:${PORT}`, STATE = '.wrangler/ui-state', OUT = 'screenshots';
const SETUP = 'ui-setup-token-123456';
fs.rmSync(STATE, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${STATE}`, { stdio: 'ignore' });
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', STATE, '--var', `SETUP_TOKEN:${SETUP}`, '--var', `VAULT_KEY:${Buffer.alloc(32, 3).toString('base64')}`], { stdio: 'ignore', detached: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/auth/status')).ok) break; } catch {} await wait(500); }

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'ar-SA', timezoneId: 'Asia/Riyadh' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`[pageerror] ${page.url()} ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${page.url()} ${m.text()}`); });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: process.env.FULL === '1' });

try {
  await page.goto(BASE + '/'); await page.waitForSelector('#setup', { timeout: 15000 }); await wait(500); await shot('00-setup');
  await page.fill('[name=setup_token]', SETUP); await page.fill('[name=display_name]', 'إياد'); await page.fill('[name=username]', 'owner');
  await page.fill('[name=password]', 'owner-password-1'); await page.fill('[name=password2]', 'owner-password-1');
  await page.click('#setup button'); await page.waitForSelector('.tiles', { timeout: 15000 });
  await page.evaluate(() => fetch('/api/demo/seed', { method: 'POST', headers: { 'x-requested-with': 'mbcc', 'content-type': 'application/json' }, body: '{}' }));
  // logout -> login screen
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'mbcc' } }));
  await page.goto(BASE + '/'); await page.waitForSelector('#login'); await wait(1500); await shot('01-login');
  await page.fill('[name=username]', 'owner'); await page.fill('[name=password]', 'owner-password-1'); await page.click('#login [type=submit]');
  await page.waitForSelector('.tiles'); await wait(1200); await shot('02-dashboard');
  const routes = ['clients', 'clients/demo_c1', 'clients/demo_c1?tab=subscription', 'followup', 'followup?start=1', 'tasks', 'subscriptions', 'payments', 'campaigns', 'campaigns/demo_k1_0', 'reports', 'reports/new?client=demo_c1', 'quotes', 'quotes/new', 'calendar', 'archive', 'activity', 'vault', 'backup', 'settings', 'users', 'search?q=متجر', 'categories', 'payments/upcoming', 'checklist', 'trials', 'trials/demo_tr2'];
  let i = 3;
  for (const r of routes) {
    await page.goto(`${BASE}/#/${r}`); await wait(900);
    const err = await page.$('.empty svg'); const txt = await page.textContent('#main');
    if (/حدث خطأ|Error/.test(txt || '') && err) errors.push(`[render] ${r}: ${txt.slice(0, 120)}`);
    await shot(String(i++).padStart(2, '0') + '-' + r.replace(/[/?=&]/g, '_').slice(0, 40));
  }
  // drawer
  await page.goto(`${BASE}/#/`); await wait(600); await page.click('.bottomnav [data-drawer]'); await wait(500); await shot('90-drawer');
  await page.click('.drawer-backdrop', { position: { x: 20, y: 300 } }).catch(() => {});
  // open a report
  const rid = await page.evaluate(async () => (await (await fetch('/api/reports')).json()).items[0].id);
  await page.goto(`${BASE}/#/reports/${rid}?saved=1`); await wait(900); await shot('91-report');
  const qid = await page.evaluate(async () => (await (await fetch('/api/quotes')).json()).items[0].id);
  await page.goto(`${BASE}/#/quotes/${qid}`); await wait(900); await shot('92-quote');
  // quick report wizard end to end
  await page.goto(`${BASE}/#/reports/new?client=demo_c2`); await wait(800);
  await page.fill('[name=spend]', '1500'); await page.fill('[name=impressions]', '250000'); await page.fill('[name=clicks]', '3200'); await page.fill('[name=orders]', '45'); await page.fill('[name=sales]', '18000');
  await wait(200); await shot('93-report-step1');
  const roas = await page.textContent('[data-metrics] .m-green .m-v'); if (!roas.includes('12.00x')) errors.push('[report] ROAS live calc wrong: ' + roas);
  await page.click('[data-next]'); await page.click('[data-auto-summary]'); await page.click('[data-next]'); await wait(300); await shot('94-report-step3');
  await page.click('[data-save]'); await page.waitForSelector('.success-banner', { timeout: 10000 });
  // PDF generation
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-pdf]')]);
  const pdfPath = `${OUT}/report.pdf`; await dl.saveAs(pdfPath);
  const head = fs.readFileSync(pdfPath).subarray(0, 5).toString(); if (head !== '%PDF-') errors.push('[pdf] not a PDF');
  console.log('PDF size', fs.statSync(pdfPath).size);
  // v1.1: quick checklist ticks are saved
  await page.goto(`${BASE}/#/checklist`); await wait(900);
  const card = page.locator('[data-cid]').first();
  const cid = await card.getAttribute('data-cid');
  const boxes = card.locator('.ck');
  const nBoxes = await boxes.count();
  for (let k = 0; k < nBoxes; k++) { await boxes.nth(k).click(); await wait(150); }
  await wait(600); await shot('96-checklist-ticked');
  const st = await page.evaluate(async (id) => (await (await fetch('/api/checklist')).json()).clients.find((c) => c.id === id).check_status, cid);
  if (st !== 'done') errors.push('[checklist] expected done, got ' + st);
  // v1.1: convert a trial from the UI
  await page.goto(`${BASE}/#/trials/demo_tr2`); await wait(900);
  await page.click('[data-convert]'); await wait(400);
  await page.fill('.sheet [name=monthly_amount]', '2500'); await page.fill('.sheet [name=pay_day]', '5'); await shot('97-convert-form');
  await page.click('.sheet [data-submit]'); await page.waitForURL(/#\/clients\//, { timeout: 10000 }); await wait(900); await shot('98-converted-client');
  const txt = await page.textContent('#main'); if (!txt.includes('مدة التعامل') && !txt.includes('معك منذ')) errors.push('[trial] tenure not shown on converted client');
  // v1.1: record a payment from upcoming payments
  await page.goto(`${BASE}/#/payments/upcoming?f=all`); await wait(900);
  const payBtn = page.locator('[data-pay]').first();
  if (await payBtn.count()) { await payBtn.click(); await wait(400); await page.click('.sheet [data-submit]'); await wait(900); }
  else errors.push('[upcoming] no pay button');
  await shot('99-upcoming-after-pay');
  // v1.3: quick check from clients list — must not navigate, must persist
  await page.goto(`${BASE}/#/clients`); await wait(900);
  const qcBtn = page.locator('[data-qc]').first(); const qcId = await qcBtn.getAttribute('data-qc');
  await qcBtn.click(); await wait(700);
  if (!page.url().endsWith('#/clients')) errors.push('[quickcheck] tapping the box navigated to ' + page.url());
  if (!(await qcBtn.getAttribute('class')).includes('on')) errors.push('[quickcheck] box not shown as checked');
  const saved = await page.evaluate(async (id) => (await (await fetch('/api/clients')).json()).items.find((c) => c.id === id).checked_today, qcId);
  if (!saved) errors.push('[quickcheck] not saved in DB');
  await shot('100-clients-quickcheck');
  await page.click('[data-qcf="todo"]'); await wait(400); await shot('101-clients-qc-todo');
  if (await page.locator(`[data-qc="${qcId}"]`).count()) errors.push('[quickcheck] checked client still shown in «لم يتم تشييكهم»');
  // desktop layout
  const desk = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'ar-SA' });
  const dp = await desk.newPage(); dp.on('pageerror', (e) => errors.push(`[desktop] ${e.message}`));
  await dp.goto(BASE + '/'); await dp.fill('[name=username]', 'owner'); await dp.fill('[name=password]', 'owner-password-1'); await dp.click('#login [type=submit]');
  await dp.waitForSelector('.tiles'); await wait(1500); await dp.screenshot({ path: `${OUT}/95-desktop.png` });
  // RTL / overflow check on phone
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) errors.push('[layout] horizontal overflow on phone');
  const dir = await page.evaluate(() => document.documentElement.dir); if (dir !== 'rtl') errors.push('[rtl] dir is ' + dir);
} catch (e) { errors.push('[fatal] ' + e.stack); }
await browser.close(); try { process.kill(-dev.pid, 'SIGTERM'); } catch { dev.kill('SIGTERM'); }
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'UI OK — no errors');
process.exit(errors.length ? 1 : 0);
