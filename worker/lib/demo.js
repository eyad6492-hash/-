// Fictional demo data. Every row id starts with "demo_" so it can be removed in one click
// (Settings → Demo data → delete). No real people or businesses.
import { addDays, addMonths } from './shim.js';
import { buildInsert, nowISO } from './util.js';
import { DEFAULT_CHECKLIST } from '../../public/js/shared.js';

const CLIENTS = [
  ['متجر العطور الفاخرة', 'متجر عطور', 'عطور', ['TikTok', 'Snapchat'], 3000, 300],
  ['متجر السيارات', 'معرض قطع غيار', 'سيارات', ['TikTok', 'Google'], 2500, 250],
  ['متجر الأزياء', 'بوتيك أزياء', 'ملابس', ['TikTok', 'Meta'], 2800, 400],
  ['مطعم المذاق', 'مطعم شعبي', 'مطاعم', ['Snapchat'], 1800, 150],
  ['مقهى البن الذهبي', 'مقهى مختص', 'مقاهي', ['TikTok', 'Instagram'], 1500, 120],
  ['عيادة الابتسامة', 'عيادة أسنان', 'عيادات', ['Meta', 'Google'], 3500, 350],
  ['عقارات المستقبل', 'مكتب عقاري', 'عقارات', ['Snapchat', 'Google'], 4000, 500],
  ['متجر الإلكترونيات', 'متجر إلكتروني', 'متاجر إلكترونية', ['TikTok'], 2200, 200],
];

