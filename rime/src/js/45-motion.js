/* ---------- pointer-driven motion: 3D tilt, glare, cursor glow, ripples, entrances ----------
   Everything here is decoration: it is skipped when animation is switched off or the system asks for reduced motion,
   and the tilt, glow and hover flashes only run for a mouse (touch gets ripples and entrances). */
const TILT = [['.stab', 14], ['.deck', 10], ['.subcard', 9], ['.sj-prev', 6], ['.hero', 3.2], ['.fin-top', 2.4]];
(() => {
  const fine = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : { matches: false };
  let ev = null, raf = 0, cur = null, spot = null, glow = null, graf = 0, seen = false, gx = 0, gy = 0, tx = 0, ty = 0;
  const release = el => {
    if (!el) return;
    el.classList.remove('tilting');
    ['--rx', '--ry', '--px', '--py'].forEach(p => el.style.removeProperty(p));
  };
  const unspot = () => { if (spot) { spot.style.removeProperty('--sx'); spot.style.removeProperty('--sy'); spot = null; } };
  function frame() {
    raf = 0;
    const e = ev, t = e && e.target && e.target.closest && e.target.isConnected ? e.target : null;
    let el = null, max = 0;
    if (t) for (const pair of TILT) { const m = t.closest(pair[0]); if (m) { el = m; max = pair[1]; break; } }
    if (cur && (cur !== el || !cur.isConnected)) { release(cur); cur = null; }
    if (el) {
      if (cur !== el) { cur = el; el.classList.add('tilting'); }
      // lean toward the cursor, and tell the element where the cursor is so its glare and inner layers can follow
      const r = el.getBoundingClientRect(), px = clamp((e.clientX - r.left) / r.width, 0, 1), py = clamp((e.clientY - r.top) / r.height, 0, 1), s = el.style;
      s.setProperty('--ry', ((px - 0.5) * 2 * max).toFixed(2) + 'deg');
      s.setProperty('--rx', ((0.5 - py) * 2 * max).toFixed(2) + 'deg');
      s.setProperty('--mx', (px * 100).toFixed(1) + '%');
      s.setProperty('--my', (py * 100).toFixed(1) + '%');
      s.setProperty('--px', ((px - 0.5) * 2).toFixed(3));
      s.setProperty('--py', ((py - 0.5) * 2).toFixed(3));
    }
    const card = t ? t.closest('.card, .q') : null;
    if (spot !== card) unspot();
    if (card) {
      spot = card;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--sx', Math.round(e.clientX - r.left) + 'px');
      card.style.setProperty('--sy', Math.round(e.clientY - r.top) + 'px');
    }
  }
  function follow() {
    graf = 0;
    gx += (tx - gx) * 0.16; gy += (ty - gy) * 0.16;
    glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
    if (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.6) graf = requestAnimationFrame(follow);
  }
  const leave = () => {
    release(cur); cur = null; ev = null; unspot();
    if (glow) glow.classList.remove('on');
    seen = false;
  };
  document.addEventListener('pointermove', e => {
    // a real mouse is enough: touch-screen laptops can report a coarse main pointer while a mouse is in use
    if (e.pointerType !== 'mouse') return;
    if (calm()) { if (cur || seen) leave(); return; }
    ev = e;
    if (!raf) raf = requestAnimationFrame(frame);
    glow = glow || $('#glow');
    if (!glow) return;
    tx = e.clientX; ty = e.clientY;
    if (!seen) { seen = true; gx = tx; gy = ty; glow.classList.add('on'); }
    if (!graf) graf = requestAnimationFrame(follow);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);

  // lightning flashes down a deck's or subject's bolt as the cursor arrives
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse' || calm() || !e.target.closest) return;
    const host = e.target.closest('.subcard, .deck, .hero, .rank, .fin-top');
    if (!host || (e.relatedTarget && host.contains(e.relatedTarget))) return;
    const cv = $('canvas[data-bolt]', host);
    if (cv) flashBolt(cv);
  }, { passive: true });

  // a spark spreads from wherever a control is pressed
  document.addEventListener('pointerdown', e => {
    if (calm() || !e.target.closest) return;
    const el = e.target.closest('.btn, .chip, .opt, .stab, .deck, .subcard, .tabs a');
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect(), s = document.createElement('span');
    s.className = 'rip';
    s.style.left = (e.clientX - r.left) + 'px';
    s.style.top = (e.clientY - r.top) + 'px';
    el.appendChild(s);
    setTimeout(() => s.remove(), 620);
  }, { passive: true });
})();

function flashBolt(cv) {
  const t0 = performance.now();
  if (calm() || (cv._flash && t0 - cv._flash < 700)) return;
  cv._flash = t0;
  const key = cv.dataset.bolt, g = parseFloat(cv.dataset.g) || 0;
  const step = t => {
    if (!cv.isConnected) return;
    const k = (t - t0) / 560;
    if (k >= 1) return drawBolt(cv, key, g);
    drawBolt(cv, key, g, { flash: (1 - k) * (0.6 + 0.4 * Math.sin(k * 44)), reach: Math.min(1, k / 0.22) });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function countUp(el) {
  const to = parseFloat(el.dataset.count), node = el.firstChild;
  if (!isFinite(to) || to <= 0 || !node || node.nodeType !== 3) return;
  const t0 = performance.now();
  const step = t => {
    if (!el.isConnected) return;
    const k = clamp((t - t0) / 750, 0, 1);
    node.nodeValue = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/* a freshly opened screen rises into place piece by piece; meters, rings and bars fill as it lands */
let enterT = 0;
function playEnter(v) {
  if (calm()) return;
  const els = [];
  for (const el of Array.from(v.children)) { if (el.classList.contains('home')) els.push.apply(els, Array.from(el.children)); else els.push(el); }
  els.push.apply(els, $$('.subgrid > *, .deckgrid > *', v));
  els.forEach((el, i) => { el.classList.add('enter-item'); el.style.animationDelay = Math.min(i, 14) * 42 + 'ms'; });
  v.classList.add('enter');
  clearTimeout(enterT);
  enterT = setTimeout(() => {
    v.classList.remove('enter');
    els.forEach(el => { el.classList.remove('enter-item'); el.style.animationDelay = ''; });
  }, 1250);
  $$('[data-count]', v).forEach(countUp);
}
/* changing subject: a charge runs along the tab strip and the logo jolts while the colours morph */
function zap() {
  if (calm()) return;
  const app = $('#app');
  app.classList.remove('zapped');
  void app.offsetWidth;
  app.classList.add('zapped');
  clearTimeout(zap.t);
  zap.t = setTimeout(() => app.classList.remove('zapped'), 760);
}
