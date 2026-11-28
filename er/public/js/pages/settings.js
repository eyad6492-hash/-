// Settings — account, partner & invitation, appearance, calendar, notifications, privacy, security, data.
import { post, patch, uploadFile } from '../api.js';
import { store, syncNow } from '../store.js';
import { esc, icon, avatar, pageHead, toast, toastErr, openSheet, copyText, shareOrCopy, confirmBox } from '../ui.js';
import { openForm } from '../form.js';
import { pushStatus, enablePush, disablePush } from '../push.js';
import { applyTheme, logoutLocal } from '../app.js';
import { tzName } from '../labels.js';

let push = null;
const NOTIFY = [
  ['يومنا', [['daily', 'المهام اليومية'], ['reminders', 'ذكرني بشيء'], ['urgent', 'الأشياء العاجلة'], ['outings', 'خطط الخروج'], ['cravings', 'وش نفسك فيه اليوم؟'], ['mood', 'مزاج الطرف الآخر']]],
  ['خططنا', [['appointments', 'مواعيدنا (المستشفى والمراجعات)'], ['events', 'مواعيد التقويم'], ['dates', 'المناسبات وأعياد الميلاد'], ['anniversary', 'الذكرى الشهرية والسنوية'], ['trips', 'الرحلات'], ['plans', 'الخطط الشهرية'], ['tasks', 'المهام (تكليف، إنجاز، تعليقات)']]],
  ['أمنياتنا', [['wishes', 'الأمنيات واختيارها وتحقيقها'], ['requests', 'الطلبات والردود'], ['needs', 'الأغراض الناقصة'], ['shopping', 'المقاضي']]],
  ['ذكرياتنا وتواصلنا', [['memories', 'توثيق ذكرى جديدة'], ['notes', 'الرسائل الصغيرة'], ['confessions', 'الاعترافات'], ['upsets', 'المواقف التي تحتاج نقاشًا'], ['commitments', 'التعهدات وطلبات الموافقة'], ['agreements', 'الاتفاقيات وطلبات الموافقة']]],
];
const TZS = ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Amman', 'Africa/Cairo', 'Europe/Istanbul', 'Europe/London', 'Europe/Paris', 'America/New_York'];

async function saveSettings(s) {
  await patch('/api/me', { settings: s });
  for (const [k, v] of Object.entries(s)) { if (typeof v === 'object' && !Array.isArray(v)) Object.assign(store.me.settings[k], v); else store.me.settings[k] = v; }
  syncNow();
}

