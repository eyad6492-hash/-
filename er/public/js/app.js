// E&R — app shell: auth gate, router, bottom navigation, theme, live-sync toasts, PWA registration.
import { get, setUnauthorizedHandler } from './api.js';
import { bootstrap, loadCache, onChange, onRemoteEvent, startSync, stopSync, store, clearCache, person } from './store.js';
import { icon, toast, closeAllSheets, sheetOpen, esc } from './ui.js';
import { quickAdd } from './editors.js';
import { setNumerals } from './numerals.js';
import { startSinceTicker } from './since.js';

const ROUTES = [
  ['', 'home'], ['calendar', 'calendar'], ['calendar/:date', 'calendar'], ['tasks', 'tasks'], ['tasks/:id', 'task'],
  ['plans', 'plans'], ['plans/:month', 'plans'], ['more', 'more'], ['dates', 'dates'], ['mood', 'mood'],
  ['places', 'places'], ['bucket', 'bucket'], ['trips', 'trips'], ['trips/:id', 'trip'], ['honeymoon', 'honeymoon'],
  ['shopping', 'shopping'], ['expenses', 'expenses'], ['notes', 'notes'], ['cycle', 'cycle'], ['settings', 'settings'],
  ['notifications', 'notifications'], ['since', 'since'], ['s/:key', 's'], ['outing/:id', 'outing'], ['anniv', 'anniv'],
];
const AUTH_ROUTES = ['login', 'setup', 'join/:token', 'reset/:token', 'recover'];
const NAV = [['', 'home', 'الرئيسية', 'الرئيسية'], ['calendar', 'calendar', 'التقويم', 'التقويم'], ['tasks', 'tasks', 'المهام', 'المهام'], ['plans', 'plans', 'الخطط', 'الخطط'], ['more', 'more', 'المزيد', 'المزيد']];
const MORE_SECTIONS = new Set(['s', 'outing', 'anniv', 'since', 'dates', 'mood', 'places', 'bucket', 'trips', 'trip', 'honeymoon', 'shopping', 'expenses', 'notes', 'cycle', 'settings', 'notifications', 'more']);

function match(hash, routes) {
  const path = hash.replace(/^#\/?/, '').split('?')[0].replace(/\/$/, '');
  for (const r of routes) {
    const [pat, name] = Array.isArray(r) ? r : [r, r.split('/')[0]];
    const ps = pat.split('/'), hs = path.split('/');
    if (pat === '' ? path !== '' : ps.length !== hs.length) continue;
    const params = {}; let ok = true;
    ps.forEach((p, i) => { if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(hs[i]); else if (p !== hs[i]) ok = false; });
    if (ok) return { name, params, path };
  }
  return null;
}

const app = document.getElementById('app');
let current = null, pageEl = null, mods = {};

async function loadPage(name) { return (mods[name] ||= (await import(`./pages/${name}.js`)).default); }

function shell() {
  app.innerHTML = `<div class="shell"><main id="page"></main></div>
    <nav class="nav" aria-label="التنقل">${NAV.map(([p, ic, en, ar]) => `<a href="#/${p}" data-nav="${p || 'home'}" aria-label="${ar}">${icon(ic)}<span>${en}</span></a>`).join('')}</nav>
    <button class="fab" id="fab" aria-label="إضافة سريعة">${icon('plus')}</button>`;
  pageEl = document.getElementById('page');
  document.getElementById('fab').onclick = () => quickAdd(current?.name === 'calendar' ? current.params.date : null);
}

function setNav(name) {
  const key = MORE_SECTIONS.has(name) ? 'more' : name === 'task' ? 'tasks' : name;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === key));
  document.getElementById('fab')?.classList.toggle('hidden', ['settings', 'cycle', 'notifications', 'shopping', 'more', 'since', 's', 'outing', 'anniv'].includes(name));
}

async function render(full = true) {
  if (!current || !pageEl) return;
  const mod = await loadPage(current.name);
  try { await mod.render(pageEl, current.params, { full }); }
  catch (e) { console.error(e); pageEl.innerHTML = `<div class="page"><div class="empty"><span class="en">عذرًا</span>${esc(e.message || 'حدث خطأ')}</div></div>`; }
}

