import { html, raw, icon, mount, logo, kpi, toast, date, n, sel, esc } from '../ui.js';
import { get, post, put, lookups } from '../api.js';
import { setTitle, go } from '../app.js';
import { PLATFORMS, computeMetrics, addDays } from '../shared.js';
import { today } from '../forms.js';
import { reportPaper } from './report.js';

const DRAFT = 'mbcc_report_draft';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; } };
const saveDraft = (d) => { try { localStorage.setItem(DRAFT, JSON.stringify(d)); } catch {} };
const clearDraft = () => { try { localStorage.removeItem(DRAFT); } catch {} };

export function suggestions(m, r) {
  const s = { notes: [], recs: [] };
  if (m.roas !== null) {
    if (m.roas >= 4) { s.notes.push(`الحملة تحقق نتائج ممتازة بعائد ${m.roas.toFixed(1)}x على الإنفاق.`); s.recs.push('الاستمرار على الاستراتيجية الحالية', 'دراسة رفع الميزانية تدريجيًا 20%'); }
    else if (m.roas >= 2) { s.notes.push(`أداء جيد بعائد ${m.roas.toFixed(1)}x مع فرصة للتحسين.`); s.recs.push('اختبار محتوى إعلاني جديد', 'تحسين الاستهداف للفئات الأعلى تحويلًا'); }
    else { s.notes.push(`العائد على الإنفاق ${m.roas.toFixed(1)}x أقل من المستهدف.`); s.recs.push('إيقاف الإعلانات الأضعف أداءً', 'مراجعة صفحة المنتج والعروض', 'تجربة جماهير واستهداف مختلف'); }
  }
  if (m.ctr !== null) { if (m.ctr < 0.8) { s.notes.push(`نسبة النقر ${m.ctr.toFixed(2)}% منخفضة.`); s.recs.push('تجديد الإبداعات وتحسين أول 3 ثوانٍ من الفيديو'); } else if (m.ctr >= 1.5) s.notes.push(`نسبة نقر قوية ${m.ctr.toFixed(2)}% تدل على جاذبية المحتوى.`); }
  if (m.cvr !== null && m.cvr < 1) s.recs.push('تحسين تجربة الشراء وسرعة المتجر لرفع معدل التحويل');
  if (r.orders) s.notes.push(`تم تحقيق ${r.orders} طلب خلال الفترة.`);
  return s;
}

