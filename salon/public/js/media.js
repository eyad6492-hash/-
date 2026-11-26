// Camera / gallery capture with compression and preview, and GPS position helpers.
import { html, icon, toast } from './ui.js';

/** Downscale + re-encode an image file to JPEG (keeps invoices readable, uploads fast). */
export function compressImage(file, { max = 1600, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('اختر صورة صالحة'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('تعذر معالجة الصورة'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الصورة — جرّب صورة أخرى')); };
    img.src = url;
  });
}

/**
 * Photo picker widget: camera or gallery, preview, then returns the compressed blob via getBlob().
 * Mount the returned html, then call bind(root).
 */
export function photoPicker({ label = 'صورة الفاتورة', required = true } = {}) {
  let blob = null, previewUrl = null;
  const id = 'pp' + Math.random().toString(36).slice(2, 8);
  const markup = html`<div class="field" id="${id}">
    <span>${label}${required ? ' *' : ''}</span>
    <div class="photo-drop" data-drop>${icon('camera', 'xl')}<b>صوّر الفاتورة</b><small class="muted">أو اختر صورة من جهازك</small></div>
    <div class="photo-btns">
      <label class="btn sm">${icon('camera', 'sm')} الكاميرا<input type="file" accept="image/*" capture="environment" hidden data-cam></label>
      <label class="btn sm ghost">${icon('image', 'sm')} من المعرض<input type="file" accept="image/*" hidden data-gal></label>
    </div>
  </div>`;
  return {
    markup,
    bind(root) {
      const box = root.querySelector('#' + id);
      const drop = box.querySelector('[data-drop]');
      drop.addEventListener('click', () => box.querySelector('[data-cam]').click());
      for (const inp of box.querySelectorAll('input[type=file]')) {
        inp.addEventListener('change', async () => {
          const f = inp.files?.[0]; inp.value = '';
          if (!f) return;
          try {
            drop.innerHTML = '<div class="muted">جارٍ تجهيز الصورة…</div>';
            blob = await compressImage(f);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(blob);
            drop.classList.add('has'); drop.innerHTML = `<img src="${previewUrl}" alt="معاينة الفاتورة">`;
          } catch (e) { toast(e.message, 'err'); drop.classList.remove('has'); drop.innerHTML = String(html`${icon('camera', 'xl')}<b>صوّر الفاتورة</b>`); }
        });
      }
    },
    getBlob: () => blob,
  };
}

/** One high-accuracy GPS fix. Resolves with a payload for the server (never throws: errors are reported to the server too). */
export function gpsFix({ timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({ geo_error: 'المتصفح لا يدعم تحديد الموقع' });
    if (!window.isSecureContext) return resolve({ geo_error: 'تحديد الموقع يتطلب اتصالاً آمناً (https)' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, position_ts: p.timestamp, client_now: Date.now() }),
      (e) => resolve({ geo_error: e.code === 1 ? 'تم رفض صلاحية الموقع — اسمح للموقع من إعدادات المتصفح' : e.code === 3 ? 'انتهت مهلة تحديد الموقع — تأكد من تشغيل GPS' : 'تعذر تحديد الموقع', denied: e.code === 1 }),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    );
  });
}
