// rules.js — rule engine: builds odd-one-out grids where every tile follows a hidden rule except exactly one.
export const SHAPES = ['circle', 'square', 'triangle'];
// Hex so contrast is checkable: each is >= 3:1 against TILE_BG (check.mjs). Yellow (1.07:1) was replaced by dark orange.
export const COLORS = ['#ff0000', '#0000ff', '#008000', '#c05800', '#800080'];
export const TILE_BG = '#fffdf8';     // must match `#grid button` background in index.html (check.mjs asserts it)
export const EDGE_MARGIN = 0.04;      // min gap between any item's extent and the tile edge, in tile units
export const RULES = ['count', 'symmetry', 'parity'];
export const ITEM_R = 0.08;            // smallest item radius, in tile units (tile is 0..1); used for up to 12 items
// Largest radius that still packs a tile's item count (plus spare base slots for layout variety) without overlap.
export const itemRadius = (maxItems) => (maxItems <= 6 ? 0.12 : maxItems <= 7 ? 0.11 : ITEM_R);
// Base layout points; count/parity tiles use a subset. 6–7 items get 2 spares, not 3, so the edge margin still packs.
const slotsFor = (maxItems) => (maxItems <= 5 ? maxItems + 3 : maxItems <= 7 ? maxItems + 2 : 12);
let R = ITEM_R, GAP = 2 * R + 0.02;   // current grid's radius and min center distance (set per buildGrid)

export function seededRng(seed) {     // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, a, b) => a + rng() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// A slot is 'free' (one item), 'pair' (item + its mirror about x=0.5) or 'axis' (one item on x=0.5).
const expand = (p) => (p.kind === 'pair' ? [p, { ...p, x: 1 - p.x }] : [p]);
const clear = (pts, others) => pts.every((p) => others.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= GAP));

function candidate(rng, kind, near, amt) {
  const xMax = kind === 'pair' ? 0.5 - GAP / 2 : 1 - R;
  const rnd = (lo, hi, c) => (near ? clamp(c + between(rng, -amt, amt), lo, hi) : between(rng, lo, hi));
  const lo = R + EDGE_MARGIN, hi = 1 - lo;
  const x = kind === 'axis' ? 0.5 : rnd(lo, Math.min(xMax, hi), near?.x);
  return { kind, x, y: rnd(lo, hi, near?.y) };
}

// Place one point per slot kind without overlaps; optionally jitter around a base layout by `amt`.
function place(rng, kinds, base, amt) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const placed = [];
    for (const [i, kind] of kinds.entries()) {
      for (let t = 0; t < 40 && placed.length === i; t++) {
        const p = candidate(rng, kind, base?.[i], amt);
        const pts = expand(p);
        if (clear(pts, placed.flatMap(expand)) && (pts.length < 2 || clear([pts[0]], [pts[1]]))) placed.push(p);
      }
      if (placed.length === i) break;
    }
    if (placed.length === kinds.length) return placed;
  }
  throw new Error('could not place items'); // caller retries with a fresh layout
}

// Turn placed slots into items, giving each slot (and its mirror) one shape and color.
function dress(rng, slots, look) {
  return slots.flatMap((p) => {
    const shape = pick(rng, look.shapes), color = pick(rng, look.colors);
    return expand(p).map(({ x, y }) => ({ x, y, shape, color }));
  });
}

// Per-tile surface: with probability `variety` a tile draws from its own random sub-palette of the grid's look,
// so whole tiles differ from each other (mostly-red vs mixed, etc.) — not just single items.
function tileLook(rng, look, v) {
  if (rng() >= v) return look;
  const sub = (arr) => arr.map((a) => [rng(), a]).sort((a, b) => a[0] - b[0]).slice(0, 1 + Math.floor(rng() * arr.length)).map((p) => p[1]);
  return { shapes: sub(look.shapes), colors: sub(look.colors) };
}

const key = (it) => `${it.shape}|${it.color}|${it.x.toFixed(6)}|${it.y.toFixed(6)}`;
const isMirrored = (items) => {
  const set = new Set(items.map(key));
  return items.every((it) => set.has(key({ ...it, x: 1 - it.x })));
};

// Move one paired item far up/down so the tile is clearly not mirror symmetric.
function breakSymmetry(rng, items) {
  const idx = items.map((it, i) => i).filter((i) => Math.abs(items[i].x - 0.5) > 1e-9);
  for (let t = 0; t < 200; t++) {
    const i = pick(rng, idx), it = items[i];
    const y = it.y + (rng() < 0.5 ? -1 : 1) * between(rng, 0.25, 0.5);
    if (y < R + EDGE_MARGIN || y > 1 - R - EDGE_MARGIN) continue;
    const moved = { ...it, y }, rest = items.filter((_, j) => j !== i);
    if (clear([moved], rest)) {
      const out = items.slice(); out[i] = moved;
      if (!isMirrored(out)) return out;
    }
  }
  return null;
}

