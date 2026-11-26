// Thin API client. The session lives in an HttpOnly cookie; nothing sensitive is kept in JS storage.
export class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function send(method, path, { body, bytes, type } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'x-requested-with': 'mvs', ...(bytes ? { 'content-type': type || 'application/octet-stream' } : body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: bytes || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'تعذر الاتصال بالخادم — تحقق من الإنترنت');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized();
    throw new ApiError(res.status, (data && data.error) || 'حدث خطأ', data && data.code);
  }
  return data;
}
export const get = (p) => send('GET', p);
export const post = (p, b = {}) => send('POST', p, { body: b });
export const put = (p, b = {}) => send('PUT', p, { body: b });
export const del = (p) => send('DELETE', p);
/** Upload a Blob/File to private storage; returns {id, mime, size}. */
export const upload = (kind, blob, extra = '') => send('POST', `/api/files?kind=${kind}${extra}`, { bytes: blob, type: blob.type });
export const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };

const cache = new Map();
export async function cached(key, loader, ttl = 30000) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await loader(); cache.set(key, { v, t: Date.now() }); return v;
}
export function invalidate(prefix = '') { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); }
export function clearAll() { cache.clear(); }
export const lookups = { staff: () => cached('staff', () => get('/api/employees/lite').then((r) => r.items)) };
