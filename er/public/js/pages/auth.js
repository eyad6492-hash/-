// Sign-in, first-time setup, partner invitation, password recovery & reset screens.
import { get, post } from '../api.js';
import { esc, toast, toastErr, copyText } from '../ui.js';

const mark = (sub = 'مساحتنا الخاصة') => `<div class="mark"><div class="logo">E<i>&amp;</i>R</div><p class="en">${sub}</p></div>`;
const field = (k, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${k}" type="${type}" ${extra} required></label>`;

function recoveryScreen(el, code, next) {
  el.innerHTML = `<div class="auth">${mark('احفظه في مكان آمن')}
    <h2>رمز الاستعادة الخاص بك</h2>
    <p class="muted small">احفظ هذا الرمز في مكان آمن (مثل ملاحظات الجوال أو مدير كلمات المرور). تحتاجه لاستعادة كلمة المرور إذا نسيتها. لن يظهر مرة أخرى.</p>
    <div class="code-box" id="code">${esc(code)}</div>
    <div class="row" style="margin-top:12px"><button class="btn soft grow" id="copy">نسخ الرمز</button></div>
    <button class="btn block" style="margin-top:12px" id="go">حفظته، لنبدأ</button></div>`;
  el.querySelector('#copy').onclick = () => copyText(code);
  el.querySelector('#go').onclick = next;
}

async function submitForm(form, fn) {
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  try { await fn(Object.fromEntries(new FormData(form))); } catch (e) { toastErr(e); } finally { btn.disabled = false; }
}

export default {
  async render(el, { mode, token }) {
    const { afterLogin } = await import('../app.js');
    if (mode === 'login') {
      el.innerHTML = `<div class="auth">${mark()}<form id="f">
        ${field('email', 'البريد الإلكتروني', 'email', 'autocomplete="email" dir="ltr" inputmode="email"')}
        ${field('password', 'كلمة المرور', 'password', 'autocomplete="current-password" dir="ltr"')}
        <button class="btn block" type="submit">تسجيل الدخول</button></form>
        <div class="alt"><a href="#/recover">نسيت كلمة المرور؟</a></div>
        <div class="alt" id="setupHint"></div></div>`;
      get('/api/auth/status').then((s) => { if (s.setup_needed) el.querySelector('#setupHint').innerHTML = '<a href="#/setup">إنشاء المساحة لأول مرة</a>'; }).catch(() => {});
      el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); submitForm(e.target, async (v) => { await post('/api/auth/login', v); await afterLogin(); }); };
      return;
    }
    if (mode === 'setup') {
      const st = await get('/api/auth/status').catch(() => ({}));
      if (!st.setup_needed) { el.innerHTML = `<div class="auth">${mark()}<p class="center muted">تم إنشاء المساحة مسبقًا. للانضمام اطلب رابط الدعوة من الطرف الآخر.</p><a class="btn block" href="#/login">تسجيل الدخول</a></div>`; return; }
      el.innerHTML = `<div class="auth">${mark('لنبدأ مساحتنا')}<h2>إنشاء المساحة</h2><form id="f">
        ${st.setup_token_required ? field('setup_token', 'رمز الإعداد', 'password', 'dir="ltr" autocomplete="off"') : ''}
        <div class="field"><span>من أنت؟</span><div class="seg" id="who"><button type="button" data-v="E" class="on">إياد (E)</button><button type="button" data-v="R">روان (R)</button></div></div>
        ${field('name', 'اسمك', 'text', 'value="إياد" autocomplete="name"')}
        ${field('email', 'البريد الإلكتروني', 'email', 'dir="ltr" autocomplete="email"')}
        ${field('password', 'كلمة المرور (8 أحرف على الأقل)', 'password', 'dir="ltr" autocomplete="new-password" minlength="8"')}
        <button class="btn block" type="submit">إنشاء المساحة</button></form>
        <div class="alt">بعد الإنشاء ستحصل على رابط دعوة لإرساله للطرف الآخر.</div></div>`;
      let letter = 'E';
      el.querySelector('#who').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; letter = b.dataset.v; el.querySelectorAll('#who button').forEach((x) => x.classList.toggle('on', x === b)); el.querySelector('[name=name]').value = letter === 'E' ? 'إياد' : 'روان'; };
      el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); submitForm(e.target, async (v) => { const r = await post('/api/auth/setup', { ...v, letter }); recoveryScreen(el, r.recovery_code, () => afterLogin()); }); };
      return;
    }
    if (mode === 'join') {
      let info;
      try { info = await get(`/api/auth/invite/${encodeURIComponent(token)}`); }
      catch (e) { el.innerHTML = `<div class="auth">${mark()}<p class="center muted">${esc(e.message)}</p><a class="btn block" href="#/login">تسجيل الدخول</a></div>`; return; }
      const defName = info.letter === 'R' ? 'روان' : 'إياد';
      el.innerHTML = `<div class="auth">${mark('دعوة خاصة')}<h2>${esc(info.inviter)} يدعوك إلى مساحتكما الخاصة</h2><form id="f">
        ${field('name', 'اسمك', 'text', `value="${defName}"`)}
        ${field('email', 'البريد الإلكتروني', 'email', 'dir="ltr" autocomplete="email"')}
        ${field('password', 'كلمة المرور (8 أحرف على الأقل)', 'password', 'dir="ltr" autocomplete="new-password" minlength="8"')}
        <button class="btn rose block" type="submit">انضمام</button></form></div>`;
      el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); submitForm(e.target, async (v) => { const r = await post('/api/auth/join', { ...v, token }); recoveryScreen(el, r.recovery_code, () => afterLogin()); }); };
      return;
    }
    if (mode === 'recover') {
      const st = await get('/api/auth/status').catch(() => ({}));
      el.innerHTML = `<div class="auth">${mark('استعادة الحساب')}<h2>استعادة كلمة المرور</h2>
        <div class="tabs" id="tabs"><button class="on" data-t="code">برمز الاستعادة</button>${st.email_reset ? '<button data-t="mail">عبر البريد</button>' : ''}<button data-t="partner">عن طريق الطرف الآخر</button></div>
        <form id="code">${field('email', 'البريد الإلكتروني', 'email', 'dir="ltr"')}${field('code', 'رمز الاستعادة', 'text', 'dir="ltr" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX"')}${field('password', 'كلمة المرور الجديدة', 'password', 'dir="ltr" minlength="8" autocomplete="new-password"')}<button class="btn block" type="submit">تعيين كلمة المرور</button></form>
        <form id="mail" class="hidden">${field('email', 'البريد الإلكتروني', 'email', 'dir="ltr"')}<button class="btn block" type="submit">إرسال رابط الاستعادة</button></form>
        <div id="partner" class="hidden card soft"><p style="margin:0">اطلب من الطرف الآخر فتح <b>الإعدادات ← الحساب ← رابط إعادة تعيين كلمة المرور</b> وإرسال الرابط لك. الرابط صالح لمدة 24 ساعة.</p></div>
        <div class="alt"><a href="#/login">العودة لتسجيل الدخول</a></div></div>`;
      el.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; el.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); ['code', 'mail', 'partner'].forEach((id) => el.querySelector('#' + id).classList.toggle('hidden', id !== b.dataset.t)); };
      el.querySelector('#code').onsubmit = (e) => { e.preventDefault(); submitForm(e.target, async (v) => { const r = await post('/api/auth/recover', v); recoveryScreen(el, r.recovery_code, () => afterLogin()); }); };
      el.querySelector('#mail').onsubmit = (e) => { e.preventDefault(); submitForm(e.target, async (v) => { await post('/api/auth/forgot', v); toast('إذا كان البريد مسجلًا فستصلك رسالة خلال دقائق'); }); };
      return;
    }
    if (mode === 'reset') {
      el.innerHTML = `<div class="auth">${mark('كلمة مرور جديدة')}<h2>كلمة مرور جديدة</h2><form id="f">${field('password', 'كلمة المرور الجديدة', 'password', 'dir="ltr" minlength="8" autocomplete="new-password"')}<button class="btn block" type="submit">حفظ والدخول</button></form></div>`;
      el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); submitForm(e.target, async (v) => { await post('/api/auth/reset', { ...v, token }); toast('تم تغيير كلمة المرور'); await afterLogin(); }); };
    }
  },
};
