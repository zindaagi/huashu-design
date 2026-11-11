/* ----- flashcards: flip through a deck to learn it, before being tested on it -----
   Nothing here touches recall scores. Cards marked "still learning" come round again until every one is known. */
function startFlash(did, o) {
  o = o || {};
  return Store.loadCards(did).then(cards => {
    let pool = cards.slice();
    if (o.only) { const set = new Set(o.only); pool = pool.filter(c => set.has(c.id)); }
    else if (o.topics && o.topics.length) pool = pool.filter(c => o.topics.includes(c.topic || 'General'));
    if (!pool.length) { toast(cards.length ? 'No questions match that selection.' : 'This deck has no questions yet.'); return; }
    const mix = o.shuffle != null ? !!o.shuffle : !!UI.fshuf;
    const ids = pool.map(c => c.id);
    UI.sess = null; UI.done = null;
    UI.flash = {
      did, by: Object.fromEntries(pool.map(c => [c.id, c])), total: pool.length, opts: { only: o.only || null, topics: o.topics || [] },
      queue: mix ? shuffle(ids) : ids, i: 0, flipped: false, again: [], second: new Set(), got: 0, round: 1, mix, hist: [], t0: now(), end: false
    };
    setActive(did);
    followDeck(did);
    Chat.flashTh = null;
    if (Chat.open) closeChat();
    go('study');
  }, () => toast('This deck could not be loaded. Check your connection.'));
}
const flashCard = () => { const f = UI.flash; return f && !f.end ? f.by[f.queue[f.i]] : null; };
function flashTopHTML(f) {
  const known = f.got, p = Math.round(known / f.total * 100);
  return `<button class="btn sm ghost" data-act="fc-end">${ic('x')}<span>End</span></button>
    <div class="run-mid"><div class="meter"><i style="width:${p}%"></i></div><span class="num" title="Cards you know, of all cards">${known}/${f.total}</span></div>
    <button class="btn sm${f.mix ? ' on' : ''}" data-act="fc-mix" aria-pressed="${f.mix}" title="Shuffle the cards still to come">Shuffle</button>
    <button class="btn sm" data-act="ask-claude" ${aiOK() ? '' : 'disabled'}>${faceHTML('xs')}<span>Ask</span></button>`;
}
function flashActsHTML(f) {
  const back = f.hist.length ? '<button class="btn ghost" data-act="fc-back">Back a card</button>' : '';
  return f.flipped
    ? `<button class="btn lg" data-act="fc-mark" data-g="0">Still learning</button><button class="btn pri lg" data-act="fc-mark" data-g="1">Got it${ic('arrow')}</button>${back}`
    : `<button class="btn pri lg" data-act="fc-flip">Show answer</button>${back}`;
}
function flashCardHTML(f, card) {
  const again = f.second.has(card.id);
  return `<div class="fc-in${f.flipped ? ' flipped' : ''}" id="fc-in">
      <div class="fc-face fc-front" ${f.flipped ? 'aria-hidden="true"' : ''}>
        <div class="q-meta"><span class="lbl">${esc(card.topic || 'General')}</span>${again ? '<span class="tag">Again</span>' : ''}</div>
        <h2 class="q-text">${esc(card.q)}</h2>
        <span class="fc-hint lbl">${coarse() ? 'Tap to flip' : 'Click or press space to flip'}</span>
      </div>
      <div class="fc-face fc-back" ${f.flipped ? '' : 'aria-hidden="true"'}>
        <div class="q-meta"><span class="lbl">Answer</span></div>
        <h2 class="q-text fc-a">${esc(card.a)}</h2>
        ${card.why ? `<p class="fc-why">${esc(card.why)}</p>` : ''}
        <p class="fc-q lbl">${esc(card.q)}</p>
      </div>
    </div>`;
}
// where you are, and the quick ways to mark a card: arrow keys with a keyboard, a sideways swipe on a touch screen
const flashFoot = f => S.decks[f.did].name + ' · card ' + (f.i + 1) + ' of ' + f.queue.length + (f.round > 1 ? ' · round ' + f.round : '') + (coarse() ? ' · swipe ← still learning, → got it' : ' · ← still learning · → got it');
function viewFlash() {
  const f = UI.flash;
  if (f.end) return viewFlashDone();
  const card = flashCard();
  return `<div class="run fcrun">
    <header class="run-top" id="run-top">${flashTopHTML(f)}</header>
    <div class="fc" id="fc" data-act="fc-flip" role="button" tabindex="0" aria-label="Flashcard. Activate to flip.">${flashCardHTML(f, card)}</div>
    <div class="fc-acts" id="fc-acts">${flashActsHTML(f)}</div>
    <p class="lbl" style="text-align:center">${esc(flashFoot(f))}</p>
  </div>`;
}
function viewFlashDone() {
  const f = UI.flash, d = S.decks[f.did], twice = f.second.size, first = f.total - twice;
  return `<div class="fin">
    <section class="fin-top">
      <canvas class="fin-art" data-bolt="${f.did}" data-g="1" data-from="0.2"></canvas>
      <p class="lbl">Flashcards done · ${esc(d ? d.name : 'Deck')}</p>
      <h1 class="fin-score" aria-label="${first} known first time, ${twice} needed another look"><span class="g" data-count="${first}">${first}</span><i>:</i><span class="b" data-count="${twice}">${twice}</span></h1>
      <dl class="stats">
        <div><dt>Knew first time</dt><dd>${first}</dd></div>
        <div><dt>Needed another look</dt><dd>${twice}</dd></div>
        <div><dt>Rounds</dt><dd>${f.round}</dd></div>
        <div><dt>Time</dt><dd style="font-size:20px;padding-top:6px">${dur(now() - f.t0)}</dd></div>
      </dl>
      <p class="note">Flashcards do not change your recall scores. The quiz is where it counts.</p>
      <div class="chips">
        <button class="btn pri lg" data-act="fc-quiz">${ic('bolt')}Quiz me on these</button>
        ${twice ? '<button class="btn lg" data-act="fc-redo" data-only="1">Flip the ' + twice + ' again</button>' : ''}
        <button class="btn lg" data-act="fc-redo">Flip through again</button>
        <button class="btn lg ghost" data-act="fc-home">Home</button>
      </div>
    </section>
  </div>`;
}
/* the card is repainted on its own, so a flip turns and a new card slides in without the page re-entering */
function paintFlash(slide) {
  const f = UI.flash, box = $('#fc');
  if (!f || f.end || !box) return render();
  const card = flashCard();
  box.innerHTML = flashCardHTML(f, card);
  if (slide && !calm()) { box.classList.remove('in', 'in-back'); void box.offsetWidth; box.classList.add(slide < 0 ? 'in-back' : 'in'); }
  $('#fc-acts').innerHTML = flashActsHTML(f);
  const top = $('#run-top');
  if (top) { top.innerHTML = flashTopHTML(f); drawFaces(top); }
  const foot = box.parentElement.querySelector(':scope > p.lbl');
  if (foot) foot.textContent = flashFoot(f);
  if ($('#main').scrollTop > 0) $('#main').scrollTop = 0;
}
function flashFlip() {
  const f = UI.flash, inn = $('#fc-in');
  if (!f || f.end || !inn) return;
  f.flipped = !f.flipped;
  inn.classList.toggle('flipped', f.flipped);
  const faces = $$('.fc-face', inn);
  if (faces[0]) { if (f.flipped) faces[0].setAttribute('aria-hidden', 'true'); else faces[0].removeAttribute('aria-hidden'); }
  if (faces[1]) { if (f.flipped) faces[1].removeAttribute('aria-hidden'); else faces[1].setAttribute('aria-hidden', 'true'); }
  $('#fc-acts').innerHTML = flashActsHTML(f);
  if (f.flipped) setFace('think', 1600);
}
function flashMark(got) {
  const f = UI.flash;
  if (!f || f.end) return;
  if (!f.flipped) return flashFlip();
  const id = f.queue[f.i];
  f.hist.push({ queue: f.queue, i: f.i, again: f.again.slice(), second: new Set(f.second), got: f.got, round: f.round });
  if (f.hist.length > 60) f.hist.shift();
  if (got) f.got++; else { f.again.push(id); f.second.add(id); }
  f.i++; f.flipped = false;
  if (f.i >= f.queue.length) {
    if (!f.again.length) return flashFinish();
    f.queue = f.mix ? shuffle(f.again) : f.again; f.again = []; f.i = 0; f.round++;
  }
  setFace(got ? 'smirk' : 'deadpan', 1400);
  paintFlash(1);
}
function flashBack() {
  const f = UI.flash, h = f && f.hist.pop();
  if (!h) return;
  Object.assign(f, h, { flipped: false, end: false });
  paintFlash(-1);
}
function flashMix() {
  const f = UI.flash;
  if (!f || f.end) return;
  f.mix = UI.fshuf = !f.mix;
  // only the cards still to come are reordered; the one in front of you stays
  const head = f.queue.slice(0, f.i + 1), tail = f.queue.slice(f.i + 1), at = {};
  Object.keys(f.by).forEach((id, n) => { at[id] = n; });
  f.queue = head.concat(f.mix ? shuffle(tail) : tail.sort((a, b) => at[a] - at[b]));
  f.hist = [];
  paintFlash(0);
  toast(f.mix ? 'Shuffled the cards still to come' : 'Back in deck order');
}
function flashFinish() {
  const f = UI.flash;
  f.end = true;
  if (Chat.open) closeChat();
  render(true);
  $('#main').scrollTop = 0;
  setFace(f.second.size ? 'smirk' : 'hype', 2600);
  if (!calm()) setTimeout(() => FX.burst(window.innerWidth / 2, window.innerHeight * 0.3, 0.7), 240);
}
function flashThread() {
  const f = UI.flash;
  return Chat.flashTh || (Chat.flashTh = { kind: 'flash', did: f.did, turns: [], cur: () => { const c = flashCard(); return c ? { card: c, flipped: UI.flash.flipped } : null; } });
}
const FLASH_ACT = {
  flash: () => { const did = activeDeck(); if (did) startFlash(did); },
  'deck-flash': () => { if (UI.lib.did) startFlash(UI.lib.did); },
  'st-flash': () => { const su = UI.setup; if (su) startFlash(su.did, { topics: su.topics }); },
  'flash-misses': () => { const r = UI.done; if (r && r.misses.length) startFlash(r.did, { only: r.misses.map(m => m.id), shuffle: false }); },
  'fc-flip': () => { if (now() - (UI.fswipe || 0) > 450) flashFlip(); },
  'fc-mark': el => flashMark(el.dataset.g === '1'),
  'fc-back': () => flashBack(),
  'fc-mix': () => flashMix(),
  'fc-end': () => { UI.flash = null; if (Chat.open) closeChat(); go('home'); },
  'fc-quiz': () => { const f = UI.flash; UI.flash = null; startSession({ did: f.did, only: f.opts.only || undefined, topics: f.opts.topics, mode: 'quiz', len: Math.min(f.total, 20) }); },
  'fc-redo': el => { const f = UI.flash; startFlash(f.did, el.dataset.only ? { only: Array.from(f.second) } : f.opts.only ? { only: f.opts.only } : { topics: f.opts.topics }); },
  'fc-home': () => { UI.flash = null; go('home'); }
};
/* keys: space or enter flips, right arrow is "got it", left arrow is "still learning" */
document.addEventListener('keydown', e => {
  const f = UI.flash, t = e.target, tag = t && t.tagName;
  if (!f || f.end || UI.route !== 'study' || UI.sheet || Chat.open || e.metaKey || e.ctrlKey || e.altKey) return;
  const onCard = t && t.id === 'fc';
  if (/^(INPUT|TEXTAREA|SELECT|A)$/.test(tag || '') || (tag === 'BUTTON' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); flashFlip(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); flashMark(true); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (f.flipped) flashMark(false); else if (onCard || f.hist.length) flashBack(); }
});
/* a sideways swipe on a flipped card marks it: right is "got it", left is "still learning" */
(() => {
  let x0 = 0, y0 = 0, on = false;
  document.addEventListener('touchstart', e => { const t = e.target.closest && e.target.closest('#fc'); on = !!t && e.touches.length === 1; if (on) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!on) return;
    on = false;
    const f = UI.flash, c = e.changedTouches[0];
    if (!f || f.end || !f.flipped || !c) return;
    const dx = c.clientX - x0, dy = c.clientY - y0;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    UI.fswipe = now();
    flashMark(dx > 0);
  }, { passive: true });
})();
