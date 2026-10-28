// The page's pure logic: no DOM, no fetch. Tested by names-logic.test.mjs against both
// made-up records and the shipped data.

export const MAX_SERIES = 4;
// A name's second sex gets its own line only if it is a real share of the name, so
// "Emma" is one line and "Jordan" is two.
export const MIN_SEX_SHARE = 0.05;
export const SEX_WORD = { F: 'girls', M: 'boys' };

// Shards are keyed by the first two letters; SSA names are A–Z only, at least 2 long.
export const shardKey = (name) => String(name).slice(0, 2).toLowerCase();
export const cleanName = (s) => String(s ?? '').replace(/[^A-Za-z]/g, '');

// "olivia, Liam ,, liam" -> ['olivia', 'Liam'] (deduplicated without case, at most 4).
export function parseNames(q) {
  const out = [], seen = new Set();
  for (const part of String(q ?? '').split(/[,;\n]/)) {
    const n = cleanName(part);
    if (n.length < 2 || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
    if (out.length === MAX_SERIES) break;
  }
  return out;
}

// The shard's own spelling of a typed name ("OLIVIA" -> "Olivia"), or null.
export function lookup(shard, typed) {
  if (!shard) return null;
  const want = String(typed).toLowerCase();
  if (Object.hasOwn(shard, typed)) return typed;
  for (const k of Object.keys(shard)) if (k.toLowerCase() === want) return k;
  return null;
}

export const totalOf = (rec) => sumArr(rec.F) + sumArr(rec.M);
function sumArr(a) { let s = 0; if (a) for (let i = 1; i < a.length; i++) s += a[i]; return s; }

// Names in a shard starting with what was typed, most babies first (then A–Z).
export function prefixMatches(shard, typed, k = 8) {
  const p = String(typed).toLowerCase();
  if (!shard || p.length < 2) return [];
  return Object.keys(shard).filter((n) => n.toLowerCase().startsWith(p))
    .map((n) => [n, totalOf(shard[n])]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, k).map((x) => x[0]);
}

// [start, c, c, ...] -> one count per year y0..y1, zero where the SSA lists nothing
// (fewer than 5 babies that year).
export function yearly(packed, y0, y1) {
  const out = new Array(y1 - y0 + 1).fill(0);
  if (!packed) return out;
  const s = packed[0];
  for (let i = 1; i < packed.length; i++) {
    const y = s + i - 1;
    if (y >= y0 && y <= y1) out[y - y0] = packed[i];
  }
  return out;
}

// Per 1,000 babies of that sex born that year.
export const perThousand = (counts, tot) => counts.map((c, i) => (tot[i] ? (1000 * c) / tot[i] : 0));

// Highest value, earliest year on a tie; null if all zero.
export function peak(vals) {
  let best = -1;
  for (let i = 0; i < vals.length; i++) if (vals[i] > 0 && (best < 0 || vals[i] > vals[best])) best = i;
  return best < 0 ? null : best;
}

// The year by which half of everyone ever given the name had been born. Of everyone ever,
// not of those alive now: the SSA file has births, not deaths.
export function medianYear(counts, y0) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let run = 0;
  for (let i = 0; i < counts.length; i++) { run += counts[i]; if (2 * run >= total) return y0 + i; }
  return null;
}

// The babies of each year still alive on 1 January of `asof` (an estimate: births times
// the SSA cohort life table's share alive, migration left out). `alive` is per year from y0.
export const livingCounts = (counts, alive) => counts.map((c, i) => c * (alive[i] ?? 0));

