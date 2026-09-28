# qa-instructions

Turns what your existing Playwright tests already do into QA Instructions: steps a person can follow by hand to check the same thing. Tests are not changed.

## Setup

One package, `@procyon-creative/qa-instructions`, holds the Playwright reporter and the `qa-instructions` command:

```bash
npm install -D @procyon-creative/qa-instructions
```

Add the reporter, and the trace setting for Step Screenshots, to `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    [
      '@procyon-creative/qa-instructions/playwright',
      {
        outputDir: 'qa-runs',
        formats: ['qa-steps', 'markdown'],
        testSteps: 'sections',
        highlight: ['outline', 'clickDot'],
        // Only tests tagged @qa produce QA Instructions:
        // select: { tags: ['@qa'] },
        // mask: ['sk-test-4f9a2c', /[\w.+-]+@qa\.example\.com/],
      },
    ],
  ],
  use: {
    // Step Screenshots: a screenshot of the page per Action. DOM snapshots
    // let the reporter recognize password fields and name elements found by
    // test id or CSS selector.
    // Playwright 1.63+:
    trace: { mode: 'on', snapshots: { screen: true, dom: true } },
    // Playwright 1.53–1.62: trace: 'on',
  },
});
```

Every option is optional; `['@procyon-creative/qa-instructions/playwright']` alone works. See [Reporter options](#reporter-options).

Run your tests as usual (`npx playwright test`); the reporter writes one QA Instructions bundle per test to `qa-runs/<file>--<test title>/`, with the rendered QA Instructions beside it (`qa-steps.txt`, Jira-ready text, by default; see [`formats`](#formats)). Paste `qa-steps.txt` into your ticket's QA Steps. To re-render saved bundles without re-running tests, use [`qa-instructions render`](#render).

`@playwright/test` is an optional peer dependency used for types only, so the package always runs against your project's own Playwright and never loads a second copy.

With the trace setting on, each QA Step gets a Step Screenshot of the page at the moment of its Action, saved in the bundle's `assets/` and listed in the step's `assetIds`. The element acted on (`elementBox`), for clicks the click point (`clickPoint`), and the page's `viewport` are recorded on the step in CSS pixels. Without the setting, QA Steps are text only.

### Setup mistakes

Without the trace setting, QA Steps are text only, and the reporter prints one warning per run with the line to add for your Playwright version. The reporter never fails the test run: a setup mistake (such as an unusable `select`, which is then ignored) or an error inside it is printed once on stderr, and the tests' own results are unaffected.

## Reporter options

The second element of the reporter entry in `playwright.config.ts`.

| Option      | Type                                                                              | Default                     |
| ----------- | --------------------------------------------------------------------------------- | --------------------------- |
| `outputDir` | `string`                                                                          | `'qa-runs'`                 |
| `formats`   | `('qa-steps' \| 'markdown' \| 'html' \| 'json')[]`                                | `['qa-steps']`              |
| `select`    | `{ tags?: string[]; files?: string[] }`                                           | every test                  |
| `testSteps` | `'sections' \| 'collapse' \| 'ignore'`                                            | `'sections'`                |
| `highlight` | `'outline' \| 'clickDot' \| 'badge' \| 'spotlight'`, a list of these, or `'none'` | `['outline', 'clickDot']`   |
| `mask`      | `(string \| RegExp)[]`                                                            | none (password fields only) |

### `outputDir`

Where bundles are written, relative to the directory you run Playwright from. Each test gets `<outputDir>/<file>--<test title>/` (with the project, then the line, added only when two tests would otherwise share a directory). A retried test keeps its last attempt.

Every bundle directory the reporter writes holds a `.qa-instructions.json` marker. After a full run, the reporter removes the marked directories that run did not write, such as those of renamed or deleted tests, so `outputDir` holds only that run's QA Instructions. It never removes anything without the marker, and nothing outside `outputDir`.

A partial run removes nothing, so results for tests it didn't run are kept. A run counts as full only when it:

- was started as `playwright test` with no test filters: no file or `file:line` arguments, and no `--grep`, `--grep-invert`, `--project`, `--last-failed`, `--only-changed`, `--shard`, `--list`, or `--ui`;
- finished rather than being interrupted or timing out, and, with `maxFailures` set, passed.

An unrecognized command-line argument also counts as a partial run. A bundle whose test the `select` option now leaves out is kept. `test.only` narrows a run in a way reporters can't see, so a full run with `test.only` removes the other tests' bundles.

```typescript
{
  outputDir: 'artifacts/qa-runs';
}
```

### `formats`

The rendered QA Instructions the reporter writes into each bundle directory, beside `bundle.json`, once the run ends. The default is `['qa-steps']`; `[]` writes the bundle only.

| Format     | File            | Step Screenshots                                            |
| ---------- | --------------- | ----------------------------------------------------------- |
| `qa-steps` | `qa-steps.txt`  | None                                                        |
| `markdown` | `qa-steps.md`   | Inline, linked to the bundle's own `assets/`                |
| `html`     | `qa-steps.html` | Embedded as data URIs; the one file works on its own        |
| `json`     | `qa-steps.json` | Not included (the bundle itself, as `render --format json`) |

The output matches [`qa-instructions render`](#render) exactly; only where the files go differs. An unknown format is ignored, with one warning.

```typescript
{
  formats: ['qa-steps', 'markdown', 'html'];
}
```

### `select`

Limits which tests produce QA Instructions. Unselected tests still run and produce nothing.

- `tags`: tests carrying any of these tags, matched exactly (`'@qa'`, including the `@`).
- `files`: tests whose file matches any of these globs. A relative pattern matches the end of the test file path (`'auth/*.spec.ts'`); an absolute one, or one starting with `**`, matches the whole path.

Given both, a test must match both. An empty or missing list places no limit.

```typescript
{ select: { tags: ['@qa'], files: ['checkout/*.spec.ts'] } }
```

### `testSteps`

How the test's own `test.step` groups appear:

- `'sections'`: each group's title is a Section heading over its QA Steps, numbered continuously across Sections, with nested groups read as `Outer › Inner`.
- `'collapse'`: each outermost group becomes one QA Step named after it.
- `'ignore'`: groups are dropped and QA Steps are listed flat.

```typescript
{
  testSteps: 'collapse';
}
```

### `highlight`

The Highlight each Step Screenshot carries on the element its Action touched. Give one style or a list; the default is `['outline', 'clickDot']`: a pink outline 2px clear of the element, and for clicks a white-ringed dot where the click landed.

| Style       | Look                                                     |
| ----------- | -------------------------------------------------------- |
| `outline`   | A 3px frame around the element                           |
| `clickDot`  | A dot at the click point (clicks and taps only)          |
| `badge`     | The QA Step's number in a circle on the element's corner |
| `spotlight` | Everything but the element dimmed                        |
| `none`      | No marks                                                 |

```typescript
{
  highlight: ['outline', 'badge'];
}
```

- Fills get the outline only; navigation and key presses touch no element and get none.
- Highlights are drawn when the bundle is written, after the run; nothing is injected into the browser. The highlighted image replaces the original in `assets/`, and the bundle's asset lists the marks it carries (`"highlight": ["outline", "clickDot"]`).
- Positions are scaled from the viewport to the image, so high-DPI (`deviceScaleFactor: 2`) screenshots are marked in the right place.
- An Approximate Action (a forced click) gets a dashed outline: the element may have moved.
- Warning steps, and screenshots taken after the Action (the page may have moved on), get no Highlight. On Playwright 1.53–1.62 only a click can get one, its click dot (see [Playwright versions](#playwright-versions)).
- A screenshot that cannot be drawn on is kept unmarked, with a warning.

### `mask`

More Secrets to mask: exact strings, or regular expressions (every match is masked; no `g` flag needed). Each is replaced with `[masked]` in QA Step text, Expected Results, URLs, Section titles, the test title, and bundle directory names.

```typescript
{
  mask: ['sk-test-4f9a2c', /[\w.+-]+@qa\.example\.com/];
}
```

Anything a test types into a password field is masked without configuration: the QA Step tells the tester to enter their own password, and the value is replaced with `[masked]` wherever else it shows up (a later check, a URL). Whether a field is a password field comes from the page as recorded in the trace's DOM snapshots; without them, only `mask` applies.

```
1. Open http://127.0.0.1:4321/login
2. Type **[masked]** into **Username** — **Username** shows **[masked]**
3. Type your password into **Password** — **Password** shows **[masked]**
```

Masking covers text only. Password fields already show as dots in Step Screenshots; other masked values may still be visible in a screenshot.

## Playwright versions

Requires `@playwright/test` 1.53 or later.

| Playwright | Step details                                               | Step Screenshots                                                 | Trace setting                                                            |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1.63+      | Step data (`subtitle`, `params`)                           | One full-size screenshot per Action, element box and click point | `use: { trace: { mode: 'on', snapshots: { screen: true, dom: true } } }` |
| 1.53–1.62  | Step titles, each check's line in your test, and the trace | A frame of the screen recording per Action; click point          | `use: { trace: 'on' }`                                                   |

On 1.53–1.62 the QA Steps and Expected Results read the same as on 1.63; screenshots are rougher (recorded JPEG frames, and no element box, so no outline). The recording only gets a frame when the page repaints, and a frame can show the page from just before a change, so a click gets its click point marked only on a frame that is sure to show the page as the click met it: the last frame drawn before the click, if it was drawn at least 50ms after the page reached its scroll position and is no more than 50ms old, or drawn at least 50ms after the page last changed at all. A click that Playwright first scrolled to therefore stays unmarked. Every other Action, and a click without such a frame, gets a frame from after it ended and before the next Action changed the page (the last one drawn then), unmarked. The recording skips frames while the page moves, so when the next Action saw the page still moving after a fill (a smooth scroll to its field), the fill gets only a frame drawn at least 50ms after that Action found the page still, and otherwise none, rather than one of the scroll still under way. A fill with no frame drawn in that time gets no screenshot rather than one from before it scrolled and typed, and a check of a box that was already checked (Playwright neither scrolls to it nor clicks it) gets none on any version. A check on an element held in a variable (`expect(qtyInput).toHaveValue(String(QTY))`) names the element and the value the trace recorded, as on 1.63. Without a trace, checks are read from your test's source alone: an element held in a variable has no name unless the check has a message, and an expected value is read only when written as a literal or a constant (`toBe(QTY)`, not `toBe(QTY * PRICE)`). One limit remains: a navigation to an absolute URL held in a variable keeps only its path. Traces in formats other than 8, 9, and 10 give text-only QA Instructions and a warning.

## What you get

Each test's browser Actions (opening a URL, clicking, typing, pressing keys, choosing options) become numbered QA Steps, and the `expect` checks that follow an Action become its Expected Result. Waits, scripts, value reads, and API requests are left out because a tester cannot repeat them. A test's `test.step` groups become Sections (see [`testSteps`](#teststeps)).

A check's message names what it checks. `expect(cartQty, 'cart line-item quantity').toBe(3)` reads "**cart line-item quantity** is **3**", so a value the test read from the page still tells the tester what to look for; a value checked without a message is left out. On an element, the message is used only when the element has no readable name (a CSS selector, a test id, or a role without a name) and the page as recorded gives it none. A form, dialog, row, table, or navigation takes its name from its title, the same one later steps use for it as a part of the page: `expect(form, 'purchase form').toBeVisible()` on `locator('#purchase_1174')` reads "The **Forest carbon credits** form is visible" when the form holds that heading, and "**purchase form** is visible" when the page gives the form no name.

A check against a regular expression needs the trace, which records the pattern. Plain text reads as what must appear (`toHaveURL(/login-error/)`: "The page address contains **login-error**"); any other pattern is shown as written ("matches **/^\/orders\/\d+$/**").

```
1. Open http://127.0.0.1:4321/ — The **Fixture App** heading is visible
2. Click the **Sign in** link — The page title is **Sign in**; **Username** is empty
3. Type **demo-user** into **Username**
4. Click the **Submit bad credentials** button — The page address contains **login-error**; **Invalid credentials** is visible; the **Login failed** heading is visible
5. Press **Tab**
```

Elements are named the way the test found them when that is something a tester sees: a role and name, a label, a text. A test id or CSS selector is never shown. Instead the element is named from the page as the trace's DOM snapshots recorded it: its label, its accessible name, or the text it shows, plus what kind of element it is. Without DOM snapshots the step says only what kind of element it is (or uses the check's message, if it has one).

When the test found the element inside another one (`form.locator(…)` on `page.locator('#edd_purchase_102')`), or the page has another element that looks the same, the step also says which part of the page it is in, by that part's title as recorded: its label, or the heading, legend, or caption inside it or just before it. A part with no such title, or the page body, adds nothing.

```
2. Check the **RECs (one time purchase)** option in the **Renewable Energy Certificates (RECs)** form
3. Type **3** into the number field in the **Renewable Energy Certificates (RECs)** form — The number field in the **Renewable Energy Certificates (RECs)** form shows **3**
4. Click the **Add to Cart** button in the **Renewable Energy Certificates (RECs)** form — The page shows **3 × Renewable Energy Certificates (RECs) in your cart**
```

## Render

The reporter renders as it writes (see [`formats`](#formats)). The `qa-instructions` command, from the same package, re-renders saved bundles without re-running tests, to one format into a separate directory:

```bash
npx qa-instructions render <bundle-dir> --format <format> --out <dir>
```

`<bundle-dir>` is the reporter's `outputDir` (every bundle directly inside it is rendered) or one bundle's directory. `--format` defaults to `qa-steps` and `--out` to `qa-steps-out`. For example, `qa-instructions render qa-runs --format qa-steps --out qa-steps-out`, then paste `qa-steps-out/*.txt` into your ticket's QA Steps.

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
- Renderers are pure: bundle in, output out. One shared view model walks the bundle once, and the text, Markdown, and HTML renderers each format that view, so they cannot drift apart. The reporter and the CLI share one `BundleRenderer` that supplies screenshot bytes or links; adding an output format touches only a renderer.

See [docs/design.md](./docs/design.md), [ADR 0001](./docs/adr/0001-reporter-derived-qa-steps.md), and [ADR 0002](./docs/adr/0002-one-package-with-entry-points.md). Vocabulary is in [CONTEXT.md](./CONTEXT.md).

## Package layout

One published package, `@procyon-creative/qa-instructions` (`packages/qa-instructions`), with an entry point per role:

| Entry point                                    | Source            | Role                                                                             |
| ---------------------------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| `@procyon-creative/qa-instructions`            | `src/core/`       | Runner-independent core: test event port, QA Steps, bundle model, I/O, renderers |
| `@procyon-creative/qa-instructions/playwright` | `src/playwright/` | Playwright reporter (default export); draws Highlights with sharp                |
| `qa-instructions` command                      | `src/cli/`        | `qa-instructions render`                                                         |

`src/core/` imports nothing from Playwright, sharp, or the folders beside it; ESLint enforces this.

## CI

E2E on `main` runs the verification and derived-steps examples (local fixture site + golden checks), including the derived-steps tests on Playwright 1.56:

```bash
pnpm verify
```

The 1.56 example needs its own browser build once: `cd examples/derived-steps-1.56 && pnpm exec playwright install chromium`. Its `pnpm record-fixtures` re-records the adapter's Playwright 1.56 and 1.63 step and trace fixtures.

Unit CI runs `packages/*` tests only; Playwright browser tests stay in the E2E workflow.

## Examples

All examples are unmodified Playwright tests with the reporter added to their config.

| Example                       | Purpose                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/verification`       | Deterministic e2e: golden bundle and the QA Steps the reporter renders itself, for a test-id flow                                                                                        |
| `examples/derived-steps`      | Role/label locators, helper functions, dropped test plumbing, and Step Screenshot and Highlight pixel probes (sticky header, hamburger menu, animated accordion; 1x and 2x; every style) |
| `examples/derived-steps-1.56` | The derived-steps tests on Playwright 1.56: same QA Steps as 1.63, screen-recording screenshots with click points marked, missing-trace warning                                          |
| `examples/basic`              | Optional smoke against playwright.dev                                                                                                                                                    |

```bash
# Full pipeline verification (recommended)
pnpm verify

# External smoke only
cd examples/basic && pnpm test && pnpm render
```
