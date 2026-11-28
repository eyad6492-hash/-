// المزيد — every section, organised in clear groups, with a small count of what needs attention.
import { store, all, today } from '../store.js';
import { esc, icon, avatar } from '../ui.js';
import { agreementState } from '../act.js';

export default {
  render(el) {
    const me = store.me, p = store.partner, t = today();
    const cyc = me.settings.cycle;
    const cycleOwner = me.letter === 'R' || cyc.enabled;
    const showCycle = cycleOwner ? !cyc.hide : !!p; // the partner always finds it here (read-only, at the level the owner shares)
    const n = (col, f) => all(col).filter(f).length;
    const mine = (r, k) => r[k] === me.id || r[k] === 'both' || !r[k];
    const GROUPS = [
      ['يومنا', [
        ['s/daily_tasks', 'tasks', 'مهامنا اليومية', n('daily_tasks', (r) => r.status !== 'done' && r.date <= t && mine(r, 'assignee'))],
        ['s/outings', 'route', 'جدول يومنا', n('outings', (r) => r.status === 'planned' && r.date >= t)],
        ['s/cravings', 'coffee', 'وش نفسك فيه اليوم؟', n('cravings', (r) => r.date === t && r.status !== 'done')],
        ['s/reminders', 'bell', 'ذكرني بشيء', n('reminders', (r) => r.status !== 'done' && mine(r, 'target') && r.date <= t)],
        ['mood', 'smile', 'مزاجنا', 0],
      ]],
      ['خططنا', [
        ['quran', 'sparkle', 'مواعيد تسميع القرآن 🤍', n('quran', (r) => r.status === 'scheduled' && r.date >= t)],
        ['s/appointments', 'clock', 'مواعيدنا', n('appointments', (r) => r.date >= t && r.status === 'upcoming')],
        ['dates', 'gift', 'تواريخنا المهمة', 0], ['trips', 'plane', 'رحلاتنا', 0], ['honeymoon', 'palm', 'شهر العسل', 0],
        ['places', 'utensils', 'أماكننا', 0], ['bucket', 'sparkle', 'قائمة الأمنيات', 0],
      ]],
      ['أمنياتنا', [
        ['s/wishes', 'star', 'أمنياتنا', n('wishes', (r) => r.picked_by === me.id && r.status !== 'done')],
        ['s/requests', 'send', 'طلباتنا', n('requests', (r) => r.to_user === me.id && r.status === 'pending')],
        ['s/needs', 'bag', 'أغراض ناقصتني', n('needs', (r) => !r.bought)],
      ]],
      ['ذكرياتنا', [
        ['birthday', 'cake', 'أعياد ميلادنا', 0], ['since', 'heart', 'منذ أن عرفنا بعض', 0], ['anniv', 'moon', 'ذكرى يوم عرفنا بعض', 0],
        ['s/memories', 'image', 'ذكرياتنا', 0], ['s/visited', 'pin', 'أماكن زرناها', 0], ['notes', 'note', 'رسائلنا', 0],
      ]],
      ['تواصلنا', [
        ['s/confessions', 'note', 'اعترافات', n('confessions', (r) => r.created_by !== me.id && !r.read_at)],
        ['s/upsets', 'smile', 'شيء زعلني منك', n('upsets', (r) => r.created_by !== me.id && (r.status || 'unread') === 'unread')],
        ['s/joys', 'heart', 'كيف تسعدني؟', 0],
        ['s/commitments', 'shield', 'تعهداتنا', n('commitments', (r) => r.promiser === me.id && r.status === 'pending')],
        ['s/agreements', 'users', 'اتفاقياتنا', n('agreements', (r) => !r.draft && !r.closed && !(me.letter === 'R' ? r.r_approved_at : r.e_approved_at) && agreementState(r) !== 'both')],
      ]],
      ['تنظيمنا', [
        ['s/urgent', 'flag', 'أشياء عاجلة', n('urgent', (r) => r.status !== 'done')],
        ['shopping', 'bag', 'المقاضي', n('shopping', (r) => !r.done)], ['expenses', 'wallet', 'مصروفاتنا', 0],
        showCycle && ['cycle', 'drop', me.letter === 'R' || cyc.enabled ? 'الدورة الشهرية' : `دورة ${p?.name || ''}`, 0],
      ]],
      ['إعداداتنا', [['settings', 'settings', 'الإعدادات', 0], ['notifications', 'bell', 'الإشعارات', store.unread]]],
    ];
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="kicker">كل أقسامنا</div><h1>المزيد</h1></div><a href="#/settings" class="row" style="gap:6px">${avatar(me)}${p ? avatar(p) : ''}</a></div>
      ${GROUPS.map(([g, items]) => `<div class="section-title" style="margin-top:18px"><h2>${g}</h2></div>
        <div class="tiles-sm">${items.filter(Boolean).map(([r, ic, l, c]) => `<a class="tile-sm tap" href="#/${r}"><span class="ic-box">${icon(ic)}</span><span class="l">${esc(l)}</span>${c ? `<span class="pill-count">${c > 99 ? '99+' : c}</span>` : ''}</a>`).join('')}</div>`).join('')}
      <p class="center muted small" style="margin-top:26px"><span class="logo" style="font-size:20px">E<i>&amp;</i>R</span><br>مساحة خاصة تجمع ${esc(me.name)}${p ? ' و' + esc(p.name) : ''}</p>
    </div>`;
  },
};
