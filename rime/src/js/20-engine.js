/* ---------- memory model, question picking, marking ----------
   Per-question state: [due, intervalDays, ease, reps, lapses, streak, last, seen, right] */
const P = { DUE: 0, IVL: 1, EASE: 2, REPS: 3, LAPSES: 4, STREAK: 5, LAST: 6, SEEN: 7, RIGHT: 8 };

function mastery(p) {
  if (!p || !p[P.SEEN]) return 0;
  const m = clamp(Math.log2(1 + p[P.IVL]) / Math.log2(22), 0, 1);
  return p[P.STREAK] === 0 ? Math.min(m, 0.15) : m;
}

// g: 0 wrong, 1 close, 2 recognised (multiple choice), 3 recalled (typed)
function review(did, cid, g, fmt) {
  const t = now();
  const map = S.prog[did] || (S.prog[did] = {});
  const p = map[cid] ? map[cid].slice() : [0, 0, 2.3, 0, 0, 0, 0, 0, 0];
  const first = p[P.SEEN] === 0, prevLast = p[P.LAST], prevIvl = p[P.IVL];
  p[P.SEEN]++; p[P.LAST] = t;
  if (g >= 2) {
    p[P.RIGHT]++; p[P.STREAK]++; p[P.REPS]++;
    let ivl;
    if (first) ivl = fmt === 'sa' ? 2 : 1;
    else if (prevIvl < 1) ivl = 1;
    else {
      // growth scales with how much of the interval actually elapsed, so cramming does not inflate it
      const elapsed = clamp((t - prevLast) / (prevIvl * DAY), 0, 2.5);
      const gain = p[P.EASE] * (fmt === 'mc' ? 0.78 : 1);
      ivl = prevIvl * (1 + (gain - 1) * Math.min(1, elapsed)) + Math.max(0, elapsed - 1) * prevIvl * 0.5;
    }
    p[P.IVL] = Math.min(ivl, 365);
    p[P.EASE] = clamp(p[P.EASE] + (fmt === 'sa' ? 0.06 : 0.03), 1.3, 3);
    p[P.DUE] = t + p[P.IVL] * DAY * (0.95 + Math.random() * 0.1);
  } else if (g === 1) {
    p[P.STREAK] = 0;
    p[P.IVL] = Math.max(0.2, prevIvl * 0.5);
    p[P.EASE] = clamp(p[P.EASE] - 0.08, 1.3, 3);
    p[P.DUE] = t + 10 * 60e3;
  } else {
    if (!first) p[P.LAPSES]++;
    p[P.STREAK] = 0;
    p[P.IVL] = prevIvl * 0.2;
    p[P.EASE] = clamp(p[P.EASE] - 0.2, 1.3, 3);
    p[P.DUE] = t + 60e3;
  }
  for (let i = 1; i < 3; i++) p[i] = Math.round(p[i] * 1000) / 1000;
  p[P.DUE] = Math.round(p[P.DUE]);
  map[cid] = p;
  return p;
}

function deckStats(did) {
  const cards = S.cards[did], prog = S.prog[did] || {}, t = now();
  const total = cards ? cards.length : ((S.decks[did] || {}).count | 0);
  let seen = 0, due = 0, mast = 0, sum = 0, right = 0, tries = 0;
  const each = p => {
    if (!p || !p[P.SEEN]) return;
    seen++; tries += p[P.SEEN]; right += p[P.RIGHT];
    const m = mastery(p); sum += m;
    if (m >= 0.8) mast++;
    if (p[P.DUE] <= t) due++;
  };
  if (cards) for (const c of cards) each(prog[c.id]); else for (const id in prog) each(prog[id]);
  seen = Math.min(seen, total);
  return { total, seen, due: Math.min(due, total), fresh: Math.max(0, total - seen), mast: Math.min(mast, total), mastery: total ? Math.min(1, sum / total) : 0, acc: tries ? right / tries : null };
}
function topicStats(did) {
  const cards = S.cards[did] || [], prog = S.prog[did] || {}, by = {};
  for (const c of cards) {
    const k = c.topic || 'General', o = by[k] || (by[k] = { topic: k, n: 0, seen: 0, sum: 0, right: 0, tries: 0, lapses: 0 });
    o.n++;
    const p = prog[c.id];
    if (p && p[P.SEEN]) { o.seen++; o.sum += mastery(p); o.right += p[P.RIGHT]; o.tries += p[P.SEEN]; o.lapses += p[P.LAPSES]; }
  }
  return Object.values(by).map(o => {
    o.m = o.n ? o.sum / o.n : 0;
    o.acc = o.tries ? o.right / o.tries : null;
    o.score = 0.55 * (o.seen ? o.sum / o.seen : 0) + 0.45 * (o.acc == null ? 0 : o.acc);
    return o;
  });
}
function weakTopics(did, n = 4) {
  return topicStats(did).filter(t => t.seen > 0 && (t.acc < 0.85 || t.lapses > 0)).sort((a, b) => a.score - b.score).slice(0, n);
}
function strongTopics(did, n = 4) {
  return topicStats(did).filter(t => t.seen >= 2 && t.acc >= 0.75).sort((a, b) => b.score - a.score).slice(0, n);
}
const topicList = did => Array.from(new Set((S.cards[did] || []).map(c => c.topic || 'General')));

