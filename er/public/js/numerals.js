// Arabic-Indic (١٢٣) or Western (123) digits across the whole interface — chosen in Settings.
// Applied to displayed text only: inputs, e-mails, links and codes keep Western digits so typing & copying work.
const AR = '٠١٢٣٤٥٦٧٨٩';
let mode = 'latn';
try { mode = localStorage.getItem('er-num') || 'latn'; } catch { /* ignore */ }

const SKIP = 'input, textarea, script, style, [dir="ltr"], .code-box, [data-keep-digits]';
export function toDigits(s, m = mode) {
  if (m === 'arab') return s.replace(/[0-9]/g, (d) => AR[d]).replace(/([٠-٩])\.([٠-٩])/g, '$1٫$2').replace(/([٠-٩]),([٠-٩])/g, '$1٬$2');
  return s.replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/([0-9])٫([0-9])/g, '$1.$2').replace(/([0-9])٬([0-9])/g, '$1,$2');
}
function fixText(node) {
  const p = node.parentElement;
  if (!p || p.closest(SKIP)) return;
  const v = node.data, n = toDigits(v);
  if (n !== v) node.data = n;
}
function walk(root) {
  if (root.nodeType === 3) return fixText(root);
  if (root.nodeType !== 1 || root.matches?.(SKIP)) return;
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) fixText(n);
}
export function getNumerals() { return mode; }
export function setNumerals(m) {
  m = m === 'arab' ? 'arab' : 'latn';
  if (m === mode) return;
  mode = m;
  try { localStorage.setItem('er-num', m); } catch { /* ignore */ }
  walk(document.body);
}
new MutationObserver((list) => {
  for (const r of list) {
    if (r.type === 'characterData') fixText(r.target);
    else r.addedNodes.forEach(walk);
  }
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
document.addEventListener('DOMContentLoaded', () => walk(document.body));
