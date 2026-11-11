/* ---------- BOLT: a hooded pixel portrait with lightning eyes ----------
   A 16x16 sprite drawn on a tiny canvas and scaled up with hard pixels. The hood and body are fixed; the eyes, brows
   and mouth are redrawn per expression. Live portraits blink, crackle, follow the cursor with their eyes and move
   their mouth while he is typing. */
const FACE_ROWS = [
  '......LLLL......',
  '....LLHHHHLL....',
  '...LHHHHHHHHL...',
  '..LHHhhhhhhHHL..',
  '..HHhFFFFFFhHH..',
  '.LHhFFFFFFFFhHL.',
  '.HHhFFFFFFFFhHH.',
  '.HHhFFFFFFFFhHH.',
  '.HHhFFFFFFFFhHH.',
  '.HHhFFFFFFFFhHH.',
  '.HHHhFFFFFFhHHH.',
  '..HHHhhhhhhHHH..',
  '..sHHHAHHAHHHs..',
  '.SSSHHAHHAHHSSS.',
  'SSSSSHAHHAHSSSSS',
  'SSSSSSHHHHSSSSSS'
];
const FACE_PAL = { L: '#51658a', H: '#273349', h: '#161e2c', F: '#06080d', S: '#222c3f', s: '#131a26' };
const EXPR = ['smirk', 'deadpan', 'hype', 'think', 'sideeye', 'oof', 'shock', 'soft'];
const EXPR_ALIAS = {
  grin: 'hype', happy: 'hype', lol: 'hype', laugh: 'hype', proud: 'hype', excited: 'hype', smug: 'smirk', cocky: 'smirk', nod: 'smirk', wink: 'smirk',
  shrug: 'deadpan', flat: 'deadpan', bored: 'deadpan', unbothered: 'deadpan', neutral: 'deadpan', hmm: 'think', thinking: 'think', curious: 'think',
  skeptical: 'sideeye', eyeroll: 'sideeye', sus: 'sideeye', doubt: 'sideeye', side: 'sideeye', wince: 'oof', yikes: 'oof', cringe: 'oof', sad: 'oof',
  surprised: 'shock', shocked: 'shock', wow: 'shock', smile: 'soft', kind: 'soft', gentle: 'soft', warm: 'soft'
};
const exprOf = k => { k = String(k || '').toLowerCase().replace(/[^a-z]/g, ''); return EXPR.includes(k) ? k : (EXPR_ALIAS[k] || ''); };
// eye and brow pixels are offsets from each eye's corner (left eye at 5,6; right eye at 9,6); the mouth is absolute
const EYE = [[0, 0], [1, 0], [0, 1], [1, 1]], LID = [[0, 1], [1, 1]], BROW_UP = [[0, -2], [1, -2]], BROW = [[0, -1], [1, -1]];
const FACES = {
  smirk: { l: EYE, r: LID, bl: BROW_UP, br: BROW, m: [[6, 9], [7, 9], [8, 9], [9, 8]] },
  deadpan: { l: LID, r: LID, bl: BROW, br: BROW, m: [[7, 9], [8, 9]] },
  hype: { l: EYE, r: EYE, bl: BROW_UP, br: BROW_UP, m: [[5, 8], [6, 9], [7, 9], [8, 9], [9, 9], [10, 8]], bright: true },
  think: { l: [[-1, -1], [0, -1], [-1, 0], [0, 0]], r: [[-1, -1], [0, -1], [-1, 0], [0, 0]], bl: [[0, -3], [1, -2]], br: null, m: [[8, 9], [9, 9]], fixed: true },
  sideeye: { l: [[1, 1], [2, 1]], r: [[1, 1], [2, 1]], bl: BROW, br: BROW, m: [[6, 9], [7, 9], [8, 9]], fixed: true },
  oof: { l: [[0, 0], [1, 1], [0, 2]], r: [[1, 0], [0, 1], [1, 2]], bl: null, br: null, m: [[7, 9], [8, 9], [6, 10], [9, 10]], fixed: true },
  shock: { l: [[0, -1], [1, -1], [0, 0], [1, 0], [0, 1], [1, 1]], r: [[0, -1], [1, -1], [0, 0], [1, 0], [0, 1], [1, 1]], bl: null, br: null, m: [[7, 9], [8, 9], [7, 10], [8, 10]], bright: true, fixed: true },
  soft: { l: EYE, r: EYE, bl: null, br: null, m: [[6, 9], [9, 9], [7, 10], [8, 10]] }
};
const MOUTH_OPEN = [[7, 9], [8, 9], [7, 10], [8, 10]];
const inFace = (x, y) => y >= 0 && y < 16 && FACE_ROWS[y][x] === 'F';
const faceMem = new WeakMap();
let curFace = 'smirk', faceTick = 0, faceTimer = 0, faceBack = 0;

