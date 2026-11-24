import { html, icon, mount, toast, confirmBox, downloadBlob, dateTime, formSheet, field, inp, esc } from '../ui.js';
import { api, get, post } from '../api.js';
import { can, setTitle, go } from '../app.js';
import { today } from '../forms.js';

export default async function backupPage(main) {
  setTitle('النسخ الاحتياطي');
  let last = null; try { last = localStorage.getItem('mbcc_last_backup'); } catch {}
  mount(main, html`
    <div class="card"><div class="row"><span class="logo" style="background:var(--grad-primary)">${icon('cloud')}</span><div class="grow"><b>إنشاء نسخة احتياطية</b><div class="muted small">آخر نسخة من هذا الجهاز: ${last ? dateTime(last) : 'لا يوجد'}</div></div></div>
      <p class="small muted">تشمل النسخة: العملاء، الحملات وسجل أدائها، التقارير، المدفوعات، الاشتراكات وسجل التجميد، المهام، المتابعات، عروض الأسعار، قوالب الخدمات، التصنيفات، الإعدادات وسجل النشاط. لا تشمل كلمات مرور المستخدمين أبدًا.</p>
      <div class="stack">
        <button class="btn ghost block" data-exp="plain">${icon('download')} نسخة عادية (بدون بيانات الخزنة)</button>
        <button class="btn primary block" data-exp="enc">${icon('lock')} نسخة مشفرة بكلمة مرور (موصى بها)</button>
        ${can('vault.reveal') ? html`<button class="btn ghost block" data-exp="vault">${icon('vault')} نسخة مشفرة كاملة تشمل الخزنة</button>` : ''}
      </div>
      <p class="xs muted" style="margin-bottom:0">${icon('info', 'sm')} احفظ الملف خارج التطبيق (Google Drive، بريدك، أو ذاكرة خارجية). النسخة المشفرة لا يمكن فتحها بدون كلمة مرورها — احفظ كلمة المرور في مكان آمن.</p></div>

    ${can('settings.manage') ? html`<div class="card"><div class="row"><span class="logo" style="background:linear-gradient(135deg,#0e8a7e,#0b4f55)">${icon('upload')}</span><div class="grow"><b>استعادة نسخة احتياطية</b><div class="muted small">يتم التحقق من سلامة الملف قبل الاستعادة</div></div></div>
      <label class="btn ghost block" style="margin-top:12px">${icon('upload')} اختيار ملف النسخة<input type="file" accept=".json,application/json" data-file hidden></label>
      <div data-inspect style="margin-top:10px"></div></div>` : ''}

    <div class="card"><div class="section-head"><h3>تصدير البيانات (CSV / Excel)</h3></div><p class="muted small" style="margin-top:0">ملفات بدون أي كلمات مرور أو بيانات دخول.</p>
      <div class="grid-2">${[['clients', 'العملاء'], ['payments', 'المدفوعات'], ['campaigns', 'الحملات'], ['tasks', 'المهام']].map(([k, l]) => html`<button class="btn sm ghost" data-csv="${k}">${icon('download', 'sm')} ${l}</button>`)}</div></div>`);

  main.addEventListener('click', async (e) => {
    const ex = e.target.closest('[data-exp]');
    if (ex) {
      const kind = ex.dataset.exp;
      let body = {};
      if (kind !== 'plain') {
        const r = await formSheet({ title: kind === 'vault' ? 'نسخة مشفرة تشمل الخزنة' : 'نسخة مشفرة', submit: 'إنشاء النسخة',
          body: html`${field('كلمة مرور النسخة (10 أحرف على الأقل)', inp('p1', '', { type: 'password', req: true, attrs: 'minlength="10" autocomplete="new-password"' }))}${field('تأكيد كلمة المرور', inp('p2', '', { type: 'password', req: true, attrs: 'autocomplete="new-password"' }))}
            <p class="xs muted" style="margin:0">لا يمكن استرجاع هذه الكلمة. بدونها لا يمكن استعادة النسخة.</p>`,
          onSubmit: (d) => { if (d.p1 !== d.p2) throw new Error('كلمتا المرور غير متطابقتين'); return { passphrase: d.p1 }; } });
        if (!r) return;
        body = { passphrase: r.passphrase, include_vault: kind === 'vault' };
      }
      try {
        const file = await post('/api/backup/export', body);
        downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), `mbcc-backup-${today()}${file.encrypted ? '-encrypted' : ''}.json`);
        try { localStorage.setItem('mbcc_last_backup', new Date().toISOString()); } catch {}
        toast('تم إنشاء النسخة الاحتياطية — احفظها في مكان آمن');
      } catch (err) {
        if (err.code === 'vault_locked') { toast('افتح الخزنة أولًا ثم أعد المحاولة', 'err'); go('#/vault'); } else toast(err.message, 'err');
      }
      return;
    }
    const csv = e.target.closest('[data-csv]');
    if (csv) {
      const res = await fetch(`/api/export/${csv.dataset.csv}`, { credentials: 'same-origin' });
      if (!res.ok) return toast('تعذر التصدير', 'err');
      downloadBlob(await res.blob(), `${csv.dataset.csv}-${today()}.csv`);
    }
  });

  main.querySelector('[data-file]')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const box = main.querySelector('[data-inspect]');
    let file;
    try { file = JSON.parse(await f.text()); } catch { return toast('الملف ليس JSON صالحًا', 'err'); }
    let passphrase = '';
    if (file.encrypted) {
      const r = await formSheet({ title: 'نسخة مشفرة', submit: 'فتح', body: field('كلمة مرور النسخة', inp('p', '', { type: 'password', req: true })), onSubmit: (d) => ({ p: d.p }) });
      if (!r) return; passphrase = r.p;
    }
    try {
      const { meta } = await post('/api/backup/inspect', { file, passphrase });
      mount(box, html`<div class="card flat" style="border-color:rgba(34,197,94,.4)"><div class="row"><span class="badge b-green">${icon('checkCircle', 'sm')} الملف سليم</span><span class="muted small">${dateTime(meta.created_at)}</span></div>
        <div class="kvlist" style="margin-top:8px"><div><span>أنشأها</span><span>${meta.created_by}</span></div><div><span>مشفرة</span><span>${file.encrypted ? 'نعم' : 'لا'}</span></div><div><span>تشمل الخزنة</span><span>${meta.includes_vault ? 'نعم' : 'لا'}</span></div>
          ${Object.entries(meta.counts).map(([k, v]) => html`<div><span>${k}</span><span class="num">${v}</span></div>`)}</div>
        <div class="stack" style="margin-top:12px">
          <button class="btn ghost block" data-restore="merge">${icon('layers')} دمج آمن (إضافة الناقص فقط — لا يُغيّر الموجود)</button>
          <button class="btn danger block" data-restore="replace">${icon('refresh')} استبدال كامل بالنسخة</button></div>
        <p class="xs muted">قبل الاستبدال الكامل سيتم تنزيل نسخة احتياطية تلقائية من البيانات الحالية.</p></div>`);
      box.onclick = async (ev) => {
        const b = ev.target.closest('[data-restore]'); if (!b) return;
        const mode = b.dataset.restore;
        if (mode === 'replace') {
          if (!(await confirmBox('سيتم استبدال البيانات الحالية بمحتوى النسخة. سنقوم أولًا بتنزيل نسخة احتياطية من بياناتك الحالية. متابعة؟', { danger: true, ok: 'استبدال' }))) return;
          const cur = await post('/api/backup/export', {});
          downloadBlob(new Blob([JSON.stringify(cur)], { type: 'application/json' }), `mbcc-before-restore-${today()}.json`);
        }
        b.disabled = true;
        try { const r = await post('/api/backup/restore', { file, passphrase, mode }); toast(`تمت الاستعادة (${mode === 'replace' ? 'استبدال' : 'دمج'})`); setTimeout(() => location.reload(), 900); void r; }
        catch (err) { toast(err.message, 'err'); b.disabled = false; }
      };
    } catch (err) { mount(box, html`<div class="card flat" style="border-color:rgba(244,63,94,.4)"><span class="badge b-red">${icon('alert', 'sm')} ${err.message}</span></div>`); }
    e.target.value = '';
  });
  void api; void get; void esc;
}
