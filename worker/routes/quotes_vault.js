import { HttpError, bad, buildInsert, buildUpdate, dateOrNull, json, newId, notFound, nowISO, numOrNull, oneOf, parseArr, readJson, reqStr, str, url } from '../lib/util.js';
import { log, need, can } from '../lib/context.js';
import { addDays, addMonths, computeQuote } from '../lib/shim.js';
import { encryptVault, decryptVault, vaultAvailable } from '../lib/crypto.js';
import { QUOTE_STATUS, VAULT_TYPES } from '../../public/js/shared.js';
import { createClient, getClient } from './clients.js';

function quoteFields(ctx, b) {
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 100).map((it) => ({
    name: reqStr(it.name, 'اسم الخدمة', 200), details: str(it.details, 2000), qty: Math.max(numOrNull(it.qty) ?? 1, 0), price: numOrNull(it.price) ?? 0,
  }));
  if (!items.length) throw bad('أضف خدمة واحدة على الأقل');
  const q = {
    client_id: str(b.client_id, 40), client_name: reqStr(b.client_name, 'اسم العميل', 150), company: str(b.company, 150), phone: str(b.phone, 40), email: str(b.email, 150),
    date: dateOrNull(b.date) || ctx.today, items: JSON.stringify(items), discount: numOrNull(b.discount) ?? 0, discount_type: oneOf(b.discount_type, ['amount', 'percent'], 'amount'),
    tax_enabled: b.tax_enabled ? 1 : 0, tax_rate: numOrNull(b.tax_rate) ?? (Number(ctx.settings.tax_rate) || 0), terms: str(b.terms, 5000), notes: str(b.notes, 5000),
    status: oneOf(b.status, Object.keys(QUOTE_STATUS), 'draft'),
  };
  q.valid_until = dateOrNull(b.valid_until) || addDays(q.date, Number(ctx.settings.quote_validity_days) || 14);
  Object.assign(q, computeQuote({ ...q, items }));
  return q;
}
const vaultUnlocked = (ctx) => !!(ctx.session?.vault_until && ctx.session.vault_until > nowISO());
function requireVault(ctx) {
  need(ctx, 'vault.view');
  if (!vaultUnlocked(ctx)) throw new HttpError(423, 'الخزنة مقفلة — أدخل كلمة المرور لفتحها', 'vault_locked');
}
async function requireVaultKey(ctx) {
  if (!(await vaultAvailable(ctx.env))) throw new HttpError(503, 'مفتاح تشفير الخزنة VAULT_KEY غير مضبوط على الخادم', 'vault_key_missing');
}

