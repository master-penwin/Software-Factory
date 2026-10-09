A small game for recognizing patterns and moving the eyes fast.

- Mechanic: odd-one-out. A grid of near-identical shapes; tap the one that differs. The grid grows and the difference shrinks.
- Session: every grid has its own shrinking timer. Miss one and the game is over.
- Difference: every tile follows a hidden rule (e.g. 3 dots). The odd one breaks it.
- Tile look: early rounds have near-identical tiles. Later rounds vary the surface (color, shape, position) and keep only the rule.
- Platform: mobile-first web page (tap on phone, click on desktop), published as one shareable link.
- v1: the core loop (play, lose, score and best score, replay) plus polish: sound, animations and a short tutorial.
- Look: build 3 visual variants in parallel (minimal geometric, neon arcade, painterly) and pick one.

Decisions made while building on my own (Claude as PM):
- Rules: count, mirror, odd/even. Each lasts 3 rounds so it can be learned. Unlocked at rounds 1 / 4 / 10.
- Difficulty: grid 4 → 9 → 16 → 25 tiles. The timer shrinks every round (floor 3s). At 16+ tiles, count and mirror tiles hold at most 4 items so they read at a glance. Odd/even never appears at 25 tiles.
- Look: geometric, chosen for legibility and calm focus.
- Polish: a rule label, a hint the first time a rule appears, a first-launch tutorial, synthesized sound with mute, and a loss screen that explains itself.
- Live: published as an artifact (Odd One Out).