/* ----- picking the next question ----- */
function pickNext(s) {
  const t = now(), prog = S.prog[s.did] || {};
  const dueWaiting = s.pool.some(c => { const p = prog[c.id]; return p && p[P.SEEN] && p[P.DUE] <= t && !s.recent.includes(c.id); });
  const scored = [];
  let held = null;
  for (const c of s.pool) {
    if (s.mode === 'quiz' && s.asked.has(c.id)) continue;
    if (s.recent.includes(c.id)) { held = held || c; continue; }
    const p = prog[c.id], seen = !!(p && p[P.SEEN]), m = mastery(p);
    const again = s.again.get(c.id);
    let sc;
    if (again != null) {
      if (again > s.n) { held = held || c; continue; }
      sc = 500 + (s.n - again);
    } else if (s.focus === 'weak') {
      sc = seen ? 30 + (1 - m) * 50 + Math.min(20, p[P.LAPSES] * 6) + (p[P.RIGHT] / p[P.SEEN] < 0.6 ? 10 : 0) + (p[P.DUE] <= t ? 5 : 0) : 34;
    } else if (s.focus === 'strong') {
      sc = seen ? m * 60 + (p[P.RIGHT] / p[P.SEEN]) * 20 + (p[P.DUE] <= t ? 10 : 0) : 4;
    } else if (!seen) {
      sc = s.newRun >= 2 && dueWaiting ? 24 : 46;
    } else if (p[P.DUE] <= t) {
      sc = 60 + Math.min(25, ((t - p[P.DUE]) / DAY) * 4) + (1 - m) * 15;
    } else {
      sc = Math.max(1, 10 + (1 - m) * 20 - Math.min(10, (p[P.DUE] - t) / DAY));
    }
    scored.push([sc + Math.random() * 8, c]);
  }
  if (!scored.length) return s.mode === 'endless' ? held : null;
  scored.sort((a, b) => b[0] - a[0]);
  const top = scored.slice(0, 4), lo = top[top.length - 1][0];
  let sum = 0;
  for (const x of top) sum += x[0] - lo + 4;
  let r = Math.random() * sum;
  for (const x of top) { r -= x[0] - lo + 4; if (r <= 0) return x[1]; }
  return top[0][1];
}
function buildOptions(did, card) {
  const seen = new Set([norm(card.a)]), out = [];
  const add = v => { const k = norm(v); if (!k || seen.has(k)) return; seen.add(k); out.push(String(v)); };
  shuffle((card.d || []).slice()).forEach(add);
  if (out.length < 3) {
    const others = shuffle((S.cards[did] || []).filter(c => c.id !== card.id));
    const len = String(card.a).length;
    others.sort((a, b) => ((b.topic === card.topic) - (a.topic === card.topic)) || (Math.abs(String(a.a).length - len) - Math.abs(String(b.a).length - len)));
    for (const o of others) { if (out.length >= 3) break; add(o.a); }
  }
  if (!out.length) return null;
  return shuffle([String(card.a)].concat(out.slice(0, 3)));
}
function chooseFmt(s, card, p) {
  if (s.mc && !s.sa) return 'mc';
  if (s.sa && !s.mc) return 'sa';
  const m = mastery(p);
  let pSA = p && p[P.SEEN] ? 0.25 + 0.6 * m : 0.15;
  if (String(card.a).length > 48) pSA *= 0.3;
  return Math.random() < pSA ? 'sa' : 'mc';
}

