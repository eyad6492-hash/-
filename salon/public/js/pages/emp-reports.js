// Employee PDF reports: generate (frozen snapshot) → preview → save PDF → send to the employee; plus the archive.
import { html, icon, mount, date, dateTime, badge, empty, toast, sel, esc } from '../ui.js';
import { get, post, upload, qs, lookups } from '../api.js';
import { setTitle, state, go } from '../app.js';
import { reportHtml, fitPreview } from './report-render.js';
import { elementToPdf, sharePdf } from '../pdf.js';
import { periodRange } from '../shared.js';

const TYPE = { day: 'يومي', week: 'أسبوعي', month: 'شهري', custom: 'مخصص' };

export async function render(view, { query, isCurrent }) {
  setTitle('تقارير الموظفين');
  const [staff, arch] = await Promise.all([lookups.staff(), get('/api/employee-reports' + qs({ user_id: query.user_id }))]);
  if (!isCurrent()) return;
  const barbers = staff.filter((s) => s.works_shifts);
  let ptype = 'month';
  mount(view, html`
    <div class="page-head"><div><h2>تقارير الموظفين</h2><p>تقرير PDF احترافي لكل حلاق — معاينة، تنزيل، إرسال وأرشفة</p></div></div>
    <div class="card gold-edge">
      <div class="form-grid two">
        <label class="field"><span>الموظف</span>${sel('user_id', barbers.map((b) => ({ v: b.id, l: b.full_name + (b.active ? '' : ' (معطل)') })), query.user_id || '', { empty: 'اختر الموظف' })}</label>
        <div class="field"><span>الفترة</span><div class="chips" data-pt>${Object.entries({ day: 'اليوم', week: 'الأسبوع', month: 'الشهر', custom: 'فترة مخصصة' }).map(([k, l]) => html`<button type="button" class="chip ${k === 'month' ? 'active' : ''}" data-k="${k}">${l}</button>`)}</div></div>
        <label class="field" data-ref><span>ضمن تاريخ</span><input type="date" name="ref" value="${state.today}"></label>
        <div class="field hidden" data-cust><span>من – إلى</span><div style="display:flex;gap:8px"><input type="date" name="from" value="${periodRange('month', state.today).from}"><input type="date" name="to" value="${state.today}"></div></div>
        <label class="check full"><input type="checkbox" name="imgs"> تضمين صور الفواتير كملحق</label>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn primary" data-gen>${icon('file')} إنشاء التقرير ومعاينته</button></div>
    </div>
    <div id="work"></div>
    <h3 class="section-title">أرشيف التقارير</h3>
    <div class="toolbar">${sel('f_user', barbers.map((b) => ({ v: b.id, l: b.full_name })), query.user_id || '', { empty: 'كل الموظفين' })}</div>
    ${arch.items.length ? html`
      <div class="only-desk"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>رقم</th><th>الموظف</th><th>النوع</th><th>الفترة</th><th>الإصدار</th><th>المسؤول</th><th>الحالة</th><th>الإرسال</th><th></th></tr></thead><tbody>
      ${arch.items.map((r) => html`<tr><td class="num">${r.number}</td><td>${r.full_name}</td><td>${TYPE[r.period_type]}</td><td class="num">${r.date_from} → ${r.date_to}</td><td>${dateTime(r.issued_at)}</td><td>${r.issued_by_name || '—'}</td>
        <td>${badge(r.status)}${r.viewed_at ? html` <span class="badge green">شوهد</span>` : ''}</td><td>${r.sent_at ? html`${dateTime(r.sent_at)} <span class="muted">(${r.send_count}×) ${r.sent_by_name || ''}</span>` : '—'}</td>
        <td style="display:flex;gap:6px"><a class="btn sm" href="#/emp-reports/${r.id}">${icon('eye', 'sm')}</a><a class="btn sm" href="/api/files/${r.pdf_file_id}?download=MrVibe-report-${r.number}.pdf">${icon('download', 'sm')}</a><button class="btn sm" data-send="${r.id}">${icon('send', 'sm')} ${r.send_count ? 'إعادة' : 'إرسال'}</button></td></tr>`)}
      </tbody></table></div></div>
      <div class="only-mob list">${arch.items.map((r) => html`<div class="row"><a class="main" href="#/emp-reports/${r.id}"><div class="t">#<span class="num">${r.number}</span> ${r.full_name} • ${TYPE[r.period_type]}</div>
        <div class="s"><span class="num">${r.date_from} → ${r.date_to}</span><span>${dateTime(r.issued_at)}</span></div></a><div class="end">${badge(r.status)}<div style="margin-top:6px"><button class="btn sm" data-send="${r.id}">${icon('send', 'sm')}</button></div></div></div>`)}</div>`
    : empty('لا توجد تقارير مصدرة بعد', 'file')}`);

  view.querySelectorAll('[data-pt] [data-k]').forEach((b) => b.addEventListener('click', () => {
    ptype = b.dataset.k;
    view.querySelectorAll('[data-pt] .chip').forEach((c) => c.classList.toggle('active', c === b));
    view.querySelector('[data-ref]').classList.toggle('hidden', ptype === 'custom');
    view.querySelector('[data-cust]').classList.toggle('hidden', ptype !== 'custom');
  }));
  view.querySelector('[name=f_user]').addEventListener('change', (e) => go('#/emp-reports' + qs({ user_id: e.target.value })));
  view.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await post(`/api/employee-reports/${b.dataset.send}/send`); toast('تم إرسال التقرير للموظف'); render(view, { query, isCurrent }); } catch (e) { toast(e.message, 'err'); b.disabled = false; }
  }));

  view.querySelector('[data-gen]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const user_id = view.querySelector('[name=user_id]').value;
    if (!user_id) return toast('اختر الموظف', 'err');
    const body = { user_id, period_type: ptype, include_images: view.querySelector('[name=imgs]').checked };
    if (ptype === 'custom') { body.from = view.querySelector('[name=from]').value; body.to = view.querySelector('[name=to]').value; } else body.ref_date = view.querySelector('[name=ref]').value;
    btn.disabled = true;
    try {
      const r = await post('/api/employee-reports', body);
      showDraft(view, r, () => render(view, { query, isCurrent }));
    } catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; }
  });
}

