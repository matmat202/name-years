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
eq('state round-trips', L.decodeState(L.encodeState({ names: ['Olivia', 'Emma'], unit: 'n' })), { names: ['Olivia', 'Emma'], unit: 'n', fr: false });
eq('the France toggle round-trips', L.decodeState(L.encodeState({ names: ['James'], unit: 'rate', fr: true })), { names: ['James'], unit: 'rate', fr: true });
eq('France on is f=1 in the URL', L.encodeState({ names: ['James'], fr: true }), '?n=James&f=1');
eq('any other f is off', L.decodeState('?n=James&f=yes').fr, false);
{
  // frFor on a made-up record: aligned to the US years, null before France begins.
  const meta = { y0: 1898, y1: 1903, fr: { y0: 1900, y1: 1903, floor: 100, tot: { M: [1000, 2000, 1000, 500] } } };
  const f = L.frFor({ M: [1901, 10, 0, 5], sM: ['Léo', 'Leo'] }, 'M', meta);
  eq('frFor counts: null before 1900, zero where Insee lists none', f.counts, [null, null, 0, 10, 0, 5]);
  eq('frFor rate per 1,000 of the French file', f.rate, [null, null, 0, 5, 0, 10]);
  eq('frFor total and spellings', [f.total, f.spell], [15, ['Léo', 'Leo']]);
  eq('frFor peak is by rate, on the shared axis (1903, not 1901)', 1898 + L.peak(f.rate), 1903);
  eq('no French record: null', L.frFor({}, 'M', meta), null);
  eq('no fr in meta: null', L.frFor({ M: [1901, 1] }, 'M', { y0: 1898, y1: 1903 }), null);
  eq('spellNote hides a lone same spelling', L.spellNote('James', ['James']), '');
  eq('spellNote lists accents', L.spellNote('Leo', ['Léo', 'Leo']), 'Léo, Leo');
  eq('spellNote shows a hyphen', L.spellNote('Jeanpierre', ['Jean-Pierre']), 'Jean-Pierre');
}
eq('unknown unit falls back', L.decodeState('?n=Al&u=evil').unit, 'rate');

// --- lines bin/mutate found unguarded (2026-10-27) ---------------------------------------
//
// `bin/mutate site/names-logic.js site/names-logic.test.mjs` scored 78/143, and an output
// sweep (state/scratch/names-equiv/sweep.mjs, control 5/5) said 44 of the survivors change
// what the page answers. The data checks below were already strong; these are the edges of
// the pure functions, which is where the holes were.

// totalOf skips the packed record's FIRST element, which is a year, not a count. Reading
// it adds nineteen hundred babies to every name.
eq('a total counts the counts, not the start year', L.totalOf({ F: [1990, 10, 20, 30] }), 60);
eq('a total adds both sexes', L.totalOf({ F: [1990, 10], M: [2000, 5] }), 15);
eq('a record with a year and no counts totals nothing', L.totalOf({ F: [1990] }), 0);
eq('a missing sex is not a crash', [L.totalOf({ F: [1990, 7] }), L.totalOf({})], [7, 0]);

// prefixMatches: the two-letter minimum is the SHARD's own key length, so a two-letter
// prefix must work; the default limit is eight; and the ordering is babies-then-alphabet,
// which needs three names in the wrong order to show.
{
  const many = {};
  for (let i = 0; i < 11; i++) many['Ka' + String.fromCharCode(97 + i)] = { F: [1990, 11 - i] };
  eq('two letters is enough to match', L.prefixMatches(many, 'ka').length, 8);
  eq('the default limit is eight', L.prefixMatches(many, 'ka'), L.prefixMatches(many, 'ka', 8));
  eq('one letter still matches nothing', L.prefixMatches(many, 'k'), []);
  eq('an explicit limit is obeyed', L.prefixMatches(many, 'ka', 3), ['Kaa', 'Kab', 'Kac']);
  eq('a limit of zero matches nothing', L.prefixMatches(many, 'ka', 0), []);
  eq('no shard matches nothing', L.prefixMatches(null, 'ka'), []);
  // Three names, biggest last in the input, so a broken comparator cannot pass on one pair.
  const order = { Zeta: { F: [1990, 5] }, Zebra: { F: [1990, 50] }, Zero: { F: [1990, 500] } };
  eq('most babies first, whatever order they arrive in', L.prefixMatches(order, 'ze'), ['Zero', 'Zebra', 'Zeta']);
  // Three names with IDENTICAL totals, in reverse alphabetical order: the A-Z tie-break.
  const tie = { Zoe: { F: [1990, 9] }, Zoa: { F: [1990, 9] }, Zob: { F: [1990, 9] } };
  eq('equal totals fall back to A-Z', L.prefixMatches(tie, 'zo'), ['Zoa', 'Zob', 'Zoe']);
}

