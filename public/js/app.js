import { html, raw, icon, $, $$, mount, toast, sheet, esc, setCurrency, debounce, logo } from './ui.js';
import { get, post, setUnauthorizedHandler, invalidate } from './api.js';

export const state = { user: null, perms: new Set(), settings: {}, app: {}, alerts: 0 };
export const can = (p) => state.perms.has(p);
export const avatarSrc = () => state.settings.identity_image || state.app.identity_image || '/img/avatar.jpg';
export const identitySrc = () => state.settings.identity_image || state.app.identity_image || '/img/identity.jpg';

const root = $('#app');

// ---------------- Routing ----------------
const ROUTES = [
  ['/', () => import('./pages/dashboard.js')],
  ['/clients', () => import('./pages/clients.js')],
  ['/clients/:id', () => import('./pages/client.js')],
  ['/categories', () => import('./pages/categories.js')],
  ['/followup', () => import('./pages/followup.js')],
  ['/tasks', () => import('./pages/tasks.js')],
  ['/subscriptions', () => import('./pages/subscriptions.js')],
  ['/payments', () => import('./pages/payments.js')],
  ['/campaigns', () => import('./pages/campaigns.js')],
  ['/campaigns/:id', () => import('./pages/campaign.js')],
  ['/reports', () => import('./pages/reports.js')],
  ['/reports/new', () => import('./pages/report-new.js')],
  ['/reports/:id', () => import('./pages/report.js')],
  ['/reports/:id/edit', () => import('./pages/report-new.js')],
  ['/quotes', () => import('./pages/quotes.js')],
  ['/quotes/new', () => import('./pages/quote-edit.js')],
  ['/quotes/:id', () => import('./pages/quote.js')],
  ['/quotes/:id/edit', () => import('./pages/quote-edit.js')],
  ['/calendar', () => import('./pages/calendar.js')],
  ['/archive', () => import('./pages/archive.js')],
  ['/activity', () => import('./pages/activity.js')],
  ['/vault', () => import('./pages/vault.js')],
  ['/backup', () => import('./pages/backup.js')],
  ['/settings', () => import('./pages/settings.js')],
  ['/users', () => import('./pages/users.js')],
  ['/search', () => import('./pages/search.js')],
].map(([p, load]) => {
  const names = [];
  const re = new RegExp('^' + p.replace(/:[a-z]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$');
  return { p, re, names, load, static: !names.length };
}).sort((a, b) => Number(b.static) - Number(a.static));

export function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
export function refresh() { render(); }

const MENU = [
  { href: '#/', label: 'الرئيسية', ic: 'home' },
  { href: '#/clients', label: 'العملاء', ic: 'users', perm: 'clients.view' },
  { href: '#/categories', label: 'الأنشطة والتصنيفات', ic: 'store', perm: 'clients.view' },
  { href: '#/followup', label: 'المتابعة اليومية', ic: 'calendarCheck', perm: 'followups.manage' },
  { href: '#/tasks', label: 'المهام', ic: 'checkCircle', perm: 'tasks.manage' },
  { href: '#/subscriptions', label: 'الاشتراكات', ic: 'subs', perm: 'clients.view' },
  { href: '#/payments', label: 'المدفوعات والتحصيل', ic: 'coins', perm: 'payments.view' },
  { href: '#/campaigns', label: 'الحملات الإعلانية', ic: 'megaphone', perm: 'campaigns.view' },
  { href: '#/reports', label: 'تقارير العملاء', ic: 'chart', perm: ['reports.view', 'reports.create'] },
  { href: '#/quotes', label: 'عروض الأسعار', ic: 'file', perm: 'quotes.view' },
  { href: '#/calendar', label: 'التقويم', ic: 'calendar', perm: 'clients.view' },
  { href: '#/vault', label: 'خزنة الحسابات', ic: 'vault', perm: 'vault.view' },
  { href: '#/archive', label: 'العملاء السابقون', ic: 'archive', perm: 'clients.view' },
  { href: '#/activity', label: 'سجل النشاط', ic: 'history', perm: 'activity.view' },
  { href: '#/backup', label: 'النسخ الاحتياطي', ic: 'cloud', perm: 'data.export' },
  { href: '#/users', label: 'المستخدمون والصلاحيات', ic: 'shield', perm: 'users.manage' },
  { href: '#/settings', label: 'الإعدادات', ic: 'settings' },
];
const allowed = (m) => !m.perm || (Array.isArray(m.perm) ? m.perm.some(can) : can(m.perm));

function shell() {
  const nav = [
    { href: '#/', label: 'الرئيسية', ic: 'home' },
    { href: '#/clients', label: 'العملاء', ic: 'users', perm: 'clients.view' },
    { href: '#/tasks', label: 'المهام', ic: 'checkSquare', perm: 'tasks.manage' },
    { href: '#/reports', label: 'التقارير', ic: 'bars', perm: ['reports.view', 'reports.create'] },
  ].filter(allowed);
  mount(root, html`<div class="shell">
    <aside class="drawer" aria-label="القائمة">
      <div class="who">
        <img class="avatar lg" src="${avatarSrc()}" alt="">
        <div class="brand-title">Media Buyer <span>Control Center</span></div>
        <small>${state.user.display_name} • ${roleLabel(state.user.role)}</small>
      </div>
      <nav class="menu">${MENU.filter(allowed).map((m) => html`<a href="${m.href}" data-href="${m.href}">${icon(m.ic)}<span>${m.label}</span></a>`)}
        <hr><a href="#" data-logout>${icon('logout')}<span>تسجيل الخروج</span></a></nav>
    </aside>
    <div class="drawer-backdrop" data-drawer-close></div>
    <header class="topbar">
      <button class="icon-btn menu-btn" data-drawer aria-label="القائمة">${icon('menu')}</button>
      <div class="title"><img class="avatar" src="${avatarSrc()}" alt=""><h1 id="page-title">الرئيسية</h1></div>
      <button class="icon-btn" data-search aria-label="بحث">${icon('search')}</button>
      <a class="icon-btn" href="#/" data-bell aria-label="التنبيهات">${icon('bell')}<span class="dot hidden" id="bell-dot"></span></a>
    </header>
    <main class="page" id="main"></main>
    <nav class="bottomnav">
      ${nav.slice(0, 4).map((m) => html`<a href="${m.href}" data-href="${m.href}">${icon(m.ic)}<span>${m.label}</span></a>`)}
      <button data-drawer>${icon('more')}<span>المزيد</span></button>
    </nav>
    <button class="fab" data-quick aria-label="إجراءات سريعة">${icon('plus', 'lg')}</button>
  </div>`);
  root.addEventListener('click', onShellClick);
}
function onShellClick(e) {
  const t = e.target.closest('[data-drawer],[data-drawer-close],[data-logout],[data-quick],[data-search],.menu a');
  if (!t) return;
  if (t.matches('[data-drawer]')) { document.body.classList.add('drawer-open'); return; }
  if (t.matches('[data-drawer-close]') || t.matches('.menu a:not([data-logout])')) { document.body.classList.remove('drawer-open'); return; }
  if (t.matches('[data-logout]')) { e.preventDefault(); logout(); return; }
  if (t.matches('[data-quick]')) { quickActions(); return; }
  if (t.matches('[data-search]')) { go('#/search'); }
}
export function roleLabel(r) { return { owner: 'المالك', admin: 'مدير', media_buyer: 'Media Buyer', followup: 'موظف متابعة', finance: 'موظف مالي', custom: 'صلاحيات مخصصة' }[r] || r; }
export function setTitle(t) { const h = $('#page-title'); if (h) h.textContent = t; document.title = `${t} — ${state.settings.app_name || 'Media Buyer Control Center'}`; }
export function setBell(n) { const d = $('#bell-dot'); if (!d) return; d.textContent = n > 99 ? '99+' : n; d.classList.toggle('hidden', !n); }

async function quickActions() {
  const acts = [
    { ic: 'calendarCheck', c: 'qc-pink', l: 'ابدأ مراجعة اليوم', href: '#/followup?start=1', perm: 'followups.manage' },
    { ic: 'user_plus', c: 'qc-purple', l: 'إضافة عميل', act: 'client', perm: 'clients.create' },
    { ic: 'coins', c: 'qc-gold', l: 'تسجيل دفعة', act: 'payment', perm: 'payments.create' },
    { ic: 'bars', c: 'qc-blue', l: 'تقرير سريع', href: '#/reports/new', perm: 'reports.create' },
    { ic: 'checkSquare', c: 'qc-green', l: 'إضافة مهمة', act: 'task', perm: 'tasks.manage' },
    { ic: 'megaphone', c: 'qc-cyan', l: 'إضافة حملة', act: 'campaign', perm: 'campaigns.edit' },
    { ic: 'file', c: 'qc-orange', l: 'عرض سعر', href: '#/quotes/new', perm: 'quotes.create' },
    { ic: 'vault', c: 'qc-red', l: 'الخزنة', href: '#/vault', perm: 'vault.view' },
  ].filter(allowed);
  const r = await sheet({
    title: 'إجراءات سريعة',
    body: html`<div class="qa">${acts.map((a, i) => html`<button data-i="${i}"><span class="q-ic ${a.c}">${icon(a.ic)}</span>${a.l}</button>`)}</div>`,
    onMount: (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) close(acts[+b.dataset.i]); }),
  });
  if (!r) return;
  if (r.href) return go(r.href);
  const F = await import('./forms.js');
  const done = await ({ client: F.clientForm, payment: F.paymentForm, task: F.taskForm, campaign: F.campaignForm }[r.act])({});
  if (done) { if (r.act === 'client' && done.id) go(`#/clients/${done.id}`); else refresh(); }
}

