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
  const routes = ['clients', 'clients/demo_c1', 'clients/demo_c1?tab=subscription', 'followup', 'followup?start=1', 'tasks', 'subscriptions', 'payments', 'campaigns', 'campaigns/demo_k1_0', 'reports', 'reports/new?client=demo_c1', 'quotes', 'quotes/new', 'calendar', 'archive', 'activity', 'vault', 'backup', 'settings', 'users', 'search?q=متجر', 'categories'];
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
