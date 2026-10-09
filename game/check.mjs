// check.mjs — verifies rules.js over 1000 grids: one breaker per rule, no decoys, no overlapping items,
// plus anti-gaming checks (no more/fewer, position or item-count shortcut to the breaker).
import fs from 'node:fs';
import { makeGrid, seededRng, RULES, COLORS, TILE_BG, EDGE_MARGIN } from './rules.js';
import { difficulty } from './difficulty.js';

const EPS = 1e-6;
const count = (t) => t.items.length;

// Independent rule predicates: each returns the indices of tiles that break the rule.
const breakers = {
  count(tiles) {
    const freq = {};
    tiles.forEach((t) => (freq[count(t)] = (freq[count(t)] || 0) + 1));
    const n = +Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
    const odd = tiles.map((t, i) => i).filter((i) => count(tiles[i]) !== n);
    return odd.every((i) => Math.abs(count(tiles[i]) - n) === 1) ? odd : [];
  },
  symmetry(tiles) {
    // Asymmetry = how far the worst item is from a matching mirror partner; breaker must be clearly off.
    const asym = (t) => Math.max(0, ...t.items.map((a) => Math.min(Infinity, ...t.items
      .filter((b) => b.shape === a.shape && b.color === a.color)
      .map((b) => Math.hypot(1 - a.x - b.x, a.y - b.y)))));
    const odd = tiles.map((t, i) => i).filter((i) => asym(tiles[i]) > EPS);
    return odd.every((i) => asym(tiles[i]) >= 0.1) ? odd : [];
  },
  parity(tiles) {
    const even = tiles.filter((t) => count(t) % 2 === 0).length;
    const majority = even * 2 > tiles.length ? 0 : 1;
    const odd = tiles.map((t, i) => i).filter((i) => count(tiles[i]) % 2 !== majority);
    const followerCounts = new Set(tiles.filter((_, i) => !odd.includes(i)).map(count));
    return followerCounts.size >= 2 ? odd : [];
  },
};

const hasDecoy = (tiles) => ['shape', 'color'].some((prop) => {
  const holders = {};
  tiles.forEach((t, i) => t.items.forEach((it) => (holders[it[prop]] ??= new Set()).add(i)));
  return Object.values(holders).some((s) => s.size < 2);
});

// R = the grid's item radius (rules.js sizes items per grid, up to 0.12 for small counts). Shapes stay within R of
// their center, so an item's extent must keep EDGE_MARGIN (0.04) from every tile edge.
const edge = (R) => R + 0.04 - EPS;
const overlaps = (t, R) => t.items.some((a, i) =>
  a.x < edge(R) || a.x > 1 - edge(R) || a.y < edge(R) || a.y > 1 - edge(R) ||
  t.items.slice(i + 1).some((b) => Math.hypot(a.x - b.x, a.y - b.y) < 2 * R));

// Breaker must not be the only tile whose item count nobody else shares (count rule exempt: count is the rule).
const soleUnique = (tiles, b) => {
  const freq = {};
  tiles.forEach((t) => (freq[count(t)] = (freq[count(t)] || 0) + 1));
  const uniq = tiles.map((t, i) => i).filter((i) => freq[count(tiles[i])] === 1);
  return uniq.length === 1 && uniq[0] === b;
};

