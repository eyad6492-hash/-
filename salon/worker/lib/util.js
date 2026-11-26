export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export const bad = (msg) => new HttpError(400, msg, 'bad_request');
export const notFound = (msg = 'العنصر غير موجود') => new HttpError(404, msg, 'not_found');
export const forbidden = (msg = 'ليست لديك صلاحية لهذا الإجراء') => new HttpError(403, msg, 'forbidden');

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const nowISO = () => new Date().toISOString();
export function newId(prefix = '') {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return prefix + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function readJson(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 8 * 1024 * 1024) throw new HttpError(413, 'حجم البيانات كبير جدًا');
  try { return await req.json(); } catch { throw bad('صيغة البيانات غير صحيحة'); }
}

// ---- field coercion ----
export const str = (v, max = 5000) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
export const reqStr = (v, label, max = 300) => { const s = str(v, max); if (!s) throw bad(`الحقل «${label}» مطلوب`); return s; };
export const numOrNull = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); if (!Number.isFinite(n)) throw bad('قيمة رقمية غير صحيحة'); return n; };
export const intOrNull = (v) => { const n = numOrNull(v); return n === null ? null : Math.round(n); };
export const dateOrNull = (v) => { const s = str(v, 10); if (!s) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad('تاريخ غير صحيح'); return s; };
export const oneOf = (v, allowed, def) => (allowed.includes(v) ? v : def);
export const jsonArr = (v) => JSON.stringify(Array.isArray(v) ? v.slice(0, 200) : []);
export const parseArr = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
export const url = (v) => { const s = str(v, 1000); if (!s) return null; if (/^(javascript|data|vbscript):/i.test(s)) throw bad('رابط غير صالح'); return s; };

/** Build an UPDATE statement from a partial object restricted to allowed keys. */
export function buildUpdate(table, id, patch) {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (!keys.length) return null;
  return { sql: `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, args: [...keys.map((k) => patch[k]), id] };
}
export function buildInsert(table, row) {
  const keys = Object.keys(row);
  return { sql: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, args: keys.map((k) => row[k]) };
}
