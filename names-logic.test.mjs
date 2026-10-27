// node site/names-logic.test.mjs — the page's pure logic, plus the shipped data checked
// against facts read straight out of the SSA file. Exit 1 on any failure.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as L from './names-logic.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// --- parsing --------------------------------------------------------------------------
eq('names split on commas, cleaned, deduplicated without case', L.parseNames('olivia, Liam ,, liam'), ['olivia', 'Liam']);
eq('at most four names', L.parseNames('aa,bb,cc,dd,ee'), ['aa', 'bb', 'cc', 'dd']);
eq('one letter is not a name', L.parseNames('a, Bo'), ['Bo']);
eq('non-letters drop out', L.parseNames("O'Neil, Mary-Jo"), ['ONeil', 'MaryJo']);
eq('shard key', [L.shardKey('Olivia'), L.shardKey('OLIVER')], ['ol', 'ol']);

// --- a made-up shard -------------------------------------------------------------------
const shard = {
  Jordan: { F: [1990, 10, 20, 30], M: [1989, 100, 100, 100, 100], rF: [0, 300, 1992], rM: [50, 40, 1990] },
  Jordyn: { F: [1995, 5, 5], rF: [0, 900, 1995] },
  Jo: { F: [1880, 50], rF: [0, 20, 1880] },
  Jose: { M: [1989, 100, 100, 100], F: [1990, 3], rM: [0, 100, 1990], rF: [0, 900, 1990] },
};
eq('lookup is case-insensitive and returns the shard spelling', [L.lookup(shard, 'JORDAN'), L.lookup(shard, 'jordyn')], ['Jordan', 'Jordyn']);
eq('lookup of an absent name is null', L.lookup(shard, 'Jordana'), null);
eq('prefix matches, most babies first', L.prefixMatches(shard, 'jor'), ['Jordan', 'Jordyn']);
eq('one letter matches nothing', L.prefixMatches(shard, 'j'), []);
const meta = { y0: 1988, y1: 1993, tot: { F: [1000, 1000, 1000, 1000, 1000, 2000], M: [1000, 1000, 1000, 1000, 1000, 1000] } };
eq('yearly spreads a packed record over the range, zero outside it', L.yearly(shard.Jordan.F, 1988, 1993), [0, 0, 10, 20, 30, 0]);
eq('yearly clips a record that starts before the range', L.yearly([1980, 1, 2, 3], 1981, 1983), [2, 3, 0]);
eq('per 1,000 of that sex', L.perThousand([10, 20], [1000, 4000]), [10, 5]);
eq('peak is the highest, earliest on a tie', L.peak([0, 3, 5, 5, 1]), 2);
eq('no peak in all zeros', L.peak([0, 0]), null);
eq('median year: half of the babies by then', L.medianYear([1, 1, 1, 1, 6], 2000), 2004);
eq('median year with an even split takes the earlier', L.medianYear([5, 5], 2000), 2000);
eq('median of nothing is null', L.medianYear([0, 0], 2000), null);
eq('living counts weight each year by its share alive', L.livingCounts([100, 100, 100], [0, 0.5, 1]), [0, 50, 100]);
{
  // 300 born 2000-2002; alive 0, 50, 100: half of the 150 living (75) is only reached in 2002.
  const v = L.living([100, 100, 100], [0, 0.5, 1], 2000, 2026);
  eq('living: how many, share, half born by, age that year', [v.n, +v.share.toFixed(4), v.median, v.age], [150, 0.5, 2002, 24]);
  // Positive control: with everyone alive it is the births median; skewing deaths early moves it later.
  eq('everyone alive: the living median is the births median', L.living([1, 1, 1, 1, 6], [1, 1, 1, 1, 1], 2000, 2026).median, L.medianYear([1, 1, 1, 1, 6], 2000));
  eq('nobody alive: no median, no age', [L.living([5, 5], [0, 0], 2000, 2026).median, L.living([5, 5], [0, 0], 2000, 2026).age], [null, null]);
}
eq('about-numbers', [0.2, 7.4, 212345, 1049, 99.6].map(L.fmtAbout), ['none', 'about 7', 'about 210,000', 'about 1,000', 'about 100']);
{
  const s = L.seriesFor('Jordan', shard.Jordan, meta);
  eq('a unisex name gives two lines, the bigger first', s.map((x) => x.sex), ['M', 'F']);
  eq('and both are labelled by sex', s.map(L.seriesLabel), ['Jordan (boys)', 'Jordan (girls)']);
  eq('rate uses that sex\'s own births', s[0].rate.slice(0, 3), [0, 100, 100]);
  const one = L.seriesFor('Jose', shard.Jose, meta);
  eq('a sex under 5% of a name gets no line, and the label drops the sex', [one.length, L.seriesLabel(one[0])], [1, 'Jose']);
}
eq('nice ticks', L.niceTicks(17), [0, 5, 10, 15, 20]);
eq('ticks for nothing', L.niceTicks(0), [0, 1]);
eq('rates format', [0, 0.004, 0.25, 3.14159, 12.34].map(L.fmtRate), ['0', '<0.01', '0.250', '3.14', '12.3']);
eq('rank labels', [L.rankLabel(1), L.rankLabel(1204), L.rankLabel(0)], ['#1', '#1,204', 'unranked']);
eq('state encodes with readable commas', L.encodeState({ names: ['Olivia', 'Emma'], unit: 'n' }), '?n=Olivia,Emma&u=n');
eq('default state is empty', L.encodeState({ names: [], unit: 'rate' }), '');
eq('state round-trips', L.decodeState(L.encodeState({ names: ['Olivia', 'Emma'], unit: 'n' })), { names: ['Olivia', 'Emma'], unit: 'n' });
eq('unknown unit falls back', L.decodeState('?n=Al&u=evil').unit, 'rate');

