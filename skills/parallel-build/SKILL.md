---
name: parallel-build
description: Pick the slices that can be built side by side, build them in parallel, merge, commit and push.
---
1. Pick: list the unticked slices in plan.md and the files each will touch. Batch only slices that touch different files, don't need each other's output, and don't share a port, database or account. Riskiest first; the rest wait. Fewer than 2 fit? Run /factory:build instead. Show the batch and why; the user can veto.
2. Build: one subagent per slice, each in its own git worktree and branch. Brief it as in /factory:build step 1, plus: "Edit only your slice's files. If you need a shared file, stop and report."
3. Merge: one branch at a time into main, running test.sh after each. A conflict or red test: stop and fix it with a fresh subagent before the next merge.
4. Review and fix the merged result as in /factory:build steps 3 to 6.
5. When test.sh passes: tick the slices, commit, push, then run /factory:retro. Every conflict is a lesson: write down how the slices should have been split.
