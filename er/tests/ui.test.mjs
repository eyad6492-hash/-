// Browser test on a phone viewport: two accounts, every screen, real forms, live sync between both, dark mode.
// Run: npm run test:ui   (screenshots → test-results/)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const PORT = 8797, BASE = `http://localhost:${PORT}`, STATE = '.wrangler/ui-state', OUT = 'test-results';
fs.rmSync(STATE, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${STATE}`, { stdio: 'ignore' });
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', STATE], { stdio: 'ignore', detached: true });

const errors = [];
let failed = 0;
const step = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n    ', e.message.split('\n')[0]); } };

async function main() {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/api/auth/status')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const browser = await chromium.launch();
  const mk = async (name) => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ar-SA', timezoneId: 'Asia/Riyadh' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|401|423/.test(m.text())) errors.push(`[${name}] console: ${m.text()}`); });
    return page;
  };
  const e = await mk('eyad'), r = await mk('rawan');
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
  const fill = async (p, k, v) => p.fill(`.sheet [data-k="${k}"]`, v);
  const save = async (p) => { await p.click('.sheet [data-save]'); await p.waitForSelector('.sheet', { state: 'detached' }); };

  await step('شاشة إنشاء المساحة وإنشاء حساب إياد', async () => {
    await e.goto(BASE + '/'); await e.waitForSelector('text=إنشاء المساحة'); await shot(e, '01-setup');
    await e.fill('[name=email]', 'eyad@example.com'); await e.fill('[name=password]', 'password-1');
    await e.click('button[type=submit]'); await e.waitForSelector('.code-box'); await shot(e, '02-recovery');
    await e.click('#go'); await e.waitForSelector('.greet');
  });
  let link;
  await step('رابط الدعوة من الإعدادات', async () => {
    await e.goto(BASE + '/#/settings'); await e.click('[data-act=invite]'); await e.waitForSelector('.sheet .code-box');
    link = (await e.textContent('.sheet .code-box')).trim(); await e.keyboard.press('Escape');
  });
  await step('روان تنضم من الرابط', async () => {
    await r.goto(link.replace(/^https?:\/\/[^/]+/, BASE)); await r.waitForSelector('text=يدعوك'); await shot(r, '03-join');
    await r.fill('[name=email]', 'rawan@example.com'); await r.fill('[name=password]', 'password-2');
    await r.click('button[type=submit]'); await r.waitForSelector('#go'); await r.click('#go'); await r.waitForSelector('.greet');
  });

  await step('إياد يضيف مناسبة (هجري) ومهمة لروان ومصروفًا من الزر السريع', async () => {
    await e.goto(BASE + '/#/'); await e.waitForSelector('.greet');
    await e.click('#fab'); await e.click('.sheet [data-k="date"]'); await e.waitForSelector('.sheet [data-k="title"]');
    await fill(e, 'title', 'عيد ميلاد روان'); await e.click('.sheet [data-seg="kind"][data-v="birthday"]');
    await e.click('.sheet [data-seg="cal"][data-v="h"]'); await e.selectOption('.sheet [data-h="m"]', '9'); await e.selectOption('.sheet [data-h="d"]', '15'); await e.selectOption('.sheet [data-h="y"]', '1420');
    await shot(e, '04-date-form'); await save(e);
    await e.click('#fab'); await e.click('.sheet [data-k="task"]'); await e.waitForSelector('.sheet [data-k="title"]');
    await fill(e, 'title', 'حجز طاولة للعشاء'); const rid = await e.getAttribute('.sheet [data-seg="assignee"]:nth-child(2)', 'data-v'); await e.click(`.sheet [data-seg="assignee"][data-v="${rid}"]`);
    await e.fill('.sheet [data-k="due_date"]', new Date(Date.now() + 86400000).toISOString().slice(0, 10)); await save(e);
    await e.click('#fab'); await e.click('.sheet [data-k="expense"]'); await e.waitForSelector('.sheet [data-k="title"]');
    await fill(e, 'title', 'قهوة'); await fill(e, 'amount', '42'); await save(e);
  });
  await step('المزامنة المباشرة: روان ترى المهمة وإشعارًا خلال ثوانٍ', async () => {
    await r.goto(BASE + '/#/tasks'); await r.waitForSelector('text=حجز طاولة للعشاء', { timeout: 12000 }); await shot(r, '05-tasks-rawan');
    await r.goto(BASE + '/#/notifications'); await r.waitForSelector('text=كلّفتك بمهمة, text=كلّفك بمهمة', { timeout: 8000 }).catch(async () => { await r.waitForSelector('text=بمهمة', { timeout: 4000 }); });
  });
  await step('روان تنجز المهمة وإياد يراها منجزة', async () => {
    await r.goto(BASE + '/#/tasks'); await r.click('[data-toggle]'); await r.waitForTimeout(800);
    await e.goto(BASE + '/#/tasks'); await e.click('[data-f=done]'); await e.waitForSelector('.done-text', { timeout: 12000 });
  });
  await step('روان تسجل مزاجها وإياد يراه في الرئيسية', async () => {
    await r.goto(BASE + '/#/'); await r.click('[data-mood=me]'); await r.click('.sheet [data-seg="mood"][data-v="happy"]'); await fill(r, 'message', 'اليوم مزاجي ممتاز'); await save(r);
    await e.goto(BASE + '/#/'); await e.waitForSelector('text=اليوم مزاجي ممتاز', { timeout: 12000 }); await shot(e, '06-home-eyad');
  });
  await step('المقاضي: إضافة سريعة وشطب', async () => {
    await r.goto(BASE + '/#/shopping'); await r.fill('#qn', 'حليب × 2'); await r.press('#qn', 'Enter'); await r.waitForSelector('text=حليب');
    await r.fill('#qn', 'خبز'); await r.press('#qn', 'Enter'); await r.waitForSelector('text=خبز'); await r.click('[data-tick] >> nth=0'); await r.waitForTimeout(500); await shot(r, '07-shopping');
  });
  await step('الدورة: روان تفعّل القسم وتسجّل', async () => {
    await r.goto(BASE + '/#/cycle'); await r.click('[data-enable]'); await r.waitForSelector('[data-start]'); await r.click('[data-start]'); await r.waitForSelector('text=اليوم'); await shot(r, '08-cycle');
  });
  await step('الدورة: إياد لا يرى بيانات روان', async () => { await e.goto(BASE + '/#/cycle'); await e.waitForSelector('text=هذا القسم خاص'); });

  await step('منذ أن عرفنا بعض: إدخال التاريخ والوقت وعداد مباشر', async () => {
    await e.goto(BASE + '/#/settings'); await e.click('[data-act=since]'); await e.waitForSelector('.sheet [data-k="date"]');
    await e.fill('.sheet [data-k="date"]', '2023-06-16'); await e.fill('.sheet [data-k="time"]', '15:36:25'); await fill(e, 'note', 'أول مرة التقينا في المقهى'); await save(e);
    await e.goto(BASE + '/#/since'); await e.waitForSelector('.since-hero [data-u="s"]');
    const a = await e.textContent('.since-hero [data-u="s"]'); await e.waitForTimeout(2100); const b = await e.textContent('.since-hero [data-u="s"]');
    if (a === b) throw new Error('counter is not ticking'); await shot(e, '09-since');
    await r.goto(BASE + '/#/'); await r.waitForSelector('.since-card [data-u="s"]', { timeout: 12000 }); await shot(r, '09-since-home-rawan');
  });
  await step('الأرقام العربية من الإعدادات', async () => {
    await e.goto(BASE + '/#/settings'); await e.click('[data-set=numerals][data-v=arab]'); await e.waitForTimeout(300);
    await e.goto(BASE + '/#/since'); await e.waitForSelector('.since-hero'); await e.waitForTimeout(1200);
    const txt = await e.textContent('.since-hero'); if (/[0-9]/.test(txt) || !/[٠-٩]/.test(txt)) throw new Error('digits not Arabic: ' + txt.slice(0, 80));
    await shot(e, '09-since-arabic-digits');
    await e.goto(BASE + '/#/calendar'); await e.waitForSelector('.cal-grid'); await shot(e, '09-cal-arabic-digits');
    await e.goto(BASE + '/#/settings'); await e.click('[data-set=numerals][data-v=latn]'); await e.waitForTimeout(300);
  });

  const routes = ['since', '', 'calendar', 'tasks', 'plans', 'more', 'dates', 'mood', 'places', 'bucket', 'trips', 'honeymoon', 'shopping', 'expenses', 'notes', 'settings', 'notifications'];
  await step('كل الصفحات تعمل (إياد)', async () => {
    const english = [];
    for (const [i, rt] of routes.entries()) {
      await e.goto(`${BASE}/#/${rt}`); await e.waitForSelector('.page-head, .greet', { timeout: 8000 }); await e.waitForTimeout(150); await shot(e, `10-${String(i).padStart(2, '0')}-${rt || 'home'}`);
      const words = await e.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.parentElement.closest('[dir=ltr], .code-box, .leaflet-control-attribution, script, style, .logo')) continue; const m = n.data.match(/[A-Za-z]{2,}/g); if (m) out.push(...m.filter((x) => !/^(E|R|ER)$/.test(x))); } return out; });
      if (words.length) english.push(`${rt || 'home'}: ${[...new Set(words)].join(' ')}`);
    }
    if (english.length) throw new Error('English words in UI → ' + english.join(' | '));
  });
  await step('التقويم: عرض الأسبوع واليوم والهجري والمحول', async () => {
    await e.goto(BASE + '/#/calendar'); await e.click('[data-basis=h]'); await shot(e, '11-cal-hijri'); await e.click('[data-view=week]'); await e.click('[data-view=day]'); await e.click('[data-view=month]'); await e.click('[data-conv]'); await e.waitForSelector('#gOut b'); await e.keyboard.press('Escape');
  });
  await step('رحلة + عنصر في قائمة التجهيز', async () => {
    await e.goto(BASE + '/#/trips'); await e.click('[data-new]'); await fill(e, 'name', 'العلا'); await fill(e, 'destination', 'العلا'); await e.fill('.sheet [data-k="start_date"]', '2030-02-01'); await e.fill('.sheet [data-k="end_date"]', '2030-02-04'); await save(e);
    await e.click('text=العلا >> nth=0'); await e.waitForSelector('[data-tab=checklist]'); await e.click('[data-tab=checklist]'); await e.click('[data-add]'); await fill(e, 'title', 'جوازات السفر'); await save(e); await e.waitForSelector('text=جوازات السفر');
    await e.click('[data-tab=calendar]'); await shot(e, '12-trip');
  });
  await step('شهر العسل: وجهتان، مقارنة، اختيار، تحويل لرحلة', async () => {
    await r.goto(BASE + '/#/honeymoon');
    for (const [n, b] of [['المالديف', '40000'], ['اليابان', '35000']]) { await r.click('[data-newdest]'); await fill(r, 'name', n); await fill(r, 'budget', b); await save(r); }
    await r.click('[data-tab=compare]'); await shot(r, '13-honeymoon-compare'); await r.click('.compare [data-dest] >> nth=0'); await r.click('.sheet [data-choose]'); await r.waitForSelector('.sheet', { state: 'detached' });
    await r.click('.hero [data-dest]'); await r.click('.sheet [data-trip]'); await r.click('.sheet [data-ok]'); await r.waitForURL(/#\/trips\//, { timeout: 8000 });
  });
  await step('مكان + خطة شهرية + رسالة صغيرة + أمنية → موعد', async () => {
    await e.goto(BASE + '/#/places'); await e.click('[data-new]'); await fill(e, 'name', 'كافيه هادئ'); await e.click('.sheet [data-seg="category"][data-v="cafe"]'); await e.click('.sheet [data-star="4"]'); await save(e);
    await e.goto(BASE + '/#/plans'); await e.click('[data-new] >> nth=0'); await fill(e, 'title', 'شراء هدية'); await save(e); await e.click('[data-cycle]'); await e.waitForTimeout(400);
    await e.goto(BASE + '/#/notes'); await e.click('[data-new] >> nth=0'); await fill(e, 'body', 'صباح الخير 🤍'); await save(e);
    await e.goto(BASE + '/#/bucket'); await e.click('[data-new] >> nth=0'); await fill(e, 'title', 'رحلة بالون'); await save(e); await e.click('[data-open]'); await e.click('.sheet [data-cal]'); await e.waitForSelector('.sheet [data-k="title"]'); await save(e);
    await e.goto(BASE + '/#/bucket'); await e.click('[data-s=planned]'); await e.waitForSelector('text=رحلة بالون');
  });
  await step('الوضع الداكن', async () => {
    await e.goto(BASE + '/#/settings'); await e.click('[data-set=theme][data-v=dark]'); await e.waitForTimeout(300);
    if ((await e.getAttribute('html', 'data-theme')) !== 'dark') throw new Error('not dark');
    await e.goto(BASE + '/#/'); await e.waitForSelector('.greet'); await shot(e, '14-home-dark'); await e.goto(BASE + '/#/calendar'); await e.waitForSelector('.cal-grid'); await shot(e, '15-cal-dark');
  });
  await step('صفحات روان', async () => { for (const rt of ['', 'more', 'notes', 'expenses', 'mood']) { await r.goto(`${BASE}/#/${rt}`); await r.waitForSelector('.page-head, .greet'); } await r.goto(BASE + '/#/'); await shot(r, '16-home-rawan'); });
  await step('تسجيل الخروج والدخول', async () => {
    await r.goto(BASE + '/#/settings'); await r.click('[data-act=logout]'); await r.waitForSelector('[name=email]');
    await r.fill('[name=email]', 'rawan@example.com'); await r.fill('[name=password]', 'password-2'); await r.click('button[type=submit]'); await r.waitForSelector('.greet');
  });
  await step('عرض الكمبيوتر', async () => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const p = await ctx.newPage(); await p.goto(BASE + '/'); await p.fill('[name=email]', 'eyad@example.com'); await p.fill('[name=password]', 'password-1'); await p.click('button[type=submit]'); await p.waitForSelector('.greet'); await p.screenshot({ path: `${OUT}/17-desktop.png` }); });
  await browser.close();
}

main().catch((e) => { console.error(e); failed++; }).finally(() => {
  if (errors.length) { console.log('\nJS errors:'); errors.slice(0, 20).forEach((x) => console.log('  ', x)); }
  console.log(`\n${failed ? failed + ' failed' : 'all steps passed'}, ${errors.length} JS errors`);
  try { process.kill(-dev.pid); } catch { /* gone */ }
  process.exit(failed || errors.length ? 1 : 0);
});