export async function seedDemo(ctx) {
  const db = ctx.env.DB, t = ctx.today, stmts = [];
  const exists = await db.prepare("SELECT COUNT(*) n FROM clients WHERE id LIKE 'demo_%'").first();
  if (exists.n) { const { HttpError } = await import('./util.js'); throw new HttpError(409, 'البيانات التجريبية موجودة بالفعل'); }
  const add = (table, row) => { const i = buildInsert(table, row); stmts.push(db.prepare(i.sql).bind(...i.args)); };
  const { results: cats } = await db.prepare('SELECT id, name FROM categories').all();
  const catId = (n) => cats.find((c) => c.name === n)?.id;
  let seq = 0; const id = (p) => `demo_${p}${++seq}`;
  const ts = nowISO();
  CLIENTS.forEach(([name, store, cat, platforms, amount, budget], i) => {
    const cid = `demo_c${i + 1}`;
    const status = i === 4 ? 'frozen' : i === 7 ? 'stopped' : 'active';
    const start = addMonths(t, -(8 - i));
    add('clients', { id: cid, name, store_name: store, phone: `05${String(10000000 + i * 1234567).slice(0, 8)}`, email: `client${i + 1}@example.com`, business_type: cat, category_ids: JSON.stringify([catId(cat)].filter(Boolean)), tags: JSON.stringify(i % 2 ? ['VIP'] : ['متجر سلة']), store_url: 'https://example.com', tiktok_url: 'https://www.tiktok.com/@example', platforms: JSON.stringify(platforms), daily_budget: budget, status, followup_every: i % 3 === 0 ? 1 : 2, next_contact_date: i === 2 ? t : null, notes: 'عميل تجريبي — يمكن حذفه من الإعدادات.', start_date: start, created_at: ts, updated_at: ts });
    // past + current subscription
    const subStart = addDays(t, [-25, -27, -10, -40, -12, -5, -29, -60][i]);
    const prevId = `demo_s${i + 1}a`, curId = `demo_s${i + 1}b`;
    add('subscriptions', { id: prevId, client_id: cid, start_date: addMonths(subStart, -1), end_date: addDays(subStart, -1), duration_months: 1, amount, ad_budget: budget, services: 'إدارة حملات إعلانية', platforms: JSON.stringify(platforms), status: 'ended', is_current: 0, created_at: ts, updated_at: ts });
    add('subscriptions', { id: curId, client_id: cid, start_date: subStart, end_date: addDays(addMonths(subStart, 1), -1), duration_months: 1, amount, ad_budget: budget, services: 'إدارة حملات إعلانية + تقارير أسبوعية', platforms: JSON.stringify(platforms), status: status === 'frozen' ? 'frozen' : status === 'stopped' ? 'stopped' : 'active', is_current: 1, renewed_from: prevId, created_at: ts, updated_at: ts });
    add('payments', { id: id('p'), client_id: cid, subscription_id: prevId, amount, date: addDays(addMonths(subStart, -1), 1), method: 'transfer', type: 'subscription', period: 'الشهر السابق', created_at: ts });
    const paid = [amount, amount / 2, 0, amount, amount, 0, amount / 2, 0][i];
    if (paid) add('payments', { id: id('p'), client_id: cid, subscription_id: curId, amount: paid, date: addDays(subStart, 2), method: i % 2 ? 'cash' : 'transfer', type: 'subscription', period: 'الشهر الحالي', created_at: ts });
    if (status === 'frozen') add('freezes', { id: id('f'), subscription_id: curId, client_id: cid, start_date: addDays(t, -4), reason: 'سفر العميل', expected_days: 14, pause_work: 1, end_before: addDays(addMonths(subStart, 1), -1), created_at: ts });
    // campaigns + performance history
    platforms.slice(0, 2).forEach((pl, j) => {
      const kid = `demo_k${i + 1}_${j}`;
      const kStatus = i === 1 && j === 0 ? 'optimize' : i === 6 && j === 1 ? 'rejected' : status === 'stopped' ? 'stopped' : 'active';
      let sp = 0, im = 0, cl = 0, or = 0, sa = 0; const snaps = [];
      for (let m = 5; m >= 0; m--) {
        for (const d of [3, 12, 21]) {
          const date = addDays(addMonths(t, -m), -d);
          if (date > t) continue;
          const s = Math.round(budget * (2 + ((i + j + m + d) % 5))), roas = kStatus === 'optimize' ? 1.4 : 3 + ((i * 3 + j + m) % 6);
          const o = Math.max(1, Math.round(s / (40 + i * 5))), k = Math.round(s * 1.9), v = Math.round(k * 55);
          sp += s; im += v; cl += k; or += o; sa += Math.round(s * roas);
          snaps.push({ id: id('ks'), campaign_id: kid, client_id: cid, date, spend: s, impressions: v, clicks: k, orders: o, sales: Math.round(s * roas), conversions: o, created_at: ts });
        }
      }
      add('campaigns', { id: kid, client_id: cid, name: `${pl} — ${['تحويلات', 'زيارات', 'مبيعات الكتالوج'][j % 3]}`, platform: pl, type: 'Conversions', objective: 'زيادة المبيعات', start_date: addMonths(t, -6), status: kStatus, daily_budget: budget, total_budget: budget * 30, spend: sp, impressions: im, clicks: cl, orders: or, sales: sa, conversions: or, created_at: ts, updated_at: ts });
      snaps.forEach((r) => add('campaign_snapshots', r));
    });
    // follow-ups
    for (const back of [1, 3, 6]) add('followups', { id: id('fu'), client_id: cid, date: addDays(t, -back - (i % 2)), checklist: JSON.stringify(DEFAULT_CHECKLIST.slice(0, 6).map((l, n) => ({ label: l, value: n === 2 && i === 1 ? 'no' : 'yes' }))), status: 'done', rating: ['excellent', 'good', 'improve', 'good', 'excellent', 'problem', 'urgent', 'good'][(i + back) % 8], notes: 'مراجعة روتينية', actions: 'تعديل الميزانية وفحص الإعلانات', user_id: ctx.user.id, created_at: ts });
    // report
    add('reports', { id: id('r'), client_id: cid, platform: platforms[0], period_from: addDays(t, -14), period_to: addDays(t, -8), spend: budget * 7, impressions: budget * 7 * 105, clicks: budget * 7 * 2, orders: Math.round(budget * 7 / 45), sales: budget * 7 * 4, daily_budget: budget, summary: 'أداء مستقر مع تحسن في معدل التحويل.', notes: 'الإعلانات المصورة بالفيديو حققت أفضل النتائج.', recommendations: 'زيادة الميزانية تدريجيًا 20%\nتجربة محتوى إعلاني جديد', created_by: ctx.user.id, created_at: ts, updated_at: ts });
  });
  // tasks
  const tasks = [
    ['مراجعة الحملات والتكلفة', 'demo_c1', 0, 'high'], ['فحص الأداء وتعديل الميزانية', 'demo_c2', 0, 'urgent'], ['مراجعة الطلبات و ROAS', 'demo_c3', 0, 'medium'],
    ['إرسال تقرير أسبوعي', 'demo_c6', -2, 'high'], ['تجهيز محتوى إعلاني جديد', 'demo_c7', 2, 'medium'], ['متابعة تحويل الدفعة', 'demo_c3', 1, 'low'],
  ];
  tasks.forEach(([title, cid, d, pr], n) => add('tasks', { id: id('t'), title, client_id: cid, due_date: addDays(t, d), priority: pr, status: 'new', recurrence: n === 0 ? 'weekly' : 'none', created_at: ts, updated_at: ts }));
  // service templates + quotes
  const svc = [['إدارة حملات TikTok', 'إعداد وإدارة وتحسين الحملات شهريًا', 2500], ['إدارة حملات Snapchat', 'إدارة كاملة مع تقارير أسبوعية', 2000], ['إدارة Meta Ads', 'Facebook + Instagram', 2200], ['إدارة Google Ads', 'بحث + يوتيوب', 2500], ['صناعة المحتوى', '8 فيديوهات قصيرة شهريًا', 3000]];
  svc.forEach(([name, description, price]) => add('service_templates', { id: id('st'), name, description, price, created_at: ts }));
  const quotes = [['مؤسسة النخبة', 'sent', 5000, -3], ['متجر الهدايا', 'accepted', 4500, -10], ['شركة الريادة', 'draft', 7000, 0], ['مركز اللياقة', 'review', 3000, -6]];
  quotes.forEach(([name, status, price, d], n) => {
    const items = [{ name: svc[n % 5][0], details: svc[n % 5][1], qty: 1, price }];
    const sub = price, tax = Math.round(sub * 0.15 * 100) / 100;
    add('quotes', { id: id('q'), number: `DEMO-${n + 1}`, client_name: name, company: name, phone: '0500000000', date: addDays(t, d), valid_until: addDays(t, d + 14), items: JSON.stringify(items), discount: 0, discount_type: 'amount', tax_enabled: 1, tax_rate: 15, subtotal: sub, discount_value: 0, tax_value: tax, total: sub + tax, terms: ctx.settings.quote_terms, status, created_at: ts, updated_at: ts });
  });
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
  return stmts.length;
}
