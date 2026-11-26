import { html, icon, mount, toast } from '../ui.js';
import { state, setTitle } from '../app.js';

export async function render(view) {
  setTitle('تثبيت التطبيق');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const draw = () => mount(view, html`
    <div class="page-head"><div><h2>تثبيت التطبيق</h2><p>ثبّت Mr. Vibe على جوالك كتطبيق مستقل — بدون متجر</p></div></div>
    <div class="card gold-edge" style="display:flex;gap:14px;align-items:center">
      <img src="/icons/icon-192.png" alt="" style="width:72px;height:72px;border-radius:18px;border:1px solid var(--line)">
      <div style="flex:1"><b style="font-size:18px">Mr. Vibe Salon</b><div class="muted" style="font-size:13px">رابط واحد لجميع الموظفين — كل شخص يدخل بحسابه</div></div>
    </div>
    ${standalone ? html`<div class="card" style="margin-top:12px"><b class="ok-t">${icon('checkCircle', 'sm')} التطبيق مثبت وتستخدمه الآن كتطبيق مستقل.</b></div>` : ''}
    ${!standalone && state.installEvt ? html`<button class="btn primary lg block" style="margin-top:14px" data-install>${icon('download')} تثبيت التطبيق الآن</button>` : ''}
    <h3 class="section-title">Android (Chrome)</h3>
    <div class="card"><ol class="steps">
      <li>افتح رابط الموقع في متصفح <b>Chrome</b>.</li>
      <li>اضغط على زر <b>التثبيت</b> أعلاه إن ظهر، أو افتح قائمة المتصفح (⋮).</li>
      <li>اختر <b>Install app / تثبيت التطبيق</b> أو <b>Add to Home screen / إضافة إلى الشاشة الرئيسية</b>.</li>
      <li>ستظهر أيقونة Mr. Vibe على الشاشة الرئيسية وتفتح كتطبيق مستقل.</li></ol></div>
    <h3 class="section-title">iPhone (Safari)</h3>
    <div class="card"><ol class="steps">
      <li>افتح رابط الموقع في متصفح <b>Safari</b>.</li>
      <li>اضغط زر <b>المشاركة</b> ${icon('share', 'sm')} أسفل الشاشة.</li>
      <li>اختر <b>Add to Home Screen / إضافة إلى الشاشة الرئيسية</b>.</li>
      <li>اضغط <b>Add / إضافة</b>.</li></ol></div>
    ${ios ? html`<div class="hint" style="margin-top:12px">على iPhone يجب استخدام Safari للتثبيت. اسمح بصلاحية الموقع والكاميرا عند الطلب.</div>` : ''}
    <div class="hint" style="margin-top:12px">التطبيق يتحدث تلقائياً عند صدور نسخة جديدة. لا تُحفظ بياناتك المالية على الجهاز — تُعرض من الخادم بعد تسجيل الدخول فقط.</div>`);
  draw();
  const bind = () => view.querySelector('[data-install]')?.addEventListener('click', async () => {
    const e = state.installEvt; if (!e) return;
    e.prompt(); const r = await e.userChoice; state.installEvt = null;
    if (r.outcome === 'accepted') toast('جارٍ التثبيت…'); draw(); bind();
  });
  bind();
  document.addEventListener('installable', () => { if (view.isConnected) { draw(); bind(); } }, { once: true });
}
