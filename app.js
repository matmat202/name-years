import {
  MAX_SERIES, shardKey, parseNames, lookup, prefixMatches, totalOf, seriesFor, seriesLabel,
  peak, medianYear, living, fmtAbout, niceTicks, fmtInt, fmtRate, rankLabel, encodeState, decodeState, SEX_WORD,
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
const state = { names: [], unit: 'rate' };
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

async function show(names, { push = true } = {}) {
  const id = ++runId;
  state.names = names;
  $('q').value = names.join(', ');
  closeOpts();
  if (!names.length) { current = []; draw(); setStatus('Type a name to chart it.'); return; }
  let got;
  try {
    got = await Promise.all(names.map(async (n) => {
      const [sh, ss] = await Promise.all([shard(n), stateShard(n)]);
      const k = lookup(sh, n);
      return { typed: n, k, rec: k && sh[k], where: ss === undefined ? undefined : (k && ss?.[k]) || {} };
    }));
  }
  catch { if (id === runId) setStatus('Could not load the names. Try reloading.', true); return; }
  if (id !== runId) return; // a newer search started meanwhile
  const found = got.filter((g) => g.rec);
  const missing = got.filter((g) => !g.rec).map((g) => `“${g.typed}”`);
  const series = found.flatMap((g) => seriesFor(g.k, g.rec, META)
    .map((s) => ({ ...s, where: g.where === undefined ? undefined : whereRows(g.where[s.sex], META.where.states),
      cover: g.where?.[s.sex]?.length === 1 ? g.where[s.sex][0] : null })));
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
const fmtVal = (v) => (state.unit === 'n' ? fmtInt(v) : fmtRate(v));

function draw() {
  const box = $('chart');
  box.replaceChildren();
  const years = META.y1 - META.y0 + 1;
  W = Math.max(300, Math.min(900, box.clientWidth || 720));
  const narrow = W < 520;
  H = narrow ? 250 : 320;
  M.r = narrow ? 78 : 104;
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const max = Math.max(0, ...current.flatMap(vals));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const x = (i) => M.l + (iw * i) / (years - 1);
  const y = (v) => M.t + ih - (ih * v) / top;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': current.length
      ? `Line chart, ${state.unit === 'n' ? 'babies' : 'babies per 1,000 of the same sex'} named ${current.map(seriesLabel).join(', ')}, ${META.y0} to ${META.y1}`
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
  for (const s of current) {
    const v = vals(s);
    let d = '';
    v.forEach((val, i) => { d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`; });
    svg.append(el('path', { d, class: 'ln', stroke: COLORS[s.slot] }));
    labels.push({ s, y: y(v[v.length - 1]) });
  }
  // Direct labels at the right end, pushed apart so lines ending close don't overprint.
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
  const over = labels.length ? labels[labels.length - 1].y - (H - M.b) : 0;
  if (over > 0) for (const l of labels) l.y -= over;
  for (const l of labels) {
    const t = seriesLabel(l.s);
    const cap = narrow ? 11 : 15;
    svg.append(el('text', { x: W - M.r + 8, y: l.y + 4, class: 'lab' }, t.length > cap ? t.slice(0, cap - 1) + '…' : t));
  }

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
    dots.replaceChildren(...current.map((s) => el('circle', { cx: x(i), cy: y(vals(s)[i]), r: 4.5, class: 'dot', fill: COLORS[s.slot] })));
    tip.innerHTML = `<h3>${META.y0 + i}</h3><table></table>`;
    const tb = tip.querySelector('table');
    for (const s of [...current].sort((a, b) => vals(b)[i] - vals(a)[i])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><span class="sw" style="background:${COLORS[s.slot]}"></span></td><td class="v"></td><td class="v"></td>`;
      tr.children[0].append(seriesLabel(s));
      tr.children[1].textContent = `${fmtInt(s.counts[i])} babies`;
      tr.children[2].textContent = `${fmtRate(s.rate[i])} / 1,000`;
      tb.append(tr);
    }
    const rect = box.getBoundingClientRect();
    const px = (x(i) / W) * rect.width;
    tip.classList.add('on');
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(rect.width - tw, px + (px > rect.width / 2 ? -tw - 12 : 12)))}px`;
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
      + ' Hover or tap the chart for a year.'
    : '';
  drawFacts();
  drawTable();
}

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
    const W = META.where;
    if (s.where === undefined) rows.push(['By state', 'could not load the state counts']);
    else if (s.cover != null) rows.push(['By state', `the state counts hold only ${s.cover}% of these ${SEX_WORD[s.sex]} (the rest are withheld wherever a state had under five in a year): too thin to map fairly`]);
    else if (!s.where) rows.push(['By state', `under ${fmtInt(W.floor)} ${SEX_WORD[s.sex]} in the state counts since ${W.y0}: too few to map`]);
    else {
      const x = extremes(s.where);
      const list = (rs, f) => rs.map((r) => `${STATE_NAMES[r.st]} ${f(r)}`).join(', ') || '—';
      rows.push(['Most common in', list(x.most, (r) => fmtRatio(r.ratio))],
        ['Least common in', list(x.least, (r) => (r.w ? `at most ${fmtRatio(r.hi)}` : fmtRatio(r.ratio)))]);
    }
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    li.append(h, dl);
    if (s.where) li.append(drawMap(s));
    ul.append(li);
  }
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
  tbl.append(head);
  for (let i = META.y1 - META.y0; i >= 0; i--) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.textContent = String(META.y0 + i); tr.append(td);
    for (const s of current) {
      for (const v of [fmtInt(s.counts[i]), fmtRate(s.rate[i])]) { const c = document.createElement('td'); c.textContent = v; tr.append(c); }
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
    btn.addEventListener('click', () => show(g.names));
    x.append(btn); ul.append(x);
  }
}

async function main() {
  try { META = await (await fetch('data/meta.json')).json(); }
  catch { setStatus('Could not load the data. Try reloading.', true); return; }
  $('span').textContent = `${META.y0}–${META.y1}`;
  presetRow(`Top of ${META.y1}:`, [{ names: [META.top.F[0], META.top.M[0]] }]);
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
  $('form').addEventListener('submit', (e) => { e.preventDefault(); show(parseNames(q.value)); });
  let lastW = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; draw(); } });
  const s = decodeState(location.search);
  state.unit = s.unit;
  for (const o of $('units').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o.dataset.u === s.unit));
  await show(s.names.length ? s.names : [META.top.F[0], META.top.M[0]], { push: s.names.length > 0 });
}

main();
