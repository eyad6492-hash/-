import { html, raw, icon, $, $$, mount, toast, sheet, setCurrency, avatar, esc } from './ui.js';
import { get, post, setUnauthorizedHandler, clearAll } from './api.js';
import { ROLES } from './shared.js';

export const state = { user: null, perms: new Set(), salon: {}, today: null, unread: 0, installEvt: null };
export const can = (p) => state.perms.has(p);
export const canAny = (...p) => p.some((x) => state.perms.has(x));
export const isManager = () => state.user && state.user.role !== 'barber';
export const worksShifts = () => !!state.user?.works_shifts;

const root = $('#app');

// ---------------- Routing ----------------
const R = (p, load, opts = {}) => ({ p, load, ...opts });
const ROUTES = [
  R('/me', () => import('./pages/me.js'), { self: true }),
  R('/me/invoices', () => import('./pages/my-invoices.js'), { self: true }),
  R('/me/dues', () => import('./pages/my-dues.js')),
  R('/me/attendance', () => import('./pages/my-attendance.js')),
  R('/me/leaves', () => import('./pages/my-leaves.js')),
  R('/me/reports', () => import('./pages/my-reports.js')),
  R('/me/reports/:id', () => import('./pages/report-view.js')),
  R('/invoices/:id', () => import('./pages/invoice.js')),
  R('/notifications', () => import('./pages/notifications.js')),
  R('/install', () => import('./pages/install.js')),
  R('/account', () => import('./pages/account.js')),
  R('/dashboard', () => import('./pages/dashboard.js'), { perm: ['dashboard.view'] }),
  R('/employees', () => import('./pages/employees.js'), { perm: ['employees.view', 'employees.manage'] }),
  R('/employees/:id', () => import('./pages/employee.js'), { perm: ['employees.view', 'employees.manage'] }),
  R('/attendance', () => import('./pages/attendance.js'), { perm: ['attendance.view'] }),
  R('/invoices', () => import('./pages/invoices.js'), { perm: ['invoices.view', 'invoices.review'] }),
  R('/dues', () => import('./pages/dues.js'), { perm: ['payments.view'] }),
  R('/dues/:id', () => import('./pages/dues-employee.js'), { perm: ['payments.view'] }),
  R('/reports', () => import('./pages/reports.js'), { perm: ['reports.view'] }),
  R('/emp-reports', () => import('./pages/emp-reports.js'), { perm: ['employee_reports.manage'] }),
  R('/emp-reports/:id', () => import('./pages/report-view.js'), { perm: ['employee_reports.manage'] }),
  R('/leaves', () => import('./pages/leaves.js'), { perm: ['leaves.manage'] }),
  R('/closures', () => import('./pages/closures.js'), { perm: ['closures.manage', 'closures.override'] }),
  R('/audit', () => import('./pages/audit.js'), { perm: ['audit.view'] }),
  R('/settings', () => import('./pages/settings.js'), { perm: ['settings.manage'] }),
].map((r) => {
  const names = [];
  const re = new RegExp('^' + r.p.replace(/:[a-z]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$');
  return { ...r, re, names, static: !names.length };
}).sort((a, b) => Number(b.static) - Number(a.static));

export function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, q] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(q || '')) };
}
export function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
export const refresh = () => render();

