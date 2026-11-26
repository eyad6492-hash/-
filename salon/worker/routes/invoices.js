import { HttpError, bad, forbidden, json, newId, notFound, nowISO, readJson, str, numOrNull, intOrNull, dateOrNull, oneOf } from '../lib/util.js';
import { auditStmt, need, needAny, notifyStmts, managersWith, assertOpen } from '../lib/context.js';
import { putFile, readFileBytes, claimFile, LIMITS } from '../lib/files.js';
import { rateFor } from './employees.js';
import { splitAmount, round2, INVOICE_STATUS, countedStatuses } from '../../public/js/shared.js';

const canSeeAll = (ctx) => ctx.perms.has('invoices.view') || ctx.perms.has('invoices.review');

async function getInvoice(ctx, id) {
  const inv = await ctx.env.DB.prepare('SELECT i.*, u.full_name, r.full_name AS reviewer_name FROM invoices i JOIN users u ON u.id = i.user_id LEFT JOIN users r ON r.id = i.reviewed_by WHERE i.id = ?').bind(id).first();
  if (!inv) throw notFound('الفاتورة غير موجودة');
  if (inv.user_id !== ctx.user.id && !canSeeAll(ctx)) throw notFound('الفاتورة غير موجودة');
  return inv;
}

async function attachImages(ctx, rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const { results } = await ctx.env.DB.prepare(`SELECT invoice_id, file_id FROM invoice_images WHERE invoice_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`).bind(...ids).all();
  for (const r of rows) r.images = results.filter((x) => x.invoice_id === r.id).map((x) => x.file_id);
  return rows;
}