async function route() {
  const hash = location.hash || '#/';
  const authRoute = match(hash, AUTH_ROUTES.map((r) => [r, 'auth']));
  if (authRoute) {
    if (store.me && !authRoute.path.startsWith('join') && !authRoute.path.startsWith('reset')) { location.hash = '#/'; return; }
    stopSync(); pageEl = null;
    const m = await loadPage('auth');
    return m.render(app, { mode: authRoute.path.split('/')[0], ...authRoute.params });
  }
  if (!store.me) { location.hash = '#/login'; return; }
  if (!pageEl) shell();
  closeAllSheets();
  current = match(hash, ROUTES) || { name: 'home', params: {} };
  setNav(current.name);
  pageEl.classList.add('anim'); clearTimeout(route._t); route._t = setTimeout(() => pageEl?.classList.remove('anim'), 400);
  await render(true);
  window.scrollTo({ top: 0 });
}

let rerenderT = null;
const typing = () => { const a = document.activeElement; return a && pageEl?.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value; };
function queueRender() { clearTimeout(rerenderT); rerenderT = setTimeout(() => { if (!pageEl || !current) return; if (typing()) { document.activeElement.addEventListener('blur', queueRender, { once: true }); return; } applyTheme(); render(false); }, 60); }
onChange(queueRender);

// friendly live-sync toast when the partner changes something
const VERB = { create: ['أضاف', 'أضافت'], update: ['عدّل', 'عدّلت'], delete: ['حذف', 'حذفت'] };
const WHAT = { wishes: 'أمنية', outings: 'خطة خروج', memories: 'ذكرى', visited: 'مكانًا زرناه', appointments: 'موعدًا', daily_tasks: 'مهمة يومية', cravings: 'رغبة', confessions: 'اعترافًا', upsets: 'موقفًا', joys: 'إلى دليله', urgent: 'أمرًا عاجلًا', requests: 'طلبًا', commitments: 'تعهدًا', agreements: 'اتفاقية', needs: 'غرضًا', reminders: 'تذكيرًا', tasks: 'مهمة', events: 'موعدًا', dates: 'مناسبة', plans: 'خطة', notes: 'رسالة', shopping: 'للمقاضي', expenses: 'مصروفًا', places: 'مكانًا', bucket: 'أمنية', trips: 'رحلة', honeymoon: 'وجهة', moods: 'مزاجه' };
onRemoteEvent((events) => {
  const shown = events.filter((e) => e.op === 'create' && WHAT[e.col]).slice(-2);
  for (const e of shown) {
    const p = person(e.actor); if (!p) continue;
    const verb = VERB[e.op][p.letter === 'R' ? 1 : 0];
    const what = e.col === 'moods' ? (p.letter === 'R' ? 'مزاجها' : 'مزاجه') : WHAT[e.col];
    toast(`${p.name} ${verb} ${what}${e.title && e.col !== 'moods' ? ': ' + e.title : ''}`);
  }
});

export function applyTheme() {
  if (store.me?.settings?.numerals) setNumerals(store.me.settings.numerals);
  const t = store.me?.settings?.theme || localStorage.getItem('er-theme') || 'auto';
  try { localStorage.setItem('er-theme', t); } catch { /* ignore */ }
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151312' : '#FAF7F2');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

export async function afterLogin() {
  await bootstrap();
  applyTheme();
  startSync();
  location.hash = '#/';
  pageEl = null;
  await route();
}
export async function logoutLocal() {
  stopSync(); clearCache(); store.me = null; store.ready = false; pageEl = null;
  location.hash = '#/login';
}
setUnauthorizedHandler(() => { if (store.me) { toast('انتهت الجلسة — سجّل الدخول مجددًا', 'err'); logoutLocal(); } });

window.addEventListener('hashchange', () => { route(); });

async function start() {
  const hash = location.hash || '#/';
  const isAuthLink = /^#\/(join|reset)\//.test(hash);
  const cached = !isAuthLink && loadCache();
  if (cached) { applyTheme(); route(); }
  try {
    const st = await get('/api/auth/status');
    if (!st.user) {
      if (store.me) { clearCache(); store.me = null; pageEl = null; }
      if (!isAuthLink && !/^#\/(login|setup|recover)/.test(hash)) location.hash = st.setup_needed ? '#/setup' : '#/login';
      else route();
      return;
    }
    await bootstrap(); applyTheme(); startSync();
    if (!cached || isAuthLink) route();
  } catch (e) {
    if (!cached) app.innerHTML = `<div class="auth"><div class="mark"><div class="logo">E<i>&amp;</i>R</div><p>${esc(e.message || 'تعذر الاتصال')}</p></div><a class="btn block" href="/">إعادة المحاولة</a></div>`;
    else toast('أنت غير متصل — تعرض آخر نسخة محفوظة', 'err');
  }
}
start();
startSinceTicker();

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen()) history.back(); });
