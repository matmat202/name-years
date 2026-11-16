/* The scrolling story: each <section class="step"> names a layout in data-kind; as the
 * reader scrolls from one step to the next, every dot flies from the old layout to the
 * new one. Numbers in the prose are not typed in: a <b data-fact="..."> is filled from
 * story.json, so the text cannot drift from the chart. Modelled on paper-of-the-year/story. */
import { PER, C, yearsOf, decadesOf, row, yearArg, dots, colourers, field, columns, oneIn } from './layout.js';
import { createPoints } from './gl.js';

// 0 ink, 1 top-10 (red), 2 top-100 (gold), 3 boys (slate blue), 4 girls (green), 5 grey
const PAL = [[0.11, 0.1, 0.09], [0.7, 0.13, 0.11], [0.85, 0.62, 0.18], [0.17, 0.33, 0.52], [0.24, 0.5, 0.33], [0.8, 0.78, 0.74]];

/* Shares: whole percent from 10% up, one decimal below it ("2.5%"), so small values
 * do not all round to the same 2 or 3. */
export const pct = (v) => (v >= 0.095 ? `${Math.round(v * 100)}%` : `${(v * 100).toFixed(1)}%`);
const fmt = (n) => n.toLocaleString('en-US');

/* "top10:1950:M" -> "34%". Unknown kinds throw: a typo must not render as blank. */
export function fact(D, spec) {
  const [kind, ...a] = spec.split(':');
  const r = () => row(D, yearArg(D, a[0]), a[1]);
  const H = D.hits, ds = decadesOf(D).filter((d) => d >= 1940);
  switch (kind) {
    case 'last': return String(D.last);
    case 'first': return String(yearsOf(D)[0]);
    case 'per': return String(PER);
    case 'births': return fmt(r().births);
    case 'names': return fmt(r().names);
    case 'top10': return pct(r().top10);
    case 'top100': return pct(r().top100);
    case 'half': return fmt(r().half);
    case 'cls': return pct(r().cls);
    case 'clsodds': return oneIn(r().cls);
    case 'sdxcls': return pct(r().sdx.cls);
    case 'sdxtop10': return pct(r().sdx.top10);
    case 'name1': return r().first;
    case 'name1share': return pct(r().first_share);
    case 'mates': return String(D.classmates);
    case 'boyratio': { const y = yearArg(D, a[0]); return `${(row(D, y, 'M').top10 / row(D, y, 'F').top10).toFixed(1)}×`; }
    case 'hitsn': return String(Object.values(H).reduce((s, h) => s + h.n, 0));
    case 'rise': return String(H[a[0]].rise);
    case 'risemin': return String(Math.min(...ds.map((d) => H[d].rise)));
    case 'risemax': return String(Math.max(...ds.map((d) => H[d].rise)));
    case 'keptmin': return `${Math.round(Math.min(...ds.map((d) => H[d].kept15)) * 100)}%`;
    case 'keptmax': return `${Math.round(Math.max(...ds.map((d) => H[d].kept15)) * 100)}%`;
    default: throw new Error(`unknown fact ${spec}`);
  }
}

/* data-kind -> layout */
export function layoutFor(step, ds, K, aspect) {
  const k = step.dataset.kind;
  switch (k) {
    case 'field': return field(ds);
    case 'sex': return columns(ds, K, aspect, { colour: colourers.sex });
    case 'top10': case 'class': return columns(ds, K, aspect, { colour: colourers.top10 });
    case 'top100': case 'half': return columns(ds, K, aspect, { colour: colourers.top100 });
    case 'bysex': return columns(ds, K, aspect, { colour: colourers.bysex });
    case 'sdx': return columns(ds, K, aspect, { colour: colourers.sdx });
    case 'hits': return columns(ds, K, aspect, { colour: colourers.top10, alpha: 0.45 });
    default: throw new Error(`unknown layout ${k}`);
  }
}

