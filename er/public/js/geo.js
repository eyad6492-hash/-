// Extract coordinates from a Google Maps URL (shared by the app and the Worker).
export function coordsFromText(s) {
  const t = decodeURIComponent(String(s || '')).replace(/%2C/gi, ',');
  const pats = [/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|center|destination|daddr)=(-?\d{1,2}\.\d+),\s*\+?(-?\d{1,3}\.\d+)/, /\/place\/(-?\d{1,2}\.\d+),\s*\+?(-?\d{1,3}\.\d+)/];
  for (const p of pats) {
    const m = t.match(p);
    if (m) { const lat = Number(m[1]), lng = Number(m[2]); if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }; }
  }
  return null;
}
