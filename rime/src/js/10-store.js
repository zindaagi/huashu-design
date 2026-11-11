/* ---------- state + storage ----------
   Cloud: everything lives in the viewer's private subtree (data/users/<id>/...), so it follows the Claude account.
     profile            settings, daily tallies, recent sessions
     s_<subject>        a subject: name, colour, order, papers      s_<subject>/syl/*   its syllabus text
     s_<subject>/pq/*   a paper's questions   s_<subject>/bp/*   marks on them   s_<subject>/pg/*   page pictures
     d_<deck>           deck record            p_<deck>   per-question memory state
     d_<deck>/cards/*   question bank chunks   d_<deck>/src/*   source text parts   d_<deck>/les/*   lesson chats
   Local: the same shape in localStorage, used when no account storage is available. */
const PREF0 = { look: 'auto', preset: 'storm', a1: '#7a6bff', a2: '#31c4ff', flat: false, motion: true, sound: false, haptic: true, pace: 'quick', typo: 'balanced' };
const STUDY0 = { mode: 'endless', len: 10, mc: true, sa: true, focus: 'adaptive', topup: true };
const profile0 = () => ({ v: 1, days: {}, goal: 30, prefs: { ...PREF0 }, pt: 0, active: null, sub: null, act: {}, study: { ...STUDY0 }, at: 0, sessions: [] });
const CHUNK = 100, PART = 60000, SRC_MAX = 600000;

const S = { ready: false, mode: 'boot', uid: null, stale: false, dead: false, err: null, pending: 0, profile: profile0(), subs: {}, subSyl: {}, pq: {}, bp: {}, decks: {}, prog: {}, progRt: {}, cards: {}, src: {}, les: {} };
let B = null;
let onStore = () => {};

function deepMerge(a, b) {
  for (const k in b) {
    const v = b[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v);
    else a[k] = v;
  }
  return a;
}

function cloudBackend(db, uid) {
  const base = 'data/users/' + uid;
  const chains = {};
  const run = (path, fn) => { const p = (chains[path] || Promise.resolve()).then(fn, fn); chains[path] = p.catch(() => {}); return p; };
  const retry = async fn => {
    try { return await fn(); }
    catch (e) { if (e && e.code === 'unavailable') { await sleep(700 + Math.random() * 900); return fn(); } throw e; }
  };
  // sub-collections hang off a deck record by default, or off a subject record or the profile when the id says so
  const sub = (did, col) => db.doc(base + '/' + (did === 'profile' || did.startsWith('s_') ? did : 'd_' + did)).collection(col);
  return {
    // with `full`: merge into the stored document, creating it from full() when it does not exist yet
    put(key, data, full) {
      const ref = db.doc(base + '/' + key);
      return run(key, () => retry(async () => {
        if (!full) return ref.set(data);
        try { await ref.update(data); }
        catch (e) { if (!e || e.code !== 'invalid_argument') throw e; await ref.set(full()); }
      }));
    },
    del(key) { return run(key, () => retry(() => db.doc(base + '/' + key).delete())); },
    subGet(did, col) { return retry(() => sub(did, col).get()).then(s => s.docs.map(d => ({ id: d.id, data: clone(d.data()) }))); },
    subOne(did, col, id) { return retry(() => sub(did, col).doc(id).get()).then(d => d.exists ? clone(d.data()) : null); },
    subPut(did, col, id, data) { return run(did + '/' + col + '/' + id, () => retry(() => sub(did, col).doc(id).set(data))); },
    subDel(did, col, id) { return run(did + '/' + col + '/' + id, () => retry(() => sub(did, col).doc(id).delete())); },
    listen(next, fail) {
      return db.collection(base).onSnapshot(snap => {
        next(snap.docChanges().map(c => ({ id: c.doc.id, data: c.type === 'removed' ? null : clone(c.doc.data()) })), snap.metadata, snap.size);
      }, fail);
    }
  };
}

