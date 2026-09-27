# Verification example

Deterministic e2e for the capture → render pipeline.

## What it checks

1. **Unmodified test** — `tests/capture.spec.ts` is an ordinary Playwright test against a local Astro fixture site; it does not import qa-instructions
2. **Reporter** — `@qa-instructions/playwright/reporter` derives the QA Instructions and writes `qa-runs/capture--login-error-flow/bundle.json`
3. **Render** — produces pasteable QA Steps in `qa-steps-out/`
4. **Golden verification** — the bundle (normalized) and the QA Steps text must equal `golden/`

This example runs without the trace setting, so its QA Steps are text only. Step Screenshot checks live in `examples/derived-steps`.

## Run locally

```bash
pnpm --filter @qa-instructions/example-verification e2e
```

Or step by step:

```bash
pnpm test      # Playwright + fixture-site webServer
pnpm render    # qa-instructions render
pnpm verify    # diff against golden/
```

## Update goldens

After intentional fixture or wording changes:

```bash
pnpm test && pnpm render && pnpm verify:update-goldens
git add golden/
```

## Fixture site

`examples/fixture-site` serves static pages with solid-color step markers:

| Page           | Marker              | Purpose         |
| -------------- | ------------------- | --------------- |
| `/`            | Blue STEP 1 HOME    | Landing         |
| `/login`       | Orange STEP 2 LOGIN | Form            |
| `/login-error` | Red STEP 3 ERROR    | Known bad state |

Separate routes (not query params) keep Astro static output deterministic.
