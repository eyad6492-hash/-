// Web Push (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID) using WebCrypto only.
import { b64url, unb64url } from './crypto.js';

const enc = new TextEncoder();
const concat = (...arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0); const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

/** VAPID key pair, generated once and kept in app_secrets (never exported). */
export async function vapidKeys(env) {
  const row = await env.DB.prepare("SELECT value FROM app_secrets WHERE key = 'vapid'").first();
  if (row) return JSON.parse(row.value);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = b64url(await crypto.subtle.exportKey('raw', kp.publicKey));
  const v = { publicKey: pub, privateJwk: priv };
  await env.DB.prepare("INSERT OR IGNORE INTO app_secrets (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(v)).run();
  return JSON.parse((await env.DB.prepare("SELECT value FROM app_secrets WHERE key = 'vapid'").first()).value);
}

async function vapidAuth(endpoint, keys, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${body}`));
  return `vapid t=${header}.${body}.${b64url(sig)}, k=${keys.publicKey}`;
}

/** Encrypts `payload` for a subscription (aes128gcm). Exported for tests. */
export async function encryptPayload(sub, payload, { salt = crypto.getRandomValues(new Uint8Array(16)), asKeys } = {}) {
  const uaPub = unb64url(sub.p256dh), authSecret = unb64url(sub.auth);
  const as = asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/** Sends one notification. Returns 'ok' | 'gone' | 'error:<status>'. */
export async function sendPush(env, sub, message, subject) {
  const keys = await vapidKeys(env);
  const body = await encryptPayload(sub, JSON.stringify(message));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'normal', authorization: await vapidAuth(sub.endpoint, keys, subject) },
    body,
  });
  if (res.status === 404 || res.status === 410) { await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run(); return 'gone'; }
  return res.ok ? 'ok' : `error:${res.status}`;
}
