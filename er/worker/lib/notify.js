// In-app notifications + Web Push delivery.
import { newId, nowISO } from './util.js';
import { sendPush } from './push.js';
import { parseSettings } from './session.js';

/** kindGroup: a key of settings.notify (tasks, notes, dates, events, trips, plans, shopping, mood). */
export async function notify(ctx, user, { kind, group, title, body = '', link = '#/', actor = null }) {
  if (!user) return;
  const st = parseSettings(user.settings);
  if (group && st.notify[group] === false) return;
  if (st.numerals === 'arab') { const ar = (x) => String(x || '').replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]); title = ar(title); body = ar(body); }
  await ctx.env.DB.prepare('INSERT INTO notifications (id, user_id, kind, title, body, link, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(newId('n_'), user.id, kind, title.slice(0, 200), String(body || '').slice(0, 500), link, actor, nowISO()).run();
  const job = pushTo(ctx, user.id, { title, body, url: '/' + link, tag: kind });
  if (ctx.waitUntil) ctx.waitUntil(job); else await job;
}

export async function pushTo(ctx, userId, message) {
  const { results } = await ctx.env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').bind(userId).all();
  const out = [];
  for (const sub of results) {
    try { out.push(await sendPush(ctx.env, sub, message, ctx.env.PUSH_SUBJECT || 'mailto:noreply@example.com')); }
    catch (e) { out.push('error'); console.log('push failed', String(e)); }
  }
  return out;
}
