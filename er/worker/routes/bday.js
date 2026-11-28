// أعياد ميلادنا — settings (birth dates & messages) and hidden birthday letters.
// A letter is readable by its author anytime, and by its target ONLY on/after the target's birthday
// (in the target's own time zone). The target can never edit it.
import { HttpError, bad, json, newId, nowISO, readJson, str } from '../lib/util.js';
import { parseSettings, partnerOf } from '../lib/session.js';
import { notify } from '../lib/notify.js';
import { logChange } from './data.js';
import { todayIn, toHijri } from '../../public/js/dates.js';
import { birthdaysOf, cfgOf, nextBirthday, DEFAULT_CFG } from '../../public/js/bday.js';

const D = /^\d{4}-\d{2}-\d{2}$/;
async function space(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM space_settings WHERE key IN ('birthdays', 'bday_cfg')").all();
  const o = {}; for (const r of results) { try { o[r.key] = JSON.parse(r.value); } catch { /* skip */ } }
  return o;
}
const put = (env, key, v) => env.DB.prepare('INSERT INTO space_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(v)).run();

export const bdayRoutes = {
  'GET /api/bday': async (ctx) => {
    const P = await partnerOf(ctx.env, ctx.user.id);
    const sp = await space(ctx.env);
    const out = { birthdays: birthdaysOf(sp), cfg: cfgOf(sp), mine: null, for_me: null };
    if (P) {
      const mine = await ctx.env.DB.prepare('SELECT * FROM bday_letters WHERE author = ? AND target = ?').bind(ctx.user.id, P.id).first();
      if (mine) out.mine = { title: mine.title, body: mine.body, unlock_date: mine.unlock_date, opened_at: mine.opened_at, updated_at: mine.updated_at };
      const forMe = await ctx.env.DB.prepare('SELECT * FROM bday_letters WHERE author = ? AND target = ?').bind(P.id, ctx.user.id).first();
      if (forMe) {
        const today = todayIn(parseSettings(ctx.user.settings).tz);
        const unlocked = today >= forMe.unlock_date;
        out.for_me = { exists: true, unlock_date: forMe.unlock_date, unlocked, from: P.name, ...(unlocked ? { title: forMe.title, body: forMe.body, opened_at: forMe.opened_at } : {}) };
      }
    }
    return json(out);
  },

  // birth dates + countdown / celebration messages (shared "admin" panel for the two of us)
  'PATCH /api/bday/config': async (ctx) => {
    const b = await readJson(ctx.req);
    const sp = await space(ctx.env);
    if (b.birthdays) {
      const cur = birthdaysOf(sp);
      for (const L of ['E', 'R']) {
        const v = b.birthdays[L]; if (!v) continue;
        if (v.greg !== undefined) { if (!D.test(v.greg)) throw bad('تاريخ الميلاد الميلادي غير صحيح'); cur[L].greg = v.greg; }
        if (v.hijri !== undefined) { if (!D.test(v.hijri)) throw bad('تاريخ الميلاد الهجري غير صحيح'); cur[L].hijri = v.hijri; }
      }
      await put(ctx.env, 'birthdays', cur);
      // keep letters' unlock dates on the (possibly corrected) birthday
      const { results } = await ctx.env.DB.prepare('SELECT l.id, l.target, u.letter, u.settings FROM bday_letters l JOIN users u ON u.id = l.target WHERE l.opened_at IS NULL').all();
      for (const l of results) await ctx.env.DB.prepare('UPDATE bday_letters SET unlock_date = ? WHERE id = ?').bind(nextBirthday(cur[l.letter].greg, todayIn(parseSettings(l.settings).tz)).date, l.id).run();
    }
    if (b.cfg) {
      const c = { ...cfgOf(sp) };
      if (Array.isArray(b.cfg.rules)) {
        c.rules = b.cfg.rules.slice(0, 30).map((r) => {
          const from = Math.max(0, Math.round(Number(r.from)));
          const to = r.to === null || r.to === '' || r.to === undefined ? null : Math.round(Number(r.to));
          if (!Number.isFinite(from) || (to !== null && (!Number.isFinite(to) || to < from))) throw bad('نطاق الأيام غير صحيح');
          const text = str(r.text, 400); if (!text) throw bad('نص الرسالة مطلوب');
          return { from, to, text };
        });
        if (!c.rules.length) c.rules = DEFAULT_CFG.rules;
      }
      if (b.cfg.today_text !== undefined) c.today_text = str(b.cfg.today_text, 600) || DEFAULT_CFG.today_text;
      if (b.cfg.after_text !== undefined) c.after_text = str(b.cfg.after_text, 600) || DEFAULT_CFG.after_text;
      if (b.cfg.after_days !== undefined) c.after_days = Math.min(30, Math.max(0, Math.round(Number(b.cfg.after_days) || 0)));
      await put(ctx.env, 'bday_cfg', c);
    }
    await logChange(ctx, 'space', 'bday', 'update');
    return json({ ok: true });
  },

  // write / update my letter for my partner — it unlocks on their next birthday
  'PUT /api/bday/letter': async (ctx) => {
    const b = await readJson(ctx.req);
    const P = await partnerOf(ctx.env, ctx.user.id);
    if (!P) throw bad('لا يوجد طرف آخر بعد');
    const body = str(b.body, 8000); if (!body) throw bad('اكتب الرسالة أولًا');
    const bd = birthdaysOf(await space(ctx.env))[P.letter];
    const unlock = nextBirthday(bd.greg, todayIn(parseSettings(P.settings).tz)).date;
    const now = nowISO();
    await ctx.env.DB.prepare(`INSERT INTO bday_letters (id, author, target, title, body, unlock_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(author, target) DO UPDATE SET title = excluded.title, body = excluded.body, unlock_date = excluded.unlock_date, opened_at = NULL, updated_at = excluded.updated_at`)
      .bind(newId('bl_'), ctx.user.id, P.id, str(b.title, 120), body, unlock, now, now).run();
    return json({ ok: true, unlock_date: unlock });
  },
  'DELETE /api/bday/letter': async (ctx) => {
    const P = await partnerOf(ctx.env, ctx.user.id);
    if (P) await ctx.env.DB.prepare('DELETE FROM bday_letters WHERE author = ? AND target = ?').bind(ctx.user.id, P.id).run();
    return json({ ok: true });
  },
  'POST /api/bday/letter/open': async (ctx) => {
    const P = await partnerOf(ctx.env, ctx.user.id);
    const l = P && await ctx.env.DB.prepare('SELECT * FROM bday_letters WHERE author = ? AND target = ?').bind(P.id, ctx.user.id).first();
    if (!l) throw new HttpError(404, 'لا توجد رسالة');
    if (todayIn(parseSettings(ctx.user.settings).tz) < l.unlock_date) throw new HttpError(423, 'رسالتك الخاصة تنتظرك في يوم ميلادك ❤️', 'locked');
    if (!l.opened_at) {
      await ctx.env.DB.prepare('UPDATE bday_letters SET opened_at = ? WHERE id = ?').bind(nowISO(), l.id).run();
      await notify(ctx, P, { kind: 'bday_letter', group: 'dates', title: `${ctx.user.name} ${ctx.user.letter === 'R' ? 'فتحت' : 'فتح'} رسالتك الخاصة ❤️`, body: 'رسالة عيد الميلاد وصلت لقلبه'.replace('لقلبه', ctx.user.letter === 'R' ? 'لقلبها' : 'لقلبه'), link: '#/birthday', actor: ctx.user.id });
    }
    return json({ title: l.title, body: l.body, from: P.name, hijri: toHijri(l.unlock_date) });
  },
};
