// Files, profile & settings, cycle lock, notifications, push, honeymoon → trip, export and data deletion.
import { COLLECTIONS, COL_NAMES } from '../schema.js';
import { HttpError, bad, json, newId, notFound, nowISO, readJson, str } from '../lib/util.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { parseSettings, users } from '../lib/session.js';
import { vapidKeys } from '../lib/push.js';
import { pushTo } from '../lib/notify.js';
import { getRow, logChange, parseRow, requireCycleAccess, visible } from './data.js';
import { coordsFromText } from '../../public/js/geo.js';

const MAP_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.|maps\.)?google\.[a-z.]+)$/;

const MAX_FILE = 1900 * 1024; // D1 row limit is 2 MB — images are resized in the browser before upload
const MIME_OK = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;

async function checkPassword(ctx, password) {
  const u = await ctx.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(ctx.user.id).first();
  if (!(await verifyPassword(String(password || ''), u.password_hash))) throw new HttpError(401, 'كلمة المرور غير صحيحة');
}

function mergeSettings(cur, patch) {
  const s = { ...cur };
  if (['auto', 'light', 'dark'].includes(patch.theme)) s.theme = patch.theme;
  if (['g', 'h', 'both'].includes(patch.date_display)) s.date_display = patch.date_display;
  if (typeof patch.tz === 'string' && patch.tz.length < 60) { try { new Intl.DateTimeFormat('en', { timeZone: patch.tz }); s.tz = patch.tz; } catch { /* ignore */ } }
  if (Number.isInteger(patch.remind_hour) && patch.remind_hour >= 0 && patch.remind_hour <= 23) s.remind_hour = patch.remind_hour;
  if ([0, 1, 6].includes(patch.week_start)) s.week_start = patch.week_start;
  if (patch.notify && typeof patch.notify === 'object') for (const k of Object.keys(s.notify)) if (k in patch.notify) s.notify[k] = !!patch.notify[k];
  if (patch.cycle && typeof patch.cycle === 'object') {
    for (const k of ['enabled', 'show_home', 'fertility', 'hide']) if (k in patch.cycle) s.cycle[k] = !!patch.cycle[k];
    if (['none', 'prediction'].includes(patch.cycle.share)) s.cycle.share = patch.cycle.share;
  }
  return s;
}

