/* ---------- screens ---------- */
const NAV = [['home', 'Home', 'home'], ['study', 'Study', 'play'], ['papers', 'Papers', 'paper'], ['learn', 'Learn', 'book'], ['library', 'Library', 'stack'], ['prefs', 'Tune', 'tune']];
const PRESETS = {
  storm: ['#7a6bff', '#31c4ff', 'Storm'], volt: ['#ffe04a', '#ff9a1f', 'Volt'], ember: ['#f0476a', '#6b4bff', 'Ember'],
  aurora: ['#35e0a8', '#2a8cff', 'Aurora'], dusk: ['#ffb067', '#ff4d8d', 'Dusk'], bone: ['#dfe6ee', '#8fa0b5', 'Bone']
};
const SUB_COLORS = ['#f6c61e', '#ff8f8f', '#8a1c33', '#e3262e', '#2f7bf5', '#1fb565', '#ff8a1f', '#8b5cf6', '#14b8c4', '#e84fa3', '#94a3b8'];
const UI = { route: 'home', sess: null, done: null, setup: null, lib: { mode: 'list', did: null, q: '' }, nd: null, build: null, learn: null, sheet: null, planBusy: null };
const cardErr = {};

const chip = (label, on, act, extra) => '<button class="chip" aria-pressed="' + (on ? 'true' : 'false') + '" data-act="' + act + '" ' + (extra || '') + '><span>' + label + '</span></button>';
const fmtDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const subName = id => id === '_' ? 'Unsorted' : S.subs[id] ? S.subs[id].name : 'All subjects';
// decks in view: the current subject's, or every deck on the "All" tab
const scopeIds = () => deckIds(curSub() || undefined);

function ensureCards(did) {
  if (!did || S.cards[did] || !S.decks[did] || cardErr[did]) return;
  cardErr[did] = 'loading';
  Store.loadCards(did).then(() => { delete cardErr[did]; softRender(); }, () => { cardErr[did] = 'failed'; softRender(); });
}
function notices() {
  const out = [];
  if (S.dead) out.push('Saving to your account has stopped. Reload the page to reconnect; anything new stays on this screen until then.');
  else if (S.stale) out.push('Your saved progress has not arrived yet. Still trying. What you do now is kept and merged in.');
  if (S.mode === 'local') out.push('Progress is saved in this browser only. Open this page inside Claude, signed in, to sync across your devices.');
  let h = out.map(t => '<div class="banner">' + ic('warn') + '<span>' + t + '</span></div>').join('');
  // the device asks for less motion and Motion follows the device: say why the screen is still, once
  if (S.ready && S.profile.prefs.motion === 'auto' && sysCalm() && !calmOk()) h += '<div class="banner quiet">' + ic('bolt') + '<span>Animations are off because this device asks apps to reduce motion. On Windows that is Settings, Accessibility, Visual effects, Animation effects.</span><span class="chips"><button class="btn sm" data-act="motion-on">Animate anyway</button><button class="btn sm ghost" data-act="motion-keep">Leave off</button></span></div>';
  return h;
}
function calmOk() { if (UI.calmOk) return true; try { return localStorage.getItem('rime:calmok') === '1'; } catch (e) { return false; } }
function needDeck(title, text) {
  const sub = curSub();
  return `<div class="page-h"><div><p class="lbl">${title}${sub ? ' · ' + esc(subName(sub)) : ''}</p><h1>No deck yet</h1></div></div>
  <div class="card sec"><p class="note">${text}</p><div class="chips"><button class="btn pri" data-act="new-deck">${ic('plus')}New deck</button><button class="btn" data-act="sample">Try the sample deck</button></div></div>`;
}

/* ----- subject tabs ----- */
function subTabsHTML() {
  const cur = curSub(), flat = S.profile.prefs.flat, subs = subIds();
  const tab = (id, name, c) => `<button class="stab${(id || null) === cur ? ' on' : ''}" data-act="sub" data-id="${id}" aria-pressed="${(id || null) === cur}" ${c ? 'style="' + subStyle(c, flat) + '"' : ''}>${c ? '<i></i>' : ''}<span>${esc(name)}</span></button>`;
  let h = tab('', 'All', '');
  for (const id of subs) h += tab(id, S.subs[id].name, S.subs[id].c);
  if (subs.length && deckIds('_').length) h += tab('_', 'Unsorted', '');
  return h + `<button class="stab add" data-act="sub-add" aria-label="Add a subject">${ic('plus')}${subs.length ? '' : '<span>Add a subject</span>'}</button>`;
}
function paintSubs() {
  const h = subTabsHTML();
  ['#subs-top', '#subs-bar'].forEach(sel => {
    const el = $(sel);
    if (!el || el._h === h) return;
    el.innerHTML = h; el._h = h;
    const on = $('.stab.on', el);
    if (on && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, on.offsetLeft - el.clientWidth / 2 + on.offsetWidth / 2);
  });
}

