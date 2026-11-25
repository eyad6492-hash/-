import { html, raw, icon, mount, toast, confirmBox, field, inp, sel, ta, formSheet, readImageAsDataURL, money, sheet, dateTime } from '../ui.js';
import { get, post, put, del, invalidate } from '../api.js';
import { can, setTitle, refresh, state, loadSettings, applyTheme, avatarSrc } from '../app.js';
import { TASK_PRIORITY, DEFAULT_QUICK_CHECKLIST } from '../shared.js';

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

export default async function settingsPage(main, _p, _q, stale) {
  setTitle('الإعدادات');
  await loadSettings();
  if (stale()) return;
  const s = state.settings, admin = can('settings.manage');
  let localTheme = ''; try { localTheme = localStorage.getItem('mbcc_theme') || ''; } catch {}
  const creds = await get('/api/auth/webauthn/credentials').then((r) => r.items).catch(() => []);
  const demo = admin ? await get('/api/demo/status').catch(() => ({ demo_clients: 0 })) : null;
  const sec = (id, ic, title, body, open = false) => html`<details class="card" ${open ? raw('open') : ''} data-sec="${id}"><summary class="row" style="cursor:pointer;list-style:none"><span class="logo sm" style="background:var(--surface-2);color:var(--pink)">${icon(ic, 'sm')}</span><b class="grow">${title}</b>${icon('chevD', 'sm')}</summary><div style="margin-top:14px">${body}</div></details>`;
  const saveBtn = (k) => html`<button class="btn primary block" data-save="${k}" style="margin-top:12px">${icon('save')} حفظ</button>`;
  const chk = (name, label) => html`<label class="check"><input type="checkbox" name="${name}" ${s[name] ? raw('checked') : ''}> ${label}</label>`;
  const installed = matchMedia('(display-mode: standalone)').matches;

  mount(main, html`<div class="stack lg">
    <div class="card row"><img class="avatar lg" src="${avatarSrc()}" alt=""><div class="grow"><b style="font-size:18px">${state.user.display_name}</b><div class="muted small">@${state.user.username} • ${state.user.role === 'owner' ? 'المالك' : state.user.role}</div><div class="xs muted">${s.app_name}</div></div></div>

    ${sec('look', 'image', 'الهوية والمظهر', html`<form class="form-grid" data-form="look">
      ${admin ? html`${field('اسم التطبيق', inp('app_name', s.app_name))}${field('الاسم العربي', inp('app_name_ar', s.app_name_ar))}
      <div class="row"><img src="${avatarSrc()}" class="avatar lg" data-id-prev alt=""><div class="grow stack"><label class="btn sm ghost">${icon('upload', 'sm')} تغيير صورة الهوية<input type="file" accept="image/*" hidden data-identity></label>${s.identity_image ? html`<button type="button" class="btn sm ghost" data-reset-identity>استعادة الصورة الأصلية</button>` : ''}</div></div>
      <p class="xs muted" style="margin:0">صورة الهوية تظهر في القائمة والرئيسية والتقارير وعروض الأسعار. أيقونة التثبيت وشاشة البداية تستخدم الصورة المدمجة في ملفات التطبيق (public/icons).</p>
      ${field('الوضع الافتراضي للتطبيق', sel('theme', { dark: 'داكن', light: 'فاتح', system: 'حسب الجهاز' }, s.theme))}` : ''}
      ${field('مظهر هذا الجهاز فقط', sel('local_theme', { '': 'حسب إعداد التطبيق', dark: 'داكن', light: 'فاتح', system: 'حسب الجهاز' }, localTheme))}
      ${saveBtn('look')}</form>`, true)}

    ${admin ? sec('provider', 'building', 'بيانات مقدم الخدمة', html`<form class="form-grid cols-2" data-form="provider">
      ${field('الاسم', inp('provider_name', s.provider_name))}${field('المسمى', inp('provider_title', s.provider_title))}${field('الجوال', inp('provider_phone', s.provider_phone, { type: 'tel' }))}
      ${field('البريد', inp('provider_email', s.provider_email, { type: 'email' }))}${field('الموقع', inp('provider_website', s.provider_website))}${field('الرقم الضريبي', inp('provider_tax_no', s.provider_tax_no))}
      ${field('العنوان', inp('provider_address', s.provider_address), 'span-2')}<div class="span-2">${saveBtn('provider')}</div></form>`) : ''}

    ${admin ? sec('money', 'percent', 'العملات والضريبة', html`<form class="form-grid cols-2" data-form="money">
      ${field('العملة الافتراضية', inp('currency', s.currency))}${field('رمز العملة', inp('currency_symbol', s.currency_symbol))}
      ${field('نسبة الضريبة %', inp('tax_rate', s.tax_rate, { type: 'number', step: 'any', min: 0 }))}${field('اسم الضريبة', inp('tax_label', s.tax_label))}
      <div class="span-2">${chk('tax_default_enabled', 'تفعيل الضريبة افتراضيًا في عروض الأسعار الجديدة')}</div>
      ${field('المنطقة الزمنية', sel('timezone', ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Africa/Cairo', 'Asia/Amman', 'Europe/Istanbul'], s.timezone))}
      <div class="span-2">${saveBtn('money')}</div></form>`) : ''}

    ${admin ? sec('reports', 'bars', 'التقارير وقوالبها', html`<form class="form-grid" data-form="reports">
      ${field('تذييل التقرير', ta('report_footer', s.report_footer, '', 2))}${chk('report_show_identity', 'إظهار صورة الهوية في التقارير')}${saveBtn('reports')}</form>`) : ''}

    ${admin ? sec('quotes', 'file', 'عروض الأسعار', html`<form class="form-grid" data-form="quotes">
      <div class="grid-2">${field('بادئة الترقيم', inp('quote_prefix', s.quote_prefix))}${field('صلاحية العرض (أيام)', inp('quote_validity_days', s.quote_validity_days, { type: 'number', min: 1 }))}</div>
      ${field('الشروط الافتراضية', ta('quote_terms', s.quote_terms, '', 4))}
      <button type="button" class="btn ghost block" data-templates>${icon('layers')} إدارة قوالب الخدمات</button>${saveBtn('quotes')}</form>`) : ''}

    ${admin ? sec('subs', 'snow', 'الاشتراكات والتجميد', html`<form class="form-grid" data-form="subs">
      <div class="grid-3">${field('مدة الاشتراك الافتراضية (شهر)', inp('default_sub_months', s.default_sub_months, { type: 'number', step: 'any', min: 0.5 }))}${field('تنبيه قرب الانتهاء (يوم)', inp('expiring_days', s.expiring_days, { type: 'number', min: 1 }))}${field('مهلة السداد (يوم)', inp('payment_grace_days', s.payment_grace_days, { type: 'number', min: 0 }))}</div>
      ${chk('freeze_extend', 'سياسة التجميد: تمديد نهاية الاشتراك تلقائيًا بمدة التجميد الفعلية عند فك التجميد')}
      ${chk('freeze_pause_work', 'إيقاف المتابعة اليومية والمهام للعميل المجمد')}${saveBtn('subs')}</form>`) : ''}

    ${admin ? sec('quick', 'list', 'بنود Checklist – المتابعة السريعة', html`<form class="form-grid" data-form="quick">
      <p class="xs muted" style="margin:0">البند «الأساسي» ⭐ يجب إنجازه ليُعتبر العميل «مكتمل». إذا لم تحدد أي بند أساسي يجب إنجاز جميع البنود.</p>
      <div class="stack" style="gap:6px" data-quick>${(s.quick_checklist?.length ? s.quick_checklist : DEFAULT_QUICK_CHECKLIST).map((x) => qItem(x))}</div>
      <div class="row"><input data-new-q placeholder="بند جديد…"><button type="button" class="btn sm" data-add-q>${icon('plus', 'sm')}</button></div>${saveBtn('quick')}</form>`) : ''}

    ${sec('push', 'bell', 'إشعارات الجوال والتنبيهات', html`<div class="stack">
      ${admin ? html`<form class="form-grid" data-form="alerts"><div class="grid-2">${field('«قريب الاستحقاق» قبل الدفع بـ (يوم)', inp('due_soon_days', s.due_soon_days, { type: 'number', min: 1 }))}${field('مدة التنبيه الافتراضية للعملاء (يوم)', inp('default_pay_alert_days', s.default_pay_alert_days, { type: 'number', min: 0 }))}
        ${field('وقت التنبيه الافتراضي', inp('default_alert_time', s.default_alert_time || '09:00', { type: 'time' }))}${field('تذكير التأخر كل (يوم)', inp('late_reminder_every_days', s.late_reminder_every_days ?? 2, { type: 'number', min: 1 }))}</div>${saveBtn('alerts')}</form>` : ''}
      <p class="small" style="margin:0">تنبيهات الدفع والتجارب تظهر دائمًا داخل التطبيق (الرئيسية والدفعات القادمة). ويمكنك أيضًا استلامها على جوالك: <b>تنبيهات الدفعات في الوقت المحدد لكل عميل، وملخص يومي في الوقت الافتراضي</b> بعد تفعيل الإشعارات على هذا الجهاز:</p>
      <div class="row small"><span class="badge b-gray" data-push-state>جارٍ التحقق…</span></div>
      <div class="grid-2"><button class="btn primary" data-push-on>${icon('bell')} تفعيل على هذا الجهاز</button><button class="btn ghost" data-push-test>${icon('send')} إرسال إشعار تجريبي</button></div>
      <button class="btn sm ghost" data-push-off>إيقاف الإشعارات على هذا الجهاز</button>
      <p class="xs muted" style="margin:0">على Android: يجب أن يكون التطبيق مثبتًا أو مفتوحًا في Chrome، وأن تسمح بالإشعارات عند الطلب.</p></div>`)}

    ${admin ? sec('followup', 'calendarCheck', 'المتابعة اليومية والمهام', html`<form class="form-grid" data-form="followup">
      <div class="grid-2">${field('تكرار المراجعة الافتراضي (يوم)', inp('followup_default_every', s.followup_default_every, { type: 'number', min: 1 }))}${field('أولوية المهام الافتراضية', sel('task_default_priority', TASK_PRIORITY, s.task_default_priority))}</div>
      <b class="small">بنود قائمة المتابعة</b><div class="stack" style="gap:6px" data-checklist>${(s.checklist || []).map((l) => clItem(l))}</div>
      <div class="row"><input data-new-cl placeholder="بند جديد…"><button type="button" class="btn sm" data-add-cl>${icon('plus', 'sm')}</button></div>${saveBtn('followup')}</form>`) : ''}

    ${sec('security', 'shield', 'الأمان', html`<div class="stack">
      <button class="btn ghost block" data-pass>${icon('key')} تغيير كلمة المرور</button>
      ${window.PublicKeyCredential ? html`<button class="btn ghost block" data-bio>${icon('fingerprint')} تفعيل الدخول بالبصمة على هذا الجهاز</button>` : ''}
      ${creds.length ? html`<div class="list">${creds.map((c) => html`<div class="item" style="cursor:default">${icon('fingerprint')}<div class="it-body"><div class="it-title">${c.label}</div><div class="it-sub">${dateTime(c.created_at)}</div></div><button class="icon-btn" data-rm-cred="${c.id}">${icon('trash', 'sm')}</button></div>`)}</div>` : ''}
      <button class="btn ghost block" data-logout-all>${icon('logout')} تسجيل الخروج من جميع الأجهزة الأخرى</button>
      ${admin ? html`<form class="form-grid" data-form="security"><div class="grid-3">${field('قفل الخزنة بعد (دقيقة)', inp('vault_lock_minutes', s.vault_lock_minutes, { type: 'number', min: 1 }))}${field('مدة الجلسة (ساعة)', inp('session_hours', s.session_hours, { type: 'number', min: 1 }))}${field('«تذكرني» (يوم)', inp('remember_days', s.remember_days, { type: 'number', min: 1 }))}</div>${saveBtn('security')}</form>
        <div class="row small"><span class="badge ${state.vaultKey ? 'b-green' : 'b-red'}">${state.vaultKey ? 'مفتاح تشفير الخزنة مضبوط' : 'مفتاح الخزنة غير مضبوط'}</span></div>` : ''}</div>`)}

    <div class="card"><div class="qa">
      ${can('users.manage') ? html`<a href="#/users"><span class="q-ic qc-purple">${icon('shield')}</span>المستخدمون والصلاحيات</a>` : ''}
      ${can('data.export') ? html`<a href="#/backup"><span class="q-ic qc-cyan">${icon('cloud')}</span>النسخ الاحتياطي والتصدير</a>` : ''}
      ${can('activity.view') ? html`<a href="#/activity"><span class="q-ic qc-gold">${icon('history')}</span>سجل النشاط</a>` : ''}
      ${can('clients.view') ? html`<a href="#/categories"><span class="q-ic qc-pink">${icon('tag')}</span>التصنيفات</a>` : ''}
    </div></div>

    ${sec('install', 'download', 'التثبيت على الجوال', html`<p class="small" style="margin-top:0">${installed ? '✅ التطبيق مثبت ويعمل كتطبيق مستقل.' : 'ثبّت التطبيق على شاشتك الرئيسية ليعمل كتطبيق مستقل بأيقونتك الخاصة.'}</p>
      ${!installed ? html`<button class="btn primary block" data-install>${icon('download')} تثبيت التطبيق</button><p class="xs muted">إن لم يظهر زر التثبيت: افتح قائمة Chrome (⋮) ثم «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».</p>` : ''}`)}

    ${admin ? sec('demo', 'box', 'البيانات التجريبية', html`<p class="small" style="margin-top:0">لتجربة التطبيق يمكنك إضافة بيانات وهمية (8 عملاء مع حملات ومدفوعات وتقارير). كل سجلاتها معرّفة بـ <span class="ltr">demo_</span> وتُحذف بضغطة واحدة دون المساس ببياناتك الحقيقية.</p>
      <div class="row"><span class="badge ${demo.demo_clients ? 'b-gold' : 'b-gray'}">${demo.demo_clients ? `يوجد ${demo.demo_clients} عملاء تجريبيين` : 'لا توجد بيانات تجريبية'}</span></div>
      <div class="grid-2" style="margin-top:10px"><button class="btn ghost" data-demo="seed" ${demo.demo_clients ? raw('disabled') : ''}>${icon('box')} إضافة بيانات تجريبية</button><button class="btn danger" data-demo="clear" ${!demo.demo_clients ? raw('disabled') : ''}>${icon('trash')} حذف البيانات التجريبية</button></div>`) : ''}

    <p class="center xs faint">Media Buyer Control Center • الإصدار 1.0.0</p>
  </div>`);

  // ---- handlers ----
  const checklistEl = main.querySelector('[data-checklist]');
  main.addEventListener('click', async (e) => {
    const t = e.target;
    try {
      const sv = t.closest('[data-save]');
      if (sv) {
        e.preventDefault();
        const form = sv.closest('form'), body = {};
        for (const el of form.elements) {
          if (!el.name || el.name === 'local_theme' || el.disabled) continue;
          body[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
        }
        if (sv.dataset.save === 'quick') body.quick_checklist = [...main.querySelectorAll('[data-q]')].map((x) => ({ id: x.dataset.q, label: x.querySelector('[data-ql]').value.trim(), core: x.querySelector('[data-qc]').classList.contains('on') })).filter((x) => x.label);
        if (sv.dataset.save === 'followup') body.checklist = [...checklistEl.querySelectorAll('[data-cl]')].map((x) => x.dataset.cl);
        if (sv.dataset.save === 'look') {
          const lt = form.local_theme.value; try { lt ? localStorage.setItem('mbcc_theme', lt) : localStorage.removeItem('mbcc_theme'); } catch {}
        }
        if (Object.keys(body).length) await put('/api/settings', body);
        await loadSettings(); applyTheme(state.settings.theme); toast('تم حفظ الإعدادات');
        return;
      }
      if (t.closest('[data-add-q]')) { const i = main.querySelector('[data-new-q]'); if (i.value.trim()) { main.querySelector('[data-quick]').insertAdjacentHTML('beforeend', String(qItem({ id: 'q' + Date.now().toString(36), label: i.value.trim(), core: false }))); i.value = ''; } return; }
      const qrm = t.closest('[data-rm-q]'); if (qrm) { qrm.closest('[data-q]').remove(); return; }
      const qup = t.closest('[data-up-q]'); if (qup) { const row = qup.closest('[data-q]'); row.previousElementSibling?.before(row); return; }
      const qc = t.closest('[data-qc]'); if (qc) { qc.classList.toggle('on'); qc.style.color = qc.classList.contains('on') ? 'var(--gold)' : ''; return; }
      if (t.closest('[data-push-on]')) { const P = await import('../push.js'); await P.enablePush(); toast('تم تفعيل الإشعارات على هذا الجهاز'); return pushState(); }
      if (t.closest('[data-push-off]')) { const P = await import('../push.js'); await P.disablePush(); toast('تم إيقاف الإشعارات على هذا الجهاز'); return pushState(); }
      if (t.closest('[data-push-test]')) { const r = await post('/api/push/test'); toast(r.results.every((x) => x === 'ok') ? 'تم الإرسال — تحقق من إشعارات جوالك' : `نتيجة الإرسال: ${r.results.join('، ')}`, r.results.every((x) => x === 'ok') ? 'ok' : 'err'); return; }
      if (t.closest('[data-add-cl]')) { const i = main.querySelector('[data-new-cl]'); if (i.value.trim()) { checklistEl.insertAdjacentHTML('beforeend', String(clItem(i.value.trim()))); i.value = ''; } return; }
      const rm = t.closest('[data-rm-cl]'); if (rm) { rm.closest('[data-cl]').remove(); return; }
      const up = t.closest('[data-up-cl]'); if (up) { const row = up.closest('[data-cl]'); row.previousElementSibling?.before(row); return; }
      if (t.closest('[data-reset-identity]')) { await put('/api/settings', { identity_image: null }); await loadSettings(); toast('تمت استعادة الصورة الأصلية'); return location.reload(); }
      if (t.closest('[data-pass]')) {
        await formSheet({ title: 'تغيير كلمة المرور', body: html`${field('كلمة المرور الحالية', inp('current', '', { type: 'password', req: true, attrs: 'autocomplete="current-password"' }))}${field('كلمة المرور الجديدة (10 أحرف على الأقل)', inp('next', '', { type: 'password', req: true, attrs: 'minlength="10" autocomplete="new-password"' }))}${field('تأكيد', inp('next2', '', { type: 'password', req: true, attrs: 'autocomplete="new-password"' }))}`,
          onSubmit: async (d) => { if (d.next !== d.next2) throw new Error('كلمتا المرور غير متطابقتين'); await post('/api/auth/password', d); toast('تم تغيير كلمة المرور — تم إنهاء جلسات الأجهزة الأخرى'); return true; } });
        return;
      }
      if (t.closest('[data-bio]')) { const { webauthnRegister } = await import('../webauthn.js'); await webauthnRegister(navigator.userAgentData?.platform || (/Android/.test(navigator.userAgent) ? 'Android' : 'جهاز')); toast('تم تفعيل الدخول بالبصمة لهذا الجهاز'); return refresh(); }
      const rc = t.closest('[data-rm-cred]'); if (rc) { await post('/api/auth/webauthn/remove', { id: rc.dataset.rmCred }); toast('تم الحذف'); return refresh(); }
      if (t.closest('[data-logout-all]')) { if (await confirmBox('تسجيل الخروج من جميع الأجهزة الأخرى؟')) { await post('/api/auth/logout-all'); toast('تم'); } return; }
      if (t.closest('[data-install]')) { if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; } else toast('من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»'); return; }
      const dm = t.closest('[data-demo]');
      if (dm) {
        if (dm.dataset.demo === 'seed') { await post('/api/demo/seed'); toast('تمت إضافة البيانات التجريبية'); }
        else if (await confirmBox('حذف كل البيانات التجريبية؟ لن تتأثر بياناتك الحقيقية.', { danger: true, ok: 'حذف' })) { await post('/api/demo/clear'); toast('تم حذف البيانات التجريبية'); }
        invalidate(); return refresh();
      }
      if (t.closest('[data-templates]')) return templatesSheet();
    } catch (err) { toast(err.message || 'تعذر الإجراء', 'err'); }
  });
  async function pushState() {
    const el = main.querySelector('[data-push-state]'); if (!el) return;
    const P = await import('../push.js');
    const st = await P.pushStatus();
    el.textContent = st.label; el.className = `badge ${st.on ? 'b-green' : st.supported ? 'b-gold' : 'b-red'}`;
  }
  pushState();
  main.querySelector('[data-identity]')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = await readImageAsDataURL(f, 512); await put('/api/settings', { identity_image: d }); await loadSettings(); toast('تم تحديث صورة الهوية'); location.reload(); } catch (err) { toast(err.message, 'err'); }
  });
}