// yearly: the range is inclusive at BOTH ends, and a record wholly outside it contributes
// nothing rather than writing past the array.
eq('a record exactly spanning the range', L.yearly([1880, 1, 2, 3], 1880, 1882), [1, 2, 3]);
eq('a record running past the end is clipped there', L.yearly([1880, 1, 2, 3], 1881, 1884), [2, 3, 0, 0]);
eq('a record entirely after the range adds nothing', L.yearly([1885, 1, 2], 1880, 1884), [0, 0, 0, 0, 0]);
eq('a record entirely before the range adds nothing', L.yearly([1870, 1, 2], 1880, 1884), [0, 0, 0, 0, 0]);
eq('no record is a row of zeros, not an empty row', L.yearly(null, 1880, 1882), [0, 0, 0]);

// perThousand: a year with no births of that sex is 0, not a division by zero.
eq('a year with no births of that sex is zero', L.perThousand([10, 20], [0, 4000]), [0, 5]);
eq('rates are per 1,000', L.perThousand([1], [1000]), [1]);

// peak: the FIRST year can be the peak. `best < 0 ? null : best` must answer 0, not null.
eq('the first year can be the peak', L.peak([5, 1]), 0);
eq('the last year can be the peak', L.peak([0, 0, 4]), 2);
eq('a peak among negatives and zeros is the only positive', L.peak([0, 7, 0]), 1);
eq('nothing at all has no peak', [L.peak([]), L.peak([0])], [null, null]);
// `peak` runs over RATES as well as counts, and a rate is routinely below one per 1,000:
// a threshold of "more than one" would find no peak at all for most names.
eq('a peak below one per thousand is still a peak', L.peak([0.5, 0.2]), 0);
eq('a single baby is still the best year', L.peak([0, 1, 0]), 1);

// livingCounts: a short `alive` table means zero, not undefined.
eq('years past the end of the life table count as nobody alive', L.livingCounts([10, 10, 10], [1]), [10, 0, 0]);
eq('an empty life table leaves nobody alive', L.livingCounts([10, 10], []), [0, 0]);

// living(): the half-a-person cut, from both sides, and the age arithmetic.
{
  const half = L.living([1], [0.5], 1880, 2026), under = L.living([1], [0.49], 1880, 2026);
  eq('half a living person still gets a median and an age', [half.n, half.median, half.age], [0.5, 1880, 146]);
  eq('under half a person gets neither', [under.median, under.age], [null, null]);
  eq('age is counted from the median year to asof', L.living([10], [1], 2000, 2026).age, 26);
  eq('no births at all is a zero share, not a division by zero', L.living([0, 0], [1, 1], 1880, 2026).share, 0);
}

// fmtAbout: the hundred boundary rounds differently on each side, so a value just over it
// is the one that tells them apart.
eq('just over a hundred rounds to the ten', [L.fmtAbout(100.5), L.fmtAbout(105)], ['about 100', 'about 110']);
eq('just under a hundred stays exact', [L.fmtAbout(99), L.fmtAbout(99.4)], ['about 99', 'about 99']);
eq('half a person is one, not none', [L.fmtAbout(0.49), L.fmtAbout(0.5)], ['none', 'about 1']);

