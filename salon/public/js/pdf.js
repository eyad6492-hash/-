// Real PDF files rendered from the on-screen Arabic (RTL) layout using html2canvas + jsPDF (vendored).
// The browser shapes the Arabic text, so it never comes out reversed or disconnected.
// Pages are cut only between rows / blocks, and every page gets a page number.
import { downloadBlob } from './ui.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('تعذر تحميل مكتبة PDF'));
    document.head.appendChild(s);
  });
}

async function waitImages(el) {
  await Promise.all([...el.querySelectorAll('img')].map((im) => (im.complete && im.naturalWidth ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
}

export async function elementToPdf(el, filename, { title = '' } = {}) {
  await Promise.all([loadScript('/vendor/html2canvas.min.js'), loadScript('/vendor/jspdf.umd.min.js')]);
  await document.fonts?.ready;
  await waitImages(el);
  const scale = 2;
  // safe break points (px, relative to el): bottoms of rows/blocks
  const top0 = el.getBoundingClientRect().top;
  const breaks = [...el.querySelectorAll('tr, .no-break, h2, figure, .box, .page > *')].map((n) => Math.round((n.getBoundingClientRect().bottom - top0) * scale));
  const forced = [...el.querySelectorAll('.page-break')].map((n) => Math.round((n.getBoundingClientRect().top - top0) * scale));
  const canvas = await window.html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: el.scrollWidth });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pageW = 210, pageH = 297, footer = 9;
  const pxPerMm = canvas.width / pageW;
  const pageHpx = Math.floor((pageH - footer) * pxPerMm);
  const cuts = [];
  let y = 0;
  while (y < canvas.height - 2) {
    let end = Math.min(y + pageHpx, canvas.height);
    const f = forced.find((b) => b > y + 40 && b < end);
    if (f) end = f;
    else if (end < canvas.height) {
      const cand = breaks.filter((b) => b > y + pageHpx * 0.5 && b <= end);
      if (cand.length) end = Math.max(...cand);
    }
    cuts.push([y, end]); y = end;
  }
  cuts.forEach(([a, b], i) => {
    const h = b - a;
    const part = document.createElement('canvas'); part.width = canvas.width; part.height = h;
    const ctx = part.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, part.width, h); ctx.drawImage(canvas, 0, a, canvas.width, h, 0, 0, canvas.width, h);
    if (i) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pageW, h / pxPerMm);
    pdf.setFontSize(8); pdf.setTextColor(130, 118, 100);
    pdf.text(`${i + 1} / ${cuts.length}`, pageW / 2, pageH - 4, { align: 'center' });
    pdf.text('Mr. Vibe Salon', pageW - 10, pageH - 4, { align: 'right' });
    if (title) pdf.text(title, 10, pageH - 4);
  });
  pdf.setProperties({ title: filename.replace(/\.pdf$/, ''), creator: 'Mr. Vibe Salon' });
  return new File([pdf.output('blob')], filename, { type: 'application/pdf' });
}

export async function sharePdf(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  downloadBlob(file, file.name);
}
