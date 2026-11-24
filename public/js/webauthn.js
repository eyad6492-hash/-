// Fingerprint / device biometrics login (WebAuthn, platform authenticator, ES256).
import { post } from './api.js';
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export async function webauthnRegister(label) {
  const o = await post('/api/auth/webauthn/register-options');
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: unb64u(o.challenge), rp: o.rp,
    user: { id: unb64u(o.user.id), name: o.user.name, displayName: o.user.displayName },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
    attestation: 'none', timeout: 60000,
    excludeCredentials: o.exclude.map((id) => ({ type: 'public-key', id: unb64u(id) })),
  } });
  const r = cred.response;
  if (!r.getPublicKey) throw new Error('هذا المتصفح لا يدعم تسجيل البصمة');
  return post('/api/auth/webauthn/register', {
    challenge_id: o.challenge_id, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.getAuthenticatorData()),
    publicKey: b64u(r.getPublicKey()), alg: r.getPublicKeyAlgorithm(), label,
  });
}
export async function webauthnLogin(username, remember) {
  const o = await post('/api/auth/webauthn/login-options', { username });
  const cred = await navigator.credentials.get({ publicKey: {
    challenge: unb64u(o.challenge), rpId: o.rpId, userVerification: 'required', timeout: 60000,
    allowCredentials: o.allow.map((id) => ({ type: 'public-key', id: unb64u(id) })),
  } });
  const r = cred.response;
  return post('/api/auth/webauthn/login', {
    challenge_id: o.challenge_id, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature), remember,
  });
}