export default async function reportNew(main, params, q, stale) {
  const editing = !!params.id;
  const clients = await lookups.clients();
  if (stale()) return;
  let r;
  if (editing) r = (await get(`/api/reports/${params.id}`)).report;
  else {
    const draft = loadDraft();
    r = draft && (!q.client || draft.client_id === q.client) ? draft : { client_id: q.client || '', platform: 'TikTok', period_from: addDays(today(), -6), period_to: today() };
    if (draft && r === draft) toast('تمت استعادة المسودة المحفوظة تلقائيًا');
  }
  setTitle(editing ? 'تعديل التقرير' : 'التقرير السريع للعميل');
  let stepN = 1;
  const keep = () => { if (!editing) saveDraft(r); };

  const header = () => html`<div class="stepper">${[['1', 'البيانات'], ['2', 'الملاحظات'], ['3', 'النتيجة']].map(([k, l]) => html`<div class="step ${+k === stepN ? 'on' : +k < stepN ? 'done' : ''}"><span class="sn">${+k < stepN ? icon('check', 'sm') : k}</span>${l}</div>`)}</div>`;
  const clientCard = () => { const c = clients.find((x) => x.id === r.client_id); return c ? html`<div class="item" data-pick-client>${logo(c)}<div class="it-body"><div class="it-title">${c.name}</div><div class="it-sub">تقرير أداء • ${r.platform}</div></div>${icon('chevD', 'sm')}</div>` : html`<div class="item" data-pick-client><span class="logo" style="background:var(--surface-2)">${icon('user')}</span><div class="it-body"><div class="it-title">اختر العميل</div></div>${icon('chevD', 'sm')}</div>`; };
  const ft = (name, label, step = 'any') => html`<label class="ftile"><span>${label}</span><input type="number" inputmode="decimal" step="${step}" min="0" name="${name}" value="${r[name] ?? ''}" placeholder="0"></label>`;
  const metricsRow = () => { const m = computeMetrics(r); return html`<div class="metrics" data-metrics>
    <div class="metric m-green"><div class="m-k">ROAS</div><div class="m-v num">${kpi.roas(m.roas)}</div></div><div class="metric m-blue"><div class="m-k">CPA</div><div class="m-v num">${kpi.cpa(m.cpa)}</div></div>
    <div class="metric m-purple"><div class="m-k">CTR</div><div class="m-v num">${kpi.ctr(m.ctr)}</div></div><div class="metric m-gold"><div class="m-k">CPC</div><div class="m-v num">${kpi.cpc(m.cpc)}</div></div>
    <div class="metric"><div class="m-k">CPM</div><div class="m-v num">${kpi.cpm(m.cpm)}</div></div><div class="metric"><div class="m-k">التحويل</div><div class="m-v num">${kpi.cvr(m.cvr)}</div></div></div>`; };

  const step1 = () => html`${header()}
    <div class="stack">
      <div class="row"><div class="grow">${clientCard()}</div></div>
      <div class="grid-2"><label class="field"><span>المنصة</span>${sel('platform', PLATFORMS, r.platform)}</label>
        <label class="field"><span>الميزانية اليومية</span><input type="number" inputmode="decimal" name="daily_budget" value="${r.daily_budget ?? ''}" placeholder="اختياري"></label></div>
      <div class="field"><span class="small muted">فترة التقرير</span>
        <div class="chips" style="margin:6px 0">${[['7', 'آخر 7 أيام'], ['14', 'آخر 14 يوم'], ['month', 'هذا الشهر'], ['prev', 'الشهر الماضي'], ['30', 'آخر 30 يوم']].map(([k, l]) => html`<button type="button" class="chip" data-period="${k}">${l}</button>`)}</div>
        <div class="grid-2"><input type="date" name="period_from" value="${r.period_from}"><input type="date" name="period_to" value="${r.period_to}"></div></div>
      <div class="grid-2">${ft('spend', 'الإنفاق الإعلاني (ر.س)')}${ft('impressions', 'المشاهدات', '1')}${ft('clicks', 'النقرات', '1')}${ft('orders', 'الطلبات', '1')}</div>
      ${ft('sales', 'قيمة المبيعات (ر.س)')}
      <div class="section-head" style="margin:6px 2px 0"><h3 style="font-size:15px">المؤشرات المحسوبة تلقائيًا</h3></div>
      ${metricsRow()}
      <button class="btn primary lg block" data-next style="margin-top:6px">التالي ${icon('arrowL')}</button>
    </div>`;

  const step2 = () => {
    const m = computeMetrics(r), sg = suggestions(m, r);
    return html`${header()}<div class="stack lg">
      <label class="field"><span>ملخص النتائج</span><textarea name="summary" rows="3" placeholder="ملخص مختصر للأداء">${r.summary || ''}</textarea></label>
      <div class="chips" style="flex-wrap:wrap"><button type="button" class="chip" data-auto-summary>${icon('sparkles', 'sm')} ملخص تلقائي</button></div>
      <label class="field"><span>ملاحظات الأداء</span><textarea name="notes" rows="4" placeholder="ملاحظة في كل سطر">${r.notes || ''}</textarea></label>
      ${sg.notes.length ? html`<div class="chips" style="flex-wrap:wrap">${sg.notes.map((s) => html`<button type="button" class="chip" data-add-to="notes" data-text="${s}">+ ${s.length > 40 ? s.slice(0, 40) + '…' : s}</button>`)}</div>` : ''}
      <label class="field"><span>التوصيات</span><textarea name="recommendations" rows="4" placeholder="توصية في كل سطر">${r.recommendations || ''}</textarea></label>
      ${sg.recs.length ? html`<div class="chips" style="flex-wrap:wrap">${sg.recs.map((s) => html`<button type="button" class="chip" data-add-to="recommendations" data-text="${s}">+ ${s}</button>`)}</div>` : ''}
      <div class="row"><button class="btn ghost" data-back>${icon('arrowR')} السابق</button><button class="btn primary lg grow" data-next>التالي ${icon('arrowL')}</button></div></div>`;
  };

  const step3 = () => {
    const c = clients.find((x) => x.id === r.client_id) || {};
    return html`${header()}${reportPaper({ ...r, client_name: c.name, store_name: c.store_name, logo: c.logo }, null)}
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-back>${icon('arrowR')} تعديل</button><button class="btn primary lg grow" data-save>${icon('save')} حفظ التقرير</button></div>`;
  };

  const draw = () => { mount(main, [step1, step2, step3][stepN - 1]()); window.scrollTo(0, 0); };
  draw();

  main.addEventListener('input', (e) => {
    const t = e.target; if (!t.name) return;
    r[t.name] = t.type === 'number' ? (t.value === '' ? null : Number(t.value)) : t.value;
    keep();
    if (t.type === 'number' && stepN === 1) { const box = main.querySelector('[data-metrics]'); box.outerHTML = String(metricsRow()); }
  });
  main.addEventListener('change', (e) => { const t = e.target; if (t.name) { r[t.name] = t.type === 'number' ? (t.value === '' ? null : Number(t.value)) : t.value; keep(); } });
  main.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-pick-client]')) {
      const { sheet } = await import('../ui.js');
      const id = await sheet({ title: 'اختر العميل', body: html`<input type="search" data-cs placeholder="بحث…" style="margin-bottom:10px"><div class="list" data-cl>${clients.filter((c) => c.status !== 'former').map((c) => html`<button class="item" data-cid="${c.id}" data-name="${c.name}" style="width:100%;text-align:start">${logo(c, 'sm')}<span class="grow">${c.name}</span></button>`)}</div>`,
        onMount: (el, close) => { el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-cid]'); if (b) close(b.dataset.cid); }); el.querySelector('[data-cs]').addEventListener('input', (ev) => el.querySelectorAll('[data-cid]').forEach((b) => { b.style.display = b.dataset.name.includes(ev.target.value) ? '' : 'none'; })); } });
      if (id) { r.client_id = id; keep(); const cc = (await get(`/api/clients/${id}`).catch(() => null))?.client; if (cc) { if (cc.platforms?.[0] && !editing) r.platform = cc.platforms[0]; if (cc.daily_budget && r.daily_budget == null) r.daily_budget = cc.daily_budget; } draw(); }
      return;
    }
    const p = t.closest('[data-period]');
    if (p) {
      const td = today(), k = p.dataset.period;
      if (k === 'month') { r.period_from = td.slice(0, 8) + '01'; r.period_to = td; }
      else if (k === 'prev') { const first = td.slice(0, 8) + '01'; const lastPrev = addDays(first, -1); r.period_from = lastPrev.slice(0, 8) + '01'; r.period_to = lastPrev; }
      else { r.period_from = addDays(td, -(Number(k) - 1)); r.period_to = td; }
      main.querySelector('[name=period_from]').value = r.period_from; main.querySelector('[name=period_to]').value = r.period_to; keep(); return;
    }
    if (t.closest('[data-auto-summary]')) {
      const m = computeMetrics(r);
      r.summary = [`خلال الفترة من ${date(r.period_from)} إلى ${date(r.period_to)} على منصة ${r.platform}`, r.spend != null ? `تم إنفاق ${n(r.spend)} ريال` : null, r.sales != null ? `وتحقيق مبيعات بقيمة ${n(r.sales)} ريال` : null, r.orders ? `من ${n(r.orders)} طلب` : null, m.roas !== null ? `بعائد على الإنفاق ${m.roas.toFixed(2)}x` : null].filter(Boolean).join('، ') + '.';
      main.querySelector('[name=summary]').value = r.summary; keep(); return;
    }
    const add = t.closest('[data-add-to]');
    if (add) { const f = add.dataset.addTo; r[f] = [r[f], add.dataset.text].filter(Boolean).join('\n'); main.querySelector(`[name=${f}]`).value = r[f]; add.remove(); keep(); return; }
    if (t.closest('[data-back]')) { stepN--; draw(); return; }
    if (t.closest('[data-next]')) {
      if (stepN === 1) {
        if (!r.client_id) return toast('اختر العميل أولًا', 'err');
        if (!r.period_from || !r.period_to || r.period_to < r.period_from) return toast('تحقق من فترة التقرير', 'err');
      }
      stepN++; draw(); return;
    }
    const sv = t.closest('[data-save]');
    if (sv) {
      sv.disabled = true;
      try {
        const body = { ...r }; ['id', 'client_name', 'store_name', 'logo', 'created_at', 'updated_at', 'created_by'].forEach((k) => delete body[k]);
        const res = editing ? await put(`/api/reports/${params.id}`, body) : await post('/api/reports', body);
        clearDraft();
        go(`#/reports/${editing ? params.id : res.id}?saved=1`);
      } catch (err) { toast(err.message, 'err'); sv.disabled = false; }
    }
  });
}
export { raw, esc };
