// Lightweight SVG charts (no dependencies). Interactive tooltips on hover/tap.
import { esc } from './ui.js';

const fmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const fmtFull = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
let uid = 0;

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/**
 * series: [{ name, values: number[], color, type: 'bar'|'line'|'area', axis?: 'right' }]
 * labels: string[] (already formatted)
 */
export function chart({ labels, series, height = 200, unit = '' }) {
  const id = 'c' + (++uid);
  const W = 640, H = height, padL = 8, padR = 40, padT = 12, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const left = series.filter((s) => s.axis !== 'right'), right = series.filter((s) => s.axis === 'right');
  const maxL = niceMax(Math.max(0, ...left.flatMap((s) => s.values.map((v) => v || 0))));
  const maxR = right.length ? niceMax(Math.max(0, ...right.flatMap((s) => s.values.map((v) => v || 0)))) : 1;
  const n = labels.length || 1, step = iw / n;
  const x = (i) => padL + step * i + step / 2;
  const y = (v, r) => padT + ih - (ih * (v || 0)) / (r ? maxR : maxL);
  const bars = series.filter((s) => s.type === 'bar');
  const bw = Math.max(2, Math.min(22, (step * 0.72) / Math.max(1, bars.length)));
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" data-chart="${id}">`;
  out += '<defs>' + series.map((s, i) => `<linearGradient id="${id}g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="${s.type === 'area' ? 0.38 : 1}"/><stop offset="1" stop-color="${s.color}" stop-opacity="${s.type === 'area' ? 0 : 0.55}"/></linearGradient>`).join('') + '</defs>';
  for (let g = 0; g <= 4; g++) {
    const gy = padT + (ih * g) / 4;
    out += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${gy}" y2="${gy}"/>`;
    out += `<text x="${W - padR + 6}" y="${gy + 3}" text-anchor="start">${fmt.format(maxL * (1 - g / 4))}</text>`;
  }
  const every = Math.ceil(n / 8);
  labels.forEach((l, i) => { if (i % every === 0 || n <= 8) out += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  bars.forEach((s, bi) => {
    s.values.forEach((v, i) => {
      if (!v) return;
      const bx = x(i) - (bw * bars.length) / 2 + bi * bw, by = y(v, s.axis === 'right');
      out += `<rect x="${bx + 1}" y="${by}" width="${bw - 2}" height="${Math.max(0, padT + ih - by)}" rx="${Math.min(5, bw / 2)}" fill="url(#${id}g${series.indexOf(s)})"/>`;
    });
  });
  series.filter((s) => s.type !== 'bar').forEach((s) => {
    const r = s.axis === 'right';
    const pts = s.values.map((v, i) => (v === null || v === undefined ? null : [x(i), y(v, r)]));
    const segs = []; let cur = [];
    pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
    for (const seg of segs) {
      const d = seg.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      if (s.type === 'area' && seg.length > 1) out += `<path d="${d} L${seg[seg.length - 1][0]} ${padT + ih} L${seg[0][0]} ${padT + ih} Z" fill="url(#${id}g${series.indexOf(s)})"/>`;
      out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (seg.length <= 31) seg.forEach((p) => { out += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.color}"/>`; });
    }
  });
  labels.forEach((l, i) => {
    const tip = `<b>${esc(l)}</b><br>` + series.map((s) => `<i style="background:${s.color};display:inline-block;width:8px;height:8px;border-radius:2px"></i> ${esc(s.name)}: ${s.values[i] === null || s.values[i] === undefined ? '—' : fmtFull.format(s.values[i]) + (s.unit ?? unit)}`).join('<br>');
    out += `<rect x="${padL + step * i}" y="${padT}" width="${step}" height="${ih}" fill="transparent" data-tip="${esc(tip)}"/>`;
  });
  out += '</svg>';
  out += `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  return out;
}

export function donut({ parts, size = 150, label = '', sub = '' }) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0) || 1;
  const r = 52, c = 2 * Math.PI * r;
  let off = 0;
  let out = `<div class="row" style="gap:16px;align-items:center"><svg viewBox="0 0 140 140" width="${size}" height="${size}" style="flex:none">`;
  out += `<circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="16"/>`;
  for (const p of parts) {
    const len = (c * (p.value || 0)) / total;
    if (len > 0) out += `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)" data-tip="${esc(`${p.name}: ${fmtFull.format(p.value)}`)}"/>`;
    off += len;
  }
  out += `<text x="70" y="68" text-anchor="middle" style="fill:var(--text);font-size:20px;font-weight:800">${esc(label)}</text><text x="70" y="88" text-anchor="middle" style="font-size:11px">${esc(sub)}</text></svg>`;
  out += `<div class="stack" style="gap:6px;flex:1">${parts.map((p) => `<div class="row small"><i style="width:10px;height:10px;border-radius:3px;background:${p.color};flex:none"></i><span class="grow">${esc(p.name)}</span><b class="num">${fmtFull.format(p.value || 0)}</b></div>`).join('')}</div></div>`;
  return out;
}

// One global tooltip handler
let tipEl;
function showTip(e) {
  const t = e.target.closest('[data-tip]');
  if (!t || !t.closest('svg')) { if (tipEl) tipEl.style.display = 'none'; return; }
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
  tipEl.innerHTML = t.getAttribute('data-tip');
  tipEl.style.display = 'block';
  const px = (e.touches?.[0]?.clientX ?? e.clientX), py = (e.touches?.[0]?.clientY ?? e.clientY);
  const w = tipEl.offsetWidth;
  tipEl.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, px - w / 2)) + 'px';
  tipEl.style.top = Math.max(8, py - tipEl.offsetHeight - 14) + 'px';
}
document.addEventListener('mousemove', showTip);
document.addEventListener('click', showTip);
document.addEventListener('scroll', () => { if (tipEl) tipEl.style.display = 'none'; }, { passive: true });
