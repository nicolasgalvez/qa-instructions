# Derive QA Steps from existing tests with a reporter, not a fixture

qa-instructions previously required tests to be rewritten around a `qa` fixture (`qa.step(action, expected, fn)`), with steps authored by hand and `test`/`expect` re-exported from the package. That defeated the point: existing tests produced nothing until rewritten, and importing Playwright at runtime from the package broke it when installed by link (two Playwright instances). We now derive QA Steps automatically from what each test already does, using only a Playwright reporter plus a trace setting in the project's config. Tests are not changed, Playwright is a peer dependency only, and the package never loads Playwright at runtime.

Steps come from the reporter's `pw:api` steps (browser actions a person can repeat; plumbing like waits and value reads is dropped), Expected Results from the `expect` steps that follow each action, and Sections from the test's own `test.step` blocks (configurable). Step Screenshots come from the trace: on Playwright 1.63+, `trace: { mode: 'on', snapshots: { screen: true } }` records a screenshot per action, joined to the reporter step through the trace's step and call IDs. Older Playwright is supported with rougher output (title parsing and nearest screencast frame). The trace file layout is not a documented Playwright API and already differs between releases (1.63 writes version 9; Playwright `main` writes version 10, which drops the separate step-id mapping), so all trace reading lives behind one screenshot-source port whose adapter handles each supported trace version and degrades to instructions without screenshots on an unknown one. We checked `@andrii_kremlovskyi/playwright-traces-reader` (4.2.5) against a real 1.63 trace and read the trace ourselves instead (see "Trace reader" below). Prior-art research found no existing tool that does this without test changes (see `docs/research/2026-09-26-auto-derived-qa-steps-prior-art.md`).

## Hexagonal core, runner adapters at the edge

All logic (turning actions and checks into QA Steps, Sections, Expected Results, choosing screenshots, masking secrets, rendering) lives in a runner-independent core with ports: an inbound port that accepts a neutral stream of test events (action, check, group start/end, screenshot reference), and outbound ports for screenshot sources and output writers. No core code depends on Playwright's `Reporter`/`TestStep` types or on Jest's. The Playwright reporter is a thin adapter that translates reporter events (and trace screenshots) into core events; a Jest adapter can later feed the same port without touching core logic.

## Script changes and forced Actions

A script can change the page (opening every collapsed accordion with `evaluateAll`), leaving a tester stuck. Playwright 1.63 step data does not say what a script did: `Evaluate` steps carry only the locator, never the expression or its result, and `force: true` is not in any step's params. The adapter therefore reads the test's own source at the step's `location` (a lexical reading, not a parser) for two facts, and the core decides from them:

- **Changed or read.** An event fired by script (`dispatchEvent`) always changes the page. An `evaluate`-family call whose result the test uses (assigned, awaited inside an expression, returned, passed on) read the page: no warning. One whose result is discarded (`await locator.evaluateAll(...)` as its own statement), or whose call site cannot be read, may have changed the page: a warning step at that point, carrying the checks that follow it as its Expected Result so the tester sees what to restore by hand.
- **Forced.** `force: true` written in the call's options (or a `force` param, should a runner report one) marks the Action approximate.

Limits: a discarded script that changed nothing (e.g. `scrollTo(0, 0)` at the top) still warns; a script whose result is used but that also changed the page does not; options built elsewhere (`click(opts)`) are not seen as forced. The warning cannot say what to do ("open it"), only that the page changed and what the test checked next. Trace snapshots could detect DOM change directly; that waits for the trace adapter.

## Trace reader

The screenshot adapter reads `trace.zip` itself, unzipping with `fflate`. `playwright-traces-reader` does not fit. Against a real 1.63 trace it only surfaces `screencast-frame` images and never the per-action `screenshot` events that `snapshots.screen` writes (`screenshots/<callId>-{before,action,after}.png`). It also ignores the `input` events that carry the element box and click point. It extracts every trace into a temporary cache directory on disk, and it brings in a CLI dependency (`commander`). The format knowledge we need is small: context-options `version`, `before`, `input`, and `screenshot` events.

The join is: reporter `pw:api` step → the test runner's `test.trace` `before` event → the library call → its screenshots and input. Reporter steps have no id, so a step is matched by its position among the test's `pw:api` steps plus its title. Steps with a `group` (getters, configuration fixtures) are traced but never reported, so they are not counted. In version 9, library `before` events link to the step through `stepId`. In version 10 (verified with `1.64.0-alpha-2026-09-26`), the step id is itself the library `callId`, and screenshot files are named after it. The committed sample traces in `packages/playwright/test/fixtures/traces/` cover both. Any other version gives no screenshots.

## Considered Options

- **Keep the fixture**: rejected; requires rewriting tests and bundling Playwright.
- **Monkey-patch `page` methods**: rejected; alters Playwright behavior.
- **Screenshot only at end of test (`screenshot: 'on'`)**: rejected; one image per test, not per step.