const qItem = (x) => html`<div class="cl-item" data-q="${x.id}"><button type="button" class="icon-btn ${x.core ? 'on' : ''}" data-qc title="بند أساسي" style="${x.core ? 'color:var(--gold)' : ''}">${icon('star', 'sm')}</button><input data-ql value="${x.label}" style="min-height:38px;padding:6px 10px"><button type="button" class="icon-btn" data-up-q title="أعلى">${icon('chevR', 'sm')}</button><button type="button" class="icon-btn" data-rm-q>${icon('x', 'sm')}</button></div>`;
const clItem = (l) => html`<div class="cl-item" data-cl="${l}"><span class="q">${l}</span><button type="button" class="icon-btn" data-up-cl title="أعلى">${icon('chevR', 'sm')}</button><button type="button" class="icon-btn" data-rm-cl>${icon('x', 'sm')}</button></div>`;

async function templatesSheet() {
  const { items } = await get('/api/service-templates');
  await sheet({ title: 'قوالب الخدمات', body: html`<div class="list" data-tl>${items.map((x) => html`<div class="item" style="cursor:default"><div class="it-body"><div class="it-title">${x.name}</div><div class="it-sub">${x.description || ''}</div></div><b>${money(x.price)}</b><button class="icon-btn" data-del-t="${x.id}">${icon('trash', 'sm')}</button></div>`)}</div>
    <form class="form-grid" data-new-t style="margin-top:12px">${inp('name', '', { ph: 'اسم الخدمة', req: true })}${inp('description', '', { ph: 'الوصف' })}${inp('price', '', { type: 'number', ph: 'السعر', step: 'any' })}<button class="btn primary">${icon('plus')} إضافة قالب</button></form>`,
    onMount: (el, close) => {
      el.addEventListener('click', async (e) => { const b = e.target.closest('[data-del-t]'); if (b) { await del(`/api/service-templates/${b.dataset.delT}`); b.closest('.item').remove(); } });
      el.querySelector('[data-new-t]').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target; await post('/api/service-templates', { name: f.name.value, description: f.description.value, price: f.price.value }); toast('تمت الإضافة'); close(); templatesSheet(); });
    } });
}
