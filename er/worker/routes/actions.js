// Workflow actions that the generic CRUD must not allow directly: approvals, responses, picks, read receipts.
// Each action checks WHO may perform it, records a timestamped history entry, logs a sync change and notifies.
import { COLLECTIONS } from '../schema.js';
import { bad, forbidden, json, nowISO, readJson, str, HttpError } from '../lib/util.js';
import { partnerOf } from '../lib/session.js';
import { notify } from '../lib/notify.js';
import { getRow, logChange, visible } from './data.js';

const D = /^\d{4}-\d{2}-\d{2}$/;
const conflict = (m) => new HttpError(409, m, 'conflict');

async function save(ctx, col, row, patch, action, note) {
  patch.history = JSON.stringify([...(row.history || []), { at: nowISO(), by: ctx.user.id, action, ...(note ? { note: String(note).slice(0, 300) } : {}) }].slice(-50));
  patch.updated_by = ctx.user.id; patch.updated_at = nowISO();
  const keys = Object.keys(patch).filter((k) => k in COLLECTIONS[col].fields || ['updated_by', 'updated_at'].includes(k));
  await ctx.env.DB.prepare(`UPDATE ${col} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => patch[k]), row.id).run();
  await logChange(ctx, col, row.id, 'update', row.title || row.name);
  return getRow(ctx, col, row.id);
}

const ACTIONS = {
  wishes: {
    async pick(ctx, w, b, P, v) {
      if (w.created_by === ctx.user.id) throw forbidden('اختر من أمنيات الطرف الآخر');
      if (w.status === 'done') throw conflict('هذه الأمنية تحققت بالفعل');
      if (w.picked_by && w.picked_by !== ctx.user.id) throw conflict('تم اختيار هذه الأمنية مسبقًا');
      const surprise = b.surprise ? 1 : 0;
      const r = await save(ctx, 'wishes', w, { picked_by: ctx.user.id, picked_at: nowISO(), status: 'chosen', pick_date: D.test(b.pick_date || '') ? b.pick_date : null, pick_notes: str(b.pick_notes, 2000), surprise }, surprise ? 'picked_surprise' : 'picked');
      if (!surprise) await notify(ctx, P, { kind: 'wish_picked', group: 'wishes', title: `${ctx.user.name} ${v('اختار')} أمنية ${v('') ? 'لتحققها' : 'ليحققها'} لك ✨`, body: w.title, link: '#/s/wishes', actor: ctx.user.id });
      return r;
    },
    async progress(ctx, w, b) {
      if (w.picked_by !== ctx.user.id) throw forbidden('فقط من اختار الأمنية يغيّر حالتها');
      if (!['planning', 'chosen'].includes(b.status)) throw bad('حالة غير صحيحة');
      return save(ctx, 'wishes', w, { status: b.status, ...(D.test(b.pick_date || '') ? { pick_date: b.pick_date } : {}), ...(b.pick_notes !== undefined ? { pick_notes: str(b.pick_notes, 2000) } : {}) }, b.status);
    },
    async unpick(ctx, w) {
      if (w.picked_by !== ctx.user.id) throw forbidden();
      return save(ctx, 'wishes', w, { picked_by: null, picked_at: null, pick_date: null, pick_notes: null, surprise: 0, status: 'open' }, 'unpicked');
    },
    async fulfill(ctx, w, b, P, v) {
      if (w.picked_by !== ctx.user.id && w.created_by !== ctx.user.id) throw forbidden();
      const r = await save(ctx, 'wishes', w, { status: 'done', done_date: D.test(b.done_date || '') ? b.done_date : nowISO().slice(0, 10), done_photo: /^f_[a-f0-9]+$/.test(b.done_photo || '') ? b.done_photo : w.done_photo, surprise: 0 }, 'fulfilled');
      if (w.created_by !== ctx.user.id) await notify(ctx, P, { kind: 'wish_done', group: 'wishes', title: `تحققت أمنيتك! ${ctx.user.name} ${v('حقق')}ها لك 🎉`, body: w.title, link: '#/s/wishes', actor: ctx.user.id });
      return r;
    },
  },
  requests: {
    async respond(ctx, q, b, P, v) {
      if (q.to_user !== ctx.user.id) throw forbidden('الرد من صلاحية مستلم الطلب فقط');
      if (!['approved', 'rejected', 'clarify', 'postponed'].includes(b.status)) throw bad('رد غير صحيح');
      const r = await save(ctx, 'requests', q, { status: b.status, response_note: str(b.note, 2000), responded_at: nowISO() }, b.status, b.note);
      const word = { approved: v('وافق') + ' على', rejected: v('اعتذر') + ' عن', clarify: v('طلب') + ' توضيحًا بشأن', postponed: v('أجّل') + ' الرد على' }[b.status];
      await notify(ctx, P, { kind: 'request_' + b.status, group: 'requests', title: `${ctx.user.name} ${word} طلبك`, body: q.title + (b.note ? ` — ${b.note}` : ''), link: '#/s/requests', actor: ctx.user.id });
      return r;
    },
    async done(ctx, q, b, P, v) {
      if (q.status !== 'approved') throw conflict('يمكن تنفيذ الطلب بعد الموافقة عليه');
      const r = await save(ctx, 'requests', q, { status: 'done' }, 'done');
      await notify(ctx, P, { kind: 'request_done', group: 'requests', title: `تم تنفيذ الطلب ✓`, body: q.title, link: '#/s/requests', actor: ctx.user.id });
      return r;
    },
    async reopen(ctx, q) {
      if (q.created_by !== ctx.user.id) throw forbidden();
      return save(ctx, 'requests', q, { status: 'pending', responded_at: null }, 'reopened');
    },
  },
  commitments: {
    async accept(ctx, c, b, P, v) {
      if (c.promiser !== ctx.user.id) throw forbidden('الموافقة من صلاحية صاحب التعهد فقط');
      if (c.status !== 'pending') throw conflict('تم الرد على هذا التعهد');
      const r = await save(ctx, 'commitments', c, { status: 'accepted', accepted_by: ctx.user.id, accepted_at: nowISO() }, 'accepted');
      await notify(ctx, P, { kind: 'commitment_accepted', group: 'commitments', title: `${ctx.user.name} ${v('وافق')} على التعهد ✍️`, body: c.title, link: '#/s/commitments', actor: ctx.user.id });
      return r;
    },
    async reject(ctx, c, b, P, v) {
      if (c.promiser !== ctx.user.id) throw forbidden();
      if (c.status !== 'pending') throw conflict('تم الرد على هذا التعهد');
      const r = await save(ctx, 'commitments', c, { status: 'rejected' }, 'rejected', b.note);
      await notify(ctx, P, { kind: 'commitment_rejected', group: 'commitments', title: `${ctx.user.name} ${v('اعتذر')} عن التعهد`, body: c.title + (b.note ? ` — ${b.note}` : ''), link: '#/s/commitments', actor: ctx.user.id });
      return r;
    },
    async complete(ctx, c) {
      if (c.status !== 'accepted') throw conflict('يكتمل التعهد بعد الموافقة عليه');
      return save(ctx, 'commitments', c, { status: 'completed' }, 'completed');
    },
  },
  agreements: {
    async approve(ctx, a, b, P, v) {
      if (a.closed) throw conflict('الاتفاق مغلق');
      if (a.draft) throw conflict('انشر المسودة أولًا');
      const f = ctx.user.letter === 'R' ? 'r_approved_at' : 'e_approved_at';
      if (a[f]) throw conflict('وافقت على هذه النسخة مسبقًا');
      const r = await save(ctx, 'agreements', a, { [f]: nowISO() }, 'approved');
      const both = r.e_approved_at && r.r_approved_at;
      await notify(ctx, P, { kind: 'agreement_approved', group: 'agreements', title: both ? 'اتفاقيتنا أصبحت فعّالة — وافق الطرفان 🤝' : `${ctx.user.name} ${v('وافق')} على الاتفاقية — بانتظار موافقتك`, body: a.title, link: '#/s/agreements', actor: ctx.user.id });
      return r;
    },
    async publish(ctx, a, b, P) {
      if (!a.draft) return a;
      const r = await save(ctx, 'agreements', a, { draft: 0 }, 'published');
      await notify(ctx, P, { kind: 'agreement_new', group: 'agreements', title: 'اتفاقية جديدة تنتظر موافقتك', body: a.title, link: '#/s/agreements', actor: ctx.user.id });
      return r;
    },
    async complete(ctx, a) {
      if (!(a.e_approved_at && a.r_approved_at)) throw conflict('الاتفاق غير فعّال بعد');
      return save(ctx, 'agreements', a, { closed: 'completed' }, 'completed');
    },
    async cancel(ctx, a, b) { return save(ctx, 'agreements', a, { closed: 'cancelled' }, 'cancelled', b.note); },
    async reopen(ctx, a) { return save(ctx, 'agreements', a, { closed: '' }, 'reopened'); },
  },
  confessions: {
    async read(ctx, c) {
      if (c.created_by === ctx.user.id || c.read_at) return c;
      return save(ctx, 'confessions', c, { read_at: nowISO() }, 'read');
    },
  },
  upsets: {
    async read(ctx, u) {
      if (u.created_by === ctx.user.id || u.status !== 'unread') return u;
      return save(ctx, 'upsets', u, { status: 'read' }, 'read');
    },
  },
};

export const actionRoutes = {
  'POST /api/act/:col/:id': async (ctx) => {
    const col = ctx.params.col, set = ACTIONS[col];
    if (!set) throw bad('لا توجد إجراءات لهذا القسم');
    const b = await readJson(ctx.req);
    const fn = set[b.action];
    if (!fn) throw bad('إجراء غير معروف');
    const row = await getRow(ctx, col, ctx.params.id);
    const P = await partnerOf(ctx.env, ctx.user.id);
    const v = (verb) => (ctx.user.letter === 'R' ? verb + 'ت' : verb);
    const item = await fn(ctx, row, b, P, v);
    return json({ item: visible(col, item, ctx.user.id) });
  },

  // Confessions pledge: each person agrees independently (name + time recorded).
  'POST /api/pledge/agree': async (ctx) => {
    const cur = await ctx.env.DB.prepare("SELECT value FROM space_settings WHERE key = 'pledge'").first();
    const p = cur ? JSON.parse(cur.value) : {};
    if (p[ctx.user.id]) return json({ ok: true, pledge: p });
    p[ctx.user.id] = { name: ctx.user.name, letter: ctx.user.letter, at: nowISO() };
    await ctx.env.DB.prepare("INSERT INTO space_settings (key, value) VALUES ('pledge', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(p)).run();
    await logChange(ctx, 'space', 'pledge', 'update');
    const P = await partnerOf(ctx.env, ctx.user.id);
    if (P) await notify(ctx, P, { kind: 'pledge', group: 'confessions', title: `${ctx.user.name} ${ctx.user.letter === 'R' ? 'وافقت' : 'وافق'} على تعهد التفاهم 🤍`, body: p[P.id] ? 'وافق الطرفان — قسم الاعترافات جاهز' : 'بانتظار موافقتك لفتح قسم الاعترافات', link: '#/s/confessions', actor: ctx.user.id });
    return json({ ok: true, pledge: p });
  },
};
