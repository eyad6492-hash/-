// Real PDF files rendered from the on-screen (Arabic, RTL) layout using html2canvas + jsPDF (vendored).
import { downloadBlob, toast } from './ui.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('تعذر تحميل مكتبة PDF'));
    document.head.appendChild(s);
  });
}

export async function elementToPdf(el, filename) {
  await Promise.all([loadScript('/vendor/html2canvas.min.js'), loadScript('/vendor/jspdf.umd.min.js')]);
  await document.fonts?.ready;
  const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: Math.max(el.scrollWidth, 720) });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pageW = 210, pageH = 297, margin = 8;
  const imgW = pageW - margin * 2;
  const pxPerMm = canvas.width / imgW;
  const pageHpx = Math.floor((pageH - margin * 2) * pxPerMm);
  let y = 0, first = true;
  while (y < canvas.height) {
    const h = Math.min(pageHpx, canvas.height - y);
    const part = document.createElement('canvas'); part.width = canvas.width; part.height = h;
    const ctx = part.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, part.width, h); ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (!first) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, h / pxPerMm);
    first = false; y += h;
  }
  pdf.setProperties({ title: filename.replace(/\.pdf$/, ''), creator: 'Media Buyer Control Center' });
  return new File([pdf.output('blob')], filename, { type: 'application/pdf' });
}

/** Creates the PDF then shares it (mobile share sheet) or downloads it. */
export async function exportPdf(el, filename, { share = false } = {}) {
  const file = await elementToPdf(el, filename);
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  downloadBlob(file, filename);
  toast('تم إنشاء ملف PDF');
}
