# qa-instructions

Turns what your existing Playwright tests already do into QA Instructions: steps a person can follow by hand to check the same thing. Tests are not changed.

## Setup

Add the reporter, and the trace setting for Step Screenshots, to `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs' }],
  ],
  use: {
    // Step Screenshots (Playwright 1.63+): a screenshot of the page per action.
    // DOM snapshots let the reporter recognize password fields.
    trace: { mode: 'on', snapshots: { screen: true, dom: true } },
  },
});
```

That is the whole setup. Run your tests as usual (`npx playwright test`); the reporter writes one QA Instructions bundle per test to `qa-runs/`.

`@playwright/test` is a peer dependency used for types only, so the package always runs against your project's own Playwright and never loads a second copy.

With the trace setting on, each QA Step gets a Step Screenshot of the page at the moment of its Action, saved in the bundle's `assets/` and listed in the step's `assetIds`. The element acted on (`elementBox`) and, for clicks, the click point (`clickPoint`) are recorded on the step in viewport CSS pixels. Without the setting, QA Steps are text only.

## What you get

Each test's browser Actions (opening a URL, clicking, typing, pressing keys, choosing options) become numbered QA Steps, and the `expect` checks that follow an Action become its Expected Result. Waits, scripts, value reads, and API requests are left out because a tester cannot repeat them.

```
1. Open http://127.0.0.1:4321/ — The **Fixture App** heading is visible
2. Click the **Sign in** link — The page title is **Sign in**; **Username** is empty
3. Type **demo-user** into **Username**
4. Click the **Submit bad credentials** button — **Invalid credentials** is visible; the **Login failed** heading is visible
5. Press **Tab**
```

When a test groups its actions with `test.step`, each group's title becomes a Section heading over its QA Steps, with numbering continuous across Sections and nested groups read as `Outer › Inner`. Set the reporter's `testSteps` option to `'collapse'` to turn each group into one QA Step named after it, or to `'ignore'` to list the steps flat:

```typescript
['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs', testSteps: 'collapse' }],
```

### Masking secrets

Anything a test types into a password field never appears in QA Instructions; the step tells the tester to enter their password instead, and the value is replaced with `[masked]` wherever else it shows up (a later check, a URL). Whether a field is a password field comes from the page as recorded in the trace, so it needs DOM snapshots (`snapshots: { dom: true }`). Without them, only the `mask` option applies.

Add other secrets (API keys, test account emails) with the `mask` option, as exact strings or regular expressions. They are masked in step text, Expected Results, URLs, Section titles, the test title, and bundle directory names:

```typescript
['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs', mask: ['sk-test-4f9a2c', /[\w.+-]+@qa\.example\.com/] }],
```

```
1. Open http://127.0.0.1:4321/login
2. Type **[masked]** into **Username** — **Username** shows **[masked]**
3. Type your password into **Password** — **Password** shows **[masked]**
```

Masking covers text only. Password fields already show as dots in Step Screenshots; other masked values may still be visible in a screenshot.

## Render

Rendering is a separate step, so you can re-render without re-running tests:

```bash
qa-instructions render qa-runs/ --format qa-steps --out qa-steps-out/
```

Paste `qa-steps-out/*.txt` into your ticket's QA Steps.

Every format shows the same QA Steps, Expected Results, Sections, warnings, and status:

| `--format` | Output                              | Step Screenshots                                                                                                 |
| ---------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `qa-steps` | `<test>.txt`, Jira-ready plain text | None                                                                                                             |
| `markdown` | `<test>.md`, PR-ready Markdown      | Inline under each step, linked relatively; copied to `<out>/<test>/` so the links work from the output directory |
| `html`     | `<test>.html`, a standalone page    | Embedded as data URIs, so the one file works offline, from disk, or as a CI artifact                             |
| `json`     | `<test>.json`, the bundle itself    | Not included                                                                                                     |

The HTML page has inline styles for light and dark color schemes, no scripts or fonts, and a Content Security Policy that blocks all network requests. Screenshots are embedded rather than copied alongside because they are small (tens of KB per step), and one file is easier to share.

## Architecture

```
Playwright reporter (adapter)  →  core (test events → QA Instructions)  →  bundle (JSON + assets)  →  renderers
```

- The core is runner-independent: it accepts a neutral stream of test events and knows nothing about Playwright or Jest.
- The Playwright reporter is a thin adapter that translates reporter steps into those events.
- Renderers are pure: bundle in, output out. One shared view model walks the bundle once, and the text, Markdown, and HTML renderers each format that view, so they cannot drift apart. The CLI supplies screenshot bytes or links; adding an output format touches only a renderer.

See [docs/design.md](./docs/design.md) and [ADR 0001](./docs/adr/0001-reporter-derived-qa-steps.md). Vocabulary is in [CONTEXT.md](./CONTEXT.md).

## Packages

| Package                       | Role                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `@qa-instructions/core`       | Runner-independent core: test event port, QA Steps, bundle model, I/O, renderers |
| `@qa-instructions/playwright` | Playwright reporter adapter (`@qa-instructions/playwright/reporter`)             |
| `@qa-instructions/cli`        | `qa-instructions render` command                                                 |

## CI

E2E on `main` runs the verification and derived-steps examples (local fixture site + golden checks):

```bash
pnpm verify
```

Unit CI runs `packages/*` tests only; Playwright browser tests stay in the E2E workflow.

## Examples

All examples are unmodified Playwright tests with the reporter added to their config.

| Example                  | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `examples/verification`  | Deterministic e2e: golden bundle and QA Steps for a test-id flow                               |
| `examples/derived-steps` | Role/label locators, helper functions, dropped test plumbing, and Step Screenshot pixel probes |
| `examples/basic`         | Optional smoke against playwright.dev                                                          |

```bash
# Full pipeline verification (recommended)
pnpm verify

# External smoke only
cd examples/basic && pnpm test && pnpm render
```