/* ----- home ----- */
function viewWelcome() {
  return `${notices()}<div class="home">
  <section class="hero">
    <canvas class="hero-art" data-bolt="welcome" data-g="1"></canvas>
    <div class="hero-in">
      <p class="lbl">Nothing here yet</p>
      <h1 class="hero-name">Add a subject. Drop in your notes.</h1>
      <p class="hero-sub">Each subject gets its own colour and its own decks. Paste notes or a table into a deck and Claude writes the questions; the first ones are ready in under a minute.</p>
      <div class="hero-cta"><button class="btn go lg" data-act="sub-add">${ic('plus')}Add a subject</button><button class="btn lg" data-act="new-deck">New deck</button><button class="btn lg" data-act="sample">Try the sample deck</button></div>
    </div>
  </section>
  <div class="how">
    <div class="card"><span class="lbl">Step 1</span><b>Bring material</b><p>Notes, a syllabus, PDFs, Word files, spreadsheets. A two-column table becomes cards instantly.</p></div>
    <div class="card"><span class="lbl">Step 2</span><b>Answer</b><p>Multiple choice, typed answers, or both. Typos are forgiven, weak spots come back sooner, strong ones rest longer.</p></div>
    <div class="card"><span class="lbl">Step 3</span><b>Ask BOLT</b><p>A teacher who has read your notes: hints mid-question, the reason behind an answer, or full lessons that follow your syllabus.</p></div>
  </div>
  <aside class="side">${goalCard()}</aside>
  </div>`;
}
function goalCard() {
  const t = today(), goal = S.profile.goal || 30, p = clamp(t.n / goal, 0, 1), C = 2 * Math.PI * 30, lv = level(), ds = dayStreak();
  return `<section class="card goal" aria-label="Today">
    <div class="ring"><svg viewBox="0 0 76 76" aria-hidden="true"><circle class="r0" cx="38" cy="38" r="30"></circle><circle class="r1" cx="38" cy="38" r="30" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p)).toFixed(1)}"></circle></svg><b>${t.n}</b></div>
    <div style="min-width:0"><p class="lbl">Today, all subjects</p><p class="big">${t.n >= goal ? 'Goal met' : (goal - t.n) + ' to go'} <small>of ${goal}</small></p><p class="lbl">${ds ? plural(ds, 'day') + ' streak' : 'No streak yet'} · best ${bestStreak()}</p></div>
    <div class="goal-lvl"><span class="lbl">Level ${lv.lv}</span><div class="meter"><i style="width:${pct(lv.p)}%"></i></div><span class="num mute" style="font-size:11px">${lv.xp - lv.lo}/${lv.hi - lv.lo} XP</span></div>
  </section>`;
}
function sessionsCard(sub) {
  const ss = S.profile.sessions.filter(s => !sub || s.sid === sub || (S.decks[s.did] && subOf(S.decks[s.did]) === sub)).slice(0, 5);
  return `<section class="card sec"><div class="sec-h"><h2>Last sessions</h2></div>${ss.length
    ? '<div class="rows">' + ss.map(s => `<div class="row"><span class="row-t">${esc(s.name)}</span><span class="row-s">${s.mode === 'quiz' ? 'Quiz' : s.mode === 'paper' ? 'Paper, marks' : 'Endless'} · ${ago(s.t)}</span><span class="row-r"><span class="score" title="Right : wrong"><span class="g">${s.c | 0}</span><i>:</i><span class="b">${s.w | 0}</span></span></span></div>`).join('') + '</div>'
    : '<p class="note">Finished sessions land here, right answers against wrong.</p>'}</section>`;
}
function activityCard() {
  const days = [], tk = dayKey();
  let k = tk;
  for (let i = 0; i < 14; i++) { days.unshift([k, (S.profile.days[k] || {}).n | 0]); k = dayShift(k, -1); }
  const max = Math.max(S.profile.goal || 30, Math.max.apply(null, days.map(d => d[1])));
  return `<section class="card sec"><div class="sec-h"><h2>14 days</h2><span class="lbl">${days.reduce((a, d) => a + d[1], 0)} answered</span></div>
    <div><div class="bars" role="img" aria-label="Questions answered per day, last 14 days">${days.map(d => `<i class="${d[0] === tk ? 'today' : d[1] ? 'on' : ''}" style="height:${Math.max(3, Math.round(d[1] / max * 100))}%" title="${fmtDay(d[0])}: ${d[1]}"></i>`).join('')}</div>
    <div class="bars-x"><span class="lbl">${fmtDay(days[0][0])}</span><span class="lbl">Today</span></div></div></section>`;
}
function topicRows(list, drill) {
  return list.map(t => `<div class="topic"><span class="topic-n">${esc(t.topic)}</span><span class="num">${t.acc == null ? '—' : pct(t.acc) + '%'}</span>${drill
    ? `<button class="btn sm" data-act="drill" data-topic="${esc(t.topic)}">Drill</button>` : `<span class="lbl">${t.n} q</span>`}<div class="meter"><i style="width:${pct(t.m)}%"></i></div></div>`).join('');
}
function subTotals(id) {
  const ids = deckIds(id);
  let total = 0, due = 0, sum = 0;
  for (const d of ids) { const st = deckStats(d); total += st.total; due += st.due; sum += st.mastery * st.total; }
  return { decks: ids.length, total, due, m: total ? sum / total : 0 };
}
/* ----- exam countdowns ----- */
const examLeft = n => n < 0 ? (n === -1 ? 'yesterday' : -n + ' days ago') : n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days';
function examTicks(n) {
  if (n < 1 || n > 42) return '';
  let h = '';
  for (let i = 0; i < n; i++) h += '<i' + (i % 7 === 6 ? ' class="wk"' : '') + '></i>';
  return '<div class="cd-ticks" aria-hidden="true">' + h + '</div>';
}
// one subject's countdown, across the top of its home
function examStrip(sid) {
  const e = examOf(sid);
  if (!e) return '';
  const big = e.n < 0 ? 'Done' : e.n === 0 ? 'Today' : String(e.n);
  return `<section class="cd${e.n < 0 ? ' past' : e.n <= 7 ? ' soon' : ''}" aria-label="${esc(e.name)} exam ${examLeft(e.n)}">
    <div class="cd-n"><b${e.n > 0 ? '' : ' class="w"'}>${big}</b>${e.n > 0 ? '<span>' + (e.n === 1 ? 'day' : 'days') + ' to go</span>' : ''}</div>
    <div class="cd-t"><p class="lbl">${esc(e.name)} exam</p><p class="cd-d">${dayName(e.date)}${e.n < 0 ? ', ' + examLeft(e.n) : e.n === 1 ? ', tomorrow' : ''}</p></div>
    <button class="btn sm ghost cd-edit" data-act="sub-edit" data-id="${sid}" aria-label="Change the exam date">${ic('edit')}</button>
    ${examTicks(e.n)}
  </section>`;
}
// every subject's countdown, soonest first, on the All home
function examBoard() {
  const list = examList();
  if (!list.length) return '';
  const next = list[0].n >= 0 ? list[0] : null, flat = S.profile.prefs.flat;
  return `<section class="sec cdboard" aria-label="Exam countdowns"><div class="sec-h"><h2>Exams</h2>${next ? `<span class="lbl">Next: ${esc(next.name)}, ${dayName(next.date)}</span>` : ''}</div>
    <div class="cdgrid">${list.map((e, i) => `<button class="extile${e.n < 0 ? ' past' : ''}${next && i === 0 ? ' next' : ''}" data-act="sub" data-id="${e.sid}" style="${subStyle(e.c, flat)}" aria-label="${esc(e.name)} exam ${examLeft(e.n)}, ${dayName(e.date)}">
      <span class="lbl">${esc(e.name)}</span><span class="extile-n"><b${e.n > 0 ? '' : ' class="w"'}>${e.n < 0 ? 'Done' : e.n === 0 ? 'Today' : e.n}</b>${e.n > 0 ? '<em>' + (e.n === 1 ? 'day' : 'days') + '</em>' : ''}</span><span class="extile-s">${dayName(e.date)}</span></button>`).join('')}</div></section>`;
}
function viewOverview() {
  const flat = S.profile.prefs.flat, subs = subIds();
  const card = (id, name, c) => {
    const t = subTotals(id);
    return `<button class="subcard${c ? '' : ' plain'}" data-act="sub" data-id="${id}" ${c ? 'style="' + subStyle(c, flat) + '"' : ''}>
      <canvas data-bolt="sub-${id}" data-g="${t.m.toFixed(3)}"></canvas>
      <span class="lbl">${plural(t.decks, 'deck')} · ${t.total} q</span><b>${esc(name)}</b>
      <span class="subcard-s"><span><em>${t.due}</em> due</span><span><em>${pct(t.m)}%</em> charged</span></span></button>`;
  };
  return `${notices()}<div class="home">
  <section class="sec over">
    ${examBoard()}
    <div class="page-h"><div><p class="lbl">All subjects</p><h1>Pick a subject</h1></div><button class="btn" data-act="sub-add">${ic('plus')}Add a subject</button></div>
    <div class="subgrid">${subs.map(id => card(id, S.subs[id].name, S.subs[id].c)).join('')}${deckIds('_').length ? card('_', 'Unsorted', '') : ''}</div>
  </section>
  <aside class="side">${goalCard()}${sessionsCard()}${activityCard()}</aside>
  </div>`;
}
function viewHome() {
  const sub = curSub(), subs = subIds();
  if (!sub && subs.length) return viewOverview();
  const ids = deckIds(sub || undefined);
  if (!ids.length && !subs.length) return viewWelcome();
  const head = sub ? esc(subName(sub)) : 'All decks';
  if (!ids.length) {
    return `${notices()}<div class="home">
    ${examStrip(sub)}
    <section class="hero">
      <canvas class="hero-art" data-bolt="sub-${sub}" data-g="0"></canvas>
      <div class="hero-in">
        <p class="lbl">No decks yet</p>
        <h1 class="hero-name">${head}</h1>
        <p class="hero-sub">Decks you make here stay in this subject. Paste notes or a table and Claude writes the questions.</p>
        <div class="hero-cta"><button class="btn go lg" data-act="new-deck">${ic('plus')}New deck</button><button class="btn lg" data-act="sample">Try the sample deck</button>${S.subs[sub] ? `<button class="btn lg" data-act="sub-syl" data-id="${sub}">${S.subs[sub].syl ? 'Syllabus' : 'Add the syllabus'}</button><button class="btn lg" data-act="sub-edit" data-id="${sub}">Edit subject</button>` : ''}</div>
      </div>
    </section>
    <aside class="side">${goalCard()}${activityCard()}</aside>
    </div>`;
  }
  const did = activeDeck(sub), d = S.decks[did], st = deckStats(did);
  ensureCards(did);
  const cta = st.due ? 'Continue · ' + st.due + ' due' : st.fresh ? 'Continue · ' + st.fresh + ' new' : 'Keep sharp';
  const weak = weakTopics(did), strong = strongTopics(did);
  return `${notices()}<div class="home">
  ${examStrip(sub)}
  <section class="hero" aria-label="Active deck">
    <canvas class="hero-art" data-bolt="${did}" data-g="${st.mastery.toFixed(3)}"></canvas>
    <div class="hero-ghost" aria-hidden="true" data-count="${pct(st.mastery)}">${pct(st.mastery)}<i>%</i></div>
    <div class="hero-in">
      <p class="lbl">${head} · ${plural(st.total, 'question')} · ${pct(st.mastery)}% charged</p>
      <h1 class="hero-name">${esc(d.name)}</h1>
      <dl class="stats">
        <div><dt>Recall</dt><dd>${st.acc == null ? '—' : pct(st.acc) + '<small>%</small>'}</dd></div>
        <div><dt>Mastered</dt><dd>${st.mast}<small>/${st.total}</small></dd></div>
        <div><dt>Due now</dt><dd>${st.due}</dd></div>
        <div><dt>New</dt><dd>${st.fresh}</dd></div>
      </dl>
      <div class="hero-cta">
        <button class="btn go lg" data-act="quick-start" ${st.total ? '' : 'disabled'}>${ic('bolt')}${cta}</button>
        <button class="btn lg" data-act="go" data-to="study">Set up a session</button>
        <button class="btn lg" data-act="go" data-to="learn">Learn it</button>
      </div>
    </div>
  </section>
  <aside class="side">${goalCard()}${sessionsCard(sub)}${activityCard()}</aside>
  <div class="duo">
    <section class="card sec"><div class="sec-h"><h2>Weak spots</h2><span class="lbl">Recall</span></div>${weak.length ? '<div>' + topicRows(weak, true) + '</div>' : '<p class="note">Nothing weak yet. Answer a few questions and the topics that trip you up surface here.</p>'}</section>
    <section class="card sec"><div class="sec-h"><h2>Strengths</h2><span class="lbl">Recall</span></div>${strong.length ? '<div>' + topicRows(strong, false) + '</div>' : '<p class="note">Topics you answer reliably collect here and get asked less often.</p>'}</section>
  </div>
  <section class="sec decks"><div class="sec-h"><h2>${sub ? head + ' decks' : 'Decks'}</h2><span class="chips">${S.subs[sub] ? `<button class="link" data-act="sub-syl" data-id="${sub}">${S.subs[sub].syl ? 'Syllabus' : 'Add the syllabus'}</button><button class="link" data-act="sub-edit" data-id="${sub}">Edit subject</button>` : ''}<a class="link" href="#library">Manage</a></span></div>
    <div class="deckgrid">${ids.map(id => { const s = deckStats(id); return `<button class="deck${id === did ? ' on' : ''}" data-act="set-active" data-did="${id}" aria-pressed="${id === did}"><canvas data-bolt="${id}" data-g="${s.mastery.toFixed(3)}"></canvas><b>${esc(S.decks[id].name)}</b><span class="lbl">${s.total} q · ${pct(s.mastery)}%</span><div class="meter"><i style="width:${pct(s.mastery)}%"></i></div></button>`; }).join('')}
    <button class="deck add" data-act="new-deck">${ic('plus')}<span class="lbl">New deck</span></button></div>
  </section>
  </div>`;
}

