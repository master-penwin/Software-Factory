// difficulty.check.mjs — prints difficulty() for rounds 1–30 and asserts the progression invariants over many run seeds.
import { difficulty, secondsFor, BLOCK, UNLOCK, SECONDS_FLOOR, isParityDebut, PARITY_MAX_SIZE } from './difficulty.js';
import { PARITY_MIN_SIZE } from './rules.js';

const ROUNDS = 30, SEEDS = 200;
// Expected items per tile: count = follower count (breaker is ±1, averages out), symmetry/parity uniform-ish lo..hi.
const meanItems = ({ countRange: [lo, hi] }) => (lo + hi) / 2;
const workload = (d) => (d.size * meanItems(d)) / d.seconds; // items on screen per second

// Per-rule caps. count/symmetry: ≤ 4.5× the rounds 1–3 tutorial pace (4 tiles, ~3 items, ~6s ≈ 2 items/s).
// Parity: ≤ 2× its own first-appearance workload (per seed), since it needs real counting.
const CAP = 4.5 * Math.max(...[1, 2, 3].map((r) => workload(difficulty(r))));
const PARITY_CAP_X = 2;

const fails = [];
const fail = (msg) => fails.length < 10 && fails.push(msg);
for (let seed = 1; seed <= SEEDS; seed++) {
  const ds = Array.from({ length: ROUNDS }, (_, i) => difficulty(i + 1, seed));
  const firstSec = {}, lastSec = {};       // per (rule,size): seconds at first appearance / previous appearance
  let parityBase = null;
  ds.forEach((d, i) => {
    const r = i + 1, p = ds[i - 1];
    if (p && d.size < p.size) fail(`seed ${seed} r${r}: size decreased`);
    // Variety ramps (parity debut block is pinned to 0 by design, so compare across it).
    const pv = ds.slice(0, i).reverse().find((q, j) => !isParityDebut(i - j));
    if (!isParityDebut(r) && pv && d.variety < pv.variety) fail(`seed ${seed} r${r}: variety decreased`);
    // Review fixes (each fails on the pre-fix schedule):
    // 1. parity debut block: size 9, variety 0, no extra unique followers; no size step on a rule debut.
    if (isParityDebut(r) && (d.rule !== 'parity' || d.size !== 9 || d.variety !== 0 || d.extraUniques !== false))
      fail(`seed ${seed} r${r}: parity debut is ${d.rule}@${d.size} v${d.variety} extraUniques ${d.extraUniques}`);
    if (!isParityDebut(r) && d.extraUniques !== true) fail(`seed ${seed} r${r}: extraUniques off outside parity debut`);
    if (p && d.size !== p.size && Object.values(UNLOCK).includes(r)) fail(`seed ${seed} r${r}: size step on a rule debut`);
    // 2. parity only at sizes 9–16.
    if (d.rule === 'parity' && d.size > PARITY_MAX_SIZE) fail(`seed ${seed} r${r}: parity at size ${d.size}`);
    // 3. followers vary from round 4 (≥ 0.15), full variety by round 18.
    if (r >= 4 && !isParityDebut(r) && d.variety < 0.15) fail(`seed ${seed} r${r}: variety ${d.variety} < 0.15 from round 4`);
    if (r >= 18 && d.variety !== 1) fail(`seed ${seed} r${r}: variety ${d.variety} not 1 by round 18`);
    if (d.seconds < SECONDS_FLOOR) fail(`seed ${seed} r${r}: ${d.seconds}s < ${SECONDS_FLOOR}s`);
    const pair = `${d.rule}@${d.size}`;
    if (pair in lastSec && d.seconds > lastSec[pair]) fail(`seed ${seed} r${r}: ${pair} seconds rose ${lastSec[pair]} -> ${d.seconds}`);
    if (!(pair in firstSec)) {
      firstSec[pair] = d.seconds;
      if (!(secondsFor(d.rule, d.size, ROUNDS) < d.seconds)) fail(`seed ${seed} r${r}: ${pair} not strictly harder at r${ROUNDS}`);
    }
    lastSec[pair] = d.seconds;
    if (d.rule === 'parity') {
      parityBase ??= workload(d);
      if (workload(d) > PARITY_CAP_X * parityBase + 1e-9) fail(`seed ${seed} r${r}: parity workload ${workload(d).toFixed(2)} > ${PARITY_CAP_X}× ${parityBase.toFixed(2)}`);
    } else if (workload(d) > CAP + 1e-9) fail(`seed ${seed} r${r}: workload ${workload(d).toFixed(2)} > cap ${CAP.toFixed(2)}`);
    if (d.size === 25 && d.rule !== 'parity' && d.size !== p?.size && d.seconds > 10) fail(`seed ${seed} r${r}: 5×5 ${d.rule} starts at ${d.seconds}s > 10s`);
    if (d.size >= 16 && d.rule !== 'parity' && d.countRange[1] + (d.rule === 'count') > 5) fail(`seed ${seed} r${r}: >4 items/tile at size ${d.size}`);
    if (d.rule === 'parity' && d.size < PARITY_MIN_SIZE) fail(`seed ${seed} r${r}: parity at size ${d.size}`);
    if (r < UNLOCK[d.rule]) fail(`seed ${seed} r${r}: ${d.rule} before its unlock round ${UNLOCK[d.rule]}`);
    if (r === UNLOCK[d.rule] && r > 1 && p.rule === d.rule) fail(`seed ${seed} r${r}: unlock block not a debut`);
    if (Object.entries(UNLOCK).some(([k, u]) => u === r && d.rule !== k)) fail(`seed ${seed} r${r}: ${d.rule} instead of debuting rule`);
    const blockStart = (r - 1) % BLOCK === 0;
    if (!blockStart && d.rule !== p.rule) fail(`seed ${seed} r${r}: rule changed mid-block`);
    if (blockStart && p && d.rule === p.rule) fail(`seed ${seed} r${r}: same rule two blocks in a row`);
  });
}

const fmt = (v, w) => String(v).padStart(w);
console.log('round size variety rule      seconds countRange workload');
for (let r = 1; r <= ROUNDS; r++) {
  const d = difficulty(r);
  console.log(`${fmt(r, 5)} ${fmt(d.size, 4)} ${fmt(d.variety.toFixed(2), 7)} ${d.rule.padEnd(9)} ${fmt(d.seconds.toFixed(1), 7)} ` +
    `${fmt(d.countRange.join('–'), 10)} ${fmt(workload(d).toFixed(2), 8)}`);
}
console.log(`(table: seed 1; asserts over ${SEEDS} seeds × ${ROUNDS} rounds; count/symmetry cap ${CAP.toFixed(2)} items/s = 4.5 × rounds 1–3 max; parity ≤ ${PARITY_CAP_X}× its first round)`);
console.log(fails.length ? `FAIL\n  ${fails.join('\n  ')}` : 'PASS size/variety non-decreasing, seconds ≥ 3 and non-increasing per (rule,size), strictly harder at r30, ' +
  'per-rule workload caps, 5×5 count/symmetry starts ≤ 10s, ≤ 4 items/tile at size ≥ 16, parity size ≥ 9, ' +
  'no same-rule consecutive blocks, unlock order, parity debut 9/v0/no extra uniques, no size step on a debut, ' +
  'parity ≤ 16 tiles, variety ≥ 0.15 from r4 and 1 by r18');
process.exit(fails.length ? 1 : 0);
