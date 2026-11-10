/* ---------- behaviour ---------- */
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), ms || 2800);
}
let lookSig = '';
function applyLook(force) {
  const p = S.profile.prefs, r = document.documentElement, sj = S.subs[curSub()], c = sj && okHex(sj.c) ? sj.c : '';
  const sig = [p.look, p.a1, p.a2, p.flat, p.motion, c, r.getAttribute('data-theme'), window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches].join('|');
  if (sig === lookSig && !force) return;
  lookSig = sig;
  r.classList.toggle('look-dark', p.look === 'dark');
  r.classList.toggle('look-light', p.look === 'light');
  r.classList.toggle('calm', !p.motion);
  // the subject in view themes everything; the base colour covers the All tab and unsorted decks
  const a1 = c || p.a1, a2 = p.flat ? a1 : (c ? partner(c) : p.a2), on = onColor(a1, a2);
  r.style.setProperty('--a1', a1);
  r.style.setProperty('--a2', a2);
  r.style.setProperty('--on', on);
  r.style.setProperty('--onx', on === '#ffffff' ? '#0a0e14' : '#ffffff');
  r.style.removeProperty('--ink');
  r.style.setProperty('--ink', readable(a1, getComputedStyle(r).getPropertyValue('--bg').trim() || '#0a0e14'));
  try { localStorage.setItem('rime:look', JSON.stringify({ look: p.look, a1: p.a1, a2: p.a2, flat: p.flat, motion: p.motion, preset: p.preset })); } catch (e) {}
  drawBolts();
}

/* ----- subjects ----- */
function selectSub(id) {
  const want = id === '_' ? '_' : (S.subs[id] ? id : null);
  if (UI.route === 'library' && UI.lib.mode === 'new' && UI.nd) {
    // mid-form: keep what has been typed and just file the new deck under the tapped subject
    UI.nd.sub = S.subs[want] ? want : '';
    S.profile.sub = want; Store.touchActive(); applyLook(); paintSubs(); paintNewDeck(); zap();
    return;
  }
  S.profile.sub = want;
  Store.touchActive();
  UI.setup = null; UI.learn = null;
  if (UI.route === 'library') UI.lib = { mode: 'list', did: null, q: '' };
  applyLook();
  zap();
  if (UI.route === 'prefs' || (UI.route === 'study' && UI.done && !UI.sess)) { UI.done = null; go('home'); }
  else { render(true); $('#main').scrollTop = 0; }
}
// keep the tab and theme on the subject of the deck being opened
function followDeck(did) {
  const s = subOf(S.decks[did]), want = s === '_' ? (subIds().length ? '_' : null) : s;
  if ((S.profile.sub || null) === want) return;
  S.profile.sub = want;
  Store.touchActive();
  applyLook();
  paintSubs();
  zap();
}
function subjectSheet(id) {
  const s = id ? S.subs[id] : null;
  let c = s && okHex(s.c) ? s.c : SUB_COLORS[subIds().length % SUB_COLORS.length];
  const paint = () => {
    $('#sj-sw').innerHTML = SUB_COLORS.map(x => `<button class="sw" data-act="sj-color" data-c="${x}" aria-pressed="${x === c}" aria-label="Colour ${x}"><i style="background:${x}"></i></button>`).join('');
    $('#sj-c').value = c;
    $('#sj-prev').style.cssText = subStyle(c, S.profile.prefs.flat);
  };
  const acts = [];
  if (s) acts.push({ label: 'Delete', cls: 'danger', fn: () => confirmSheet('Delete ' + s.name + '?', 'The tab goes away. Its ' + plural(deckIds(id).length, 'deck') + ' and all progress are kept and move to Unsorted.', 'Delete subject', async () => { closeSheet(); await Store.deleteSub(id); applyLook(); render(); toast('Subject deleted'); }, true) });
  acts.push({ label: 'Cancel', cls: 'ghost' }, { label: s ? 'Save' : 'Add subject', cls: 'pri', fn: () => {
    const name = str($('#sj-name').value, 32);
    if (!name) { toast('Give the subject a name.'); return false; }
    closeSheet();
    if (s) { s.name = name; s.c = c; Store.saveSub(id); applyLook(true); render(); return; }
    const nid = mkid('j'), order = subIds().reduce((m, x) => Math.max(m, S.subs[x].o || 0), -1) + 1;
    S.subs[nid] = { k: 'sub', id: nid, name, c, o: order, t: now() };
    Store.saveSub(nid);
    selectSub(nid);
  } });
  openSheet({
    title: s ? 'Edit subject' : 'New subject',
    html: `<div class="sj-prev" id="sj-prev">${ic('bolt')}<b id="sj-prev-name">${esc(s ? s.name : 'New subject')}</b></div>
      <label class="field"><span class="lbl">Name</span><input class="inp" id="sj-name" maxlength="32" value="${esc(s ? s.name : '')}" placeholder="Chemistry"></label>
      <div class="field"><span class="lbl">Colour</span><div class="swatches" id="sj-sw"></div><label class="color"><input type="color" id="sj-c">Any other colour</label></div>
      <p class="note">The subject gets its own tab, and everything inside it takes this colour.</p>`,
    onOpen: paint, setC(x) { if (okHex(x)) { c = x; paint(); } }, acts
  });
}

/* ----- sheets ----- */
function openSheet(o) {
  UI.sheet = o;
  $('#sheet-root').innerHTML = `<div class="sheet-wrap" data-act="sheet-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(o.title)}"><h2>${esc(o.title)}</h2>${o.html || ''}<div class="sheet-acts">${(o.acts || []).map((a, i) => `<button class="btn ${a.cls || ''}" data-act="sheet-do" data-i="${i}">${esc(a.label)}</button>`).join('')}</div></div></div>`;
  if (o.onOpen) o.onOpen($('.sheet'));
  const f = $('.sheet input:not([type=file]), .sheet textarea');
  if (f && !coarse()) f.focus();
}
function closeSheet() { UI.sheet = null; $('#sheet-root').innerHTML = ''; }
function confirmSheet(title, text, label, fn, danger) {
  openSheet({ title, html: '<p class="note">' + esc(text) + '</p>', acts: [{ label: 'Cancel', cls: 'ghost' }, { label, cls: danger ? 'danger' : 'pri', fn }] });
}

/* ----- routing ----- */
function go(route) { if (location.hash !== '#' + route) location.hash = route; else onRoute(); }
function onRoute() {
  const r = (location.hash || '#home').slice(1);
  UI.route = NAV.some(n => n[0] === r) ? r : 'home';
  // a finished build is only worth showing while you are still on it
  if (UI.route === 'library' && UI.lib.mode === 'build' && !(UI.build && UI.build.status === 'run' && !UI.build.quiet)) UI.lib.mode = S.decks[UI.lib.did] ? 'deck' : 'list';
  render(true);
  $('#main').scrollTop = 0;
  focusAnswer();
}
function focusAnswer() {
  const c = UI.sess && UI.sess.cur;
  if (UI.route !== 'study' || !c || c.fmt !== 'sa' || c.state !== 'ask' || Chat.open || UI.sheet) return;
  const el = $('#sa-in');
  if (el) el.focus({ preventScroll: true });
}

