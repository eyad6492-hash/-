import { html, raw, icon, mount, money, n, logo, monthName, date, dateShort, empty, toast, $ } from '../ui.js';
import { dueLabel } from '../shared.js';
import { get, put } from '../api.js';
import { state, can, setTitle, setBell, go, avatarSrc } from '../app.js';
import { chart, donut } from '../charts.js';

let range = '6m', custom = {};

export default async function dashboard(main, _p, _q, stale) {
  setTitle('الرئيسية');
  const d = await get('/api/dashboard');
  if (stale()) return;
  const s = d.stats, money_ok = can('payments.view');
  setBell(d.alerts.filter((a) => a.level !== 'info').length);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مرحباً بك';
  const tile = (label, value, ic, color, href, isMoney) => html`<a class="tile ${color}" href="${href}"><div class="t-body"><div class="t-label">${label}</div><div class="t-value">${isMoney ? (value === null ? '—' : raw(`<small>ر.س</small><span class="num">${n(value, 0)}</span>`)) : html`<span class="num">${n(value, 0)}</span>`}</div></div><span class="t-icon">${icon(ic, 'lg')}</span></a>`;
  const todayItems = [
    ...d.review.map((c) => ({ kind: 'review', id: c.id, title: c.name, sub: c.campaigns ? `مراجعة ${c.campaigns} حملة والتكلفة` : 'مراجعة الحساب والحملات', c })),
    ...d.tasks.map((t) => ({ kind: 'task', id: t.id, title: t.title, sub: [t.client_name, t.due_date < d.today ? 'متأخرة' : null].filter(Boolean).join(' • '), late: t.due_date < d.today, c: { name: t.client_name || t.title } })),
  ];
  const totalToday = d.review.length + d.followed_today;

  mount(main, html`
    <div class="hello">
      <div class="grow"><h2>${greet} 👋 ${state.user.display_name}</h2><p>مركز إدارة حملاتك الإعلانية — ${dateShort(d.today)}</p></div>
      <img class="avatar" style="width:52px;height:52px" src="${avatarSrc()}" alt="">
    </div>

    <div class="tiles">
      ${tile('إجمالي العملاء', s.clients_total, 'users', 't-purple', '#/clients')}
      ${tile('العملاء النشطون', s.clients_active, 'users', 't-teal', '#/clients?f=active')}
      ${tile('تنتهي قريبًا', s.subs_expiring, 'calendar', 't-gold', '#/subscriptions?f=expiring')}
      ${tile('الاشتراكات المجمدة', s.clients_frozen, 'pause', 't-indigo', '#/clients?f=frozen')}
      ${money_ok ? tile('المستحق', s.due_total, 'wallet', 't-green', '#/payments', true) : ''}
      ${money_ok ? tile('المحصل هذا الشهر', s.collected_month, 'coins', 't-blue', '#/payments?tab=log', true) : ''}
    </div>

    ${can('followups.manage') ? html`<div class="section"><div class="cta-review" data-start>
      <span class="ic">${icon('calendarCheck', 'lg')}</span>
      <div class="grow"><div class="bold">ابدأ مراجعة اليوم</div><div class="muted small">${d.review.length ? `${d.review.length} عميل بانتظار المراجعة` : 'أنهيت مراجعة جميع العملاء اليوم ✨'}</div>
        <div class="progress" style="margin-top:8px"><i style="width:${totalToday ? Math.round((d.followed_today / totalToday) * 100) : 100}%"></i></div></div>
      ${icon('chevL')}</div></div>` : ''}

    <div class="section card">
      <div class="section-head"><h3>مهام اليوم <span class="muted">(${todayItems.length})</span></h3><a href="${can('followups.manage') ? '#/followup' : '#/tasks'}">عرض الكل</a></div>
      <div class="list" data-today>${todayItems.length ? todayItems.slice(0, 8).map((it) => html`
        <div class="item" data-kind="${it.kind}" data-id="${it.id}">
          <button class="chk" data-check aria-label="إنجاز">${icon('check', 'sm')}</button>
          <div class="it-body"><div class="it-title">${it.title}</div><div class="it-sub">${it.late ? html`<span class="badge b-red" style="padding:0 6px">متأخرة</span> ` : ''}${it.sub}</div></div>
          ${it.kind === 'review' ? logo(it.c, 'sm') : html`<span class="logo sm" style="background:var(--surface-2);color:var(--muted)">${icon('checkSquare', 'sm')}</span>`}
        </div>`) : empty('لا توجد مهام لليوم', 'checkCircle')}</div>
    </div>

    ${d.alerts.length ? html`<div class="section card"><div class="section-head"><h3>${icon('bell', 'sm')} تنبيهات مهمة</h3><span class="badge b-pink">${d.alerts.length}</span></div>
      <div class="stack" style="gap:6px">${d.alerts.slice(0, 10).map((a) => html`<div class="alert-item" data-link="${a.link || (a.campaign_id ? `#/campaigns/${a.campaign_id}` : a.client_id ? `#/clients/${a.client_id}` : '#/')}"><span class="lv lv-${a.level}"></span><span class="grow">${a.text}</span>${icon('chevL', 'sm')}</div>`)}
      ${d.alerts.length > 10 ? html`<button class="btn sm ghost" data-more-alerts>عرض كل التنبيهات (${d.alerts.length})</button>` : ''}</div></div>` : ''}

    ${money_ok && d.upcoming?.length ? html`<div class="section card"><div class="section-head"><h3>${icon('wallet', 'sm')} الدفعات القادمة</h3><a href="#/payments/upcoming">عرض الكل</a></div>
      <div class="stack" style="gap:6px">${d.upcoming.map((u) => html`<a class="up-row st-${u.status}" href="#/clients/${u.client_id}?tab=payments">
        <span class="up-dot"></span><div class="grow" style="min-width:0"><div class="bold ellipsis">${u.name}</div><div class="xs muted">${date(u.next_due)} • ${u.days_to_due > 0 ? `بعد ${u.days_to_due} يوم` : u.days_to_due === 0 ? 'اليوم' : `منذ ${-u.days_to_due} يوم`}</div></div>
        <div style="text-align:left"><div class="bold num">${u.amount_due ? n(u.amount_due, 0) : '—'}</div><span class="up-badge">${dueLabel(u.status, u.days_to_due)}</span></div></a>`)}</div></div>` : ''}

    <div class="section"><div class="section-head"><h3>المتابعة والدفعات والتجارب</h3></div>
      <div class="tiles">
        ${s.checklist_total !== undefined ? tile(`Checklist اليوم (${s.checklist_done}/${s.checklist_total})`, s.checklist_total ? Math.round((s.checklist_done / s.checklist_total) * 100) : 0, 'list', 't-teal', '#/checklist') : ''}
        ${s.checklist_total !== undefined ? tile('لم تتم متابعتهم اليوم', s.checklist_pending, 'clock', 't-slate', '#/checklist') : ''}
        ${s.checklist_total !== undefined ? tile('مكتملة متابعتهم اليوم', s.checklist_done, 'checkCircle', 't-green', '#/checklist') : ''}
        ${s.checklist_total !== undefined ? tile('يحتاجون تدخلًا', s.checklist_attention, 'alert', 't-red', '#/checklist') : ''}
        ${tile(`تشييك اليوم (${s.quick_checked}/${s.clients_total})`, s.quick_unchecked, 'checkSquare', 't-pink', '#/clients?qc=todo')}
        ${money_ok ? tile('الدفعات القادمة (7 أيام)', s.payments_upcoming, 'wallet', 't-gold', '#/payments/upcoming') : ''}
        ${money_ok ? tile('الدفعات المتأخرة', s.payments_late, 'alert', 't-red', '#/payments/upcoming?f=late') : ''}
        ${money_ok ? tile('عملاء لديهم تنبيه دفع', s.payment_alerts, 'bell', 't-orange', '#/payments/upcoming') : ''}
        ${tile('عملاء التجارب', s.trials_active, 'sparkles', 't-cyan', '#/trials')}
        ${tile('تجارب تنتهي قريبًا', s.trials_ending, 'clock', 't-violet', '#/trials?f=ending')}
        ${tile('تجارب منتهية', s.trials_ended, 'archive', 't-indigo', '#/trials?f=ended')}
      </div></div>

    <div class="section"><div class="section-head"><h3>مؤشرات الأعمال</h3></div>
      <div class="tiles">
        ${tile('العملاء المتوقفون', s.clients_stopped, 'pause', 't-slate', '#/clients?f=stopped')}
        ${tile('العملاء السابقون', s.clients_former, 'archive', 't-slate', '#/archive')}
        ${tile('اشتراكات منتهية', s.subs_expired, 'alert', 't-red', '#/subscriptions?f=expired')}
        ${money_ok ? tile('عملاء لم يسددوا', s.clients_unpaid, 'wallet', 't-orange', '#/payments') : ''}
        ${money_ok ? tile('إيرادات الشهر (مفوترة)', s.revenue_month, 'trending', 't-violet', '#/subscriptions', true) : ''}
        ${tile('مهام اليوم', s.tasks_today, 'checkSquare', 't-cyan', '#/tasks?view=today')}
        ${tile('مهام متأخرة', s.tasks_late, 'clock', 't-red', '#/tasks?view=late')}
        ${tile('حملات تحتاج تدخل', s.campaigns_attention, 'megaphone', 't-pink', '#/campaigns?f=attention')}
        ${tile('حسابات تحتاج مراجعة', s.accounts_review, 'shield', 't-gold', '#/campaigns?f=rejected')}
        ${can('quotes.view') ? tile('عروض أسعار مرسلة', s.quotes_sent, 'send', 't-blue', '#/quotes') : ''}
        ${can('quotes.view') ? tile('عروض مقبولة', s.quotes_accepted, 'thumbsUp', 't-green', '#/quotes?f=accepted') : ''}
        ${can('quotes.view') ? tile('عروض بلا رد', s.quotes_pending, 'clock', 't-indigo', '#/quotes?f=pending') : ''}
      </div></div>

    <div class="section"><div class="section-head"><h3>الرسوم البيانية</h3></div>
      <div class="chips" data-ranges>${[['today', 'اليوم'], ['week', 'الأسبوع'], ['month', 'الشهر'], ['3m', '3 أشهر'], ['6m', '6 أشهر'], ['year', 'السنة'], ['custom', 'فترة مخصصة']].map(([k, l]) => html`<button class="chip ${range === k ? 'active' : ''}" data-range="${k}">${l}</button>`)}</div>
      <div class="row hidden" data-custom style="margin-top:8px"><input type="date" data-from value="${custom.from || ''}"><input type="date" data-to value="${custom.to || ''}"><button class="btn sm primary" data-apply>عرض</button></div>
      <div data-charts style="margin-top:10px"><div class="skeleton" style="height:220px"></div></div>
    </div>`);

  main.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-start]')) return go('#/followup?start=1');
    const al = t.closest('[data-link]'); if (al) return go(al.dataset.link);
    if (t.closest('[data-more-alerts]')) { const { sheet } = await import('../ui.js'); return sheet({ title: 'كل التنبيهات', body: html`<div class="stack" style="gap:6px">${d.alerts.map((a) => html`<a class="alert-item" href="${a.link || (a.client_id ? `#/clients/${a.client_id}` : '#/')}"><span class="lv lv-${a.level}"></span><span class="grow">${a.text}</span></a>`)}</div>`, onMount: (el, close) => el.addEventListener('click', (ev) => ev.target.closest('a') && close()) }); }
    const item = t.closest('[data-today] .item');
    if (item) {
      const { kind, id } = item.dataset;
      if (kind === 'review') return go(`#/followup?client=${id}`);
      if (t.closest('[data-check]')) {
        try { await put(`/api/tasks/${id}`, { status: 'done' }); item.querySelector('.chk').classList.add('on'); item.style.opacity = '.5'; toast('تم إنجاز المهمة'); } catch (err) { toast(err.message, 'err'); }
      } else go(`#/tasks?open=${id}`);
      return;
    }
    const r = t.closest('[data-range]');
    if (r) {
      range = r.dataset.range;
      main.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('active', b === r));
      main.querySelector('[data-custom]').classList.toggle('hidden', range !== 'custom');
      if (range !== 'custom') loadCharts(main);
    }
    if (t.closest('[data-apply]')) { custom = { from: main.querySelector('[data-from]').value, to: main.querySelector('[data-to]').value }; loadCharts(main); }
  });
  main.querySelector('[data-custom]').classList.toggle('hidden', range !== 'custom');
  loadCharts(main);
}