function showDraft(view, { report, snapshot }, reload) {
  const work = view.querySelector('#work');
  const fname = `MrVibe-${snapshot.employee.full_name.replace(/\s+/g, '_')}-${report.date_from}_${report.date_to}.pdf`;
  mount(work, html`
    <h3 class="section-title">معاينة التقرير #<span class="num">${report.number}</span> — ${snapshot.employee.full_name}</h3>
    <div class="hint" style="margin-bottom:10px">البيانات مجمّدة لحظة الإنشاء. احفظ التقرير ليُضاف للأرشيف كنسخة ثابتة لا تتغير، ثم أرسله للموظف.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button class="btn primary" data-save>${icon('save', 'sm')} حفظ وإصدار</button>
      <button class="btn" data-save-send>${icon('send', 'sm')} حفظ وإرسال للموظف</button>
      <button class="btn ghost" data-dl disabled>${icon('download', 'sm')} تنزيل PDF</button></div>
    <div class="rpt-preview"><div>${reportHtml(snapshot, { periodType: report.period_type, includeImages: report.include_images })}</div></div>`);
  const box = work.querySelector('.rpt-preview');
  fitPreview(box); setTimeout(() => fitPreview(box), 400);
  work.scrollIntoView({ behavior: 'smooth' });
  let file = null;
  const make = async () => {
    if (file) return file;
    const off = document.createElement('div'); off.style.cssText = 'position:fixed;left:-12000px;top:0;';
    off.innerHTML = String(reportHtml(snapshot, { periodType: report.period_type, includeImages: report.include_images }));
    document.body.appendChild(off);
    try { file = await elementToPdf(off.firstElementChild, fname, { title: `#${report.number}` }); } finally { off.remove(); }
    return file;
  };
  const save = async (send, btn) => {
    btn.disabled = true; const t = btn.innerHTML; btn.textContent = 'جارٍ إنشاء PDF…';
    try {
      const f = await make();
      btn.textContent = 'جارٍ الحفظ…';
      const up = await upload('report_pdf', f, `&user_id=${snapshot.employee.id}`);
      await post(`/api/employee-reports/${report.id}/pdf`, { pdf_file_id: up.id });
      if (send) await post(`/api/employee-reports/${report.id}/send`);
      toast(send ? 'تم حفظ التقرير وإرساله للموظف ✓' : 'تم حفظ التقرير في الأرشيف ✓');
      work.querySelectorAll('[data-save],[data-save-send]').forEach((b) => b.remove());
      work.querySelector('[data-dl]').disabled = false;
      reloadArchiveSoon(reload);
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.innerHTML = t; }
  };
  work.querySelector('[data-save]').addEventListener('click', (e) => save(false, e.currentTarget));
  work.querySelector('[data-save-send]').addEventListener('click', (e) => save(true, e.currentTarget));
  work.querySelector('[data-dl]').addEventListener('click', async () => sharePdf(await make()));
}
let t = null;
function reloadArchiveSoon(fn) { clearTimeout(t); t = setTimeout(fn, 1800); }
