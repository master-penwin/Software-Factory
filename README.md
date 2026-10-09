This is a general-purpose software factory: a reusable workflow that turns an idea into a published product. This repo holds only the workflow. Every product lives in its own repo.

## Principles
1. Every file opens with one plain line saying what it is, and holds only the bare minimum.
2. Every correction gets generalized into a rule here.
3. After every step, ask "what did this teach the factory?" and update this file.
4. Checks are proxies. When a check conflicts with the product goal, the goal wins and the check gets fixed.

## Stages
1. **Start:** create the product as its own repo, with a one-line `README.md` and a `CLAUDE.md` that points back to this factory.
2. **Grill:** one question at a time, each with its purpose and a recommended answer. Every answer goes straight into the product's README, which becomes the spec.
3. **Plan:** turn the README into `plan.md`, a checklist of thin end-to-end slices with the riskiest one first. Review the plan, not the code.
4. **Build:** one slice at a time, each by a fresh agent.
   - Write decisions into the builder's prompt as decisions, not questions. Tell builders: "if an honest fix needs a trade-off, stop and report it."
   - Keep one command, `test.sh`, that runs every check, and run it after every slice. Report results per case, not averaged.
   - Have a separate agent review it, playing as the end user with screenshots. Checks prove the spec; only review catches what feels wrong.
   - Every bug a review finds becomes a test that fails on the old code. Findings for later slices go into `plan.md`.
   - Watch for fixes that satisfy a check without improving the product.
5. **Diverge:** once the core works, build parallel variants from the same spec. Each variant gets its own files, so agents don't collide. Pick by looking at the hardest screen.
6. **Publish:** bundle the product into one file, run `test.sh` against the bundle, then publish.
