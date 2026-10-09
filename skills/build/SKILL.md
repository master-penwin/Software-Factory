---
name: build
description: Build the next unticked slice in plan.md.
---
1. Build: a fresh subagent. Give it README.md, plan.md, the slice, and decisions (not questions). Tell it: "If an honest fix needs a trade-off, stop and report it."
2. Check: add the slice's checks to test.sh, the one command that runs every check. Report per case, never averaged. Run it.
3. Review: a separate subagent that didn't write the code uses the product as the end user (for UI: browser and screenshots). It returns a verdict and ranked issues.
4. Fix: a fresh subagent. Every bug the review finds gets a test that fails on the old code. Findings for later slices go into plan.md.
5. Watch for fixes that pass a check without improving the product. Checks are proxies: if one fights the goal, fix the check.
6. When test.sh passes, tick the slice and run /factory:retro.