let renderSeq = 0;
async function render() {
  if (!state.user) return;
  const seq = ++renderSeq;
  const { path, query } = parseHash();
  const prevMain = $('#main');
  const main = prevMain.cloneNode(false); // fresh element => no stale event listeners from the previous page
  prevMain.parentNode.replaceChild(main, prevMain);
  $$('.menu a, .bottomnav a').forEach((a) => {
    const h = a.dataset.href?.slice(1);
    a.classList.toggle('active', !!h && (h === '/' ? path === '/' : path === h || path.startsWith(h + '/')));
  });
  document.body.classList.toggle('no-fab', /\/(new|edit)$/.test(path) || !!query.start || (path === '/followup' && !!query.client) || /^\/(reports|quotes)\/[^/]+$/.test(path));
  const route = ROUTES.find((r) => r.re.test(path));
  window.scrollTo(0, 0);
  if (!route) { mount(main, html`<div class="empty">${icon('info')}<div>الصفحة غير موجودة</div></div>`); return; }
  const m = path.match(route.re);
  const params = Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
  mount(main, html`<div class="stack"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton" style="height:160px"></div></div>`);
  try {
    const mod = await route.load();
    if (seq !== renderSeq) return;
    await mod.default(main, params, query, () => seq !== renderSeq);
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    mount(main, html`<div class="empty">${icon('alert')}<div>${e.message || 'حدث خطأ'}</div><button class="btn sm" style="margin-top:12px" data-retry>إعادة المحاولة</button></div>`);
    main.querySelector('[data-retry]')?.addEventListener('click', render);
  }
}

