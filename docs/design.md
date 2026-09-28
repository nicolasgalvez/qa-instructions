# qa-instructions — Design

## Goal

Turn what an existing Playwright test already does into QA Instructions a person can follow by hand, without changing the test. The developer installs one package and adds one reporter to their Playwright config; every test run then produces QA Instructions per test, rendered to the chosen formats. A separate command re-renders saved bundles.

The decisions and their alternatives are recorded in [ADR 0001](./adr/0001-reporter-derived-qa-steps.md) and [ADR 0002](./adr/0002-one-package-with-entry-points.md) (one package with entry points). Vocabulary (QA Instructions, QA Step, Action, Expected Result, Section, Step Screenshot, Highlight) is defined in [CONTEXT.md](../CONTEXT.md).

## Setup

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    [
      '@procyon-creative/qa-instructions/playwright',
      { outputDir: 'qa-runs', formats: ['qa-steps', 'html'] },
    ],
  ],
});
```

Tests are not changed. `@playwright/test` is an optional peer dependency used for types only; the package never loads Playwright at runtime, so it always runs against the project's own Playwright. Step Screenshots come from Playwright's trace and add one `trace` setting to this config (see ADR 0001).

Post-test CI step:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: qa-instructions
    path: qa-runs/
```

## Pipeline

```
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────┐    ┌──────────────┐
│ Playwright reporter  │───▶│ Core recorder        │───▶│ QaRunBundle  │───▶│  Renderers   │
│ (adapter)            │    │ test events →        │    │ JSON +       │    │  qa-steps    │
│ reporter steps →     │    │ QA Instructions      │    │ assets       │    │  json        │
│ neutral test events  │    │                      │    │              │    │              │
└──────────────────────┘    └──────────────────────┘    └──────────────┘    └──────────────┘
```

Nothing in the core knows about Playwright or Jest. Nothing in rendering knows about test runners. Adding an output format is one pure function in the core's renderers; adding a test runner is one adapter that feeds the same event port.

## Layer responsibilities

One package, `@procyon-creative/qa-instructions`, with a source folder and an entry point per layer (ADR 0002).

### Core: `src/core/`, entry point `@procyon-creative/qa-instructions`

| Module          | Responsibility                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`        | Inbound port: runner-neutral test events (test start/end, action, check)                                                                                      |
| `instructions/` | `QaInstructionsRecorder` turns one test's events into QA Instructions; `StepPhraser` words them                                                               |
| `model`         | Bundle types: `QaRunBundle`, `QaStep`, `QaAsset`                                                                                                              |
| `bundle/`       | In-memory bundle builder; `writeBundle(dir, bundle, assets)`, `readBundle(dir)`, `bundleDirName()`; `BundleRenderer` renders a bundle directory to one format |
| `render/`       | Pure transforms: `render(bundle, format)` for `qa-steps`, `markdown`, `html`, `json`                                                                          |

The recorder makes one QA Step per user Action (opening a URL, clicking, typing, pressing a key, choosing an option). Test plumbing a tester cannot repeat (waits, scripts, value reads, API requests, setup) is dropped. The checks that follow an Action become that QA Step's Expected Result; an Action with no following check has none.

`src/core/` imports nothing from Playwright, Jest, sharp, `src/playwright/`, or `src/cli/` (ESLint).

### Playwright adapter: `src/playwright/`, entry point `@procyon-creative/qa-instructions/playwright`

The default export is `QaInstructionsReporter`, a Playwright `Reporter`:

- On `onTestEnd`, `PlaywrightStepTranslator` walks the test's `pw:api` and `expect` steps and emits core test events.
- The core recorder builds the bundle, which is written to `<outputDir>/<file>--<test title>/`.
- It then renders each of its `formats` beside `bundle.json` (`qa-steps.txt`, `qa-steps.md`, `qa-steps.html`, `qa-steps.json`) with the core's `BundleRenderer`.
- It never throws into the test run; a failure to write is logged as a warning.

### CLI: `src/cli/`, the `qa-instructions` command

Re-renders saved bundles, one format into a separate directory, without re-running tests:

```bash
# Render all bundles collected during the run
qa-instructions render qa-runs/ --format qa-steps --out qa-steps-out/
```

Also usable programmatically:

```typescript
import { readBundle, renderQaSteps } from '@procyon-creative/qa-instructions';

const bundle = await readBundle('qa-runs/login--sign-in');
const text = renderQaSteps(bundle);
```

## Canonical data: `QaRunBundle`

The bundle is the only contract between capture and render.

```typescript
interface QaRunBundle {
  version: '1';
  meta: {
    title: string;
    prerequisite?: string;
    source?: {
      runner: 'playwright' | 'jest' | 'devtools' | 'manual';
      testFile?: string;
      testTitle?: string;
      project?: string;
    };
    capturedAt: string; // ISO 8601
    status: 'complete' | 'partial' | 'failed';
  };
  steps: QaStep[];
  assets: Record<string, QaAsset>; // keyed by asset id
}

interface QaStep {
  index: number;
  action: string;
  expected?: string;
  url?: string;
  assetIds?: string[]; // references into bundle.assets
}

interface QaAsset {
  id: string;
  contentType: string;
  filename: string; // relative to bundle directory
  sha256?: string;
}
```

On disk, a bundle is a directory:

```
qa-runs/
  sign-in--sign-in-with-bad-credentials/
    bundle.json
    assets/
    qa-steps.txt        # one file per reporter format
```

Renderers read `bundle.json` and resolve assets from `assets/`. No runner-specific fields in the step model.

## Renderers

| Renderer        | Output                | Consumer               |
| --------------- | --------------------- | ---------------------- |
| `renderQaSteps` | Plain numbered list   | Jira / ticket QA field |
| `renderJson`    | Pretty-printed bundle | Tooling, passthrough   |

## Planned

Tracked under the QI-5 epic: Step Screenshots from the trace, Highlights, Sections from `test.step`, warnings for script-driven page changes and forced clicks, incomplete QA Instructions for failed tests, test selection, masking, and Markdown/HTML renderers.

## Differentiation from docs-tests

docs-tests couples capture and Markdown rendering in one reporter pass and requires tests written for it. qa-instructions derives steps from unmodified tests and separates collection from rendering, so the same run produces ticket steps or future formats without re-running tests.

See [research/2026-09-26-auto-derived-qa-steps-prior-art.md](./research/2026-09-26-auto-derived-qa-steps-prior-art.md), [research/2026-03-27-competitive-and-api-research.md](./research/2026-03-27-competitive-and-api-research.md), [competitive-landscape.md](./competitive-landscape.md), and [framework-hooks.md](./framework-hooks.md).

## Package layout

```
packages/
  qa-instructions/      # the one published package
    src/core/           # event port, recorder, bundle model + I/O, renderers
    src/playwright/     # reporter adapter
    src/cli/            # qa-instructions render command
examples/
  verification/         # golden e2e against the fixture site
  derived-steps/        # golden e2e: helpers, plumbing, role/label locators
  derived-steps-1.56/   # the derived-steps tests pinned to Playwright 1.56
  basic/                # smoke against playwright.dev
  fixture-site/         # local Astro site the e2e examples run against
```
