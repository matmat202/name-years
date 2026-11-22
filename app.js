import {
  MAX_SERIES, shardKey, parseNames, lookup, prefixMatches, totalOf, seriesFor, seriesLabel, chartLabel,
  peak, medianYear, living, fmtAbout, niceTicks, fmtInt, fmtRate, rankLabel, stackLabels, tipSpot, encodeState, decodeState, yearIn, topOfYear, SEX_WORD, abroadFor, spellNote, otherSpellings, COUNTRIES,
  TILES, STATE_NAMES, BAND_LABELS, WITHHELD_MAX, whereRows, tileBand, extremes, fmtRatio,
} from './names-logic.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
// Drawn at the container's own pixel width (1 SVG unit = 1 CSS px), so axis text stays
// 11px on a phone instead of shrinking with a fixed viewBox.
let W = 720, H = 320;
const M = { l: 46, r: 96, t: 12, b: 28 };

let META = null;
const shards = new Map(); // key -> Promise<shard>
const sshards = new Map(); // key -> Promise<state shard>
// The countries whose lines can be drawn beside the US ones, one at a time.
const ABROAD = {
  fr: { name: 'France', short: 'FR', label: 'France', dir: 'f', src: 'Insee', cache: new Map() },
  ew: { name: 'England and Wales', short: 'E&W', label: 'E&W', dir: 'e', src: 'ONS', cache: new Map() },
};
const state = { names: [], unit: 'rate', cmp: '', year: null };
let current = []; // series, in slot order
let runId = 0;

const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

function setStatus(msg, err = false) {
  $('status').textContent = msg;
  $('status').classList.toggle('err', err);
}

function shard(name, dir = 'n', cache = shards) {
  const k = shardKey(name);
  if (!/^[a-z]{2}$/.test(k)) return Promise.resolve(null);
  if (!cache.has(k)) {
    cache.set(k, fetch(`data/${dir}/${k}.json`).then((r) => {
      if (r.status === 404) return {}; // no name starts with these two letters
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }));
  }
  const p = cache.get(k);
  p.catch(() => cache.delete(k)); // a failed fetch may be retried
  return p;
}
// The state counts are a second look: if they fail to load, the chart still shows.
const stateShard = (name) => shard(name, 's', sshards).catch(() => undefined);
const abroadShard = (name, c) => shard(name, ABROAD[c].dir, ABROAD[c].cache).catch(() => undefined); // likewise

async function show(names, { push = true } = {}) {
  const id = ++runId;
  state.names = names;
  $('q').value = names.join(', ');
  closeOpts();
  if (!names.length) { current = []; draw(); setStatus('Type a name to chart it.'); return; }
  let got;
  try {
    got = await Promise.all(names.map(async (n) => {
      const [sh, ss, ...as] = await Promise.all([shard(n), stateShard(n), ...COUNTRIES.map((c) => abroadShard(n, c))]);
      const k = lookup(sh, n);
      return { typed: n, k, rec: k && sh[k], where: ss === undefined ? undefined : (k && ss?.[k]) || {},
        ab: Object.fromEntries(COUNTRIES.map((c, i) => [c, as[i] === undefined ? undefined : (k && as[i]?.[k]) || {}])) };
    }));
  }
  catch { if (id === runId) setStatus('Could not load the names. Try reloading.', true); return; }
  if (id !== runId) return; // a newer search started meanwhile
  const found = got.filter((g) => g.rec);
  const missing = got.filter((g) => !g.rec).map((g) => `“${g.typed}”`);
  const series = found.flatMap((g) => seriesFor(g.k, g.rec, META)
    .map((s) => ({ ...s, where: g.where === undefined ? undefined : whereRows(g.where[s.sex], META.where.states),
      cover: g.where?.[s.sex]?.length === 1 ? g.where[s.sex][0] : null,
      ab: Object.fromEntries(COUNTRIES.map((c) => [c, g.ab[c] === undefined ? undefined : abroadFor(g.ab[c], s.sex, META, c)])) })));
  current = series.slice(0, MAX_SERIES).map((s, i) => ({ ...s, slot: i }));
  state.names = found.map((g) => g.k);
  $('q').value = state.names.join(', ');
  if (push) history.replaceState(null, '', location.pathname + encodeState(state));
  const msgs = [];
  if (missing.length) msgs.push(`${missing.join(', ')}: never given to five or more US babies of either sex in a year.`);
  if (series.length > MAX_SERIES) msgs.push(`Showing the first ${MAX_SERIES} lines; a name used for both sexes takes two.`);
  setStatus(msgs.join(' '), !!missing.length && !current.length);
  draw();
}