// ---------------- Auth screens ----------------
function brandBlock(sub = true) {
  return html`<div class="auth-hero"><img src="/img/hero.jpg" alt=""></div>
    <div class="brand-title">Media Buyer <span>Control Center</span></div>
    ${sub ? html`<div class="brand-sub">${state.app.name_ar || 'مركز إدارة أعمال الميديا باير'}</div>` : ''}`;
}

function loginScreen() {
  const remembered = (() => { try { return localStorage.getItem('mbcc_user') || ''; } catch { return ''; } })();
  const webauthn = !!window.PublicKeyCredential;
  mount(root, html`<div class="auth"><div class="auth-card">${brandBlock()}
    <form id="login" autocomplete="on">
      <div class="input-icon">${icon('user')}<input name="username" placeholder="اسم المستخدم" autocomplete="username" value="${remembered}" required autocapitalize="off"></div>
      <div class="input-icon">${icon('lock')}<input name="password" type="password" placeholder="كلمة المرور" autocomplete="current-password" required>
        <button type="button" class="icon-btn eye" data-eye aria-label="إظهار">${icon('eye')}</button></div>
      <button class="btn primary lg block" type="submit">تسجيل الدخول ${icon('arrowL')}</button>
      ${webauthn ? html`<div class="or">أو</div><button class="btn ghost block" type="button" data-bio>${icon('fingerprint')} تسجيل الدخول بالبصمة</button>` : ''}
      <label class="check" style="justify-content:center"><input type="checkbox" name="remember" ${remembered ? raw('checked') : ''}> تذكرني</label>
    </form>
    <div class="features">
      <div>${icon('shield')}آمن وخاص</div><div>${icon('cloud')}نسخ احتياطي</div><div>${icon('bars')}تقارير سريعة</div><div>${icon('megaphone')}متابعة الحملات</div>
    </div></div></div>`);
  const form = $('#login');
  form.querySelector('[data-eye]').addEventListener('click', () => { const p = form.password; p.type = p.type === 'password' ? 'text' : 'password'; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await post('/api/auth/login', { username: form.username.value, password: form.password.value, remember: form.remember.checked });
      try { if (form.remember.checked) localStorage.setItem('mbcc_user', form.username.value); else localStorage.removeItem('mbcc_user'); } catch {}
      await enter(r.user);
    } catch (err) { toast(err.message, 'err'); } finally { btn.disabled = false; }
  });
  form.querySelector('[data-bio]')?.addEventListener('click', async () => {
    try {
      const { webauthnLogin } = await import('./webauthn.js');
      const r = await webauthnLogin(form.username.value, form.remember.checked);
      await enter(r.user);
    } catch (err) { toast(err.message || 'تعذر الدخول بالبصمة', 'err'); }
  });
}