// --- the shipped data --------------------------------------------------------------------
const here = fileURLToPath(new URL('.', import.meta.url));
const M = JSON.parse(readFileSync(here + 'data/meta.json', 'utf8'));
const files = readdirSync(here + 'data/n').filter((f) => f.endsWith('.json'));
eq('one shard file per shard counted', files.length, M.counts.shards);
const S = {};
for (const f of files) S[f.slice(0, -5)] = JSON.parse(readFileSync(here + 'data/n/' + f, 'utf8'));
const get = (n) => S[L.shardKey(n)]?.[L.lookup(S[L.shardKey(n)], n)];
eq('covers 1880 to 2025', [M.y0, M.y1], [1880, 2025]);
{
  // Every birth in the totals is in exactly one shard series, and every name sits in the
  // shard its first two letters name.
  const sum = { F: new Array(M.y1 - M.y0 + 1).fill(0), M: new Array(M.y1 - M.y0 + 1).fill(0) };
  let series = 0, misfiled = 0;
  for (const [k, sh] of Object.entries(S)) for (const [n, rec] of Object.entries(sh)) {
    if (L.shardKey(n) !== k) misfiled++;
    for (const sex of ['F', 'M']) if (rec[sex]) { series++; L.yearly(rec[sex], M.y0, M.y1).forEach((c, i) => { sum[sex][i] += c; }); }
  }
  const off = ['F', 'M'].flatMap((sex) => sum[sex].map((c, i) => (c === M.tot[sex][i] ? null : `${sex} ${M.y0 + i}: ${c} vs ${M.tot[sex][i]}`))).filter(Boolean);
  ok('the shards add up to the yearly totals, year by year', !off.length, off.slice(0, 3).join('; '));
  eq('series count', series, M.counts.series);
  eq('no name in the wrong shard', misfiled, 0);
}
// Facts read off the SSA's own yob files (unzip -p data/names.zip yob1990.txt | grep ...).
eq('Matthew, boys, 1990: 44,826', L.yearly(get('Matthew').M, M.y0, M.y1)[1990 - M.y0], 44826);
eq('Olivia, girls, 2025: 13,544', L.yearly(get('Olivia').F, M.y0, M.y1)[2025 - M.y0], 13544);
eq('the 2025 #1s', [M.top.F[0], M.top.M[0], get('Olivia').rF[0], get('Liam').rM[0]], ['Olivia', 'Liam', 1, 1]);
eq('Mary was #1 for girls in 1880 (its best rank, first reached then)', get('Mary').rF.slice(1), [1, 1880]);
{
  const linda = L.seriesFor('Linda', get('Linda'), M)[0];
  const p = L.peak(linda.rate);
  ok('Linda peaks in the late 1940s', M.y0 + p >= 1946 && M.y0 + p <= 1949, M.y0 + p);
  const t = L.seriesFor('Taylor', get('Taylor'), M);
  ok('Taylor is two lines, girls the bigger', t.length === 2 && t[0].sex === 'F', t.map((x) => x.sex));
  // Positive control on the 5% rule: Mary has boys in the file (a few thousand), but far
  // under 5% of a name of four million, so it is one line.
  ok('Mary has boys in the file yet draws one line', get('Mary').M && L.seriesFor('Mary', get('Mary'), M).length === 1);
}
{
  // The survival shares against the raw SSA cohort tables, read here without build.py:
  // a cohort is midway between l(a-1) and l(a), a = asof - year, per 100,000 born.
  // Only in the source tree, where the tables are (the published copy has the shares alone).
  const { gunzipSync } = await import('node:zlib');
  const tree = existsSync(here + '../data/life_F.csv.gz') && existsSync(here + '../build.py');
  const raw = {};
  if (tree) for (const sex of ['F', 'M']) {
    raw[sex] = new Map();
    for (const line of gunzipSync(readFileSync(here + `../data/life_${sex}.csv.gz`)).toString().split('\n')) {
      const c = line.split(',');
      if (/^\d{4}$/.test(c[0]) && /^\d+$/.test(c[1])) raw[sex].set(`${c[0]} ${c[1]}`, +c[3]);
    }
  }
  const want = (sex, y) => { const a = M.asof - y; return ((a === 1 ? 100000 : raw[sex].get(`${y} ${a - 1}`) ?? 0) + (raw[sex].get(`${y} ${a}`) ?? 0)) / 2e5; };
  eq('alive as of the year after the data ends', M.asof, M.y1 + 1);
  const bad = !tree ? [] : ['F', 'M'].flatMap((sex) => M.alive[sex].map((v, i) => (Math.abs(v - want(sex, M.y0 + i)) < 6e-5 ? null : `${sex} ${M.y0 + i}: ${v} vs ${want(sex, M.y0 + i)}`))).filter(Boolean);
  ok('every year\'s share alive matches the raw life table', !bad.length && M.alive.F.length === M.y1 - M.y0 + 1, bad.slice(0, 3).join('; '));
  eq('nobody born before 1900 is alive (the tables start there, and they would be 126)', M.alive.F.slice(0, 1900 - M.y0 + 1).every((v) => v === 0), true);
  ok('women outlive men born the same year (1950)', M.alive.F[1950 - M.y0] > M.alive.M[1950 - M.y0]);
  // Facts from state/scratch/name-alive/lever.py, an independent pass over names.zip and the tables.
  const lv = (n, sex) => { const s = L.seriesFor(n, get(n), M).find((x) => x.sex === sex); return L.living(s.counts, M.alive[sex], M.y0, M.asof); };
  eq('Mildred: half of all born by 1922, half of the living by 1948', [L.medianYear(L.seriesFor('Mildred', get('Mildred'), M)[0].counts, M.y0), lv('Mildred', 'F').median], [1922, 1948]);
  eq('Margaret, Gertrude, John living medians', [lv('Margaret', 'F').median, lv('Gertrude', 'F').median, lv('John', 'M').median], [1958, 1946, 1967]);
  eq('a young name barely moves: Liam 2017, Brittany 1991', [lv('Liam', 'M').median, lv('Brittany', 'F').median], [2017, 1991]);
  eq('Gertrude: 8% of all ever given it are alive', Math.round(100 * lv('Gertrude', 'F').share), 8);
}
ok('rising names grew from 50+ to 300+', ['F', 'M'].every((s) => M.rising[s].length && M.rising[s].every(([, now, then]) => now >= 300 && then >= 50 && now > then)));
ok('the biggest shard stays under 1 MB', Math.max(...files.map((f) => readFileSync(here + 'data/n/' + f).length)) < 1e6);

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