function drawFace(cv, t, accent, still) {
  if (cv.width !== 16 || cv.height !== 16) { cv.width = 16; cv.height = 16; }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const ch = FACE_ROWS[y][x];
    if (ch === '.') continue;
    ctx.fillStyle = ch === 'A' ? accent : FACE_PAL[ch];
    ctx.fillRect(x, y, 1, 1);
  }
  const f = FACES[cv.dataset.face] || FACES.smirk;
  let st = faceMem.get(cv);
  if (!st) { st = { blink: 0, next: 18 + Math.floor(Math.random() * 30) }; faceMem.set(cv, st); }
  if (!still) {
    if (st.blink > 0) st.blink--;
    else if (--st.next <= 0) { st.blink = 1; st.next = 20 + Math.floor(Math.random() * 34); }
  }
  // the eyes follow the cursor where the expression leaves them free to
  const lx = f.fixed || still ? 0 : clamp(parseInt(cv.dataset.lx, 10) || 0, -1, 1), ly = f.fixed || still ? 0 : clamp(parseInt(cv.dataset.ly, 10) || 0, -1, 1);
  const eyes = [], put = (ox, list) => { if (list) for (const p of list) { const x = ox + p[0] + lx, y = 6 + p[1] + ly; if (inFace(x, y)) eyes.push([x, y]); } };
  const blinking = !still && st.blink > 0 && !f.fixed;
  if (blinking) { put(5, LID); put(9, LID); } else { put(5, f.l); put(9, f.r); }
  const isEye = (x, y) => eyes.some(p => p[0] === x && p[1] === y);
  if (!blinking) {
    // the glow: a halo in the subject's colour that flickers like a bad connection
    const flick = still ? 0.5 : 0.36 + Math.random() * 0.3 + (f.bright ? 0.14 : 0);
    ctx.fillStyle = accent;
    for (const p of eyes) for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p[0] + d[0], y = p[1] + d[1];
      if (!inFace(x, y) || isEye(x, y)) continue;
      ctx.globalAlpha = flick;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = blinking ? '#8f9bb0' : f.bright ? '#ffffff' : '#fff6c4';
  for (const p of eyes) ctx.fillRect(p[0], p[1], 1, 1);
  ctx.fillStyle = '#5b6d8c';
  const brow = (ox, list) => { if (list) for (const p of list) { const x = ox + p[0] + lx, y = 6 + p[1] + ly; if (inFace(x, y) && !isEye(x, y)) ctx.fillRect(x, y, 1, 1); } };
  brow(5, f.bl); brow(9, f.br);
  const talking = !still && cv.dataset.talk === '1' && Math.floor(t / 2) % 2 === 1;
  ctx.fillStyle = f.bright ? '#fff6c4' : '#d3dbe8';
  for (const p of (talking ? MOUTH_OPEN : f.m)) if (inFace(p[0], p[1]) && !isEye(p[0], p[1])) ctx.fillRect(p[0], p[1], 1, 1);
  if (!still && !blinking && eyes.length) {
    // crackle: stray sparks off the eyes, and now and then an arc between them
    ctx.fillStyle = '#ffe04a';
    if (Math.random() < (f.bright ? 0.34 : 0.15)) {
      const p = eyes[Math.floor(Math.random() * eyes.length)], x = p[0] + Math.round((Math.random() - 0.5) * 4), y = p[1] + Math.round((Math.random() - 0.5) * 4);
      if (inFace(x, y) && !isEye(x, y)) ctx.fillRect(x, y, 1, 1);
    }
    if (Math.random() < 0.05) { const up = Math.random() < 0.5; ctx.fillRect(7, 6 + ly + (up ? 0 : 1), 1, 1); ctx.fillRect(8, 6 + ly + (up ? 1 : 0), 1, 1); }
  }
}
const accentNow = () => getComputedStyle(document.documentElement).getPropertyValue('--a1').trim() || '#7a6bff';
function drawFaces(root) {
  const acc = accentNow();
  $$('canvas.face', root || document).forEach(cv => drawFace(cv, 0, acc, !cv.hasAttribute('data-live') || calm()));
}
function syncFaces() {
  if (calm()) { clearInterval(faceTimer); faceTimer = 0; drawFaces(); return; }
  if (faceTimer) return;
  faceTimer = setInterval(() => {
    if (document.hidden) return;
    faceTick++;
    const acc = accentNow();
    $$('canvas.face[data-live]').forEach(cv => drawFace(cv, faceTick, acc, false));
  }, 130);
}
/* markup for a portrait. opts.mood: wears BOLT's current expression and reacts with him; opts.look: eyes follow the cursor */
function faceHTML(size, opts) {
  opts = opts || {};
  const mood = opts.mood !== false;
  return '<canvas class="face ' + size + '" ' + (mood ? 'data-mood data-live ' : opts.live ? 'data-live ' : '') + (opts.look ? 'data-look ' : '') +
    'data-face="' + (opts.face || (mood ? curFace : 'smirk')) + '" width="16" height="16" aria-hidden="true"></canvas>';
}
function setFace(expr, ms) {
  curFace = exprOf(expr) || 'smirk';
  $$('canvas.face[data-mood]').forEach(cv => {
    if (cv.dataset.face === curFace) return;
    cv.dataset.face = curFace;
    cv.classList.remove('pop'); void cv.offsetWidth; cv.classList.add('pop');
  });
  clearTimeout(faceBack);
  if (ms) faceBack = setTimeout(() => setFace('smirk'), ms);
  if (calm()) drawFaces();
}
function talkFace(on) { $$('canvas.face[data-mood]').forEach(cv => { cv.dataset.talk = on ? '1' : ''; }); }

