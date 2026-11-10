/* ---------- utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const now = () => Date.now();
const DAY = 864e5;
let idSeq = 0;
const mkid = p => p + Date.now().toString(36) + (idSeq++ % 46656).toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 4);
const coarse = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const clone = o => JSON.parse(JSON.stringify(o));
const pct = x => Math.round((x || 0) * 100);
const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : (ws || w + 's'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const str = (v, max) => (typeof v === 'string' || typeof v === 'number') ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '';

function dayKey(t = Date.now()) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayShift(key, by) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + by, 12).getTime());
}
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : d + ' days ago';
}
function dur(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s';
}
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(a, r = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function debounce(fn, ms) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* colour maths, used to keep a custom accent readable */
function hexRgb(h) {
  h = String(h || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return Number.isFinite(n) && h.length === 6 ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [128, 128, 128];
}
const rgbHex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function lum(h) {
  const [r, g, b] = hexRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mixHex(a, b, t) {
  const x = hexRgb(a), y = hexRgb(b);
  return rgbHex(x.map((v, i) => v + (y[i] - v) * t));
}
function readable(c, bg, min = 4.2) {
  const toward = lum(bg) < 0.4 ? '#ffffff' : '#000000';
  let out = c;
  for (let i = 1; i <= 10 && contrast(out, bg) < min; i++) out = mixHex(c, toward, i / 10);
  return out;
}

/* a small, escape-first Markdown renderer for Mr Claude's replies */
function mdInline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
}
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  const isList = l => /^\s*([-*•]|\d+[.)])\s+/.test(l);
  const isRow = l => /^\s*\|.*\|\s*$/.test(l);
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => mdInline(esc(c.trim())));
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if (/^\s*```/.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
    } else if (!l.trim()) {
      i++;
    } else if ((m = l.match(/^\s{0,3}#{1,4}\s+(.*)$/))) {
      out.push('<h4>' + mdInline(esc(m[1].replace(/#+\s*$/, ''))) + '</h4>'); i++;
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
      out.push('<hr>'); i++;
    } else if (isRow(l) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
      const head = cells(l); i += 2;
      const rows = [];
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      out.push('<div class="tbl"><table><thead><tr>' + head.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
    } else if (isList(l)) {
      const ordered = /^\s*\d+[.)]\s+/.test(l);
      const items = [];
      while (i < lines.length && (isList(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (isList(lines[i])) items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      out.push((ordered ? '<ol>' : '<ul>') + items.map(t => '<li>' + mdInline(esc(t)) + '</li>').join('') + (ordered ? '</ol>' : '</ul>'));
    } else if (/^\s*>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push('<blockquote>' + mdInline(esc(buf.join(' '))) + '</blockquote>');
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^\s{0,3}#{1,4}\s+/.test(lines[i]) && !isList(lines[i]) && !(isRow(lines[i]) && buf.length)) buf.push(lines[i++]);
      if (!buf.length) buf.push(lines[i++]);
      out.push('<p>' + mdInline(esc(buf.join('\n'))).replace(/\n/g, '<br>') + '</p>');
    }
  }
  return out.join('');
}

const ICONS = {
  home: '<path d="M4 11.2 12 4l8 7.2V20h-5.2v-5.4H9.2V20H4z"/>',
  bolt: '<path d="M13.2 3 5 13.2h6L9.8 21 19 10.6h-6.2z"/>',
  book: '<path d="M4 5.6c2.6-1 5.6-1 8 .5 2.4-1.5 5.4-1.5 8-.5V18c-2.6-1-5.6-1-8 .5-2.4-1.5-5.4-1.5-8-.5z"/><path d="M12 6.1v12.4"/>',
  stack: '<path d="m4 7.5 8-4 8 4-8 4z"/><path d="m4 12 8 4 8-4"/><path d="m4 16.5 8 4 8-4"/>',
  tune: '<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="8.5" cy="17" r="2.3"/>',
  chat: '<path d="M4.5 5h15v10.5H10L5.5 19.5V15.5h-1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7"/>',
  edit: '<path d="m4.5 19.5 1-4L16 5l3 3L8.5 18.5z"/>',
  file: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/>',
  spark: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5"/>',
  warn: '<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17v.2"/>',
  dot: '<circle cx="12" cy="12" r="2.4"/>'
};
const ic = n => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || ICONS.dot) + '</svg>';