/* ----- study ----- */
function viewStudy() { return UI.sess ? viewRun() : UI.done ? viewDone() : viewSetup(); }
function setupPool(su) {
  const cards = S.cards[su.did];
  if (!cards) return null;
  return su.topics.length ? cards.filter(c => su.topics.includes(c.topic || 'General')) : cards;
}
function viewSetup() {
  const ids = scopeIds();
  if (!ids.length) return needDeck('Study', 'Sessions draw on a deck. Make one from your notes, or try the sample.');
  const su = UI.setup || (UI.setup = { did: activeDeck(), topics: [] });
  if (!ids.includes(su.did)) { su.did = activeDeck(); su.topics = []; }
  const cfg = S.profile.study, did = su.did, d = S.decks[did], fmt = deckFmt(did);
  ensureCards(did);
  const topics = S.cards[did] ? topicList(did) : [];
  su.topics = su.topics.filter(t => topics.includes(t));
  const pool = setupPool(su), prog = S.prog[did] || {}, t = now();
  let due = 0, fresh = 0;
  if (pool) for (const c of pool) { const p = prog[c.id]; if (!p || !p[P.SEEN]) fresh++; else if (p[P.DUE] <= t) due++; }
  const focusNote = { adaptive: 'Due and shaky questions first, new ones fed in steadily, strong ones only when they are about to fade.', weak: 'Only what you get wrong or have not learned yet. Hard, and fast progress.', strong: 'A lap through what you already know, to keep it fast and certain.' }[cfg.focus];
  const canTop = aiOK() && (d.srcs || []).length > 0, sub = curSub();
  return `<div class="page-h"><div><p class="lbl">Study${sub ? ' · ' + esc(subName(sub)) : ''}</p><h1>Set up a session</h1></div></div>
  <div class="setup">
    ${ids.length > 1 ? `<div class="sec"><span class="lbl">Deck</span><div class="chips">${ids.map(id => chip(esc(S.decks[id].name), id === did, 'st-deck', 'data-did="' + id + '"')).join('')}</div></div>` : ''}
    <div class="sec"><span class="lbl">Length</span><div class="chips">${chip('Endless', cfg.mode === 'endless', 'st-mode', 'data-mode="endless"')}${[10, 20, 40].map(n => chip('Quiz · ' + n, cfg.mode === 'quiz' && cfg.len === n, 'st-mode', 'data-mode="quiz" data-len="' + n + '"')).join('')}</div></div>
    <div class="sec"><span class="lbl">Question types</span><div class="chips">${FMTS.map(f => chip(f[1], fmt === f[0], 'st-fmt', 'data-f="' + f[0] + '"')).join('')}</div>
      <p class="note">${FMT_NOTE[fmt]} Kept with this deck, and you can switch mid-quiz.</p></div>
    <div class="sec"><span class="lbl">Focus</span><div class="chips">${chip('Adaptive', cfg.focus === 'adaptive', 'st-focus', 'data-f="adaptive"')}${chip('Weak spots', cfg.focus === 'weak', 'st-focus', 'data-f="weak"')}${chip('Strengths', cfg.focus === 'strong', 'st-focus', 'data-f="strong"')}</div><p class="note">${focusNote}</p></div>
    ${topics.length > 1 ? `<div class="sec"><span class="lbl">Topics</span><div class="chips">${chip('All', !su.topics.length, 'st-topic', 'data-t=""')}${topics.map(tp => chip(esc(tp), su.topics.includes(tp), 'st-topic', 'data-t="' + esc(tp) + '"')).join('')}</div></div>` : ''}
    ${cfg.mode === 'endless' && canTop ? `<div class="sec"><span class="lbl">Fresh questions</span><div class="chips">${chip('Keep writing new ones with Claude', cfg.topup, 'st-topup')}</div><p class="note">When unseen questions run low, Claude writes ten more from your material, aimed at your weak topics.</p></div>` : ''}
    <div class="sec">
      ${pool ? `<div class="setup-sum"><span><b>${pool.length}</b> in play</span><span><b>${due}</b> due</span><span><b>${fresh}</b> new</span></div>`
    : cardErr[did] === 'failed' ? `<div class="banner">${ic('warn')}<span>This deck's questions could not be loaded. Check your connection. <button class="link" data-act="retry-cards" data-did="${did}">Retry</button></span></div>`
      : '<p class="lbl">Loading questions</p>'}
      <div><button class="btn pri lg" data-act="start" ${pool && pool.length ? '' : 'disabled'}>${ic('bolt')}Start</button></div>
    </div>
  </div>`;
}
function fbHTML(c) {
  if (c.state === 'ask') return '';
  if (c.state === 'checking') return '<div class="fb"><p class="checking">' + faceHTML('xs') + 'BOLT is marking your answer<span class="dots"><i></i><i></i><i></i></span></p></div>';
  const card = c.card, why = card.why ? `<p class="fb-why">${esc(card.why)}</p>` : '';
  if (c.state === 'self') {
    return `<div class="fb"><div class="fb-head"><strong>Compare</strong></div>${c.note ? `<p class="fb-note">${esc(c.note)}</p>` : ''}
      <p class="fb-ans"><span class="lbl">Answer</span>${esc(card.a)}</p>${why}
      <div class="fb-acts"><button class="btn pri" data-act="self" data-g="3">I had it</button><button class="btn" data-act="self" data-g="1">Partly</button><button class="btn" data-act="self" data-g="0">Missed it</button></div></div>`;
  }
  const v = c.verdict, ok = v.g >= 2, mid = v.g === 1;
  const note = v.kind === 'typo' ? `<p class="fb-note">Typo forgiven. It is spelled <b>${esc(card.a)}</b>.</p>` : v.note ? `<p class="fb-note">${esc(v.note)}</p>` : '';
  const showAns = v.kind !== 'typo' && (!ok || (c.fmt === 'sa' && norm(c.user) !== norm(card.a)));
  return `<div class="fb ${ok ? 'ok' : mid ? 'mid' : 'no'}">
    <div class="fb-head">${ic(ok ? 'check' : mid ? 'dot' : 'x')}<strong>${ok ? 'Correct' : mid ? 'Close' : 'Not quite'}</strong><span class="fb-xp">${c.gain ? '+' + c.gain + ' XP' : ''}</span></div>
    ${note}${showAns ? `<p class="fb-ans"><span class="lbl">Answer</span>${esc(card.a)}</p>` : ''}${why}
    <div class="fb-acts"><button class="btn pri" data-act="next" id="next-btn">Next${ic('arrow')}</button>
      ${c.fmt === 'sa' ? (ok ? '<button class="btn sm" data-act="override" data-g="0">Mark it wrong</button>' : '<button class="btn sm" data-act="override" data-g="3">I was right</button>') : ''}
      ${aiOK() ? `<button class="btn sm" data-act="ask-why">${faceHTML('xs')}BOLT's take</button>` : ''}
      <button class="btn sm ghost" data-act="card-edit" data-id="${card.id}">${ic('edit')}Edit</button></div></div>`;
}
const optCls = (c, i) => c.state === 'ask' ? '' : i === c.right ? ' ok' : i === c.pick ? ' no' : ' dim';
const saCls = c => c.state !== 'done' ? '' : c.verdict.g >= 2 ? ' ok' : c.verdict.g === 1 ? ' mid' : ' no';
function runTopHTML(s) {
  return `<button class="btn sm ghost" data-act="end-session">${ic('x')}<span>End</span></button>
    <div class="run-mid">${s.mode === 'quiz'
    ? `<div class="meter"><i style="width:${Math.round(s.n / s.len * 100)}%"></i></div><span class="num">${Math.min(s.n + 1, s.len)}/${s.len}</span>`
    : `<span class="lbl">Endless</span><span class="num">Q${s.n + 1}</span><span class="grow"></span><span class="score" style="font-size:13px" title="Right : wrong"><span class="g">${s.right}</span><i>:</i><span class="b">${s.wrong + s.close}</span></span>`}</div>
    <span class="pill streak-b" id="run-streak" title="Right answers in a row">${ic('spark')}<b>${s.streak}</b></span>
    <button class="btn sm" data-act="ask-claude" ${aiOK() ? '' : 'disabled'}>${faceHTML('xs')}<span>Ask</span></button>`;
}
/* the switch under a question: what the next one will be */
function nextFmtHTML(s) {
  const f = sessFmt(s);
  return `<span class="lbl" id="nf-lbl">Next question</span><div class="seg" role="group" aria-labelledby="nf-lbl">${FMTS.map(x => `<button class="seg-b" data-act="run-fmt" data-f="${x[0]}" aria-pressed="${f === x[0]}">${x[1]}</button>`).join('')}</div>`;
}
function viewRun() {
  const s = UI.sess, c = s.cur;
  if (!c) return '';
  const card = c.card, tag = c.again ? 'Again' : c.isNew ? 'New' : c.due ? 'Due' : 'Review';
  const body = c.fmt === 'mc'
    ? `<div class="opts${c.opts.every(o => o.length <= 30) ? ' two' : ''}${c.state !== 'ask' ? ' locked' : ''}" id="opts">${c.opts.map((o, i) => `<button class="opt${optCls(c, i)}" data-act="pick" data-i="${i}"><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join('')}</div>`
    : `<form class="sa${saCls(c)}" id="sa-form" autocomplete="off"><input id="sa-in" type="text" placeholder="Type your answer" aria-label="Your answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" value="${esc(c.user || '')}" ${c.state !== 'ask' ? 'readonly' : ''}><button class="btn pri" type="submit" id="sa-go">${c.state === 'done' ? 'Next' : 'Check'}</button></form>
       <div id="idk" ${c.state !== 'ask' ? 'hidden' : ''}><button class="link" data-act="idk">I don't know</button></div>`;
  return `<div class="run">
    <header class="run-top" id="run-top">${runTopHTML(s)}</header>
    <article class="q" id="q">
      <div class="q-meta"><span class="lbl">${esc(card.topic || 'General')}</span><span class="tag">${tag}</span><span class="tag">${c.fmt === 'mc' ? 'Choose' : 'Type'}</span></div>
      <h2 class="q-text">${esc(card.q)}</h2>
      ${body}
      <div id="fb">${fbHTML(c)}</div>
    </article>
    <div class="nextfmt" id="run-next">${nextFmtHTML(s)}</div>
    <p class="lbl" style="text-align:center">${esc(S.decks[s.did].name)}${UI.build && UI.build.status === 'run' && UI.build.did === s.did ? ' · writing fresh questions' : ''}</p>
  </div>`;
}
function viewDone() {
  const r = UI.done, tot = r.c + r.w;
  return `<div class="fin">
    <section class="fin-top">
      <canvas class="fin-art" data-bolt="${r.did}" data-g="${r.after.toFixed(3)}" data-from="${r.before.toFixed(3)}"></canvas>
      <p class="lbl">Session complete · ${esc(r.name)}</p>
      <h1 class="fin-score" aria-label="${r.c} right, ${r.w} wrong"><span class="g" data-count="${r.c}">${r.c}</span><i>:</i><span class="b" data-count="${r.w}">${r.w}</span></h1>
      <dl class="stats">
        <div><dt>Accuracy</dt><dd>${tot ? pct(r.c / tot) : 0}<small>%</small></dd></div>
        <div><dt>Best run</dt><dd>${r.best}</dd></div>
        <div><dt>XP</dt><dd>+${r.xp}</dd></div>
        <div><dt>Time</dt><dd style="font-size:20px;padding-top:6px">${dur(r.ms)}</dd></div>
      </dl>
      <p class="note">Deck charged from ${pct(r.before)}% to <b>${pct(r.after)}%</b>.</p>
      <div class="chips">
        <button class="btn pri lg" data-act="again">${ic('bolt')}Go again</button>
        ${r.misses.length ? '<button class="btn lg" data-act="drill-misses">Drill the misses</button>' : ''}
        ${r.misses.length && aiOK() ? `<button class="btn lg" data-act="ask-misses">${faceHTML('xs')}Go over them with BOLT</button>` : ''}
        <button class="btn lg ghost" data-act="done-home">Home</button>
      </div>
    </section>
    ${r.misses.length ? `<section class="card sec"><div class="sec-h"><h2>Missed</h2><span class="lbl">${r.misses.length}</span></div><div>${r.misses.map(m => `<div class="miss"><b>${esc(m.q)}</b><span>${esc(m.a)}</span>${m.user ? `<span class="mute"><s>${esc(m.user)}</s></span>` : ''}</div>`).join('')}</div></section>` : `<section class="card"><p class="note">Nothing missed. The whole set moves further out.</p></section>`}
  </div>`;
}

/* ----- learn ----- */
function viewLearn() {
  const ids = scopeIds();
  if (!ids.length) return needDeck('Learn', 'BOLT teaches from your own notes. Add a deck first, with a syllabus if you have one.');
  const did = UI.learn && ids.includes(UI.learn) ? UI.learn : (UI.learn = activeDeck()), d = S.decks[did], plan = d.plan || [];
  const busy = UI.planBusy === did, sub = curSub(), sj = S.subs[subOf(d)];
  return `<div class="page-h"><div><p class="lbl">Learn with BOLT${sub ? ' · ' + esc(subName(sub)) : ''}</p><h1>${esc(d.name)}</h1></div></div>
  ${ids.length > 1 ? `<div class="chips">${ids.map(id => chip(esc(S.decks[id].name), id === did, 'ln-deck', 'data-did="' + id + '"')).join('')}</div>` : ''}
  ${aiOK() ? '' : `<div class="banner">${ic('warn')}<span>BOLT is not available in this view, so lessons cannot run here. Open the page inside Claude and allow it to use Claude.</span></div>`}
  <section class="card sec"><div class="sec-h"><h2>Syllabus</h2></div>
    <div class="list">
      ${sj ? `<div class="item"><span class="item-q">${esc(sj.name)} syllabus</span><span class="item-a">${sj.syl ? Number(sj.syl).toLocaleString() + ' characters on file. BOLT marks, teaches and writes questions against it for every deck in this subject.' : 'Not added yet. Paste or upload the NESA syllabus once and BOLT marks against it exactly; until then he goes on what he knows of the course.'}</span><span class="item-r"><button class="btn sm${sj.syl ? '' : ' pri'}" data-act="sub-syl" data-id="${sj.id}">${sj.syl ? 'Edit' : 'Add'}</button></span></div>` : ''}
      <div class="item"><span class="item-q">Just for this deck</span><span class="item-a">${d.syl ? Number(d.syl).toLocaleString() + ' characters of extra dot points or outcomes for this deck.' : 'Optional: the dot points or outcomes this deck covers.'}</span><span class="item-r"><button class="btn sm" data-act="syl-edit">${d.syl ? 'Edit' : 'Add'}</button></span></div>
    </div></section>
  <section class="sec"><div class="sec-h"><h2>Lesson plan</h2>${plan.length ? `<span class="lbl">${plan.filter(l => l.st === 2).length}/${plan.length} done</span>` : ''}</div>
    ${busy ? '<div class="card"><p class="checking"><span class="dots"><i></i><i></i><i></i></span>BOLT is reading your material and planning lessons</p></div>'
    : plan.length ? `<div class="card"><div class="list">${plan.map((l, i) => `<div class="lesson${l.st === 2 ? ' done' : ''}"><span class="lesson-n">${String(i + 1).padStart(2, '0')}</span><span class="lesson-t">${esc(l.title)}</span><span class="lesson-g">${esc((l.goals || []).join(' · '))}${l.thin ? ' · thin in your notes' : ''}</span><button class="btn sm${l.st === 0 ? ' pri' : ''}" data-act="lesson-open" data-id="${l.id}" ${aiOK() ? '' : 'disabled'}>${l.st === 2 ? 'Revisit' : l.st === 1 ? 'Resume' : 'Start'}</button></div>`).join('')}</div></div>
       <div><button class="btn sm" data-act="plan-build" ${aiOK() ? '' : 'disabled'}>Rebuild the plan</button></div>`
      : `<div class="card sec"><p class="note">BOLT reads your ${d.syl ? 'syllabus and notes' : 'notes'} and lays out short lessons in order. Each one ends with questions to check yourself, and can turn into a quiz.</p><div><button class="btn pri" data-act="plan-build" ${aiOK() ? '' : 'disabled'}>Build the lesson plan</button></div></div>`}
  </section>
  <section class="card sec"><div class="sec-h"><h2>Office hours</h2></div><div class="sj-row">${faceHTML('md', { look: true })}<p class="note">Text BOLT about anything in this deck outside a lesson or a quiz. He critiques your answers the way an HSC marker would.</p></div><div><button class="btn" data-act="ask-deck" ${aiOK() ? '' : 'disabled'}>Text BOLT</button></div></section>`;
}

/* ----- library ----- */
function viewLibrary() {
  const L = UI.lib;
  if (L.mode === 'new' && UI.nd) return viewNewDeck();
  if (L.mode === 'build' && UI.build && !UI.build.quiet && UI.build.did === L.did) return viewBuild();
  if (L.mode === 'build') L.mode = S.decks[L.did] ? 'deck' : 'list';
  if (L.mode === 'deck' && S.decks[L.did]) return viewDeck(L.did);
  L.mode = 'list';
  const sub = curSub(), ids = scopeIds();
  return `<div class="page-h"><div><p class="lbl">Library</p><h1>${sub ? esc(subName(sub)) + ' decks' : 'All decks'}</h1></div><button class="btn pri" data-act="new-deck">${ic('plus')}New deck</button></div>
  ${ids.length ? `<div class="deckgrid">${ids.map(id => { const s = deckStats(id), d = S.decks[id], sj = S.subs[d.sub]; return `<button class="deck" data-act="lib-open" data-did="${id}"><canvas data-bolt="${id}" data-g="${s.mastery.toFixed(3)}"></canvas><b>${esc(d.name)}</b><span class="lbl">${!sub && sj ? esc(sj.name) + ' · ' : ''}${s.total} q · ${plural((d.srcs || []).length, 'source')}</span><div class="meter"><i style="width:${pct(s.mastery)}%"></i></div></button>`; }).join('')}</div>`
    : `<div class="card sec"><p class="note">${sub ? 'No decks in this subject yet. ' : ''}A deck holds your material and the questions written from it. Start with a page of notes or a table.</p><div><button class="btn" data-act="sample">Try the sample deck</button></div></div>`}`;
}
function cardRows(did, list) {
  const prog = S.prog[did] || {};
  if (!list.length) return '<p class="note" style="padding:10px 0">No questions match.</p>';
  return list.slice(0, 150).map(c => `<div class="item"><span class="item-q">${esc(c.q)}</span><span class="item-a">${esc(c.a)} <span class="lbl">· ${esc(c.topic || 'General')}</span></span><span class="item-r"><span class="num mute" style="font-size:12px">${pct(mastery(prog[c.id]))}%</span><button class="btn sm ghost" data-act="card-edit" data-id="${c.id}" aria-label="Edit question">${ic('edit')}</button></span></div>`).join('') +
    (list.length > 150 ? `<p class="note" style="padding:10px 0">Showing 150 of ${list.length}. Search to narrow.</p>` : '');
}
function filterCards(did) {
  const q = norm(UI.lib.q || ''), cards = S.cards[did] || [];
  return q ? cards.filter(c => norm(c.q + ' ' + c.a + ' ' + (c.topic || '')).includes(q)) : cards;
}
function subChips(cur, act) {
  const flat = S.profile.prefs.flat;
  return subIds().map(id => `<button class="chip sub" aria-pressed="${id === cur}" data-act="${act}" data-id="${id}" style="${subStyle(S.subs[id].c, flat)}"><i></i><span>${esc(S.subs[id].name)}</span></button>`).join('') +
    chip('No subject', !cur || !S.subs[cur], act, 'data-id=""');
}
function viewDeck(did) {
  const d = S.decks[did], st = deckStats(did), srcs = d.srcs || [];
  ensureCards(did);
  return `<div><button class="link" data-act="lib-back">← All decks</button></div>
  <div class="page-h"><div class="grow"><p class="lbl">Deck${S.subs[d.sub] ? ' · ' + esc(S.subs[d.sub].name) : ''}${d.sample ? ' · sample' : ''}</p><h1>${esc(d.name)}</h1></div>
    <div class="chips"><button class="btn pri" data-act="deck-study" ${st.total ? '' : 'disabled'}>${ic('bolt')}Study</button><button class="btn" data-act="deck-rename">Rename</button></div></div>
  <dl class="stats card"><div><dt>Questions</dt><dd>${st.total}</dd></div><div><dt>Mastered</dt><dd>${st.mast}</dd></div><div><dt>Due</dt><dd>${st.due}</dd></div><div><dt>Recall</dt><dd>${st.acc == null ? '—' : pct(st.acc) + '<small>%</small>'}</dd></div></dl>
  ${subIds().length ? `<section class="card sec"><div class="sec-h"><h2>Subject</h2></div><div class="chips">${subChips(d.sub, 'deck-move')}</div></section>` : ''}
  <section class="card sec"><div class="sec-h"><h2>Material</h2><button class="btn sm" data-act="src-add">${ic('plus')}Add material</button></div>
    ${srcs.length ? `<div class="list">${srcs.map(s => `<div class="item"><span class="item-q">${esc(s.name)}</span><span class="item-a">${Number(s.chars).toLocaleString()} characters</span><span class="item-r"><button class="btn sm ghost" data-act="src-rm" data-id="${s.id}" aria-label="Remove source">${ic('trash')}</button></span></div>`).join('')}</div>` : '<p class="note">No source text on file. Add notes so Claude can write more questions and teach from them.</p>'}
    <p class="note">${d.syl ? 'Syllabus on file.' : 'No syllabus yet.'} <button class="link" data-act="syl-edit">${d.syl ? 'Edit syllabus' : 'Add a syllabus'}</button></p>
  </section>
  <section class="card sec"><div class="sec-h"><h2>Questions</h2><div class="chips"><button class="btn sm" data-act="gen-more" ${aiOK() && srcs.length ? '' : 'disabled'}>Write more</button><button class="btn sm" data-act="card-add">Add one</button></div></div>
    ${S.cards[did] ? `<input class="inp" id="lib-q" type="search" placeholder="Search questions" aria-label="Search questions" value="${esc(UI.lib.q || '')}"><div class="list" id="card-list">${cardRows(did, filterCards(did))}</div>`
    : cardErr[did] === 'failed' ? `<div class="banner">${ic('warn')}<span>The questions could not be loaded. <button class="link" data-act="retry-cards" data-did="${did}">Retry</button></span></div>` : '<p class="lbl">Loading questions</p>'}
  </section>
  <div class="chips"><button class="btn sm" data-act="deck-reset">Reset progress</button><button class="btn sm danger" data-act="deck-del">${ic('trash')}Delete deck</button></div>`;
}
const FILE_ACCEPT = '.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.pdf,.docx,text/*,application/pdf';
function viewNewDeck() {
  const nd = UI.nd;
  return `<div><button class="link" data-act="lib-back">← All decks</button></div>
  <div class="page-h"><div><p class="lbl">New deck</p><h1>Bring your material</h1></div></div>
  <div class="setup">
    <div class="sec" id="nd-sub"></div>
    <label class="field"><span class="lbl">Deck name</span><input class="inp" id="nd-name" maxlength="60" placeholder="Module 5, projectile motion" value="${esc(nd.name || '')}"></label>
    <div class="field drop" id="nd-drop"><label class="lbl" for="nd-text">Notes, tables, anything</label>
      <textarea class="ta" id="nd-text" placeholder="Paste notes or a table. Rows like  term [tab] definition  become cards instantly.">${esc(nd.text || '')}</textarea>
      <div class="chips" style="align-items:center"><button class="btn sm" data-act="nd-file">${ic('file')}Add files</button><span class="note">PDF, Word, text, CSV${AI.images ? ', photos of notes' : ''}. Or drop them here.</span></div>
      <input type="file" id="nd-files" multiple hidden accept="${FILE_ACCEPT}${AI.images ? ',image/*' : ''}">
      <div class="files" id="nd-filelist"></div>
    </div>
    <div id="nd-detect"></div>
    <div class="field"><label class="lbl" for="nd-syl">Syllabus, optional</label>
      <textarea class="ta" id="nd-syl" style="min-height:76px" placeholder="Paste the syllabus dot points or learning outcomes. Questions and lessons will follow them.">${esc(nd.syl || '')}</textarea>
      <div><button class="btn sm" data-act="nd-sylfile">${ic('file')}Upload a syllabus file</button><input type="file" id="nd-sylfile" hidden accept="${FILE_ACCEPT}"></div>
    </div>
    <div class="sec" id="nd-count"></div>
    <div class="sec" id="nd-fmt"></div>
    <div class="chips"><button class="btn pri lg" data-act="nd-build" id="nd-go">Build deck</button><button class="btn lg ghost" data-act="lib-back">Cancel</button></div>
  </div>`;
}
function viewBuild() {
  const b = UI.build, d = S.decks[b.did];
  return `<div class="build">
    <p class="lbl">${esc(d ? d.name : '')}</p>
    <canvas id="build-art" data-bolt="${b.did}" data-g="${clamp(b.got / Math.max(1, b.target), 0, 1).toFixed(3)}"></canvas>
    <div class="build-n" id="build-n"></div>
    <p class="lbl" id="build-msg"></p>
    <div class="build-log" id="build-log"></div>
    <div class="chips" id="build-acts" style="justify-content:center"></div>
  </div>`;
}

/* ----- tune ----- */
function viewPrefs() {
  const p = S.profile.prefs, goal = S.profile.goal || 30, flat = p.flat, subs = subIds();
  const syncLine = S.mode === 'cloud' ? 'Signed in. Subjects, decks, progress and settings follow your Claude account onto any device where you open this page.'
    : S.mode === 'local' ? 'Not connected to an account here. Everything is kept in this browser only.' : 'Connecting.';
  return `<div class="page-h"><div><p class="lbl">Tune</p><h1>Make it yours</h1></div></div>
  ${notices()}
  <div class="prefs">
    <section class="pref"><h3>Subjects</h3>
      ${subs.length ? `<div class="list">${subs.map(id => { const s = S.subs[id]; return `<div class="item"><span class="item-q sj-row" style="${subStyle(s.c, flat)}"><i></i>${esc(s.name)}</span><span class="item-a">${plural(deckIds(id).length, 'deck')} · ${s.syl ? 'syllabus on file' : 'no syllabus yet'}</span><span class="item-r"><button class="btn sm" data-act="sub-syl" data-id="${id}">Syllabus</button><button class="btn sm" data-act="sub-edit" data-id="${id}">${ic('edit')}Edit</button></span></div>`; }).join('')}</div>` : '<p class="note">No subjects yet. Each one gets its own tab, colour and decks.</p>'}
      <div><button class="btn sm" data-act="sub-add">${ic('plus')}Add a subject</button></div>
    </section>
    <section class="pref"><h3>Base colour</h3>
      <p class="note">Each subject wears its own colour. This one is used on the All tab and for unsorted decks.</p>
      <div class="swatches">${Object.keys(PRESETS).map(k => `<button class="sw" data-act="pf-preset" data-k="${k}" aria-pressed="${p.preset === k}"><i style="background:linear-gradient(135deg,${PRESETS[k][0]},${flat ? PRESETS[k][0] : PRESETS[k][1]})"></i>${PRESETS[k][2]}</button>`).join('')}</div>
      <div class="chips" style="align-items:center">
        <label class="color"><input type="color" id="pf-a1" value="${esc(p.a1)}">From</label>
        <label class="color" ${flat ? 'hidden' : ''}><input type="color" id="pf-a2" value="${esc(p.a2)}">To</label>
        ${chip('Gradient', !flat, 'pf-flat', 'data-v="0"')}${chip('Flat colour', flat, 'pf-flat', 'data-v="1"')}
      </div>
      <p class="note">Gradient or flat applies everywhere, subjects included.</p>
    </section>
    <section class="pref"><h3>Light</h3><div class="chips">${chip('Match Claude', p.look === 'auto', 'pf-look', 'data-v="auto"')}${chip('Dark', p.look === 'dark', 'pf-look', 'data-v="dark"')}${chip('Light', p.look === 'light', 'pf-look', 'data-v="light"')}</div></section>
    <section class="pref"><h3>Motion</h3>
      <div class="chips">${chip('On', p.motion === true, 'pf-motion', 'data-v="on"')}${chip('Follow this device', p.motion !== true && p.motion !== false, 'pf-motion', 'data-v="auto"')}${chip('Off', p.motion === false, 'pf-motion', 'data-v="off"')}</div>
      <p class="note">${sysCalm() ? (p.motion === true ? 'This device asks apps to reduce motion. On overrules that, so everything animates here anyway.' : p.motion === false ? 'Everything stays still.' : 'This device asks apps to reduce motion, so the screen stays still here. Choose On to animate anyway. On Windows the device setting is Settings, Accessibility, Visual effects, Animation effects.')
    : (p.motion === false ? 'Everything stays still.' : 'Hover tilt, lightning and BOLT\u2019s face all move. Off gives a still screen.')}</p></section>
    <section class="pref"><h3>Rewards</h3>
      <div class="chips">${chip('Sound', p.sound, 'pf-toggle', 'data-k="sound"')}${chip('Vibration', p.haptic, 'pf-toggle', 'data-k="haptic"')}</div>
      <p class="note">A right answer discharges in a burst of lightning, with an optional zap.</p></section>
    <section class="pref"><h3>Daily goal</h3><div class="chips">${[10, 20, 30, 50, 100].map(n => chip(n + ' answers', goal === n, 'pf-goal', 'data-n="' + n + '"')).join('')}</div></section>
    <section class="pref"><h3>Marking typed answers</h3>
      <div class="chips">${chip('Strict', p.typo === 'strict', 'pf-typo', 'data-v="strict"')}${chip('Balanced', p.typo === 'balanced', 'pf-typo', 'data-v="balanced"')}${chip('Generous', p.typo === 'generous', 'pf-typo', 'data-v="generous"')}</div>
      <p class="note">${{ strict: 'Spelling must be exact. Case, accents and punctuation are still ignored.', balanced: 'One or two slipped letters are forgiven. Numbers must be exact, and a typo that lands on a different answer from the deck is not forgiven.', generous: 'Extra room for long or unfamiliar words.' }[p.typo]} Anything the spelling check cannot settle goes to Claude, and you can always overrule the mark.</p></section>
    <section class="pref"><h3>BOLT's pace</h3>
      <div class="chips">${chip('Quick', p.pace === 'quick', 'pf-pace', 'data-v="quick"')}${chip('Thorough', p.pace === 'thorough', 'pf-pace', 'data-v="thorough"')}${chip('Deepest', p.pace === 'deep', 'pf-pace', 'data-v="deep"')}</div>
      <p class="note">${{ quick: 'Answers start almost at once. Best for hints mid-question.', thorough: 'Thinks before replying. A short wait, more careful explanations.', deep: 'The most capable model. Slowest, for hard material.' }[p.pace]} Lessons always use at least Thorough.</p></section>
    <section class="pref"><h3>Your data</h3><p class="note">${syncLine}</p>
      <div class="sync ${S.mode === 'cloud' && !S.err ? 'ok' : ''}" id="sync-prefs"><i></i><span></span></div></section>
  </div>`;
}

/* ----- shell painting ----- */
function paintSync() {
  const state = S.mode === 'boot' ? ['', 'Opening'] : S.mode === 'local' ? ['', 'This browser only'] : S.dead ? ['bad', 'Sync stopped'] : S.err ? ['bad', 'Not saved yet'] : S.pending ? ['busy', 'Saving'] : S.stale ? ['busy', 'Connecting'] : ['ok', 'Synced to your account'];
  ['#sync-rail', '#sync-prefs'].forEach(sel => { const el = $(sel); if (!el) return; el.className = 'sync ' + state[0]; el.lastElementChild.textContent = state[1]; });
}
function paintRail() {
  const lv = level(), rank = $('#rank');
  if (rank) {
    rank.innerHTML = `<canvas data-bolt="rank-${S.uid || 'local'}" data-g="${clamp(0.12 + lv.lv / 24, 0, 1).toFixed(3)}"></canvas><div style="min-width:0"><b>Level ${lv.lv}</b><div class="meter"><i style="width:${pct(lv.p)}%"></i></div><span class="num">${lv.xp - lv.lo}/${lv.hi - lv.lo} XP</span></div>`;
    drawBolts(rank);
  }
  const off = !aiOK();
  ['#rail-claude', '#top-claude'].forEach(sel => { const el = $(sel); if (el) el.disabled = S.ready && off; });
}
function render(anim) {
  const r = UI.route, v = $('#view');
  $$('[data-nav]').forEach(a => { if (a.dataset.nav === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const exam = r === 'papers' && !!Pap.run;
  $('#app').classList.toggle('focus', (r === 'study' && !!UI.sess) || exam);
  // exam mode: the whole interface settles into the subject's colour
  const root = document.documentElement;
  if (root.classList.contains('ambient') !== exam) {
    root.classList.add('amb-t'); clearTimeout(render.ambT); render.ambT = setTimeout(() => root.classList.remove('amb-t'), 1100);
    root.classList.toggle('ambient', exam); applyLook(true);
  }
  if (!S.ready) return;
  const views = { home: viewHome, study: viewStudy, papers: viewPapers, learn: viewLearn, library: viewLibrary, prefs: viewPrefs };
  v.innerHTML = (views[r] || viewHome)();
  drawBolts(v);
  drawFaces(v);
  paintSubs(); paintRail(); paintSync();
  if (r === 'library' && UI.lib.mode === 'build') paintBuild();
  if (r === 'library' && UI.lib.mode === 'new') paintNewDeck();
  if (anim) playEnter(v);
}
function softRender() {
  const ae = document.activeElement;
  if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
  if (UI.sess || UI.sheet || (UI.route === 'study' && UI.done)) return;
  if (UI.route === 'papers' && (Pap.run || Pap.done || Pap.job)) return;
  if (UI.route === 'library' && (UI.lib.mode === 'new' || UI.lib.mode === 'build')) return;
  render();
}
