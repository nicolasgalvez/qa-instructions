# Framework Extension Points

> **Canonical research:** API sections with source URLs are in [research/2026-03-27-competitive-and-api-research.md](./research/2026-03-27-competitive-and-api-research.md). This file is a quick reference for implementers.

## Playwright Test (implemented)

qa-instructions runs only in the main process, as a reporter. Nothing runs in the worker and tests are not changed (see [ADR 0001](./adr/0001-reporter-derived-qa-steps.md)).

### Capture — main process (`Reporter`)

```typescript
interface Reporter {
  onBegin?(config: FullConfig, suite: Suite): void;
  onTestBegin?(test: TestCase, result: TestResult): void;
  onStepBegin?(test: TestCase, result: TestResult, step: TestStep): void;
  onStepEnd?(test: TestCase, result: TestResult, step: TestStep): void;
  onTestEnd?(test: TestCase, result: TestResult): void; // ← QaInstructionsReporter hook
  onEnd?(result: FullResult): Promise<void>; // awaited
  onExit?(): Promise<void>; // awaited
}
```

**`TestResult` fields used by the reporter:**

- `steps[]` — tree; `pw:api` steps become Actions, `expect` steps become checks; `fixture` and `hook` steps are dropped

**Step categories:** `test.step`, `pw:api`, `expect`, `fixture`, `hook`, `test.attach`

Docs: https://playwright.dev/docs/test-reporters , https://playwright.dev/docs/api/class-teststepinfo

---

## Jest (future adapter)

### Capture — `TestEnvironment` (per test file)

```typescript
class CustomEnvironment extends NodeEnvironment {
  constructor(config, context): void;
  setup(): Promise<void>;
  teardown(): Promise<void>;
  handleTestEvent(event: Event, state: State): Promise<void>;
}
```

**jest-circus events:** `test_start`, `test_done`, `hook_start`, `hook_done`, `test_fn_start`, `test_fn_success`, `test_fn_failure`, `start_describe_definition`, etc.

**jest-playwright pattern:** extend `PlaywrightEnvironment`, screenshot on `test_done` + errors.

**Gap:** No native step tree or attach API. The adapter must map circus events (and page calls) to core test events itself; screenshots via environment, not attachments.

### Collection — `Reporter` (main process)

```typescript
interface Reporter {
  onRunStart?(results, options): void;
  onTestFileStart?(test): void;
  onTestCaseStart?(test, info): void;
  onTestCaseResult?(test, result): void;
  onTestFileResult?(test, result, aggregated): void;
  onRunComplete?(contexts, results): Promise<void>;
  getLastError?(): Error;
}
```

Docs: https://jestjs.io/docs/configuration#testenvironment-string , https://jestjs.io/docs/configuration#reporters-arraymodulename--modulename-options

---

## Chrome DevTools (future import)

Not a test-runner plugin. Import path only:

- **DevTools Recorder** exports JSON flows → parse into `QaRunBundle`
- **CDP** `Page.captureScreenshot` — capture primitive (Playwright wraps CDP)

---

## Render (framework-agnostic)

No runner hooks. Pure functions over `QaRunBundle`:

```typescript
renderQaSteps(bundle: QaRunBundle): string;
renderJson(bundle: QaRunBundle): string;
render(bundle: QaRunBundle, format: RenderFormat): string;
```

Invoked by CLI after collection, not by reporters.
