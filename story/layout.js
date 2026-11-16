/* Pure logic for "A name of your own": story.json -> numbers for the prose and per-chapter
 * particle slots. No DOM, no GL, so node can test it (test/story.test.mjs).
 *
 * Every column is one year: 100 girls on the left, 100 boys on the right, each baby a dot
 * in the same slot in every chapter. A baby's category is drawn from that year's shares:
 * the first round(100 x top-10 share) dots of a block got a top-10 name, the next ones up to
 * round(100 x top-100 share) a name ranked 11-100, the rest anything else. A layout is N
 * slots of [x, y, colour, alpha] in plot space: x, y in 0..1, y up.
 * Every number the prose prints is computed from story.json, never from the dots. */

export const PER = 100; // babies per sex per column
export const SEXES = ['F', 'M'];

export const yearsOf = (D) => Object.keys(D.years).map(Number).sort((a, b) => a - b);
export const decadesOf = (D) => Object.keys(D.hits).map(Number).sort((a, b) => a - b);
export const row = (D, y, s) => {
  const r = D.years[y]?.[s];
  if (!r) throw new Error(`no year ${y} ${s}`);
  return r;
};
export const yearArg = (D, a) => (a === 'last' ? D.last : Number(a));

/* The dots: per year, per sex, PER babies; `t10`/`t100`/`sdx` mark the categories. */
export function dots(D) {
  const out = [];
  yearsOf(D).forEach((y, bin) => {
    for (const s of SEXES) {
      const r = row(D, y, s);
      const t10 = Math.round(PER * r.top10), t100 = Math.round(PER * r.top100), sdx = Math.round(PER * r.sdx.top10);
      for (let j = 0; j < PER; j++) out.push({ bin, s, j, t10: j < t10, t100: j < t100, sdx: j < sdx });
    }
  });
  return out;
}

/* Colours are palette indices (story.js): 0 ink, 1 top-10 red, 2 top-100 gold, 3 boys, 4 girls, 5 grey. */
export const C = { ink: 0, top10: 1, top100: 2, M: 3, F: 4, grey: 5 };
export const colourers = {
  sex: (d) => C[d.s],
  top10: (d) => (d.t10 ? C.top10 : C.grey),
  top100: (d) => (d.t10 ? C.top10 : d.t100 ? C.top100 : C.grey),
  bysex: (d) => (d.t10 ? C[d.s] : C.grey),
  sdx: (d) => (d.sdx ? C.top10 : C.grey),
  grey: () => C.grey,
};

const mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* A free-floating field: the opening. */
export function field(ds) {
  const rnd = mulberry(7), slots = new Float32Array(ds.length * 4);
  ds.forEach((_, i) => slots.set([rnd(), rnd() * 0.9 + 0.05, C.ink, 0.8], i * 4));
  return { kind: 'field', slots };
}

/* K year columns, each two blocks (girls, boys) of PER dots filled bottom-up. `per` dots a
 * row is chosen so a cell is as square as it can be in a plot of aspect a; `cell` is a
 * cell's width as a plot fraction. alpha < 1 dims a chapter that is about the axis numbers. */
export function columns(ds, K, a, { colour = colourers.top10, alpha = 1 } = {}) {
  const colW = 1 / K, barW = colW * 0.8, gap = barW * 0.08, blockW = (barW - gap) / 2, top = 0.9;
  let per = 1, best = Infinity;
  for (let k = 1; k <= 20; k++) {
    if (PER % k) continue;
    const off = Math.abs(Math.log(((blockW / k) * a) / (top / (PER / k))));
    if (off < best) { best = off; per = k; }
  }
  const dy = top / (PER / per), slots = new Float32Array(ds.length * 4);
  ds.forEach((d, i) => {
    const x0 = d.bin * colW + (colW - barW) / 2 + (d.s === 'M' ? blockW + gap : 0);
    const r = Math.floor(d.j / per), c = d.j % per;
    slots.set([x0 + (c + 0.5) * (blockW / per), (r + 0.5) * dy, colour(d), alpha], i * 4);
  });
  return { kind: 'columns', slots, per, cell: blockW / per, K };
}

/* "x in N", rounded to a readable N. */
export const oneIn = (p) => `1 in ${Math.round(1 / p)}`;
