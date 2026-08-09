# CI verification

This file exists to trigger and verify the first pull-request run of the Match Lab CI workflow.

The workflow must build and type-check the TypeScript project, run the Vitest suite, execute 10,000 deterministic seeded matches and upload the simulation summary as a workflow artifact.