// ---------------- Menu ----------------
function menu() {
  const items = [];
  if (can('dashboard.view')) items.push({ href: '#/dashboard', label: 'لوحة التحكم', ic: 'grid' });
  if (worksShifts()) {
    items.push({ sec: isManager() ? 'حسابي كحلاق' : null, href: '#/me', label: 'الرئيسية', ic: 'home' });
    items.push({ href: '#/me/invoices', label: 'فواتيري', ic: 'receipt' });
    items.push({ href: '#/me/dues', label: 'مستحقاتي', ic: 'wallet' });
    items.push({ href: '#/me/attendance', label: 'سجل حضوري', ic: 'clock' });
  }
  if (worksShifts() || !isManager()) {
    items.push({ href: '#/me/leaves', label: 'إجازاتي', ic: 'palm' });
    items.push({ href: '#/me/reports', label: 'تقاريري', ic: 'fileCheck' });
  }
  const adm = [
    { href: '#/employees', label: 'الموظفون', ic: 'users', perm: ['employees.view', 'employees.manage'] },
    { href: '#/attendance', label: 'الحضور والانصراف', ic: 'mapPin', perm: ['attendance.view'] },
    { href: '#/invoices', label: 'مراجعة الفواتير', ic: 'receipt', perm: ['invoices.view', 'invoices.review'] },
    { href: '#/dues', label: 'المستحقات والدفعات', ic: 'banknote', perm: ['payments.view'] },
    { href: '#/reports', label: 'التقارير العامة', ic: 'chart', perm: ['reports.view'] },
    { href: '#/emp-reports', label: 'تقارير الموظفين', ic: 'file', perm: ['employee_reports.manage'] },
    { href: '#/leaves', label: 'الإجازات', ic: 'palm', perm: ['leaves.manage'] },
    { href: '#/closures', label: 'إغلاق الأيام والفترات', ic: 'closeLock', perm: ['closures.manage', 'closures.override'] },
    { href: '#/audit', label: 'سجل العمليات', ic: 'history', perm: ['audit.view'] },
    { href: '#/settings', label: 'الإعدادات والموقع', ic: 'settings', perm: ['settings.manage'] },
  ].filter((m) => canAny(...m.perm));
  if (adm.length) { adm[0] = { ...adm[0], sec: 'الإدارة' }; items.push(...adm); }
  items.push({ sec: 'عام', href: '#/notifications', label: 'الإشعارات', ic: 'bell' });
  items.push({ href: '#/install', label: 'تثبيت التطبيق', ic: 'phoneApp' });
  items.push({ href: '#/account', label: 'حسابي وكلمة المرور', ic: 'user' });
  return items;
}

function bottomItems() {
  if (!isManager()) return [
    { href: '#/me', label: 'الرئيسية', ic: 'home' }, { href: '#/me/invoices', label: 'فواتيري', ic: 'receipt' },
    { href: '#/me/dues', label: 'مستحقاتي', ic: 'wallet' }, { href: '#/me/attendance', label: 'الحضور', ic: 'clock' },
    { href: '#more', label: 'المزيد', ic: 'menu' },
  ];
  const list = [];
  if (can('dashboard.view')) list.push({ href: '#/dashboard', label: 'الرئيسية', ic: 'grid' });
  if (worksShifts()) list.push({ href: '#/me', label: 'دوامي', ic: 'scissors' });
  if (can('attendance.view')) list.push({ href: '#/attendance', label: 'الحضور', ic: 'mapPin' });
  if (canAny('invoices.view', 'invoices.review')) list.push({ href: '#/invoices', label: 'الفواتير', ic: 'receipt' });
  if (can('payments.view')) list.push({ href: '#/dues', label: 'المستحقات', ic: 'banknote' });
  return [...list.slice(0, 4), { href: '#more', label: 'المزيد', ic: 'menu' }];
}

