// Single task: details, status, comments thread, edit & delete.
import { all, byId, today, update, create, remove, nameOf, person, isMe } from '../store.js';
import { esc, icon, avatar, byline, toastErr, pageHead, confirmBox, toast } from '../ui.js';
import { countdown, diffDays, fmtDate, fmtGreg } from '../dates.js';
import { pref } from '../store.js';
import { L } from '../labels.js';
import { editTask } from '../editors.js';
import { fileUrl } from '../api.js';

const when = (iso) => { const d = new Date(iso); return `${fmtGreg(iso.slice(0, 10), { year: false })} · ${d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}`; };

export default {
  render(el, { id }) {
    const x = byId('tasks', id), t = today();
    if (!x) { el.innerHTML = `<div class="page">${pageHead({ en: 'Task', ar: 'المهمة', back: '#/tasks' })}<div class="empty">هذه المهمة غير موجودة أو حُذفت</div></div>`; return; }
    const comments = all('task_comments').filter((c) => c.task_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const done = x.status === 'completed';
    const draft = el.querySelector('#cmt')?.value || '';
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'Task', ar: 'تفاصيل المهمة', back: '#/tasks', actions: `<button class="icon-btn" data-edit aria-label="تعديل">${icon('edit')}</button>` })}
      <div class="card">
        <div class="row" style="align-items:flex-start"><button class="check ${done ? 'on' : ''}" data-toggle aria-label="إنجاز">${icon('check', 'sm')}</button>
          <div class="grow"><div style="font-size:18px;font-weight:600" class="${done ? 'done-text' : ''}">${esc(x.title)}</div>
          ${x.description ? `<div style="margin-top:6px;white-space:pre-wrap;color:var(--ink2)">${esc(x.description)}</div>` : ''}</div></div>
        <div class="divider"></div>
        <dl class="kv">
          <dt>المسؤول</dt><dd><span class="row" style="gap:6px">${avatar(x.assignee || 'both', 'sm')} ${esc(nameOf(x.assignee || 'both'))}</span></dd>
          <dt>الأولوية</dt><dd><span class="prio-${x.priority || 'medium'}">● </span>${L.priority[x.priority || 'medium']} <span class="en muted">${L.priorityEn[x.priority || 'medium']}</span></dd>
          ${x.due_date ? `<dt>الاستحقاق</dt><dd>${fmtDate(x.due_date, pref())}${!done ? ` · <span class="${x.due_date < t ? 'prio-high' : 'muted'}">${countdown(diffDays(t, x.due_date))}</span>` : ''}</dd>` : ''}
          <dt>أُنشئت</dt><dd>${when(x.created_at)} — ${esc(person(x.created_by)?.name || '')}</dd>
          ${done && x.completed_at ? `<dt>أُنجزت</dt><dd>${when(x.completed_at)} — ${esc(person(x.completed_by)?.name || '')}</dd>` : ''}
          ${x.notes ? `<dt>ملاحظات</dt><dd>${esc(x.notes)}</dd>` : ''}
          ${x.remind ? `<dt>التذكير</dt><dd>${x.remind === 'custom' ? esc(x.remind_at?.replace('T', ' ')) : L.remind[x.remind]}</dd>` : ''}
        </dl>
        ${x.attachment_id ? `<a class="badge rose" style="margin-top:12px" href="${fileUrl(x.attachment_id)}" target="_blank">${icon('file', 'sm')} ${esc(x.attachment_name || 'المرفق')}</a>` : ''}
        <div class="small muted" style="margin-top:12px">${esc(byline(x))}</div>
      </div>
      <div class="section-title"><h2>الحالة</h2><span class="en">${L.taskStatusEn[x.status || 'pending']}</span></div>
      <div class="seg">${Object.entries(L.taskStatus).map(([k, l]) => `<button data-status="${k}" class="${(x.status || 'pending') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="section-title"><h2>التعليقات</h2><span class="en">Comments</span></div>
      <div class="card">
        ${comments.length ? comments.map((c) => `<div class="comment">${avatar(c.created_by, 'sm')}<div class="bubble">${esc(c.body)}<div class="tiny muted" style="margin-top:4px">${when(c.created_at)}${isMe(c.created_by) ? ` · <button data-delc="${c.id}" style="border:0;background:none;color:var(--muted);cursor:pointer;padding:0" class="tiny">حذف</button>` : ''}</div></div></div>`).join('') : '<div class="small muted">لا توجد تعليقات بعد</div>'}
        <form class="compose" id="cf"><input class="input" id="cmt" placeholder="اكتب تعليقًا…" autocomplete="off" value="${esc(draft)}"><button class="btn" type="submit" aria-label="إرسال">${icon('send', 'sm')}</button></form>
      </div>
    </div>`;
    el.onclick = async (e) => {
      const q = (s) => e.target.closest(s); let b;
      try {
        if (q('[data-edit]')) return editTask(x);
        if (q('[data-toggle]')) return update('tasks', id, { status: done ? 'pending' : 'completed' });
        if ((b = q('[data-status]'))) return update('tasks', id, { status: b.dataset.status });
        if ((b = q('[data-delc]')) && await confirmBox('حذف التعليق؟', { ok: 'حذف' })) { await remove('task_comments', b.dataset.delc); toast('تم الحذف'); }
      } catch (err) { toastErr(err); }
    };
    el.querySelector('#cf').onsubmit = async (e) => {
      e.preventDefault();
      const inp = el.querySelector('#cmt'); const body = inp.value.trim(); if (!body) return;
      inp.value = '';
      try { await create('task_comments', { task_id: id, body }); } catch (err) { inp.value = body; toastErr(err); }
    };
  },
};
