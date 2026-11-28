// Runs before first paint: applies the saved theme so there is no flash.
(function () {
  var t = 'auto';
  try { t = localStorage.getItem('er-theme') || 'auto'; } catch (e) { /* ignore */ }
  var dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', dark ? '#151312' : '#FAF7F2');
})();