// seriesFor: the 5% rule at exactly 5%, a name with no rank array, and `both`.
{
  const mt = { y0: 1880, y1: 1880, tot: { F: [1000], M: [1000] } };
  const at = (m) => L.seriesFor('X', { F: [1880, 100 - m], M: [1880, m], rF: [1, 2, 3] }, mt);
  eq('exactly five per cent earns a line', at(5).map((x) => x.sex), ['F', 'M']);
  eq('just under five per cent does not', at(4).map((x) => x.sex), ['F']);
  eq('and only a two-line name is labelled by sex', [L.seriesLabel(at(5)[0]), L.seriesLabel(at(4)[0])], ['X (girls)', 'X']);
  eq('a sex with no babies at all gets no line', L.seriesFor('X', { F: [1880, 10], M: null }, mt).map((x) => x.sex), ['F']);
  eq('a name with no rank array reads as unranked', L.seriesFor('X', { F: [1880, 10] }, mt)[0].rank, [0, 0, 0]);
  eq('a name with no babies at all gives no lines', L.seriesFor('X', { F: null, M: null }, mt), []);
  // Equal totals: the sex tie-break, which a single pair would not prove.
  eq('an exact tie puts girls first', L.seriesFor('X', { F: [1880, 50], M: [1880, 50] }, mt).map((x) => x.sex), ['F', 'M']);
}

// niceTicks: a maximum that is already a round step, the step choice either side of each
// boundary in [1, 2, 5, 10], and the epsilon that stops 20 becoming [0..25].
eq('a maximum on a round step does not gain an empty one', L.niceTicks(20), [0, 5, 10, 15, 20]);
eq('ten times that is the same shape', L.niceTicks(40), [0, 10, 20, 30, 40]);
eq('five steps by two', L.niceTicks(5), [0, 2, 4, 6]);
eq('four steps by one', L.niceTicks(4), [0, 1, 2, 3, 4]);
eq('a maximum of one halves', L.niceTicks(1), [0, 0.5, 1]);
eq('small rates still get ticks', L.niceTicks(0.05), [0, 0.02, 0.04, 0.06]);
// The last entry of [1, 2, 5, 10] is only reached when a quarter of the maximum is more
// than five times its own magnitude, so nothing above tests it.
eq('a maximum needing the tenfold step', L.niceTicks(24), [0, 10, 20, 30]);
eq('and the same one magnitude up', L.niceTicks(280), [0, 100, 200, 300]);
eq('a negative maximum is treated as nothing', [L.niceTicks(-5), L.niceTicks(NaN)], [[0, 1], [0, 1]]);

// fmtRate: each threshold from both sides, since one digit of precision is the difference.
eq('ten is one decimal, a hair under it is two', [L.fmtRate(10), L.fmtRate(9.999)], ['10.0', '10.00']);
eq('one is two decimals, a hair under it is three', [L.fmtRate(1), L.fmtRate(0.9999)], ['1.00', '1.000']);
eq('a hundredth is three decimals, under it is a floor', [L.fmtRate(0.01), L.fmtRate(0.00999)], ['0.010', '<0.01']);
eq('nothing is a dash, zero is a zero', [L.fmtRate(null), L.fmtRate(undefined), L.fmtRate(0)], ['—', '—', '0']);

// decodeState: the query is cut at 120 characters before it is parsed, so a very long one
// cannot smuggle a fifth name in past the cut.
eq('the query is cut at 120 characters', L.decodeState('?n=' + 'A'.repeat(118) + ',Bob').names, ['A'.repeat(118)]);
eq('no query is no names', L.decodeState('').names, []);
eq('an empty n is no names', L.decodeState('?n=').names, []);