const vals = (s) => (state.unit === 'n' ? s.counts : s.rate);
// The other country's lines on the chart: one per series that has one, when one is chosen.
const ab = (s) => s.ab[state.cmp];
const frLines = () => (state.cmp ? current.filter((s) => ab(s)) : []);
const frVals = (s) => (state.unit === 'n' ? ab(s).counts : ab(s).rate);
const C = () => ABROAD[state.cmp];
const fmtVal = (v) => (state.unit === 'n' ? fmtInt(v) : fmtRate(v));

function draw() {
  const box = $('chart');
  box.replaceChildren();
  const years = META.y1 - META.y0 + 1;
  W = Math.max(300, Math.min(900, box.clientWidth || 720));
  const narrow = W < 520;
  H = narrow ? 250 : 320;
  M.r = narrow ? 85 : 111;
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const max = Math.max(0, ...current.flatMap(vals), ...frLines().flatMap((s) => frVals(s).filter((v) => v != null)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const x = (i) => M.l + (iw * i) / (years - 1);
  const y = (v) => M.t + ih - (ih * v) / top;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': current.length
      ? `Line chart, ${state.unit === 'n' ? 'babies' : 'babies per 1,000 of the same sex'} named ${current.map(seriesLabel).join(', ')}, ${META.y0} to ${META.y1}`
        + (frLines().length ? `, with dashed lines for ${C().name} from ${META[state.cmp].y0}` : '')
      : 'Empty chart' });
  const ax = el('g', { class: 'ax' });
  for (const t of ticks) {
    ax.append(el('line', { x1: M.l, x2: W - M.r, y1: y(t), y2: y(t), class: t === 0 ? 'base' : '' }));
    ax.append(el('text', { x: M.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, state.unit === 'n' ? (t >= 1000 ? `${+(t / 1000).toPrecision(3)}k` : String(t)) : String(t)));
  }
  for (let yr = 1880; yr <= META.y1; yr += narrow ? 40 : 20) {
    ax.append(el('text', { x: x(yr - META.y0), y: H - 8, 'text-anchor': 'middle' }, String(yr)));
  }
  svg.append(ax);

  const labels = [];
  const verts = [];  // every drawn point, so the hover box can find a corner that hides fewest
  for (const s of current) {
    const v = vals(s);
    v.forEach((val, i) => verts.push({ x: x(i), y: y(val) }));
    let d = '';
    v.forEach((val, i) => { d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`; });
    svg.append(el('path', { d, class: 'ln', stroke: COLORS[s.slot] }));
    labels.push({ s, y: y(v[v.length - 1]) });
  }
  for (const s of frLines()) {
    const v = frVals(s);
    let d = '', pen = false, lastI = -1;
    v.forEach((val, i) => {
      if (val == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`; pen = true; lastI = i;
      verts.push({ x: x(i), y: y(val) });
    });
    svg.append(el('path', { d, class: 'ln fr', stroke: COLORS[s.slot] }));
    if (lastI >= 0) labels.push({ s, fr: true, y: y(v[lastI]) });
  }
  // Direct labels at the right end, moved apart only where lines end close. A moved label no
  // longer sits on its line (seven crowd at the baseline with two two-sex names and France), so
  // each carries a short sample of its line, colour and dash, as the cards' swatches do.
  const placed = stackLabels(labels.map((l) => l.y), 14, M.t, H - M.b);
  labels.forEach((l, i) => {
    const cap = narrow ? 11 : 15;
    const t = l.fr ? chartLabel(l.s, cap, narrow ? ' ' + C().short : ' · ' + C().label, ' ' + C().short) : chartLabel(l.s, cap);
    const ky = placed[i].toFixed(1);
    svg.append(el('path', { d: `M${W - M.r + 4},${ky}H${W - M.r + 12}`, class: l.fr ? 'key fr' : 'key', stroke: COLORS[l.s.slot] }));
    svg.append(el('text', { x: W - M.r + 15, y: placed[i] + 4, class: 'lab' }, t));
  });

  const cross = el('line', { class: 'cross', y1: M.t, y2: M.t + ih, x1: -10, x2: -10, visibility: 'hidden' });
  const dots = el('g');
  svg.append(cross, dots);
  const hit = el('rect', { x: M.l, y: M.t, width: iw, height: ih + M.b, fill: 'transparent' });
  svg.append(hit);
  box.append(svg);
  const tip = document.createElement('div');
  tip.className = 'tip';
  box.append(tip);

  let pinned = -1;
  const focus = (i) => {
    if (i < 0 || !current.length) { cross.setAttribute('visibility', 'hidden'); dots.replaceChildren(); tip.classList.remove('on'); return; }
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    const pts = [...current.map((s) => ({ s, v: vals(s)[i], n: s.counts[i], r: s.rate[i] })),
      ...frLines().filter((s) => ab(s).counts[i] != null)
        .map((s) => ({ s, fr: true, v: frVals(s)[i], n: ab(s).counts[i], r: ab(s).rate[i] }))];
    dots.replaceChildren(...pts.map((p) => el('circle', { cx: x(i), cy: y(p.v), r: p.fr ? 3.5 : 4.5,
      class: p.fr ? 'dot fr' : 'dot', fill: COLORS[p.s.slot], ...(p.fr ? { style: `fill:var(--card);stroke:${COLORS[p.s.slot]}` } : {}) })));
    tip.innerHTML = `<h3>${META.y0 + i}</h3><table></table>`;
    const tb = tip.querySelector('table');
    for (const p of pts.sort((a, b) => b.r - a.r)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><span class="sw${p.fr ? ' fr' : ''}" style="--c:${COLORS[p.s.slot]};background:${p.fr ? 'none' : COLORS[p.s.slot]}"></span></td><td class="v"></td><td class="v"></td>`;
      tr.children[0].append(p.fr ? `${seriesLabel(p.s)}, ${C().name}` : seriesLabel(p.s));
      tr.children[1].textContent = `${fmtInt(p.n)} babies`;
      tr.children[2].textContent = `${fmtRate(p.r)} / 1,000`;
      tb.append(tr);
    }
    const rect = box.getBoundingClientRect();
    const px = (x(i) / W) * rect.width;
    tip.classList.add('on');
    const k = rect.width / W;  // 1 SVG unit = 1 CSS px, unless the box was resized since drawing
    const spot = tipSpot({ tw: tip.offsetWidth, th: tip.offsetHeight, px, w: rect.width, top: 8, bottom: (M.t + ih) * k, below: H * k + 4,
      dots: pts.map((p) => ({ x: px, y: y(p.v) * k })), pts: verts.map((p) => ({ x: p.x * k, y: p.y * k })) });
    tip.style.left = `${spot.left}px`;
    tip.style.top = `${spot.top}px`;
  };
  const at = (e) => {
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(years - 1, Math.round(((sx - M.l) / iw) * (years - 1))));
  };
  hit.addEventListener('pointermove', (e) => { if (pinned < 0 && e.pointerType === 'mouse') focus(at(e)); });
  hit.addEventListener('pointerleave', (e) => { if (pinned < 0 && e.pointerType === 'mouse') focus(-1); });
  hit.addEventListener('click', (e) => { const i = at(e); pinned = pinned === i ? -1 : i; focus(pinned < 0 && e.pointerType !== 'mouse' ? -1 : i); });

  $('yl').textContent = current.length
    ? (state.unit === 'n' ? 'Babies given the name each year.' : 'Babies given the name per 1,000 babies of the same sex born that year.')
      + (frLines().length ? ` Dashed: ${C().name}, from ${META[state.cmp].y0}, ${state.unit === 'n' ? 'babies there' : `per 1,000 babies of the same sex in ${C().src}'s count`}.` : '')
      + ' Hover or tap the chart for a year.'
    : '';
  drawFacts();
  drawTable();
}

const NARROW = matchMedia('(max-width: 599px)');
let moreOpen = null; // the reader's last open/close of a card's disclosure, kept across redraws

function drawFacts() {
  const ul = $('facts');
  ul.replaceChildren();
  for (const s of current) {
    const li = document.createElement('li');
    const h = document.createElement('h2');
    h.innerHTML = `<span class="sw" style="background:${COLORS[s.slot]}"></span>`;
    h.append(seriesLabel(s));
    const dl = document.createElement('dl');
    const p = peak(s.rate);
    const pn = peak(s.counts);
    const last = s.counts.length - 1;
    const med = medianYear(s.counts, META.y0);
    const lv = living(s.counts, META.alive[s.sex], META.y0, META.asof);
    const rows = [
      [`${META.y1}`, s.counts[last] ? `${fmtInt(s.counts[last])} ${SEX_WORD[s.sex]}, ${rankLabel(s.rank[0])}` : `fewer than 5 ${SEX_WORD[s.sex]}`],
      ['Most popular', p == null ? '—' : `${META.y0 + p}: ${fmtRate(s.rate[p])} per 1,000 ${SEX_WORD[s.sex]}`],
      ['Most babies', pn == null ? '—' : `${META.y0 + pn}: ${fmtInt(s.counts[pn])}`],
      ['Best rank', s.rank[1] ? `${rankLabel(s.rank[1])}, first in ${s.rank[2]}` : '—'],
      ['Half of all born by', med == null ? '—' : String(med)],
      [`Alive in ${META.asof}`, lv.n < 0.5 ? 'none, by the life tables' : `${fmtAbout(lv.n)} (${Math.round(100 * lv.share)}% of all)`],
      ['Half of those alive born by', lv.median == null ? '—' : `${lv.median}: they turn ${lv.age} in ${META.asof}`],
      ['Since 1880', `${fmtInt(s.total)} ${SEX_WORD[s.sex]}`],
    ];
    // Abroad and by state sit behind a disclosure: at 390 px they made each card ~710 px tall,
    // four of them 2,854 px, before the table. Open from the start where the cards sit side by side.
    const more = [];
    for (const c of COUNTRIES) more.push(...abroadRows(s, c));
    const W = META.where;
    if (s.where === undefined) more.push(['By state', 'could not load the state counts']);
    else if (s.cover != null) more.push(['By state', `the state counts hold only ${s.cover}% of these ${SEX_WORD[s.sex]} (the rest are withheld wherever a state had under five in a year): too thin to map fairly`]);
    else if (!s.where) more.push(['By state', `under ${fmtInt(W.floor)} ${SEX_WORD[s.sex]} in the state counts since ${W.y0}: too few to map`]);
    else {
      const x = extremes(s.where);
      const list = (rs, f) => rs.map((r) => `${STATE_NAMES[r.st]} ${f(r)}`).join(', ') || '—';
      more.push(['Most common in', list(x.most, (r) => fmtRatio(r.ratio))],
        ['Least common in', list(x.least, (r) => (r.w ? `at most ${fmtRatio(r.hi)}` : fmtRatio(r.ratio)))]);
    }
    fillDl(dl, rows);
    const alt = otherSpellings(s.spell, state.names);
    if (alt.length) {
      const dt = document.createElement('dt'); dt.textContent = 'Similar spellings';
      const dd = document.createElement('dd'); dd.className = 'alt';
      for (const a of alt) {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.name = a.name; b.dataset.from = s.name;
        const nm = document.createElement('span'); nm.textContent = a.name;
        const n = document.createElement('span'); n.className = 'n'; n.textContent = fmtInt(a.n);
        b.append(nm, ' ', n);
        b.title = `Add ${a.name} to the chart: ${fmtInt(a.n)} ${SEX_WORD[s.sex]} since ${META.y0}`;
        dd.append(b);
      }
      dl.append(dt, dd);
    }
    const det = document.createElement('details');
    det.className = 'more';
    det.open = moreOpen ?? !NARROW.matches;
    det.addEventListener('toggle', () => { moreOpen = det.open; });
    const sum = document.createElement('summary');
    sum.textContent = COUNTRIES.some((c) => META[c]) ? 'Abroad and by state' : 'By state';
    const dl2 = document.createElement('dl');
    fillDl(dl2, more);
    det.append(sum, dl2);
    if (s.where) det.append(drawMap(s));
    li.append(h, dl, det);
    ul.append(li);
  }
}

function fillDl(dl, rows) {
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
}

// A country's rows on a name's card: when it peaked there, and how many since its file began.
function abroadRows(s, c) {
  const F = META[c], A = ABROAD[c], w = SEX_WORD[s.sex], a = s.ab[c];
  if (!F) return [];
  if (a === undefined) return [[`In ${A.name}`, `could not load the ${A.src} counts`]];
  if (!a) return [[`In ${A.name}`, `fewer than ${fmtInt(F.floor)} ${w} since ${F.y0}, as ${A.src} lists them`]];
  const p = peak(a.rate);
  const sp = spellNote(s.name, a.spell);
  return [
    [`Most popular in ${A.name}`, `${META.y0 + p}: ${fmtRate(a.rate[p])} per 1,000 ${w}`],
    [`In ${A.name} since ${F.y0}`, `${fmtInt(a.total)} ${w}` + (sp ? `, spelled ${sp}` : '')],
  ];
}

// Each state's babies with the name against what the US rate of the same years would give
// it, so a name is "common in Nevada" for its own era, not because Nevada grew later.
function drawMap(s) {
  const W = META.where;
  const fig = document.createElement('figure');
  fig.className = 'where';
  const x = extremes(s.where, 1);
  const grid = document.createElement('div');
  grid.className = 'tiles';
  grid.setAttribute('role', 'img');
  grid.setAttribute('aria-label', `Map of US states: ${seriesLabel(s)} against the US rate, ${W.y0}–${W.y1}.`
    + (x.most[0] ? ` Most common in ${STATE_NAMES[x.most[0].st]}, ${fmtRatio(x.most[0].ratio)} the US rate.` : ''));
  const pick = document.createElement('p');
  pick.className = 'pick';
  pick.setAttribute('aria-live', 'polite');
  for (const r of s.where) {
    const t = document.createElement('button');
    t.type = 'button';
    const [row, col] = TILES[r.st];
    t.className = `t ${tileBand(r)}`;
    t.style.gridArea = `${row + 1} / ${col + 1}`;
    t.textContent = r.st;
    t.title = `${STATE_NAMES[r.st]}: ${fmtInt(r.a)} ${SEX_WORD[s.sex]}, ${r.ratio == null ? 'too few to compare' : `${fmtRatio(r.ratio)} the US rate`}`;
    t.addEventListener('click', () => {
      pick.textContent = `${t.title} (the US rate would give ${fmtInt(r.e)})`
        + (r.w ? `; ${r.w} year${r.w === 1 ? '' : 's'} with none listed, each of which may hide up to ${WITHHELD_MAX}.` : '.');
    });
    grid.append(t);
  }
  const key = document.createElement('ul');
  key.className = 'key';
  BAND_LABELS.forEach((lab, i) => {
    const k = document.createElement('li');
    k.innerHTML = `<span class="t q${i}"></span>`;
    k.append(lab);
    key.append(k);
  });
  const na = document.createElement('li');
  na.innerHTML = '<span class="t na"></span>';
  na.append('can’t tell: too few listed');
  key.append(na);
  const cap = document.createElement('figcaption');
  cap.textContent = `${SEX_WORD[s.sex][0].toUpperCase() + SEX_WORD[s.sex].slice(1)} given the name in each state, ${W.y0}–${W.y1}, against what the US rate of the same years would give it. Tap a state for its count.`;
  fig.append(grid, pick, key, cap);
  return fig;
}

function drawTable() {
  const t = $('table');
  if (!current.length) { t.replaceChildren(); return; }
  const tbl = document.createElement('table');
  const head = document.createElement('tr');
  head.innerHTML = '<th>Year</th>';
  for (const s of current) {
    for (const w of ['babies', 'per 1,000']) { const th = document.createElement('th'); th.textContent = `${seriesLabel(s)}, ${w}`; head.append(th); }
  }
  for (const s of frLines()) {
    for (const w of ['babies', 'per 1,000']) { const th = document.createElement('th'); th.textContent = `${seriesLabel(s)}, ${C().name}, ${w}`; head.append(th); }
  }
  tbl.append(head);
  for (let i = META.y1 - META.y0; i >= 0; i--) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.textContent = String(META.y0 + i); tr.append(td);
    for (const s of current) {
      for (const v of [fmtInt(s.counts[i]), fmtRate(s.rate[i])]) { const c = document.createElement('td'); c.textContent = v; tr.append(c); }
    }
    for (const s of frLines()) {
      const none = ab(s).counts[i] == null;
      for (const v of none ? ['', ''] : [fmtInt(ab(s).counts[i]), fmtRate(ab(s).rate[i])]) { const c = document.createElement('td'); c.textContent = v; tr.append(c); }
    }
    tbl.append(tr);
  }
  t.replaceChildren(tbl);
}

// --- suggestions for the name being typed (the part after the last comma) ---------------
let opts = [], active = -1, optRun = 0;
function closeOpts() {
  opts = []; active = -1;
  $('opts').hidden = true;
  $('q').setAttribute('aria-expanded', 'false');
  $('q').removeAttribute('aria-activedescendant');
}
function drawOpts(sh) {
  const ul = $('opts');
  ul.replaceChildren();
  if (!opts.length) { closeOpts(); return; }
  opts.forEach((n, i) => {
    const li = document.createElement('li');
    li.id = `opt${i}`; li.setAttribute('role', 'option'); li.dataset.i = i;
    li.setAttribute('aria-selected', String(i === active));
    const a = document.createElement('span'); a.textContent = n;
    const b = document.createElement('span'); b.className = 'n'; b.textContent = `${fmtInt(totalOf(sh[n]))} babies`;
    li.append(a, b);
    ul.append(li);
  });
  ul.hidden = false;
  $('q').setAttribute('aria-expanded', 'true');
  if (active >= 0) $('q').setAttribute('aria-activedescendant', `opt${active}`);
}
async function onType() {
  const id = ++optRun;
  const v = $('q').value;
  const part = v.split(',').pop().trim();
  if (part.replace(/[^A-Za-z]/g, '').length < 2) { closeOpts(); return; }
  let sh;
  try { sh = await shard(part); } catch { closeOpts(); return; }
  if (id !== optRun) return;
  opts = prefixMatches(sh, part.replace(/[^A-Za-z]/g, ''));
  active = -1;
  drawOpts(sh);
}
function pickOpt(i) {
  const parts = $('q').value.split(',');
  parts[parts.length - 1] = (parts.length > 1 ? ' ' : '') + opts[i];
  show(parseNames(parts.join(',')));
}

// --- the ten most given names of any year (data/years.json, fetched on first open) --------
let years = null;
const loadYears = () => (years ||= fetch('data/years.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .catch((e) => { years = null; throw e; }));
async function drawYear(y) {
  state.year = y;
  $('yr').value = String(y);
  for (const b of document.querySelectorAll('#yrs .step')) b.disabled = !yearIn(y + +b.dataset.d, META);
  history.replaceState(null, '', location.pathname + encodeState(state));
  let T;
  try { T = await loadYears(); }
  catch { $('yrnote').textContent = 'Could not load the years. Try reloading.'; return; }
  if (state.year !== y) return; // stepped on meanwhile
  const shown = new Set(state.names);
  for (const sex of ['F', 'M']) {
    $('yr' + sex).replaceChildren(...topOfYear(T, META, sex, y).map((r) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.name = r.name;
      if (shown.has(r.name)) b.className = 'on';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
      const n = document.createElement('span'); n.className = 'n'; n.textContent = fmtInt(r.n);
      b.title = `${r.name}: ${fmtInt(r.n)} ${SEX_WORD[sex]} in ${y}, ${fmtRate(r.rate)} per 1,000`;
      b.append(nm, n); li.append(b);
      return li;
    }));
  }
  const f = topOfYear(T, META, 'F', y)[0], m = topOfYear(T, META, 'M', y)[0];
  $('yrnote').textContent = f && m
    ? `Babies given each name in ${y}. The #1s went to ${fmtRate(f.rate)} of every 1,000 girls and ${fmtRate(m.rate)} of every 1,000 boys born that year. Tap a name to chart it.`
    : '';
}
function setupYears(open) {
  const sel = $('yr');
  for (let y = META.y1; y >= META.y0; y--) sel.append(new Option(String(y), String(y)));
  sel.addEventListener('change', () => drawYear(+sel.value));
  for (const b of document.querySelectorAll('#yrs .step')) b.addEventListener('click', () => { const y = yearIn(state.year + +b.dataset.d, META); if (y) drawYear(y); });
  $('yrs').addEventListener('toggle', () => {
    if ($('yrs').open) drawYear(state.year || META.y1);
    else { state.year = null; history.replaceState(null, '', location.pathname + encodeState(state)); }
  });
  $('yrs').addEventListener('click', async (e) => {
    const name = e.target.closest('button[data-name]')?.dataset.name;
    if (!name) return;
    await show([name]);
    if (state.year) drawYear(state.year); // mark the charted name
    $('chart').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  if (open) { state.year = open; $('yrs').open = true; } // the toggle event draws it
}

function presetRow(label, groups) {
  const li = document.createElement('li');
  const b = document.createElement('b'); b.textContent = label;
  li.append(b);
  const ul = $('presets');
  ul.append(li);
  for (const g of groups) {
    const x = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = g.label || g.names.join(' · ');
    btn.addEventListener('click', g.go || (() => show(g.names)));
    x.append(btn); ul.append(x);
  }
}

async function main() {
  try { META = await (await fetch('data/meta.json')).json(); }
  catch { setStatus('Could not load the data. Try reloading.', true); return; }
  $('span').textContent = `${META.y0}–${META.y1}`;
  presetRow(`Top of ${META.y1}:`, [{ names: [META.top.F[0], META.top.M[0]] }, { label: 'Any year…', go: async () => {
    // drawn before the scroll: an empty panel left the page too short to bring it to the top
    $('yrs').open = true; await drawYear(state.year || META.y1); $('yrs').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('yr').focus({ preventScroll: true });
  } }]);
  presetRow('Rising fastest:', [{ names: [META.rising.F[0][0], META.rising.M[0][0]] }]);
  presetRow('Try:', [{ names: ['Linda', 'Jennifer', 'Ashley'] }, { names: ['Jordan'] }, { names: ['Mary'] }, { names: ['Hillary'] }]);
  for (const b of $('units').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      state.unit = b.dataset.u;
      for (const o of $('units').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
      history.replaceState(null, '', location.pathname + encodeState(state));
      draw();
    });
  }
  const cmpBtns = () => $('cmp').querySelectorAll('button');
  const setCmp = (c) => { state.cmp = c; for (const o of cmpBtns()) o.setAttribute('aria-pressed', String(o.dataset.c === c)); };
  for (const b of cmpBtns()) {
    b.addEventListener('click', () => {
      setCmp(state.cmp === b.dataset.c ? '' : b.dataset.c); // pressing the chosen one again turns it off
      history.replaceState(null, '', location.pathname + encodeState(state));
      draw();
    });
  }
  const q = $('q');
  q.addEventListener('input', onType);
  q.addEventListener('keydown', (e) => {
    if ($('opts').hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      active = (active + (e.key === 'ArrowDown' ? 1 : opts.length - 1 + (active < 0 ? 1 : 0))) % opts.length;
      shard(q.value.split(',').pop().trim()).then(drawOpts);
      e.preventDefault();
    } else if (e.key === 'Enter' && active >= 0) { pickOpt(active); e.preventDefault(); }
    else if (e.key === 'Escape') { closeOpts(); e.preventDefault(); }
  });
  q.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== q) closeOpts(); }, 150));
  $('opts').addEventListener('mousedown', (e) => e.preventDefault());
  $('opts').addEventListener('click', (e) => { const i = e.target.closest('li[data-i]')?.dataset.i; if (i != null) pickOpt(+i); });
  // A similar spelling joins the chart; on a full chart it is drawn beside its own card's name
  // alone, since a fifth line would be dropped and the tap would seem to do nothing.
  $('facts').addEventListener('click', (e) => {
    const b = e.target.closest('dd.alt button');
    if (!b) return;
    show(current.length >= MAX_SERIES ? [b.dataset.from, b.dataset.name] : [...state.names, b.dataset.name]);
    $('chart').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); show(parseNames(q.value)); });
  let lastW = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; draw(); } });
  const s = decodeState(location.search);
  setupYears(yearIn(s.year, META));
  state.unit = s.unit;
  setCmp(s.cmp);
  for (const o of $('units').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o.dataset.u === s.unit));
  await show(s.names.length ? s.names : [META.top.F[0], META.top.M[0]], { push: s.names.length > 0 || !!s.cmp || !!state.year });
}

main();
