import { html, icon, mount, date, empty, toast, confirmBox, sheet, formSheet, field, inp } from '../ui.js';
import { get, put, del } from '../api.js';
import { setTitle, refresh } from '../app.js';
import { TASK_PRIORITY, TASK_STATUS, RECURRENCE } from '../shared.js';
import { taskForm, today } from '../forms.js';
import { PRIO_BADGE } from './client.js';

const VIEWS = [['today', 'اليوم'], ['upcoming', 'القادمة'], ['late', 'المتأخرة'], ['done', 'المكتملة'], ['client', 'حسب العميل'], ['priority', 'حسب الأولوية'], ['all', 'الكل']];
const PRIO_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

export default async function tasksPage(main, _p, q, stale) {
  setTitle('المهام');
  const { items } = await get('/api/tasks');
  if (stale()) return;
  const t0 = today();
  let view = q.view || 'today';
  const open = (t) => !['done', 'cancelled'].includes(t.status);
  const groups = {
    today: items.filter((t) => open(t) && t.due_date === t0 && !t.paused),
    upcoming: items.filter((t) => open(t) && (!t.due_date || t.due_date > t0)),
    late: items.filter((t) => open(t) && t.due_date && t.due_date < t0 && !t.paused),
    done: items.filter((t) => t.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    all: items,
  };
  mount(main, html`
    <div class="row" style="margin-bottom:12px"><div class="grow"><div class="bold" style="font-size:18px">لوحة المهام</div><div class="muted small">${groups.today.length} اليوم • ${groups.late.length} متأخرة</div></div>
      <button class="btn primary" data-add>${icon('plus')} مهمة</button></div>
    <div class="chips">${VIEWS.map(([k, l]) => html`<button class="chip ${view === k ? 'active' : ''}" data-v="${k}">${l}${groups[k] ? html` <span class="cnt">${groups[k].length}</span>` : ''}</button>`)}</div>
    <div data-list style="margin-top:12px"></div>`);
  const listEl = main.querySelector('[data-list]');
  const row = (t) => html`<div class="item" data-id="${t.id}" style="${t.paused ? 'opacity:.55' : ''}">
    <button class="chk ${t.status === 'done' ? 'on' : ''}" data-done aria-label="إنجاز">${icon('check', 'sm')}</button>
    <div class="it-body"><div class="it-title" style="${t.status === 'done' ? 'text-decoration:line-through;opacity:.6' : ''}">${t.title}</div>
      <div class="it-sub">${[t.client_name, t.due_date ? date(t.due_date) : 'بدون تاريخ', t.recurrence !== 'none' ? '↻ ' + RECURRENCE[t.recurrence] : null, t.assignee_name, t.paused ? 'العميل مجمد' : null, t.status !== 'new' && t.status !== 'done' ? TASK_STATUS[t.status] : null].filter(Boolean).join(' • ')}</div></div>
    <span class="badge ${t.due_date && t.due_date < t0 && open(t) ? 'b-red' : PRIO_BADGE[t.priority]}">${t.due_date && t.due_date < t0 && open(t) ? 'متأخرة' : TASK_PRIORITY[t.priority]}</span></div>`;
  const draw = () => {
    let content;
    if (view === 'client') {
      const by = {}; for (const t of items.filter(open)) (by[t.client_name || 'بدون عميل'] ||= []).push(t);
      content = Object.keys(by).length ? Object.entries(by).map(([k, v]) => html`<div class="section-head" style="margin-top:14px"><h3 style="font-size:15px">${k}</h3><span class="muted small">${v.length}</span></div><div class="list">${v.map(row)}</div>`) : empty('لا توجد مهام مفتوحة', 'checkCircle');
    } else if (view === 'priority') {
      const open2 = items.filter(open);
      content = ['urgent', 'high', 'medium', 'low'].map((p) => { const v = open2.filter((t) => t.priority === p); return v.length ? html`<div class="section-head" style="margin-top:14px"><h3 style="font-size:15px"><span class="badge ${PRIO_BADGE[p]}">${TASK_PRIORITY[p]}</span></h3><span class="muted small">${v.length}</span></div><div class="list">${v.map(row)}</div>` : ''; });
      if (!open2.length) content = empty('لا توجد مهام مفتوحة', 'checkCircle');
    } else {
      const v = [...groups[view]].sort((a, b) => (view === 'done' ? 0 : PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]));
      content = v.length ? html`<div class="list">${v.map(row)}</div>` : empty(view === 'today' ? 'لا توجد مهام لليوم 🎉' : 'لا توجد مهام', 'checkCircle');
    }
    mount(listEl, content);
  };
  draw();
  const openTask = async (t) => {
    const r = await sheet({ title: t.title, body: html`<div class="kvlist">
      <div><span>العميل</span><span>${t.client_name || '—'}</span></div><div><span>الاستحقاق</span><span>${t.due_date ? date(t.due_date) : '—'}</span></div>
      <div><span>الأولوية</span><span>${TASK_PRIORITY[t.priority]}</span></div><div><span>الحالة</span><span>${TASK_STATUS[t.status]}</span></div>
      <div><span>التكرار</span><span>${RECURRENCE[t.recurrence]}${t.recurrence === 'custom' ? ` (${t.recurrence_days} يوم)` : ''}</span></div>
      ${t.assignee_name ? html`<div><span>المسؤول</span><span>${t.assignee_name}</span></div>` : ''}
      <div><span>التفاصيل</span><span>${t.details || '—'}</span></div><div><span>ملاحظات</span><span>${t.notes || '—'}</span></div></div>
      <div class="grid-3" style="margin-top:12px"><button class="btn sm" data-x="in_progress">قيد التنفيذ</button><button class="btn sm" data-x="postponed">تأجيل</button><button class="btn sm" data-x="cancelled">إلغاء</button></div>`,
      foot: html`<button class="btn danger icon" data-x="del">${icon('trash')}</button><button class="btn ghost" data-x="edit">${icon('edit')} تعديل</button><button class="btn success" data-x="done">${icon('check')} إنجاز</button>`,
      onMount: (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) close(b.dataset.x); }) });
    if (!r) return;
    try {
      if (r === 'edit') { if (await taskForm({ task: t })) refresh(); return; }
      if (r === 'del') { if (await confirmBox('حذف هذه المهمة؟', { danger: true, ok: 'حذف' })) { await del(`/api/tasks/${t.id}`); toast('تم حذف المهمة'); refresh(); } return; }
      if (r === 'postponed') {
        const ok = await formSheet({ title: 'تأجيل المهمة', submit: 'تأجيل', body: field('تأجيل إلى تاريخ', inp('due_date', t.due_date && t.due_date > t0 ? t.due_date : t0, { type: 'date', req: true })),
          onSubmit: (d) => put(`/api/tasks/${t.id}`, { status: 'postponed', due_date: d.due_date }) });
        if (!ok) return;
      }
      else { const res = await put(`/api/tasks/${t.id}`, { status: r }); if (res.next_due) toast(`تم — التكرار التالي ${res.next_due}`); }
      toast('تم التحديث'); refresh();
    } catch (err) { toast(err.message, 'err'); }
  };
  main.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-v]');
    if (v) { view = v.dataset.v; main.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('active', b === v)); draw(); return; }
    if (e.target.closest('[data-add]')) { if (await taskForm({})) refresh(); return; }
    const it = e.target.closest('[data-id]'); if (!it) return;
    const t = items.find((x) => x.id === it.dataset.id);
    if (e.target.closest('[data-done]')) {
      try { const r = await put(`/api/tasks/${t.id}`, { status: t.status === 'done' ? 'new' : 'done' }); toast(r.next_due ? `أُنجزت — التكرار التالي ${r.next_due}` : t.status === 'done' ? 'أُعيد فتح المهمة' : 'أُنجزت المهمة'); refresh(); } catch (err) { toast(err.message, 'err'); }
      return;
    }
    openTask(t);
  });
  if (q.open) { const t = items.find((x) => x.id === q.open); if (t) openTask(t); }
}