function shell() {
  const u = state.user;
  const items = menu();
  mount(root, html`
    <div class="shell">
      <aside class="side">
        <img class="logo" src="/img/logo.jpg" alt="Mr. Vibe Salon">
        <nav>${items.map((m) => html`${m.sec ? html`<div class="sec">${m.sec}</div>` : ''}<a href="${m.href}" data-nav>${icon(m.ic)}<span>${m.label}</span></a>`)}</nav>
        <div class="me">${avatar(u)}<div style="min-width:0;flex:1"><b style="display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.full_name}</b><small class="muted">${ROLES[u.role]?.label}</small></div>
          <button class="icon-btn" data-logout title="تسجيل الخروج">${icon('logout')}</button></div>
      </aside>
      <header class="topbar">
        <div class="brand"><img src="/icons/icon-96.png" alt=""><div><b id="page-title">Mr. Vibe Salon</b><small>مستر فايب</small></div></div>
        <a class="icon-btn" href="#/notifications" aria-label="الإشعارات">${icon('bell')}<span class="dot hidden" id="unread"></span></a>
      </header>
      <main class="content" id="view"></main>
      <nav class="bottom-nav">${bottomItems().map((m) => html`<a href="${m.href}" data-nav>${icon(m.ic)}<span>${m.label}</span></a>`)}</nav>
    </div>`);
  $('[data-logout]').addEventListener('click', logout);
  $$('.bottom-nav a[href="#more"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); moreSheet(); }));
}

function moreSheet() {
  sheet({
    title: 'القائمة',
    body: html`<div class="list">${menu().map((m) => html`<a class="row" href="${m.href}" data-close>${icon(m.ic)}<div class="main"><div class="t">${m.label}</div></div>${icon('chevL', 'sm')}</a>`)}
      <button class="row" data-out style="width:100%;color:var(--red);cursor:pointer">${icon('logout')}<div class="main" style="text-align:start"><div class="t">تسجيل الخروج</div></div></button></div>`,
    onMount: (el) => el.querySelector('[data-out]').addEventListener('click', logout),
  });
}

export function setTitle(t) { const el = $('#page-title'); if (el) el.textContent = t; document.title = `${t} — Mr. Vibe Salon`; }

function homeHash() { return can('dashboard.view') ? '#/dashboard' : '#/me'; }

let renderSeq = 0;
async function render() {
  if (!state.user) return;
  const { path, query } = parseHash();
  if (path === '/' || path === '') { location.replace(homeHash()); return; }
  const view = $('#view');
  if (!view) return;
  const route = ROUTES.find((r) => r.re.test(path));
  $$('[data-nav]').forEach((a) => { const h = a.getAttribute('href').slice(1); a.classList.toggle('active', h === path || (h !== '/me' && h.length > 1 && path.startsWith(h + '/'))); });
  if (!route) { mount(view, html`<div class="empty">${icon('alert')}<div>الصفحة غير موجودة</div></div>`); return; }
  if (route.perm && !canAny(...route.perm)) { mount(view, html`<div class="empty">${icon('lock')}<div>ليست لديك صلاحية لهذه الصفحة</div></div>`); return; }
  if (route.self && !worksShifts()) { location.replace(homeHash()); return; }
  const m = path.match(route.re);
  const params = {}; route.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
  const seq = ++renderSeq;
  view.innerHTML = '<div class="skel" style="height:120px"></div><div class="skel"></div><div class="skel"></div>';
  window.scrollTo(0, 0);
  try {
    const mod = await route.load();
    if (seq !== renderSeq) return;
    await mod.render(view, { params, query, isCurrent: () => seq === renderSeq });
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    mount(view, html`<div class="empty">${icon('alert')}<div>${e.message || 'تعذر تحميل الصفحة'}</div><div style="margin-top:12px"><button class="btn sm" data-reload>${icon('refresh', 'sm')} إعادة المحاولة</button></div></div>`);
    view.querySelector('[data-reload]').addEventListener('click', () => render());
  }
}

// ---------------- Notifications badge ----------------
export function setUnread(n) {
  state.unread = n;
  const d = $('#unread'); if (!d) return;
  d.textContent = n > 99 ? '99+' : String(n); d.classList.toggle('hidden', !n);
  if ('setAppBadge' in navigator) { (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); }
}
let pollTimer = null;
async function pollUnread() {
  if (!state.user || document.hidden) return;
  try { setUnread((await get('/api/notifications/unread')).unread); } catch { /* offline */ }
}

// ---------------- Auth screens ----------------
function authFrame(inner) {
  return html`<div class="auth"><div class="auth-card">
    <img class="auth-logo" src="/img/logo.jpg" alt="Mr. Vibe Salon – مستر فايب">
    <h1>نظام إدارة الصالون</h1>
    <div class="panel">${inner}</div>
    <div class="foot">Mr. Vibe Salon – مستر فايب</div></div></div>`;
}

function loginScreen(status) {
  if (status.setup_required) return setupScreen(status);
  mount(root, authFrame(html`
    <form class="form-grid" id="login" autocomplete="on">
      <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" inputmode="email" autocomplete="username" required dir="ltr" placeholder="name@example.com"></label>
      <label class="field"><span>كلمة المرور</span><input name="password" type="password" autocomplete="current-password" required dir="ltr"></label>
      <label class="check"><input type="checkbox" name="remember"> تذكرني على هذا الجهاز</label>
      <div class="err-box hidden" id="err"></div>
      <button class="btn primary lg block" type="submit">${icon('login')} تسجيل الدخول</button>
      <p class="muted" style="margin:0;font-size:12.5px;text-align:center">نسيت كلمة المرور؟ تواصل مع مدير الصالون لإعادة تعيينها.</p>
    </form>`));
  const f = $('#login');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; $('#err').classList.add('hidden');
    try {
      const r = await post('/api/auth/login', { email: f.email.value, password: f.password.value, remember: f.remember.checked });
      await afterLogin(r.user);
    } catch (err) { $('#err').textContent = err.message; $('#err').classList.remove('hidden'); }
    finally { btn.disabled = false; }
  });
}