// Tile distance: each item matched to the nearest item of the other tile; displacement + shape/color mismatch, both ways.
const oneWay = (A, B) => A.items.reduce((s, a) => {
  const m = B.items.reduce((best, b) => (Math.hypot(a.x - b.x, a.y - b.y) < Math.hypot(a.x - best.x, a.y - best.y) ? b : best));
  return s + Math.hypot(a.x - m.x, a.y - m.y) + (a.shape !== m.shape) + (a.color !== m.color);
}, 0);
const dist = (A, B) => oneWay(A, B) + oneWay(B, A);
// Count rule: the extra/missing item IS the rule, so exclude it. Greedy one-to-one matching by cost,
// unmatched items ignored, averaged over matched pairs (so tile size doesn't count either).
const cost = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) + (a.shape !== b.shape) + (a.color !== b.color);
const matchedDist = (A, B) => {
  const pairs = A.items.flatMap((a, i) => B.items.map((b, j) => [cost(a, b), i, j])).sort((p, q) => p[0] - q[0]);
  const ua = new Set(), ub = new Set(); let s = 0, m = 0;
  for (const [c, i, j] of pairs) if (!ua.has(i) && !ub.has(j)) { ua.add(i); ub.add(j); s += c; m++; }
  return m ? s / m : 0;
};
const mostDifferent = (tiles, rule) => {
  const d = rule === 'count' ? matchedDist : dist;
  const mean = tiles.map((A) => tiles.reduce((s, B) => s + d(A, B), 0));
  return mean.indexOf(Math.max(...mean));
};

