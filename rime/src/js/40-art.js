/* ---------- the lightning bolt, reward effects, sound ---------- */
function jagPath(r, x0, y0, x1, y1, rough, depth) {
  let pts = [[x0, y0], [x1, y1]];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, off = (r() - 0.5) * rough * len;
      next.push([(a[0] + b[0]) / 2 - dy / len * off, (a[1] + b[1]) / 2 + dx / len * off], b);
    }
    pts = next;
    rough *= 0.72;
  }
  return pts;
}
/* one deterministic strike per seed, in a unit square: a main channel from cloud to ground, with forks */
function boltSpec(seed) {
  const r = rng32(seed);
  const main = jagPath(r, 0.42 + r() * 0.16, 0.03, 0.34 + r() * 0.32, 0.95, 0.62, 4);
  const forks = [], n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const at = 2 + Math.floor(r() * (main.length - 7)), p = main[at], side = r() < 0.5 ? -1 : 1, len = 0.16 + r() * 0.22, ang = (0.35 + r() * 0.55) * side;
    const pts = jagPath(r, p[0], p[1], clamp(p[0] + Math.sin(ang) * len, 0.04, 0.96), Math.min(0.93, p[1] + Math.cos(ang) * len), 0.5, 3);
    let twig = null;
    if (r() > 0.45) {
      const q = pts[3 + Math.floor(r() * 3)], a2 = ang + side * (0.3 + r() * 0.4), l2 = len * 0.45;
      twig = jagPath(r, q[0], q[1], clamp(q[0] + Math.sin(a2) * l2, 0.03, 0.97), Math.min(0.94, q[1] + Math.cos(a2) * l2), 0.5, 2);
    }
    forks.push({ at: at / (main.length - 1), pts, twig });
  }
  return { main, forks };
}
function tracePart(ctx, pts, frac, X, Y) {
  if (frac <= 0) return;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total * Math.min(1, frac);
  ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
  for (let i = 1; i < pts.length && left > 0; i++) {
    const a = pts[i - 1], b = pts[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]), k = seg ? Math.min(1, left / seg) : 1;
    ctx.lineTo(X(a[0] + (b[0] - a[0]) * k), Y(a[1] + (b[1] - a[1]) * k));
    left -= seg;
  }
}
/* g (0..1) is the charge: the channel reaches further down and forks as it rises, and lands at 1 */
function strokeBolt(ctx, sp, w, h, g, lw) {
  const side = Math.min(w, h * 1.1), ox = (w - side) / 2, pad = Math.max(2, lw * 2);
  const X = x => ox + pad + x * (side - pad * 2), Y = y => pad + y * (h - pad * 2);
  const reach = 0.14 + 0.86 * (1 - Math.pow(1 - g, 1.5));
  ctx.lineWidth = lw * 1.9;
  ctx.beginPath(); tracePart(ctx, sp.main, reach, X, Y); ctx.stroke();
  for (const f of sp.forks) {
    const k = clamp((reach - f.at) / 0.34, 0, 1);
    if (k <= 0) continue;
    ctx.lineWidth = lw * 1.15;
    ctx.beginPath(); tracePart(ctx, f.pts, k, X, Y); ctx.stroke();
    if (f.twig && k > 0.6) { ctx.lineWidth = lw * 0.85; ctx.beginPath(); tracePart(ctx, f.twig, (k - 0.6) / 0.4, X, Y); ctx.stroke(); }
  }
  if (g >= 0.995) {
    // the strike lands: a short ground flash under the tip
    const e = sp.main[sp.main.length - 1], gx = X(e[0]), gy = Y(e[1]), s = side * 0.07;
    ctx.lineWidth = lw * 1.15;
    ctx.beginPath();
    ctx.moveTo(gx - s * 1.5, gy + lw * 2); ctx.lineTo(gx + s * 1.5, gy + lw * 2);
    ctx.moveTo(gx - s * 0.9, gy + lw * 6); ctx.lineTo(gx + s * 0.9, gy + lw * 6);
    ctx.stroke();
  }
}
function drawBolt(cv, key, g, o) {
  o = o || {};
  const w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sp = boltSpec(hash32(String(key))), lw = clamp(Math.min(w, h) / 150, 1, 2.6);
  ctx.strokeStyle = getComputedStyle(cv).color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'miter'; ctx.miterLimit = 3;
  if (o.ghost !== false) { ctx.globalAlpha = 0.24; strokeBolt(ctx, sp, w, h, 1, lw * 0.8); }
  ctx.globalAlpha = 1;
  strokeBolt(ctx, sp, w, h, clamp(g, 0, 1), lw);
  // a passing flash: the whole channel lights for a moment, whatever the charge
  if (o.flash > 0) { ctx.globalAlpha = Math.min(1, o.flash); strokeBolt(ctx, sp, w, h, o.reach == null ? 1 : o.reach, lw * 1.3); ctx.globalAlpha = 1; }
}
const calm = () => !S.profile.prefs.motion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function growBolt(cv, key, from, to, ms) {
  if (calm()) return drawBolt(cv, key, to);
  const t0 = performance.now();
  const step = t => {
    if (!cv.isConnected) return;
    const k = clamp((t - t0) / ms, 0, 1), e = 1 - Math.pow(1 - k, 3);
    drawBolt(cv, key, from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function drawBolts(root) {
  $$('canvas[data-bolt]', root || document).forEach(cv => {
    const g = parseFloat(cv.dataset.g) || 0;
    if (cv.dataset.from != null && !cv._grown) { cv._grown = true; growBolt(cv, cv.dataset.bolt, parseFloat(cv.dataset.from) || 0, g, 1400); }
    else drawBolt(cv, cv.dataset.bolt, g);
  });
}

/* a right answer discharges: jagged arcs leap out from the answer and sparks scatter */
const FX = (() => {
  let cv = null, ctx = null, parts = [], raf = 0, W = 0, H = 0, dpr = 1;
  function size() {
    cv = cv || $('#fx');
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx = cv.getContext('2d');
  }
  function tick() {
    const t = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    parts = parts.filter(p => (t - p.t0) / p.life < 1);
    for (const p of parts) { const k = (t - p.t0) / p.life; if (k >= 0) p.draw(ctx, k); }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
  }
  function burst(x, y, power) {
    if (calm()) return;
    if (!ctx || W !== window.innerWidth || H !== window.innerHeight) size();
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    const cols = [v('--a1'), v('--a2'), v('--good'), v('--fg')];
    const t0 = performance.now(), arcs = Math.round(6 + 4 * power), R = 96 + 90 * power, turn = Math.random() * Math.PI * 2;
    for (let i = 0; i < arcs; i++) {
      const a = turn + i * (Math.PI * 2 / arcs) + (Math.random() - 0.5) * 0.7, len = R * (0.55 + Math.random() * 0.6);
      const pts = jagPath(Math.random, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.8, 0.55, 3);
      const fork = Math.random() < 0.6 ? jagPath(Math.random, pts[4][0], pts[4][1], pts[4][0] + Math.cos(a + 0.7) * len * 0.4, pts[4][1] + Math.sin(a + 0.7) * len * 0.4, 0.5, 2) : null;
      const col = cols[i % 2 ? 2 : 3], id = v => v;
      parts.push({ t0: t0 + i * 14, life: 360 + 160 * power + Math.random() * 120, draw(c, k) {
        const reach = Math.min(1, k / 0.32), flick = k < 0.75 ? 0.55 + 0.45 * Math.sin(k * 58 + i) : 1;
        c.globalAlpha = Math.max(0, (1 - k * k) * flick);
        c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'miter';
        c.lineWidth = 2.6 * (1 - k * 0.5);
        c.beginPath(); tracePart(c, pts, reach, id, id); c.stroke();
        if (fork && reach > 0.5) { c.lineWidth = 1.2; c.beginPath(); tracePart(c, fork, (reach - 0.5) * 2, id, id); c.stroke(); }
        c.globalAlpha = 1;
      } });
    }
    const n = Math.round(10 + 14 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (70 + Math.random() * 170) * (0.7 + power * 0.5), sz = 4 + Math.random() * 7, col = cols[i % 4];
      parts.push({ t0: t0 + Math.random() * 70, life: 420 + Math.random() * 380, draw(c, k) {
        const e = 1 - Math.pow(1 - k, 2.4), d = sp * e, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + 70 * k * k, tail = sz * (1 - k);
        c.globalAlpha = 1 - k * k; c.strokeStyle = col; c.lineWidth = 1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - Math.cos(a) * tail, py - Math.sin(a) * tail); c.stroke();
        c.globalAlpha = 1;
      } });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  /* one thin bolt from the top of the screen down to a point, with a faint wash of the subject's colour */
  function strike(x, y) {
    if (calm()) return;
    if (!ctx || W !== window.innerWidth || H !== window.innerHeight) size();
    const cs = getComputedStyle(document.documentElement), col = cs.getPropertyValue('--a1').trim(), white = cs.getPropertyValue('--fg').trim();
    const id = v => v, t0 = performance.now(), pts = jagPath(Math.random, x + (Math.random() - 0.5) * 160, -12, x, y, 0.5, 4);
    const fork = jagPath(Math.random, pts[9][0], pts[9][1], pts[9][0] + (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 60), pts[9][1] + 50 + Math.random() * 50, 0.5, 2);
    parts.push({ t0, life: 460, draw(c, k) {
      const reach = Math.min(1, k / 0.25), flick = k < 0.7 ? 0.55 + 0.45 * Math.sin(k * 60) : 1, a = Math.max(0, 1 - k * k) * flick;
      c.globalAlpha = Math.max(0, 0.07 * (1 - k * 2.4)); c.fillStyle = col; c.fillRect(0, 0, W, H);
      c.lineCap = 'round'; c.lineJoin = 'miter';
      c.globalAlpha = a * 0.5; c.strokeStyle = col; c.lineWidth = 5; c.beginPath(); tracePart(c, pts, reach, id, id); c.stroke();
      c.globalAlpha = a; c.strokeStyle = white; c.lineWidth = 1.7; c.beginPath(); tracePart(c, pts, reach, id, id); c.stroke();
      if (reach > 0.55) { c.lineWidth = 1.1; c.beginPath(); tracePart(c, fork, (reach - 0.55) / 0.45, id, id); c.stroke(); }
      c.globalAlpha = 1;
    } });
    for (let i = 0; i < 9; i++) {
      const an = -Math.PI * Math.random(), sp = 40 + Math.random() * 90, sz = 4 + Math.random() * 5;
      parts.push({ t0: t0 + 110, life: 380 + Math.random() * 220, draw(c, k) {
        const d = sp * (1 - Math.pow(1 - k, 2.2)), px = x + Math.cos(an) * d, py = y + Math.sin(an) * d + 50 * k * k;
        c.globalAlpha = 1 - k * k; c.strokeStyle = i % 2 ? col : white; c.lineWidth = 1.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - Math.cos(an) * sz * (1 - k), py - Math.sin(an) * sz * (1 - k)); c.stroke(); c.globalAlpha = 1;
      } });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  return { burst, strike };
})();
function xpFloat(x, y, text) {
  if (calm()) return;
  const el = document.createElement('span');
  el.className = 'xp-float';
  el.textContent = text;
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}
let actx = null;
function ping(ok) {
  if (!S.profile.prefs.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const tone = (type, f0, f1, d, g0, at) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(f1, t + at + d);
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.linearRampToValueAtTime(g0, t + at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
      o.connect(g); g.connect(actx.destination);
      o.start(t + at); o.stop(t + at + d + 0.03);
    };
    // right: a quick zap that settles into a bright ring; wrong: a dull thud
    if (ok) { tone('sawtooth', 2400, 320, 0.09, 0.035, 0); tone('sine', 1320, 1320, 0.42, 0.06, 0.05); tone('sine', 1980, 1980, 0.5, 0.03, 0.09); }
    else tone('triangle', 190, 120, 0.22, 0.05, 0);
  } catch (e) {}
}
function buzz(ok) {
  if (!S.profile.prefs.haptic || !navigator.vibrate) return;
  try { navigator.vibrate(ok ? 12 : [18, 40, 18]); } catch (e) {}
}
