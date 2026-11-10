/* ---------- the rime crystal, reward effects, sound ---------- */
function crystalSpec(seed) {
  const r = rng32(seed), n = 3 + Math.floor(r() * 3), br = [];
  for (let i = 0; i < n; i++) {
    br.push({ t: 0.24 + (i + 0.15 + r() * 0.5) * (0.64 / n), len: 0.2 + r() * 0.26, thr: 0.08 + (i / n) * 0.62 + r() * 0.06, sub: r() > 0.4, st: 0.4 + r() * 0.35 });
  }
  return { br, tip: Math.floor(r() * 3), hex: 0.07 + r() * 0.05, ring: 0.17 + r() * 0.08 };
}
/* one deterministic six-fold dendrite per seed; g (0..1) is how much of it has grown */
function strokeCrystal(ctx, sp, cx, cy, R, g, rot) {
  const C = 0.5, Q = Math.sqrt(3) / 2;
  const arm = R * (0.26 + 0.74 * (1 - Math.pow(1 - g, 1.6)));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
    const pt = (x, y) => [x * ca - y * sa, x * sa + y * ca];
    const seg = (x0, y0, x1, y1) => { const p = pt(x0, y0), q = pt(x1, y1); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
    seg(R * sp.hex, 0, arm, 0);
    // centre plate, and a second plate once the crystal has some size
    seg(R * sp.hex, 0, R * sp.hex * C, R * sp.hex * Q);
    if (g > 0.3 && R * sp.ring < arm) seg(R * sp.ring, 0, R * sp.ring * C, R * sp.ring * Q);
    for (const b of sp.br) {
      const x = R * b.t;
      if (g <= b.thr || x > arm) continue;
      const f = clamp((g - b.thr) / (1 - b.thr) * 1.7, 0, 1), L = R * b.len * (1 - b.t * 0.55) * f;
      for (const s of [-1, 1]) {
        seg(x, 0, x + L * C, s * L * Q);
        if (b.sub && f > 0.55) {
          const sx = x + L * b.st * C, sy = s * L * b.st * Q;
          seg(sx, sy, sx + L * 0.36 * (f - 0.55) / 0.45, sy);
        }
      }
    }
    if (g > 0.5) {
      const tl = R * 0.075 * (g - 0.5) * 2;
      if (sp.tip === 0) { seg(arm, 0, arm + tl * C, tl * Q); seg(arm, 0, arm + tl * C, -tl * Q); }
      else if (sp.tip === 1) { seg(arm, 0, arm - tl, tl * 0.5); seg(arm - tl, tl * 0.5, arm - 2 * tl, 0); seg(arm - 2 * tl, 0, arm - tl, -tl * 0.5); seg(arm - tl, -tl * 0.5, arm, 0); }
      else { seg(arm - tl * 0.9, tl * 0.5, arm - tl * 0.9, -tl * 0.5); }
    }
  }
  ctx.stroke();
  ctx.restore();
}
function drawCrystal(cv, key, g, o) {
  o = o || {};
  const w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const R = Math.min(w, h) / 2 * 0.88, sp = crystalSpec(hash32(String(key)));
  ctx.strokeStyle = getComputedStyle(cv).color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const lw = clamp(R / 80, 1, 2.2);
  if (o.ghost !== false) { ctx.globalAlpha = 0.17; ctx.lineWidth = lw; strokeCrystal(ctx, sp, w / 2, h / 2, R, 1, -Math.PI / 2); }
  ctx.globalAlpha = 1; ctx.lineWidth = lw * 1.3;
  strokeCrystal(ctx, sp, w / 2, h / 2, R, clamp(g, 0, 1), -Math.PI / 2);
}
const calm = () => !S.profile.prefs.motion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function growCrystal(cv, key, from, to, ms) {
  if (calm()) return drawCrystal(cv, key, to);
  const t0 = performance.now();
  const step = t => {
    if (!cv.isConnected) return;
    const k = clamp((t - t0) / ms, 0, 1), e = 1 - Math.pow(1 - k, 3);
    drawCrystal(cv, key, from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function drawCrystals(root) {
  $$('canvas[data-crystal]', root || document).forEach(cv => {
    const g = parseFloat(cv.dataset.g) || 0;
    if (cv.dataset.from != null && !cv._grown) { cv._grown = true; growCrystal(cv, cv.dataset.crystal, parseFloat(cv.dataset.from) || 0, g, 1400); }
    else drawCrystal(cv, cv.dataset.crystal, g);
  });
}

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
    const t0 = performance.now(), rot = Math.random() * Math.PI, R = 52 + 44 * power;
    parts.push({ t0, life: 640 + 180 * power, draw(c, k) {
      const e = 1 - Math.pow(1 - k, 3);
      c.save(); c.translate(x, y); c.rotate(rot + e * 0.22);
      c.globalAlpha = (1 - k) * 0.9; c.strokeStyle = cols[2]; c.lineWidth = 1.6; c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a), r1 = R * e;
        c.moveTo(ca * r1 * 0.25, sa * r1 * 0.25); c.lineTo(ca * r1, sa * r1);
        for (const f of [0.55, 0.8]) {
          const bx = ca * r1 * f, by = sa * r1 * f, bl = R * 0.24 * e * (1.2 - f);
          for (const s of [-1, 1]) { const b = a + s * Math.PI / 3; c.moveTo(bx, by); c.lineTo(bx + Math.cos(b) * bl, by + Math.sin(b) * bl); }
        }
      }
      c.stroke(); c.restore();
    } });
    const n = Math.round(10 + 12 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (60 + Math.random() * 150) * (0.7 + power * 0.5), sz = 3 + Math.random() * 5;
      const col = cols[i % 4], spin = (Math.random() - 0.5) * 8, r0 = Math.random() * Math.PI;
      parts.push({ t0: t0 + Math.random() * 60, life: 520 + Math.random() * 380, draw(c, k) {
        const e = 1 - Math.pow(1 - k, 2.4), d = sp * e;
        c.save(); c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d + 60 * k * k); c.rotate(r0 + spin * k);
        c.globalAlpha = 1 - k * k; c.fillStyle = col;
        c.beginPath(); c.moveTo(0, -sz); c.lineTo(sz * 0.55, 0); c.lineTo(0, sz); c.lineTo(-sz * 0.55, 0); c.closePath(); c.fill();
        c.restore();
      } });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  return { burst };
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
    const tone = (f, d, g0, type, at) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.linearRampToValueAtTime(g0, t + at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
      o.connect(g); g.connect(actx.destination);
      o.start(t + at); o.stop(t + at + d + 0.03);
    };
    if (ok) { tone(1318.5, 0.5, 0.07, 'sine', 0); tone(1975.5, 0.6, 0.045, 'sine', 0.06); tone(2637, 0.4, 0.02, 'sine', 0.11); }
    else tone(185, 0.24, 0.05, 'triangle', 0);
  } catch (e) {}
}
function buzz(ok) {
  if (!S.profile.prefs.haptic || !navigator.vibrate) return;
  try { navigator.vibrate(ok ? 12 : [18, 40, 18]); } catch (e) {}
}