function setupScreen(status) {
  mount(root, authFrame(html`
    <h3 style="margin:0 0 6px">إنشاء حساب المدير</h3>
    <p class="muted" style="margin:0 0 14px;font-size:13px">يظهر هذا مرة واحدة فقط عند أول تشغيل. أدخل رمز الإعداد (SETUP_TOKEN) المحفوظ على الخادم.</p>
    ${status.setup_enabled ? html`<form class="form-grid" id="setup">
      <label class="field"><span>رمز الإعداد</span><input name="setup_token" required dir="ltr" autocomplete="off"></label>
      <label class="field"><span>الاسم الكامل</span><input name="full_name" required></label>
      <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" required dir="ltr" autocomplete="username"></label>
      <label class="field"><span>كلمة المرور</span><input name="password" type="password" required dir="ltr" autocomplete="new-password"><small>8 أحرف على الأقل وتحتوي حروفاً وأرقاماً</small></label>
      <div class="err-box hidden" id="err"></div>
      <button class="btn primary lg block" type="submit">إنشاء الحساب</button></form>`
    : html`<div class="err-box">لم يتم ضبط رمز الإعداد SETUP_TOKEN على الخادم بعد.</div>`}`));
  $('#setup')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await post('/api/auth/setup', { setup_token: f.setup_token.value, full_name: f.full_name.value, email: f.email.value, password: f.password.value });
      await afterLogin(r.user);
    } catch (err) { $('#err').textContent = err.message; $('#err').classList.remove('hidden'); }
  });
}

function mustChangeScreen() {
  mount(root, authFrame(html`
    <h3 style="margin:0 0 6px">تعيين كلمة مرور جديدة</h3>
    <p class="muted" style="margin:0 0 14px;font-size:13px">مرحباً ${state.user.full_name}، لحماية حسابك اختر كلمة مرور خاصة بك قبل المتابعة.</p>
    <form class="form-grid" id="pw">
      <label class="field"><span>كلمة المرور المؤقتة</span><input name="current" type="password" required dir="ltr" autocomplete="current-password"></label>
      <label class="field"><span>كلمة المرور الجديدة</span><input name="next" type="password" required dir="ltr" autocomplete="new-password"><small>8 أحرف على الأقل وتحتوي حروفاً وأرقاماً</small></label>
      <div class="err-box hidden" id="err"></div>
      <button class="btn primary lg block" type="submit">حفظ والمتابعة</button>
      <button class="btn ghost block" type="button" data-out>تسجيل الخروج</button></form>`));
  $('[data-out]').addEventListener('click', logout);
  $('#pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/api/auth/password', { current: e.target.current.value, next: e.target.next.value }); const me = await get('/api/auth/me'); await afterLogin(me.user); toast('تم تحديث كلمة المرور'); }
    catch (err) { $('#err').textContent = err.message; $('#err').classList.remove('hidden'); }
  });
}

async function afterLogin(user) {
  state.user = user; state.perms = new Set(user.permissions);
  if (user.must_change_password) return mustChangeScreen();
  shell();
  if (!location.hash || location.hash === '#/' || location.hash === '#/login') location.replace(homeHash());
  render();
  pollUnread();
  clearInterval(pollTimer); pollTimer = setInterval(pollUnread, 60000);
}

export async function logout() {
  try { await post('/api/auth/logout'); } catch { /* ignore */ }
  clearAll();
  // Make sure nothing from the previous user stays in memory / DOM
  try { sessionStorage.clear(); } catch { /* ignore */ }
  location.replace('/#/');
  location.reload();
}

setUnauthorizedHandler(() => { if (state.user) { state.user = null; clearAll(); boot(); } });
window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollUnread(); });

// ---------------- PWA ----------------
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvt = e; document.dispatchEvent(new Event('installable')); });
window.addEventListener('appinstalled', () => { state.installEvt = null; toast('تم تثبيت التطبيق ✓'); });
if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  navigator.serviceWorker?.register('/sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          const t = document.createElement('div'); t.className = 'toasts';
          t.innerHTML = '<div class="toast" style="pointer-events:auto">يتوفر تحديث جديد للتطبيق <button class="btn sm primary" id="upd">تحديث</button></div>';
          document.body.appendChild(t);
          t.querySelector('#upd').addEventListener('click', () => { w.postMessage('skipWaiting'); location.reload(); });
        }
      });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60e3);
  }).catch(() => {});
}

async function boot() {
  try {
    const st = await get('/api/auth/status');
    state.salon = st.salon; state.today = st.today; setCurrency(st.salon?.currency);
    if (st.user) await afterLogin(st.user); else loginScreen(st);
  } catch (e) {
    mount(root, authFrame(html`<div class="err-box">${e.message}</div><button class="btn block" style="margin-top:12px" data-reload>إعادة المحاولة</button>`));
    $('[data-reload]')?.addEventListener('click', () => location.reload());
  } finally {
    const sp = $('#splash'); if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 450); }
  }
}
boot();
