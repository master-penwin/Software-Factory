The build checklist for the game, in thin slices with the riskiest first.

- [x] 1. Rule engine: generate a grid where every tile follows a rule and exactly one breaks it. Use 3 rule types (count, symmetry, parity). Check: a script verifies exactly one breaker across 1000 grids.
- [x] 2. Playable loop: grid, tap, per-round timer, lose, score and best score, replay. Plain look. Check: it plays in a browser.
- [x] 3. Difficulty: the grid grows, the timer shrinks, and tiles go from near-identical to surface-varied. Introduce parity later, since 1–9 items in a 4×4 grid in 6s is too hard. Make shapes larger, and center the grid.
- [x] 4. Diverge: 3 looks in parallel (geometric, neon, painterly). Picked geometric for legibility and calm focus; neon came second.
- [x] 5. Polish the chosen look: sound, animations, tutorial. Label the current rule, or keep one rule for a few rounds.
- [x] 6. Publish as a link: `dist/odd-one-out.html`, built by `build.py`.