function localBackend() {
  const K = 'rime:', mem = {};
  const rd = k => { try { const v = localStorage.getItem(K + k); if (v != null) return JSON.parse(v); } catch (e) {} return k in mem ? mem[k] : null; };
  const wr = (k, v) => { mem[k] = v; try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) {} };
  const rm = k => { delete mem[k]; try { localStorage.removeItem(K + k); } catch (e) {} };
  const idx = () => rd('index') || [];
  return {
    async put(key, data, full) {
      const cur = full ? rd(key) : null;
      wr(key, full ? (cur ? deepMerge(cur, clone(data)) : full()) : data);
      if (!idx().includes(key)) wr('index', idx().concat(key));
    },
    async del(key) { rm(key); wr('index', idx().filter(k => k !== key)); },
    async subGet(did, col) { const o = rd('sub:' + did + ':' + col) || {}; return Object.keys(o).map(id => ({ id, data: o[id] })); },
    async subOne(did, col, id) { const o = rd('sub:' + did + ':' + col) || {}; return o[id] || null; },
    async subPut(did, col, id, data) { const k = 'sub:' + did + ':' + col, o = rd(k) || {}; o[id] = data; wr(k, o); },
    async subDel(did, col, id) { const k = 'sub:' + did + ':' + col, o = rd(k) || {}; delete o[id]; wr(k, o); },
    listen(next) {
      const docs = idx().map(id => ({ id, data: rd(id) })).filter(d => d.data);
      Promise.resolve().then(() => next(docs, { fromCache: false }, docs.length));
      return () => {};
    }
  };
}

/* merges are monotonic, so a late echo of an older write can never undo newer local work */
function mergeProfile(o, b) {
  const days = b.days || {};
  for (const k in days) {
    const x = o.days[k], y = days[k] || {};
    o.days[k] = { n: Math.max(x ? x.n | 0 : 0, y.n | 0), c: Math.max(x ? x.c | 0 : 0, y.c | 0), x: Math.max(x ? x.x | 0 : 0, y.x | 0) };
  }
  if ((b.pt || 0) > (o.pt || 0)) { o.prefs = { ...PREF0, ...(b.prefs || {}) }; o.goal = b.goal || o.goal; o.pt = b.pt; }
  if ((b.at || 0) > (o.at || 0)) { o.active = b.active || null; o.sub = b.sub || null; o.act = { ...(b.act || {}) }; o.study = { ...STUDY0, ...(b.study || {}) }; o.at = b.at; }
  const seen = new Set(o.sessions.map(s => s.t));
  for (const s of (b.sessions || [])) if (s && !seen.has(s.t)) o.sessions.push(s);
  o.sessions.sort((x, y) => y.t - x.t);
  o.sessions.length = Math.min(o.sessions.length, 12);
}
function mergeProg(did, remote, rt) {
  const loc = S.prog[did] || (S.prog[did] = {});
  if (rt && rt > (S.progRt[did] || 0)) {
    S.progRt[did] = rt;
    for (const id in loc) if ((loc[id][6] || 0) < rt) delete loc[id];
  }
  const cut = S.progRt[did] || 0;
  for (const id in remote) {
    const r = remote[id];
    if (!Array.isArray(r) || (r[6] || 0) < cut) continue;
    const l = loc[id];
    if (!l || (r[6] || 0) > (l[6] || 0)) loc[id] = r.slice();
  }
}
const cardLoads = {}, srcLoads = {};
function applyChange(ch) {
  const id = ch.id;
  if (id === 'profile') { if (ch.data) mergeProfile(S.profile, ch.data); return; }
  if (id.startsWith('s_')) {
    const sid = id.slice(2);
    if (!ch.data) { delete S.subs[sid]; delete S.subSyl[sid]; }
    else if (!S.subs[sid] || (ch.data.ut || 0) >= (S.subs[sid].ut || 0)) {
      if (S.subs[sid] && (S.subs[sid].sv || 0) !== (ch.data.sv || 0)) delete S.subSyl[sid];
      S.subs[sid] = Object.assign({ id: sid }, ch.data);
    }
    return;
  }
  if (id.startsWith('d_')) {
    const did = id.slice(2);
    if (!ch.data) { delete S.decks[did]; delete S.cards[did]; delete S.src[did]; return; }
    const loc = S.decks[did];
    if (!loc || (ch.data.ut || 0) >= (loc.ut || 0)) {
      const stale = loc && S.cards[did] && loc.cv !== ch.data.cv;
      S.decks[did] = ch.data;
      if (stale) { delete S.cards[did]; delete S.src[did]; Store.loadCards(did).then(() => onStore(), () => {}); }
    }
    return;
  }
  if (id.startsWith('p_')) {
    const did = id.slice(2);
    if (ch.data) mergeProg(did, ch.data.m || {}, ch.data.rt || 0); else delete S.prog[did];
  }
}

