---
name: diverge
description: Build several variants in parallel and pick one.
---
First ask the user if they care about this choice; if not, skip it. Variants also make good stress tests: bugs they surface in shared code get fixed.

Once the core works, build 3 variants (or as many as asked) from the same spec. Use one subagent per variant, each in its own files, so they never edit shared files.

Each variant runs test.sh and saves screenshots of the hardest screen.

Compare them side by side and pick one, or ask the user. Record the pick and the runner-up in plan.md.
