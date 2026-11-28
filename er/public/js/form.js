// Declarative form builder rendered inside a bottom sheet. Every form in the app goes through here.
import { esc, icon, openSheet, toast, toastErr, confirmBox, avatar } from './ui.js';
import { uploadFile, fileUrl } from './api.js';
import { people, store } from './store.js';
import { HIJRI_MONTHS, fromHijri, toHijri, fmtGreg, fmtHijri, todayIn } from './dates.js';
import { L } from './labels.js';

const segBtns = (k, options, cur, multi = false) => options.map((o) => `<button type="button" data-seg="${esc(k)}" data-v="${esc(o.v)}" class="${(multi ? (cur || []).includes(o.v) : String(cur ?? '') === String(o.v)) ? 'on' : ''}">${o.i ? icon(o.i, 'sm') : ''}${esc(o.l)}</button>`).join('');

function userOptions(f) {
  const ps = people();
  const o = ps.map((u) => ({ v: u.id, l: u.id === store.me.id ? `أنا (${u.name})` : u.name }));
  if (f.both !== false && ps.length > 1) o.push({ v: 'both', l: 'سوا' });
  if (f.none) o.unshift({ v: '', l: f.none });
  return o;
}

function fieldHtml(f, v, vals) {
  const lab = f.label ? `<span>${esc(f.label)}${f.required ? ' *' : ''}</span>` : '';
  const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '';
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  const val = v ?? '';
  switch (f.type) {
    case 'textarea': return `<label class="field">${lab}<textarea data-k="${f.k}" rows="${f.rows || 3}"${ph}>${esc(val)}</textarea>${hint}</label>`;
    case 'select': return `<label class="field">${lab}<select data-k="${f.k}">${f.options.map((o) => `<option value="${esc(o.v)}" ${String(val) === String(o.v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>${hint}</label>`;
    case 'seg': return `<div class="field">${lab}<div class="seg">${segBtns(f.k, f.options, val)}</div>${hint}</div>`;
    case 'multi': return `<div class="field">${lab}<div class="seg">${segBtns(f.k, f.options, val || [], true)}</div>${hint}</div>`;
    case 'user': return `<div class="field">${lab}<div class="seg">${segBtns(f.k, userOptions(f), val)}</div>${hint}</div>`;
    case 'toggle': return `<div class="field set-row" style="border:0;padding:4px 0"><div><div style="font-weight:500">${esc(f.label)}</div>${f.hint ? `<div class="hint" style="margin:0">${esc(f.hint)}</div>` : ''}</div><label class="toggle"><input type="checkbox" data-k="${f.k}" ${val ? 'checked' : ''}><i></i></label></div>`;
    case 'stars': return `<div class="field">${lab}<div class="stars" data-stars="${f.k}">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-star="${i}" class="${i <= (val || 0) ? 'on' : ''}">★</button>`).join('')}</div></div>`;
    case 'price': return `<div class="field">${lab}<div class="seg">${segBtns(f.k, [{ v: '', l: '—' }, { v: 1, l: '$' }, { v: 2, l: '$$' }, { v: 3, l: '$$$' }, { v: 4, l: '$$$$' }], val)}</div></div>`;
    case 'range': return `<label class="field">${lab}<input type="range" data-k="${f.k}" min="${f.min ?? 1}" max="${f.max ?? 5}" step="1" value="${esc(val || f.def || 3)}"><div class="hint" data-range-label="${f.k}">${esc(f.labels ? f.labels[val || f.def || 3] : val)}</div></label>`;
    case 'image': return `<div class="field">${lab}<div class="img-pick" data-img="${f.k}">${imgCell(val)}</div><input type="file" accept="image/*" data-file="${f.k}" hidden>${hint}</div>`;
    case 'images': return `<div class="field">${lab}<div class="img-pick" data-imgs="${f.k}">${(val || []).map((id) => imgCell(id, true)).join('')}<div class="ph" data-addimg="${f.k}">${icon('plus')}</div></div><input type="file" accept="image/*" multiple data-files="${f.k}" hidden>${hint}</div>`;
    case 'attach': return `<div class="field">${lab}<div class="row" data-attach="${f.k}">${attachCell(val, vals[f.nameKey])}</div><input type="file" accept="image/*,application/pdf" data-afile="${f.k}" hidden>${hint}</div>`;
    case 'remind': {
      const opts = Object.entries(L.remind).filter(([k]) => !f.only || f.only.includes(k)).map(([v, l]) => ({ v, l }));
      return `<div class="field">${lab || '<span>التذكير</span>'}<div class="seg">${segBtns(f.k, opts, val ?? '')}</div><div class="${val === 'custom' ? '' : 'hidden'}" data-remind-at="${f.k}" style="margin-top:8px"><input type="datetime-local" data-k="${f.k}_at" value="${esc(vals[f.k + '_at'] || '')}" class="input"></div>${hint}</div>`;
    }
    case 'dualdate': {
      const cal = vals.cal || 'g';
      const h = vals.h_year ? { y: vals.h_year, m: vals.h_month, d: vals.h_day } : toHijri(val || todayIn());
      const hy = toHijri(todayIn()).y;
      const years = []; for (let y = hy + 5; y >= hy - 90; y--) years.push(y);
      return `<div class="field">${lab}<div class="seg" style="margin-bottom:8px">${segBtns('cal', [{ v: 'g', l: 'ميلادي' }, { v: 'h', l: 'هجري (أم القرى)' }], cal)}</div>
        <div data-cal-g class="${cal === 'g' ? '' : 'hidden'}"><input type="date" data-k="${f.k}" value="${esc(val)}" class="input"></div>
        <div data-cal-h class="inline-fields three ${cal === 'h' ? '' : 'hidden'}">
          <select class="input" data-h="d">${Array.from({ length: 30 }, (_, i) => `<option ${i + 1 === h.d ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>
          <select class="input" data-h="m">${HIJRI_MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === h.m ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <select class="input" data-h="y">${years.map((y) => `<option ${y === h.y ? 'selected' : ''}>${y}</option>`).join('')}</select>
        </div><div class="hint" data-dual-hint></div></div>`;
    }
    case 'info': return `<div class="notice rose" style="margin-bottom:14px">${f.html}</div>`;
    case 'pair': return `<div class="inline-fields">${f.fields.map((x) => fieldHtml(x, vals[x.k], vals)).join('')}</div>`;
    default: return `<label class="field">${lab}<input type="${f.type || 'text'}" data-k="${f.k}" value="${esc(val)}"${ph}${f.type === 'number' ? ' inputmode="decimal" step="any"' : ''}${f.maxlength ? ` maxlength="${f.maxlength}"` : ''}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}${f.dir ? ` dir="${f.dir}"` : ''}${f.step ? ` step="${f.step}"` : ''}>${hint}</label>`;
  }
}
const imgCell = (id, multi = false) => (id ? `<div class="ph" data-has="${esc(id)}"><img src="${fileUrl(id)}" alt=""><button type="button" class="x" data-rm="${esc(id)}" data-multi="${multi ? 1 : ''}">${icon('x', 'sm')}</button></div>` : `<div class="ph" data-pick>${icon('image')}</div>`);
const attachCell = (id, name) => (id ? `<a class="badge rose" href="${fileUrl(id)}" target="_blank">${icon('file', 'sm')} ${esc(name || 'مرفق')}</a><button type="button" class="btn sm ghost" data-arm>إزالة</button>` : `<button type="button" class="btn sm soft" data-apick>${icon('plus', 'sm')} إرفاق صورة أو ملف PDF</button>`);

const flat = (fields) => fields.flatMap((f) => (f.type === 'pair' ? f.fields : [f]));

/**
 * openForm({ title, en, fields, values, submit, onSubmit(values) => Promise, onDelete })
 * Field: { k, label, type, options, required, show(vals), def, hint, placeholder }
 */
export function openForm({ title, en = '', fields, values = {}, submit = 'حفظ', onSubmit, onDelete, deleteLabel = 'حذف' }) {
  const vals = { ...values };
  for (const f of flat(fields)) if (vals[f.k] === undefined && f.def !== undefined) vals[f.k] = typeof f.def === 'function' ? f.def() : f.def;
  const body = `<form novalidate>${fields.map((f) => `<div data-wrap="${f.k || ''}">${fieldHtml(f, vals[f.k], vals)}</div>`).join('')}<button type="submit" hidden></button></form>`;
  const foot = `<button class="btn" data-save>${esc(submit)}</button>${onDelete ? `<button class="btn danger" data-del aria-label="${esc(deleteLabel)}">${icon('trash')}</button>` : ''}`;
  return openSheet({
    title, en, body, foot,
    onMount: (sh, close) => {
      const form = sh.querySelector('form');
      const refreshVis = () => { for (const f of fields) { if (!f.show) continue; sh.querySelector(`[data-wrap="${f.k}"]`)?.classList.toggle('hidden', !f.show(vals)); } };
      const dualHint = () => {
        const hEl = sh.querySelector('[data-dual-hint]'); if (!hEl) return;
        const iso = computeDual(sh, vals);
        hEl.textContent = iso ? (vals.cal === 'h' ? `يوافق ${fmtGreg(iso)}` : `يوافق ${fmtHijri(iso)}`) : '';
      };
      form.addEventListener('input', (e) => {
        const k = e.target.dataset.k; if (!k) return;
        vals[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        const rl = sh.querySelector(`[data-range-label="${k}"]`); const fd = flat(fields).find((x) => x.k === k);
        if (rl && fd?.labels) rl.textContent = fd.labels[e.target.value];
        refreshVis(); dualHint();
      });
      form.addEventListener('change', (e) => { if (e.target.dataset.h) dualHint(); });
      form.addEventListener('click', async (e) => {
        const seg = e.target.closest('[data-seg]');
        if (seg) {
          const k = seg.dataset.seg, fd = flat(fields).find((x) => x.k === k) || { type: 'seg' };
          let v = seg.dataset.v;
          if (fd.type === 'multi') {
            const arr = new Set(vals[k] || []); arr.has(v) ? arr.delete(v) : arr.add(v); vals[k] = [...arr];
            seg.classList.toggle('on');
          } else {
            if (fd.type === 'price') v = v === '' ? null : Number(v);
            vals[k] = v;
            seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === seg));
            if (fd.type === 'remind') sh.querySelector(`[data-remind-at="${k}"]`)?.classList.toggle('hidden', v !== 'custom');
            if (k === 'cal') { sh.querySelector('[data-cal-g]').classList.toggle('hidden', v !== 'g'); sh.querySelector('[data-cal-h]').classList.toggle('hidden', v !== 'h'); dualHint(); }
          }
          refreshVis(); return;
        }
        const st = e.target.closest('[data-star]');
        if (st) { const k = st.parentElement.dataset.stars; const n = Number(st.dataset.star); vals[k] = vals[k] === n ? 0 : n; st.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= vals[k])); return; }
        const rm = e.target.closest('[data-rm]');
        if (rm) {
          e.stopPropagation();
          const wrap = rm.closest('[data-img],[data-imgs]');
          if (wrap.dataset.img) { vals[wrap.dataset.img] = null; wrap.innerHTML = imgCell(null); }
          else { const k = wrap.dataset.imgs; vals[k] = (vals[k] || []).filter((x) => x !== rm.dataset.rm); rm.closest('.ph').remove(); }
          return;
        }
        const pick = e.target.closest('[data-pick]');
        if (pick) { sh.querySelector(`[data-file="${pick.closest('[data-img]').dataset.img}"]`).click(); return; }
        const add = e.target.closest('[data-addimg]');
        if (add) { sh.querySelector(`[data-files="${add.dataset.addimg}"]`).click(); return; }
        const ap = e.target.closest('[data-apick]');
        if (ap) { sh.querySelector(`[data-afile="${ap.closest('[data-attach]').dataset.attach}"]`).click(); return; }
        const arm = e.target.closest('[data-arm]');
        if (arm) { const k = arm.closest('[data-attach]').dataset.attach; vals[k] = null; arm.closest('[data-attach]').innerHTML = attachCell(null); }
      });
      form.addEventListener('change', async (e) => {
        const t = e.target;
        try {
          if (t.dataset.file) {
            const k = t.dataset.file, wrap = sh.querySelector(`[data-img="${k}"]`);
            if (!t.files[0]) return;
            wrap.innerHTML = '<div class="ph">…</div>';
            vals[k] = await uploadFile(t.files[0]); wrap.innerHTML = imgCell(vals[k]);
          } else if (t.dataset.files) {
            const k = t.dataset.files, wrap = sh.querySelector(`[data-imgs="${k}"]`), addBtn = wrap.querySelector('[data-addimg]');
            for (const file of t.files) { addBtn.innerHTML = '…'; const id = await uploadFile(file); vals[k] = [...(vals[k] || []), id]; addBtn.insertAdjacentHTML('beforebegin', imgCell(id, true)); }
            addBtn.innerHTML = icon('plus');
          } else if (t.dataset.afile) {
            const k = t.dataset.afile, fd = flat(fields).find((x) => x.k === k), wrap = sh.querySelector(`[data-attach="${k}"]`);
            if (!t.files[0]) return;
            wrap.innerHTML = '<span class="muted small">جاري الرفع…</span>';
            vals[k] = await uploadFile(t.files[0]); if (fd.nameKey) vals[fd.nameKey] = t.files[0].name.slice(0, 120);
            wrap.innerHTML = attachCell(vals[k], vals[fd.nameKey]);
          }
          if (t.type === 'file') t.value = ''; // allow picking the same file again
        } catch (err) { toastErr(err); }
      });
      refreshVis(); dualHint();
      const saveBtn = sh.querySelector('[data-save]');
      const doSave = async () => {
        // read inputs (covers values typed without firing input events)
        sh.querySelectorAll('[data-k]').forEach((el) => { vals[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
        const out = {};
        for (const f of flat(fields)) {
          if (!f.k || f.type === 'info') continue;
          if (f.show && !f.show(vals)) { out[f.k] = f.type === 'toggle' ? false : null; continue; }
          let v = vals[f.k];
          if (f.type === 'number' || f.type === 'range') v = v === '' || v == null ? null : Number(v);
          if (f.type === 'dualdate') { v = computeDual(sh, vals); Object.assign(out, { cal: vals.cal || 'g', h_year: vals.h_year ?? null, h_month: vals.h_month ?? null, h_day: vals.h_day ?? null }); }
          if (f.type === 'remind') out[f.k + '_at'] = vals[f.k] === 'custom' ? (vals[f.k + '_at'] || null) : null;
          if (f.type === 'attach' && f.nameKey) out[f.nameKey] = vals[f.nameKey] || null;
          if (typeof v === 'string') v = v.trim();
          if (f.required && (v === '' || v === null || v === undefined)) { toast(`«${f.label}» مطلوب`, 'err'); sh.querySelector(`[data-k="${f.k}"]`)?.focus(); return; }
          if (f.type === 'remind' && v === 'custom' && !out[f.k + '_at']) { toast('اختر وقت التذكير', 'err'); return; }
          out[f.k] = v === '' ? null : v;
        }
        saveBtn.disabled = true;
        try { const r = await onSubmit(out); if (r !== false) close(); }
        catch (err) { toastErr(err); }
        finally { saveBtn.disabled = false; }
      };
      saveBtn.onclick = doSave;
      form.onsubmit = (e) => { e.preventDefault(); doSave(); };
      const delBtn = sh.querySelector('[data-del]');
      if (delBtn) delBtn.onclick = async () => { if (await confirmBox('هل تريد حذف هذا العنصر نهائيًا؟', { ok: 'حذف' })) { try { await onDelete(); close(); toast('تم الحذف'); } catch (err) { toastErr(err); } } };
      setTimeout(() => { const first = sh.querySelector('input[data-k]:not([type=checkbox]):not([type=date]):not([type=range]), textarea[data-k]'); if (first && !first.value && window.matchMedia('(min-width: 700px)').matches) first.focus(); }, 280);
    },
  });
}

function computeDual(sh, vals) {
  if ((vals.cal || 'g') === 'h') {
    const d = Number(sh.querySelector('[data-h="d"]').value), m = Number(sh.querySelector('[data-h="m"]').value), y = Number(sh.querySelector('[data-h="y"]').value);
    vals.h_year = y; vals.h_month = m; vals.h_day = d;
    return fromHijri(y, m, d);
  }
  vals.h_year = vals.h_month = vals.h_day = null;
  const el = sh.querySelector('[data-cal-g] input');
  return el?.value || null;
}

export { avatar };
