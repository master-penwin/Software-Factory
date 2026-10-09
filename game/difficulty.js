// difficulty.js — all progression: difficulty(round, seed) -> { size, variety, rule, seconds, countRange, extraUniques }.
// Rounds are 1-based. `seed` picks the run's rule order; same seed, same schedule.
import { seededRng, PARITY_MIN_SIZE } from './rules.js';

export const BLOCK = 3;                                         // rounds per rule, so the player can learn it
export const UNLOCK = { count: 1, symmetry: 4, parity: 10 };    // round each rule first appears (debuts in that block)
export const SECONDS_FLOOR = 3;
// seconds = start(rule, size) × shrink(round). start grows with tiles (eyes must sweep more of them); shrink keeps
// tightening every round, so each (rule, size) gets strictly harder until round 30 — no plateau.
const START_AT_4 = 6, PER_TILE = 0.32;   // count/symmetry: 6s for 4 tiles (tutorial) .. 12.7s for 25 (×0.78 by r19 ≈ 10s)
const PARITY_FACTOR = 1.5;               // parity needs real counting (1–6 items), not a glance
const SHRINK = 0.012;                    // per round: round 30 = 0.65× round 1
export const startSeconds = (rule, size) => (START_AT_4 + PER_TILE * (size - 4)) * (rule === 'parity' ? PARITY_FACTOR : 1);
export const secondsFor = (rule, size, r) =>
  Math.max(SECONDS_FLOOR, Math.round(startSeconds(rule, size) * (1 - SHRINK * (r - 1)) * 10) / 10);

// Size steps at rounds 7/13/19, never on a rule debut (1/4/10), so a new rule and a bigger grid never land together.
export const sizeFor = (r) => (r <= 6 ? 4 : r <= 12 ? 9 : r <= 18 ? 16 : 25); // 25 cap: no 6x6 on phones
export const PARITY_MAX_SIZE = 16;                                              // counting 25 tiles is too slow
// 0 for rounds 1–3 (pure tutorial), 0.2 at round 4, linear to 1 by round 18.
export const varietyFor = (r) => (r < 4 ? 0 : Math.min(1, 0.2 + (0.8 * (r - 4)) / 14));
// Parity debut block: easy surface (variety 0, no forced unique-count followers) at size 9.
export const isParityDebut = (r) => r >= UNLOCK.parity && r < UNLOCK.parity + BLOCK;

function countRangeFor(r, rule) {
  if (rule === 'parity') return sizeFor(r) >= 16 ? [1, 6] : [1, 9];
  // Size >= 16: subitizing range (<= 4 items/tile), so a tile reads at a glance. Count breaker is +-1, so 1..5.
  if (rule === 'symmetry') return sizeFor(r) >= 16 ? [2, 4] : [2, 6];
  return [2, 4];                                                 // count: follower items
}

// Rule per block: a newly unlocked rule debuts in its unlock block; otherwise random among unlocked, never a repeat.
function ruleFor(round, seed) {
  const rng = seededRng(seed), target = Math.floor((round - 1) / BLOCK);
  let prev = null;
  for (let b = 0; b <= target; b++) {
    const start = b * BLOCK + 1;
    const unlocked = Object.keys(UNLOCK).filter((k) => UNLOCK[k] <= start &&
      (k !== 'parity' || (sizeFor(start) >= PARITY_MIN_SIZE && sizeFor(start) <= PARITY_MAX_SIZE)));
    const debut = unlocked.find((k) => UNLOCK[k] === start);
    const options = unlocked.filter((k) => k !== prev);
    prev = debut ?? options[Math.floor(rng() * options.length)];
  }
  return prev;
}

export function difficulty(round, seed = 1) {
  const r = Math.max(1, Math.floor(round));
  const size = sizeFor(r), rule = ruleFor(r, seed);
  const debut = rule === 'parity' && isParityDebut(r);
  return { size, variety: debut ? 0 : varietyFor(r), rule, seconds: secondsFor(rule, size, r), countRange: countRangeFor(r, rule),
    extraUniques: !debut };
}
