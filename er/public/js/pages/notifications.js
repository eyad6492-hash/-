// In-app notifications (reminders, assignments, completed tasks, notes from the partner).
import { get, post, del } from '../api.js';
import { store, syncNow } from '../store.js';
import { esc, icon, avatar, pageHead, empty, toastErr, toast } from '../ui.js';
import { fmtGreg } from '../dates.js';

const IC = { task_assigned: 'tasks', task_new: 'tasks', task_done: 'check', task_comment: 'note', task_reminder: 'clock', tasks_digest: 'tasks', note: 'note', date: 'gift', event: 'clock', events: 'calendar', plans: 'plans', plan: 'plans', month: 'moon', trip: 'plane', shopping: 'bag', mood: 'smile', test: 'bell' };
let items = null;

export default {
  async render(el, _p, { full } = {}) {
    if (full || !items) {
      try { items = (await get('/api/notifications')).items; } catch (e) { toastErr(e); items = []; }
      if (items.some((n) => !n.read)) post('/api/notifications/read', {}).then(() => { store.unread = 0; syncNow(); }).catch(() => {});
    }
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'Notifications', ar: 'الإشعارات', back: '#/', actions: items.length ? `<button class="btn sm ghost" data-clear>مسح الكل</button>` : '' })}
      ${items.length ? `<div class="card">${items.map((n) => `<a class="item" href="${esc(n.link || '#/')}"><span class="ic-box ${n.read ? '' : 'rose'}">${icon(IC[n.kind] || 'bell')}</span><div class="grow" style="min-width:0"><div class="title" style="${n.read ? '' : 'font-weight:600'}">${esc(n.title)}</div>${n.body ? `<div class="sub">${esc(n.body)}</div>` : ''}<div class="tiny muted">${fmtGreg(n.created_at.slice(0, 10), { year: false })} · ${new Date(n.created_at).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}</div></div>${n.actor ? avatar(n.actor, 'sm') : ''}</a>`).join('')}</div>`
        : empty('All caught up', 'لا توجد إشعارات')}
      <p class="tiny muted center" style="margin-top:14px">لتصلك الإشعارات على الجوال حتى والتطبيق مغلق: الإعدادات ← الإشعارات ← تفعيل على هذا الجهاز</p>
    </div>`;
    el.onclick = async (e) => {
      if (e.target.closest('[data-clear]')) { try { await del('/api/notifications'); items = []; toast('تم المسح'); this.render(el); } catch (err) { toastErr(err); } }
    };
  },
};
