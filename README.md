# qa-instructions

Collect browser test steps agnostically, render human-repeatable QA instructions separately.

## Architecture

```
Test adapter (Playwright)  →  QaRunBundle (JSON + assets)  →  Renderers (qa-steps, json, …)
         capture only                  canonical data                 pure transforms
```

- **Capture** knows nothing about Jira or Markdown
- **Render** knows nothing about Playwright
- Adding an output format = one function in `@qa-instructions/core/render`
- Adding a test runner = one adapter that produces `QaRunBundle`

See [docs/design.md](./docs/design.md) for the full spec.

## Packages

| Package                       | Role                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `@qa-instructions/core`       | Runner-independent core: test event port, QA Steps, bundle model, I/O, renderers |
| `@qa-instructions/playwright` | Reporter adapter (plus the legacy `qa` fixture + collector)                      |
| `@qa-instructions/cli`        | `qa-instructions render` command                                                 |

## Usage: derive QA Steps from existing tests

Add the reporter to `playwright.config.ts`. Tests are not changed.

```typescript
export default defineConfig({
  reporter: [
    ['list'],
    ['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs' }],
  ],
});
```

Each test's browser Actions (opening a URL, clicking, typing, pressing keys, choosing options) become numbered QA Steps, and the `expect` checks that follow an Action become its Expected Result. Waits, scripts, value reads, and API requests are left out. `@playwright/test` is a peer dependency used for types only, so the package always runs against your project's own Playwright.

Render as in step 3 below. See `examples/derived-steps` for a full example.

## Legacy usage: the `qa` fixture

### 1. Write a test

```typescript
import { test, expect } from '@qa-instructions/playwright';

test('Create a project', async ({ qa, page }) => {
  qa.guide({
    title: 'Create a project',
    prerequisite: 'Deploy branch to dev first.',
  });

  await qa.step(
    'Open https://app.example.com/projects',
    'Project list loads with no error',
    async () => {
      await page.goto('https://app.example.com/projects');
      await expect(
        page.getByRole('heading', { name: 'Projects' }),
      ).toBeVisible();
    },
  );
});
```

### 2. Collect bundles (Playwright config)

```typescript
export default defineConfig({
  reporter: [
    ['list'],
    ['html'],
    ['@qa-instructions/playwright/collector', { outputDir: 'qa-runs' }],
  ],
});
```

### 3. Render output (separate step)

```bash
qa-instructions render qa-runs/ --format qa-steps --out qa-steps-out/
```

Paste `qa-steps-out/*.txt` into your ticket. Screenshots stay in `qa-runs/` and the Playwright HTML report.

## CI

E2E on `main` runs the verification and derived-steps examples (local fixture site + golden checks):

```bash
pnpm verify
```

Unit CI runs `packages/*` tests only; Playwright browser tests stay in the E2E workflow.

## Examples

| Example                  | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `examples/verification`  | Deterministic capture/render e2e with golden screenshot probes |
| `examples/derived-steps` | Unmodified test + reporter → rendered QA Steps, golden text    |
| `examples/basic`         | Optional smoke against playwright.dev                          |

```bash
# Full pipeline verification (recommended)
pnpm verify

# External smoke only
cd examples/basic && pnpm test && pnpm render
```
