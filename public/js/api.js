// Thin API client. Session lives in an HttpOnly cookie; nothing sensitive is stored in JS.
export class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { 'x-requested-with': 'mbcc', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const put = (p, b = {}) => api('PUT', p, b);
export const del = (p) => api('DELETE', p);

// Small in-memory cache for lookups used by many forms (clients list, categories, users)
const cache = new Map();
export async function cached(key, loader, ttl = 30000) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await loader();
  cache.set(key, { v, t: Date.now() });
  return v;
}
export function invalidate(prefix = '') { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); }
export const lookups = {
  clients: () => cached('clients-lite', () => get('/api/clients/lite').then((r) => r.items)),
  categories: () => cached('categories', () => get('/api/categories').then((r) => r.items)),
  users: () => cached('users-lite', () => get('/api/users/lite').then((r) => r.items)),
};