/* his replies arrive as a few short texts, each opening with an expression tag such as [smirk] */
function splitTexts(raw, live) {
  const tagRe = new RegExp('^\\s*\\[([a-z][a-z -]{1,13})\\]\\s*', 'i');
  const chunks = [];
  let buf = [], fence = false;
  const push = () => { const s = buf.join('\n').trim(); buf = []; if (s) chunks.push(s); };
  for (const line of String(raw || '').replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (!fence && !line.trim()) { push(); continue; }
    const m = !fence && line.match(tagRe);
    if (m && buf.length && exprOf(m[1])) push();
    buf.push(line);
  }
  push();
  let last = 'smirk';
  const out = chunks.map(s => {
    const m = s.match(tagRe);
    if (m && exprOf(m[1])) { last = exprOf(m[1]); s = s.slice(m[0].length); }
    return { expr: last, text: s };
  });
  // while a reply is still arriving, hide a half-typed tag at the very end
  if (live && out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\n?\s*\[[a-z -]{0,13}$/i, '');
  return out;
}

(() => {
  let lookAt = 0;
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const t = performance.now();
    if (t - lookAt < 90) return;
    lookAt = t;
    $$('canvas.face[data-look]').forEach(cv => {
      const r = cv.getBoundingClientRect(), vx = e.clientX - (r.left + r.width / 2), vy = e.clientY - (r.top + r.height / 2);
      cv.dataset.lx = Math.abs(vx) < r.width * 0.6 ? 0 : Math.sign(vx);
      cv.dataset.ly = Math.abs(vy) < r.height * 0.7 ? 0 : Math.sign(vy);
    });
  }, { passive: true });
  // he glances over when you reach for him
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse' || !e.target.closest) return;
    const b = e.target.closest('[data-act="open-claude"], [data-act="ask-claude"], [data-act="ask-deck"]');
    if (b && !(e.relatedTarget && b.contains(e.relatedTarget)) && curFace === 'smirk') setFace('sideeye', 1100);
  }, { passive: true });
})();
