// Password hashing, tokens and AES-GCM encryption using WebCrypto.
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
export const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s) => unb64(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4));

export async function sha256(data) {
  const d = typeof data === 'string' ? enc.encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', d));
}
export const sha256hex = async (s) => Array.from(await sha256(s), (x) => x.toString(16).padStart(2, '0')).join('');
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

const PBKDF2_ITER = 100000; // Workers runtime maximum
async function pbkdf2(password, salt, iterations, bits = 256) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, bits));
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(hash)}`;
}
export async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2') return false;
  const h = await pbkdf2(password, unb64(salt), Number(iter));
  return timingSafeEqual(h, unb64(hash));
}

// ---------- Vault encryption (server-held key from a Worker secret) ----------
let cachedKey = null, cachedRaw = null;
async function vaultKey(env) {
  const raw = env.VAULT_KEY;
  if (!raw) return null;
  if (cachedKey && cachedRaw === raw) return cachedKey;
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error('VAULT_KEY must be 32 bytes base64');
  cachedKey = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  cachedRaw = raw;
  return cachedKey;
}
export async function vaultAvailable(env) { try { return !!(await vaultKey(env)); } catch { return false; } }
export async function encryptVault(env, obj) {
  const key = await vaultKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return `v1:${b64(iv)}:${b64(ct)}`;
}
export async function decryptVault(env, s) {
  const key = await vaultKey(env);
  const [v, iv, ct] = String(s).split(':');
  if (v !== 'v1') throw new Error('unknown vault format');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
  return JSON.parse(dec.decode(pt));
}

// ---------- Passphrase encryption for backup files ----------
export async function encryptWithPassphrase(passphrase, plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = await pbkdf2(passphrase, salt, PBKDF2_ITER);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { kdf: 'PBKDF2-SHA256', iterations: PBKDF2_ITER, salt: b64(salt), iv: b64(iv), cipher: 'AES-256-GCM', ciphertext: b64(ct) };
}
export async function decryptWithPassphrase(passphrase, box) {
  const raw = await pbkdf2(passphrase, unb64(box.salt), Number(box.iterations) || PBKDF2_ITER);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ciphertext));
  return dec.decode(pt);
}
