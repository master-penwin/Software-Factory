This is a general-purpose software factory: a reusable workflow that turns an idea into a published product. This repo holds only the workflow. Every product lives in its own repo.

Install it in Claude Code with `/plugin marketplace add master-penwin/software-factory`, then `/plugin install factory@software-factory`.

## Principles
1. Every file opens with one plain line saying what it is, and holds only the bare minimum.
2. Every correction gets generalized into a rule.
3. After every step, ask "what did this teach the factory?" (`/factory:retro`).
4. Checks are proxies. When a check conflicts with the product goal, the goal wins and the check gets fixed.
5. Prompts are minimal: plain words, files as state, no ceremony.

## Stages
1. `/factory:start`: create the product repo.
2. `/factory:grill`: interview the user until the README is the spec.
3. `/factory:plan`: write thin slices, riskiest first.
4. `/factory:build`: build, check, review and fix one slice at a time.
5. `/factory:diverge`: build variants in parallel and pick one.
6. `/factory:publish`: bundle, test and ship.