/* ----- sessions ----- */
async function startSession(o) {
  const cfg = Object.assign({}, S.profile.study, o);
  let cards;
  try { cards = await Store.loadCards(o.did); } catch (e) { toast('This deck could not be loaded. Check your connection.'); return; }
  let pool = cards;
  if (o.only) { const set = new Set(o.only); pool = cards.filter(c => set.has(c.id)); }
  else if (o.topics && o.topics.length) pool = cards.filter(c => o.topics.includes(c.topic || 'General'));
  if (!pool.length) { toast('No questions match that selection.'); return; }
  if (!cfg.mc && !cfg.sa) cfg.mc = true;
  UI.done = null;
  UI.sess = {
    did: o.did, mode: cfg.mode, want: cfg.len, len: Math.min(cfg.len, pool.length), mc: cfg.mc, sa: cfg.sa, focus: cfg.focus,
    topup: !!cfg.topup && !o.only, topics: o.topics || [], only: o.only || null, pool: pool.slice(),
    n: 0, asked: new Set(), recent: [], again: new Map(), streak: 0, best: 0, right: 0, wrong: 0, close: 0, xp: 0,
    t0: now(), log: [], cur: null, newRun: 0, topups: 0, lastTop: 0, before: deckStats(o.did).mastery
  };
  setActive(o.did);
  followDeck(o.did);
  Chat.quiz = null;
  if (Chat.open) closeChat();
  nextQuestion(true);
  go('study');
}
function nextQuestion(quiet) {
  const s = UI.sess;
  if (!s) return;
  if (s.mode === 'quiz' && s.n >= s.len) return finishSession();
  const card = pickNext(s);
  if (!card) return finishSession();
  const p = (S.prog[s.did] || {})[card.id], seen = !!(p && p[P.SEEN]);
  let fmt = chooseFmt(s, card, p), opts = null;
  if (fmt === 'mc') { opts = buildOptions(s.did, card); if (!opts || opts.length < 2) { fmt = 'sa'; opts = null; } }
  s.cur = { card, fmt, opts, right: opts ? opts.indexOf(String(card.a)) : -1, pick: -1, state: 'ask', user: '', isNew: !seen, due: seen && p[P.DUE] <= now(), again: s.again.has(card.id), verdict: null, gain: 0, note: '' };
  s.newRun = seen ? 0 : s.newRun + 1;
  s.recent.push(card.id);
  while (s.recent.length > Math.min(3, s.pool.length - 1)) s.recent.shift();
  if (!quiet) { render(); focusAnswer(); const q = $('#q'); if (q && $('#main').scrollTop > 0) $('#main').scrollTop = 0; }
  maybeTopup(s);
}
function pickOption(i) {
  const s = UI.sess, c = s && s.cur;
  if (!c || c.state !== 'ask' || c.fmt !== 'mc' || c.opts[i] == null) return;
  c.pick = i; c.user = c.opts[i];
  settle(i === c.right ? { g: 2, kind: 'correct' } : { g: 0, kind: 'wrong' });
}
async function submitTyped(text) {
  const s = UI.sess, c = s && s.cur;
  if (!c || c.fmt !== 'sa') return;
  if (c.state === 'done') return nextQuestion();
  if (c.state !== 'ask') return;
  text = String(text || '').trim();
  if (!text) { const el = $('#sa-in'); if (el) el.focus(); return; }
  c.user = text;
  const v = gradeLocal(c.card, text, otherAnswers(s.did, c.card), S.profile.prefs.typo);
  if (v.kind !== 'unsure') return settle(v);
  if (!aiOK()) { c.state = 'self'; return paintAnswer(false); }
  c.state = 'checking';
  paintAnswer(false);
  const live = () => UI.sess === s && s.cur === c && c.state === 'checking';
  try {
    const r = await aiJudge(c.card, text);
    if (!live()) return;
    settle(r.verdict === 'correct' ? { g: 3, kind: 'correct', note: r.note } : r.verdict === 'close' ? { g: 1, kind: 'close', note: r.note } : { g: 0, kind: 'wrong', note: r.note });
  } catch (e) {
    if (!live()) return;
    c.state = 'self';
    c.note = (e && e.code === 'invalid_json' ? 'The marking came back unreadable.' : aiErr(e) || 'Marking was interrupted.') + ' Mark this one yourself.';
    paintAnswer(false);
  }
}
function settle(v) {
  const c = UI.sess.cur;
  c.state = 'done'; c.verdict = v;
  applyResult(v.g);
  paintAnswer(true);
}
function applyResult(g) {
  const s = UI.sess, c = s.cur, id = c.card.id, ok = g >= 2;
  const cur = (S.prog[s.did] || {})[id];
  c.undo = { p: cur ? cur.slice() : null, streak: s.streak, best: s.best, again: s.again.get(id), asked: s.asked.has(id) };
  review(s.did, id, g, c.fmt);
  c.gain = ok ? (c.fmt === 'sa' ? 12 : 8) + Math.min(s.streak, 10) : g === 1 ? 4 : 0;
  if (ok) { s.right++; s.streak++; s.best = Math.max(s.best, s.streak); } else { if (g === 1) s.close++; else s.wrong++; s.streak = 0; }
  s.xp += c.gain; s.n++;
  const d = today();
  d.n++; if (ok) d.c++; d.x += c.gain;
  s.log.push({ id, g, user: c.user });
  s.asked.add(id);
  if (!ok && s.mode === 'endless') s.again.set(id, s.n + 3 + Math.floor(Math.random() * 2)); else s.again.delete(id);
  Store.progDirty(s.did, id);
  Store.saveProfile();
}
function revertResult() {
  const s = UI.sess, c = s.cur, id = c.card.id, u = c.undo, g = c.verdict.g, ok = g >= 2;
  if (u.p) S.prog[s.did][id] = u.p; else delete S.prog[s.did][id];
  if (ok) s.right--; else if (g === 1) s.close--; else s.wrong--;
  s.streak = u.streak; s.best = u.best; s.xp -= c.gain; s.n--;
  const d = today();
  d.n = Math.max(0, d.n - 1); if (ok) d.c = Math.max(0, d.c - 1); d.x = Math.max(0, d.x - c.gain);
  s.log.pop();
  if (!u.asked) s.asked.delete(id);
  if (u.again != null) s.again.set(id, u.again); else s.again.delete(id);
}
function overrideMark(g) {
  const s = UI.sess, c = s && s.cur;
  if (!c || c.state !== 'done') return;
  revertResult();
  c.verdict = { g, kind: g >= 2 ? 'correct' : 'wrong', note: g >= 2 ? 'Counted as correct on your say.' : 'Counted as wrong.' };
  applyResult(g);
  paintAnswer(g >= 2);
}
function selfMark(g) {
  const s = UI.sess, c = s && s.cur;
  if (!c || c.state !== 'self') return;
  c.note = '';
  settle({ g, kind: g >= 2 ? 'correct' : g === 1 ? 'close' : 'wrong' });
}
function paintAnswer(celebrate) {
  const s = UI.sess, c = s.cur;
  const top = $('#run-top');
  if (top) top.innerHTML = runTopHTML(s);
  let anchor = null;
  if (c.fmt === 'mc') {
    const box = $('#opts');
    if (box) {
      box.classList.toggle('locked', c.state !== 'ask');
      const els = $$('.opt', box);
      els.forEach((el, i) => { el.className = 'opt' + optCls(c, i); });
      anchor = els[c.right] || box;
    }
  } else {
    const form = $('#sa-form'), inp = $('#sa-in'), btn = $('#sa-go'), idk = $('#idk');
    if (form) {
      form.className = 'sa' + saCls(c);
      inp.readOnly = c.state !== 'ask';
      if (c.state !== 'ask' && inp.value !== c.user) inp.value = c.user;
      btn.textContent = c.state === 'done' ? 'Next' : 'Check';
      btn.disabled = c.state === 'checking' || c.state === 'self';
      anchor = form;
    }
    if (idk) idk.hidden = c.state !== 'ask';
  }
  const fb = $('#fb');
  if (fb) fb.innerHTML = fbHTML(c);
  if (c.state === 'done' && celebrate) reward(c, anchor);
  if (c.state === 'done' && c.fmt === 'mc' && !coarse()) { const nb = $('#next-btn'); if (nb) nb.focus({ preventScroll: true }); }
  if (c.state !== 'ask' && fb) {
    const r = fb.getBoundingClientRect(), m = $('#main').getBoundingClientRect();
    if (r.bottom > m.bottom) fb.scrollIntoView({ block: 'end', behavior: calm() ? 'auto' : 'smooth' });
  }
}
function reward(c, anchor) {
  const s = UI.sess, ok = c.verdict.g >= 2;
  ping(ok); buzz(ok);
  if (!ok || !anchor) return;
  const r = anchor.getBoundingClientRect(), mile = s.streak > 0 && s.streak % 5 === 0;
  FX.burst(r.left + Math.min(r.width / 2, 170), r.top + r.height / 2, mile ? 1 : Math.min(0.2 + s.streak * 0.08, 0.7));
  xpFloat(Math.max(r.left, r.right - 76), r.top - 4, '+' + c.gain);
  const pill = $('#run-streak');
  if (pill) pill.classList.add('bump');
  if (mile) {
    const q = $('#q');
    if (q) { const el = document.createElement('div'); el.className = 'combo'; el.textContent = s.streak + ' in a row'; q.appendChild(el); setTimeout(() => el.remove(), 1600); }
  }
}
function finishSession() {
  const s = UI.sess;
  if (!s) return;
  UI.sess = null;
  if (Chat.open) closeChat();
  if (!s.n) { render(); return; }
  const by = {}, missIds = [], lastUser = {};
  for (const c of (S.cards[s.did] || [])) by[c.id] = c;
  for (const l of s.log) if (l.g < 2) { if (!missIds.includes(l.id)) missIds.push(l.id); lastUser[l.id] = l.user; }
  const d = S.decks[s.did];
  UI.done = {
    did: s.did, name: d ? d.name : 'Deck', c: s.right, w: s.wrong + s.close, xp: s.xp, best: s.best, ms: now() - s.t0,
    before: s.before, after: deckStats(s.did).mastery,
    misses: missIds.map(id => by[id]).filter(Boolean).map(c => ({ id: c.id, q: c.q, a: c.a, user: lastUser[c.id] })),
    cfg: { did: s.did, mode: s.mode, len: s.want, mc: s.mc, sa: s.sa, focus: s.focus, topics: s.topics, topup: s.topup }
  };
  S.profile.sessions.unshift({ t: now(), did: s.did, name: UI.done.name.slice(0, 40), mode: s.mode, c: UI.done.c, w: UI.done.w, x: s.xp });
  S.profile.sessions.length = Math.min(S.profile.sessions.length, 12);
  Store.saveProfile();
  Store.flush();
  render(true);
  $('#main').scrollTop = 0;
  if (UI.done.c > 0 && UI.done.c >= UI.done.w) setTimeout(() => FX.burst(window.innerWidth / 2, window.innerHeight * 0.3, 1), 260);
}
function maybeTopup(s) {
  if (s.mode !== 'endless' || !s.topup || !aiOK() || (UI.build && UI.build.status === 'run')) return;
  if (s.n < 4 || s.topups >= 4 || (s.topups && s.n - s.lastTop < 12)) return;
  const d = S.decks[s.did], prog = S.prog[s.did] || {};
  if (!d || !(d.srcs || []).length) return;
  if (s.pool.filter(c => !(prog[c.id] && prog[c.id][P.SEEN])).length > 3) return;
  s.topups++; s.lastTop = s.n;
  generate(s.did, { n: 10, topics: weakTopics(s.did, 3).map(t => t.topic), quiet: true });
}

