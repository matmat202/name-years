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