/* ----- marking typed answers ----- */
const STOPW = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'is', 'are', 'it', 'its', 'on', 'for', 'with', 'by', 'as', 'at']);
function norm(s) {
  return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[‘’'`]/g, '')
    .replace(/[^\p{L}\p{N}%+.\s]/gu, ' ')
    .replace(/\.(?!\d)/g, ' ').replace(/(^|\s)\.(?=\d)/g, (m, a) => a + '0.')
    .replace(/\s+/g, ' ').replace(/ %/g, '%').trim().replace(/^(the|a|an)\s+/, '');
}
function variants(s) {
  const out = new Set(), base = String(s == null ? '' : s);
  const add = x => { x = norm(x); if (x) out.add(x); };
  add(base);
  add(base.replace(/\([^)]*\)/g, ' '));
  const inner = base.match(/\(([^)]+)\)/);
  if (inner && /^[A-Z0-9.\-]{2,8}$/.test(inner[1].trim())) add(inner[1]);
  if (/\s\/\s|;|\sor\s/i.test(base)) base.split(/\s\/\s|;|\sor\s/i).forEach(add);
  return out;
}
function nums(s) {
  const t = String(s == null ? '' : s).replace(/(\d),(?=\d{3}(\D|$))/g, '$1').replace(/\u2212/g, '-');
  const out = [], re = /\d+(?:\.\d+)?/g;
  let m;
  // a minus counts as a sign only at the start or after a space, bracket or equals, so "1914-1918" stays two positive years
  while ((m = re.exec(t))) out.push(Number(m[0]) * (t[m.index - 1] === '-' && (m.index === 1 || /[\s(=]/.test(t[m.index - 2])) ? -1 : 1));
  return out;
}
function editDist(a, b, max) {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > max) return max + 1;
  if (!n) return m;
  if (!m) return n;
  let p2 = null, p1 = [], cur = [];
  for (let j = 0; j <= m; j++) p1[j] = j;
  for (let i = 1; i <= n; i++) {
    cur = [i];
    let lo = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      cur[j] = v;
      if (v < lo) lo = v;
    }
    if (lo > max) return max + 1;
    p2 = p1; p1 = cur;
  }
  return p1[m];
}
function typoBudget(len, level) {
  if (level === 'strict' || len <= 3) return 0;
  const b = len <= 6 ? 1 : len <= 11 ? 2 : len <= 18 ? 3 : 4;
  return level === 'generous' ? b + 1 : b;
}
/* returns {kind:'correct'|'typo'|'wrong'|'unsure', g?, note?}; 'unsure' goes to Claude or to self-marking */
function gradeLocal(card, input, others, level) {
  const u = norm(input);
  if (!u) return { kind: 'wrong', g: 0 };
  const refs = new Set();
  [card.a].concat(card.alts || []).forEach(x => variants(x).forEach(v => refs.add(v)));
  if (refs.has(u)) return { kind: 'correct', g: 3 };
  const bag = x => x.split(' ').filter(w => w && !STOPW.has(w)).sort().join(' ');
  const ub = bag(u);
  if (ub) for (const r of refs) if (bag(r) === ub) return { kind: 'correct', g: 3 };
  const rn = nums(card.a), un = nums(input);
  if (rn.length) {
    const same = rn.length === un.length && rn.every((x, i) => Math.abs(x - un[i]) <= Math.abs(x) * 1e-9 + 1e-9);
    const pure = rn.length === 1 && /^[-+−]?[\d.,\s]+[^\d]{0,12}$/.test(String(card.a).trim());
    if (same && pure) return { kind: 'correct', g: 3 };
    if (!same) {
      if (pure && un.length === 1 && (!/\d\.\d/.test(String(card.a)) || Math.abs(rn[0] - un[0]) / Math.max(Math.abs(rn[0]), 1e-9) > 0.02)) return { kind: 'wrong', g: 0 };
      return { kind: 'unsure' };
    }
  }
  if (others.has(u)) return { kind: 'wrong', g: 0, note: 'That is a different answer from this deck.' };
  let best = 99;
  for (const r of refs) {
    const budget = typoBudget(r.length, level);
    if (!budget) continue;
    const d = editDist(u, r, budget);
    if (d <= budget && d < best) best = d;
  }
  if (best < 99) return { kind: 'typo', g: 3 };
  return { kind: 'unsure' };
}
function otherAnswers(did, card) {
  const out = new Set();
  for (const c of (S.cards[did] || [])) if (c.id !== card.id) out.add(norm(c.a));
  for (const d of (card.d || [])) out.add(norm(d));
  variants(card.a).forEach(v => out.delete(v));
  (card.alts || []).forEach(a => out.delete(norm(a)));
  return out;
}

