// Our Bucket List — places & experiences to try together; turn any item into a calendar date.
import { all, byId, today, update, create, person } from '../store.js';
import { esc, icon, empty, pageHead, img, money, openSheet, toast, toastErr } from '../ui.js';
import { fmtGreg } from '../dates.js';
import { L } from '../labels.js';
import { editBucket } from '../editors.js';
import { openForm } from '../form.js';

const st = { s: 'wishlist' };

function toCalendar(b) {
  openForm({
    title: 'تحويل إلى موعد', en: 'لنحققها',
    values: { title: b.title, date: b.suggested_date || today(), assignee: 'both', remind: '1' },
    fields: [{ k: 'title', label: 'العنوان', required: true }, { type: 'pair', fields: [{ k: 'date', label: 'التاريخ', type: 'date', required: true }, { k: 'time', label: 'الوقت', type: 'time' }] }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 }, { k: 'remind', type: 'remind' }],
    submit: 'إضافة للتقويم',
    onSubmit: async (v) => {
      const ev = await create('events', { ...v, type: 'event', location: b.url ? null : null, source_col: 'bucket', source_id: b.id, notes: [v.notes, b.url].filter(Boolean).join('\n') || null });
      await update('bucket', b.id, { status: 'planned', event_id: ev.id, suggested_date: v.date });
      toast('أُضيف للتقويم ✓');
    },
  });
}

function view(b) {
  const ev = b.event_id && byId('events', b.event_id);
  openSheet({
    title: b.title, en: L.bucketStatus[b.status || 'wishlist'],
    body: `${b.image_id ? img(b.image_id, 'cover') + '<div style="height:12px"></div>' : ''}
      ${b.description ? `<p style="white-space:pre-wrap;margin-top:0">${esc(b.description)}</p>` : ''}
      <dl class="kv">${b.cost ? `<dt>التكلفة المتوقعة</dt><dd>${money(b.cost)}</dd>` : ''}${b.suggested_date ? `<dt>التاريخ المقترح</dt><dd>${fmtGreg(b.suggested_date, { weekday: true })}</dd>` : ''}<dt>اقترحه</dt><dd>${esc(person(b.created_by)?.name || '')}</dd>${ev ? `<dt>في التقويم</dt><dd><a class="link" href="#/calendar/${ev.date}">${fmtGreg(ev.date)}</a></dd>` : ''}${b.url ? `<dt>الرابط</dt><dd><a class="link" href="${esc(b.url)}" target="_blank" rel="noopener">فتح الرابط</a></dd>` : ''}</dl>`,
    foot: `${b.status !== 'done' ? `<button class="btn" data-cal>${icon('calendar', 'sm')} ${ev ? 'موعد آخر' : 'حوّل لموعد'}</button><button class="btn soft" data-done>تم ✓</button>` : '<button class="btn soft" data-undo>إرجاع للقائمة</button>'}<button class="icon-btn" data-edit>${icon('edit')}</button>`,
    onMount: (sh, close) => {
      sh.querySelector('[data-edit]').onclick = () => { close(); setTimeout(() => editBucket(b), 240); };
      sh.querySelector('[data-cal]')?.addEventListener('click', () => { close(); setTimeout(() => toCalendar(b), 240); });
      sh.querySelector('[data-done]')?.addEventListener('click', async () => { try { await update('bucket', b.id, { status: 'done', done_date: today() }); toast('رائع! تم ✓'); close(); } catch (e) { toastErr(e); } });
      sh.querySelector('[data-undo]')?.addEventListener('click', async () => { try { await update('bucket', b.id, { status: 'wishlist', done_date: null }); close(); } catch (e) { toastErr(e); } });
    },
  });
}

export default {
  render(el) {
    const items = all('bucket');
    const list = items.filter((b) => (b.status || 'wishlist') === st.s).sort((a, b) => (a.suggested_date || '9').localeCompare(b.suggested_date || '9') || b.created_at.localeCompare(a.created_at));
    const cnt = (s) => items.filter((b) => (b.status || 'wishlist') === s).length;
    el.innerHTML = `<div class="page">
      ${pageHead({ en: 'أحلامنا الصغيرة', ar: 'أشياء نريد تجربتها سوا', back: '#/more', actions: `<button class="btn sm" data-new>${icon('plus', 'sm')} إضافة</button>` })}
      <div class="tabs">${Object.entries(L.bucketStatusEn).map(([k, l]) => `<button data-s="${k}" class="${st.s === k ? 'on' : ''}">${l} · ${cnt(k)}</button>`).join('')}</div>
      ${list.length ? `<div class="pcards">${list.map((b) => `<div class="pcard" data-open="${b.id}"><div class="img">${b.image_id ? img(b.image_id) : icon('sparkle', 'lg')}${b.status === 'done' ? '<span class="badge">✓</span>' : ''}</div><div class="body"><div class="title">${esc(b.title)}</div><div class="small muted">${b.suggested_date ? fmtGreg(b.suggested_date, { year: false }) : ''}${b.cost ? ' · ' + money(b.cost) : ''}</div><div class="tiny muted">${esc(person(b.created_by)?.name || '')}</div></div></div>`).join('')}</div>`
        : empty(st.s === 'done' ? 'ذكريات صنعناها' : 'لنحلم سوا', st.s === 'done' ? 'هنا ستظهر الأشياء التي جربناها' : 'زيارة مدينة، حضور فعالية، تجربة نشاط جديد…', st.s !== 'done' ? `<br><button class="btn sm" data-new>${icon('plus', 'sm')} أضف أمنية</button>` : '')}
    </div>`;
    el.onclick = (e) => {
      const q = (s) => e.target.closest(s); let b;
      if (q('[data-new]')) return editBucket(null, { status: st.s === 'done' ? 'wishlist' : st.s });
      if ((b = q('[data-s]'))) { st.s = b.dataset.s; return this.render(el); }
      if ((b = q('[data-open]'))) view(byId('bucket', b.dataset.open));
    };
  },
};