/* ----- writing questions with Claude ----- */
async function generate(did, o) {
  o = o || {};
  if (UI.build && UI.build.status === 'run') { toast('Claude is already writing questions. Give it a moment.'); return false; }
  if (!aiOK()) { toast('Claude is not available in this view.'); return false; }
  const b = UI.build = { did, target: o.n || 20, got: 0, status: 'run', msg: 'Reading your material', recent: [], ctl: new AbortController(), quiet: !!o.quiet, topic: o.lessonTitle ? o.lessonTitle.slice(0, 40) : '' };
  paintBuild();
  let before = -1;
  try {
    const src = await Store.loadSrc(did), cards = await Store.loadCards(did), meta = S.decks[did];
    before = cards.length;
    const material = o.text != null ? o.text : src.parts.map(p => '## ' + p.name + '\n' + p.text).join('\n\n');
    if (!material.trim()) throw { code: 'no_material' };
    const secs = o.lessonTitle ? [pickExcerpts(material, o.lessonTitle + ' ' + (o.focus || ''), 12000)] : splitSections(material, 9000);
    const calls = Math.min(secs.length, Math.max(1, Math.ceil(b.target / 10)), 6);
    const start = o.text != null || o.lessonTitle ? 0 : (meta.cursor | 0) % secs.length;
    const seen = new Set(cards.map(c => norm(c.q)));
    for (let k = 0; k < calls && !b.ctl.signal.aborted; k++) {
      const want = Math.ceil((b.target - b.got) / (calls - k));
      if (want <= 0) break;
      b.msg = calls > 1 ? 'Writing from part ' + (k + 1) + ' of ' + calls : 'Writing questions';
      paintBuild();
      await aiGenerate({
        material: secs[(start + Math.floor(k * secs.length / calls)) % secs.length], syllabus: src.syllabus, n: want,
        focus: o.focus || '', topics: o.topics || [], lessonTitle: o.lessonTitle || '',
        existing: cards.slice(-50).map(c => c.q), topicNames: Array.from(new Set(cards.map(c => c.topic))).slice(0, 30), signal: b.ctl.signal,
        onCard: raw => {
          const c = cleanCard(raw);
          if (!c || b.got >= b.target + 4) return;
          const key = norm(c.q);
          if (seen.has(key)) return;
          seen.add(key);
          if (b.topic) c.topic = b.topic;
          cards.push(c);
          b.got++;
          b.recent.unshift(c.q);
          b.recent.length = Math.min(b.recent.length, 3);
          const s = UI.sess;
          if (s && s.did === did && !s.only && (!s.topics.length || s.topics.includes(c.topic))) s.pool.push(c);
          paintBuild();
        }
      });
    }
    if (o.text == null && !o.lessonTitle) meta.cursor = start + calls;
    b.status = b.ctl.signal.aborted ? 'stopped' : b.got ? 'done' : 'err';
    if (b.status === 'err') b.msg = 'Nothing usable came back. Try again, or add more material.';
  } catch (e) {
    b.status = e && e.code === 'cancelled' ? 'stopped' : 'err';
    b.msg = aiErr(e) || 'Stopped.';
  }
  const all = S.cards[did];
  if (all && before >= 0 && all.length !== before) await Store.saveCards(did, before);
  paintBuild();
  const onBuild = !b.quiet && UI.route === 'library' && UI.lib.mode === 'build' && UI.lib.did === did;
  if (b.got && (b.quiet || !onBuild)) toast(b.quiet ? '+' + b.got + ' fresh questions in play' : plural(b.got, 'question') + ' ready in ' + ((S.decks[did] || {}).name || 'your deck'));
  else if (b.status === 'err' && !onBuild && !b.quiet) toast(b.msg);
  if (!onBuild) softRender();
  return b.got > 0;
}
function paintBuild() {
  const b = UI.build, n = $('#build-n');
  if (!b || !n || b.quiet || UI.route !== 'library' || UI.lib.mode !== 'build') return;
  n.innerHTML = b.got + '<small>/ ' + b.target + '</small>';
  $('#build-msg').textContent = b.status === 'run' ? b.msg : b.status === 'done' ? plural(b.got, 'question') + ' ready' : b.status === 'stopped' ? 'Stopped at ' + b.got : b.msg;
  $('#build-log').innerHTML = b.recent.map(q => '<p>' + esc(q) + '</p>').join('');
  const cv = $('#build-art');
  if (cv) drawBolt(cv, b.did, clamp(b.got / Math.max(1, b.target), 0, 1));
  const run = b.status === 'run';
  $('#build-acts').innerHTML = `<button class="btn pri lg" data-act="build-study" ${b.got >= (run ? 4 : 1) ? '' : 'disabled'}>${ic('bolt')}Start studying</button>` +
    (run ? `<button class="btn lg" data-act="build-stop">${ic('stop')}Stop</button>` : `<button class="btn lg" data-act="build-done">Open deck</button>`);
}