async function loadCharts(main) {
  const box = main.querySelector('[data-charts]');
  const qs = range === 'custom' ? `range=custom&from=${custom.from || ''}&to=${custom.to || ''}` : `range=${range}`;
  let c;
  try { c = await get('/api/dashboard/charts?' + qs); } catch (e) { box.innerHTML = String(empty(e.message, 'alert')); return; }
  const labels = c.labels.map((l) => (c.unit === 'day' ? dateShort(l) : monthName(l).replace(/\s\d{4}$/, '')));
  const card = (title, body, extra = '') => html`<div class="card" style="margin-top:12px"><div class="section-head"><h3 style="font-size:15px">${title}</h3>${extra}</div>${raw(body)}</div>`;
  const parts = [];
  if (c.collected) {
    const delta = c.compare && c.compare.previous ? ((c.compare.current - c.compare.previous) / c.compare.previous) * 100 : null;
    parts.push(card('الإيرادات والتحصيل', chart({ labels, series: [
      { name: 'الإيرادات (اشتراكات مفوترة)', values: c.billed, color: '#7c5cff', type: 'bar' },
      { name: 'المبالغ المحصلة', values: c.collected, color: '#22d3ee', type: 'bar' },
      { name: 'المستحقات المتراكمة', values: c.outstanding, color: '#ff2d78', type: 'line' },
    ] }), c.compare ? html`<span class="badge ${delta === null ? 'b-gray' : delta >= 0 ? 'b-green' : 'b-red'}" title="مقارنة بالفترة السابقة">${delta === null ? 'لا مقارنة' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}% عن الفترة السابقة`}</span>` : ''));
  }
  parts.push(card('العملاء الجدد والمتوقفون', chart({ labels, height: 170, series: [
    { name: 'عملاء جدد', values: c.new_clients, color: '#14b8a6', type: 'bar' },
    { name: 'عملاء متوقفون', values: c.stopped_clients, color: '#f43f5e', type: 'bar' },
  ] })));
  if (c.spend) {
    const t = c.totals || {};
    parts.push(card('المصروف الإعلاني والمبيعات و ROAS', chart({ labels, series: [
      { name: 'المصروف الإعلاني', values: c.spend, color: '#f5b544', type: 'area' },
      { name: 'المبيعات', values: c.sales, color: '#22c55e', type: 'area' },
      { name: 'ROAS', values: c.roas, color: '#ff2d78', type: 'line', axis: 'right', unit: 'x' },
    ] }), html`<span class="badge b-purple">ROAS ${t.roas ? t.roas.toFixed(2) + 'x' : '—'}</span>`));
    if (c.campaigns?.length) parts.push(card('أداء الحملات (الأعلى إنفاقًا)', html`<div class="stack" style="gap:8px">${c.campaigns.map((k) => {
      const max = Math.max(...c.campaigns.map((x) => x.spend));
      return html`<div><div class="row small"><span class="grow ellipsis"><b>${k.name}</b> <span class="muted">• ${k.client}</span></span><span class="badge ${k.roas >= 3 ? 'b-green' : k.roas >= 1.5 ? 'b-gold' : 'b-red'}">ROAS ${k.roas ? k.roas.toFixed(2) : '—'}</span></div>
        <div class="progress" style="margin-top:5px"><i style="width:${(k.spend / max) * 100}%;background:linear-gradient(90deg,#7c5cff,#22d3ee)"></i></div></div>`;
    })}</div>`.toString()));
    parts.push(card('مقارنة المصروف بالمبيعات', donut({ parts: [{ name: 'المصروف', value: t.spend || 0, color: '#f5b544' }, { name: 'المبيعات', value: t.sales || 0, color: '#22c55e' }], label: t.roas ? t.roas.toFixed(1) + 'x' : '—', sub: 'ROAS' })));
  }
  box.innerHTML = `<div class="grid-auto">${parts.join('')}</div>`;
  if (!c.spend || !c.spend.some(Boolean)) box.insertAdjacentHTML('beforeend', String(html`<p class="muted xs">لعرض المصروف والمبيعات عبر الزمن سجّل أداء الحملات من صفحة الحملة (زر «تسجيل أداء»).</p>`));
}
