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

  // ======================= v3 sections =======================
  const openSec = async (p, key) => { await p.goto(`${BASE}/#/s/${key}`); await p.waitForSelector('.page-head'); };
  const addIn = async (p) => { await p.click('.page-head [data-new]'); await p.waitForSelector('.sheet [data-save]'); };
  const detailAction = async (p, text) => { await p.click(`.sheet .act-grid button:has-text("${text}")`); await p.waitForTimeout(350); };
  await step('أمنياتنا: روان تضيف، إياد يختارها «اخترت أمنية لك»، روان تُشعَر', async () => {
    await openSec(r, 'wishes'); await r.click('[data-tab=me]'); await addIn(r); await fill(r, 'title', 'عشاء على البحر'); await r.click('.sheet [data-seg="category"][data-v="restaurant"]'); await save(r);
    await openSec(e, 'wishes'); await e.waitForSelector('text=عشاء على البحر', { timeout: 12000 }); await e.click('[data-open]'); await detailAction(e, 'اخترت أمنية لك');
    await e.fill('.sheet [data-k="pick_date"]', '2030-02-14'); await save(e); await e.waitForTimeout(400);
    await openSec(e, 'wishes'); await e.click('[data-tab=picked]'); await e.waitForSelector('text=اخترتها ✨'); await shot(e, '20-wishes');
    await r.goto(BASE + '/#/notifications'); await r.waitForSelector('text=أمنية', { timeout: 12000 });
    await r.goto(BASE + '/#/'); await r.waitForSelector('text=بانتظارك', { timeout: 12000 });
  });
  await step('جدول يومنا: خطة + أنشطة مرتبة بالوقت + «وثّق يومنا كذكرى»', async () => {
    await openSec(e, 's'.length ? 'outings' : ''); await addIn(e); await fill(e, 'title', 'خطة يوم الجمعة'); await e.fill('.sheet [data-k="date"]', new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)); await save(e);
    await e.waitForURL(/#\/outing\//); await e.waitForSelector('[data-add]');
    for (const [tm, ti] of [['20:00', 'نشاط البولينغ'], ['18:00', 'العشاء'], ['22:00', 'قهوة وحلى']]) { await e.click('[data-add]'); await e.fill('.sheet [data-k="time"]', tm); await fill(e, 'title', ti); await save(e); }
    const order = await e.$$eval('.sch-card .grow > div:first-child', (x) => x.map((n) => n.textContent));
    if (order.join('|') !== 'العشاء|نشاط البولينغ|قهوة وحلى') throw new Error('not sorted by time: ' + order.join('|'));
    await shot(e, '21-outing'); await e.click('[data-memory]'); await e.waitForSelector('.sheet [data-k="title"]'); await e.click('.sheet [data-star="5"]'); await save(e);
    await e.waitForSelector('text=موثّق كذكرى'); await openSec(e, 'memories'); await e.waitForSelector('.tl-item'); await shot(e, '22-memories');
  });
  await step('طلباتنا: إياد يرسل طلبًا وروان توافق', async () => {
    await openSec(e, 'requests'); await addIn(e); await fill(e, 'title', 'نطلع نتمشى المغرب'); await save(e);
    await openSec(r, 'requests'); await r.waitForSelector('text=نطلع نتمشى المغرب', { timeout: 12000 }); await r.click('[data-open]'); await detailAction(r, 'موافقة');
    await openSec(e, 'requests'); await e.click('[data-tab=fromme]'); await e.waitForSelector('text=تمت الموافقة', { timeout: 12000 });
  });
  await step('اتفاقياتنا: موافقة الطرفين', async () => {
    await openSec(e, 'agreements'); await addIn(e); await fill(e, 'title', 'ميزانية الرحلة 5000'); await save(e);
    await e.click('[data-tab=wait]'); await e.click('[data-open]'); await detailAction(e, 'أوافق على الاتفاق');
    await openSec(r, 'agreements'); await r.click('[data-tab=wait]'); await r.waitForSelector('text=ميزانية الرحلة', { timeout: 12000 }); await r.click('[data-open]'); await detailAction(r, 'أوافق على الاتفاق');
    await openSec(r, 'agreements'); await r.click('[data-tab=act]'); await r.waitForSelector('text=تمت الموافقة من الطرفين', { timeout: 12000 }); await r.click('[data-open]'); await r.waitForSelector('.contract'); await shot(r, '23-agreement'); await r.keyboard.press('Escape');
  });
  await step('تعهداتنا: روان تطلب تعهدًا وإياد يوقّع', async () => {
    await openSec(r, 'commitments'); await addIn(r); await fill(r, 'title', 'الالتزام بموعد الاتصال'); await save(r);
    await openSec(e, 'commitments'); await e.waitForSelector('text=الالتزام بموعد الاتصال', { timeout: 12000 }); await e.click('[data-open]'); await detailAction(e, 'أوافق وأتعهد');
    await openSec(r, 'commitments'); await r.waitForSelector('text=ساري', { timeout: 12000 });
  });
  await step('اعترافات: التعهد مطلوب قبل الدخول، ثم الكتابة', async () => {
    await openSec(e, 'confessions'); await e.waitForSelector('.pledge [data-pledge]'); await shot(e, '24-pledge'); await e.click('[data-pledge]'); await e.waitForSelector('.page-head [data-new]');
    await addIn(e); await e.fill('.sheet [data-k="body"]', 'كنت أتمنى نقضي وقتًا أطول سوا'); await save(e);
    await openSec(r, 'confessions'); await r.waitForSelector('[data-pledge]'); await r.click('[data-pledge]'); await r.waitForSelector('text=كنت أتمنى', { timeout: 12000 });
  });
  await step('شيء زعلني منك + كيف تسعدني؟ + وش نفسك فيه', async () => {
    await openSec(r, 'upsets'); await addIn(r); await fill(r, 'title', 'تأخر الرد'); await save(r);
    await openSec(r, 'joys'); await r.click('[data-tab=me]'); await r.click('[data-newk=joy]'); await fill(r, 'title', 'السؤال عني خلال اليوم'); await save(r); await shot(r, '25-joys');
    await openSec(e, 'cravings'); await addIn(e); await fill(e, 'text', 'بيتزا'); await save(e);
    await openSec(r, 'cravings'); await r.waitForSelector('text=بيتزا', { timeout: 12000 }); await r.click('[data-open]'); await detailAction(r, 'حوّلها لطلب'); await r.waitForSelector('.sheet [data-k="title"]'); await save(r);
  });
  await step('أغراض ناقصتني → المقاضي، أشياء عاجلة في الرئيسية، تذكير، موعد طبي، مهمة يومية، مكان زرناه', async () => {
    await openSec(r, 'needs'); await addIn(r); await fill(r, 'name', 'شاحن جوال'); await save(r); await r.click('[data-open]'); await detailAction(r, 'أضفه لقائمة المقاضي');
    await r.goto(BASE + '/#/shopping'); await r.waitForSelector('text=شاحن جوال');
    await openSec(e, 'urgent'); await addIn(e); await fill(e, 'title', 'تجديد الإقامة'); await save(e);
    await openSec(r, 'reminders'); await addIn(r); await fill(r, 'title', 'راجع موضوع الحجز'); await save(r);
    await openSec(e, 'appointments'); await addIn(e); await fill(e, 'title', 'مراجعة الأسنان'); await save(e);
    await openSec(e, 'daily_tasks'); await addIn(e); await fill(e, 'title', 'الاتصال بالفندق'); await save(e); await e.click('[data-check]'); await e.waitForTimeout(300);
    await openSec(e, 'visited'); await addIn(e); await fill(e, 'name', 'كافيه البحر'); await save(e); await e.fill('#sq', 'البحر'); await e.waitForTimeout(500); await e.waitForSelector('text=كافيه البحر');
    await e.goto(BASE + '/#/'); await e.waitForSelector('text=أشياء عاجلة'); await e.waitForSelector('text=راجع موضوع الحجز', { timeout: 12000 }); await e.waitForSelector('text=مراجعة الأسنان'); await shot(e, '26-home-v3');
  });
  await step('ذكرى يوم عرفنا بعض + الذكرى السنوية ضمن المناسبات', async () => {
    await e.goto(BASE + '/#/anniv'); await e.waitForSelector('text=الذكرى القادمة'); await e.click('[data-m] >> nth=0'); await fill(e, 'did', 'عشاء وكيك'); await save(e); await shot(e, '27-anniv');
    await e.goto(BASE + '/#/dates'); await e.waitForSelector('text=ذكرى يوم عرفنا بعض');
    await e.goto(BASE + '/#/more'); await e.waitForSelector('text=تواصلنا'); await shot(e, '28-more');
  });

  await step('أعياد ميلادنا: كل طرف يرى ميلاد الآخر + رسالة مخفية + احتفال يوم الميلاد', async () => {
    await e.goto(BASE + '/#/'); await e.waitForSelector('[data-bd-card]:has-text("يوم ميلاد روان")');
    if (await e.$('[data-bd-card]:has-text("يوم ميلاد إياد")')) throw new Error('Eyad must not see his own birthday card');
    await r.goto(BASE + '/#/'); await r.waitForSelector('[data-bd-card]:has-text("يوم ميلاد إياد")'); await shot(r, '30-bday-card-rawan');
    await e.goto(BASE + '/#/birthday'); await e.waitForSelector('.bd-boxes'); await shot(e, '31-bday-page-eyad');
    await e.goto(BASE + '/#/birthday/admin'); await e.click('[data-a=letter]'); await fill(e, 'title', 'إلى روان'); await e.fill('.sheet [data-k="body"]', 'كل عام وأنتِ أجمل أيامي.\nوجودك في حياتي أجمل هدية ❤️'); await save(e); await shot(e, '32-bday-admin');
    await r.goto(BASE + '/#/birthday'); await r.waitForSelector('[data-letter-locked]', { timeout: 12000 });
    await r.click('[data-letter-locked]'); await r.waitForSelector('text=رسالتك الخاصة تنتظرك في يوم ميلادك');
    const today = await r.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date()));
    await r.evaluate((d) => fetch('/api/bday/config', { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-requested-with': 'er' }, body: JSON.stringify({ birthdays: { R: { greg: '2004-' + d.slice(5) } } }) }), today);
    await e.goto(BASE + '/#/'); await e.waitForSelector('.bd-card.party', { timeout: 12000 }); await e.waitForTimeout(1200); await shot(e, '33-bday-party-eyad');
    await r.goto(BASE + '/'); await r.waitForSelector('.greet'); await r.goto(BASE + '/#/birthday'); await r.waitForSelector('[data-letter]', { timeout: 12000 }); await r.click('[data-letter]');
    await r.waitForSelector('.bd-paper p'); await r.waitForTimeout(1800); await shot(r, '34-bday-letter');
    await r.keyboard.press('Escape');
    await r.evaluate(() => fetch('/api/bday/config', { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-requested-with': 'er' }, body: JSON.stringify({ birthdays: { R: { greg: '2004-02-27' } } }) }));
  });

  await step('الدورة: بطاقة في أسفل رئيسية روان فقط، وإياد يطّلع من قسم مستقل بحسب مشاركتها', async () => {
    await r.goto(BASE + '/#/'); await r.waitForSelector('.cy-card', { timeout: 12000 });
    const pos = await r.evaluate(() => { const cards = [...document.querySelectorAll('#page .card, #page .hero, #page .bd-card, #page .mood-pair')]; return cards.indexOf(document.querySelector('.cy-card')) === cards.length - 1; });
    if (!pos) throw new Error('cycle card is not the last block on the home page');
    await r.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await shot(r, '40-cycle-home-rawan');
    await e.goto(BASE + '/#/'); await e.waitForSelector('.greet'); await e.waitForTimeout(800);
    if (await e.$('.cy-card')) throw new Error('cycle card must not appear on Eyad home');
    await e.goto(BASE + '/#/more'); await e.click('a[href="#/cycle"]'); await e.waitForSelector('text=هذا القسم خاص');
    await r.goto(BASE + '/#/cycle'); await r.click('.page-head [data-settings]'); await r.click('.sheet [data-share="full"]'); await r.waitForTimeout(500); await r.keyboard.press('Escape');
    await r.click('[data-new]'); await r.fill('.sheet [data-k="start_date"]', '2026-10-01'); await r.fill('.sheet [data-k="end_date"]', '2026-10-05'); await r.click('.sheet [data-seg="symptoms"][data-v="headache"]'); await save(r);
    await e.goto(BASE + '/#/cycle'); await e.waitForSelector('text=الدورات السابقة', { timeout: 12000 }); await e.waitForSelector('text=صداع'); await shot(e, '41-cycle-eyad-readonly');
    if (await e.$('[data-new], [data-start]')) throw new Error('Eyad must not have edit buttons');
  });
  await step('مواعيد تسميع القرآن: روان تضيف وتوثّق، إياد يتابع فقط', async () => {
    await r.goto(BASE + '/#/quran'); await r.click('.q-empty'); await r.waitForSelector('.sheet [data-k="surah"]');
    await r.selectOption('.sheet [data-k="surah"]', '67'); await r.fill('.sheet [data-k="from_ayah"]', '1'); await r.fill('.sheet [data-k="to_ayah"]', '15'); await r.fill('.sheet [data-k="time"]', '20:00');
    await r.fill('.sheet [data-k="date"]', new Date(Date.now() + 3 * 3600000 + 2 * 86400000).toISOString().slice(0, 10)); await fill(r, 'teacher', 'أ. نورة'); await save(r);
    await r.waitForSelector('.q-next .q-surah:has-text("سورة الملك")'); await shot(r, '42-quran-rawan');
    await e.goto(BASE + '/#/quran'); await e.waitForSelector('text=سورة الملك', { timeout: 12000 }); await e.waitForSelector('.q-note');
    if (await e.$('.page-head [data-new], [data-doc-next], [data-direct]')) throw new Error('Eyad must be view-only');
    await shot(e, '43-quran-eyad');
    await r.click('[data-doc-next]'); await r.waitForSelector('.sheet [data-k="done_surah"]'); await r.click('.sheet [data-seg="status"][data-v="partial"]'); await r.fill('.sheet [data-k="done_to"]', '10'); await r.click('.sheet [data-star="4"]'); await fill(r, 'review_notes', 'مراجعة الآيات 11-15'); await save(r);
    await r.click('[data-tab=log]'); await r.waitForSelector('text=جزئي'); await r.fill('#qq', 'الملك'); await r.waitForTimeout(500); await r.waitForSelector('text=سورة الملك'); await shot(r, '44-quran-log');
    await r.click('[data-tab=cal]'); await r.waitForSelector('.q-dot'); await shot(r, '45-quran-cal');
    await e.goto(BASE + '/#/quran'); await e.click('[data-tab=log]'); await e.waitForSelector('text=جزئي', { timeout: 12000 });
  });

  const routes = ['quran', 'cycle', 'birthday', 'birthday/admin', 's/wishes', 's/outings', 's/memories', 's/visited', 's/appointments', 's/daily_tasks', 's/cravings', 's/confessions', 's/upsets', 's/joys', 's/urgent', 's/requests', 's/commitments', 's/agreements', 's/needs', 's/reminders', 'anniv', 'since', '', 'calendar', 'tasks', 'plans', 'more', 'dates', 'mood', 'places', 'bucket', 'trips', 'honeymoon', 'shopping', 'expenses', 'notes', 'settings', 'notifications'];
  await step('كل الصفحات تعمل (إياد)', async () => {
    const english = [];
    for (const [i, rt] of routes.entries()) {
      await e.goto(`${BASE}/#/${rt}`); await e.waitForSelector('.page-head, .greet', { timeout: 8000 }); await e.waitForTimeout(150); await shot(e, `10-${String(i).padStart(2, '0')}-${(rt || 'home').replace('/', '-')}`);
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