/* ----- new deck ----- */
const prettyName = f => { const s = String(f).replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' ').trim(); return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 60); };
const firstLine = t => { const l = String(t).split('\n').map(x => x.replace(/^[#>\-*\s|]+/, '').trim()).find(x => x.length > 2) || ''; return l.split(/[.:;|\t]/)[0].trim().slice(0, 40); };
function openNewDeck() {
  UI.nd = { sub: S.subs[curSub()] ? curSub() : '', name: '', text: '', syl: '', files: [], count: 30, mode: 'table', touched: false, header: false, headerSet: false, both: false, table: null, busy: 0 };
  UI.lib = { mode: 'new', did: null, q: '' };
  go('library');
}
function ndTable() {
  const nd = UI.nd, ta = $('#nd-text'), txt = ta ? ta.value : nd.text;
  const ok = nd.files.filter(f => f.status === 'ok'), tab = ok.filter(f => f.kind === 'csv' || f.kind === 'tsv');
  if (txt.trim() && !ok.length) return parseTable(txt);
  if (!txt.trim() && ok.length === 1 && tab.length === 1) return parseTable(tab[0].text, tab[0].kind === 'csv' ? 'csv' : '');
  return null;
}
function paintNewDeck() {
  const nd = UI.nd, box = $('#nd-detect');
  if (!nd || !box) return;
  const sb = $('#nd-sub');
  if (sb) sb.innerHTML = subIds().length ? '<span class="lbl">Subject</span><div class="chips">' + subChips(nd.sub, 'nd-sub') + '</div>' : '';
  $('#nd-filelist').innerHTML = nd.files.map((f, i) => `<span class="file${f.status === 'err' ? ' err' : ''}">${f.status === 'busy' ? '<span class="dots"><i></i><i></i><i></i></span>' : ''}<span>${esc(f.name)}${f.status === 'err' ? ' · ' + esc(f.msg) : f.status === 'ok' ? ' · ' + Number(f.text.length).toLocaleString() + ' chars' : ' · reading'}</span><button data-act="nd-rm" data-i="${i}" aria-label="Remove ${esc(f.name)}">${ic('x')}</button></span>`).join('');
  const tb = nd.table = ndTable();
  if (tb && !nd.headerSet) nd.header = tb.header;
  const eff = tb && (nd.mode === 'table' || !aiOK()) ? 'table' : 'ai';
  if (tb) {
    const rows = tb.rows.slice(nd.header ? 1 : 0), r0 = rows[0] || ['', ''];
    box.innerHTML = `<div class="detect"><p><b>This looks like a table</b> · ${rows.length} rows, ${tb.cols} columns.</p>
      <div class="chips">${chip('Rows become cards, instantly', eff === 'table', 'nd-mode', 'data-m="table"')}${chip('Claude writes questions from it', eff === 'ai', 'nd-mode', 'data-m="ai"' + (aiOK() ? '' : ' disabled'))}</div>
      ${eff === 'table' ? `<div class="chips">${chip('First row is a header', nd.header, 'nd-opt', 'data-k="header"')}${tb.cols === 2 || !nd.header ? chip('Also ask in reverse', nd.both, 'nd-opt', 'data-k="both"') : ''}</div>
      <p class="note">First card: “${esc(String(r0[0]).slice(0, 70))}” → “${esc(String(r0[1] || '').slice(0, 70))}”</p>` : ''}</div>`;
  } else {
    box.innerHTML = aiOK() ? '' : `<div class="banner">${ic('warn')}<span>Claude is not available in this view, so it cannot write questions here. Paste a table instead, one row per line with a tab or comma between term and answer, and the rows become cards.</span></div>`;
  }
  $('#nd-count').innerHTML = eff === 'ai' && aiOK() ? `<span class="lbl">Questions to start with</span><div class="chips">${[15, 30, 60].map(n => chip(String(n), nd.count === n, 'nd-count', 'data-n="' + n + '"')).join('')}</div><p class="note">You can start studying as soon as the first few arrive, and add more at any time.</p>` : '';
  $('#nd-go').disabled = nd.busy > 0;
}
const ndDetectSoon = debounce(paintNewDeck, 350);
let readChain = Promise.resolve();
function ndAddFiles(list) {
  const nd = UI.nd;
  if (!nd) return;
  for (const file of Array.from(list).slice(0, 12)) {
    const entry = { name: file.name || 'file', status: 'busy', text: '', kind: 'text', msg: '' };
    nd.files.push(entry);
    nd.busy++;
    readChain = readChain.then(() => readFile(file)).then(r => { entry.status = 'ok'; entry.text = r.text; entry.kind = r.kind; }, e => { entry.status = 'err'; entry.msg = (e && e.message) || 'Could not be read.'; }).then(() => {
      nd.busy--;
      if (UI.nd !== nd) return;
      const nm = $('#nd-name');
      if (nm && !nm.value.trim() && entry.status === 'ok') nm.value = prettyName(entry.name);
      paintNewDeck();
    });
  }
  paintNewDeck();
}
async function readInto(file, ta) {
  toast('Reading ' + (file.name || 'file'));
  try { const r = await readFile(file); ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + r.text; toast('Added ' + Number(r.text.length).toLocaleString() + ' characters from ' + r.name); }
  catch (e) { toast((e && e.message) || 'That file could not be read.', 4200); }
}
function newDeckRecord(name, extra) {
  const did = mkid('k');
  S.decks[did] = Object.assign({ k: 'deck', id: did, name: String(name).slice(0, 60), created: now(), ut: now(), cv: 0, count: 0, chunks: 0, srcs: [], syl: 0, sylParts: 0, plan: [], cursor: 0 }, extra || {});
  S.cards[did] = []; S.src[did] = { parts: [], syllabus: '' }; S.prog[did] = {};
  setActive(did);
  return did;
}
async function ndBuild() {
  const nd = UI.nd;
  if (!nd || nd.busy) return;
  nd.text = $('#nd-text').value; nd.syl = $('#nd-syl').value; nd.name = $('#nd-name').value.trim();
  const files = nd.files.filter(f => f.status === 'ok');
  if (!nd.text.trim() && !files.length) { toast('Paste some notes or add a file first.'); return; }
  const tb = ndTable(), eff = tb && (nd.mode === 'table' || !aiOK()) ? 'table' : 'ai';
  if (eff === 'ai' && !aiOK()) { toast('Claude is not available here. Paste a table to make cards without it.', 4200); return; }
  $('#nd-go').disabled = true;
  const name = nd.name || (files[0] ? prettyName(files[0].name) : firstLine(nd.text)) || 'Untitled deck';
  const did = newDeckRecord(name, S.subs[nd.sub] ? { sub: nd.sub } : null);
  followDeck(did);
  UI.nd = null;
  try {
    await Store.saveDeck(did);
    if (nd.text.trim()) await Store.addSrc(did, files.length ? 'Pasted notes' : 'Notes', nd.text.trim());
    for (const f of files) await Store.addSrc(did, f.name, f.text);
    if (nd.syl.trim()) await Store.setSyllabus(did, nd.syl.trim());
  } catch (e) { saveFailed(e); }
  if (eff === 'table') {
    const header = nd.headerSet ? nd.header : tb.header;
    S.cards[did] = rowsToCards(tb, { header, both: nd.both, topic: name.slice(0, 40) });
    await Store.saveCards(did, 0);
    UI.lib = { mode: 'deck', did, q: '' };
    render();
    toast(plural(S.cards[did].length, 'card') + ' ready');
  } else {
    UI.lib = { mode: 'build', did, q: '' };
    generate(did, { n: nd.count });
    render();
  }
}
const SAMPLE = {
  name: 'Sample · Charge and lightning',
  syllabus: '1. Units: state the SI units of charge, current, potential difference, resistance and power.\n2. Circuits: apply Ohm’s law and P = VI; distinguish conductors from insulators.\n3. Lightning: describe how charge separates in a thundercloud and what happens during a strike.',
  notes: 'Units. Electric charge is measured in coulombs (C). Current is the rate of flow of charge and is measured in amperes (A): one ampere is one coulomb per second. Potential difference, or voltage, is measured in volts (V), resistance in ohms, and power in watts.\n\nCircuits. Ohm’s law says the voltage across a resistor equals the current through it multiplied by its resistance, V = IR. Electrical power equals voltage multiplied by current, P = VI. In a metal wire the charge carriers are electrons. A conductor lets charge flow easily; an insulator does not.\n\nLightning. Inside a thundercloud, collisions between ice particles separate charge, and negative charge gathers at the base of the cloud. When the electric field grows strong enough, a faint stepped leader works its way down. When it connects with the ground, a bright return stroke runs back up the channel and produces most of the light. The channel heats the air to about 30,000 degrees Celsius, roughly five times hotter than the surface of the Sun. The air expands explosively, and that shock wave is heard as thunder. Sound travels at about 343 metres per second in air at 20 degrees Celsius, so three seconds between flash and thunder is about one kilometre. Benjamin Franklin’s kite experiment in 1752 showed that lightning is electrical, and he invented the lightning rod, a metal rod wired to earth that gives a strike a safe path to the ground.',
  cards: [
    ['What is the SI unit of electric charge?', 'Coulomb', ['C', 'coulombs'], ['Ampere', 'Volt', 'Ohm'], 'Units', 'One coulomb is the charge moved by one ampere in one second.'],
    ['What is the SI unit of electric current?', 'Ampere', ['amp', 'amps', 'A', 'amperes'], ['Coulomb', 'Volt', 'Watt'], 'Units', 'One ampere is one coulomb of charge per second.'],
    ['What is the SI unit of resistance?', 'Ohm', ['ohms'], ['Volt', 'Watt', 'Farad'], 'Units', 'Resistance is voltage divided by current.'],
    ['In what unit is electrical power measured?', 'Watt', ['watts', 'W'], ['Joule', 'Volt', 'Ampere'], 'Units', 'One watt is one joule per second.'],
    ['Which law states that V = IR?', 'Ohm’s law', ['Ohms law', 'Ohm law'], ['Coulomb’s law', 'Faraday’s law', 'Lenz’s law'], 'Circuits', 'Voltage equals current multiplied by resistance.'],
    ['Electrical power equals voltage multiplied by what?', 'Current', [], ['Resistance', 'Charge', 'Time'], 'Circuits', 'P = VI.'],
    ['What particle carries charge through a metal wire?', 'Electron', ['electrons'], ['Proton', 'Neutron', 'Photon'], 'Circuits', 'Free electrons drift through the metal.'],
    ['What is the term for a material that does not let charge flow easily?', 'Insulator', ['an insulator', 'insulators'], ['Conductor', 'Semiconductor', 'Electrolyte'], 'Circuits', 'Rubber, glass and dry air are insulators.'],
    ['What sign of charge gathers at the base of a typical thundercloud?', 'Negative', ['negative charge'], ['Positive', 'Neutral', 'It alternates'], 'Lightning', 'Collisions between ice particles carry negative charge to the cloud base.'],
    ['The bright stroke that runs back up the channel and makes most of a flash’s light is called what?', 'Return stroke', ['the return stroke'], ['Stepped leader', 'Dart leader', 'Corona'], 'Lightning', 'It follows once the stepped leader connects with the ground.'],
    ['A lightning channel heats the air to about how many degrees Celsius?', '30,000', ['30000', '30 000', 'about 30,000'], ['3,000', '300,000', '1,000'], 'Lightning', 'That is roughly five times hotter than the surface of the Sun.'],
    ['The shock wave from air heated by lightning is heard as what?', 'Thunder', [], ['An echo', 'Static', 'A sonic boom'], 'Lightning', 'The air expands explosively along the channel.'],
    ['Roughly how fast does sound travel in air at 20 °C, in metres per second?', '343', ['340', 'about 343', '343 m/s'], ['34', '3,430', '300,000'], 'Lightning', 'Three seconds between flash and thunder is about one kilometre.'],
    ['Whose 1752 kite experiment showed that lightning is electrical?', 'Benjamin Franklin', ['Franklin', 'Ben Franklin'], ['Michael Faraday', 'Alessandro Volta', 'Nikola Tesla'], 'Lightning', 'He went on to invent the lightning rod.']
  ]
};
async function makeSample() {
  const have = deckIds().find(id => S.decks[id].sample);
  if (have) { setActive(have); followDeck(have); toast('The sample deck is already in your library.'); return go('home'); }
  const did = newDeckRecord(SAMPLE.name, Object.assign({ sample: true }, S.subs[curSub()] ? { sub: curSub() } : null));
  followDeck(did);
  S.cards[did] = SAMPLE.cards.map(c => ({ id: mkid('c'), q: c[0], a: c[1], alts: c[2], d: c[3], topic: c[4], why: c[5] }));
  go('home');
  try {
    await Store.saveCards(did, 0);
    await Store.addSrc(did, 'Sample notes', SAMPLE.notes);
    await Store.setSyllabus(did, SAMPLE.syllabus);
  } catch (e) { saveFailed(e); }
  softRender();
}

/* ----- deck editing ----- */
const curDeck = () => UI.sess && UI.route === 'study' ? UI.sess.did : UI.route === 'learn' ? UI.learn : UI.lib.did;
function cardForm(c) {
  return `<label class="field"><span class="lbl">Question</span><textarea class="ta" id="cf-q" style="min-height:72px">${esc(c.q || '')}</textarea></label>
  <label class="field"><span class="lbl">Answer</span><input class="inp" id="cf-a" value="${esc(c.a || '')}"></label>
  <label class="field"><span class="lbl">Also accept, one per line</span><textarea class="ta" id="cf-alts" style="min-height:56px">${esc((c.alts || []).join('\n'))}</textarea></label>
  <label class="field"><span class="lbl">Wrong options for multiple choice, one per line</span><textarea class="ta" id="cf-d" style="min-height:78px">${esc((c.d || []).join('\n'))}</textarea></label>
  <label class="field"><span class="lbl">Topic</span><input class="inp" id="cf-topic" value="${esc(c.topic || '')}"></label>
  <label class="field"><span class="lbl">Explanation shown after answering</span><textarea class="ta" id="cf-why" style="min-height:56px">${esc(c.why || '')}</textarea></label>`;
}
function readCardForm() {
  const lines = (id, n, len) => $('#' + id).value.split('\n').map(x => str(x, len)).filter(Boolean).slice(0, n);
  return { q: str($('#cf-q').value, 400), a: str($('#cf-a').value, 240), alts: lines('cf-alts', 6, 120), d: lines('cf-d', 3, 200), topic: str($('#cf-topic').value, 40) || 'General', why: str($('#cf-why').value, 320) };
}
function afterCardChange() {
  if (UI.sess && UI.route === 'study') { render(); focusAnswer(); } else render();
}
function editCard(id) {
  const did = curDeck(), cards = S.cards[did] || [], i = cards.findIndex(c => c.id === id);
  if (i < 0) return;
  openSheet({
    title: 'Edit question', html: cardForm(cards[i]),
    acts: [
      { label: 'Delete', cls: 'danger', fn: () => {
        cards.splice(i, 1);
        if (S.prog[did]) delete S.prog[did][id];
        const s = UI.sess;
        if (s && s.did === did) { s.pool = s.pool.filter(c => c.id !== id); s.again.delete(id); if (s.cur && s.cur.card.id === id) { closeSheet(); Store.saveCards(did, i); return void nextQuestion(); } }
        Store.saveCards(did, i);
        closeSheet(); afterCardChange();
      } },
      { label: 'Cancel', cls: 'ghost' },
      { label: 'Save', cls: 'pri', fn: () => {
        const f = readCardForm();
        if (!f.q || !f.a) { toast('A question needs both a prompt and an answer.'); return false; }
        Object.assign(cards[i], f);
        const c = UI.sess && UI.sess.cur;
        if (c && c.card.id === id && c.opts) { c.opts = buildOptions(did, cards[i]) || c.opts; c.right = c.opts.indexOf(String(cards[i].a)); }
        Store.saveCards(did, i);
        closeSheet(); afterCardChange();
      } }
    ]
  });
}
function addCard() {
  const did = UI.lib.did;
  openSheet({
    title: 'New question', html: cardForm({}),
    acts: [{ label: 'Cancel', cls: 'ghost' }, { label: 'Add', cls: 'pri', fn: async () => {
      const f = readCardForm();
      if (!f.q || !f.a) { toast('A question needs both a prompt and an answer.'); return false; }
      const cards = await Store.loadCards(did), at = cards.length;
      cards.push(Object.assign({ id: mkid('c') }, f));
      Store.saveCards(did, at);
      closeSheet(); render();
    } }]
  });
}
function addMaterial() {
  const did = UI.lib.did;
  openSheet({
    title: 'Add material',
    html: `<div class="field"><label class="lbl" for="am-text">More notes for this deck</label><textarea class="ta" id="am-text" placeholder="Paste text, or pick a file below"></textarea>
      <div><button class="btn sm" data-act="am-file">${ic('file')}Add a file</button><input type="file" id="am-file" hidden accept="${FILE_ACCEPT}${AI.images ? ',image/*' : ''}"></div></div>
      <label class="field"><span class="lbl">Name</span><input class="inp" id="am-name" maxlength="60" placeholder="Chapter 3 notes"></label>`,
    acts: [{ label: 'Cancel', cls: 'ghost' }].concat(aiOK() ? [{ label: 'Add and write 15 questions', cls: 'pri', fn: () => save(true) }] : []).concat([{ label: 'Add only', cls: aiOK() ? '' : 'pri', fn: () => save(false) }])
  });
  async function save(write) {
    const text = $('#am-text').value.trim(), name = $('#am-name').value.trim() || firstLine(text) || 'Notes';
    if (!text) { toast('Paste some text or add a file first.'); return false; }
    closeSheet();
    try { await Store.addSrc(did, name, text); } catch (e) { saveFailed(e); return; }
    if (write) { UI.lib.mode = 'build'; generate(did, { n: 15, text: text.slice(0, SRC_MAX) }); }
    render();
  }
}
function writeMore() {
  const did = UI.lib.did;
  let n = 20;
  const paint = el => { $('#wm-n', el).innerHTML = [10, 20, 40].map(x => chip(String(x), x === n, 'wm-n', 'data-n="' + x + '"')).join(''); };
  openSheet({
    title: 'Write more questions',
    html: `<div class="sec"><span class="lbl">How many</span><div class="chips" id="wm-n"></div></div>
      <label class="field"><span class="lbl">Focus, optional</span><input class="inp" id="wm-focus" maxlength="160" placeholder="Chapter 3, or: harder application questions"></label>
      <p class="note">New questions avoid repeating the ones you have and lean toward your weak topics.</p>`,
    onOpen: paint,
    setN(x) { n = x; paint($('.sheet')); },
    acts: [{ label: 'Cancel', cls: 'ghost' }, { label: 'Write', cls: 'pri', fn: () => {
      const focus = $('#wm-focus').value.trim();
      closeSheet();
      UI.lib.mode = 'build';
      generate(did, { n, focus, topics: weakTopics(did, 3).map(t => t.topic) });
      render();
    } }]
  });
}
async function editSyllabus() {
  const did = curDeck();
  if (!did || !S.decks[did]) return;
  let src;
  try { src = await Store.loadSrc(did); } catch (e) { toast('The syllabus could not be loaded. Check your connection.'); return; }
  openSheet({
    title: 'Syllabus',
    html: `<div class="field"><label class="lbl" for="sy-text">What you are expected to know</label><textarea class="ta" id="sy-text" style="min-height:200px" placeholder="Paste the syllabus, specification or learning outcomes.">${esc(src.syllabus)}</textarea>
      <div><button class="btn sm" data-act="sy-file">${ic('file')}Upload a file</button><input type="file" id="sy-file" hidden accept="${FILE_ACCEPT}"></div></div>
      <p class="note">BOLT plans lessons in this order and new questions are written to match it.</p>`,
    acts: [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save', cls: 'pri', fn: async () => {
      const text = $('#sy-text').value.trim();
      closeSheet();
      try { await Store.setSyllabus(did, text); toast(text ? 'Syllabus saved' : 'Syllabus removed'); } catch (e) { saveFailed(e); }
      render();
    } }]
  });
}

/* ----- lessons ----- */
async function buildPlan() {
  const did = UI.learn;
  if (!did || UI.planBusy || !aiOK()) return;
  UI.planBusy = did;
  render();
  try {
    const plan = await aiPlan(did);
    if (!plan.length) throw { code: 'invalid_json' };
    const old = S.decks[did].plan || [];
    for (const l of plan) { const o = old.find(x => norm(x.title) === norm(l.title)); if (o) { l.id = o.id; l.st = o.st; } }
    S.decks[did].plan = plan;
    await Store.saveDeck(did);
  } catch (e) {
    toast(e && e.code === 'invalid_json' ? 'The plan came back unreadable. Try again.' : aiErr(e) || 'Stopped.', 4200);
  }
  UI.planBusy = null;
  if (UI.route === 'learn') render();
}
async function openLesson(lid) {
  const did = UI.learn, d = S.decks[did], i = (d.plan || []).findIndex(l => l.id === lid);
  if (i < 0) return;
  const l = d.plan[i];
  let turns;
  try { turns = await Store.loadLesson(did, lid); } catch (e) { turns = S.les[did + '/' + lid] || (S.les[did + '/' + lid] = []); }
  openChat({ kind: 'lesson', did, title: 'Lesson ' + (i + 1) + ' · ' + l.title, turns, lesson: { id: lid, n: i + 1, of: d.plan.length, title: l.title, goals: l.goals || [] } });
  if (!turns.length) {
    if (!l.st) { l.st = 1; Store.saveDeck(did); }
    chatSend('Begin the lesson.', true);
  }
}
const lessonOf = th => th && th.lesson && S.decks[th.did] ? (S.decks[th.did].plan || []).find(l => l.id === th.lesson.id) : null;
async function lessonQuiz() {
  const th = Chat.thread;
  if (!th || th.kind !== 'lesson') return;
  const did = th.did, topic = th.lesson.title.slice(0, 40), goals = th.lesson.goals.join('; ');
  let cards;
  try { cards = await Store.loadCards(did); } catch (e) { toast('This deck could not be loaded.'); return; }
  closeChat();
  if (cards.filter(c => c.topic === topic).length >= 5) return startSession({ did, topics: [topic], mode: 'quiz', len: 10 });
  UI.lib = { mode: 'build', did, q: '' };
  generate(did, { n: 8, lessonTitle: th.lesson.title, focus: goals });
  go('library');
}

/* ----- BOLT ----- */
const Chat = { open: false, thread: null, busy: false, ctl: null, err: '', quiz: null, free: {} };
function quickPrompts(th) {
  if (th.kind === 'quiz') { const c = th.cur && th.cur(); return c && c.state === 'done' ? ['Why is that the answer?', 'Give me a similar example', 'How do I remember this?'] : ['Give me a hint', 'Explain the idea behind this', 'Reveal the answer and explain']; }
  if (th.kind === 'lesson') return ['Give me an example', 'Explain that more simply', 'Test me on this'];
  if (th.kind === 'review') return ['What pattern do you see in my mistakes?', 'Re-teach the hardest one'];
  return ['What should I focus on?', 'Explain my weakest topic', 'Quiz me out loud'];
}
function openChat(th) {
  if (Chat.ctl) Chat.ctl.abort();
  Chat.thread = th; Chat.open = true; Chat.err = '';
  const el = $('#mc'), wide = th.kind === 'lesson';
  el.classList.add('open'); el.classList.toggle('wide', wide); el.setAttribute('aria-hidden', 'false');
  $('#app').classList.add('chat-open'); $('#app').classList.toggle('chat-wide', wide);
  paintChat();
  if (!coarse()) $('#mc-in').focus();
}
function closeChat() {
  if (Chat.ctl) Chat.ctl.abort();
  Chat.open = false;
  $('#mc').classList.remove('open'); $('#mc').setAttribute('aria-hidden', 'true');
  $('#app').classList.remove('chat-open', 'chat-wide');
  if (UI.route === 'learn' && !UI.sess) render();
  focusAnswer();
}
function defaultThread() {
  if (UI.sess && UI.route === 'study') return Chat.quiz || (Chat.quiz = { kind: 'quiz', did: UI.sess.did, turns: [], cur: () => UI.sess && UI.sess.cur });
  const did = (UI.route === 'learn' && UI.learn) || (UI.route === 'library' && UI.lib.mode === 'deck' && UI.lib.did) || activeDeck() || '';
  return Chat.free[did] || (Chat.free[did] = { kind: 'free', did: did || null, turns: [] });
}
function paintChat() {
  const th = Chat.thread;
  if (!th) return;
  $('#mc-ctx').textContent = th.kind === 'quiz' ? 'On your current question' : th.kind === 'lesson' ? th.title : th.kind === 'review' ? 'Going over your misses' : th.did && S.decks[th.did] ? S.decks[th.did].name : 'Your teacher';
  const tools = $('#mc-tools'), l = lessonOf(th);
  tools.hidden = th.kind !== 'lesson';
  tools.innerHTML = th.kind === 'lesson' ? `<button class="btn sm" data-act="lesson-quiz" ${Chat.busy ? 'disabled' : ''}>${ic('bolt')}Quiz me on this</button><button class="btn sm" data-act="lesson-done">${ic('check')}${l && l.st === 2 ? 'Done' : 'Mark as done'}</button>` : '';
  const msgs = th.turns.map(t => t.role === 'user' ? (t.auto ? '' : '<div class="msg me">' + esc(t.content) + '</div>') : '<div class="msg ai"><p class="lbl who">BOLT</p><div class="prose">' + md(t.content) + '</div></div>').join('');
  const empty = `<div class="mc-empty"><canvas data-bolt="mr-claude" data-g="0.85"></canvas><p>${aiOK() ? (th.kind === 'quiz' ? 'Stuck on this one? Ask for a hint, or for the idea behind it. The answer stays hidden until you ask for it.' : 'Ask about anything in your notes. Answers draw on the material and syllabus in this deck.') : 'BOLT is not available in this view. Open the page inside Claude and allow it to use Claude.'}</p></div>`;
  const log = $('#mc-log');
  log.innerHTML = (msgs || (Chat.busy ? '' : empty)) +
    (Chat.busy ? '<div class="msg ai"><p class="lbl who">BOLT</p><div class="prose" id="mc-live"><p class="checking"><span class="dots"><i></i><i></i><i></i></span>Thinking</p></div></div>' : '') +
    (Chat.err ? '<div class="msg err">' + esc(Chat.err) + '</div>' : '');
  drawBolts(log);
  log.scrollTop = log.scrollHeight;
  $('#mc-quick').innerHTML = Chat.busy || !aiOK() ? '' : quickPrompts(th).map(q => `<button class="chip" data-act="chat-quick" data-q="${esc(q)}"><span>${esc(q)}</span></button>`).join('');
  const send = $('#mc-send');
  send.innerHTML = ic(Chat.busy ? 'stop' : 'up');
  send.setAttribute('aria-label', Chat.busy ? 'Stop' : 'Send');
  send.disabled = !aiOK();
}
async function chatSend(text, auto) {
  const th = Chat.thread;
  text = String(text || '').trim();
  if (!th || Chat.busy || !text) return;
  if (!aiOK()) { toast('BOLT is not available in this view.'); return; }
  th.turns.push({ role: 'user', content: text, auto: !!auto });
  Chat.busy = true; Chat.err = '';
  const ctl = Chat.ctl = new AbortController();
  paintChat();
  const pace = S.profile.prefs.pace;
  const tier = pace === 'deep' ? 'complex' : pace === 'thorough' || th.kind === 'lesson' ? 'default' : 'quick';
  try {
    const rules = await chatRules(th, text);
    const hist = th.turns.slice(-14).map(t => ({ role: t.role, content: String(t.content).slice(0, 8000) }));
    const res = await AI.fn([{ role: 'user', content: rules }].concat(hist), {
      cache: false, signal: ctl.signal, modelTier: tier,
      onText: u => {
        if (Chat.thread !== th) return;
        const el = $('#mc-live'), log = $('#mc-log');
        if (!el) return;
        const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
        el.innerHTML = md(u.text);
        if (stick) log.scrollTop = log.scrollHeight;
      }
    });
    th.turns.push({ role: 'assistant', content: res.text });
    if (res.truncated) Chat.err = 'That reply was cut short. Ask for the rest, or for less at a time.';
  } catch (e) {
    const keep = e && e.code !== 'refused' && e.text ? String(e.text) : '';
    if (keep) th.turns.push({ role: 'assistant', content: keep });
    else if (auto) th.turns.pop();
    Chat.err = aiErr(e) || (keep ? '' : '');
  }
  Chat.busy = false; Chat.ctl = null;
  if (th.kind === 'lesson' && th.turns.length) Store.saveLesson(th.did, th.lesson.id, th.turns);
  if (Chat.thread === th) paintChat();
  paintRail();
}

/* ----- actions ----- */
function setStudy(patch) { Object.assign(S.profile.study, patch); Store.touchActive(); render(); }
function setPref(patch) { Object.assign(S.profile.prefs, patch); Store.touchPrefs(); applyLook(); render(); }
const ACT = {
  go: el => go(el.dataset.to),
  'open-claude': () => openChat(defaultThread()),
  'close-claude': () => closeChat(),
  'chat-quick': el => chatSend(el.dataset.q),
  'new-deck': () => openNewDeck(),
  sample: () => makeSample(),
  'set-active': el => { setActive(el.dataset.did); render(true); $('#main').scrollTop = 0; },
  'quick-start': () => startSession({ did: activeDeck() }),
  drill: el => startSession({ did: activeDeck(), topics: [el.dataset.topic], mode: 'endless', focus: 'weak' }),
  'retry-cards': el => { delete cardErr[el.dataset.did]; render(); },

  'st-deck': el => { UI.setup = { did: el.dataset.did, topics: [] }; render(); },
  'st-mode': el => setStudy(el.dataset.mode === 'quiz' ? { mode: 'quiz', len: Number(el.dataset.len) } : { mode: 'endless' }),
  'st-fmt': el => { const k = el.dataset.f, st = S.profile.study, other = k === 'mc' ? 'sa' : 'mc'; if (st[k] && !st[other]) return toast('Keep at least one format on.'); setStudy({ [k]: !st[k] }); },
  'st-focus': el => setStudy({ focus: el.dataset.f }),
  'st-topic': el => { const t = el.dataset.t, su = UI.setup; if (!t) su.topics = []; else if (su.topics.includes(t)) su.topics = su.topics.filter(x => x !== t); else su.topics.push(t); render(); },
  'st-topup': () => setStudy({ topup: !S.profile.study.topup }),
  start: () => startSession({ did: UI.setup.did, topics: UI.setup.topics.slice() }),

  pick: el => pickOption(Number(el.dataset.i)),
  idk: () => { const c = UI.sess && UI.sess.cur; if (c && c.state === 'ask') { c.user = ''; settle({ g: 0, kind: 'wrong' }); } },
  next: () => nextQuestion(),
  override: el => overrideMark(Number(el.dataset.g)),
  self: el => selfMark(Number(el.dataset.g)),
  'ask-claude': () => openChat(defaultThread()),
  'ask-why': () => { const c = UI.sess && UI.sess.cur; if (!c) return; openChat(defaultThread()); chatSend(c.verdict && c.verdict.g >= 2 ? 'Why is that the answer?' : 'Why is “' + c.card.a + '” the answer, and where did I go wrong?'); },
  'end-session': () => finishSession(),
  again: () => startSession(UI.done.cfg),
  'drill-misses': () => { const r = UI.done; startSession({ did: r.did, only: r.misses.map(m => m.id), mode: 'quiz', len: r.misses.length, topics: [] }); },
  'ask-misses': () => { const r = UI.done; openChat({ kind: 'review', did: r.did, misses: r.misses, turns: [] }); chatSend('Help me understand what I got wrong.'); },
  'done-home': () => { UI.done = null; go('home'); },

  'ln-deck': el => { UI.learn = el.dataset.did; render(); },
  'syl-edit': () => editSyllabus(),
  'plan-build': () => { const d = S.decks[UI.learn]; if (d && (d.plan || []).some(l => l.st)) confirmSheet('Rebuild the plan?', 'Lessons whose titles stay the same keep their progress. Others start fresh.', 'Rebuild', () => { closeSheet(); buildPlan(); }); else buildPlan(); },
  'lesson-open': el => openLesson(el.dataset.id),
  'lesson-quiz': () => lessonQuiz(),
  'lesson-done': () => { const th = Chat.thread, l = lessonOf(th); if (!l) return; l.st = 2; Store.saveDeck(th.did); toast('Lesson marked as done'); closeChat(); },
  'ask-deck': () => openChat(defaultThread()),

  'lib-open': el => { UI.lib = { mode: 'deck', did: el.dataset.did, q: '' }; followDeck(el.dataset.did); render(true); $('#main').scrollTop = 0; },
  sub: el => selectSub(el.dataset.id),
  'sub-add': () => subjectSheet(null),
  'sub-edit': el => subjectSheet(el.dataset.id),
  'sj-color': el => { if (UI.sheet && UI.sheet.setC) UI.sheet.setC(el.dataset.c); },
  'nd-sub': el => { const id = el.dataset.id; UI.nd.sub = id; S.profile.sub = id || null; Store.touchActive(); applyLook(); paintSubs(); paintNewDeck(); },
  'deck-move': el => { const did = UI.lib.did, d = S.decks[did], id = el.dataset.id; if (!d) return; if (S.subs[id]) d.sub = id; else delete d.sub; Store.saveDeck(did); setActive(did); followDeck(did); render(); toast(S.subs[id] ? 'Moved to ' + S.subs[id].name : 'Moved out of its subject'); },
  'lib-back': () => { UI.lib = { mode: 'list', did: null, q: '' }; UI.nd = null; render(true); $('#main').scrollTop = 0; },
  'nd-file': () => $('#nd-files').click(),
  'nd-sylfile': () => $('#nd-sylfile').click(),
  'nd-rm': el => { UI.nd.files.splice(Number(el.dataset.i), 1); paintNewDeck(); },
  'nd-mode': el => { UI.nd.mode = el.dataset.m; paintNewDeck(); },
  'nd-opt': el => { const k = el.dataset.k; UI.nd[k] = !UI.nd[k]; if (k === 'header') UI.nd.headerSet = true; paintNewDeck(); },
  'nd-count': el => { UI.nd.count = Number(el.dataset.n); paintNewDeck(); },
  'nd-build': () => ndBuild(),
  'build-stop': () => { if (UI.build && UI.build.ctl) UI.build.ctl.abort(); },
  'build-study': () => { const b = UI.build; startSession(b.topic ? { did: b.did, topics: [b.topic], mode: 'quiz', len: 10 } : { did: b.did }); },
  'build-done': () => { UI.lib = { mode: 'deck', did: UI.build.did, q: '' }; render(); },
  'deck-study': () => { UI.setup = { did: UI.lib.did, topics: [] }; go('study'); },
  'deck-rename': () => { const did = UI.lib.did; openSheet({ title: 'Rename deck', html: `<label class="field"><span class="lbl">Name</span><input class="inp" id="rn-name" maxlength="60" value="${esc(S.decks[did].name)}"></label>`, acts: [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save', cls: 'pri', fn: () => { const v = $('#rn-name').value.trim(); if (!v) return false; S.decks[did].name = v.slice(0, 60); Store.saveDeck(did); closeSheet(); render(); } }] }); },
  'src-add': () => addMaterial(),
  'am-file': () => $('#am-file').click(),
  'sy-file': () => $('#sy-file').click(),
  'src-rm': el => { const did = UI.lib.did, id = el.dataset.id; confirmSheet('Remove this source?', 'Questions already written from it stay in the deck. Claude will no longer draw on this text.', 'Remove', async () => { closeSheet(); await Store.removeSrc(did, id); render(); }, true); },
  'gen-more': () => writeMore(),
  'wm-n': el => { if (UI.sheet && UI.sheet.setN) UI.sheet.setN(Number(el.dataset.n)); },
  'card-add': () => addCard(),
  'card-edit': el => editCard(el.dataset.id),
  'deck-reset': () => { const did = UI.lib.did; confirmSheet('Reset progress?', 'Every question in this deck goes back to new. Your questions and material stay.', 'Reset', async () => { closeSheet(); await Store.resetProg(did); render(); toast('Progress reset'); }, true); },
  'deck-del': () => { const did = UI.lib.did; confirmSheet('Delete this deck?', 'The questions, material, lessons and progress for “' + S.decks[did].name + '” are removed from every device. This cannot be undone.', 'Delete deck', async () => { closeSheet(); UI.lib = { mode: 'list', did: null, q: '' }; if (UI.build && UI.build.did === did && UI.build.ctl) UI.build.ctl.abort(); await Store.deleteDeck(did); render(); toast('Deck deleted'); }, true); },

  'pf-preset': el => { const k = el.dataset.k, p = PRESETS[k]; setPref({ preset: k, a1: p[0], a2: p[1] }); },
  'pf-flat': el => setPref({ flat: el.dataset.v === '1' }),
  'pf-look': el => setPref({ look: el.dataset.v }),
  'pf-toggle': el => { const k = el.dataset.k, v = !S.profile.prefs[k]; setPref({ [k]: v }); if (k === 'sound' && v) ping(true); },
  'pf-goal': el => { S.profile.goal = Number(el.dataset.n); Store.touchPrefs(); render(); },
  'pf-typo': el => setPref({ typo: el.dataset.v }),
  'pf-pace': el => setPref({ pace: el.dataset.v }),

  'sheet-bg': (el, e) => { if (e.target === el) closeSheet(); },
  'sheet-do': async el => { const a = UI.sheet && UI.sheet.acts[Number(el.dataset.i)]; if (!a) return; if (!a.fn) return closeSheet(); await a.fn(); }
};

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    if (nav.dataset.nav === UI.route) {
      e.preventDefault();
      if (UI.route === 'library') { UI.lib = { mode: 'list', did: null, q: '' }; UI.nd = null; }
      if (UI.route === 'study' && !UI.sess) UI.done = null;
      render();
      $('#main').scrollTop = 0;
    }
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) fn(el, e);
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'sa-form') submitTyped($('#sa-in').value);
  else if (e.target.id === 'mc-form') {
    if (Chat.busy) { if (Chat.ctl) Chat.ctl.abort(); return; }
    const ta = $('#mc-in'), v = ta.value;
    if (!v.trim()) return;
    ta.value = ''; ta.style.height = '';
    chatSend(v);
  }
});
document.addEventListener('keydown', e => {
  const t = e.target, tag = t && t.tagName;
  if (e.key === 'Escape') { if (UI.sheet) closeSheet(); else if (Chat.open) closeChat(); return; }
  if (t && t.id === 'mc-in' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    const f = $('#mc-form');
    if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return;
  }
  if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tag || '') || UI.sheet || e.metaKey || e.ctrlKey || e.altKey) return;
  const c = UI.sess && UI.route === 'study' && UI.sess.cur;
  if (!c) return;
  if (c.fmt === 'mc' && c.state === 'ask' && /^[1-4]$/.test(e.key)) { e.preventDefault(); pickOption(Number(e.key) - 1); }
  else if (c.state === 'done' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nextQuestion(); }
});
const saveLookSoon = debounce(() => Store.touchPrefs(), 500);
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'lib-q') { UI.lib.q = t.value; const l = $('#card-list'); if (l) l.innerHTML = cardRows(UI.lib.did, filterCards(UI.lib.did)); }
  else if (t.id === 'nd-text') ndDetectSoon();
  else if (t.id === 'mc-in') { t.style.height = 'auto'; t.style.height = Math.min(136, t.scrollHeight + 2) + 'px'; }
  else if (t.id === 'pf-a1' || t.id === 'pf-a2') { const p = S.profile.prefs; p[t.id.slice(3)] = t.value; p.preset = 'custom'; applyLook(); saveLookSoon(); }
  else if (t.id === 'sj-name') { const el = $('#sj-prev-name'); if (el) el.textContent = t.value.trim() || 'New subject'; }
  else if (t.id === 'sj-c') { if (UI.sheet && UI.sheet.setC) UI.sheet.setC(t.value); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.type !== 'file') { if (t.id === 'pf-a1' || t.id === 'pf-a2') render(); return; }
  const files = Array.from(t.files || []);
  t.value = '';
  if (!files.length) return;
  if (t.id === 'nd-files') ndAddFiles(files);
  else if (t.id === 'nd-sylfile') readInto(files[0], $('#nd-syl'));
  else if (t.id === 'sy-file') readInto(files[0], $('#sy-text'));
  else if (t.id === 'am-file') { const nm = $('#am-name'); if (nm && !nm.value.trim()) nm.value = prettyName(files[0].name); readInto(files[0], $('#am-text')); }
});
document.addEventListener('dragover', e => { const d = e.target.closest && e.target.closest('#nd-drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('#nd-drop'); if (d && !d.contains(e.relatedTarget)) d.classList.remove('over'); });
document.addEventListener('drop', e => {
  const d = e.target.closest && e.target.closest('#nd-drop');
  if (!d) return;
  e.preventDefault();
  d.classList.remove('over');
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) ndAddFiles(e.dataTransfer.files);
});
window.addEventListener('hashchange', onRoute);
window.addEventListener('resize', debounce(() => drawBolts(), 180));
document.addEventListener('visibilitychange', () => { if (document.hidden) Store.flush(); });
window.addEventListener('pagehide', () => Store.flush());

/* ----- boot ----- */
function saveCopy(code) {
  if (code === 'quota_exceeded') return 'Storage for this page is full. Delete a deck you no longer need.';
  if (code === 'revoked' || code === 'not_granted') return 'Saving to your account was switched off. Reload the page to reconnect.';
  return 'A change could not be saved. Check your connection; it goes out again with your next answer.';
}
function boot() {
  const links = NAV.map(n => `<a href="#${n[0]}" data-nav="${n[0]}">${ic(n[2])}<span>${n[1]}</span></a>`).join('');
  $('#nav-rail').innerHTML = links;
  $('#nav-tabs').innerHTML = links;
  $('#top-claude').innerHTML = ic('chat');
  $('#mc-close').innerHTML = ic('x');
  $('#mc-send').innerHTML = ic('up');
  try { const c = JSON.parse(localStorage.getItem('rime:look') || 'null'); if (c && typeof c === 'object') Object.assign(S.profile.prefs, c); } catch (e) {}
  applyLook(true);
  drawBolts();
  let shown = false;
  onStore = (kind, code) => {
    if (kind === 'sync') return paintSync();
    if (kind === 'fail') { paintSync(); return toast(saveCopy(code), 4200); }
    applyLook();
    if (S.ready && !shown) { shown = true; render(true); }
    else if (kind !== 'same') softRender();   // an echo of our own save changes nothing on screen
    paintSubs(); paintRail(); paintSync();
  };
  const r = (location.hash || '#home').slice(1);
  UI.route = NAV.some(n => n[0] === r) ? r : 'home';
  render();
  paintSync();
  Store.boot();
  bootAI().then(() => { paintRail(); softRender(); });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)'), on = () => applyLook();
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
  }
  new MutationObserver(() => applyLook()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
boot();
