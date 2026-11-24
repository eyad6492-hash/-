import { html, icon, mount, empty, toast, confirmBox, copyText, logo, debounce, sel, dateTime } from '../ui.js';
import { get, post, del, lookups } from '../api.js';
import { can, setTitle, refresh } from '../app.js';
import { VAULT_TYPES } from '../shared.js';
import { vaultForm } from '../forms.js';

let timer;
export default async function vaultPage(main, _p, q, stale) {
  setTitle('خزنة الحسابات');
  clearInterval(timer);
  const v = await get('/api/vault');
  if (stale()) return;
  if (!v.available) {
    return mount(main, html`<div class="card lock-screen"><div class="big">${icon('alert', 'xl')}</div><h3>مفتاح تشفير الخزنة غير مضبوط</h3><p class="muted small">لحماية بيانات الدخول يجب ضبط السر <b class="ltr">VAULT_KEY</b> على الخادم (راجع ملف التعليمات). لن تُحفظ أي كلمة مرور بدون تشفير.</p></div>`);
  }
  if (v.locked) {
    mount(main, html`<div class="card lock-screen"><div class="big">${icon('vault', 'xl')}</div><h3 style="margin:0">الخزنة مقفلة</h3>
      <p class="muted small">بيانات حسابات العملاء مشفرة. أدخل كلمة مرور حسابك لفتح الخزنة مؤقتًا.</p>
      <form data-unlock class="stack" style="max-width:340px;margin:0 auto"><div class="input-icon">${icon('lock')}<input type="password" name="password" placeholder="كلمة المرور" autocomplete="current-password" required></div>
      <button class="btn primary lg block">${icon('unlock')} فتح الخزنة</button></form></div>`);
    main.querySelector('[data-unlock]').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await post('/api/auth/vault/unlock', { password: e.target.password.value }); refresh(); } catch (err) { toast(err.message, 'err'); }
    });
    setTimeout(() => main.querySelector('[name=password]')?.focus(), 50);
    return;
  }
  const clients = await lookups.clients();
  const st = { q: '', client: q.client || '', platform: '' };
  mount(main, html`
    <div class="card row" style="padding:12px"><span class="logo sm" style="background:rgba(34,197,94,.15);color:#4ade80">${icon('unlock', 'sm')}</span><div class="grow"><b>الخزنة مفتوحة</b><div class="xs muted">تُقفل تلقائيًا بعد <span data-left></span></div></div><button class="btn sm ghost" data-lock>${icon('lock', 'sm')} قفل الآن</button></div>
    <div class="row" style="margin:12px 0"><div class="input-icon grow">${icon('search')}<input type="search" data-q placeholder="ابحث بالعميل أو المنصة أو اسم الحساب…"></div>${v.can_edit ? html`<button class="btn primary icon" data-add>${icon('plus')}</button>` : ''}</div>
    <div class="grid-2">${sel('client', clients.map((c) => ({ v: c.id, l: c.name })), st.client, { empty: 'كل العملاء' })}${sel('platform', VAULT_TYPES, '', { empty: 'كل الأنواع' })}</div>
    <div data-list style="margin-top:12px"></div>
    <p class="muted xs" style="margin-top:14px">${icon('shield', 'sm')} كلمات المرور مشفرة (AES-256-GCM) ولا تُعرض إلا عند الطلب، وكل عرض أو نسخ يُسجل في سجل النشاط دون تسجيل كلمة المرور نفسها.</p>`);
  const until = new Date(v.vault_until).getTime();
  const tick = () => { const s = Math.max(0, Math.round((until - Date.now()) / 1000)); const el = main.querySelector('[data-left]'); if (!el) return clearInterval(timer); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (!s) { clearInterval(timer); refresh(); } };
  tick(); timer = setInterval(tick, 1000);
  const revealed = {};
  const draw = () => {
    let r = v.items;
    if (st.client) r = r.filter((x) => x.client_id === st.client);
    if (st.platform) r = r.filter((x) => x.platform === st.platform);
    if (st.q) r = r.filter((x) => `${x.client_name || ''} ${x.platform} ${x.account_name || ''} ${x.ad_account_id || ''}`.toLowerCase().includes(st.q.toLowerCase()));
    const groups = {}; for (const x of r) (groups[x.client_name || 'بدون عميل'] ||= []).push(x);
    mount(main.querySelector('[data-list]'), r.length ? Object.entries(groups).map(([name, list]) => html`<div class="section"><div class="section-head"><h3 style="font-size:15px">${logo({ name, logo: list[0].logo }, 'sm')} ${name}</h3><span class="muted small">${list.length}</span></div>
      <div class="stack">${list.map((x) => { const s = revealed[x.id]; return html`<div class="card flat" style="padding:12px" data-id="${x.id}">
        <div class="row"><span class="logo sm" style="background:var(--surface-2);color:var(--gold)">${icon('key', 'sm')}</span><div class="grow"><b>${x.platform}</b><div class="xs muted">${[x.account_name, x.ad_account_id ? `ID: ${x.ad_account_id}` : null].filter(Boolean).join(' • ') || '—'}</div></div>
          ${x.login_url ? html`<a class="icon-btn" target="_blank" rel="noopener noreferrer" href="${x.login_url}" title="فتح رابط الدخول">${icon('globe', 'sm')}</a>` : ''}
          ${v.can_edit ? html`<button class="icon-btn" data-edit>${icon('edit', 'sm')}</button><button class="icon-btn" data-delv>${icon('trash', 'sm')}</button>` : ''}</div>
        <div class="kvlist" style="margin-top:6px">
          ${s ? html`${s.username ? html`<div><span>اسم المستخدم</span><span class="secret">${s.username} <button class="icon-btn" data-copy-val="${s.username}">${icon('copy', 'sm')}</button></span></div>` : ''}
            ${s.email ? html`<div><span>البريد</span><span class="secret">${s.email} <button class="icon-btn" data-copy-val="${s.email}">${icon('copy', 'sm')}</button></span></div>` : ''}
            <div><span>كلمة المرور</span><span class="secret">${s.password || '—'}</span></div>${s.notes ? html`<div><span>ملاحظات</span><span style="white-space:pre-wrap">${s.notes}</span></div>` : ''}`
          : html`<div><span>كلمة المرور</span><span class="secret">••••••••••</span></div>`}
        </div>
        ${v.can_reveal ? html`<div class="grid-2" style="margin-top:8px"><button class="btn sm ghost" data-reveal>${icon(s ? 'eyeOff' : 'eye', 'sm')} ${s ? 'إخفاء' : 'إظهار'}</button><button class="btn sm ghost" data-copy>${icon('copy', 'sm')} نسخ كلمة المرور</button></div>` : ''}
        <div class="xs faint" style="margin-top:6px">أضيف ${dateTime(x.created_at)}</div></div>`; })}</div></div>`) : empty(v.items.length ? 'لا توجد نتائج' : 'لم تتم إضافة أي حساب بعد', 'vault'));
  };
  draw();
  main.querySelector('[data-q]').addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); draw(); }, 150));
  main.addEventListener('change', (e) => { if (e.target.name in st) { st[e.target.name] = e.target.value; draw(); } });
  main.addEventListener('click', async (e) => {
    const t = e.target;
    try {
      if (t.closest('[data-lock]')) { await post('/api/auth/vault/lock'); clearInterval(timer); toast('تم قفل الخزنة'); return refresh(); }
      if (t.closest('[data-add]')) { if (await vaultForm({}, st.client)) refresh(); return; }
      const cv = t.closest('[data-copy-val]'); if (cv) return copyText(cv.dataset.copyVal);
      const card = t.closest('[data-id]'); if (!card) return;
      const x = v.items.find((i) => i.id === card.dataset.id);
      if (t.closest('[data-reveal]')) { if (revealed[x.id]) delete revealed[x.id]; else revealed[x.id] = (await post(`/api/vault/${x.id}/reveal`, { purpose: 'view' })).secret; draw(); return; }
      if (t.closest('[data-copy]')) { const s = revealed[x.id] || (await post(`/api/vault/${x.id}/reveal`, { purpose: 'copy' })).secret; if (!s.password) return toast('لا توجد كلمة مرور محفوظة', 'err'); return copyText(s.password, 'تم نسخ كلمة المرور'); }
      if (t.closest('[data-delv]')) { if (await confirmBox(`حذف حساب ${x.platform}${x.client_name ? ' للعميل ' + x.client_name : ''} من الخزنة؟`, { danger: true, ok: 'حذف' })) { await del(`/api/vault/${x.id}`); toast('تم الحذف'); refresh(); } return; }
      if (t.closest('[data-edit]')) {
        const secret = can('vault.reveal') ? (revealed[x.id] || (await post(`/api/vault/${x.id}/reveal`, { purpose: 'edit' })).secret) : {};
        const r = await vaultForm({ ...x, secret }, null);
        if (r) { delete revealed[x.id]; refresh(); }
        return;
      }
    } catch (err) { if (err.code === 'vault_locked') return refresh(); toast(err.message, 'err'); }
  });
}
