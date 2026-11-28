// Serves the bundled PWA files (see scripts/embed-assets.mjs).
import { FILES, VERSION } from './static.gen.js';

export function serveStatic(req) {
  const url = new URL(req.url);
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  let hit = FILES[p];
  if (!hit && !/\.[a-z0-9]+$/i.test(p)) hit = FILES['/index.html']; // SPA fallback
  if (!hit) return new Response('Not found', { status: 404 });
  const [body, type] = hit;
  const etag = `"${VERSION}"`;
  const longCache = /\.(png|jpg|woff2)$/.test(p);
  const headers = { 'content-type': type, etag, 'cache-control': longCache ? 'public, max-age=604800' : 'no-cache' };
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : body, { headers });
}