/* ----- tables and text ----- */
function parseCSV(text, sep) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"' && !cell) q = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter(r => r.some(c => c));
}
function parseTable(text, hint) {
  const src = String(text || '').replace(/\r/g, '');
  const lines = src.split('\n').filter(l => l.trim());
  if (lines.length < 3) return null;
  const share = fn => lines.filter(fn).length / lines.length;
  let rows = null, header = false;
  const uniform = r => r.length >= 3 && r[0].length >= 2 && r[0].length <= 8 && r.every(x => x.length === r[0].length);
  if (share(l => /^\s*\|.*\|\s*$/.test(l)) >= 0.8) {
    header = lines.some(l => /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(l));
    rows = lines.filter(l => !/^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  } else if (share(l => l.includes('\t')) >= 0.8) {
    rows = parseCSV(src, '\t');
  } else if (hint === 'csv' || (share(l => l.includes(',')) >= 0.9 && src.length / lines.length < 160 && uniform(parseCSV(src, ',')))) {
    rows = parseCSV(src, ',');
  } else if (share(l => l.includes(';')) >= 0.9 && new Set(lines.map(l => l.split(';').length)).size === 1) {
    rows = parseCSV(src, ';');
  } else {
    const re = /^\s*(?:[-*•]\s+|\d+[.)]\s+)?(.{1,70}?)\s*(?:::|:|=|\s[-–—]\s|→|->)\s*(\S.*)$/;
    if (share(l => re.test(l)) >= 0.85) rows = lines.map(l => l.match(re)).filter(Boolean).map(m => [m[1].trim(), m[2].trim()]);
  }
  if (!rows) return null;
  rows = rows.filter(r => r.length >= 2 && r[0] && r.slice(1).some(c => c));
  if (rows.length < 3) return null;
  const cols = Math.max.apply(null, rows.map(r => r.length));
  if (!header) header = rows[0].every(c => c.length < 28 && !/\d{2,}/.test(c)) && /^(term|word|name|question|prompt|concept|key|item|topic|front|date|year|symbol|element|country|formula)s?$/i.test(rows[0][0]);
  return { rows, cols, header };
}
function rowsToCards(tb, opts) {
  const rows = tb.rows.slice(opts.header ? 1 : 0), head = opts.header ? tb.rows[0] : null, cards = [];
  const mk = (q, a, topic, why) => { q = str(q, 400); a = str(a, 240); if (q && a) cards.push({ id: mkid('c'), q, a, alts: [], d: [], topic: str(topic, 40) || 'General', why: str(why, 320) }); };
  for (const r of rows) {
    if (tb.cols > 2 && head) {
      for (let j = 1; j < r.length; j++) if (r[j] && head[j]) mk(r[0] + ' — ' + head[j] + '?', r[j], head[j], '');
    } else {
      mk(r[0], r[1], head ? head[1] : opts.topic, r.slice(2).filter(Boolean).join(' · '));
      if (opts.both && r[1] && r[1].length <= 80) mk(r[1], r[0], head ? head[0] : opts.topic, '');
    }
  }
  return cards;
}
function splitSections(text, size) {
  const paras = String(text || '').split(/\n\s*\n/), out = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (let p of paras) {
    while (p.length > size) { push(); out.push(p.slice(0, size)); p = p.slice(size); }
    if (cur.length + p.length + 2 > size) push();
    cur += (cur ? '\n\n' : '') + p;
  }
  push();
  return out;
}
function pickExcerpts(text, query, budget) {
  text = String(text || '');
  if (text.length <= budget) return text;
  const secs = splitSections(text, 1600);
  const words = Array.from(new Set(norm(query).split(' ').filter(w => w.length > 3 && !STOPW.has(w))));
  if (!words.length) return text.slice(0, budget);
  const scored = secs.map((s, i) => { const low = s.toLowerCase(); let sc = 0; for (const w of words) { let at = low.indexOf(w); while (at >= 0 && sc < 400) { sc++; at = low.indexOf(w, at + w.length); } } return { i, s, sc: sc / Math.sqrt(s.length + 200) }; });
  const picked = scored.slice().sort((a, b) => b.sc - a.sc);
  const keep = [];
  let used = 0;
  for (const x of picked) { if (used + x.s.length > budget) continue; keep.push(x); used += x.s.length; if (used > budget * 0.92) break; }
  return keep.sort((a, b) => a.i - b.i).map(x => x.s).join('\n\n[...]\n\n');
}
function cleanCard(r) {
  if (!r || typeof r !== 'object') return null;
  const q = str(r.q, 400), a = str(r.a, 240);
  if (!q || !a) return null;
  const arr = (x, n, len) => Array.isArray(x) ? x.map(v => str(v, len)).filter(Boolean).slice(0, n) : [];
  const key = norm(a);
  return { id: mkid('c'), q, a, alts: arr(r.alts, 6, 120), d: arr(r.d, 3, 200).filter(x => norm(x) !== key), topic: str(r.topic, 40) || 'General', why: str(r.why, 320) };
}