function listQuery(ctx, { userId }) {
  const q = ctx.url.searchParams;
  const where = [], args = [];
  if (userId) { where.push('i.user_id = ?'); args.push(userId); }
  if (dateOrNull(q.get('from'))) { where.push('i.work_date >= ?'); args.push(q.get('from')); }
  if (dateOrNull(q.get('to'))) { where.push('i.work_date <= ?'); args.push(q.get('to')); }
  if (q.get('status') && q.get('status') in INVOICE_STATUS) { where.push('i.status = ?'); args.push(q.get('status')); }
  if (q.get('pending') === '1') where.push("(i.status IN ('registered','under_review') OR i.edit_request IS NOT NULL)");
  if (q.get('q')) { const n = Number(q.get('q')); if (Number.isFinite(n)) { where.push('(i.number = ? OR i.amount = ?)'); args.push(n, n); } }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

async function totalsFor(ctx, where, args) {
  const st = countedStatuses(ctx.settings.invoice_count_mode);
  const t = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN i.status IN (${st.map(() => '?').join(',')}) THEN i.amount END),0) AS sales,
            COALESCE(SUM(CASE WHEN i.status IN (${st.map(() => '?').join(',')}) THEN i.barber_share END),0) AS barber_share,
            COALESCE(SUM(CASE WHEN i.status IN (${st.map(() => '?').join(',')}) THEN i.shop_share END),0) AS shop_share
       FROM invoices i ${where}`,
  ).bind(...st, ...st, ...st, ...args).first();
  return { count: t.count, sales: round2(t.sales), barber_share: round2(t.barber_share), shop_share: round2(t.shop_share) };
}

export const invoiceRoutes = {
  // ---------- private file upload / download ----------
  'POST /api/files': async (ctx) => {
    const q = ctx.url.searchParams;
    const kind = q.get('kind');
    let owner = null, visible = 1;
    if (kind === 'invoice') {
      const p = await ctx.env.DB.prepare('SELECT works_shifts FROM employee_profiles WHERE user_id = ?').bind(ctx.user.id).first();
      if (!p?.works_shifts) throw forbidden('حسابك غير مفعل لتسجيل الفواتير');
      owner = ctx.user.id;
    } else if (kind === 'payment_proof') { need(ctx, 'payments.manage'); owner = q.get('user_id') || null; }
    else if (kind === 'avatar') { need(ctx, 'employees.manage'); }
    else if (kind === 'report_pdf') { need(ctx, 'employee_reports.manage'); owner = q.get('user_id') || null; visible = 0; }
    else throw bad('نوع ملف غير معروف');
    const len = Number(ctx.req.headers.get('content-length') || 0);
    if (len > (LIMITS[kind] || 0)) throw new HttpError(413, 'حجم الملف أكبر من المسموح');
    const bytes = new Uint8Array(await ctx.req.arrayBuffer());
    const f = await putFile(ctx, { kind, ownerUserId: owner, bytes, visible });
    return json(f);
  },

  'GET /api/files/:id': async (ctx) => {
    const f = await ctx.env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(ctx.params.id).first();
    if (!f) throw notFound('الملف غير موجود');
    const own = f.owner_user_id === ctx.user.id && f.visible_to_owner;
    const ok = own
      || (f.kind === 'invoice' && (canSeeAll(ctx) || ctx.perms.has('employee_reports.manage')))
      || (f.kind === 'payment_proof' && ctx.perms.has('payments.view'))
      || (f.kind === 'avatar' && ctx.user.role !== 'barber')
      || (f.kind === 'report_pdf' && ctx.perms.has('employee_reports.manage'))
      || (!f.owner_user_id && f.created_by === ctx.user.id);
    if (!ok) throw notFound('الملف غير موجود');
    const bytes = await readFileBytes(ctx, f);
    const dl = ctx.url.searchParams.get('download');
    return new Response(bytes, {
      headers: {
        'content-type': f.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
        'content-disposition': `${dl ? 'attachment' : 'inline'}; filename="${dl ? String(dl).replace(/[^\w.\-]/g, '_') : f.id}"`,
      },
    });
  },

  // ---------- barber: register an invoice (image mandatory) ----------
  'POST /api/invoices': async (ctx) => {
    const p = await ctx.env.DB.prepare('SELECT works_shifts, status FROM employee_profiles WHERE user_id = ?').bind(ctx.user.id).first();
    if (!p?.works_shifts) throw forbidden('حسابك غير مفعل لتسجيل الفواتير');
    if (p.status === 'suspended' || p.status === 'left') throw forbidden('حسابك موقوف عن العمل');
    const b = await readJson(ctx.req);
    const amount = round2(numOrNull(b.amount) ?? 0);
    if (!(amount > 0)) throw bad('أدخل مبلغ الفاتورة');
    if (amount > 100000) throw bad('المبلغ كبير بشكل غير منطقي — تأكد من القيمة');
    const images = (Array.isArray(b.image_file_ids) ? b.image_file_ids : [b.image_file_id]).filter(Boolean).slice(0, 4);
    if (!images.length) throw bad('صورة الفاتورة إلزامية — صوّر الفاتورة أو اخترها من جهازك');
    for (const fid of images) await claimFile(ctx, fid, { kind: 'invoice', ownerUserId: ctx.user.id });
    const date = ctx.today;
    await assertOpen(ctx, ctx.user.id, date, null);
    const rate = await rateFor(ctx.env.DB, ctx.user.id, date);
    if (!rate) throw bad('لم تحدد الإدارة نسبتك بعد');
    const split = splitAmount(amount, rate.barber_rate);
    const db = ctx.env.DB;
    const num = (await db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'invoice' RETURNING value").first()).value;
    const id = newId('inv_'), now = nowISO();
    const status = ctx.settings.invoice_initial_status === 'under_review' ? 'under_review' : 'registered';
    const row = {
      id, number: num, user_id: ctx.user.id, work_date: date, amount,
      service_type: str(b.service_type, 80), service_count: intOrNull(b.service_count), notes: str(b.notes, 500),
      barber_rate: rate.barber_rate, shop_rate: rate.shop_rate, ...split, status, created_at: now, updated_at: now,
    };
    if (row.service_count !== null && (row.service_count < 1 || row.service_count > 50)) throw bad('عدد الخدمات غير منطقي');
    const keys = Object.keys(row);
    const reviewers = await managersWith(ctx, 'invoices.review');
    await db.batch([
      db.prepare(`INSERT INTO invoices (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((k) => row[k])),
      ...images.flatMap((fid) => [
        db.prepare('INSERT INTO invoice_images (id, invoice_id, file_id, created_at) VALUES (?,?,?,?)').bind(newId('ii_'), id, fid, now),
        db.prepare('UPDATE files SET attached = 1 WHERE id = ? AND attached = 0').bind(fid),
      ]),
      auditStmt(ctx, 'تسجيل فاتورة', { entity: 'invoice', entity_id: id, subject: ctx.user.id, after: row }),
      ...notifyStmts(ctx, reviewers, { type: 'invoice', title: `فاتورة جديدة #${num} — ${ctx.user.full_name}`, body: `${amount} ${ctx.settings.currency_symbol}`, link: `#/invoices/${id}` }),
    ]);
    return json({ invoice: row });
  },

  'GET /api/me/invoices': async (ctx) => {
    const { where, args } = listQuery(ctx, { userId: ctx.user.id });
    const { results } = await ctx.env.DB.prepare(`SELECT i.* FROM invoices i ${where} ORDER BY i.created_at DESC LIMIT 500`).bind(...args).all();
    return json({ items: await attachImages(ctx, results), totals: await totalsFor(ctx, where, args) });
  },

  'GET /api/invoices': async (ctx) => {
    if (!canSeeAll(ctx)) throw forbidden();
    const { where, args } = listQuery(ctx, { userId: ctx.url.searchParams.get('user_id') || null });
    const { results } = await ctx.env.DB.prepare(`SELECT i.*, u.full_name FROM invoices i JOIN users u ON u.id = i.user_id ${where} ORDER BY i.created_at DESC LIMIT 500`).bind(...args).all();
    return json({ items: await attachImages(ctx, results), totals: await totalsFor(ctx, where, args) });
  },

  'GET /api/invoices/:id': async (ctx) => {
    const inv = await getInvoice(ctx, ctx.params.id);
    await attachImages(ctx, [inv]);
    const { results } = await ctx.env.DB.prepare("SELECT action, user_name, created_at, reason, after_json FROM audit_logs WHERE entity = 'invoice' AND entity_id = ? ORDER BY created_at").bind(inv.id).all();
    return json({ invoice: inv, history: results, counted: countedStatuses(ctx.settings.invoice_count_mode).includes(inv.status) });
  },

  'POST /api/invoices/:id/review': async (ctx) => {
    need(ctx, 'invoices.review');
    const inv = await getInvoice(ctx, ctx.params.id);
    const b = await readJson(ctx.req);
    const status = oneOf(b.status, ['approved', 'rejected', 'needs_edit', 'under_review'], null);
    if (!status) throw bad('حالة غير صحيحة');
    const note = str(b.note, 500);
    if ((status === 'rejected' || status === 'needs_edit') && !note) throw bad('اكتب ملاحظة توضح السبب للحلاق');
    const overridden = await assertOpen(ctx, inv.user_id, inv.work_date, b.reason);
    const db = ctx.env.DB, now = nowISO();
    const label = { approved: 'اعتماد', rejected: 'رفض', needs_edit: 'طلب تعديل', under_review: 'تحويل للمراجعة' }[status];
    await db.batch([
      db.prepare('UPDATE invoices SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, edit_request = CASE WHEN ? THEN NULL ELSE edit_request END, updated_at = ? WHERE id = ?')
        .bind(status, note, ctx.user.id, now, status === 'needs_edit' || status === 'approved' || status === 'rejected' ? 1 : 0, now, inv.id),
      auditStmt(ctx, `${label} فاتورة`, { entity: 'invoice', entity_id: inv.id, subject: inv.user_id, before: { status: inv.status, review_note: inv.review_note }, after: { status, review_note: note }, reason: overridden ? `بعد الإغلاق: ${b.reason}` : null }),
      ...notifyStmts(ctx, [inv.user_id], {
        type: 'invoice_review', title: `فاتورتك #${inv.number}: ${INVOICE_STATUS[status]}`, body: note || null, link: `#/invoices/${inv.id}`,
      }),
    ]);
    return json({ ok: true });
  },

  // Barber asks the admin to allow a change (invoices are not editable by the barber otherwise)
  'POST /api/invoices/:id/edit-request': async (ctx) => {
    const inv = await getInvoice(ctx, ctx.params.id);
    if (inv.user_id !== ctx.user.id) throw forbidden();
    const b = await readJson(ctx.req);
    const text = str(b.text, 500); if (!text) throw bad('اكتب التعديل المطلوب وسببه');
    if (inv.status === 'approved' || inv.status === 'rejected') {
      // still allowed: the admin decides
    }
    const reviewers = await managersWith(ctx, 'invoices.review');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE invoices SET edit_request = ?, edit_requested_at = ?, updated_at = ? WHERE id = ?').bind(text, nowISO(), nowISO(), inv.id),
      auditStmt(ctx, 'طلب تعديل فاتورة', { entity: 'invoice', entity_id: inv.id, subject: inv.user_id, after: { edit_request: text } }),
      ...notifyStmts(ctx, reviewers, { type: 'invoice_edit_request', title: `طلب تعديل الفاتورة #${inv.number} — ${ctx.user.full_name}`, body: text, link: `#/invoices/${inv.id}` }),
    ]);
    return json({ ok: true });
  },

  // Correction: by the barber only while status = needs_edit; by a reviewer any time (audited).
  'PUT /api/invoices/:id': async (ctx) => {
    const inv = await getInvoice(ctx, ctx.params.id);
    const isOwner = inv.user_id === ctx.user.id;
    const isReviewer = ctx.perms.has('invoices.review');
    if (!isReviewer && !(isOwner && inv.status === 'needs_edit')) throw forbidden('لا يمكن تعديل الفاتورة بعد تسجيلها إلا بعد موافقة الإدارة على طلب التعديل');
    const b = await readJson(ctx.req);
    const overridden = await assertOpen(ctx, inv.user_id, inv.work_date, b.reason);
    const upd = {};
    if ('amount' in b) {
      const amount = round2(numOrNull(b.amount) ?? 0);
      if (!(amount > 0) || amount > 100000) throw bad('مبلغ غير صحيح');
      Object.assign(upd, { amount }, splitAmount(amount, inv.barber_rate)); // rate stays frozen
    }
    if ('service_type' in b) upd.service_type = str(b.service_type, 80);
    if ('service_count' in b) upd.service_count = intOrNull(b.service_count);
    if ('notes' in b) upd.notes = str(b.notes, 500);
    const newImages = (Array.isArray(b.add_image_file_ids) ? b.add_image_file_ids : []).slice(0, 4);
    for (const fid of newImages) await claimFile(ctx, fid, { kind: 'invoice', ownerUserId: inv.user_id });
    if (isOwner && !isReviewer) { upd.status = 'under_review'; upd.edit_request = null; }
    upd.updated_at = nowISO();
    const db = ctx.env.DB;
    const reviewers = isOwner && !isReviewer ? await managersWith(ctx, 'invoices.review') : [];
    await db.batch([
      db.prepare(`UPDATE invoices SET ${Object.keys(upd).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(upd), inv.id),
      ...newImages.flatMap((fid) => [
        db.prepare('INSERT INTO invoice_images (id, invoice_id, file_id, created_at) VALUES (?,?,?,?)').bind(newId('ii_'), inv.id, fid, nowISO()),
        db.prepare('UPDATE files SET attached = 1 WHERE id = ?').bind(fid),
      ]),
      auditStmt(ctx, 'تعديل فاتورة', { entity: 'invoice', entity_id: inv.id, subject: inv.user_id, before: { amount: inv.amount, barber_share: inv.barber_share, shop_share: inv.shop_share, service_type: inv.service_type, notes: inv.notes, status: inv.status }, after: upd, reason: overridden ? `بعد الإغلاق: ${b.reason}` : (b.reason || null) }),
      ...notifyStmts(ctx, reviewers, { type: 'invoice', title: `تم تعديل الفاتورة #${inv.number} — ${inv.full_name}`, body: 'بانتظار المراجعة', link: `#/invoices/${inv.id}` }),
      ...(isOwner ? [] : notifyStmts(ctx, [inv.user_id], { type: 'invoice', title: `عدّلت الإدارة فاتورتك #${inv.number}`, body: b.reason || null, link: `#/invoices/${inv.id}` })),
    ]);
    return json({ ok: true });
  },
};
