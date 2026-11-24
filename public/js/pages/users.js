import { html, raw, icon, mount, toast, confirmBox, formSheet, field, inp, sel, dateTime, empty } from '../ui.js';
import { get, post, put, del, invalidate } from '../api.js';
import { setTitle, refresh, roleLabel, state } from '../app.js';
import { PERMISSIONS, ROLES } from '../shared.js';

export default async function usersPage(main, _p, _q, stale) {
  setTitle('المستخدمون والصلاحيات');
  const { items } = await get('/api/users');
  if (stale()) return;
  mount(main, html`
    <div class="row between" style="margin-bottom:12px"><p class="muted small" style="margin:0">لا يوجد تسجيل عام — أنت فقط من يضيف المستخدمين ويحدد صلاحياتهم.</p><button class="btn primary sm" data-add>${icon('user_plus', 'sm')} مستخدم</button></div>
    <div class="list">${items.map((u) => html`<div class="item" data-id="${u.id}"><span class="logo" style="background:${u.role === 'owner' ? 'var(--grad-primary)' : 'var(--surface-2)'};color:#fff">${icon(u.role === 'owner' ? 'star' : 'user')}</span>
      <div class="it-body"><div class="it-title">${u.display_name} <span class="muted small ltr">@${u.username}</span></div><div class="it-sub">${roleLabel(u.role)} • ${u.permissions.length} صلاحية • آخر دخول ${u.last_login_at ? dateTime(u.last_login_at) : '—'}</div></div>
      ${u.active ? html`<span class="badge b-green">نشط</span>` : html`<span class="badge b-red">معطل</span>`}</div>`)}</div>`);
  main.addEventListener('click', async (e) => {
    if (e.target.closest('[data-add]')) { if (await userForm()) refresh(); return; }
    const it = e.target.closest('[data-id]'); if (!it) return;
    const u = items.find((x) => x.id === it.dataset.id);
    if (u.role === 'owner') return toast('حساب المالك يملك جميع الصلاحيات ولا يمكن تعديله من هنا — غيّر كلمة مرورك من الإعدادات');
    if (await userForm(u)) refresh();
  });
}

function permGrid(selected) {
  const set = new Set(selected);
  const groups = {};
  for (const [k, l] of Object.entries(PERMISSIONS)) (groups[k.split('.')[0]] ||= []).push([k, l]);
  return html`<div class="stack" data-perms>${Object.values(groups).map((g) => html`<div class="card flat" style="padding:10px"><div class="row wrap" style="gap:6px 14px">${g.map(([k, l]) => html`<label class="check"><input type="checkbox" data-multi name="permissions" value="${k}" ${set.has(k) ? raw('checked') : ''}> ${l}</label>`)}</div></div>`)}</div>`;
}

function userForm(u) {
  const editing = !!u;
  const roles = Object.fromEntries(Object.entries(ROLES).filter(([k]) => k !== 'owner').map(([k, v]) => [k, v.label]));
  return formSheet({
    title: editing ? `تعديل ${u.display_name}` : 'إضافة مستخدم', wide: true,
    body: html`<div class="form-grid cols-2">
      ${field('الاسم', inp('display_name', u?.display_name, { req: true }))}
      ${editing ? field('اسم المستخدم', inp('username', u.username, { attrs: 'disabled' })) : field('اسم المستخدم (إنجليزي)', inp('username', '', { req: true, attrs: 'autocapitalize="off" autocomplete="off"' }))}
      ${field(editing ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور (10 أحرف على الأقل)', inp('password', '', { type: 'password', req: !editing, attrs: 'autocomplete="new-password"' }))}
      ${field('نوع الصلاحية', sel('role', roles, u?.role || 'media_buyer'))}</div>
      <label class="check"><input type="checkbox" name="active" ${!editing || u.active ? raw('checked') : ''}> الحساب مفعل</label>
      <div class="row between"><b class="small">الصلاحيات التفصيلية</b><span class="row" style="gap:10px"><button type="button" class="link" data-all>تحديد الكل (صلاحية كاملة)</button><button type="button" class="link" data-none>إلغاء الكل</button></span></div>
      ${permGrid(u?.permissions || ROLES.media_buyer.perms)}
      <p class="xs muted" style="margin:0">تُطبق الصلاحيات على الخادم وليس على الواجهة فقط. تعطيل الحساب أو تغيير كلمة مروره يُنهي جلساته فورًا.</p>`,
    extraFoot: editing ? html`<button type="button" class="btn danger icon" data-deluser>${icon('trash')}</button>` : '',
    onMount: (el, close, form) => {
      const setAll = (v, list) => el.querySelectorAll('[name=permissions]').forEach((c) => { c.checked = list ? list.includes(c.value) : v; c.parentElement.classList.toggle('active', c.checked); });
      form.role.addEventListener('change', () => { const r = ROLES[form.role.value]; if (r && r.perms.length) setAll(false, r.perms); });
      el.querySelector('[data-all]').addEventListener('click', () => setAll(true));
      el.querySelector('[data-none]').addEventListener('click', () => setAll(false));
      el.querySelector('[data-deluser]')?.addEventListener('click', async () => {
        if (await confirmBox(`حذف المستخدم ${u.display_name}؟ سيتم إلغاء وصوله نهائيًا (يبقى سجل نشاطه).`, { danger: true, ok: 'حذف' })) { await del(`/api/users/${u.id}`); toast('تم حذف المستخدم'); close(true); }
      });
    },
    onSubmit: async (d) => {
      const body = { display_name: d.display_name, role: d.role, permissions: d.permissions || [], active: d.active };
      if (d.password) body.password = d.password;
      if (editing) await put(`/api/users/${u.id}`, body); else await post('/api/users', { ...body, username: d.username, password: d.password });
      invalidate('users'); toast('تم الحفظ'); return true;
    },
  });
}
export { empty, state };
