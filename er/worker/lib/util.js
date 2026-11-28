export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export const bad = (msg) => new HttpError(400, msg, 'bad_request');
export const notFound = (msg = 'العنصر غير موجود') => new HttpError(404, msg, 'not_found');
export const forbidden = (msg = 'ليست لديك صلاحية لهذا الإجراء') => new HttpError(403, msg, 'forbidden');

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export const nowISO = () => new Date().toISOString();
export function newId(prefix = '') {
  const b = crypto.getRandomValues(new Uint8Array(10));
  return prefix + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
export async function readJson(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 1024 * 1024) throw new HttpError(413, 'حجم البيانات كبير جدًا');
  try { return await req.json(); } catch { throw bad('صيغة البيانات غير صحيحة'); }
}
export const str = (v, max = 300) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
export function readCookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return v.join('='); }
  return null;
}
