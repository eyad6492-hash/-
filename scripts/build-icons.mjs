// Builds public/js/icons.js from lucide-static SVGs (dev-time helper).
import fs from 'node:fs';
const dir = process.argv[2];
const names = {
  home:'house', users:'users', user:'user', store:'store', calendarCheck:'calendar-check', check:'check', checkCircle:'circle-check', checkSquare:'square-check-big', subs:'calendar-range', coins:'coins', wallet:'wallet', chart:'chart-column', bars:'chart-no-axes-column', file:'file-text', calendar:'calendar-days', archive:'archive', history:'history', cloud:'cloud-upload', settings:'settings', bell:'bell', menu:'menu', more:'ellipsis', search:'search', plus:'plus', x:'x', chevL:'chevron-left', chevR:'chevron-right', chevD:'chevron-down', arrowL:'arrow-left', arrowR:'arrow-right', lock:'lock', unlock:'lock-open', eye:'eye', eyeOff:'eye-off', copy:'copy', phone:'phone', whatsapp:'message-circle', link:'link', note:'sticky-note', pause:'circle-pause', play:'circle-play', snow:'snowflake', refresh:'refresh-cw', trash:'trash-2', edit:'pencil', download:'download', upload:'upload', share:'share-2', shield:'shield-check', key:'key-round', fingerprint:'fingerprint', logout:'log-out', filter:'sliders-horizontal', alert:'triangle-alert', clock:'clock', megaphone:'megaphone', target:'target', trending:'trending-up', trendDown:'trending-down', tag:'tag', layers:'layers', receipt:'receipt', vault:'vault', mail:'mail', globe:'globe', zap:'zap', star:'star', list:'list-checks', user_plus:'user-plus', rotate:'rotate-ccw', info:'info', printer:'printer', sparkles:'sparkles', box:'package', activity:'activity', db:'database', moon:'moon', sun:'sun', grid:'layout-grid', send:'send', thumbsUp:'thumbs-up', flag:'flag', percent:'percent', banknote:'banknote', creditCard:'credit-card', building:'building-2', image:'image', save:'save', inbox:'inbox', listTodo:'list-todo'
};
const out = {};
for (const [k, n] of Object.entries(names)) {
  const p = `${dir}/${n}.svg`;
  if (!fs.existsSync(p)) { console.error('missing', n); continue; }
  const svg = fs.readFileSync(p, 'utf8');
  out[k] = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
}
fs.writeFileSync('public/js/icons.js', '// Generated from lucide-static (ISC license)\nexport const ICONS = ' + JSON.stringify(out, null, 0).replace(/","/g, '",\n"') + ';\n');
console.log(Object.keys(out).length, 'icons');
