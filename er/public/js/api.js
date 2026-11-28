// Thin fetch wrapper for the E&R API (cookie session + CSRF header).
export class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, { method, credentials: 'same-origin', headers: { 'x-requested-with': 'er', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { throw new ApiError(0, 'لا يوجد اتصال بالإنترنت', 'offline'); }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && data?.code === 'auth') onUnauthorized();
    throw new ApiError(res.status, data?.error || 'حدث خطأ', data?.code);
  }
  return data;
}
export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const del = (p) => api('DELETE', p);

/** Resize an image in the browser (max 1600px, JPEG) so it fits the database row limit, then upload. */
export async function uploadFile(file, { max = 1600, quality = 0.82, isPrivate = false } = {}) {
  let blob = file;
  if (/^image\/(jpeg|png|webp|heic|heif)/.test(file.type) || /\.(heic|jpg|jpeg|png|webp)$/i.test(file.name || '')) {
    try { blob = await resize(file, max, quality); } catch { blob = file; }
  }
  if (blob.size > 1900 * 1024) blob = await resize(file, 1100, 0.7).catch(() => blob);
  if (blob.size > 1900 * 1024) throw new ApiError(413, 'الملف كبير جدًا (الحد 1.9 ميجابايت)');
  const res = await fetch('/api/files' + (isPrivate ? '?private=1' : ''), { method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': 'er', 'content-type': blob.type || 'application/octet-stream' }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'تعذر رفع الملف');
  return data.id;
}
async function resize(file, max, quality) {
  const bmp = await createImageBitmap(file).catch(async () => {
    const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img;
  });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('encode'))), 'image/jpeg', quality));
}
export const fileUrl = (id) => (id ? `/api/files/${encodeURIComponent(id)}` : '');
