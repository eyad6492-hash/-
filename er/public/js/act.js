// Server-side workflow actions (approvals, responses, picks) + helpers shared by the new sections.
import { post } from './api.js';
import { putItem, store, person } from './store.js';
import { L } from './labels.js';
import { esc } from './ui.js';
import { fmtGreg } from './dates.js';

export async function act(col, id, action, body = {}) {
  const { item } = await post(`/api/act/${col}/${id}`, { action, ...body });
  return putItem(col, item);
}

/** Readable timeline of approvals / responses: "وافق إياد — 3 يناير 10:42 م". */
export function historyHtml(row) {
  const h = row.history || [];
  if (!h.length) return '';
  const when = (iso) => `${fmtGreg(iso.slice(0, 10), { year: false })} · ${new Date(iso).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}`;
  return `<div class="hist">${h.map((e) => `<div class="hist-row"><i></i><div><b>${esc(L.historyActions[e.action] || e.action)}</b> — ${esc(person(e.by)?.name || '')}${e.note ? ` — «${esc(e.note)}»` : ''}<div class="tiny muted">${when(e.at)}</div></div></div>`).join('')}</div>`;
}

/** Agreement status from its approvals. */
export function agreementState(a) {
  if (a.closed) return a.closed;
  if (a.draft) return 'draft';
  if (a.e_approved_at && a.r_approved_at) return 'both';
  if (a.e_approved_at) return 'approved_e';
  if (a.r_approved_at) return 'approved_r';
  return 'pending';
}
/** Commitment status shown to people ("ساري" while running). */
export function commitmentState(c, today) {
  if (c.status !== 'accepted') return c.status;
  if (c.start_date && c.start_date > today) return 'accepted';
  if (c.duration_days && c.start_date) {
    const end = new Date(Date.parse(c.start_date) + c.duration_days * 86400000).toISOString().slice(0, 10);
    if (today > end) return 'completed';
  }
  return 'active';
}
export const myLetter = () => store.me?.letter;
