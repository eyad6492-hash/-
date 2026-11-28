// More — the organised hub for every other section.
import { store, all, today } from '../store.js';
import { esc, icon, avatar } from '../ui.js';

export default {
  render(el) {
    const me = store.me, t = today();
    const cyc = me.settings.cycle;
    const showCycle = !cyc.hide && (me.letter === 'R' || cyc.enabled || !!store.partner_cycle);
    const shopLeft = all('shopping').filter((x) => !x.done).length;
    const tiles = [
      ['dates', 'gift', 'Important Dates', 'المناسبات والتواريخ', 'rose', all('dates').length],
      ['mood', 'smile', 'How Are We Today?', 'مزاجنا', 'brown', null],
      ['places', 'utensils', 'Places We Love', 'المطاعم والأماكن', '', all('places').length],
      ['bucket', 'sparkle', 'Our Bucket List', 'قائمة الأمنيات', 'sage', all('bucket').filter((b) => b.status !== 'done').length],
      ['trips', 'plane', 'Our Travel Plans', 'رحلاتنا', '', all('trips').filter((x) => (x.end_date || x.start_date || '9') >= t).length],
      ['honeymoon', 'palm', 'Our Honeymoon', 'شهر العسل', 'rose', null],
      ['shopping', 'bag', 'Shopping List', 'المقاضي', 'sage', shopLeft],
      ['expenses', 'wallet', 'Our Expenses', 'مصروفاتنا', 'brown', null],
      ['notes', 'note', 'Little Notes', 'رسائلنا الصغيرة', 'rose', all('notes').length],
      showCycle && ['cycle', 'drop', 'Cycle Tracker', me.letter === 'R' || cyc.enabled ? 'الدورة الشهرية' : `دورة ${store.partner?.name || ''}`, 'rose', null],
      ['settings', 'settings', 'Settings', 'الإعدادات', '', null],
    ].filter(Boolean);
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="kicker">Everything else</div><h1>المزيد</h1></div><a href="#/settings" class="row" style="gap:6px">${avatar(me)}${store.partner ? avatar(store.partner) : ''}</a></div>
      <div class="tiles">${tiles.map(([r, ic, en, ar, tone, n]) => `<a class="tile tap" href="#/${r}"><div class="row between"><span class="ic-box ${tone}">${icon(ic)}</span>${n ? `<span class="badge">${n}</span>` : ''}</div><div><div class="en">${esc(en)}</div><div class="ar">${esc(ar)}</div></div></a>`).join('')}</div>
      <p class="center muted small" style="margin-top:26px"><span class="en" style="font-size:16px">E&amp;R</span><br>مساحة خاصة تجمع ${esc(me.name)}${store.partner ? ' و' + esc(store.partner.name) : ''}</p>
    </div>`;
  },
};