/* What the axis labels say on each kind of step: [value per year column, css class, unit line]. */
export function axisFor(kind, D, y) {
  const F = row(D, y, 'F'), M = row(D, y, 'M');
  const pair = (f) => `${f(F)}·${f(M)}`;
  const p0 = (v) => (v * 100 >= 9.5 ? Math.round(v * 100) : (v * 100).toFixed(1));
  switch (kind) {
    case 'sex': return [fmt(Math.round((F.births + M.births) / 1000)) + 'k', '', `${PER} girls (left) and ${PER} boys (right) a column · births recorded`];
    case 'top10': case 'bysex': return [pair((r) => p0(r.top10)), '', '% of girls · boys given one of the year’s 10 commonest names'];
    case 'top100': return [pair((r) => p0(r.top100)), 'gold', '% of girls · boys given one of the year’s 100 commonest names'];
    case 'half': return [pair((r) => r.half), 'gold', 'names it takes to cover half the girls · boys'];
    case 'class': return [pair((r) => p0(r.cls)), '', `% chance one of ${D.classmates} same-sex classmates shares your name`];
    case 'sdx': return [pair((r) => p0(r.sdx.cls)), '', 'the same chance, names that sound alike counted as one'];
    case 'hits': { const h = D.hits[y]; return [h ? String(h.rise) : '—', 'ink', 'years a hit took to rise, for hits that peaked in that decade']; }
    default: return null;
  }
}

async function main() {
  const D = await (await fetch('story.json')).json();
  for (const el of document.querySelectorAll('[data-fact]')) el.textContent = fact(D, el.dataset.fact);
  const Y = yearsOf(D), K = Y.length;
  const ds = dots(D);

  const steps = [...document.querySelectorAll('.step')];
  const canvas = document.getElementById('gl');
  const plot = document.getElementById('plot');
  const axes = document.getElementById('axes');

  let layouts = [];
  const relayout = () => {
    const a = plot.clientWidth / Math.max(1, plot.clientHeight);
    layouts = steps.map((s) => layoutFor(s, ds, K, a));
    window.__story = { dots: ds.length, layouts: layouts.map((l) => ({ kind: l.kind, per: l.per })) };
  };
  relayout();

  const pts = createPoints(canvas, ds.length, PAL);
  if (!pts) { document.body.classList.add('nogl'); return; }
  const dpr = Math.min(2, devicePixelRatio || 1);
  let shown = -1;
  const resize = () => {
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    relayout();
    shown = -1;
  };
  resize();
  addEventListener('resize', resize);

  // the step whose top has crossed mid-viewport is "from", and t runs 0 -> 1 as the next
  // step's top rises from the bottom to the middle
  const progress = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    const next = steps[i + 1];
    if (!next) return { i, t: 0 };
    const top = next.getBoundingClientRect().top;
    return { i, t: Math.min(1, Math.max(0, 1 - (top - line) / (innerHeight - line))) };
  };

  const drawAxes = (lay, step) => {
    const html = [];
    if (lay.kind === 'columns') {
      const narrow = plot.clientWidth < 600, kind = step.dataset.kind;
      let unit = '';
      Y.forEach((y, i) => {
        const x = ((i + 0.5) / K) * 100;
        html.push(`<span class="tick" style="left:${x}%">${narrow ? `'${String(y).slice(2)}` : y}</span>`);
        const ax = axisFor(kind, D, y);
        if (!ax) return;
        const [v, cls, u] = ax;
        unit = u;
        // on a phone a column is ~35px: girls over boys, not side by side
        const two = narrow && v.includes('·');
        html.push(`<span class="val ${cls}${two ? ' two' : ''}" style="left:${x}%">${two ? v.replace('·', '<br>') : v}</span>`);
      });
      if (unit) html.push(`<span class="unit">${unit}</span>`);
    }
    axes.innerHTML = html.join('');
  };

  const t0 = performance.now();
  const frame = () => {
    const { i, t } = progress();
    const j = Math.min(i + 1, steps.length - 1);
    const A = layouts[i], Bl = layouts[j];
    pts.set(A.slots, Bl.slots);
    const cur = t > 0.5 ? j : i;
    if (cur !== shown) {
      shown = cur;
      drawAxes(layouts[cur], steps[cur]);
      document.body.dataset.step = cur;
    }
    axes.style.opacity = String(Math.abs(t - 0.5) * 2);
    const r = plot.getBoundingClientRect();
    const sz = (l) => (l.kind === 'columns' ? Math.max(2, l.cell * r.width * 0.86) : Math.max(3, r.width / 150));
    const size = sz(A) + (sz(Bl) - sz(A)) * t;
    pts.draw({ t, time: (performance.now() - t0) / 1000, size, rect: [r.left, r.top, r.width, r.height], dpr });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});
