# Unattended factory

Wake every five hours using the signed-in Codex allowance. Improve the approved product in small slices until allowance interrupts work or the run reaches its scheduling boundary. Checkpoint to the product's GitHub repo after every phase, not only at the usage limit. The next run reads that handoff first.

Each slice: build, independent review, tests, publish to the development branch, deploy, independent browser review of the live product as its intended user, fix, checkpoint. Code tests and health probes never replace live user review.

Use a single owner, compare-and-swap handoffs, and non-force publishing. Never take over an expired owner until it is confirmed stopped. Reconcile interrupted publishes before starting fresh work. Skip blocked slices and continue independent approved work. Preserve production and customer data. Notify the owner only for meaningful progress or required action.

Prototype acceptance: two distinct real iterations resume each other through GitHub, each delivering a tested, deployed, browser-reviewed product improvement without human intervention. Until then label the prototype unproven.

For Dobo, the product-specific operating contract is docs/FACTORY-RUNBOOK.md on its development branch. Scheduler installation and active hosting must be verified separately; this document does not activate them.