// Legibility: WCAG contrast of every palette color vs the tile background (≥ 3:1), and the tile background is the
// one index.html actually paints.
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = /^#[0-9a-f]{6}$/i;
const lowContrast = COLORS.filter((c) => !hex.test(c) || !(contrast(c, TILE_BG) >= 3));
const bgCss = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8').match(/#grid button \{[^}]*background:\s*([^;]+);/)?.[1].trim();
const bgMismatch = !hex.test(TILE_BG) || ![TILE_BG, TILE_BG.replace(/#(.)\1(.)\2(.)\3/i, '#$1$2$3')].includes(bgCss?.toLowerCase()) || EDGE_MARGIN < 0.04;

const fails = { breaker: 0, decoy: 0, overlap: 0, soleUnique: 0, parityTooSmall: 0, lowContrast: lowContrast.length, bgMismatch: +bgMismatch };
const vis = Object.fromEntries(RULES.map((r) => [r, { hits: 0, chance: 0, n: 0 }]));
const N = 1000;
for (let k = 0; k < N; k++) {
  const rule = RULES[k % 3], size = 4 + (k % 33), variety = [0, 0.5, 1][Math.floor(k / 3) % 3];
  const g = makeGrid({ size, variety, rule, rng: seededRng(k + 1) });
  const b = breakers[g.rule](g.tiles);
  if (g.rule === 'parity' && size < 9) fails.parityTooSmall++;
  if (g.rule !== 'count' && soleUnique(g.tiles, g.breakerIndex)) fails.soleUnique++;
  if (variety >= 0.5) { const v = vis[g.rule]; v.n++; v.chance += 1 / size; v.hits += mostDifferent(g.tiles, g.rule) === g.breakerIndex; }
  if (g.tiles.length !== size || b.length !== 1 || b[0] !== g.breakerIndex) fails.breaker++;
  if (hasDecoy(g.tiles)) fails.decoy++;
  if (g.tiles.some((t) => overlaps(t, g.itemR))) fails.overlap++;
}
// Same structural checks on the grids the game actually serves (difficulty.js params, rounds 1–30).
let gameBad = 0, debutBad = 0, debutN = 0; const G = 600;
for (let k = 0; k < G; k++) {
  const d = difficulty(1 + (k % 30), 1 + Math.floor(k / 30));
  const g = makeGrid({ ...d, rng: seededRng(500000 + k) });
  const b = breakers[g.rule](g.tiles);
  if (g.rule !== d.rule || g.tiles.length !== d.size || b.length !== 1 || b[0] !== g.breakerIndex || hasDecoy(g.tiles) ||
    // Parity debut has no forced unique followers by design, so the breaker is the only unique count there.
    g.tiles.some((t) => overlaps(t, g.itemR)) || (g.rule !== 'count' && d.extraUniques !== false && soleUnique(g.tiles, g.breakerIndex))) gameBad++;
  if (d.extraUniques === false) {   // parity debut: no follower count appears only once
    debutN++;
    const freq = {};
    g.tiles.forEach((t, i) => i !== g.breakerIndex && (freq[count(t)] = (freq[count(t)] || 0) + 1));
    if (Object.values(freq).some((n) => n < 2)) debutBad++;
  }
}
fails.debutUniques = debutBad + (debutN === 0);
fails.gameParams = gameBad;
// Per rule, so a tell in one rule can't hide in an average.
const visBad = RULES.filter((r) => vis[r].hits / vis[r].n > 1.5 * (vis[r].chance / vis[r].n)).length;
const visText = RULES.map((r) => `${r} ${((vis[r].hits / vis[r].n) * 100).toFixed(1)}% vs ${((vis[r].chance / vis[r].n) * 100).toFixed(1)}%`).join(', ');

// Anti-gaming: the breaker must not be findable by a shortcut. Separate, larger sample so the bands are tight.
const M = 6000, BUCKETS = 4;
let more = 0, fewer = 0, diffSum = 0, diffSq = 0;
const posObs = Array(BUCKETS).fill(0), posExp = Array(BUCKETS).fill(0);
for (let k = 0; k < M; k++) {
  const rule = RULES[k % 3], size = 4 + (k % 33), variety = [0, 0.5, 1][Math.floor(k / 3) % 3];
  const g = makeGrid({ size, variety, rule, rng: seededRng(100000 + k) });
  const counts = g.tiles.map(count), bc = counts[g.breakerIndex];
  if (g.rule === 'count') { const others = counts.filter((_, i) => i !== g.breakerIndex)[0]; bc > others ? more++ : fewer++; }
  // (b) position: bucket by relative position; expected share accounts for sizes not divisible by BUCKETS.
  const bucket = (i) => Math.floor((i * BUCKETS) / size);
  posObs[bucket(g.breakerIndex)]++;
  for (let i = 0; i < size; i++) posExp[bucket(i)] += 1 / size;
  // (c) breaker item count minus the grid's mean item count.
  const d = bc - counts.reduce((a, c) => a + c, 0) / size;
  diffSum += d; diffSq += d * d;
}
const moreRate = more / (more + fewer), moreBad = moreRate < 0.45 || moreRate > 0.55;               // (a)
const posRatio = Math.max(...posObs.map((o, i) => o / posExp[i])), posBad = posRatio > 1.5;            // (b)
// (c) Tolerance = 3 standard errors of the sample mean (~99.7% band if unbiased). For scale: the old
// "fewer 2/3 of the time" count breaker alone shifts this mean by about -1/9 item, well outside the band.
const diffMean = diffSum / M, diffSE = Math.sqrt((diffSq / M - diffMean ** 2) / M), diffBad = Math.abs(diffMean) > 3 * diffSE;
const bad = Object.values(fails).reduce((a, b) => a + b, 0) + visBad + moreBad + posBad + diffBad;
console.log(`${bad ? 'FAIL' : 'PASS'} ${N} grids — bad breaker: ${fails.breaker}, decoys: ${fails.decoy}, overlaps: ${fails.overlap}, ` +
  `sole-unique breaker: ${fails.soleUnique}, small-grid parity: ${fails.parityTooSmall}, game-param grids bad: ${gameBad}/${G}, ` +
  `parity-debut grids with a unique follower count: ${debutBad}/${debutN}, colors < 3:1 vs ${TILE_BG}: ${lowContrast.join(' ') || 0} ` +
  `(min ${Math.min(...COLORS.map((c) => (hex.test(c) ? contrast(c, TILE_BG) : 0))).toFixed(2)}), tile bg mismatch: ${+bgMismatch}, ` +
  `breaker most-different (variety≥0.5, vs chance, limit 1.5×): ${visText}`);
console.log(`anti-gaming (${M} grids) — count breaker has more items: ${(moreRate * 100).toFixed(1)}% (45–55%), ` +
  `breaker position max bucket ${posRatio.toFixed(2)}× expected (limit 1.5×), ` +
  `breaker − grid mean items: ${diffMean.toFixed(3)} (limit ±${(3 * diffSE).toFixed(3)} = 3 SE)`);
process.exit(bad ? 1 : 0);
