// Client data store: loads the shared space once, keeps it in sync with the partner (change-log polling)
// and caches it locally so the app opens instantly — data itself always lives in the cloud database.
import { get, post, patch, del } from './api.js';
import { todayIn } from './dates.js';

const CACHE_KEY = 'er-cache-v1';
const POLL_MS = 4000;
const listeners = new Set();
const eventListeners = new Set();

export const store = {
  ready: false,
  cursor: 0,
  me: null, partner: null, partner_cycle: null, space: { currency: 'ر.س' }, unread: 0,
  data: {}, // col -> Map(id -> row)
};

function setData(raw) {
  store.data = {};
  for (const [col, rows] of Object.entries(raw)) store.data[col] = new Map(rows.map((r) => [r.id, r]));
}
function applyMeta(d) {
  for (const k of ['me', 'partner', 'partner_cycle', 'space']) if (k in d) store[k] = d[k];
  if ('unread' in d) store.unread = d.unread;
}
function saveCache() {
  try {
    const data = {}; for (const [c, m] of Object.entries(store.data)) data[c] = [...m.values()];
    localStorage.setItem(CACHE_KEY, JSON.stringify({ cursor: store.cursor, me: store.me, partner: store.partner, partner_cycle: store.partner_cycle, space: store.space, data, uid: store.me?.id }));
  } catch { /* storage full or disabled — the cloud copy is the source of truth */ }
}
let saveT = null;
const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(saveCache, 400); };

let emitT = null;
function emit() { clearTimeout(emitT); emitT = setTimeout(() => listeners.forEach((fn) => fn()), 30); }
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const onRemoteEvent = (fn) => { eventListeners.add(fn); return () => eventListeners.delete(fn); };

export function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!c || !c.me) return false;
    store.cursor = c.cursor; applyMeta(c); setData(c.data); store.ready = true;
    return true;
  } catch { return false; }
}
export function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ } }

export async function bootstrap() {
  const d = await get('/api/bootstrap');
  if (store.me && store.me.id !== d.me.id) clearCache();
  store.cursor = d.cursor; applyMeta(d); setData(d.data); store.ready = true;
  saveCache(); emit();
}

let polling = false, pollTimer = null, inflight = false;
export async function syncNow() {
  if (inflight || !store.ready) return;
  inflight = true;
  try {
    const d = await get(`/api/sync?since=${store.cursor}`);
    if (d.reset) { await bootstrap(); return; }
    let changed = false;
    for (const [col, rows] of Object.entries(d.upserts || {})) { const m = (store.data[col] ||= new Map()); rows.forEach((r) => m.set(r.id, r)); changed = true; }
    for (const [col, ids] of Object.entries(d.deletes || {})) { const m = store.data[col]; if (m) ids.forEach((id) => m.delete(id)); changed = true; }
    if (d.me || d.unread !== store.unread) changed = true;
    applyMeta(d);
    store.cursor = d.cursor;
    if (d.events?.length) eventListeners.forEach((fn) => fn(d.events));
    if (changed) { saveSoon(); emit(); }
  } catch (e) { if (e.status === 401) stopSync(); }
  finally { inflight = false; }
}
export function startSync() {
  if (polling) return; polling = true;
  const tick = () => { if (document.visibilityState === 'visible') syncNow(); pollTimer = setTimeout(tick, POLL_MS); };
  tick();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', syncNow);
}
export function stopSync() { polling = false; clearTimeout(pollTimer); }

// ---------------- reads ----------------
export const all = (col) => [...(store.data[col]?.values() || [])];
export const byId = (col, id) => store.data[col]?.get(id) || null;
export const today = () => todayIn(store.me?.settings?.tz || 'Asia/Riyadh');
export const pref = () => store.me?.settings?.date_display || 'both';
export const people = () => [store.me, store.partner].filter(Boolean);
export function person(id) { if (!id) return null; if (id === store.me?.id) return store.me; if (id === store.partner?.id) return store.partner; return null; }
export function nameOf(id) { if (id === 'both') return 'سوا'; return person(id)?.name || '—'; }
export const isMe = (id) => id === store.me?.id;
export const currency = () => store.space?.currency || 'ر.س';

// ---------------- writes (optimistic for the local copy once the server confirms) ----------------
function put(col, item) { (store.data[col] ||= new Map()).set(item.id, item); saveSoon(); emit(); return item; }
export async function create(col, values) { const { item } = await post(`/api/c/${col}`, values); return put(col, item); }
export async function update(col, id, values) { const { item } = await patch(`/api/c/${col}/${id}`, values); return put(col, item); }
export async function remove(col, id) { await del(`/api/c/${col}/${id}`); store.data[col]?.delete(id); for (const [c, m] of Object.entries(store.data)) if (c !== col) for (const [k, r] of m) if ((c === 'task_comments' && r.task_id === id) || (c === 'trip_items' && r.trip_id === id)) m.delete(k); saveSoon(); emit(); }
export const putItem = put;
export function refreshSoon() { setTimeout(syncNow, 150); }