export default {
  async render(el) {
    const me = store.me, p = store.partner, s = me.settings;
    if (!push) pushStatus().then((x) => { push = x; this.render(el); }).catch(() => { push = { supported: false, label: 'غير متاح' }; });
    const seg = (k, options, cur) => `<div class="seg">${options.map(([v, l]) => `<button data-set="${k}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const row = (ic, title, sub, right, attrs = '') => `<div class="set-row" ${attrs}><div class="l"><span class="ic-box">${icon(ic)}</span><div style="min-width:0"><div style="font-weight:500">${title}</div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</div></div>${right}</div>`;
    const btnRow = (ic, title, sub, act, tone = '') => `<button class="set-row" data-act="${act}"><div class="l"><span class="ic-box ${tone}">${icon(ic)}</span><div style="min-width:0;text-align:right"><div style="font-weight:500">${title}</div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</div></div>${icon('chevL', 'sm')}</button>`;
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'تفضيلاتنا', ar: 'الإعدادات', back: '#/more' })}
      <div class="card"><div class="row" style="gap:14px"><button data-act="avatar" style="border:0;background:none;padding:0;cursor:pointer;position:relative">${avatar(me, 'lg')}<span class="ic-box" style="position:absolute;bottom:-4px;left:-4px;width:26px;height:26px;border-radius:9px">${icon('image', 'sm')}</span></button>
        <div class="grow"><div style="font-weight:600;font-size:17px">${esc(me.name)} <span class="en muted">(${me.letter})</span></div><div class="small muted" dir="ltr" style="text-align:right">${esc(me.email)}</div></div><button class="btn sm soft" data-act="profile">تعديل</button></div></div>

      <div class="section-title"><h2>مساحتنا</h2><span class="en">مساحة لشخصين</span></div>
      <div class="card">${p ? row('users', `${esc(p.name)} (${p.letter})`, 'متصلان ✓ — كل التعديلات تظهر للطرفين مباشرة', avatar(p)) + btnRow('lock', `رابط إعادة تعيين كلمة مرور ${esc(p.name)}`, 'إذا نسي/نسيت كلمة المرور', 'resetlink')
        : btnRow('send', 'دعوة الطرف الآخر', 'أنشئ رابط دعوة خاص صالح لمدة 7 أيام — المساحة لشخصين فقط', 'invite', 'rose')}
        ${btnRow('heart', 'منذ أن عرفنا بعض ❤️', store.space.since ? 'تعديل تاريخ ووقت أول يوم، الذكرى والصورة' : 'حدّدوا تاريخ ووقت أول يوم تعرفتم فيه', 'since', 'rose')}
        ${row('wallet', 'العملة', '', `<button class="btn sm soft" data-act="currency">${esc(store.space.currency || 'ر.س')}</button>`)}</div>

      <div class="section-title"><h2>المظهر</h2><span class="en">الشكل</span></div>
      <div class="card"><div class="field" style="margin:0"><span>الوضع</span>${seg('theme', [['auto', 'تلقائي'], ['light', 'فاتح ☀︎'], ['dark', 'داكن ☾']], s.theme)}</div></div>

      <div class="section-title"><h2>التقويم والتاريخ</h2><span class="en">التواريخ</span></div>
      <div class="card"><div class="field"><span>عرض التاريخ</span>${seg('date_display', [['both', 'الاثنين'], ['g', 'ميلادي'], ['h', 'هجري']], s.date_display)}</div>
        <div class="field"><span>الأرقام</span>${seg('numerals', [['latn', 'إنجليزية 123'], ['arab', 'عربية ١٢٣']], s.numerals || 'latn')}</div>
        <div class="field"><span>بداية الأسبوع</span>${seg('week_start', [[6, 'السبت'], [0, 'الأحد'], [1, 'الاثنين']], s.week_start)}</div>
        <div class="inline-fields"><label class="field" style="margin:0"><span>المنطقة الزمنية</span><select data-sel="tz">${[...new Set([s.tz, ...TZS])].map((z) => `<option value="${z}" ${z === s.tz ? 'selected' : ''}>${tzName(z)}</option>`).join('')}</select></label>
        <label class="field" style="margin:0"><span>وقت التذكيرات اليومية</span><select data-sel="remind_hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === s.remind_hour ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></label></div>
        <div class="tiny muted" style="margin-top:8px">التقويم الهجري حسب تقويم أم القرى.</div></div>

      <div class="section-title"><h2>الإشعارات</h2><span class="en">التنبيهات</span></div>
      <div class="card">${row('bell', 'إشعارات الجوال', esc(push?.label || '…'), push?.supported ? (push.on ? `<div class="row" style="gap:6px"><button class="btn sm soft" data-act="pushtest">تجربة</button><button class="btn sm ghost" data-act="pushoff">إيقاف</button></div>` : '<button class="btn sm rose" data-act="pushon">تفعيل</button>') : '')}
        <div class="divider"></div><div class="small muted" style="margin-bottom:6px">أرسل لي إشعارًا عن:</div>
        ${NOTIFY.map(([g, items]) => `<div class="tiny" style="color:var(--rose-deep);font-weight:600;margin-top:10px">${g}</div>` + items.map(([k, l]) => `<div class="set-row" style="padding:8px 0"><span class="small">${l}</span><label class="toggle"><input type="checkbox" data-notify="${k}" ${s.notify[k] !== false ? 'checked' : ''}><i></i></label></div>`).join('')).join('')}
        <div class="tiny muted">التذكير قبل المناسبات/المواعيد يُحدَّد لكل عنصر: يوم قبل، 3 أيام، أسبوع، أو وقت مخصص.</div></div>

      <div class="section-title"><h2>الخصوصية</h2><span class="en">خصوصيتنا</span></div>
      <div class="card">${me.letter === 'R' || s.cycle.enabled ? btnRow('drop', 'قسم الدورة الشهرية', s.cycle.enabled ? `${s.cycle.has_pin ? 'مقفل برمز' : 'بدون قفل'} · ${s.cycle.share === 'prediction' ? 'الموعد المتوقع مشارك' : 'غير مشارك'}${s.cycle.hide ? ' · مخفي من القائمة' : ''}` : 'غير مفعّل', 'cycle', 'rose') : ''}
        ${row('shield', 'بياناتكما خاصة', 'لا يمكن لأي شخص ثالث إنشاء حساب أو الوصول للمساحة. الملاحظة الخاصة في المزاج وقسم الدورة لا يراها الطرف الآخر.', '')}</div>

      <div class="section-title"><h2>الأمان</h2><span class="en">الحماية</span></div>
      <div class="card">${btnRow('lock', 'تغيير كلمة المرور', '', 'password')}${btnRow('copy', 'رمز استعادة جديد', 'لاستعادة كلمة المرور إذا نسيتها', 'recovery')}${btnRow('logout', 'تسجيل الخروج من كل الأجهزة', '', 'logoutall')}</div>

      <div class="section-title"><h2>البيانات</h2><span class="en">النسخ والحذف</span></div>
      <div class="card">${btnRow('download', 'تصدير نسخة من البيانات', 'ملف بيانات لحفظه لديك', 'export')}${btnRow('trash', 'حذف البيانات التي أضفتها', '', 'wipemine', 'brown')}${btnRow('trash', 'حذف كل بيانات المساحة', 'لا يمكن التراجع', 'wipeall', 'rose')}</div>

      <button class="btn ghost block" style="margin-top:18px" data-act="logout">${icon('logout', 'sm')} تسجيل الخروج</button>
      <p class="center tiny muted" style="margin-top:16px"><span class="logo" style="font-size:18px">E<i>&amp;</i>R</span> · v1.0</p>
      <input type="file" accept="image/*" id="avf" hidden>
    </div>`;

    el.onclick = async (e) => {
      const q = (x) => e.target.closest(x); let b;
      try {
        if ((b = q('[data-set]'))) {
          let v = b.dataset.v; if (b.dataset.set === 'week_start') v = Number(v);
          b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          await saveSettings({ [b.dataset.set]: v });
          if (b.dataset.set === 'theme' || b.dataset.set === 'numerals') applyTheme();
          toast('تم الحفظ'); return;
        }
        b = q('[data-act]'); if (!b) return;
        const a = b.dataset.act;
        if (a === 'avatar') return el.querySelector('#avf').click();
        if (a === 'profile') return openForm({ title: 'الحساب', en: 'حسابي', values: { name: me.name, email: me.email }, fields: [{ k: 'name', label: 'الاسم', required: true }, { k: 'email', label: 'البريد الإلكتروني', type: 'email', dir: 'ltr', required: true }, { k: 'password', label: 'كلمة المرور (مطلوبة فقط عند تغيير البريد)', type: 'password', dir: 'ltr' }], onSubmit: async (v) => { await patch('/api/me', v); me.name = v.name; me.email = v.email; syncNow(); toast('تم الحفظ'); } });
        if (a === 'invite') { const r = await post('/api/auth/invite'); return linkSheet('رابط الدعوة', 'دعوة', 'أرسل هذا الرابط للطرف الآخر ليُنشئ حسابه وينضم للمساحة. صالح 7 أيام ولمرة واحدة.', r.link, `انضم/ي لمساحتنا الخاصة على E&R 🤍\n${r.link}`); }
        if (a === 'resetlink') { const r = await post('/api/auth/reset-link'); return linkSheet('رابط إعادة التعيين', 'استعادة', `أرسل هذا الرابط إلى ${r.for} ليعيّن كلمة مرور جديدة. صالح 24 ساعة ولمرة واحدة.`, r.link, `رابط إعادة تعيين كلمة المرور في E&R:\n${r.link}`); }
        if (a === 'currency') return openForm({ title: 'العملة', values: { currency: store.space.currency }, fields: [{ k: 'currency', label: 'رمز العملة', placeholder: 'ر.س', hint: 'مثال: ر.س، SAR، $، د.إ' }], onSubmit: async (v) => { await patch('/api/space', v); store.space.currency = v.currency || 'ر.س'; syncNow(); } });
        if (a === 'pushon') { await enablePush(); push = await pushStatus(); toast('تم تفعيل الإشعارات'); return this.render(el); }
        if (a === 'pushoff') { await disablePush(); push = await pushStatus(); return this.render(el); }
        if (a === 'pushtest') { const r = await post('/api/push/test'); return toast(r.sent ? 'تم إرسال إشعار تجريبي' : 'لم يتم الإرسال — أعد التفعيل', r.sent ? '' : 'err'); }
        if (a === 'cycle') { location.hash = '#/cycle'; return; }
        if (a === 'since') return (await import('./since.js')).editSince();
        if (a === 'password') return openForm({ title: 'تغيير كلمة المرور', fields: [{ k: 'current', label: 'كلمة المرور الحالية', type: 'password', required: true, dir: 'ltr', autocomplete: 'current-password' }, { k: 'password', label: 'كلمة المرور الجديدة (8+)', type: 'password', required: true, dir: 'ltr', autocomplete: 'new-password' }], onSubmit: async (v) => { await post('/api/auth/password', v); toast('تم تغيير كلمة المرور'); } });
        if (a === 'recovery') return openForm({ title: 'رمز استعادة جديد', fields: [{ type: 'info', html: 'سيتوقف الرمز القديم عن العمل.' }, { k: 'password', label: 'كلمة المرور', type: 'password', required: true, dir: 'ltr' }], onSubmit: async (v) => { const r = await post('/api/auth/recovery-code', v); setTimeout(() => linkSheet('رمز الاستعادة', 'احفظه جيدًا', 'احفظه في مكان آمن. لن يظهر مرة أخرى.', r.recovery_code, r.recovery_code), 260); } });
        if (a === 'logoutall') { if (await confirmBox('سيتم تسجيل خروجك من كل الأجهزة.', { ok: 'تسجيل الخروج' })) { await post('/api/auth/logout-all'); logoutLocal(); } return; }
        if (a === 'logout') { await post('/api/auth/logout'); return logoutLocal(); }
        if (a === 'export') { location.href = '/api/export'; return; }
        if (a === 'wipemine') return openForm({ title: 'حذف بياناتي', fields: [{ type: 'info', html: 'سيتم حذف كل العناصر التي أضفتها أنت في جميع الأقسام. لن تُحذف بيانات الطرف الآخر.' }, { k: 'password', label: 'كلمة المرور', type: 'password', required: true, dir: 'ltr' }], submit: 'حذف', onSubmit: async (v) => { await post('/api/data/wipe', { scope: 'mine', password: v.password }); await syncNow(); toast('تم الحذف'); } });
        if (a === 'wipeall') return openForm({ title: 'حذف كل البيانات', fields: [{ type: 'info', html: 'سيتم حذف كل بيانات المساحة للطرفين نهائيًا (الحسابات تبقى). يُنصح بتصدير نسخة أولًا.' }, { k: 'confirm', label: 'اكتب كلمة «حذف» للتأكيد', required: true }, { k: 'password', label: 'كلمة المرور', type: 'password', required: true, dir: 'ltr' }], submit: 'حذف نهائي', onSubmit: async (v) => { await post('/api/data/wipe', { scope: 'all', ...v }); await syncNow(); toast('تم حذف كل البيانات'); } });
      } catch (err) { toastErr(err); }
    };
    el.onchange = async (e) => {
      try {
        if (e.target.id === 'avf' && e.target.files[0]) { const id = await uploadFile(e.target.files[0], { max: 512 }); await patch('/api/me', { avatar_id: id }); me.avatar_id = id; syncNow(); toast('تم تحديث الصورة'); this.render(el); }
        const sel = e.target.dataset.sel; if (sel) { await saveSettings({ [sel]: sel === 'remind_hour' ? Number(e.target.value) : e.target.value }); toast('تم الحفظ'); }
        const nk = e.target.dataset.notify; if (nk) { await saveSettings({ notify: { [nk]: e.target.checked } }); }
      } catch (err) { toastErr(err); }
    };
  },
};

function linkSheet(title, en, text, value, shareText) {
  openSheet({ title, en, body: `<p class="small" style="color:var(--ink2);margin-top:0">${esc(text)}</p><div class="code-box" style="font-size:13px">${esc(value)}</div>`, foot: `<button class="btn" data-share>${icon('send', 'sm')} مشاركة</button><button class="btn soft" data-copy>${icon('copy', 'sm')} نسخ</button>`, onMount: (sh) => { sh.querySelector('[data-copy]').onclick = () => copyText(value); sh.querySelector('[data-share]').onclick = () => shareOrCopy(shareText); } });
}