// Of those still alive: how many, the year by which half of them were born, and the age
// someone born that year turns during `asof`.
export function living(counts, alive, y0, asof) {
  const live = livingCounts(counts, alive);
  const n = live.reduce((a, b) => a + b, 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const med = n >= 0.5 ? medianYear(live, y0) : null;
  return { n, share: total ? n / total : 0, median: med, age: med == null ? null : asof - med };
}

// 212,345 -> "about 212,000"; small numbers stay exact enough to be honest.
export function fmtAbout(n) {
  if (n < 0.5) return 'none';
  if (n < 100) return `about ${Math.round(n)}`;
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return `about ${fmtInt(Math.round(n / mag) * mag)}`;
}

// The lines one name contributes: each sex with at least MIN_SEX_SHARE of its babies,
// larger first.
export function seriesFor(name, rec, meta) {
  const per = ['F', 'M'].map((sex) => ({ sex, counts: yearly(rec[sex], meta.y0, meta.y1) }))
    .map((s) => ({ ...s, total: s.counts.reduce((a, b) => a + b, 0) }));
  const all = per[0].total + per[1].total;
  return per.filter((s) => s.total > 0 && s.total >= MIN_SEX_SHARE * all)
    .sort((a, b) => b.total - a.total || (a.sex < b.sex ? -1 : 1))
    .map((s) => ({ name, sex: s.sex, counts: s.counts, total: s.total, rate: perThousand(s.counts, meta.tot[s.sex]),
      rank: rec['r' + s.sex] || [0, 0, 0], both: per.every((p) => p.total > 0 && p.total >= MIN_SEX_SHARE * all) }));
}

export const seriesLabel = (s) => (s.both ? `${s.name} (${SEX_WORD[s.sex]})` : s.name);

export function niceTicks(max) {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((st) => st >= raw);
  const top = Math.ceil(max / step - 1e-9) * step;
  const out = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(+v.toPrecision(12));
  return out;
}

export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export function fmtRate(r) {
  if (r == null) return '—';
  if (r === 0) return '0';
  if (r >= 10) return r.toFixed(1);
  if (r >= 1) return r.toFixed(2);
  if (r >= 0.01) return r.toFixed(3);
  return '<0.01';
}

// "#1", "#1,204", or "not in the list" for a name nobody got (5+) that year.
export const rankLabel = (r) => (r > 0 ? `#${fmtInt(r)}` : 'unranked');

// ?n=Olivia,Emma&u=n. Unknown values fall back rather than throw.
export function encodeState({ names, unit }) {
  const p = new URLSearchParams();
  if (names && names.length) p.set('n', names.join(','));
  if (unit === 'n') p.set('u', 'n');
  const s = p.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}
export function decodeState(search) {
  const p = new URLSearchParams(search);
  return { names: parseNames((p.get('n') || '').slice(0, 120)), unit: p.get('u') === 'n' ? 'n' : 'rate' };
}

// --- where: the state files ----------------------------------------------------------
// A tile per state (50 and DC), [row, col]: roughly where it sits, every tile the same size
// so Rhode Island counts as much as Texas.
export const TILES = {
  AK: [0, 0], ME: [0, 11], VT: [1, 10], NH: [1, 11],
  WA: [2, 1], ID: [2, 2], MT: [2, 3], ND: [2, 4], MN: [2, 5], IL: [2, 6], WI: [2, 7], MI: [2, 8], NY: [2, 9], RI: [2, 10], MA: [2, 11],
  OR: [3, 1], NV: [3, 2], WY: [3, 3], SD: [3, 4], IA: [3, 5], IN: [3, 6], OH: [3, 7], PA: [3, 8], NJ: [3, 9], CT: [3, 10],
  CA: [4, 1], UT: [4, 2], CO: [4, 3], NE: [4, 4], MO: [4, 5], KY: [4, 6], WV: [4, 7], VA: [4, 8], MD: [4, 9], DE: [4, 10],
  AZ: [5, 2], NM: [5, 3], KS: [5, 4], AR: [5, 5], TN: [5, 6], NC: [5, 7], SC: [5, 8], DC: [5, 9],
  OK: [6, 4], LA: [6, 5], MS: [6, 6], AL: [6, 7], GA: [6, 8],
  HI: [7, 0], TX: [7, 4], FL: [7, 9],
};
export const STATE_NAMES = {
  AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DC: 'Washington, DC', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', MA: 'Massachusetts', MD: 'Maryland',
  ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina',
  ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada',
  NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia', VT: 'Vermont', WA: 'Washington',
  WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming',
};
// A state is named in the "most/least common" lines only on enough babies to mean it: a
// "most" needs this many actually given the name there (828 Brighams in Utah, where the US
// rate gives 20, is a pattern; 3 against 1 is one family), a "least" needs the US rate to
// have given it this many (none of an expected 4 says nothing).
export const MIN_BABIES = 30;
// Shade bands on the ratio, symmetric on a log scale: [upper bound, class].
export const BANDS = [[0.5, 'q0'], [0.8, 'q1'], [1.25, 'q2'], [2, 'q3'], [4, 'q4'], [Infinity, 'q5']];
export const BAND_LABELS = ['under ½×', '½–0.8×', 'about the US rate', '1.25–2×', '2–4×', '4× or more'];

// The SSA withholds a name given to under five babies of a sex in a state in a year, so
// each year a state lists none of a name may hide up to this many.
export const WITHHELD_MAX = 4;

// [a.., e.., w..] in `states` order -> one row per state: a babies listed, e what the US rate
// would give, w years the state lists none while the US lists some. ratio = a / e; hi = the
// most it can be once every withheld year is counted at its maximum. Both null when the US
// rate would have given the state under one baby.
export function whereRows(packed, states) {
  const n = states.length;
  if (!packed || packed.length !== 3 * n) return null;
  return states.map((st, i) => {
    const a = packed[i], e = packed[n + i], w = packed[2 * n + i];
    return { st, a, e, w, ratio: e >= 1 ? a / e : null, hi: e >= 1 ? (a + WITHHELD_MAX * w) / e : null };
  });
}

export const band = (ratio) => (ratio == null ? 'na' : BANDS.find(([hi]) => ratio < hi)[1]);
// A map tile's shade. Below the US rate it is shaded only if even the upper bound is: a state
// that lists few only because each year had under five could be anywhere up to `hi`, so it
// is shown as unknown rather than as rare.
export const tileBand = (r) => (r.ratio != null && r.ratio < 0.8 && !(r.hi < 0.8) ? 'na' : band(r.ratio));

// The k states where the name is most (or least) common for its era, among those with
// enough babies to say so. "Least" is judged at the upper bound `hi`, so a state that lists
// none only because each year had under five is not called rare. Ties go to more babies,
// then A-Z.
export function extremes(rows, k = 3, min = MIN_BABIES) {
  const ok = (rows || []).filter((r) => r.ratio != null);
  const pick = (keep, key, dir) => ok.filter(keep)
    .sort((x, y) => dir * (y[key] - x[key]) || y.a - x.a || (x.st < y.st ? -1 : 1)).slice(0, k);
  return { most: pick((r) => r.ratio > 1 && r.a >= min, 'ratio', 1), least: pick((r) => r.hi < 1 && r.e >= min, 'hi', -1) };
}

// 61.5 -> "61×", 3.78 -> "3.8×", 0.44 -> "0.44×"
export function fmtRatio(r) {
  if (r == null) return '—';
  if (r >= 10) return `${Math.round(r)}×`;
  if (r >= 1) return `${r.toFixed(1)}×`;
  return `${r.toFixed(2)}×`;
}