const dirty = { profile: false, prog: {} };
let flushT = 0, lastFail = '', lastFailT = 0;
function track(p) {
  S.pending++; onStore('sync');
  return p.then(v => { S.pending--; S.err = null; onStore('sync'); return v; },
    e => { S.pending--; S.err = (e && e.code) || 'error'; onStore('sync'); throw e; });
}
function saveFailed(e) {
  const c = (e && e.code) || 'error';
  if (c === lastFail && now() - lastFailT < 8000) return;
  lastFail = c; lastFailT = now();
  onStore('fail', c);
}

const Store = {
  async boot() {
    let db = null, user = null;
    if (window.claude && typeof window.claude.use === 'function') {
      try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } catch (e) {}
    }
    let id = null;
    if (db && user) { try { id = await user.id(); } catch (e) {} }
    if (db && id) { S.mode = 'cloud'; S.uid = id; B = cloudBackend(db, id); }
    else { S.mode = 'local'; B = localBackend(); }
    const slow = setTimeout(() => { S.stale = true; S.ready = true; onStore(); }, 6000);
    const sig = () => {
      let p = '';
      for (const did in S.prog) { let n = 0, last = 0; for (const id in S.prog[did]) { n++; if (S.prog[did][id][6] > last) last = S.prog[did][id][6]; } p += did + n + ':' + last + ';'; }
      return JSON.stringify([S.profile, S.decks, S.subs]) + p + S.stale + S.ready;
    };
    B.listen((changes, meta, size) => {
      const was = sig();
      changes.forEach(applyChange);
      if (!meta.fromCache) { clearTimeout(slow); S.stale = false; S.ready = true; }
      else if (size > 0) S.ready = true;
      onStore(was === sig() ? 'same' : undefined);
    }, e => {
      clearTimeout(slow);
      S.err = (e && e.code) || 'error'; S.dead = true; S.ready = true;
      onStore();
    });
  },
  later() { clearTimeout(flushT); flushT = setTimeout(Store.flush, 900); },
  saveProfile() { dirty.profile = true; Store.later(); },
  touchPrefs() { S.profile.pt = now(); Store.saveProfile(); },
  touchActive() { S.profile.at = now(); Store.saveProfile(); },
  progDirty(did, cid) { (dirty.prog[did] || (dirty.prog[did] = new Set())).add(cid); Store.later(); },
  flush() {
    clearTimeout(flushT); flushT = 0;
    if (!B) return;
    if (dirty.profile) {
      dirty.profile = false;
      const data = clone(S.profile);
      track(B.put('profile', data, () => data)).catch(e => { dirty.profile = true; saveFailed(e); });
    }
    for (const did of Object.keys(dirty.prog)) {
      const ids = Array.from(dirty.prog[did]);
      delete dirty.prog[did];
      if (!S.decks[did]) continue;
      const m = {};
      for (const id of ids) { const p = S.prog[did] && S.prog[did][id]; if (p) m[id] = p; }
      track(B.put('p_' + did, { m, t: now() }, () => ({ k: 'prog', m: clone(S.prog[did] || {}), rt: S.progRt[did] || 0, t: now() })))
        .catch(e => { const set = dirty.prog[did] || (dirty.prog[did] = new Set()); ids.forEach(id => set.add(id)); saveFailed(e); });
    }
  },
  saveDeck(did) {
    const d = S.decks[did];
    if (!d) return Promise.resolve();
    d.ut = now();
    return track(B.put('d_' + did, clone(d))).catch(saveFailed);
  },
  saveSub(id) {
    const s = S.subs[id];
    if (!s) return Promise.resolve();
    s.ut = now();
    return track(B.put('s_' + id, clone(s))).catch(saveFailed);
  },
  // decks in a deleted subject are kept and become unsorted
  async deleteSub(id) {
    delete S.subs[id];
    const moved = Object.keys(S.decks).filter(did => S.decks[did].sub === id);
    for (const did of moved) { delete S.decks[did].sub; await Store.saveDeck(did); }
    if (S.profile.sub === id) { S.profile.sub = null; Store.touchActive(); }
    delete S.subSyl[id];
    try {
      for (const col of ['syl', 'pq', 'bp', 'pg', 'chat']) {
        const docs = await B.subGet('s_' + id, col);
        await Promise.all(docs.map(d => B.subDel('s_' + id, col, d.id)));
      }
    } catch (e) {}
    return track(B.del('s_' + id)).catch(saveFailed);
  },
  /* past papers: questions, the marks earned on them, and pictures of pages that carry diagrams */
  loadQs(sid, pid) {
    const k = sid + '/' + pid;
    return S.pq[k] ? Promise.resolve(S.pq[k]) : B.subOne('s_' + sid, 'pq', pid).then(d => (S.pq[k] = (d && d.qs) || []));
  },
  saveQs(sid, pid, qs) { S.pq[sid + '/' + pid] = qs; return track(B.subPut('s_' + sid, 'pq', pid, { qs })).catch(saveFailed); },
  loadBP(sid, pid) {
    const k = sid + '/' + pid;
    return S.bp[k] ? Promise.resolve(S.bp[k]) : B.subOne('s_' + sid, 'bp', pid).then(d => (S.bp[k] = (d && d.m) || {}));
  },
  saveBP(sid, pid) { return track(B.subPut('s_' + sid, 'bp', pid, { m: S.bp[sid + '/' + pid] || {}, t: now() })).catch(saveFailed); },
  savePage(sid, pid, n, img) { return track(B.subPut('s_' + sid, 'pg', pid + '_' + n, { img })).catch(saveFailed); },
  loadPage(sid, pid, n) { return B.subOne('s_' + sid, 'pg', pid + '_' + n).then(d => (d && d.img) || ''); },
  async deletePaper(sid, pid) {
    const sj = S.subs[sid], p = sj && (sj.papers || []).find(x => x.id === pid);
    if (!p) return;
    sj.papers = sj.papers.filter(x => x.id !== pid);
    delete S.pq[sid + '/' + pid]; delete S.bp[sid + '/' + pid];
    try { await Promise.all([B.subDel('s_' + sid, 'pq', pid), B.subDel('s_' + sid, 'bp', pid)].concat((p.pages || []).map(n => B.subDel('s_' + sid, 'pg', pid + '_' + n)))); } catch (e) {}
    return Store.saveSub(sid);
  },
  loadSubSyl(id) {
    if (S.subSyl[id] != null) return Promise.resolve(S.subSyl[id]);
    const s = S.subs[id];
    if (!s || !s.syl) return Promise.resolve(S.subSyl[id] = '');
    return B.subGet('s_' + id, 'syl').then(docs => {
      docs.sort((a, b) => (a.data.i | 0) - (b.data.i | 0));
      return (S.subSyl[id] = docs.map(d => d.data.text || '').join(''));
    });
  },
  async setSubSyl(id, text) {
    const s = S.subs[id];
    if (!s) return;
    text = String(text || '').slice(0, 300000);
    const n = Math.ceil(text.length / PART), old = s.sylParts | 0, jobs = [];
    for (let i = 0; i < n; i++) jobs.push(B.subPut('s_' + id, 'syl', String(i), { i, text: text.slice(i * PART, (i + 1) * PART) }));
    for (let i = n; i < old; i++) jobs.push(B.subDel('s_' + id, 'syl', String(i)));
    await track(Promise.all(jobs));
    s.syl = text.length; s.sylParts = n; s.sv = now();
    S.subSyl[id] = text;
    return Store.saveSub(id);
  },
  resetProg(did) {
    S.prog[did] = {}; S.progRt[did] = now(); delete dirty.prog[did];
    return track(B.put('p_' + did, { k: 'prog', m: {}, rt: S.progRt[did], t: now() })).catch(saveFailed);
  },
  loadCards(did) {
    if (S.cards[did]) return Promise.resolve(S.cards[did]);
    if (!S.decks[did]) return Promise.resolve([]);
    return cardLoads[did] || (cardLoads[did] = B.subGet(did, 'cards').then(docs => {
      cardLoads[did] = null;
      docs.sort((a, b) => (a.data.i | 0) - (b.data.i | 0));
      const all = [];
      for (const d of docs) for (const c of (d.data.cards || [])) all.push(c);
      // an empty answer for a deck that has questions means the store has not caught up: never treat it as empty
      if (!all.length && S.decks[did] && (S.decks[did].count | 0) > 0) throw { code: 'unavailable' };
      S.cards[did] = all;
      return all;
    }, e => { cardLoads[did] = null; throw e; }));
  },
  async saveCards(did, from = 0) {
    const cards = S.cards[did] || [], d = S.decks[did];
    if (!d) return;
    const n = Math.ceil(cards.length / CHUNK), old = d.chunks | 0, jobs = [];
    for (let i = Math.floor(from / CHUNK); i < n; i++) jobs.push(B.subPut(did, 'cards', String(i), { i, cards: cards.slice(i * CHUNK, (i + 1) * CHUNK) }));
    for (let i = n; i < old; i++) jobs.push(B.subDel(did, 'cards', String(i)));
    d.chunks = n; d.count = cards.length; d.cv = now();
    try { await track(Promise.all(jobs)); } catch (e) { saveFailed(e); }
    return Store.saveDeck(did);
  },
  loadSrc(did) {
    if (S.src[did]) return Promise.resolve(S.src[did]);
    return srcLoads[did] || (srcLoads[did] = B.subGet(did, 'src').then(docs => {
      srcLoads[did] = null;
      const by = {};
      for (const d of docs) (by[d.data.s] || (by[d.data.s] = [])).push(d.data);
      const join = id => (by[id] || []).sort((a, b) => a.i - b.i).map(p => p.text).join('');
      const out = { syllabus: join('syl'), parts: [] };
      for (const s of ((S.decks[did] || {}).srcs || [])) out.parts.push({ id: s.id, name: s.name, text: join(s.id) });
      S.src[did] = out;
      return out;
    }, e => { srcLoads[did] = null; throw e; }));
  },
  async putText(did, sid, text) {
    const n = Math.ceil(text.length / PART), jobs = [];
    for (let i = 0; i < n; i++) jobs.push(B.subPut(did, 'src', sid + '_' + i, { s: sid, i, text: text.slice(i * PART, (i + 1) * PART) }));
    await track(Promise.all(jobs));
    return n;
  },
  async addSrc(did, name, text) {
    const d = S.decks[did], src = await Store.loadSrc(did);
    text = String(text).slice(0, SRC_MAX);
    const sid = mkid('s');
    const parts = await Store.putText(did, sid, text);
    (d.srcs || (d.srcs = [])).push({ id: sid, name: String(name).slice(0, 80), chars: text.length, parts, t: now() });
    src.parts.push({ id: sid, name, text });
    await Store.saveDeck(did);
    return sid;
  },
  async setSyllabus(did, text) {
    const d = S.decks[did], src = await Store.loadSrc(did);
    text = String(text || '').slice(0, 120000);
    const old = d.sylParts | 0;
    const parts = text ? await Store.putText(did, 'syl', text) : 0;
    const jobs = [];
    for (let i = parts; i < old; i++) jobs.push(B.subDel(did, 'src', 'syl_' + i));
    if (jobs.length) await track(Promise.all(jobs));
    d.syl = text.length; d.sylParts = parts; src.syllabus = text;
    return Store.saveDeck(did);
  },
  async removeSrc(did, sid) {
    const d = S.decks[did], s = (d.srcs || []).find(x => x.id === sid);
    if (!s) return;
    const jobs = [];
    for (let i = 0; i < (s.parts | 0); i++) jobs.push(B.subDel(did, 'src', sid + '_' + i));
    try { await track(Promise.all(jobs)); } catch (e) { saveFailed(e); }
    d.srcs = d.srcs.filter(x => x.id !== sid);
    if (S.src[did]) S.src[did].parts = S.src[did].parts.filter(p => p.id !== sid);
    return Store.saveDeck(did);
  },
  async loadLesson(did, lid) {
    const k = did + '/' + lid;
    if (S.les[k]) return S.les[k];
    const docs = await B.subGet(did, 'les');
    for (const d of docs) if (!S.les[did + '/' + d.id]) S.les[did + '/' + d.id] = d.data.turns || [];
    return S.les[k] || (S.les[k] = []);
  },
  saveLesson(did, lid, turns) {
    const keep = turns.slice(-40).map(t => ({ role: t.role, content: String(t.content).slice(0, 6000), auto: !!t.auto }));
    return track(B.subPut(did, 'les', lid, { turns: keep, t: now() })).catch(saveFailed);
  },
  /* BOLT's open chats are kept: one for all subjects, one per subject, one per deck */
  chatAt(key) {
    if (key === 'all') return ['profile', 'all'];
    if (key.startsWith('sub:')) return S.subs[key.slice(4)] ? ['s_' + key.slice(4), 'free'] : null;
    return S.decks[key] ? [key, 'free'] : null;
  },
  async loadChat(key) {
    const at = Store.chatAt(key);
    if (!at) return [];
    const d = await B.subOne(at[0], 'chat', at[1]);
    return d && Array.isArray(d.turns) ? d.turns.filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string') : [];
  },
  saveChat(key, turns) {
    const at = Store.chatAt(key);
    if (!at) return Promise.resolve();
    const keep = turns.slice(-40).map(t => ({ role: t.role, content: String(t.content).slice(0, 6000), auto: !!t.auto }));
    return track(B.subPut(at[0], 'chat', at[1], { turns: keep, t: now() })).catch(() => {});
  },
  async deleteDeck(did) {
    delete S.decks[did]; delete S.cards[did]; delete S.src[did]; delete S.prog[did]; delete dirty.prog[did];
    try {
      for (const col of ['cards', 'src', 'les', 'chat']) {
        const docs = await B.subGet(did, col);
        await Promise.all(docs.map(d => B.subDel(did, col, d.id)));
      }
      await track(Promise.all([B.del('d_' + did), B.del('p_' + did)]));
    } catch (e) { saveFailed(e); }
  }
};

