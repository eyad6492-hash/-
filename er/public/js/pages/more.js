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
      ['since', 'heart', 'منذ أن عرفنا بعض ❤️', store.space?.since ? 'العداد والذكرى' : 'حدّدوا لحظة البداية', 'rose', null],
      ['dates', 'gift', 'تواريخنا المهمة', 'المناسبات وأعياد الميلاد', 'rose', all('dates').length],
      ['mood', 'smile', 'كيف حالنا اليوم؟', 'مزاجنا اليومي', 'brown', null],
      ['places', 'utensils', 'أماكننا', 'المطاعم والأماكن', '', all('places').length],
      ['bucket', 'sparkle', 'قائمة الأمنيات', 'أشياء نريد تجربتها', 'sage', all('bucket').filter((b) => b.status !== 'done').length],
      ['trips', 'plane', 'رحلاتنا', 'السفر والتخطيط', '', all('trips').filter((x) => (x.end_date || x.start_date || '9') >= t).length],
      ['honeymoon', 'palm', 'شهر العسل', 'رحلة العمر', 'rose', null],
      ['shopping', 'bag', 'المقاضي', 'قائمة المشتريات', 'sage', shopLeft],
      ['expenses', 'wallet', 'مصروفاتنا', 'الميزانية الشهرية', 'brown', null],
      ['notes', 'note', 'رسائلنا', 'ملاحظات صغيرة', 'rose', all('notes').length],
      showCycle && ['cycle', 'drop', 'الدورة الشهرية', me.letter === 'R' || cyc.enabled ? 'خاص بروان' : `دورة ${store.partner?.name || ''}`, 'rose', null],
      ['settings', 'settings', 'الإعدادات', 'الحساب والتفضيلات', '', null],
    ].filter(Boolean);
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="kicker">كل أقسامنا</div><h1>المزيد</h1></div><a href="#/settings" class="row" style="gap:6px">${avatar(me)}${store.partner ? avatar(store.partner) : ''}</a></div>
      <div class="tiles">${tiles.map(([r, ic, en, ar, tone, n]) => `<a class="tile tap" href="#/${r}"><div class="row between"><span class="ic-box ${tone}">${icon(ic)}</span>${n ? `<span class="badge">${n}</span>` : ''}</div><div><div class="en">${esc(en)}</div><div class="ar">${esc(ar)}</div></div></a>`).join('')}</div>
      <p class="center muted small" style="margin-top:26px"><span class="logo" style="font-size:20px">E<i>&amp;</i>R</span><br>مساحة خاصة تجمع ${esc(me.name)}${store.partner ? ' و' + esc(store.partner.name) : ''}</p>
    </div>`;
  },
};
