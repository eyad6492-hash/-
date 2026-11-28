// Smart dashboard blocks for the v3 sections — each block appears only when it has something to show.
import { all, store, today, person } from '../store.js';
import { esc, icon, avatar } from '../ui.js';
import { fmtTime, fmtGreg, diffDays, countdown } from '../dates.js';
import { agreementState } from '../act.js';
import { monthlies } from '../since.js';
import { L } from '../labels.js';

const row = (href, ic, title, sub, right = '', tone = '') => `<a class="item" href="${href}"><span class="ic-box ${tone}">${icon(ic)}</span><div class="grow" style="min-width:0"><div class="title ellipsis" style="font-size:14px">${esc(title)}</div>${sub ? `<div class="sub ellipsis">${esc(sub)}</div>` : ''}</div>${right}</a>`;
const block = (title, sub, inner, href) => `<div class="section-title"><h2>${title}</h2>${href ? `<a href="${href}">الكل</a>` : `<span class="en">${sub || ''}</span>`}</div><div class="card home-mini">${inner}</div>`;
const mineOr = (v) => !v || v === 'both' || v === store.me.id;

export function homeExtra() {
  const t = today(), me = store.me, P = store.partner;
  let html = '';

  // ---- monthly anniversary (today or next) ----
  const s = store.space?.since;
  if (s?.at) {
    const { past, next } = monthlies(s, t);
    if (past[0]?.date === t) html += `<a class="card since-card tap" href="#/anniv" style="display:block"><div class="since-title">اليوم ذكرى ${past[0].yearly ? 'سنوية' : 'شهرية'} ليوم عرفنا بعض ❤️</div><div class="small muted" style="margin-top:4px">${past[0].yearly ? `مرّت ${past[0].n / 12} ${past[0].n / 12 === 1 ? 'سنة' : 'سنوات'}` : `الشهر رقم ${past[0].n}`} — اكتبوا ماذا فعلتم اليوم</div></a>`;
    else if (next) { const n = diffDays(t, next.date); html += `<a class="card tap" href="#/anniv" style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><span class="ic-box rose">${icon('moon')}</span><div class="grow"><div style="font-weight:500;font-size:14px">الذكرى الشهرية القادمة</div><div class="small muted">${fmtGreg(next.date, { weekday: true, year: false })} · الشهر رقم ${next.n}</div></div><div class="cd"><b class="num">${n}</b><span>${n === 1 ? 'غدًا' : n <= 10 ? 'أيام' : 'يومًا'}</span></div></a>`; }
  }

  // ---- urgent ----
  const urg = all('urgent').filter((u) => u.status !== 'done').sort((a, b) => ({ critical: 0, urgent: 1, normal: 2 }[a.priority || 'urgent'] - { critical: 0, urgent: 1, normal: 2 }[b.priority || 'urgent']));
  if (urg.length) html += block(`أشياء عاجلة <span class="pill-count">${urg.length}</span>`, '', urg.slice(0, 3).map((u) => row('#/s/urgent', 'flag', u.title, [L.urgentPriority[u.priority || 'urgent'], u.deadline && countdown(diffDays(t, u.deadline))].filter(Boolean).join(' · '), avatar(u.assignee || 'both', 'sm'), u.priority === 'critical' ? 'rose' : '')).join(''), '#/s/urgent');

  // ---- waiting for me ----
  const wait = [];
  for (const q of all('requests')) if (q.to_user === me.id && q.status === 'pending') wait.push(row('#/s/requests', 'send', q.title, `طلب من ${person(q.created_by)?.name || ''} بانتظار ردك`, '', 'rose'));
  for (const a of all('agreements')) if (!a.draft && !a.closed && agreementState(a) !== 'both' && !(me.letter === 'R' ? a.r_approved_at : a.e_approved_at)) wait.push(row('#/s/agreements', 'users', a.title, 'اتفاقية بانتظار موافقتك', '', 'rose'));
  for (const c of all('commitments')) if (c.promiser === me.id && c.status === 'pending') wait.push(row('#/s/commitments', 'shield', c.title, 'تعهد بانتظار توقيعك', '', 'rose'));
  for (const w of all('wishes')) if (w.created_by === me.id && w.picked_by && w.status !== 'done') wait.push(row('#/s/wishes', 'star', w.title, `${person(w.picked_by)?.name || ''} ${person(w.picked_by)?.letter === 'R' ? 'اختارت' : 'اختار'} أمنيتك ليحققها ✨${w.pick_date ? ' · ' + countdown(diffDays(t, w.pick_date)) : ''}`, ''));
  for (const w of all('wishes')) if (w.picked_by === me.id && w.status !== 'done') wait.push(row('#/s/wishes', 'star', w.title, `أمنية اخترتها لـ${person(w.created_by)?.name || ''}${w.surprise ? ' — مفاجأة 🤫' : ''}${w.pick_date ? ' · ' + countdown(diffDays(t, w.pick_date)) : ''}`, ''));
  for (const c of all('confessions')) if (c.created_by !== me.id && !c.read_at) wait.push(row('#/s/confessions', 'note', c.title || 'اعتراف جديد', 'كُتب لك بقلب مفتوح — اقرأه بهدوء 🤍', '', 'sage'));
  for (const u of all('upsets')) if (u.created_by !== me.id && (u.status || 'unread') === 'unread') wait.push(row('#/s/upsets', 'smile', u.title, 'موقف يحتاج أن تطّلع عليه بهدوء', '', 'sage'));
  if (wait.length) html += block('بانتظارك', 'يحتاج انتباهك', wait.slice(0, 6).join(''));

  // ---- today ----
  const tod = [];
  for (const a of all('appointments')) if (a.date === t && a.status === 'upcoming' && mineOr(a.person)) tod.push([a.time || '99', row('#/s/appointments', 'clock', a.title, [a.time && fmtTime(a.time), a.location, L.apptKinds[a.kind || 'other']].filter(Boolean).join(' · '), avatar(a.person || 'both', 'sm'), 'rose')]);
  for (const o of all('outings')) if (o.date === t && o.status === 'planned') { const items = all('outing_items').filter((i) => i.outing_id === o.id).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')); tod.push([o.start_time || '99', row(`#/outing/${o.id}`, 'route', o.title, items.length ? items.slice(0, 4).map((i) => `${i.time ? fmtTime(i.time) + ' ' : ''}${i.title}`).join(' ← ') : 'جدول اليوم', '', 'rose')]); }
  for (const r of all('reminders')) if (r.status !== 'done' && r.date <= t && mineOr(r.target)) tod.push([r.time || '98', row('#/s/reminders', 'bell', r.title, `${r.date < t ? 'فات موعده · ' : ''}${r.time ? fmtTime(r.time) : 'اليوم'}${r.created_by !== me.id ? ' · من ' + (person(r.created_by)?.name || '') : ''}`, '')]);
  for (const d of all('daily_tasks')) if (d.status !== 'done' && d.date <= t && mineOr(d.assignee)) tod.push([d.time || '97', row('#/s/daily_tasks', 'tasks', d.title, `${d.date < t ? 'متأخرة · ' : ''}${d.time ? fmtTime(d.time) : 'اليوم'}`, avatar(d.assignee || 'both', 'sm'))]);
  if (tod.length) html += block('يومنا', 'اليوم', tod.sort((a, b) => a[0].localeCompare(b[0])).slice(0, 7).map((x) => x[1]).join(''));

  // ---- cravings today ----
  const cr = all('cravings').filter((c) => c.date === t && c.status !== 'done');
  if (cr.length) html += block('وش نفسنا فيه اليوم؟', '', cr.slice(0, 3).map((c) => row('#/s/cravings', 'coffee', c.text, person(c.created_by)?.name || '', avatar(c.created_by, 'sm'))).join(''), '#/s/cravings');
  return html;
}
export { P_ as _ }; const P_ = 0;