export const miscRoutes = {
  // ---------- files (photos, receipts, attachments) ----------
  'POST /api/files': async (ctx) => {
    const mime = (ctx.req.headers.get('content-type') || '').split(';')[0];
    if (!MIME_OK.test(mime)) throw bad('نوع الملف غير مدعوم (صور أو PDF فقط)');
    const buf = await ctx.req.arrayBuffer();
    if (!buf.byteLength) throw bad('الملف فارغ');
    if (buf.byteLength > MAX_FILE) throw new HttpError(413, 'الملف أكبر من 1.9 ميجابايت');
    const id = newId('f_');
    await ctx.env.DB.prepare('INSERT INTO files (id, mime, size, data, private, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, mime, buf.byteLength, buf, ctx.url.searchParams.get('private') ? 1 : 0, ctx.user.id, nowISO()).run();
    return json({ id }, 201);
  },
  'GET /api/files/:id': async (ctx) => {
    const f = await ctx.env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(ctx.params.id).first();
    if (!f || (f.private && f.created_by !== ctx.user.id)) throw notFound('الملف غير موجود');
    return new Response(f.data, { headers: { 'content-type': f.mime, 'cache-control': 'private, max-age=31536000, immutable', 'content-disposition': f.mime === 'application/pdf' ? 'inline; filename="file.pdf"' : 'inline' } });
  },

  // ---------- profile / settings ----------
  'PATCH /api/me': async (ctx) => {
    const b = await readJson(ctx.req);
    const cur = parseSettings(ctx.user.settings);
    const next = b.settings ? mergeSettings(cur, b.settings) : cur;
    const name = b.name !== undefined ? str(b.name, 40) : ctx.user.name;
    if (!name) throw bad('الاسم مطلوب');
    let avatar = ctx.user.avatar_id;
    if (b.avatar_id !== undefined) avatar = b.avatar_id && /^f_[a-f0-9]+$/.test(b.avatar_id) ? b.avatar_id : null;
    let email = ctx.user.email;
    if (b.email !== undefined && b.email !== email) {
      await checkPassword(ctx, b.password);
      email = str(b.email, 120)?.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw bad('البريد الإلكتروني غير صحيح');
      if (await ctx.env.DB.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').bind(email, ctx.user.id).first()) throw bad('هذا البريد مستخدم');
    }
    await ctx.env.DB.prepare('UPDATE users SET name = ?, avatar_id = ?, email = ?, settings = ? WHERE id = ?').bind(name, avatar, email, JSON.stringify(next), ctx.user.id).run();
    await logChange(ctx, 'users', ctx.user.id, 'update');
    return json({ ok: true });
  },
  'PATCH /api/space': async (ctx) => {
    const b = await readJson(ctx.req);
    if (b.currency !== undefined) {
      const c = str(b.currency, 8) || 'ر.س';
      await ctx.env.DB.prepare('INSERT INTO space_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('currency', JSON.stringify(c)).run();
    }
    await logChange(ctx, 'space', 'space', 'update');
    return json({ ok: true });
  },

  // ---------- cycle tracker lock (server-enforced) ----------
  'GET /api/cycle/status': async (ctx) => {
    const s = parseSettings(ctx.user.settings);
    return json({ has_pin: !!s.cycle.pin_hash, unlocked: !s.cycle.pin_hash || (ctx.session.cycle_until || '') > nowISO() });
  },
  'POST /api/cycle/unlock': async (ctx) => {
    const b = await readJson(ctx.req);
    const s = parseSettings(ctx.user.settings);
    if (!s.cycle.pin_hash) return json({ ok: true });
    const key = 'cyclepin:' + ctx.user.id;
    const since = new Date(Date.now() - 15 * 60000).toISOString();
    if ((await ctx.env.DB.prepare('SELECT COUNT(*) n FROM login_attempts WHERE k = ? AND at > ?').bind(key, since).first()).n >= 6) throw new HttpError(429, 'محاولات كثيرة — حاول بعد ربع ساعة');
    if (!(await verifyPassword(String(b.pin || ''), s.cycle.pin_hash))) {
      await ctx.env.DB.prepare('INSERT INTO login_attempts (k, at) VALUES (?, ?)').bind(key, nowISO()).run();
      throw new HttpError(401, 'الرمز غير صحيح');
    }
    await ctx.env.DB.prepare('UPDATE sessions SET cycle_until = ? WHERE token_hash = ?').bind(new Date(Date.now() + 10 * 60000).toISOString(), ctx.session.token_hash).run();
    return json({ ok: true });
  },
  'POST /api/cycle/lock': async (ctx) => {
    await ctx.env.DB.prepare('UPDATE sessions SET cycle_until = NULL WHERE token_hash = ?').bind(ctx.session.token_hash).run();
    return json({ ok: true });
  },
  'POST /api/cycle/pin': async (ctx) => {
    const b = await readJson(ctx.req);
    await checkPassword(ctx, b.password);
    const s = parseSettings(ctx.user.settings);
    if (b.pin) { if (!/^\d{4,8}$/.test(String(b.pin))) throw bad('الرمز من 4 إلى 8 أرقام'); s.cycle.pin_hash = await hashPassword(String(b.pin)); }
    else s.cycle.pin_hash = null;
    await ctx.env.DB.prepare('UPDATE users SET settings = ? WHERE id = ?').bind(JSON.stringify(s), ctx.user.id).run();
    await logChange(ctx, 'users', ctx.user.id, 'update');
    return json({ ok: true });
  },

  // ---------- notifications ----------
  'GET /api/notifications': async (ctx) => {
    const { results } = await ctx.env.DB.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 80').bind(ctx.user.id).all();
    return json({ items: results });
  },
  'POST /api/notifications/read': async (ctx) => {
    const b = await readJson(ctx.req);
    if (Array.isArray(b.ids) && b.ids.length) await ctx.env.DB.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${b.ids.slice(0, 100).map(() => '?').join(',')})`).bind(ctx.user.id, ...b.ids.slice(0, 100)).run();
    else await ctx.env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').bind(ctx.user.id).run();
    return json({ ok: true });
  },
  'DELETE /api/notifications': async (ctx) => {
    await ctx.env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(ctx.user.id).run();
    return json({ ok: true });
  },

  // ---------- web push ----------
  'GET /api/push/key': async (ctx) => json({ publicKey: (await vapidKeys(ctx.env)).publicKey }),
  'POST /api/push/subscribe': async (ctx) => {
    const b = await readJson(ctx.req);
    const s = b.subscription || {};
    if (!/^https:\/\//.test(s.endpoint || '') || !s.keys?.p256dh || !s.keys?.auth) throw bad('اشتراك غير صالح');
    await ctx.env.DB.prepare('INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth')
      .bind(newId('ps_'), ctx.user.id, s.endpoint, s.keys.p256dh, s.keys.auth, nowISO()).run();
    return json({ ok: true });
  },
  'POST /api/push/unsubscribe': async (ctx) => {
    const b = await readJson(ctx.req);
    await ctx.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(String(b.endpoint || ''), ctx.user.id).run();
    return json({ ok: true });
  },
  'POST /api/push/test': async (ctx) => {
    const r = await pushTo(ctx, ctx.user.id, { title: 'E&R', body: 'الإشعارات تعمل على هذا الجهاز ✓', url: '/#/', tag: 'test' });
    return json({ sent: r.filter((x) => x === 'ok').length, total: r.length });
  },

  // ---------- honeymoon → real trip ----------
  'POST /api/honeymoon/:id/convert': async (ctx) => {
    const d = await getRow(ctx, 'honeymoon', ctx.params.id);
    if (d.trip_id && await ctx.env.DB.prepare('SELECT id FROM trips WHERE id = ?').bind(d.trip_id).first()) return json({ trip_id: d.trip_id, existed: true });
    const { results: items } = await ctx.env.DB.prepare('SELECT * FROM honey_items WHERE destination_id = ? OR destination_id IS NULL').bind(d.id).all();
    const now = nowISO(), me = ctx.user.id, tripId = newId('tr_');
    const lines = (sec) => items.filter((i) => i.section === sec).map((i) => `• ${i.title}${i.date ? ' — ' + i.date : ''}${i.amount ? ' — ' + i.amount : ''}${i.url ? '\n  ' + i.url : ''}${i.notes ? '\n  ' + i.notes : ''}`).join('\n') || null;
    const dates = items.filter((i) => i.date).map((i) => i.date).sort();
    const firstUrl = (sec) => items.find((i) => i.section === sec && i.url)?.url || null;
    const stmts = [ctx.env.DB.prepare('INSERT INTO trips (id, name, destination, start_date, end_date, budget, hotel_url, flight_url, flight_details, hotel_details, notes, image_id, status, honeymoon, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(tripId, `شهر العسل — ${d.name}`, [d.name, d.country].filter(Boolean).join('، '), dates[0] || null, dates[dates.length - 1] || null, d.budget, firstUrl('hotel'), firstUrl('flight'), lines('flight'), lines('hotel'), d.notes, d.image_id, 'planning', 1, me, me, now, now)];
    const map = { activity: 'activity', restaurant: 'restaurant', sight: 'place', itinerary: 'itinerary', packing: 'checklist', shopping: 'checklist', booking: 'checklist', budget: 'expense' };
    const childIds = [];
    for (const i of items) {
      const sec = map[i.section]; if (!sec) continue;
      const cid = newId('tr_'); childIds.push(cid);
      stmts.push(ctx.env.DB.prepare('INSERT INTO trip_items (id, trip_id, section, title, date, amount, url, notes, done, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(cid, tripId, sec, i.title, i.date, i.amount, i.url, i.notes, i.done || 0, me, me, now, now));
    }
    stmts.push(ctx.env.DB.prepare('UPDATE honeymoon SET chosen = CASE WHEN id = ? THEN 1 ELSE 0 END, trip_id = CASE WHEN id = ? THEN ? ELSE trip_id END, updated_at = ?').bind(d.id, d.id, tripId, now));
    await ctx.env.DB.batch(stmts);
    await logChange(ctx, 'trips', tripId, 'create', `شهر العسل — ${d.name}`);
    for (const c of childIds) await logChange(ctx, 'trip_items', c, 'create');
    const { results: all } = await ctx.env.DB.prepare('SELECT id FROM honeymoon').all();
    for (const r of all) await logChange(ctx, 'honeymoon', r.id, 'update');
    return json({ trip_id: tripId });
  },

  // ---------- export & delete ----------
  'GET /api/export': async (ctx) => {
    const out = { app: 'E&R', exported_at: nowISO(), by: ctx.user.name, data: {} };
    for (const c of COL_NAMES) {
      const def = COLLECTIONS[c];
      const stmt = ctx.env.DB.prepare(`SELECT * FROM ${c}${def.ownerOnly ? ' WHERE created_by = ?' : ''}`);
      const { results } = await (def.ownerOnly ? stmt.bind(ctx.user.id) : stmt).all();
      out.data[c] = results.map((r) => visible(c, parseRow(c, r), ctx.user.id));
    }
    return new Response(JSON.stringify(out, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="e-and-r-${nowISO().slice(0, 10)}.json"`, 'cache-control': 'no-store' } });
  },
  'POST /api/data/wipe': async (ctx) => {
    const b = await readJson(ctx.req);
    await checkPassword(ctx, b.password);
    const me = ctx.user.id;
    if (b.scope === 'cycle') {
      await requireCycleAccess(ctx);
      await ctx.env.DB.prepare('DELETE FROM cycles WHERE created_by = ?').bind(me).run();
      await logChange(ctx, 'cycles', '*', 'reset');
    } else if (b.scope === 'mine') {
      await ctx.env.DB.batch([...COL_NAMES.map((c) => ctx.env.DB.prepare(`DELETE FROM ${c} WHERE created_by = ?`).bind(me)), ctx.env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(me)]);
      await logChange(ctx, 'space', '*', 'reset');
    } else if (b.scope === 'all') {
      if (b.confirm !== 'حذف') throw bad('اكتب كلمة «حذف» للتأكيد');
      await ctx.env.DB.batch([...COL_NAMES.map((c) => ctx.env.DB.prepare(`DELETE FROM ${c}`)), ctx.env.DB.prepare('DELETE FROM notifications'), ctx.env.DB.prepare('DELETE FROM files WHERE id NOT IN (SELECT avatar_id FROM users WHERE avatar_id IS NOT NULL)'), ctx.env.DB.prepare('DELETE FROM reminder_log')]);
      await logChange(ctx, 'space', '*', 'reset');
    } else throw bad('نطاق الحذف غير معروف');
    return json({ ok: true });
  },
  // Resolve a (short) Google Maps link to coordinates so places can be shown on our map.
  'GET /api/resolve-map': async (ctx) => {
    let target = ctx.url.searchParams.get('url') || '';
    for (let i = 0; i < 6; i++) {
      let u; try { u = new URL(target); } catch { throw bad('رابط غير صالح'); }
      if (u.protocol !== 'https:' || !MAP_HOSTS.test(u.hostname)) throw bad('يُقبل رابط Google Maps فقط');
      const direct = coordsFromText(u.href); if (direct) return json(direct);
      const r = await fetch(u.href, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (E&R maps link resolver)', 'accept-language': 'en' } });
      const loc = r.headers.get('location');
      if (loc) { target = new URL(loc, u.href).href; continue; }
      const html = (await r.text()).slice(0, 400000);
      const c = coordsFromText(html.match(/https:\/\/www\.google\.[a-z.]+\/maps\/[^"'\s]+/)?.[0] || '') || coordsFromText((html.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || [])[0] || '') || coordsFromText(html.match(/@-?\d+\.\d+,-?\d+\.\d+/)?.[0] || '');
      return json(c || { lat: null, lng: null });
    }
    return json({ lat: null, lng: null });
  },
  'GET /api/people': async (ctx) => json({ users: (await users(ctx.env)).map((u) => ({ id: u.id, name: u.name, letter: u.letter })) }),
};