export const quoteVaultRoutes = {
  // ---------------- Quotes ----------------
  'GET /api/quotes': async (ctx) => {
    need(ctx, 'quotes.view');
    const { results } = await ctx.env.DB.prepare('SELECT * FROM quotes ORDER BY date DESC, created_at DESC LIMIT 1000').all();
    const today = ctx.today;
    return json({ items: results.map((q) => ({ ...q, items: parseArr(q.items), expired: q.valid_until && q.valid_until < today && ['draft', 'sent', 'review'].includes(q.status) })) });
  },
  'GET /api/quotes/:id': async (ctx) => {
    need(ctx, 'quotes.view');
    const q = await ctx.env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(ctx.params.id).first();
    if (!q) throw notFound('عرض السعر غير موجود');
    return json({ quote: { ...q, items: parseArr(q.items) } });
  },
  'POST /api/quotes': async (ctx) => {
    need(ctx, 'quotes.create');
    const b = await readJson(ctx.req);
    const f = quoteFields(ctx, b);
    const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM quotes').first();
    const row = { id: newId('q_'), number: `${ctx.settings.quote_prefix || 'Q-'}${String(n.n + 1).padStart(4, '0')}`, ...f, created_at: nowISO(), updated_at: nowISO() };
    const ins = buildInsert('quotes', row);
    await ctx.env.DB.prepare(ins.sql).bind(...ins.args).run();
    await log(ctx, 'إنشاء عرض سعر', { entity: 'quote', entity_id: row.id, client_id: row.client_id, details: `${row.number} — ${row.client_name} — ${row.total}` });
    return json({ id: row.id, number: row.number });
  },
  'PUT /api/quotes/:id': async (ctx) => {
    need(ctx, 'quotes.create');
    const q = await ctx.env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(ctx.params.id).first();
    if (!q) throw notFound();
    const b = await readJson(ctx.req);
    const f = quoteFields(ctx, { ...q, items: parseArr(q.items), ...b });
    const up = buildUpdate('quotes', q.id, { ...f, updated_at: nowISO() });
    await ctx.env.DB.prepare(up.sql).bind(...up.args).run();
    await log(ctx, q.status !== f.status ? 'تغيير حالة عرض سعر' : 'تعديل عرض سعر', { entity: 'quote', entity_id: q.id, client_id: f.client_id, details: `${q.number} — ${QUOTE_STATUS[f.status]} — ${f.total}` });
    return json({ ok: true });
  },
  'DELETE /api/quotes/:id': async (ctx) => {
    need(ctx, 'quotes.create');
    const q = await ctx.env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(ctx.params.id).first();
    if (!q) throw notFound();
    await ctx.env.DB.prepare('DELETE FROM quotes WHERE id = ?').bind(q.id).run();
    await log(ctx, 'حذف عرض سعر', { entity: 'quote', entity_id: q.id, client_id: q.client_id, details: q.number });
    return json({ ok: true });
  },
  'POST /api/quotes/:id/duplicate': async (ctx) => {
    need(ctx, 'quotes.create');
    const q = await ctx.env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(ctx.params.id).first();
    if (!q) throw notFound();
    const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM quotes').first();
    const date = ctx.today;
    const row = { ...q, id: newId('q_'), number: `${ctx.settings.quote_prefix || 'Q-'}${String(n.n + 1).padStart(4, '0')}`, status: 'draft', date, valid_until: addDays(date, Number(ctx.settings.quote_validity_days) || 14), converted_client_id: null, created_at: nowISO(), updated_at: nowISO() };
    const ins = buildInsert('quotes', row);
    await ctx.env.DB.prepare(ins.sql).bind(...ins.args).run();
    await log(ctx, 'نسخ عرض سعر', { entity: 'quote', entity_id: row.id, details: `${q.number} → ${row.number}` });
    return json({ id: row.id });
  },
  // Accepted quote → client (+ subscription) without re-entering data
  'POST /api/quotes/:id/convert': async (ctx) => {
    need(ctx, 'quotes.create');
    const q = await ctx.env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(ctx.params.id).first();
    if (!q) throw notFound();
    const b = await readJson(ctx.req).catch(() => ({}));
    const items = parseArr(q.items);
    const services = items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join('، ');
    const months = numOrNull(b.duration_months) ?? 1;
    const start = dateOrNull(b.start_date) || ctx.today;
    const subscription = b.with_subscription === false ? null : { start_date: start, duration_months: months, amount: q.total, services, platforms: [] };
    let clientId = q.client_id;
    if (clientId) {
      need(ctx, 'subscriptions.edit');
      await getClient(ctx, clientId);
      if (subscription) {
        const { clientRoutes } = await import('./clients.js');
        const sub = new Request(ctx.req.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription) });
        await clientRoutes['POST /api/clients/:id/subscriptions']({ ...ctx, req: sub, params: { id: clientId } });
      }
    } else {
      need(ctx, 'clients.create');
      const r = await createClient(ctx, { name: q.client_name, store_name: q.company, phone: q.phone, email: q.email, start_date: start, notes: q.notes, subscription }, ` (من عرض السعر ${q.number})`);
      clientId = r.id;
    }
    await ctx.env.DB.prepare("UPDATE quotes SET status = 'accepted', converted_client_id = ?, client_id = COALESCE(client_id, ?), updated_at = ? WHERE id = ?").bind(clientId, clientId, nowISO(), q.id).run();
    await log(ctx, 'تحويل عرض سعر إلى عميل/اشتراك', { entity: 'quote', entity_id: q.id, client_id: clientId, details: q.number });
    return json({ client_id: clientId });
  },

  // ---------------- Service templates ----------------
  'GET /api/service-templates': async (ctx) => {
    need(ctx, 'quotes.view');
    const { results } = await ctx.env.DB.prepare('SELECT * FROM service_templates ORDER BY name').all();
    return json({ items: results });
  },
  'POST /api/service-templates': async (ctx) => {
    need(ctx, 'quotes.create');
    const b = await readJson(ctx.req);
    const row = { id: newId('st_'), name: reqStr(b.name, 'اسم الخدمة', 200), description: str(b.description, 2000), price: numOrNull(b.price) ?? 0, created_at: nowISO() };
    const ins = buildInsert('service_templates', row);
    await ctx.env.DB.prepare(ins.sql).bind(...ins.args).run();
    return json({ id: row.id });
  },
  'PUT /api/service-templates/:id': async (ctx) => {
    need(ctx, 'quotes.create');
    const b = await readJson(ctx.req);
    await ctx.env.DB.prepare('UPDATE service_templates SET name = ?, description = ?, price = ? WHERE id = ?').bind(reqStr(b.name, 'اسم الخدمة', 200), str(b.description, 2000), numOrNull(b.price) ?? 0, ctx.params.id).run();
    return json({ ok: true });
  },
  'DELETE /api/service-templates/:id': async (ctx) => {
    need(ctx, 'quotes.create');
    await ctx.env.DB.prepare('DELETE FROM service_templates WHERE id = ?').bind(ctx.params.id).run();
    return json({ ok: true });
  },

  // ---------------- Vault ----------------
  'GET /api/vault': async (ctx) => {
    need(ctx, 'vault.view');
    const available = await vaultAvailable(ctx.env);
    if (!vaultUnlocked(ctx)) return json({ locked: true, available, items: [] });
    const { results } = await ctx.env.DB.prepare('SELECT v.id, v.client_id, v.platform, v.account_name, v.login_url, v.ad_account_id, v.created_at, v.updated_at, c.name AS client_name, c.logo FROM vault_entries v LEFT JOIN clients c ON c.id = v.client_id ORDER BY c.name, v.platform').all();
    return json({ locked: false, available, vault_until: ctx.session.vault_until, items: results, can_reveal: can(ctx, 'vault.reveal'), can_edit: can(ctx, 'vault.edit') });
  },
  // Returns decrypted secret fields for one entry. Logged without the secret values.
  'POST /api/vault/:id/reveal': async (ctx) => {
    requireVault(ctx); need(ctx, 'vault.reveal'); await requireVaultKey(ctx);
    const v = await ctx.env.DB.prepare('SELECT * FROM vault_entries WHERE id = ?').bind(ctx.params.id).first();
    if (!v) throw notFound();
    const secret = await decryptVault(ctx.env, v.secret);
    const b = await readJson(ctx.req).catch(() => ({}));
    await log(ctx, b?.purpose === 'copy' ? 'نسخ بيانات دخول من الخزنة' : 'عرض بيانات دخول من الخزنة', { entity: 'vault', entity_id: v.id, client_id: v.client_id, details: `${v.platform}${v.account_name ? ' — ' + v.account_name : ''}` });
    return json({ secret });
  },
  'POST /api/vault': async (ctx) => {
    requireVault(ctx); need(ctx, 'vault.edit'); await requireVaultKey(ctx);
    const b = await readJson(ctx.req);
    if (b.client_id) await getClient(ctx, b.client_id);
    const row = {
      id: newId('v_'), client_id: str(b.client_id, 40), platform: oneOf(b.platform, VAULT_TYPES, 'أخرى'), account_name: str(b.account_name, 200), login_url: url(b.login_url), ad_account_id: str(b.ad_account_id, 100),
      secret: await encryptVault(ctx.env, { username: str(b.username, 300), email: str(b.email, 300), password: b.password ? String(b.password).slice(0, 500) : null, notes: str(b.notes, 5000) }),
      created_at: nowISO(), updated_at: nowISO(),
    };
    const ins = buildInsert('vault_entries', row);
    await ctx.env.DB.prepare(ins.sql).bind(...ins.args).run();
    await log(ctx, 'إضافة حساب إلى الخزنة', { entity: 'vault', entity_id: row.id, client_id: row.client_id, details: row.platform });
    return json({ id: row.id });
  },
  'PUT /api/vault/:id': async (ctx) => {
    requireVault(ctx); need(ctx, 'vault.edit'); await requireVaultKey(ctx);
    const v = await ctx.env.DB.prepare('SELECT * FROM vault_entries WHERE id = ?').bind(ctx.params.id).first();
    if (!v) throw notFound();
    const b = await readJson(ctx.req);
    const old = await decryptVault(ctx.env, v.secret);
    const secret = {
      username: b.username !== undefined ? str(b.username, 300) : old.username, email: b.email !== undefined ? str(b.email, 300) : old.email,
      password: b.password !== undefined && b.password !== null && b.password !== '' ? String(b.password).slice(0, 500) : old.password,
      notes: b.notes !== undefined ? str(b.notes, 5000) : old.notes,
    };
    const up = buildUpdate('vault_entries', v.id, {
      client_id: b.client_id !== undefined ? str(b.client_id, 40) : v.client_id, platform: oneOf(b.platform, VAULT_TYPES, v.platform), account_name: str(b.account_name ?? v.account_name, 200),
      login_url: url(b.login_url ?? v.login_url), ad_account_id: str(b.ad_account_id ?? v.ad_account_id, 100), secret: await encryptVault(ctx.env, secret), updated_at: nowISO(),
    });
    await ctx.env.DB.prepare(up.sql).bind(...up.args).run();
    await log(ctx, 'تعديل حساب في الخزنة', { entity: 'vault', entity_id: v.id, client_id: v.client_id, details: v.platform + (b.password ? ' (تم تغيير كلمة المرور)' : '') });
    return json({ ok: true });
  },
  'DELETE /api/vault/:id': async (ctx) => {
    requireVault(ctx); need(ctx, 'vault.edit');
    const v = await ctx.env.DB.prepare('SELECT * FROM vault_entries WHERE id = ?').bind(ctx.params.id).first();
    if (!v) throw notFound();
    await ctx.env.DB.prepare('DELETE FROM vault_entries WHERE id = ?').bind(v.id).run();
    await log(ctx, 'حذف حساب من الخزنة', { entity: 'vault', entity_id: v.id, client_id: v.client_id, details: v.platform });
    return json({ ok: true });
  },
};
export { addMonths };
