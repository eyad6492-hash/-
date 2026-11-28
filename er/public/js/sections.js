// Configuration of the v3 sections. Each section declares its tabs, card, detail view, workflow buttons,
// form and conversions; pages/s.js renders any of them with one consistent, uncluttered layout.
import { all, byId, create, update, remove, store, today, person, isMe, nameOf } from './store.js';
import { esc, icon, avatar, money, stars, toast, toastErr, img, confirmBox } from './ui.js';
import { openForm } from './form.js';
import { L, opts } from './labels.js';
import { fmtGreg, fmtTime, countdown, diffDays, addDays, weekday } from './dates.js';
import { act, historyHtml, agreementState, commitmentState } from './act.js';
import { editTask, editEvent, editPlace } from './editors.js';
import { fileUrl } from './api.js';
import { coordsFromText } from './geo.js';
import { get } from './api.js';

const P = () => store.partner, ME = () => store.me;
const pname = () => P()?.name || 'الطرف الآخر';
const by = (r) => person(r.created_by)?.name || '';
const day = (d) => (d ? fmtGreg(d, { year: false }) : '');
const cd = (d) => (d ? countdown(diffDays(today(), d)) : '');
const badge = (t, tone = '') => ({ t, tone });
const kv = (rows) => `<dl class="kv">${rows.filter((r) => r && r[1]).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const gallery = (ids) => (ids?.length ? `<div class="gallery" style="margin-top:12px">${ids.map((id) => `<a href="${fileUrl(id)}" target="_blank"><img src="${fileUrl(id)}" loading="lazy" alt=""></a>`).join('')}</div>` : '');
const para = (t) => (t ? `<p style="white-space:pre-wrap;line-height:1.85;margin:0 0 12px">${esc(t)}</p>` : '');
const mineFirst = (field) => (a, b) => (b[field] === ME().id) - (a[field] === ME().id);
const PRI3 = { high: 0, medium: 1, low: 2 };
const whoOpts = (both = true) => [{ v: ME().id, l: `أنا (${ME().name})` }, ...(P() ? [{ v: P().id, l: P().name }] : []), ...(both && P() ? [{ v: 'both', l: 'سوا' }] : [])];
async function geo(v) { if (!v.maps_url) return v; let c = coordsFromText(v.maps_url); if (!c) { try { c = await get('/api/resolve-map?url=' + encodeURIComponent(v.maps_url)); } catch { c = null; } } v.lat = c?.lat ?? null; v.lng = c?.lng ?? null; return v; }

// ================= conversions between sections =================
export function convert(kind, prefill = {}, after) {
  const done = async (item) => { if (after) { try { await after(item); } catch (e) { toastErr(e); } } };
  switch (kind) {
    case 'task': return editTask(null, prefill);
    case 'event': return editEvent(null, { ...prefill, after: () => done(null) });
    case 'shopping': return create('shopping', prefill).then((it) => { toast('أُضيف إلى المقاضي ✓'); return done(it); }).catch(toastErr);
    case 'want': return editPlace(null, prefill);
    default: return editIn(kind, null, prefill, done);
  }
}
const convertMenu = (items) => items.map(([kind, l, ic, prefill, after]) => ({ l, icon: ic, run: () => convert(kind, prefill, after) }));

// ================= sections =================
export const SECTIONS = {
  wishes: {
    title: 'أمنياتنا', kicker: 'نحققها لبعض', icon: 'star', addLabel: 'أمنية',
    tabs: () => [{ k: 'p', l: `أمنيات ${pname()}`, f: (r) => !isMe(r.created_by) }, { k: 'me', l: 'أمنياتي', f: (r) => isMe(r.created_by) }, { k: 'picked', l: 'اخترتها لتحقيقها', f: (r) => r.picked_by === ME().id }],
    chips: { field: 'status', labels: L.wishStatus },
    sort: (a, b) => (a.status === 'done') - (b.status === 'done') || PRI3[a.importance || 'medium'] - PRI3[b.importance || 'medium'] || b.created_at.localeCompare(a.created_at),
    card: (r) => ({ title: r.title, img: r.done_photo || r.image_id, icon: L.wishIcon[r.category], sub: [L.wishCats[r.category], `أُضيفت ${day(r.created_at.slice(0, 10))}`].filter(Boolean).join(' · '),
      badges: [badge(L.wishStatus[r.status || 'open'], r.status === 'done' ? 'ok' : r.status === 'open' ? '' : 'rose'), r.importance === 'high' && badge('مهمة جدًا', 'warn'), r.picked_by === ME().id && badge(r.surprise ? 'اخترتها — مفاجأة 🤫' : 'اخترتها ✨', 'dark')], avatar: r.created_by }),
    detail: (r) => `${r.image_id ? img(r.image_id, 'cover') + '<div style="height:12px"></div>' : ''}${para(r.description)}${kv([['صاحب الأمنية', esc(by(r))], ['التصنيف', L.wishCats[r.category]], ['الأهمية', L.importance[r.importance]], ['تاريخ الإضافة', fmtGreg(r.created_at.slice(0, 10))], ['اختارها', r.picked_by && esc(person(r.picked_by)?.name)], ['موعد التحقيق', r.pick_date && `${fmtGreg(r.pick_date, { weekday: true })} · ${cd(r.pick_date)}`], ['ملاحظات الاختيار', r.pick_notes && esc(r.pick_notes)], ['تحققت في', r.done_date && fmtGreg(r.done_date)], ['ملاحظات', r.notes && esc(r.notes)]])}${r.done_photo ? `<div style="margin-top:12px">${img(r.done_photo, 'cover')}</div>` : ''}`,
    actions: (r) => {
      const a = [];
      if (!isMe(r.created_by) && r.status !== 'done' && !r.picked_by) a.push({ l: 'اخترت أمنية لك', icon: 'heart', tone: 'rose', primary: true, run: () => openForm({ title: 'اخترت أمنية لك ✨', en: r.title, fields: [{ k: 'pick_date', label: 'موعد تحقيقها (اختياري)', type: 'date' }, { k: 'pick_notes', label: 'ملاحظات', type: 'textarea', rows: 2 }, { k: 'surprise', label: 'اجعلها مفاجأة 🤫', type: 'toggle', hint: `لن يعرف ${by(r)} أنك اخترتها حتى تتحقق` }], submit: 'اخترتها', onSubmit: async (v) => { await act('wishes', r.id, 'pick', v); toast(v.surprise ? 'تم — سرّك في أمان 🤫' : `تم إشعار ${by(r)} ✨`); } }) });
      if (r.picked_by === ME().id && r.status !== 'done') {
        if (r.status !== 'planning') a.push({ l: 'جاري التخطيط', icon: 'clock', run: () => act('wishes', r.id, 'progress', { status: 'planning' }) });
        a.push({ l: 'تحققت 🎉', icon: 'check', tone: 'rose', primary: true, run: () => openForm({ title: 'تحققت الأمنية 🎉', fields: [{ k: 'done_date', label: 'تاريخ التحقيق', type: 'date', def: today() }, { k: 'done_photo', label: 'صورة بعد التنفيذ', type: 'image' }], submit: 'تم', onSubmit: async (v) => { await act('wishes', r.id, 'fulfill', v); toast('مبروك! 🎉'); } }) });
        a.push(...convertMenu([['outings', 'خطة خروج', 'route', { title: r.title, date: r.pick_date || today(), description: r.description }]]));
        a.push({ l: 'تراجع عن الاختيار', icon: 'x', run: async () => { if (await confirmBox('التراجع عن اختيار هذه الأمنية؟', { ok: 'تراجع' })) await act('wishes', r.id, 'unpick'); } });
      }
      if (r.status === 'done' && !r.memory_id) a.push(...convertMenu([['memories', 'وثّقها كذكرى', 'image', { title: `تحققت: ${r.title}`, date: r.done_date || today(), description: r.description, photos: [r.done_photo || r.image_id].filter(Boolean) }, (m) => m && update('wishes', r.id, { memory_id: m.id })]]));
      if (isMe(r.created_by) && r.status !== 'done') a.push(...convertMenu([['outings', 'حوّلها لخطة', 'route', { title: r.title, date: today(), description: r.description }]]));
      return a;
    },
    canEdit: (r) => isMe(r.created_by),
    form: (r) => ({ title: r ? 'تعديل الأمنية' : 'أمنية جديدة', values: { importance: 'medium', category: 'experience', status: 'open' }, fields: [
      { k: 'title', label: 'عنوان الأمنية', required: true }, { k: 'category', label: 'التصنيف', type: 'seg', options: opts(L.wishCats) }, { k: 'importance', label: 'درجة الأهمية', type: 'seg', options: opts(L.importance) },
      { k: 'description', label: 'وصف وتفاصيل', type: 'textarea', rows: 3 }, { k: 'image_id', label: 'صورة (اختياري)', type: 'image' }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      ...(r ? [{ k: 'status', label: 'الحالة', type: 'seg', options: opts(L.wishStatus) }] : [])] }),
    empty: ['لا أمنيات هنا بعد', 'سجّل أمنياتك ليتعرف عليها الطرف الآخر ويختار منها ما يحققه لك'],
  },

  outings: {
    title: 'جدول يومنا', kicker: 'خطط خروجاتنا', icon: 'route', addLabel: 'خطة يوم', link: (r) => `#/outing/${r.id}`,
    tabs: () => [{ k: 'up', l: 'القادمة', f: (r) => r.status !== 'done' && r.status !== 'cancelled' && r.date >= today() }, { k: 'past', l: 'السابقة', f: (r) => r.status === 'done' || r.date < today() || r.status === 'cancelled' }],
    sort: (a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')),
    card: (r) => { const n = all('outing_items').filter((i) => i.outing_id === r.id).length; return { title: r.title, icon: 'route', img: r.photos?.[0], sub: `${fmtGreg(r.date, { weekday: true, year: false })}${r.start_time ? ' · ' + fmtTime(r.start_time) : ''} · ${n} ${n === 1 ? 'نشاط' : n === 2 ? 'نشاطان' : 'أنشطة'}`, badges: [r.date >= today() && r.status === 'planned' && badge(cd(r.date), 'rose'), r.memory_id && badge('موثّقة كذكرى', 'ok'), r.status === 'cancelled' && badge('أُلغيت')] }; },
    form: (r) => ({ title: r ? 'تعديل خطة اليوم' : 'خطة يوم جديدة', values: { date: today(), start_time: '17:00', status: 'planned' }, fields: [
      { k: 'title', label: 'اسم الخطة', required: true, placeholder: 'مثال: خطة يوم الجمعة' }, { type: 'pair', fields: [{ k: 'date', label: 'التاريخ', type: 'date', required: true }, { k: 'start_time', label: 'وقت البداية', type: 'time' }] },
      { k: 'description', label: 'وصف اليوم', type: 'textarea', rows: 2 }, { k: 'budget', label: 'الميزانية المتوقعة', type: 'number' }, { k: 'maps_url', label: 'رابط Google Maps', type: 'url', dir: 'ltr', placeholder: 'https://' },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 }, { k: 'photos', label: 'صور قبل الخروج', type: 'images' }, ...(r ? [{ k: 'status', label: 'الحالة', type: 'seg', options: opts(L.outingStatus) }] : [])] }),
    afterCreate: (item) => { location.hash = `#/outing/${item.id}`; },
    empty: ['لا خطط بعد', 'خططوا ليومكم القادم: الخروج، المطعم، النشاط، القهوة… كل شيء بوقته'],
  },

  memories: {
    title: 'ذكرياتنا', kicker: 'أيام لا تُنسى', icon: 'image', addLabel: 'ذكرى', timeline: true, search: ['title', 'description', 'places', 'restaurants', 'activities', 'location'],
    sort: (a, b) => b.date.localeCompare(a.date),
    card: (r) => ({ title: r.title, img: r.photos?.[0], icon: 'image', sub: [r.location, r.rating ? '★'.repeat(r.rating) : ''].filter(Boolean).join(' · '), text: r.description }),
    detail: (r) => `${gallery(r.photos)}<div style="height:12px"></div>${para(r.description)}${kv([['التاريخ', fmtGreg(r.date, { weekday: true })], ['المكان', r.location && esc(r.location)], ['الأماكن', r.places && esc(r.places)], ['المطاعم', r.restaurants && esc(r.restaurants)], ['الأنشطة', r.activities && esc(r.activities)], ['تقييم اليوم', r.rating && stars(r.rating)]])}
      <div class="section-title"><h2>تعليقاتنا</h2></div>${[['E', 'comment_e'], ['R', 'comment_r']].map(([l, k]) => { const u = [ME(), P()].find((x) => x?.letter === l); return u ? `<div class="comment">${avatar(u, 'sm')}<div class="bubble">${r[k] ? esc(r[k]) : `<span class="muted">${u.id === ME().id ? 'لم تكتب تعليقك بعد' : 'لم يُكتب بعد'}</span>`}</div></div>` : ''; }).join('')}`,
    actions: (r) => [{ l: 'تعليقي', icon: 'note', run: () => { const k = ME().letter === 'R' ? 'comment_r' : 'comment_e'; openForm({ title: 'تعليقي على اليوم', values: { [k]: r[k] }, fields: [{ k, label: 'تعليقك', type: 'textarea', rows: 4 }], onSubmit: (v) => update('memories', r.id, v) }); } },
      ...convertMenu([['visited', 'احفظ المكان في «أماكن زرناها»', 'pin', { name: r.location || r.places || r.title, visit_date: r.date, photos: r.photos || [], rating: r.rating }]])],
    form: (r) => ({ title: r ? 'تعديل الذكرى' : 'ذكرى جديدة', values: { date: today() }, fields: [
      { k: 'title', label: 'العنوان', required: true }, { k: 'date', label: 'التاريخ', type: 'date', required: true }, { k: 'description', label: 'ماذا حدث؟', type: 'textarea', rows: 4 },
      { k: 'location', label: 'المكان' }, { k: 'places', label: 'الأماكن التي زرناها', type: 'textarea', rows: 2 }, { k: 'restaurants', label: 'المطاعم', type: 'textarea', rows: 2 }, { k: 'activities', label: 'الأنشطة', type: 'textarea', rows: 2 },
      { k: 'rating', label: 'تقييم اليوم', type: 'stars' }, { k: 'photos', label: 'الصور', type: 'images' }, { k: ME().letter === 'R' ? 'comment_r' : 'comment_e', label: `تعليقك (${ME().name})`, type: 'textarea', rows: 2 }] }),
    empty: ['ذكرياتنا تبدأ هنا', 'وثّقوا خروجاتكم وأيامكم الجميلة — أو اضغطوا «وثّق يومنا كذكرى» من أي خطة يوم'],
  },

  visited: {
    title: 'أماكن زرناها', kicker: 'أينما ذهبنا سوا', icon: 'pin', addLabel: 'مكان', search: ['name', 'location', 'description', 'notes'], map: true,
    chips: { field: 'type', labels: L.visitedTypes },
    sort: (a, b) => (b.visit_date || '').localeCompare(a.visit_date || ''),
    card: (r) => ({ title: r.name, img: r.photos?.[0], icon: L.visitedIcon[r.type], sub: [L.visitedTypes[r.type], r.location, r.visit_date && day(r.visit_date)].filter(Boolean).join(' · '), badges: [r.rating && badge('★'.repeat(r.rating), 'warn'), r.revisit && badge('نرجع له 🔁', 'rose')] }),
    detail: (r) => `${gallery(r.photos)}<div style="height:12px"></div>${para(r.description)}${kv([['النوع', L.visitedTypes[r.type]], ['الموقع', r.location && esc(r.location)], ['تاريخ الزيارة', r.visit_date && fmtGreg(r.visit_date, { weekday: true })], ['التقييم', r.rating && stars(r.rating)], ['نرغب بزيارته مرة أخرى', r.revisit ? 'نعم 🔁' : 'لا'], ['ملاحظات', r.notes && esc(r.notes)]])}`,
    actions: (r) => [r.maps_url && { l: 'فتح الخريطة', icon: 'map', href: r.maps_url },
      !r.place_id && { l: 'أضفه لأماكن نريد زيارتها', icon: 'repeat', run: async () => { const pl = await create('places', { name: r.name, category: { cafe: 'cafe', restaurant: 'restaurant', fun: 'activity', event: 'activity' }[r.type] || 'new', maps_url: r.maps_url, location: r.location, lat: r.lat, lng: r.lng, visited: 0, notes: r.notes, image_id: r.photos?.[0] || null }); await update('visited', r.id, { revisit: 1, place_id: pl.id }); toast('أُضيف لقائمة «أماكننا» ✓'); } }].filter(Boolean),
    form: (r) => ({ title: r ? 'تعديل المكان' : 'مكان زرناه', values: { type: 'restaurant', visit_date: today() }, fields: [
      { k: 'name', label: 'اسم المكان', required: true }, { k: 'type', label: 'نوع المكان', type: 'seg', options: opts(L.visitedTypes) }, { type: 'pair', fields: [{ k: 'location', label: 'الموقع' }, { k: 'visit_date', label: 'تاريخ الزيارة', type: 'date' }] },
      { k: 'maps_url', label: 'رابط Google Maps', type: 'url', dir: 'ltr', placeholder: 'https://', hint: 'ليظهر المكان على الخريطة' }, { k: 'description', label: 'وصف الزيارة', type: 'textarea', rows: 3 }, { k: 'rating', label: 'تقييم المكان', type: 'stars' },
      { k: 'revisit', label: 'نرغب بزيارته مرة أخرى', type: 'toggle' }, { k: 'photos', label: 'الصور', type: 'images' }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 }] }),
    beforeSave: geo,
    empty: ['خريطة ذكرياتنا', 'سجّلوا الأماكن التي زرتموها معًا: مطاعم، مقاهي، مدن، فعاليات…'],
  },

  appointments: {
    title: 'مواعيدنا', kicker: 'المستشفى والمراجعات', icon: 'clock', addLabel: 'موعد',
    tabs: () => [{ k: 'up', l: 'القادمة', f: (r) => r.date >= today() && r.status !== 'done' && r.status !== 'cancelled' }, { k: 'me', l: 'مواعيدي', f: (r) => (r.person === ME().id || r.person === 'both') && r.date >= today() }, { k: 'p', l: `مواعيد ${pname()}`, f: (r) => (r.person === P()?.id || r.person === 'both') && r.date >= today() }, { k: 'past', l: 'السابقة', f: (r) => r.date < today() || r.status === 'done' }],
    sort: (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')),
    card: (r) => ({ title: r.title, icon: { hospital: 'plus', doctor: 'user', lab: 'drop', dental: 'smile', other: 'clock' }[r.kind] || 'clock', sub: `${L.apptKinds[r.kind || 'other']} · ${fmtGreg(r.date, { weekday: true, year: false })}${r.time ? ' · ' + fmtTime(r.time) : ''}${r.location ? ' · ' + r.location : ''}`, badges: [r.date === today() && badge('اليوم', 'rose'), r.date > today() && badge(cd(r.date)), r.status === 'done' && badge('تم', 'ok'), r.remind && badge('🔔')], avatar: r.person || 'both' }),
    detail: (r) => `${para(r.description)}${kv([['النوع', L.apptKinds[r.kind || 'other']], ['صاحب الموعد', esc(nameOf(r.person || 'both'))], ['التاريخ', fmtGreg(r.date, { weekday: true })], ['الوقت', r.time && fmtTime(r.time)], ['الموقع', r.location && esc(r.location)], ['التذكير', r.remind && (r.remind === 'custom' ? esc((r.remind_at || '').replace('T', ' ')) : L.apptRemind[r.remind])], ['ملاحظات', r.notes && esc(r.notes)]])}${r.attachment_id ? `<a class="badge rose" style="margin-top:12px" href="${fileUrl(r.attachment_id)}" target="_blank">${icon('file', 'sm')} ${esc(r.attachment_name || 'المرفق')}</a>` : ''}`,
    actions: (r) => [r.maps_url && { l: 'فتح الموقع', icon: 'map', href: r.maps_url }, r.status !== 'done' && { l: 'تم الموعد ✓', icon: 'check', run: () => update('appointments', r.id, { status: 'done' }) }, ...convertMenu([['memories', 'حوّله لذكرى', 'image', { title: r.title, date: r.date, location: r.location, description: r.description }]])].filter(Boolean),
    form: (r) => ({ title: r ? 'تعديل الموعد' : 'موعد جديد', values: { kind: 'doctor', person: ME().id, date: today(), remind: '1', status: 'upcoming' }, fields: [
      { k: 'title', label: 'اسم الموعد', required: true, placeholder: 'مثال: مراجعة عيادة الأسنان' }, { k: 'kind', label: 'النوع', type: 'seg', options: opts(L.apptKinds) }, { k: 'person', label: 'صاحب الموعد', type: 'user' },
      { type: 'pair', fields: [{ k: 'date', label: 'التاريخ', type: 'date', required: true }, { k: 'time', label: 'الوقت', type: 'time' }] }, { k: 'location', label: 'الموقع' }, { k: 'maps_url', label: 'رابط الموقع', type: 'url', dir: 'ltr', placeholder: 'https://' },
      { k: 'description', label: 'وصف', type: 'textarea', rows: 2 }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      { k: 'remind', label: 'التذكير', type: 'seg', options: opts(L.apptRemind) }, { k: 'remind_at', label: 'وقت التذكير المخصص', type: 'datetime-local', show: (v) => v.remind === 'custom' },
      { k: 'attachment_id', label: 'صورة أو مستند', type: 'attach', nameKey: 'attachment_name' }, ...(r ? [{ k: 'status', label: 'الحالة', type: 'seg', options: opts(L.apptStatus) }] : [])] }),
    empty: ['لا مواعيد قادمة', 'أضيفوا مواعيد المستشفى، المراجعات، التحاليل والأسنان — مع تذكير قبلها'],
  },

  daily_tasks: {
    title: 'مهامنا اليومية', kicker: 'ما يجب إنجازه اليوم', icon: 'tasks', addLabel: 'مهمة',
    tabs: () => [{ k: 'today', l: 'اليوم', f: (r) => r.date === today() }, { k: 'week', l: 'هذا الأسبوع', f: (r) => r.date >= today() && r.date <= addDays(today(), 6 - ((weekday(today()) + 1) % 7)) && r.status !== 'done' }, { k: 'late', l: 'المتأخرة', f: (r) => r.date < today() && r.status !== 'done' }, { k: 'me', l: 'مهامي', f: (r) => r.assignee === ME().id && r.status !== 'done' }, { k: 'p', l: `مهام ${pname()}`, f: (r) => r.assignee === P()?.id && r.status !== 'done' }, { k: 'done', l: 'المنجزة', f: (r) => r.status === 'done' }],
    sort: (a, b) => (a.status === 'done') - (b.status === 'done') || (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')) || PRI3[a.priority || 'medium'] - PRI3[b.priority || 'medium'],
    card: (r) => ({ title: r.title, check: { on: r.status === 'done', run: () => update('daily_tasks', r.id, { status: r.status === 'done' ? 'pending' : 'done' }) }, sub: [r.date !== today() && fmtGreg(r.date, { weekday: true, year: false }), r.time && fmtTime(r.time), r.description].filter(Boolean).join(' · '), badges: [r.date < today() && r.status !== 'done' && badge('متأخرة', 'warn'), r.priority === 'high' && badge('أولوية عالية', 'rose'), r.status === 'in_progress' && badge('قيد التنفيذ')], avatar: r.assignee || 'both' }),
    detail: (r) => `${para(r.description)}${kv([['المسؤول', esc(nameOf(r.assignee || 'both'))], ['التاريخ', fmtGreg(r.date, { weekday: true })], ['الوقت', r.time && fmtTime(r.time)], ['الأولوية', L.priority[r.priority || 'medium']], ['الحالة', L.dailyStatus[r.status || 'pending']], ['أنجزها', r.completed_by && esc(person(r.completed_by)?.name)], ['ملاحظات', r.notes && esc(r.notes)]])}`,
    actions: (r) => [{ l: 'أضفها لجدول اليوم', icon: 'route', run: () => addToOuting(r.date, { title: r.title, time: r.time, kind: 'activity', notes: r.description }) }],
    form: (r) => ({ title: r ? 'تعديل المهمة' : 'مهمة يومية', values: { assignee: ME().id, date: today(), priority: 'medium', status: 'pending' }, fields: [
      { k: 'title', label: 'اسم المهمة', required: true }, { k: 'assignee', label: 'المسؤول', type: 'user' }, { type: 'pair', fields: [{ k: 'date', label: 'التاريخ', type: 'date', required: true }, { k: 'time', label: 'الوقت', type: 'time' }] },
      { k: 'priority', label: 'الأولوية', type: 'seg', options: opts(L.priority) }, { k: 'status', label: 'الحالة', type: 'seg', options: opts(L.dailyStatus) }, { k: 'description', label: 'وصف', type: 'textarea', rows: 2 }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 }] }),
    empty: ['يوم خفيف', 'لا توجد مهام هنا — أضيفوا مهام اليوم لكل شخص'],
  },

  cravings: {
    title: 'وش نفسك فيه اليوم؟', kicker: 'رغباتنا الصغيرة', icon: 'coffee', addLabel: 'نفسي في…',
    tabs: () => [{ k: 'today', l: 'اليوم', f: (r) => r.date === today() }, { k: 'p', l: `${pname()}`, f: (r) => !isMe(r.created_by) }, { k: 'me', l: 'أنا', f: (r) => isMe(r.created_by) }, { k: 'all', l: 'الكل', f: () => true }],
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') || b.created_at.localeCompare(a.created_at),
    card: (r) => ({ title: r.text, img: r.image_id, emoji: (L.cravingCats[r.category || 'other'] || '').split(' ')[0], sub: `${by(r)} · ${r.date === today() ? 'اليوم' : day(r.date)}${r.note ? ' · ' + r.note : ''}`, badges: [r.status && r.status !== 'open' && badge(L.cravingStatus[r.status], r.status === 'done' ? 'ok' : 'rose')], avatar: r.created_by }),
    detail: (r) => `${r.image_id ? img(r.image_id, 'cover') + '<div style="height:12px"></div>' : ''}${kv([['من', esc(by(r))], ['التصنيف', L.cravingCats[r.category || 'other']], ['التاريخ', r.date && fmtGreg(r.date, { weekday: true })], ['الحالة', L.cravingStatus[r.status || 'open']], ['ملاحظة', r.note && esc(r.note)]])}`,
    actions: (r) => {
      const mark = (col) => (it) => it && update('cravings', r.id, { status: 'planned', link_col: col, link_id: it.id });
      return [r.status !== 'done' && { l: 'تحققت ✓', icon: 'check', tone: 'rose', run: () => update('cravings', r.id, { status: 'done' }) },
        ...convertMenu([['requests', 'حوّلها لطلب', 'send', { title: r.text, details: r.note, to_user: isMe(r.created_by) ? P()?.id : ME().id, proposed_date: r.date }, mark('requests')], ['outings', 'خطة خروج', 'route', { title: r.text, date: r.date || today() }, mark('outings')], ['daily_tasks', 'مهمة', 'tasks', { title: r.text, date: r.date || today(), assignee: ME().id }, mark('daily_tasks')], ['event', 'موعد في التقويم', 'calendar', { title: r.text, date: r.date || today(), type: 'event' }], ['wishes', 'أمنية', 'star', { title: r.text, description: r.note }, mark('wishes')]])].filter(Boolean);
    },
    canEdit: (r) => isMe(r.created_by),
    form: (r) => ({ title: r ? 'تعديل' : 'وش نفسك فيه اليوم؟', values: { category: 'food', date: today(), status: 'open' }, fields: [
      { k: 'text', label: 'نفسي في…', required: true, placeholder: 'مثال: بيتزا، قهوة، نطلع نتمشى' }, { k: 'category', label: 'التصنيف', type: 'seg', options: opts(L.cravingCats) }, { k: 'date', label: 'التاريخ', type: 'date' },
      { k: 'note', label: 'ملاحظة', type: 'textarea', rows: 2 }, { k: 'image_id', label: 'صورة (اختياري)', type: 'image' }, ...(r ? [{ k: 'status', label: 'الحالة', type: 'seg', options: opts(L.cravingStatus) }] : [])] }),
    empty: ['وش نفسك فيه؟', 'اكتب ما ترغب فيه اليوم — بيتزا، قهوة، حلى، طلعة… والطرف الآخر يشوفه فورًا'],
  },

  confessions: {
    title: 'اعترافات', kicker: 'مساحة آمنة للمصارحة', icon: 'note', addLabel: 'اعتراف', gate: 'pledge', calm: true,
    tabs: () => [{ k: 'p', l: `من ${pname()}`, f: (r) => !isMe(r.created_by) }, { k: 'me', l: 'اعترافاتي', f: (r) => isMe(r.created_by) }],
    sort: (a, b) => b.created_at.localeCompare(a.created_at),
    card: (r) => ({ title: r.title || (r.body.length > 60 ? r.body.slice(0, 60) + '…' : r.body), icon: 'note', sub: `${by(r)} · ${day(r.created_at.slice(0, 10))}`, badges: [r.needs_talk && badge('يحتاج إلى نقاش', 'rose'), r.importance === 'high' && badge('مهم'), isMe(r.created_by) && badge(r.read_at ? 'قرأه ✓' : 'لم يُقرأ بعد'), r.status === 'discussed' && badge('تمت المناقشة', 'ok')], avatar: r.created_by }),
    onOpen: (r) => (!isMe(r.created_by) && !r.read_at ? act('confessions', r.id, 'read').catch(() => {}) : null),
    detail: (r) => `<div class="letter">${r.title ? `<div style="font-weight:600;margin-bottom:6px">${esc(r.title)}</div>` : ''}${para(r.body)}<div class="tiny muted">— ${esc(by(r))}، ${fmtGreg(r.created_at.slice(0, 10), { weekday: true })}</div></div>${kv([['الأهمية', L.importance[r.importance || 'medium']], ['يحتاج إلى نقاش', r.needs_talk ? 'نعم' : 'لا'], ['قُرئ', r.read_at && fmtGreg(r.read_at.slice(0, 10))], ['ملاحظة', r.note && esc(r.note)]])}`,
    actions: (r) => [r.status !== 'discussed' && r.needs_talk && isMe(r.created_by) && { l: 'تمت المناقشة', icon: 'check', run: () => update('confessions', r.id, { status: 'discussed' }) }].filter(Boolean),
    canEdit: (r) => isMe(r.created_by),
    form: (r) => ({ title: r ? 'تعديل الاعتراف' : 'اعتراف جديد', values: { importance: 'medium' }, fields: [
      { type: 'info', html: 'اكتب بصدق وهدوء — الهدف أن نفهم بعض 🤍' }, { k: 'title', label: 'عنوان (اختياري)' }, { k: 'body', label: 'ماذا تريد أن تقول؟', type: 'textarea', rows: 6, required: true, placeholder: 'شيء في خاطري… شعور… موقف… اعتذار…' },
      { k: 'importance', label: 'مستوى الأهمية', type: 'seg', options: opts(L.importance) }, { k: 'needs_talk', label: 'يحتاج إلى نقاش', type: 'toggle' }, { k: 'note', label: 'ملاحظة', type: 'textarea', rows: 2 }] }),
    empty: ['مساحة آمنة', 'هنا نكتب ما لم نستطع قوله — بلا لوم، فقط لنفهم بعضنا'],
  },

  upsets: {
    title: 'شيء زعلني منك', kicker: 'لنتفاهم بهدوء', icon: 'smile', addLabel: 'موقف', calm: true,
    tabs: () => [{ k: 'p', l: `من ${pname()}`, f: (r) => !isMe(r.created_by) }, { k: 'me', l: 'ما كتبته أنا', f: (r) => isMe(r.created_by) }, { k: 'open', l: 'لم تُحل بعد', f: (r) => !['discussed', 'resolved'].includes(r.status) }],
    sort: (a, b) => (b.date || b.created_at).localeCompare(a.date || a.created_at),
    card: (r) => ({ title: r.title, icon: 'smile', sub: `${by(r)} · ${day(r.date || r.created_at.slice(0, 10))}`, badges: [badge(L.upsetStatus[r.status || 'unread'], ['discussed', 'resolved'].includes(r.status) ? 'ok' : 'sage'), r.want_talk && badge('يرغب بالنقاش')], avatar: r.created_by }),
    onOpen: (r) => (!isMe(r.created_by) && (r.status || 'unread') === 'unread' ? act('upsets', r.id, 'read').catch(() => {}) : null),
    detail: (r) => `${para(r.details)}${kv([['سجّله', esc(by(r))], ['الشخص المعني', esc(nameOf(r.about))], ['التاريخ', fmtGreg(r.date || r.created_at.slice(0, 10), { weekday: true })], ['ما الذي أزعجني؟', r.what_bothered && esc(r.what_bothered)], ['ما الذي كنت أتمنى حدوثه؟', r.wished_instead && esc(r.wished_instead)], ['أرغب بمناقشته', r.want_talk ? 'نعم' : 'لا']])}
      <div class="section-title"><h2>الحالة</h2></div><div class="seg">${Object.entries(L.upsetStatus).filter(([k]) => k !== 'unread').map(([k, l]) => `<button data-setstatus="${k}" class="${r.status === k ? 'on' : ''}">${l}</button>`).join('')}</div>`,
    setStatus: (r, s) => update('upsets', r.id, { status: s }),
    canEdit: (r) => isMe(r.created_by),
    form: (r) => ({ title: r ? 'تعديل' : 'شيء زعلني منك', values: { date: today(), about: P()?.id, want_talk: 1 }, fields: [
      { type: 'info', html: 'الهدف التفاهم وليس المحاسبة — صِف الموقف بهدوء 🤍' }, { k: 'title', label: 'عنوان', required: true }, { k: 'details', label: 'تفاصيل الموقف', type: 'textarea', rows: 3 }, { k: 'date', label: 'التاريخ', type: 'date' },
      { k: 'what_bothered', label: 'ما الذي أزعجني؟', type: 'textarea', rows: 2 }, { k: 'wished_instead', label: 'ما الذي كنت أتمنى حدوثه بدلًا من ذلك؟', type: 'textarea', rows: 2 }, { k: 'want_talk', label: 'أريد مناقشة الموضوع', type: 'toggle' }] }),
    beforeSave: (v) => { v.about = P()?.id || ME().id; return v; },
    empty: ['كل شيء بخير 🤍', 'إن ضايقك شيء، اكتبه هنا بهدوء ليفهمه الطرف الآخر ونتناقش فيه'],
  },

  joys: {
    title: 'كيف تسعدني؟', kicker: 'دليلنا لبعض', icon: 'heart', addLabel: 'إضافة', grouped: 'kind',
    tabs: () => [{ k: 'p', l: `دليل ${pname()}`, f: (r) => !isMe(r.created_by) }, { k: 'me', l: 'دليلي', f: (r) => isMe(r.created_by) }],
    sort: (a, b) => (a.importance === 'very' ? 0 : 1) - (b.importance === 'very' ? 0 : 1) || a.created_at.localeCompare(b.created_at),
    card: (r) => ({ title: r.title, emoji: r.kind === 'joy' ? '🌷' : '🍂', sub: [L.joyCats[r.category], r.description].filter(Boolean).join(' · '), badges: [r.importance === 'very' && badge('مهم جدًا', r.kind === 'joy' ? 'rose' : 'sage')] }),
    detail: (r) => `${para(r.description)}${kv([['القائمة', L.joyKinds[r.kind]], ['التصنيف', L.joyCats[r.category]], ['الأهمية', r.importance === 'very' ? 'مهم جدًا' : 'عادي'], ['ملاحظات', r.notes && esc(r.notes)]])}`,
    canEdit: (r) => isMe(r.created_by),
    form: (r, d) => ({ title: r ? 'تعديل' : (d?.kind === 'dislike' ? 'شيء يضايقني' : 'شيء يسعدني'), values: { kind: 'joy', importance: 'normal', category: 'attention' }, fields: [
      { k: 'kind', label: 'القائمة', type: 'seg', options: opts(L.joyKinds) }, { k: 'title', label: 'التصرف أو الشيء', required: true, placeholder: 'مثال: السؤال عني خلال اليوم' }, { k: 'description', label: 'وصف', type: 'textarea', rows: 2 },
      { k: 'category', label: 'التصنيف', type: 'seg', options: opts(L.joyCats) }, { k: 'importance', label: 'الأهمية', type: 'seg', options: [{ v: 'very', l: 'مهم جدًا' }, { v: 'normal', l: 'عادي' }] }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 }] }),
    empty: ['ساعدنا نفهمك', 'سجّل الأشياء التي تسعدك والتي تضايقك — مرجع دائم للطرف الآخر'],
  },

  urgent: {
    title: 'أشياء عاجلة', kicker: 'في أقرب وقت', icon: 'flag', addLabel: 'أمر عاجل',
    tabs: () => [{ k: 'open', l: 'بانتظار الإنجاز', f: (r) => r.status !== 'done' }, { k: 'done', l: 'أُنجزت', f: (r) => r.status === 'done' }],
    sort: (a, b) => ({ critical: 0, urgent: 1, normal: 2 }[a.priority || 'urgent'] - { critical: 0, urgent: 1, normal: 2 }[b.priority || 'urgent']) || (a.deadline || '9').localeCompare(b.deadline || '9'),
    card: (r) => ({ title: r.title, check: { on: r.status === 'done', run: () => update('urgent', r.id, { status: r.status === 'done' ? 'open' : 'done' }) }, sub: [r.deadline && `الموعد النهائي ${fmtGreg(r.deadline, { year: false })} · ${cd(r.deadline)}`, r.details].filter(Boolean).join(' · '), badges: [badge(L.urgentPriority[r.priority || 'urgent'], r.priority === 'critical' ? 'rose' : r.priority === 'normal' ? '' : 'warn'), r.deadline && r.deadline < today() && r.status !== 'done' && badge('فات موعده', 'warn')], avatar: r.assignee || 'both' }),
    detail: (r) => `${para(r.details)}${kv([['المسؤول', esc(nameOf(r.assignee || 'both'))], ['الموعد النهائي', r.deadline && `${fmtGreg(r.deadline, { weekday: true })} · ${cd(r.deadline)}`], ['الأولوية', L.urgentPriority[r.priority || 'urgent']], ['الحالة', r.status === 'done' ? 'تم الإنجاز' : 'بانتظار الإنجاز'], ['ملاحظات', r.notes && esc(r.notes)]])}`,
    actions: (r) => convertMenu([['task', 'حوّله لمهمة', 'tasks', { title: r.title, description: r.details, due_date: r.deadline, assignee: r.assignee, priority: 'high' }], ['event', 'حوّله لموعد', 'calendar', { title: r.title, date: r.deadline || today(), notes: r.details, assignee: r.assignee }]]),
    form: (r) => ({ title: r ? 'تعديل' : 'أمر عاجل', values: { priority: 'urgent', assignee: ME().id, status: 'open' }, fields: [
      { k: 'title', label: 'العنوان', required: true }, { k: 'details', label: 'التفاصيل', type: 'textarea', rows: 2 }, { k: 'assignee', label: 'المسؤول', type: 'user' },
      { type: 'pair', fields: [{ k: 'deadline', label: 'الموعد النهائي', type: 'date' }, { k: 'priority', label: 'الأولوية', type: 'select', options: opts(L.urgentPriority) }] }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 }] }),
    empty: ['لا شيء عاجل 🎉', 'الأمور التي يجب إنجازها في أقرب وقت تظهر هنا وفي الرئيسية'],
  },

  requests: {
    title: 'طلباتنا', kicker: 'نطلب من بعض بلطف', icon: 'send', addLabel: 'طلب',
    tabs: () => [{ k: 'tome', l: 'طلبات لي', f: (r) => r.to_user === ME().id }, { k: 'fromme', l: 'طلباتي', f: (r) => r.created_by === ME().id }, { k: 'pending', l: 'بانتظار الرد', f: (r) => r.status === 'pending' }],
    sort: (a, b) => (a.status !== 'pending') - (b.status !== 'pending') || b.created_at.localeCompare(a.created_at),
    card: (r) => ({ title: r.title, icon: 'send', sub: `${by(r)} ← ${nameOf(r.to_user)} · ${L.requestKinds[r.kind || 'other']}${r.proposed_date ? ' · ' + day(r.proposed_date) : ''}`, badges: [badge(L.requestStatus[r.status || 'pending'], { approved: 'ok', done: 'ok', rejected: 'warn', pending: r.to_user === ME().id ? 'rose' : '' }[r.status] || '')], avatar: r.created_by }),
    detail: (r) => `${para(r.details)}${kv([['من', esc(by(r))], ['إلى', esc(nameOf(r.to_user))], ['النوع', L.requestKinds[r.kind || 'other']], ['تاريخ الطلب', fmtGreg(r.created_at.slice(0, 10))], ['تاريخ مقترح للتنفيذ', r.proposed_date && fmtGreg(r.proposed_date, { weekday: true })], ['الحالة', L.requestStatus[r.status || 'pending']], ['الرد', r.response_note && esc(r.response_note)], ['ملاحظات', r.notes && esc(r.notes)]])}${historyHtml(r)}`,
    actions: (r) => {
      const a = [];
      const respond = (status, l, ic, tone, needNote) => ({ l, icon: ic, tone, primary: status === 'approved', run: () => (needNote ? openForm({ title: l, fields: [{ k: 'note', label: 'ملاحظة للطرف الآخر', type: 'textarea', rows: 3, required: status === 'clarify' }], submit: l, onSubmit: (v) => act('requests', r.id, 'respond', { status, note: v.note }) }) : act('requests', r.id, 'respond', { status })) });
      if (r.to_user === ME().id && ['pending', 'clarify', 'postponed'].includes(r.status)) a.push(respond('approved', 'موافقة', 'check', 'rose'), respond('clarify', 'طلب توضيح', 'note', '', true), respond('postponed', 'تأجيل الرد', 'clock', '', true), respond('rejected', 'رفض بلطف', 'x', '', true));
      if (r.status === 'approved') a.push({ l: 'تم التنفيذ ✓', icon: 'check', run: () => act('requests', r.id, 'done') }, ...convertMenu([['task', 'حوّله لمهمة', 'tasks', { title: r.title, description: r.details, due_date: r.proposed_date, assignee: r.to_user }], ['event', 'حوّله لموعد', 'calendar', { title: r.title, date: r.proposed_date || today(), notes: r.details }]]));
      if (isMe(r.created_by) && ['clarify', 'postponed', 'rejected'].includes(r.status)) a.push({ l: 'إعادة الإرسال', icon: 'repeat', run: () => act('requests', r.id, 'reopen') });
      return a;
    },
    canEdit: (r) => isMe(r.created_by),
    form: (r) => ({ title: r ? 'تعديل الطلب' : `طلب إلى ${pname()}`, values: { kind: 'favor', to_user: P()?.id }, fields: [
      { k: 'title', label: 'عنوان الطلب', required: true }, { k: 'kind', label: 'نوع الطلب', type: 'seg', options: opts(L.requestKinds) }, { k: 'details', label: 'التفاصيل', type: 'textarea', rows: 3 },
      { k: 'proposed_date', label: 'تاريخ مقترح للتنفيذ', type: 'date' }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 }] }),
    beforeSave: (v, r) => { if (!r) v.to_user = P()?.id; return v; },
    needsPartner: true,
    empty: ['لا طلبات', 'أرسل طلبًا للطرف الآخر — يستطيع الموافقة أو طلب توضيح أو التأجيل'],
  },

  commitments: {
    title: 'تعهداتنا', kicker: 'عقود صغيرة بيننا', icon: 'shield', addLabel: 'تعهد', contract: true,
    tabs: () => [{ k: 'all', l: 'الكل', f: () => true }, { k: 'mine', l: 'تعهداتي', f: (r) => r.promiser === ME().id }, { k: 'p', l: `تعهدات ${pname()}`, f: (r) => r.promiser === P()?.id }, { k: 'pending', l: 'بانتظار الموافقة', f: (r) => r.status === 'pending' }],
    sort: (a, b) => (a.status !== 'pending') - (b.status !== 'pending') || b.created_at.localeCompare(a.created_at),
    card: (r) => { const s = commitmentState(r, today()); return { title: r.title, icon: 'shield', sub: `${nameOf(r.promiser)} يتعهد${person(r.promiser)?.letter === 'R' ? '' : ''} · ${day(r.created_at.slice(0, 10))}`, badges: [badge(L.commitStatus[s], { active: 'ok', completed: 'ok', pending: r.promiser === ME().id ? 'rose' : '', rejected: 'warn' }[s] || '')], avatar: r.promiser }; },
    detail: (r) => { const s = commitmentState(r, today()); const pr = person(r.promiser); return `<div class="contract"><div class="contract-h">تعهد</div><div class="contract-t">${esc(r.title)}</div>${para(r.details)}
      <div class="contract-p">أتعهد أنا <b>${esc(pr?.name || '')}</b>${r.created_by !== r.promiser ? ` بناءً على طلب <b>${esc(by(r))}</b>` : ''}${r.start_date ? ` ابتداءً من ${fmtGreg(r.start_date)}` : ''}${r.duration_days ? ` ولمدة ${r.duration_days} ${r.duration_days <= 10 ? 'أيام' : 'يومًا'}` : ''}.</div>
      <div class="contract-sign">${r.accepted_at ? `<span>✍️ ${esc(person(r.accepted_by)?.name || '')}</span><span class="tiny muted">${fmtGreg(r.accepted_at.slice(0, 10))} · ${new Date(r.accepted_at).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}</span>` : '<span class="muted">بانتظار التوقيع</span>'}</div>
      <div class="badge ${s === 'active' ? 'ok' : ''}" style="margin-top:10px">${L.commitStatus[s]}</div></div>${r.notes ? kv([['ملاحظات', esc(r.notes)]]) : ''}${historyHtml(r)}`; },
    actions: (r) => [r.promiser === ME().id && r.status === 'pending' && { l: 'أوافق وأتعهد ✍️', icon: 'check', tone: 'rose', primary: true, run: () => act('commitments', r.id, 'accept') },
      r.promiser === ME().id && r.status === 'pending' && { l: 'أعتذر', icon: 'x', run: () => openForm({ title: 'الاعتذار عن التعهد', fields: [{ k: 'note', label: 'السبب (اختياري)', type: 'textarea', rows: 2 }], submit: 'إرسال', onSubmit: (v) => act('commitments', r.id, 'reject', v) }) },
      r.status === 'accepted' && { l: 'اكتمل التعهد', icon: 'check', run: () => act('commitments', r.id, 'complete') }].filter(Boolean),
    canEdit: (r) => isMe(r.created_by) && r.status === 'pending',
    form: (r) => ({ title: r ? 'تعديل التعهد' : 'تعهد جديد', values: { promiser: P()?.id || ME().id, start_date: today() }, fields: [
      { k: 'title', label: 'عنوان التعهد', required: true, placeholder: 'مثال: الالتزام بموعد الاتصال' }, { k: 'details', label: 'تفاصيل التعهد', type: 'textarea', rows: 3 },
      { k: 'promiser', label: 'صاحب التعهد (من يتعهد)', type: 'user', both: false, hint: 'إن طلبته من الطرف الآخر يجب أن يوافق عليه داخل التطبيق' },
      { type: 'pair', fields: [{ k: 'start_date', label: 'تاريخ البداية', type: 'date' }, { k: 'duration_days', label: 'المدة بالأيام (اختياري)', type: 'number' }] }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 }] }),
    empty: ['لا تعهدات', 'تعهد صغير يحسّن شيئًا يتكرر — أنشئه في ثوانٍ ويوقّعه صاحبه إلكترونيًا'],
  },

  agreements: {
    title: 'اتفاقياتنا', kicker: 'نتفق ثم نلتزم', icon: 'users', addLabel: 'اتفاق', contract: true,
    tabs: () => [{ k: 'act', l: 'الفعّالة', f: (r) => agreementState(r) === 'both' }, { k: 'wait', l: 'بانتظار الموافقة', f: (r) => ['pending', 'approved_e', 'approved_r', 'draft'].includes(agreementState(r)) }, { k: 'closed', l: 'المكتملة والملغاة', f: (r) => !!r.closed }],
    sort: (a, b) => b.created_at.localeCompare(a.created_at),
    card: (r) => { const s = agreementState(r); const mine = ME().letter === 'R' ? r.r_approved_at : r.e_approved_at; return { title: r.title, icon: 'users', sub: `${day(r.date || r.created_at.slice(0, 10))}${r.end_date ? ' — حتى ' + day(r.end_date) : ''}${r.version > 1 ? ` · النسخة ${r.version}` : ''}`, badges: [badge(L.agreeStatus[s], s === 'both' ? 'ok' : !mine && !r.closed && !r.draft ? 'rose' : ''), !mine && !r.closed && !r.draft && badge('بانتظار موافقتك', 'dark')] }; },
    detail: (r) => { const s = agreementState(r); const sig = (l) => { const u = [ME(), P()].find((x) => x?.letter === l); const at = l === 'E' ? r.e_approved_at : r.r_approved_at; return u ? `<div class="contract-sign">${at ? `<span>✍️ ${esc(u.name)}</span><span class="tiny muted">${fmtGreg(at.slice(0, 10))} · ${new Date(at).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}</span>` : `<span class="muted">${esc(u.name)} — لم يوقّع بعد</span>`}</div>` : ''; };
      return `<div class="contract"><div class="contract-h">اتفاقية${r.version > 1 ? ` · النسخة ${r.version}` : ''}</div><div class="contract-t">${esc(r.title)}</div>${para(r.details)}${kv([['تاريخ الاتفاق', r.date && fmtGreg(r.date)], ['تاريخ الانتهاء', r.end_date && fmtGreg(r.end_date)], ['أضافه', esc(by(r))], ['أُنشئ', fmtGreg(r.created_at.slice(0, 10))]])}${sig('E')}${sig('R')}
      <div class="badge ${s === 'both' ? 'ok' : ''}" style="margin-top:10px">${L.agreeStatus[s]}</div>${s !== 'both' && !r.closed ? '<div class="tiny muted" style="margin-top:6px">لا يعتبر الاتفاق فعّالًا إلا بعد موافقة الطرفين.</div>' : ''}</div>${r.notes ? kv([['ملاحظات', esc(r.notes)]]) : ''}${historyHtml(r)}`; },
    actions: (r) => { const mine = ME().letter === 'R' ? r.r_approved_at : r.e_approved_at; const s = agreementState(r);
      return [r.draft && isMe(r.created_by) && { l: 'إرسال للموافقة', icon: 'send', tone: 'rose', primary: true, run: () => act('agreements', r.id, 'publish') },
        !r.draft && !r.closed && !mine && { l: 'أوافق على الاتفاق ✍️', icon: 'check', tone: 'rose', primary: true, run: () => act('agreements', r.id, 'approve') },
        s === 'both' && { l: 'اكتمل', icon: 'check', run: () => act('agreements', r.id, 'complete') },
        !r.closed && { l: 'إلغاء الاتفاق', icon: 'x', run: async () => { if (await confirmBox('إلغاء هذا الاتفاق؟', { ok: 'إلغاء الاتفاق' })) await act('agreements', r.id, 'cancel'); } },
        r.closed && { l: 'إعادة فتح', icon: 'repeat', run: () => act('agreements', r.id, 'reopen') },
        ...convertMenu([['event', 'حوّله لموعد', 'calendar', { title: r.title, date: r.date || today(), notes: r.details }]])].filter(Boolean); },
    editNote: 'تعديل اتفاق تمت الموافقة عليه يعيد طلب موافقة الطرفين على النسخة الجديدة.',
    form: (r) => ({ title: r ? 'تعديل الاتفاق' : 'اتفاق جديد', values: { date: today(), draft: 0 }, fields: [
      ...(r && (r.e_approved_at || r.r_approved_at) ? [{ type: 'info', html: 'تعديل العنوان أو التفاصيل أو التواريخ سيعيد طلب موافقة الطرفين على النسخة المعدلة.' }] : []),
      { k: 'title', label: 'عنوان الاتفاق', required: true }, { k: 'details', label: 'تفاصيل الاتفاق', type: 'textarea', rows: 4 },
      { type: 'pair', fields: [{ k: 'date', label: 'تاريخ الاتفاق', type: 'date' }, { k: 'end_date', label: 'تاريخ الانتهاء (اختياري)', type: 'date' }] }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      ...(r ? [] : [{ k: 'draft', label: 'حفظ كمسودة (بدون إرسال)', type: 'toggle' }])] }),
    empty: ['لا اتفاقيات', 'اتفقوا على موعد، رحلة، ميزانية أو هدف — ويصبح فعّالًا بعد موافقة الطرفين'],
  },

  needs: {
    title: 'أغراض ناقصتني', kicker: 'نشتريها لبعض', icon: 'bag', addLabel: 'غرض',
    tabs: () => [{ k: 'need', l: 'ناقصة', f: (r) => !r.bought }, { k: 'me', l: 'أغراضي', f: (r) => isMe(r.created_by) && !r.bought }, { k: 'p', l: `أغراض ${pname()}`, f: (r) => !isMe(r.created_by) && !r.bought }, { k: 'bought', l: 'تم شراؤها', f: (r) => !!r.bought }],
    sort: (a, b) => ({ critical: 0, needed: 1, later: 2 }[a.priority || 'needed'] - { critical: 0, needed: 1, later: 2 }[b.priority || 'needed']) || b.created_at.localeCompare(a.created_at),
    card: (r) => ({ title: r.name + (r.qty ? ` × ${r.qty}` : ''), img: r.image_id, check: { on: !!r.bought, run: () => update('needs', r.id, r.bought ? { bought: 0 } : { bought: 1, buy_date: today() }) }, sub: r.bought ? `اشتراه ${person(r.bought_by)?.name || ''}${r.price ? ' · ' + money(r.price) : ''}` : `${by(r)} · ${day(r.created_at.slice(0, 10))}${r.description ? ' · ' + r.description : ''}`, badges: [!r.bought && badge(L.needPriority[r.priority || 'needed'], r.priority === 'critical' ? 'rose' : ''), r.shopping_id && badge('في المقاضي')], avatar: r.created_by }),
    detail: (r) => `${r.image_id ? img(r.image_id, 'cover') + '<div style="height:12px"></div>' : ''}${para(r.description)}${kv([['صاحب الغرض', esc(by(r))], ['الكمية', r.qty && esc(r.qty)], ['الأولوية', L.needPriority[r.priority || 'needed']], ['أُضيف', fmtGreg(r.created_at.slice(0, 10))], ['اشتراه', r.bought && esc(person(r.bought_by)?.name || '')], ['السعر', r.price && money(r.price)], ['تاريخ الشراء', r.buy_date && fmtGreg(r.buy_date)], ['ملاحظات', r.notes && esc(r.notes)]])}`,
    actions: (r) => [!r.shopping_id && !r.bought && { l: 'أضفه لقائمة المقاضي', icon: 'bag', run: () => convert('shopping', { name: r.name, qty: r.qty, category: 'personal', notes: r.description, buyer: isMe(r.created_by) ? null : ME().id }, (it) => it && update('needs', r.id, { shopping_id: it.id })) },
      !r.bought && { l: 'اشتريته ✓', icon: 'check', tone: 'rose', run: () => openForm({ title: 'تم الشراء', values: { buy_date: today() }, fields: [{ type: 'pair', fields: [{ k: 'price', label: 'السعر', type: 'number' }, { k: 'buy_date', label: 'تاريخ الشراء', type: 'date' }] }], onSubmit: (v) => update('needs', r.id, { bought: 1, ...v }) }) }].filter(Boolean),
    form: (r) => ({ title: r ? 'تعديل الغرض' : 'غرض ناقصني', values: { priority: 'needed' }, fields: [
      { k: 'name', label: 'اسم الغرض', required: true }, { type: 'pair', fields: [{ k: 'qty', label: 'الكمية' }, { k: 'priority', label: 'الأولوية', type: 'select', options: opts(L.needPriority) }] },
      { k: 'description', label: 'وصف', type: 'textarea', rows: 2 }, { k: 'image_id', label: 'صورة (اختياري)', type: 'image' }, { k: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
      ...(r?.bought ? [{ type: 'pair', fields: [{ k: 'price', label: 'السعر', type: 'number' }, { k: 'buy_date', label: 'تاريخ الشراء', type: 'date' }] }] : [])] }),
    empty: ['لا ينقصنا شيء', 'سجّل الأغراض التي تحتاجها — والطرف الآخر يقدر يشتريها لك'],
  },

  reminders: {
    title: 'ذكرني بشيء', kicker: 'نذكّر بعض', icon: 'bell', addLabel: 'تذكير',
    tabs: () => [{ k: 'me', l: 'تذكيرات لي', f: (r) => (r.target === ME().id || r.target === 'both') && r.status !== 'done' }, { k: 'from', l: 'أضفتها أنا', f: (r) => isMe(r.created_by) && r.status !== 'done' }, { k: 'done', l: 'المكتملة', f: (r) => r.status === 'done' }],
    sort: (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')),
    card: (r) => ({ title: r.title, check: { on: r.status === 'done', run: () => update('reminders', r.id, { status: r.status === 'done' ? 'pending' : 'done' }) }, sub: `${r.date === today() ? 'اليوم' : r.date === addDays(today(), 1) ? 'غدًا' : fmtGreg(r.date, { weekday: true, year: false })}${r.time ? ' · ' + fmtTime(r.time) : ''}${r.repeat && r.repeat !== 'none' ? ' · ' + L.reminderRepeat[r.repeat] : ''} · من ${by(r)} لـ${nameOf(r.target)}`, badges: [r.priority === 'high' && badge('مهم', 'rose'), r.date < today() && r.status !== 'done' && badge('فات موعده', 'warn')], avatar: r.target }),
    detail: (r) => `${para(r.details)}${kv([['أضافه', esc(by(r))], ['المطلوب تذكيره', esc(nameOf(r.target))], ['التاريخ', fmtGreg(r.date, { weekday: true })], ['الوقت', r.time && fmtTime(r.time)], ['التكرار', L.reminderRepeat[r.repeat || 'none']], ['الأولوية', L.importance[r.priority || 'medium']], ['الحالة', L.reminderStatus[r.status || 'pending']]])}`,
    actions: (r) => [r.status !== 'done' && { l: 'أجّل ساعة', icon: 'clock', run: () => snooze(r, 'hour') }, r.status !== 'done' && { l: 'أجّل لبكرة', icon: 'clock', run: () => snooze(r, 'day') },
      ...convertMenu([['task', 'حوّله لمهمة', 'tasks', { title: r.title, description: r.details, due_date: r.date, assignee: r.target }]])].filter(Boolean),
    form: (r) => ({ title: r ? 'تعديل التذكير' : 'ذكّرني / ذكّره بشيء', values: { target: P()?.id || ME().id, when: 'today', date: today(), priority: 'medium', repeat: 'none', status: 'pending' }, fields: [
      { k: 'title', label: 'عنوان التذكير', required: true, placeholder: 'مثال: راجع موضوع الحجز' }, { k: 'details', label: 'التفاصيل', type: 'textarea', rows: 2 }, { k: 'target', label: 'من المطلوب تذكيره؟', type: 'user' },
      ...(r ? [] : [{ k: 'when', label: 'متى؟', type: 'seg', options: [{ v: 'today', l: 'اليوم' }, { v: 'tomorrow', l: 'غدًا' }, { v: 'date', l: 'تاريخ معين' }] }]),
      { k: 'date', label: 'التاريخ', type: 'date', show: (v) => !!r || v.when === 'date' }, { k: 'time', label: 'الوقت', type: 'time', hint: 'بدون وقت = وقت التذكيرات اليومية من الإعدادات' },
      { k: 'repeat', label: 'التكرار', type: 'seg', options: opts(L.reminderRepeat) }, { k: 'priority', label: 'الأولوية', type: 'seg', options: opts(L.importance) }] }),
    beforeSave: (v, r) => { if (!r) { if (v.when === 'today') v.date = today(); if (v.when === 'tomorrow') v.date = addDays(today(), 1); } delete v.when; if (!v.date) v.date = today(); if (r && (v.date !== r.date || v.time !== r.time)) v.fired_at = null; return v; },
    empty: ['لا تذكيرات', 'اكتب تذكيرًا لنفسك أو للطرف الآخر — يصله إشعار في الموعد'],
  },
};

async function snooze(r, unit) {
  const now = new Date();
  if (unit === 'day') return update('reminders', r.id, { date: addDays(today(), 1), fired_at: null, status: 'pending' });
  const t = new Date(now.getTime() + 3600000);
  const hh = String(t.getHours()).padStart(2, '0'), mm = String(t.getMinutes()).padStart(2, '0');
  return update('reminders', r.id, { date: today(), time: `${hh}:${mm}`, fired_at: null, status: 'pending' });
}

/** Add something to the day plan of `date` (creating the plan if needed). */
export async function addToOuting(date, item) {
  let o = all('outings').find((x) => x.date === date && x.status !== 'cancelled');
  if (!o) o = await create('outings', { title: `جدول ${fmtGreg(date, { weekday: true, year: false })}`, date, status: 'planned' });
  await create('outing_items', { outing_id: o.id, ...item });
  toast('أُضيف لجدول اليوم ✓');
  location.hash = `#/outing/${o.id}`;
}

/** Add / edit any v3 section item. */
export function editIn(key, row = null, defaults = {}, after = null) {
  const S = SECTIONS[key];
  const f = S.form(row, defaults);
  openForm({
    title: f.title, en: S.title,
    values: { ...f.values, ...defaults, ...(row || {}) },
    fields: f.fields,
    onSubmit: async (v) => {
      for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
      if (S.beforeSave) v = await S.beforeSave(v, row);
      if (row) await update(key, row.id, v);
      else { const it = await create(key, v); toast('تمت الإضافة'); if (after) await after(it); else S.afterCreate?.(it); }
    },
    onDelete: row && (S.canEdit ? S.canEdit(row) : true) ? () => remove(key, row.id) : null,
  });
}
export { byId };