function today() { const k = dayKey(); return S.profile.days[k] || (S.profile.days[k] = { n: 0, c: 0, x: 0 }); }
function totalXP() { let x = 0; const d = S.profile.days; for (const k in d) x += d[k].x | 0; return x; }
function level(xp = totalXP()) {
  const lv = Math.floor(Math.sqrt(xp / 60)) + 1, lo = 60 * (lv - 1) ** 2, hi = 60 * lv ** 2;
  return { lv, lo, hi, xp, p: (xp - lo) / (hi - lo) };
}
function dayStreak() {
  const d = S.profile.days;
  let k = dayKey(), n = 0;
  if (!(d[k] && d[k].n)) k = dayShift(k, -1);
  while (d[k] && d[k].n) { n++; k = dayShift(k, -1); }
  return n;
}
function bestStreak() {
  const d = S.profile.days, keys = Object.keys(d).filter(k => d[k].n).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) { run = prev && dayShift(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; }
  return best;
}
/* subjects: '_' stands for decks that belong to no (existing) subject */
const subIds = () => Object.keys(S.subs).sort((a, b) => ((S.subs[a].o || 0) - (S.subs[b].o || 0)) || ((S.subs[a].t || 0) - (S.subs[b].t || 0)));
const subOf = d => d && d.sub && S.subs[d.sub] ? d.sub : '_';
function deckIds(sub) {
  let ids = Object.keys(S.decks);
  if (sub) ids = ids.filter(id => subOf(S.decks[id]) === sub);
  return ids.sort((a, b) => (S.decks[b].created || 0) - (S.decks[a].created || 0));
}
// the subject tab in view: a subject id, '_' for unsorted, or null for all subjects
function curSub() {
  const s = S.profile.sub;
  if (s === '_') return subIds().length && deckIds('_').length ? '_' : null;
  return s && S.subs[s] ? s : null;
}
function activeDeck(sub) {
  if (sub === undefined) sub = curSub();
  const ids = deckIds(sub || undefined), act = S.profile.act || {};
  const a = act[sub || '*'];
  if (a && ids.includes(a)) return a;
  return S.profile.active && ids.includes(S.profile.active) ? S.profile.active : (ids[0] || null);
}
function setActive(did) {
  const act = S.profile.act || (S.profile.act = {});
  act[subOf(S.decks[did])] = did; act['*'] = did;
  S.profile.active = did;
  Store.touchActive();
}
