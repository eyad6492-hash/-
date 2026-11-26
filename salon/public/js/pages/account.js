import { html, icon, mount, toast, avatar } from '../ui.js';
import { post } from '../api.js';
import { state, setTitle, logout } from '../app.js';
import { ROLES } from '../shared.js';

export async function render(view) {
  setTitle('حسابي');
  const u = state.user;
  mount(view, html`
    <div class="page-head"><div><h2>حسابي</h2></div></div>
    <div class="card gold-edge" style="display:flex;gap:14px;align-items:center">${avatar(u, 'lg')}<div><b style="font-size:18px">${u.full_name}</b><div class="muted ltr" style="text-align:right">${u.email}</div><span class="badge gold" style="margin-top:6px">${ROLES[u.role]?.label}</span></div></div>
    <h3 class="section-title">تغيير كلمة المرور</h3>
    <form class="card form-grid" id="pw">
      <label class="field"><span>كلمة المرور الحالية</span><input name="current" type="password" required dir="ltr" autocomplete="current-password"></label>
      <label class="field"><span>كلمة المرور الجديدة</span><input name="next" type="password" required dir="ltr" autocomplete="new-password"><small>8 أحرف على الأقل وتحتوي حروفاً وأرقاماً. سيتم تسجيل خروجك من الأجهزة الأخرى.</small></label>
      <button class="btn primary" type="submit">${icon('save', 'sm')} حفظ</button></form>
    <button class="btn danger block" style="margin-top:16px" data-out>${icon('logout')} تسجيل الخروج</button>`);
  view.querySelector('#pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/api/auth/password', { current: e.target.current.value, next: e.target.next.value }); e.target.reset(); toast('تم تغيير كلمة المرور'); }
    catch (err) { toast(err.message, 'err'); }
  });
  view.querySelector('[data-out]').addEventListener('click', logout);
}