// --- where (state files), made up ---------------------------------------------------------
{
  const st = ['AA', 'BB', 'CC', 'DD', 'EE'];
  // a, then e, then w, in st order. CC has the top ratio on few babies; DD the top on many.
  const A = [10, 600, 5, 400, 0], E = [100, 300, 1, 100, 50];
  const rows = L.whereRows([...A, ...E, 0, 0, 0, 0, 0], st);
  eq('whereRows pairs each state with its a, e and w', rows.map((r) => [r.st, r.a, r.e, r.w]), [['AA', 10, 100, 0], ['BB', 600, 300, 0], ['CC', 5, 1, 0], ['DD', 400, 100, 0], ['EE', 0, 50, 0]]);
  eq('hi is the ratio when nothing is withheld', rows.map((r) => r.hi), rows.map((r) => r.ratio));
  eq('ratios', rows.map((r) => r.ratio), [0.1, 2, 5, 4, 0]);
  eq('a wrong-length record is no record', [L.whereRows([1, 2, 3], st), L.whereRows([...A, ...E], st)], [null, null]);
  eq('an absent record is no record', L.whereRows(undefined, st), null);
  eq('under one expected baby has no ratio', [L.whereRows([3, 0, 0.4, 1, 0, 0], ['XX', 'YY'])[0].ratio, L.whereRows([3, 0, 0.4, 1, 0, 0], ['XX', 'YY'])[0].hi], [null, null]);
  // EE lists none, but over 20 years with none listed that could be 80, against 50 expected:
  // not rare. AA's 5 withheld years could add 20: 30 of 100 is still rare.
  const wh = L.whereRows([...A, ...E, 5, 0, 0, 0, 20], st);
  eq('hi counts each withheld year at 4', [wh[0].hi, wh[4].hi], [0.3, 1.6]);
  eq('least common is judged at the upper bound', L.extremes(wh, 3).least.map((r) => r.st), ['AA']);
  eq('withholding does not change most common', L.extremes(wh, 3).most.map((r) => r.st), ['DD', 'BB']);
  const x = L.extremes(rows, 3);
  // CC (5x on 5 babies) is under MIN_BABIES; DD 4x beats BB 2x whatever order they came in.
  eq('most common: by ratio, only on 30+ babies', x.most.map((r) => r.st), ['DD', 'BB']);
  eq('least common: lowest first, only on 30+ expected', x.least.map((r) => r.st), ['EE', 'AA']);
  const rev = L.extremes([...rows].reverse(), 3);
  eq('order of the input does not matter', [rev.most.map((r) => r.st), rev.least.map((r) => r.st)], [['DD', 'BB'], ['EE', 'AA']]);
  const tie = L.extremes(L.whereRows([60, 200, 40, 30, 100, 20, 0, 0, 0], ['PP', 'QQ', 'RR']), 3);
  eq('a tie on ratio goes to more babies', tie.most.map((r) => r.st), ['QQ', 'PP', 'RR']);
  eq('k caps the list', L.extremes(rows, 1).most.map((r) => r.st), ['DD']);
  eq('bands at their edges', [0.49, 0.5, 0.79, 0.8, 1, 1.25, 1.99, 2, 3.99, 4, 60, null].map(L.band),
    ['q0', 'q1', 'q1', 'q2', 'q2', 'q3', 'q3', 'q4', 'q4', 'q5', 'q5', 'na']);
  eq('one label per band', L.BAND_LABELS.length, L.BANDS.length);
  const tb = (a, e, w) => L.tileBand(L.whereRows([a, e, w], ['ZZ'])[0]);
  eq('tiles: rare only if rare at the upper bound; common is never in doubt',
    [tb(10, 100, 0), tb(10, 100, 10), tb(10, 100, 20), tb(70, 100, 0), tb(70, 100, 50), tb(300, 100, 30), tb(0, 0, 9)],
    ['q0', 'q0', 'na', 'q1', 'na', 'q4', 'na']);
  eq('fmtRatio', [61.5, 9.96, 3.78, 1, 0.444, null].map(L.fmtRatio), ['62×', '10.0×', '3.8×', '1.0×', '0.44×', '—']);
  const cells = Object.values(L.TILES).map(String);
  ok('51 tiles, no two on one cell', cells.length === 51 && new Set(cells).size === 51);
  eq('every tile has a name', Object.keys(L.TILES).filter((k) => !L.STATE_NAMES[k]), []);
}

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
{
  // The state shards. Facts from state/scratch/name-states/facts.py, an independent pass
  // over the raw namesbystate.zip (csv module, its own expected-count loop).
  const W = M.where;
  eq('state files cover 1910-2025, 51 states with DC', [W.y0, W.y1, W.states.length], [1910, 2025, 51]);
  eq('the state list is the tile list', [...W.states].sort(), Object.keys(L.TILES).sort());
  const sf = readdirSync(here + 'data/s').filter((f) => f.endsWith('.json'));
  const SS = {};
  for (const f of sf) SS[f.slice(0, -5)] = JSON.parse(readFileSync(here + 'data/s/' + f, 'utf8'));
  const where = (n, sex) => L.whereRows(SS[L.shardKey(n)]?.[n]?.[sex], W.states);
  const at = (n, sex, st) => { const r = where(n, sex).find((x) => x.st === st); return [r.a, r.e]; };
  const wOf = (n, sex, sts) => sts.map((st) => where(n, sex).find((x) => x.st === st).w);
  eq('withheld years: Jose VT/NH/HI/UT 116/106/43/53, Leilani 105/103/3/79, Linda 75/70/61/42',
    [wOf('Jose', 'M', ['VT', 'NH', 'HI', 'UT']), wOf('Leilani', 'F', ['VT', 'NH', 'HI', 'UT']), wOf('Linda', 'F', ['VT', 'NH', 'HI', 'UT'])],
    [[116, 106, 43, 53], [105, 103, 3, 79], [75, 70, 61, 42]]);
  ok('Leilani is not called rare in Vermont, where every year may hide four', !L.extremes(where('Leilani', 'F'), 51).least.some((r) => r.st === 'VT'));
  // Brigham is the reason for the coverage rule: 46% of his births are in the state file
  // (facts.py: Utah 828 against 20), the rest withheld in the states with under five a year.
  eq('Brigham is not mapped: the state counts hold 46% of him', SS.br.Brigham.M, [46]);
  eq('a thin record is no map', where('Brigham', 'M'), null);
  eq('Jose, boys: Texas 170,769 (49,792), New Hampshire 63 (1,964)', [at('Jose', 'M', 'TX'), at('Jose', 'M', 'NH')], [[170769, 49792], [63, 1964]]);
  eq('Leilani, girls: Hawaii 1,976 (113)', at('Leilani', 'F', 'HI'), [1976, 113]);
  // The reason e is year-matched: over all years Linda looks rare in Nevada (0.44x), only
  // because Nevada grew after her 1947 peak. For her own era she is a little common there.
  eq('Linda, girls: Nevada 1,968 (1,577), California 114,963 (113,535)', [at('Linda', 'F', 'NV'), at('Linda', 'F', 'CA')], [[1968, 1577], [114963, 113535]]);
  eq('Matthew, boys: New Hampshire 8,976 (5,776)', at('Matthew', 'M', 'NH'), [8976, 5776]);
  eq('Leilani is most common in Hawaii', L.extremes(where('Leilani', 'F'), 1).most[0].st, 'HI');
  eq('Jose: Texas, New Mexico, California top; New Hampshire among the least', [L.extremes(where('Jose', 'M')).most.map((r) => r.st).sort(), L.extremes(where('Jose', 'M'), 51).least.some((r) => r.st === 'NH')], [['CA', 'NM', 'TX'], true]);
  // Every name's expected counts add up to its actual ones: the US rate shares out the
  // same babies. Rounding moves each state by at most half a baby.
  let n = 0, thin = 0, worst = 0, small = 0, misfiled = 0, overcover = [];
  for (const [k, sh] of Object.entries(SS)) for (const [nm, rec] of Object.entries(sh)) {
    if (L.shardKey(nm) !== k) misfiled++;
    for (const sex of ['F', 'M']) if (rec[sex]) {
      // coverage against the national shard, recomputed here: births since the state files begin
      const nat = L.yearly(S[k]?.[nm]?.[sex], W.y0, W.y1).reduce((t, c) => t + c, 0);
      if (rec[sex].length === 1) {
        thin++;
        if (!(rec[sex][0] < 100 * W.cover)) overcover.push(nm);
        continue;
      }
      n++;
      const rs = L.whereRows(rec[sex], W.states);
      if (!rs) { overcover.push(nm + ' (bad record)'); continue; }
      if (rs.reduce((t, r) => t + r.a, 0) < W.cover * nat) overcover.push(nm + ' (mapped under the cover)');
      const A = rs.reduce((t, r) => t + r.a, 0), E = rs.reduce((t, r) => t + r.e, 0);
      worst = Math.max(worst, Math.abs(A - E));
      if (A < W.floor) small++;
    }
  }
  ok('every name\'s expected counts sum to its actual ones (within rounding)', worst <= 26, worst);
  eq(`no name under the ${W.floor}-baby floor`, small, 0);
  eq('no state record in the wrong shard', misfiled, 0);
  eq('every mapped name holds 90%+ of its US births in the state file; every thin one under it', overcover.slice(0, 5), []);
  eq('mapped and thin lines, as meta counts them', [n, n + thin], [M.counts.whereMapped, M.counts.whereLines]);
  ok('over 1,500 name lines mapped', n > 1500, n);
  ok('every state shard has a name shard (the page fetches both by the same key)', sf.every((f) => files.includes(f)));
  ok('the biggest state shard stays under 1 MB', Math.max(...sf.map((f) => readFileSync(here + 'data/s/' + f).length)) < 1e6);
}
ok('the biggest shard stays under 1 MB', Math.max(...files.map((f) => readFileSync(here + 'data/n/' + f).length)) < 1e6);

