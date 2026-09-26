# Derive QA Steps from existing tests with a reporter, not a fixture

qa-instructions previously required tests to be rewritten around a `qa` fixture (`qa.step(action, expected, fn)`), with steps authored by hand and `test`/`expect` re-exported from the package. That defeated the point: existing tests produced nothing until rewritten, and importing Playwright at runtime from the package broke it when installed by link (two Playwright instances). We now derive QA Steps automatically from what each test already does, using only a Playwright reporter plus a trace setting in the project's config. Tests are not changed, Playwright is a peer dependency only, and the package never loads Playwright at runtime.

Steps come from the reporter's `pw:api` steps (browser actions a person can repeat; plumbing like waits and value reads is dropped), Expected Results from the `expect` steps that follow each action, and Sections from the test's own `test.step` blocks (configurable). Step Screenshots come from the trace: on Playwright 1.63+, `trace: { mode: 'on', snapshots: { screen: true } }` records a screenshot per action, joined to the reporter step through the trace's step and call IDs. Older Playwright is supported with rougher output (title parsing and nearest screencast frame). The trace file layout is not a documented Playwright API and already differs between releases (1.63 writes version 9; Playwright `main` writes version 10, which drops the separate step-id mapping), so all trace reading lives behind one screenshot-source port whose adapter handles each supported trace version and degrades to instructions without screenshots on an unknown one. `@andrii_kremlovskyi/playwright-traces-reader` is a candidate backing library for that adapter, pending a check against real 1.63 traces. Prior-art research found no existing tool that does this without test changes (see `docs/research/2026-09-26-auto-derived-qa-steps-prior-art.md`).

## Hexagonal core, runner adapters at the edge

All logic (turning actions and checks into QA Steps, Sections, Expected Results, choosing screenshots, masking secrets, rendering) lives in a runner-independent core with ports: an inbound port that accepts a neutral stream of test events (action, check, group start/end, screenshot reference), and outbound ports for screenshot sources and output writers. No core code depends on Playwright's `Reporter`/`TestStep` types or on Jest's. The Playwright reporter is a thin adapter that translates reporter events (and trace screenshots) into core events; a Jest adapter can later feed the same port without touching core logic.

## Considered Options

- **Keep the fixture**: rejected; requires rewriting tests and bundling Playwright.
- **Monkey-patch `page` methods**: rejected; alters Playwright behavior.
- **Screenshot only at end of test (`screenshot: 'on'`)**: rejected; one image per test, not per step.
