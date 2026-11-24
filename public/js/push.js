// Mobile notifications (Web Push) — subscribe this device and report its state.
import { get, post } from './api.js';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));

export async function pushStatus() {
  if (!supported()) return { supported: false, on: false, label: 'هذا المتصفح لا يدعم إشعارات الجوال' };
  if (Notification.permission === 'denied') return { supported: true, on: false, label: 'الإشعارات محظورة — اسمح بها من إعدادات المتصفح' };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? { supported: true, on: true, label: 'الإشعارات مفعّلة على هذا الجهاز' } : { supported: true, on: false, label: 'غير مفعّلة على هذا الجهاز' };
}

export async function enablePush() {
  if (!supported()) throw new Error('هذا المتصفح لا يدعم إشعارات الجوال');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('لم يتم السماح بالإشعارات');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await get('/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await post('/api/push/subscribe', { subscription: sub.toJSON(), label: /Android/.test(navigator.userAgent) ? 'Android' : 'جهاز' });
}

export async function disablePush() {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await post('/api/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
}
