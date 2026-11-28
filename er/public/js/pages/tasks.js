// Our Tasks — filters (mine / partner / shared / overdue / done), quick complete, priorities and due dates.
import { all, store, today, update, nameOf } from '../store.js';
import { esc, icon, avatar, empty, toastErr, pageHead } from '../ui.js';
import { countdown, diffDays } from '../dates.js';
import { L } from '../labels.js';
import { editTask } from '../editors.js';
import { isOverdue } from '../agenda.js';

const st = { f: 'open', sort: 'due' };
const PRIO = { high: 0, medium: 1, low: 2 };

export function taskCard(x, t) {
  const done = x.status === 'completed';
  const late = isOverdue(x, t);
  const comments = all('task_comments').filter((c) => c.task_id === x.id).length;
  return `<div class="task">
    <button class="check ${done ? 'on' : ''}" data-toggle="${x.id}" aria-label="${done ? 'إلغاء الإنجاز' : 'إنجاز'}">${icon('check', 'sm')}</button>
    <a class="grow" href="#/tasks/${x.id}" style="min-width:0">
      <div class="title ${done ? 'done-text' : ''}" style="font-weight:500">${esc(x.title)}</div>
      <div class="meta">
        <span class="badge ${x.priority === 'high' ? 'danger' : x.priority === 'medium' ? 'warn' : ''}">${L.priority[x.priority || 'medium']}</span>
        ${x.status === 'in_progress' ? '<span class="badge rose">قيد التنفيذ</span>' : ''}
        ${late ? '<span class="badge danger">متأخرة</span>' : x.status === 'delayed' ? '<span class="badge warn">مؤجلة/متأخرة</span>' : ''}
        ${x.due_date && !done ? `<span class="small ${late ? 'prio-high' : 'muted'}">${icon('clock', 'sm')} ${countdown(diffDays(t, x.due_date))}</span>` : ''}
        ${comments ? `<span class="small muted">💬 ${comments}</span>` : ''}
        ${x.attachment_id ? `<span class="small muted">${icon('file', 'sm')}</span>` : ''}
      </div></a>
    ${avatar(x.assignee || 'both', 'sm')}
  </div>`;
}

export async function toggleTask(id) {
  const x = all('tasks').find((r) => r.id === id); if (!x) return;
  try { await update('tasks', id, { status: x.status === 'completed' ? 'pending' : 'completed' }); } catch (e) { toastErr(e); }
}

export default {
  render(el) {
    const t = today(), me = store.me, p = store.partner;
    const tasks = all('tasks');
    const F = {
      open: ['المفتوحة', (x) => x.status !== 'completed'],
      mine: ['لي', (x) => x.status !== 'completed' && x.assignee === me.id],
      partner: [p ? `لـ${p.name}` : 'للطرف الآخر', (x) => x.status !== 'completed' && p && x.assignee === p.id],
      both: ['مشتركة', (x) => x.status !== 'completed' && (x.assignee === 'both' || !x.assignee)],
      late: ['المتأخرة', (x) => isOverdue(x, t) || (x.status === 'delayed')],
      done: ['المنجزة', (x) => x.status === 'completed'],
    };
    const counts = Object.fromEntries(Object.entries(F).map(([k, [, fn]]) => [k, tasks.filter(fn).length]));
    let list = tasks.filter(F[st.f][1]);
    list.sort(st.f === 'done' ? (a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')
      : st.sort === 'prio' ? (a, b) => PRIO[a.priority || 'medium'] - PRIO[b.priority || 'medium'] || (a.due_date || '9').localeCompare(b.due_date || '9')
        : (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || PRIO[a.priority || 'medium'] - PRIO[b.priority || 'medium']);

    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'مهامنا المشتركة', ar: 'مهامنا', actions: `<button class="btn sm" data-new>${icon('plus', 'sm')} مهمة</button>` })}
      <div class="stats3" style="margin-bottom:14px"><div class="stat"><b class="num">${counts.mine}</b><span>لي</span></div><div class="stat"><b class="num">${counts.partner}</b><span>${esc(p?.name || 'الطرف الآخر')}</span></div><div class="stat"><b class="num ${counts.late ? 'prio-high' : ''}">${counts.late}</b><span>متأخرة</span></div></div>
      <div class="chips">${Object.entries(F).map(([k, [l]]) => `<button class="chip ${st.f === k ? 'on' : ''}" data-f="${k}">${esc(l)} <span class="tiny" style="opacity:.7">${counts[k]}</span></button>`).join('')}</div>
      ${st.f !== 'done' ? `<div class="row between" style="margin-bottom:8px"><span class="small muted">${list.length} مهمة</span><button class="link" style="border:0;background:none;cursor:pointer" data-sort>${st.sort === 'due' ? 'ترتيب: الموعد' : 'ترتيب: الأولوية'} ${icon('chevD', 'sm')}</button></div>` : ''}
      ${list.length ? list.map((x) => taskCard(x, t)).join('') : empty('كل شيء منجز', st.f === 'done' ? 'لا توجد مهام منجزة بعد' : 'لا توجد مهام هنا ✨', `<br><button class="btn sm" data-new>${icon('plus', 'sm')} إضافة مهمة</button>`)}
    </div>`;
    el.onclick = (e) => {
      const q = (s) => e.target.closest(s); let b;
      if ((b = q('[data-toggle]'))) { e.preventDefault(); b.classList.toggle('on'); toggleTask(b.dataset.toggle); return; }
      if ((b = q('[data-f]'))) { st.f = b.dataset.f; this.render(el); return; }
      if (q('[data-sort]')) { st.sort = st.sort === 'due' ? 'prio' : 'due'; this.render(el); return; }
      if (q('[data-new]')) editTask(null, st.f === 'mine' ? { assignee: me.id } : st.f === 'partner' && p ? { assignee: p.id } : {});
    };
  },
};
export { nameOf };