function setupScreen(enabled) {
  mount(root, html`<div class="auth"><div class="auth-card">${brandBlock()}
    <div class="card" style="margin-top:20px;text-align:start">
      <h3 style="margin:0 0 6px">إنشاء حساب المالك</h3>
      <p class="muted small" style="margin:0">هذه الخطوة تظهر مرة واحدة فقط. لا يوجد تسجيل عام — يجب إدخال رمز الإعداد (SETUP_TOKEN) المحفوظ كسرّ على الخادم.</p>
      ${enabled ? html`<form id="setup" class="form-grid" style="margin-top:14px">
        <input name="setup_token" type="password" placeholder="رمز الإعداد SETUP_TOKEN" required autocomplete="off">
        <input name="display_name" placeholder="اسمك (يظهر في التطبيق)" required>
        <input name="username" placeholder="اسم المستخدم (إنجليزي)" required autocapitalize="off" autocomplete="username">
        <input name="password" type="password" placeholder="كلمة مرور قوية (10 أحرف على الأقل)" required minlength="10" autocomplete="new-password">
        <input name="password2" type="password" placeholder="تأكيد كلمة المرور" required autocomplete="new-password">
        <button class="btn primary lg block">إنشاء الحساب والدخول</button></form>`
    : html`<div class="card flat" style="margin-top:12px;border-color:rgba(244,63,94,.4)">لم يتم ضبط <b>SETUP_TOKEN</b> على الخادم. راجع ملف التعليمات (docs) لضبطه ثم أعد تحميل الصفحة.</div>`}
    </div></div></div>`);
  $('#setup')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.password.value !== f.password2.value) return toast('كلمتا المرور غير متطابقتين', 'err');
    try {
      const r = await post('/api/auth/setup', { setup_token: f.setup_token.value, display_name: f.display_name.value, username: f.username.value, password: f.password.value });
      toast('تم إنشاء حساب المالك');
      await enter(r.user);
    } catch (err) { toast(err.message, 'err'); }
  });
}

export async function loadSettings() {
  const s = await get('/api/settings');
  state.settings = s.settings; state.vaultKey = s.vault_key_configured;
  setCurrency(state.settings.currency_symbol);
  applyTheme(state.settings.theme);
}
export function applyTheme(t) {
  let theme = t;
  try { const local = localStorage.getItem('mbcc_theme'); if (local) theme = local; } catch {}
  if (theme === 'system') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  $('meta[name=theme-color]')?.setAttribute('content', theme === 'light' ? '#f4f5fb' : '#0b0c1b');
}

async function enter(user) {
  state.user = user; state.perms = new Set(user.permissions);
  await loadSettings();
  shell();
  if (!location.hash) location.hash = '#/';
  await render();
}

export async function logout() {
  try { await post('/api/auth/logout'); } catch {}
  state.user = null; invalidate();
  document.body.classList.remove('drawer-open');
  loginScreen();
}

async function boot() {
  const splash = $('#splash');
  setUnauthorizedHandler(() => { if (state.user) { state.user = null; toast('انتهت الجلسة — سجّل الدخول مجددًا', 'err'); loginScreen(); } });
  window.addEventListener('hashchange', () => { document.body.classList.remove('drawer-open'); render(); });
  try {
    const s = await get('/api/auth/status');
    state.app = s.app || {};
    applyTheme(state.app.theme);
    if (s.setup_required) setupScreen(s.setup_enabled);
    else if (s.user) await enter(s.user);
    else loginScreen();
  } catch (e) {
    mount(root, html`<div class="auth"><div class="auth-card">${brandBlock()}<p class="muted" style="margin-top:20px">${e.message}</p><button class="btn primary" data-reload>إعادة المحاولة</button></div></div>`);
    $('[data-reload]')?.addEventListener('click', () => location.reload());
  }
  setTimeout(() => { splash?.classList.add('out'); setTimeout(() => splash?.remove(), 400); }, 350);
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker?.register('/sw.js').catch(() => {});
}
boot();
export { esc, debounce, logo };