// --- France ----------------------------------------------------------------------------
{
  const F = M.fr;
  eq('France covers 1900 to 2025', [F.y0, F.y1], [1900, 2025]);
  const ff = readdirSync(here + 'data/f').filter((f) => f.endsWith('.json'));
  const FS = {};
  for (const f of ff) FS[f.slice(0, -5)] = JSON.parse(readFileSync(here + 'data/f/' + f, 'utf8'));
  const fget = (n) => FS[L.shardKey(n)]?.[n];
  const fyear = (n, sex, y) => L.yearly(fget(n)?.[sex], F.y0, F.y1)[y - F.y0];
  // Facts read off Insee's own CSV (unzip -p data/fr.zip | awk -F';' '$2=="JAMES" && $3==2021').
  eq('James, boys, France 2021: 395', fyear('James', 'M', 2021), 395);
  eq('Robert, boys, France 1926: 11,580', fyear('Robert', 'M', 1926), 11580);
  eq('Marie, girls, France 1900: 48,695', fyear('Marie', 'F', 1900), 48695);
  eq('Leo, boys, France 2025: LÉO 3,420 + LEO 170', fyear('Leo', 'M', 2025), 3590);
  eq('Leo lists both spellings, most first', fget('Leo').sM, ['Léo', 'Leo']);
  eq('French girls in the file, 1950: 430,345', F.tot.F[1950 - F.y0], 430345);
  // The point of the feature: on the shipped data, James peaks in France 70+ years after the US.
  const us = L.seriesFor('James', get('James'), M)[0];
  const fr = L.frFor(fget('James'), 'M', M);
  ok('James: US peak by rate before 1950, French peak after 2015',
    M.y0 + L.peak(us.rate) < 1950 && M.y0 + L.peak(fr.rate) > 2015, [M.y0 + L.peak(us.rate), M.y0 + L.peak(fr.rate)]);
  let misfiled = 0, orphan = 0, small = 0, over = 0, lines = 0;
  const sum = { F: new Array(F.y1 - F.y0 + 1).fill(0), M: new Array(F.y1 - F.y0 + 1).fill(0) };
  for (const [k, sh] of Object.entries(FS)) for (const [n, rec] of Object.entries(sh)) {
    if (L.shardKey(n) !== k) misfiled++;
    if (!S[k]?.[n]) orphan++; // the page only looks up names the US shard has
    for (const sex of ['F', 'M']) if (rec[sex]) {
      lines++;
      const c = L.yearly(rec[sex], F.y0, F.y1);
      if (c.reduce((a, b) => a + b, 0) < F.floor) small++;
      c.forEach((v, i) => { sum[sex][i] += v; });
    }
  }
  for (const sex of ['F', 'M']) sum[sex].forEach((v, i) => { if (v > F.tot[sex][i]) over++; });
  eq('no French record in the wrong shard', misfiled, 0);
  eq('every French record is a name the US shards have', orphan, 0);
  eq(`no French line under the ${F.floor}-baby floor`, small, 0);
  eq('no year where the French lines exceed the French total', over, 0);
  eq('French lines, as meta counts them', lines, M.counts.frLines);
  ok('the biggest French shard stays under 1 MB', Math.max(...ff.map((f) => readFileSync(here + 'data/f/' + f).length)) < 1e6);
  ok('every French shard has a name shard', ff.every((f) => files.includes(f)));
}

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
