// Private file storage. Uses an R2 bucket when the FILES binding exists, otherwise stores
// the bytes in D1 in 900 KB chunks. Files are only ever served through the authorised API.
import { HttpError, bad, newId, nowISO } from './util.js';
import { sha256hex } from './crypto.js';

const CHUNK = 900 * 1024;
export const LIMITS = { invoice: 6e6, payment_proof: 6e6, avatar: 2e6, report_pdf: 25e6 };

function sniff(bytes) {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return null;
}

export async function putFile(ctx, { kind, ownerUserId, bytes, visible = 1 }) {
  if (!(kind in LIMITS)) throw bad('نوع ملف غير معروف');
  if (!bytes?.length) throw bad('الملف فارغ');
  if (bytes.length > LIMITS[kind]) throw new HttpError(413, 'حجم الملف أكبر من المسموح');
  const mime = sniff(bytes);
  const okTypes = kind === 'report_pdf' ? ['application/pdf'] : ['image/jpeg', 'image/png', 'image/webp'];
  if (!mime || !okTypes.includes(mime)) throw bad(kind === 'report_pdf' ? 'الملف ليس PDF صالحاً' : 'الملف ليس صورة صالحة (JPG / PNG / WEBP)');
  const id = newId('f_');
  const db = ctx.env.DB;
  const storage = ctx.env.FILES ? 'r2' : 'd1';
  if (storage === 'r2') await ctx.env.FILES.put(id, bytes, { httpMetadata: { contentType: mime } });
  const stmts = [db.prepare('INSERT INTO files (id, kind, owner_user_id, visible_to_owner, mime, size, storage, sha256, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, kind, ownerUserId, visible ? 1 : 0, mime, bytes.length, storage, await sha256hex(bytes), ctx.user?.id ?? null, nowISO())];
  if (storage === 'd1') {
    for (let i = 0, k = 0; i < bytes.length; i += CHUNK, k++) {
      stmts.push(db.prepare('INSERT INTO file_chunks (file_id, idx, data) VALUES (?,?,?)').bind(id, k, bytes.subarray(i, i + CHUNK)));
    }
  }
  // D1 batches are transactional; keep each batch modest
  for (let i = 0; i < stmts.length; i += 8) await db.batch(stmts.slice(i, i + 8));
  return { id, mime, size: bytes.length };
}

export async function readFileBytes(ctx, meta) {
  if (meta.storage === 'r2') {
    if (!ctx.env.FILES) throw new HttpError(500, 'مخزن الملفات R2 غير مربوط');
    const obj = await ctx.env.FILES.get(meta.id);
    if (!obj) throw new HttpError(404, 'الملف غير موجود');
    return new Uint8Array(await obj.arrayBuffer());
  }
  const { results } = await ctx.env.DB.prepare('SELECT data FROM file_chunks WHERE file_id = ? ORDER BY idx').bind(meta.id).all();
  const parts = results.map((r) => new Uint8Array(r.data));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Ensures a just-uploaded file belongs to the expected owner/kind and is not already used. */
export async function claimFile(ctx, fileId, { kind, ownerUserId }) {
  const f = await ctx.env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(String(fileId || '')).first();
  if (!f || f.kind !== kind) throw bad('الملف المرفق غير صالح — أعد رفع الصورة');
  if (f.attached) throw bad('هذا الملف مستخدم مسبقاً');
  if (ownerUserId && f.owner_user_id !== ownerUserId) throw bad('الملف المرفق لا يخص هذا الموظف');
  return f;
}
