---
name: build
description: Build the next unticked slice in plan.md.
---
1. Build: a fresh subagent. Give it README.md, plan.md, the slice, and decisions (not questions). Tell it: "If an honest fix needs a trade-off, stop and report it." Code is for Claude to reread cold: small one-job files, clear names.
2. Check: add the slice's checks to test.sh, the one command that runs every check. Report per case, never averaged. Tests kill every process they start. A check of an AI judgment tests both sides (should and should not), each run several times. Run it.
3. Review: a separate subagent that didn't write the code uses the product as the end user (tell it who they are, e.g. non-technical; for UI: browser and screenshots; no screen: a script driving the real interface). It returns a verdict and ranked issues.
4. Fix: a fresh subagent. Every bug the review finds gets a test that fails on the old code. Findings for later slices go into plan.md.
5. Log every outside request from the first slice (put this in the builder's brief). "It worked" counts only when the logs agree. Before the user runs a live check, hit the public URL yourself (tunnels die), check the shape of keys they pasted, and hand them numbered steps with every value to type.
6. Watch for fixes that pass a check without improving the product. Checks are proxies: if one fights the goal, fix the check.
7. When test.sh passes, tick the slice and run /factory:retro.