// No decoys: any shape/color held by only one tile is swapped there for the most widespread one.
function removeDecoys(tiles) {
  for (const prop of ['shape', 'color']) {
    for (;;) {
      const holders = new Map();
      tiles.forEach((t, i) => t.items.forEach((it) => holders.set(it[prop], (holders.get(it[prop]) || new Set()).add(i))));
      const lone = [...holders].find(([, s]) => s.size === 1);
      if (!lone) break;
      const common = [...holders].filter(([v]) => v !== lone[0]).sort((a, b) => b[1].size - a[1].size)[0][0];
      for (const it of tiles[[...lone[1]][0]].items) if (it[prop] === lone[0]) it[prop] = common;
    }
  }
}

export const PARITY_MIN_SIZE = 9;     // below this a rule-follower is often count-unique too

export function makeGrid(opts = {}) {
  for (let t = 0; t < 50; t++) {
    try { return buildGrid(opts); } catch (e) { if (t === 49) throw e; }
  }
}

// countRange [lo, hi]: count rule = follower item count (breaker is ±1); parity = all item counts.
// symmetry = item count per tile. Defaults keep slice-1 behaviour: count 2..5, symmetry 2..6, parity 1..9.
// extraUniques (parity only): false = no forced unique-count followers; every follower count then appears 2+ times
// (used for the parity debut block, so no follower looks like an outlier while the rule is being learned).
function buildGrid({ size = 9, variety = 0, rule, rng = Math.random, countRange, extraUniques = true } = {}) {
  const allowed = size >= PARITY_MIN_SIZE ? RULES : RULES.filter((r) => r !== 'parity');
  if (!allowed.includes(rule)) rule = pick(rng, allowed);
  const [lo, hi] = countRange ?? (rule === 'parity' ? [1, 9] : rule === 'symmetry' ? [2, 6] : [2, 5]);
  const maxItems = rule === 'count' ? hi + 1 : hi;
  R = itemRadius(maxItems); GAP = 2 * R + 0.02;
  const SLOTS = slotsFor(maxItems);
  const v = clamp(variety, 0, 1);
  const shuffled = (arr) => arr.map((a) => [rng(), a]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const look = {
    shapes: shuffled(SHAPES).slice(0, 1 + Math.round(v * (SHAPES.length - 1))),
    colors: shuffled(COLORS).slice(0, 1 + Math.round(v * (COLORS.length - 1))),
  };
  const amt = 0.02 + v * 0.5;          // position jitter around a shared base layout
  const breakerIndex = Math.floor(rng() * size);
  const free = (n) => Array(n).fill('free');
  let tiles;

  if (rule === 'symmetry') {
    const n = Math.max(2, lo) + Math.floor(rng() * (hi - Math.max(2, lo) + 1)); // lo..hi items (min 2: one mirrored pair)
    const kinds = [...Array(Math.floor(n / 2)).fill('pair'), ...Array(n % 2).fill('axis')];
    const base = place(rng, kinds);
    tiles = Array.from({ length: size }, (_, i) => {
      for (let t = 0; t < 50; t++) {
        const items = dress(rng, place(rng, kinds, base, amt), look);
        if (i !== breakerIndex) return { items };
        const broken = breakSymmetry(rng, items);
        if (broken) return { items: broken };
      }
      throw new Error('could not break symmetry'); // base layout too tight to move an item; caller retries
    });
  } else {
    const base = place(rng, free(SLOTS));
    let counts;
    if (rule === 'count') {
      const n = lo + Math.floor(rng() * (hi - lo + 1)); // lo..hi, tuned per round by difficulty.js
      counts = Array(size).fill(n);
      counts[breakerIndex] = n + (rng() < 0.5 ? -1 : 1);
    } else {
      // Counts lo..hi. The breaker's count is always unique, so some followers get unique counts too: two when the
      // pool allows, one for a 3-count pool (e.g. 1..6), so the remaining followers still mix 2+ counts.
      const even = rng() < 0.5;
      const range = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      const evens = range.filter((c) => c % 2 === 0), odds = range.filter((c) => c % 2 === 1);
      if (evens.length < 3 || odds.length < 3) throw new RangeError('parity countRange needs 3+ even and 3+ odd counts');
      const [pool, wrong] = even ? [evens, odds] : [odds, evens];
      const p = shuffled(pool), nu = extraUniques ? Math.min(2, p.length - 2) : 0, uniq = p.slice(0, nu);
      const rest = extraUniques ? p.slice(nu) : p.slice(0, Math.max(2, Math.min(p.length, Math.floor((size - 1) / 2))));
      const followers = shuffled(Array.from({ length: size }, (_, i) => i).filter((i) => i !== breakerIndex));
      counts = Array(size);
      counts[breakerIndex] = pick(rng, wrong);
      followers.forEach((i, j) => (counts[i] = j < nu ? uniq[j] : rest[j % rest.length]));
    }
    // Every tile (breaker included) is built the same way. With probability `variety` a tile picks its own
    // subset of the base slots, so followers differ in layout as much as an extra/missing item does.
    const slots = Array.from({ length: SLOTS }, (_, i) => i);
    tiles = counts.map((c) => {
      const own = (rng() < v ? shuffled(slots) : slots).slice(0, c).map((i) => base[i]);
      return { items: dress(rng, place(rng, free(c), own, amt), tileLook(rng, look, v)) };
    });
  }

  removeDecoys(tiles);
  return { tiles, breakerIndex, rule, itemR: R };
}
