// End-to-end API tests: starts a throwaway local Worker + D1 and exercises the real endpoints as Eyad and Rawan.
// Run: npm test
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const PORT = 8798, BASE = `http://localhost:${PORT}`;
const STATE = '.wrangler/test-state';
const SETUP_TOKEN = 'test-setup-token-123456';

fs.rmSync(STATE, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${STATE}`, { stdio: 'ignore' });
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--test-scheduled', '--port', String(PORT), '--persist-to', STATE, '--var', `SETUP_TOKEN:${SETUP_TOKEN}`], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let devLog = ''; dev.stdout.on('data', (d) => (devLog += d)); dev.stderr.on('data', (d) => (devLog += d));

function client() {
  let cookie = '';
  return async function api(method, path, body, { raw = false, headers = {} } = {}) {
    const isBuf = body instanceof Uint8Array;
    const res = await fetch(BASE + path, { method, headers: { ...(isBuf ? {} : { 'content-type': 'application/json' }), 'x-requested-with': 'er', cookie, ...headers }, body: body === undefined ? undefined : isBuf ? body : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    if (raw) return res;
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
}
const ok = (r, msg) => { if (r.status >= 300) throw new Error(`${msg}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n    ', e.message); } }

async function main() {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/auth/status'); if (r.ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 500)); }
  const eyad = client(), rawan = client(), anon = client(), stranger = client();
  let E, R, invite, taskId, recovery;

  console.log('\nالدخول والخصوصية');
  await test('لا وصول للبيانات بدون تسجيل دخول', async () => { assert.equal((await anon('GET', '/api/bootstrap')).status, 401); });
  await test('رفض الطلبات بدون ترويسة CSRF', async () => { const r = await fetch(BASE + '/api/auth/login', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }); assert.equal(r.status, 403); });
  await test('الإعداد يرفض رمزًا خاطئًا', async () => { assert.equal((await anon('POST', '/api/auth/setup', { setup_token: 'x', name: 'إياد', email: 'e@x.com', password: 'password-1' })).status, 403); });
  await test('إنشاء حساب إياد (الطرف الأول)', async () => { const d = ok(await eyad('POST', '/api/auth/setup', { setup_token: SETUP_TOKEN, name: 'إياد', email: 'Eyad@Example.com', password: 'password-1', letter: 'E' }), 'setup'); recovery = d.recovery_code; assert.match(recovery, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/); });
  await test('لا يمكن إنشاء حساب ثانٍ بالإعداد', async () => { assert.equal((await anon('POST', '/api/auth/setup', { setup_token: SETUP_TOKEN, name: 'x', email: 'x@x.com', password: 'password-1' })).status, 409); });
  await test('إنشاء رابط دعوة', async () => { const d = ok(await eyad('POST', '/api/auth/invite'), 'invite'); invite = d.link.split('/join/')[1]; assert.ok(invite); });
  await test('معلومات الدعوة', async () => { const d = ok(await anon('GET', `/api/auth/invite/${invite}`), 'info'); assert.equal(d.letter, 'R'); });
  await test('روان تنضم عبر الدعوة', async () => { ok(await rawan('POST', '/api/auth/join', { token: invite, name: 'روان', email: 'rawan@example.com', password: 'password-2' }), 'join'); });
  await test('الدعوة لا تُستخدم مرتين ولا شخص ثالث', async () => { assert.equal((await stranger('POST', '/api/auth/join', { token: invite, name: 'x', email: 'x@y.com', password: 'password-3' })).status, 410); assert.equal((await eyad('POST', '/api/auth/invite')).status, 409); });
  await test('تسجيل الدخول بكلمة مرور خاطئة يفشل', async () => { assert.equal((await anon('POST', '/api/auth/login', { email: 'eyad@example.com', password: 'nope-nope' })).status, 401); });
  await test('تسجيل الدخول (البريد غير حساس لحالة الأحرف)', async () => { const c = client(); ok(await c('POST', '/api/auth/login', { email: 'EYAD@example.com', password: 'password-1' }), 'login'); });
  await test('bootstrap يعرض الطرفين', async () => { const d = ok(await eyad('GET', '/api/bootstrap'), 'b'); E = d.me; R = d.partner; assert.equal(E.letter, 'E'); assert.equal(R.letter, 'R'); assert.equal(R.name, 'روان'); });

  console.log('\nالمهام والإشعارات والمزامنة');
  let cursor = ok(await rawan('GET', '/api/bootstrap'), 'b').cursor;
  await test('إياد يكلّف روان بمهمة', async () => { const d = ok(await eyad('POST', '/api/c/tasks', { title: 'حجز المطعم', assignee: R.id, priority: 'high', due_date: '2030-01-05' }), 'task'); taskId = d.item.id; assert.equal(d.item.created_by, E.id); });
  await test('المزامنة المباشرة: روان ترى المهمة ومن أضافها', async () => { const d = ok(await rawan('GET', `/api/sync?since=${cursor}`), 'sync'); assert.ok(d.upserts.tasks.some((t) => t.id === taskId)); assert.equal(d.events[0].actor, E.id); assert.ok(d.unread >= 1); cursor = d.cursor; });
  await test('روان تحصل على إشعار التكليف', async () => { const d = ok(await rawan('GET', '/api/notifications'), 'n'); assert.ok(d.items.some((n) => n.kind === 'task_assigned' && n.body === 'حجز المطعم')); });
  await test('روان تنجز المهمة → completed_by و إشعار لإياد', async () => {
    const d = ok(await rawan('PATCH', `/api/c/tasks/${taskId}`, { status: 'completed' }), 'done'); assert.equal(d.item.completed_by, R.id); assert.equal(d.item.updated_by, R.id);
    const n = ok(await eyad('GET', '/api/notifications'), 'n'); assert.ok(n.items.some((x) => x.kind === 'task_done'));
  });
  await test('لا يمكن تزوير completed_by من الواجهة', async () => { const d = ok(await eyad('PATCH', `/api/c/tasks/${taskId}`, { completed_by: 'hacker', title: 'حجز المطعم ✓' }), 'p'); assert.equal(d.item.completed_by, R.id); });
  await test('التحقق من الحقول (قيمة غير مسموحة / رابط خطر / شخص غير موجود)', async () => {
    assert.equal((await eyad('POST', '/api/c/tasks', { title: 'x', priority: 'urgent' })).status, 400);
    assert.equal((await eyad('POST', '/api/c/plans', { title: 'x', month: '2030-01', link: 'javascript:alert(1)' })).status, 400);
    assert.equal((await eyad('POST', '/api/c/tasks', { title: 'x', assignee: 'u_nobody' })).status, 400);
    assert.equal((await eyad('POST', '/api/c/nope', { title: 'x' })).status, 404);
  });
  await test('تعليق على المهمة + حذف المهمة يحذف تعليقاتها', async () => {
    const c = ok(await rawan('POST', '/api/c/task_comments', { task_id: taskId, body: 'تم الحجز الساعة 9' }), 'c');
    ok(await eyad('DELETE', `/api/c/tasks/${taskId}`), 'del');
    const d = ok(await eyad('GET', '/api/bootstrap'), 'b'); assert.ok(!d.data.task_comments.some((x) => x.id === c.item.id));
    const s = ok(await rawan('GET', `/api/sync?since=${cursor}`), 's'); assert.ok(s.deletes.tasks.includes(taskId)); assert.ok(s.deletes.task_comments.includes(c.item.id));
  });

  console.log('\nالمزاج والدورة (خصوصية)');
  await test('المزاج: الملاحظة الخاصة لا تظهر للطرف الآخر', async () => {
    ok(await rawan('POST', '/api/c/moods', { date: '2030-01-01', mood: 'tired', message: 'اليوم محتاجة هدوء', private_note: 'سر' }), 'm');
    const own = ok(await rawan('GET', '/api/bootstrap'), 'b').data.moods[0]; assert.equal(own.private_note, 'سر');
    const other = ok(await eyad('GET', '/api/bootstrap'), 'b').data.moods[0]; assert.equal(other.private_note, undefined); assert.equal(other.message, 'اليوم محتاجة هدوء');
  });
  await test('المزاج: مزاج واحد لكل شخص في اليوم (تحديث بدل التكرار)', async () => { ok(await rawan('POST', '/api/c/moods', { date: '2030-01-01', mood: 'happy' }), 'm'); const d = ok(await eyad('GET', '/api/bootstrap'), 'b'); assert.equal(d.data.moods.length, 1); assert.equal(d.data.moods[0].mood, 'happy'); });
  await test('المزاج: لا يمكن لإياد تعديل مزاج روان', async () => { const id = ok(await eyad('GET', '/api/bootstrap'), 'b').data.moods[0].id; assert.equal((await eyad('PATCH', `/api/c/moods/${id}`, { mood: 'okay' })).status, 403); });
  let cycleId;
  await test('الدورة: روان تسجل — إياد لا يرى أي شيء', async () => {
    cycleId = ok(await rawan('POST', '/api/c/cycles', { start_date: '2029-12-01', end_date: '2029-12-05', symptoms: ['cramps', 'headache'], pain: 4 }), 'c').item.id;
    ok(await rawan('POST', '/api/c/cycles', { start_date: '2029-12-29', end_date: '2030-01-02' }), 'c2');
    assert.equal(ok(await eyad('GET', '/api/c/cycles'), 'e').items.length, 0);
    assert.equal((await eyad('PATCH', `/api/c/cycles/${cycleId}`, { pain: 1 })).status, 404);
    assert.equal(ok(await eyad('GET', '/api/bootstrap'), 'b').data.cycles, undefined);
    assert.ok(!ok(await eyad('GET', '/api/sync?since=0'), 's').events.some((x) => x.col === 'cycles'));
    const exp = ok(await eyad('GET', '/api/export'), 'x'); assert.equal(exp.data.cycles.length, 0);
    assert.deepEqual(ok(await rawan('GET', '/api/c/cycles'), 'r').items.find((x) => x.id === cycleId).symptoms, ['cramps', 'headache']);
  });
  await test('الدورة: مشاركة الموعد المتوقع فقط عند تفعيلها', async () => {
    assert.equal(ok(await eyad('GET', '/api/bootstrap'), 'b').partner_cycle, null);
    ok(await rawan('PATCH', '/api/me', { settings: { cycle: { enabled: true, share: 'prediction' } } }), 's');
    const pc = ok(await eyad('GET', '/api/bootstrap'), 'b').partner_cycle; assert.ok(pc.next); assert.deepEqual(Object.keys(pc).sort(), ['days_to_next', 'in_period', 'next']);
  });
  await test('الدورة: القفل برمز يُفرض على الخادم', async () => {
    ok(await rawan('POST', '/api/cycle/pin', { pin: '2468', password: 'password-2' }), 'pin');
    assert.equal((await rawan('GET', '/api/c/cycles')).status, 423);
    assert.equal((await rawan('POST', '/api/cycle/unlock', { pin: '1111' })).status, 401);
    ok(await rawan('POST', '/api/cycle/unlock', { pin: '2468' }), 'unlock');
    assert.equal(ok(await rawan('GET', '/api/c/cycles'), 'c').items.length, 2);
    const me = ok(await rawan('GET', '/api/me'), 'me'); assert.equal(me.settings.cycle.has_pin, true); assert.equal(me.settings.cycle.pin_hash, undefined);
  });

  console.log('\nالأقسام الأخرى');
  await test('المناسبات: هجري متكرر', async () => { const d = ok(await eyad('POST', '/api/c/dates', { title: 'ذكرى الخطوبة', date: '2025-06-26', cal: 'h', h_year: 1447, h_month: 1, h_day: 1, recurring: true, kind: 'engagement', remind: '7' }), 'd'); assert.equal(d.item.recurring, 1); assert.equal(d.item.h_month, 1); });
  await test('الميزانية: واحدة لكل شهر (upsert)', async () => { ok(await eyad('POST', '/api/c/budgets', { month: '2030-01', amount: 3000 }), 'b1'); ok(await rawan('POST', '/api/c/budgets', { month: '2030-01', amount: 3500 }), 'b2'); const b = ok(await eyad('GET', '/api/bootstrap'), 'b').data.budgets; assert.equal(b.length, 1); assert.equal(b[0].amount, 3500); });
  await test('المصروفات + المقاضي (من اشترى)', async () => {
    ok(await eyad('POST', '/api/c/expenses', { title: 'عشاء', amount: 245.5, date: '2030-01-03', category: 'restaurants', paid_by: E.id }), 'e');
    const s = ok(await eyad('POST', '/api/c/shopping', { name: 'حليب', qty: '2', category: 'groceries', buyer: R.id }), 's').item;
    const d = ok(await rawan('PATCH', `/api/c/shopping/${s.id}`, { done: true }), 'done').item; assert.equal(d.done_by, R.id); assert.ok(d.done_at);
  });
  await test('الأماكن: إحداثيات بدقة كاملة', async () => { const d = ok(await eyad('POST', '/api/c/places', { name: 'مطعم', category: 'restaurant', lat: 24.713552, lng: 46.675296, photos: ['f_abc123'] }), 'p').item; assert.equal(d.lat, 24.713552); assert.deepEqual(d.photos, ['f_abc123']); });
  await test('شهر العسل → رحلة فعلية', async () => {
    const dest = ok(await rawan('POST', '/api/c/honeymoon', { name: 'المالديف', budget: 40000 }), 'd').item;
    ok(await rawan('POST', '/api/c/honey_items', { section: 'flight', title: 'الرياض → ماليه', destination_id: dest.id, date: '2030-03-01', amount: 6000 }), 'f');
    ok(await rawan('POST', '/api/c/honey_items', { section: 'packing', title: 'واقي شمس' }), 'p');
    const r = ok(await rawan('POST', `/api/honeymoon/${dest.id}/convert`), 'conv');
    const b = ok(await eyad('GET', '/api/bootstrap'), 'b');
    const trip = b.data.trips.find((t) => t.id === r.trip_id); assert.equal(trip.honeymoon, 1); assert.match(trip.flight_details, /ماليه/); assert.equal(trip.start_date, '2030-03-01');
    assert.ok(b.data.trip_items.some((i) => i.trip_id === r.trip_id && i.section === 'checklist' && i.title === 'واقي شمس'));
    assert.equal(b.data.honeymoon.find((d) => d.id === dest.id).chosen, 1);
  });
  await test('رفع صورة وقراءتها (والغرباء لا يصلون لها)', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const id = ok(await eyad('POST', '/api/files', png, { headers: { 'content-type': 'image/png' } }), 'up').id;
    const r = await rawan('GET', `/api/files/${id}`, undefined, { raw: true }); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal((await anon('GET', `/api/files/${id}`)).status, 401);
    assert.equal((await eyad('POST', '/api/files', new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'text/html' } })).status, 400);
  });
  await test('التذكيرات (cron) تعمل بدون أخطاء', async () => {
    const t = new Date(); const tomorrow = new Date(t.getTime() + 86400000 + 3 * 3600000).toISOString().slice(0, 10);
    ok(await eyad('POST', '/api/c/events', { title: 'موعد الأسنان', date: tomorrow, remind: 'custom', remind_at: new Date(Date.now() + 3 * 3600000 - 5 * 60000).toISOString().slice(0, 16), assignee: E.id }), 'ev');
    const r = await fetch(BASE + '/__scheduled?cron=*/15+*+*+*+*'); assert.equal(r.status, 200);
    let got = false; for (let i = 0; i < 20 && !got; i++) { await new Promise((ok2) => setTimeout(ok2, 250)); got = ok(await eyad('GET', '/api/notifications'), 'n').items.some((n) => n.kind === 'event' && /موعد الأسنان/.test(n.title)); }
    assert.ok(got, 'reminder notification was not created');
    await fetch(BASE + '/__scheduled?cron=*/15+*+*+*+*'); await new Promise((ok2) => setTimeout(ok2, 500));
    assert.equal(ok(await eyad('GET', '/api/notifications'), 'n').items.filter((n) => /موعد الأسنان/.test(n.title)).length, 1, 'reminder sent twice');
  });

  await test('منذ أن عرفنا بعض: حفظ مشترك وتحقق من القيم', async () => {
    assert.equal((await eyad('PATCH', '/api/space', { since: { at: '2023-06-16 15:36' } })).status, 400);
    ok(await eyad('PATCH', '/api/space', { since: { at: '2023-06-16T15:36:25', note: 'أول لقاء ❤️', show_home: true } }), 'since');
    const d = ok(await rawan('GET', '/api/bootstrap'), 'b').space.since;
    assert.equal(d.at, '2023-06-16T15:36:25'); assert.equal(d.tz, 'Asia/Riyadh'); assert.equal(d.note, 'أول لقاء ❤️'); assert.equal(d.updated_by, E.id);
    const s = ok(await rawan('GET', `/api/sync?since=${cursor}`), 's'); assert.equal(s.space.since.at, '2023-06-16T15:36:25');
  });
  await test('إعداد الأرقام العربية يُحفظ', async () => { ok(await rawan('PATCH', '/api/me', { settings: { numerals: 'arab' } }), 'n'); assert.equal(ok(await rawan('GET', '/api/me'), 'me').settings.numerals, 'arab'); ok(await rawan('PATCH', '/api/me', { settings: { numerals: 'nope' } }), 'n2'); assert.equal(ok(await rawan('GET', '/api/me'), 'me').settings.numerals, 'arab'); });

  console.log('\nالأقسام الجديدة (v3)');
  await test('أمنيات: روان تضيف، إياد يختارها مفاجأة (تبقى مخفية عنها) ثم يحققها', async () => {
    const w = ok(await rawan('POST', '/api/c/wishes', { title: 'عشاء على البحر', category: 'restaurant', importance: 'high' }), 'w').item;
    assert.equal(w.status, 'open');
    assert.equal((await rawan('POST', `/api/act/wishes/${w.id}`, { action: 'pick' })).status, 403);
    assert.equal((await eyad('PATCH', `/api/c/wishes/${w.id}`, { picked_by: E.id })).status, 200); // protected field silently ignored
    assert.equal(ok(await rawan('GET', '/api/bootstrap'), 'b').data.wishes.find((x) => x.id === w.id).picked_by, null);
    const n0 = ok(await rawan('GET', '/api/notifications'), 'n').items.length;
    const p = ok(await eyad('POST', `/api/act/wishes/${w.id}`, { action: 'pick', surprise: true, pick_date: '2030-02-14', pick_notes: 'حجز طاولة' }), 'pick').item;
    assert.equal(p.picked_by, E.id); assert.equal(p.status, 'chosen');
    const seen = ok(await rawan('GET', '/api/bootstrap'), 'b').data.wishes.find((x) => x.id === w.id);
    assert.equal(seen.status, 'open'); assert.equal(seen.picked_by, null); assert.equal(seen.pick_notes, null);
    assert.equal(ok(await rawan('GET', '/api/notifications'), 'n').items.length, n0, 'surprise must not notify');
    ok(await eyad('POST', `/api/act/wishes/${w.id}`, { action: 'fulfill' }), 'done');
    const after = ok(await rawan('GET', '/api/bootstrap'), 'b').data.wishes.find((x) => x.id === w.id);
    assert.equal(after.status, 'done'); assert.equal(after.picked_by, E.id);
    assert.ok(ok(await rawan('GET', '/api/notifications'), 'n').items.some((x) => x.kind === 'wish_done'));
  });
  await test('طلبات: الرد للمستلم فقط + سجل', async () => {
    const q = ok(await eyad('POST', '/api/c/requests', { title: 'نطلع نتمشى', to_user: R.id, kind: 'outing', status: 'approved' }), 'q').item;
    assert.equal(q.status, 'pending');
    assert.equal((await eyad('POST', `/api/act/requests/${q.id}`, { action: 'respond', status: 'approved' })).status, 403);
    const r = ok(await rawan('POST', `/api/act/requests/${q.id}`, { action: 'respond', status: 'approved', note: 'أكيد ❤️' }), 'r').item;
    assert.equal(r.status, 'approved'); assert.ok(r.responded_at); assert.equal(r.history.length, 2);
    assert.ok(ok(await eyad('GET', '/api/notifications'), 'n').items.some((x) => x.kind === 'request_approved'));
    assert.equal(ok(await eyad('POST', `/api/act/requests/${q.id}`, { action: 'done' }), 'd').item.status, 'done');
  });
  await test('تعهدات: الموافقة من صاحب التعهد فقط مع التوقيت', async () => {
    const c = ok(await rawan('POST', '/api/c/commitments', { title: 'الالتزام بموعد الاتصال', promiser: E.id, status: 'accepted' }), 'c').item;
    assert.equal(c.status, 'pending');
    assert.equal((await rawan('POST', `/api/act/commitments/${c.id}`, { action: 'accept' })).status, 403);
    const a = ok(await eyad('POST', `/api/act/commitments/${c.id}`, { action: 'accept' }), 'a').item;
    assert.equal(a.status, 'accepted'); assert.equal(a.accepted_by, E.id); assert.ok(a.accepted_at);
    const self = ok(await eyad('POST', '/api/c/commitments', { title: 'تعهد ذاتي', promiser: E.id }), 's').item; assert.equal(self.status, 'accepted');
  });
  await test('اتفاقيات: موافقة الطرفين، والتعديل يعيد طلب الموافقة', async () => {
    const g = ok(await eyad('POST', '/api/c/agreements', { title: 'ميزانية السفر', details: '5000', e_approved_at: 'x' }), 'g').item;
    assert.equal(g.e_approved_at, null); assert.equal(g.version, 1);
    ok(await eyad('POST', `/api/act/agreements/${g.id}`, { action: 'approve' }), 'e');
    assert.equal((await eyad('POST', `/api/act/agreements/${g.id}`, { action: 'approve' })).status, 409);
    const both = ok(await rawan('POST', `/api/act/agreements/${g.id}`, { action: 'approve' }), 'r').item;
    assert.ok(both.e_approved_at && both.r_approved_at);
    const ed = ok(await rawan('PATCH', `/api/c/agreements/${g.id}`, { details: '6000' }), 'edit').item;
    assert.equal(ed.e_approved_at, null); assert.equal(ed.r_approved_at, null); assert.equal(ed.version, 2);
    const notes = ok(await eyad('PATCH', `/api/c/agreements/${g.id}`, { notes: 'ملاحظة فقط' }), 'n').item; assert.equal(notes.version, 2);
  });
  await test('ذكرياتنا: كل شخص يكتب تعليقه فقط', async () => {
    const m = ok(await eyad('POST', '/api/c/memories', { title: 'يوم الجمعة', date: '2030-01-10', comment_e: 'يوم جميل', comment_r: 'مزوّر' }), 'm').item;
    assert.equal(m.comment_e, 'يوم جميل'); assert.equal(m.comment_r, null);
    assert.equal(ok(await rawan('PATCH', `/api/c/memories/${m.id}`, { comment_r: 'أحلى يوم', comment_e: 'x' }), 'r').item.comment_e, 'يوم جميل');
  });
  await test('خطة يوم + أنشطة، اعترافات (تعهد + قراءة)، أغراض، تذكير متكرر', async () => {
    const o = ok(await eyad('POST', '/api/c/outings', { title: 'جمعتنا', date: '2030-01-11', start_time: '17:00' }), 'o').item;
    ok(await eyad('POST', '/api/c/outing_items', { outing_id: o.id, time: '18:00', title: 'العشاء', kind: 'restaurant' }), 'i');
    const pl = ok(await eyad('POST', '/api/pledge/agree'), 'p').pledge; assert.ok(pl[E.id].at);
    assert.ok(ok(await rawan('GET', '/api/bootstrap'), 'b').space.pledge[E.id]);
    const c = ok(await rawan('POST', '/api/c/confessions', { body: 'كنت أتمنى نقضي وقتًا أطول', needs_talk: true }), 'c').item;
    assert.equal((await eyad('PATCH', `/api/c/confessions/${c.id}`, { body: 'x' })).status, 403);
    assert.ok(ok(await eyad('POST', `/api/act/confessions/${c.id}`, { action: 'read' }), 'r').item.read_at);
    const n = ok(await rawan('POST', '/api/c/needs', { name: 'شاحن', priority: 'critical' }), 'n').item;
    const b = ok(await eyad('PATCH', `/api/c/needs/${n.id}`, { bought: true, price: 59 }), 'b').item; assert.equal(b.bought_by, E.id);
    const t = new Date(Date.now() + 3 * 3600000 - 60000).toISOString(); 
    ok(await rawan('POST', '/api/c/reminders', { title: 'راجع موضوع الحجز', target: E.id, date: t.slice(0, 10), time: t.slice(11, 16), repeat: 'weekly' }), 'rem');
    await fetch(BASE + '/__scheduled?cron=*/15+*+*+*+*'); await new Promise((r) => setTimeout(r, 800));
    assert.ok(ok(await eyad('GET', '/api/notifications'), 'n').items.some((x) => x.kind === 'reminder' && /راجع موضوع الحجز/.test(x.title)));
    const rem = ok(await eyad('GET', '/api/bootstrap'), 'b').data.reminders.find((x) => x.title === 'راجع موضوع الحجز');
    assert.ok(rem.date > t.slice(0, 10), 'weekly reminder should move to next week');
  });

  console.log('\nالحساب والاستعادة');
  await test('استعادة كلمة المرور برمز الاستعادة', async () => { const c = client(); const d = ok(await c('POST', '/api/auth/recover', { email: 'eyad@example.com', code: recovery.toLowerCase(), password: 'new-password-1' }), 'rec'); assert.ok(d.recovery_code !== recovery); assert.equal((await eyad('GET', '/api/bootstrap')).status, 401); });
  await test('رابط إعادة تعيين من الطرف الآخر', async () => {
    const link = ok(await rawan('POST', '/api/auth/reset-link'), 'l').link; const token = link.split('/reset/')[1];
    const c = client(); ok(await c('POST', '/api/auth/reset', { token, password: 'another-pass-9' }), 'reset');
    assert.equal(ok(await c('GET', '/api/me'), 'me').user.letter, 'E');
    assert.equal((await client()('POST', '/api/auth/reset', { token, password: 'another-pass-0' })).status, 410);
  });
  await test('حذف بياناتي لا يمس بيانات الطرف الآخر', async () => {
    const c = client(); ok(await c('POST', '/api/auth/login', { email: 'eyad@example.com', password: 'another-pass-9' }), 'login');
    ok(await c('POST', '/api/data/wipe', { scope: 'mine', password: 'another-pass-9' }), 'wipe');
    const d = ok(await rawan('GET', '/api/bootstrap'), 'b'); assert.equal(d.data.expenses.length, 0); assert.ok(d.data.honeymoon.length >= 1); assert.equal(d.data.moods.length, 1);
  });
  await test('الصفحة والـ PWA تُخدم مع ترويسات الأمان', async () => { const r = await fetch(BASE + '/'); assert.equal(r.status, 200); assert.ok(r.headers.get('content-security-policy')); const m = await (await fetch(BASE + '/manifest.webmanifest')).json(); assert.equal(m.short_name, 'E&R'); });
}

main().catch((e) => { console.error(e); failed++; }).finally(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) console.log(devLog.split('\n').filter((l) => /error|Error/.test(l)).slice(-15).join('\n'));
  try { process.kill(-dev.pid); } catch { /* already gone */ }
  process.exit(failed ? 1 : 0);
});
