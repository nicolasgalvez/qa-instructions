# One published package with entry points, not three packages

qa-instructions shipped as three packages: `@qa-instructions/core`, `@qa-instructions/playwright`, and `@qa-instructions/cli`. A project installed two of them, and after every run typed a second command to turn bundles into something a tester could read. We now publish one package, `@procyon-creative/qa-instructions`, with subpath entry points: `.` is the core's public API (model types, renderers, bundle I/O), `./playwright` is the Playwright reporter (its default export), and the `qa-instructions` command is its `bin`. The reporter renders the chosen formats itself (its `formats` option), so one install and one reporter line give finished QA Instructions; the command stays for re-rendering saved bundles.

## Why one package

- **One install, one version, one npm trust setup.** The three packages were always released together at the same version and could not be mixed across versions anyway. Three packages meant three names to install, three versions to keep in step, and three publishing setups for the same release.
- **Splitting pays only for independent adapters or heavy dependencies.** Neither applies yet. There is one runner adapter, and its dependencies (sharp, fflate, the DOM readers) are what a user installs the package for. `@playwright/test` stays an optional peer dependency used for types only, so a user without Playwright pays nothing for it, and the package never loads Playwright at runtime (ADR 0001), which also keeps it working when installed by `file:` link.

## The hexagonal boundary moves from packages to folders

ADR 0001's rule is unchanged: the core is runner-independent, and runner adapters sit at the edge. The package holds `src/core/`, `src/playwright/`, and `src/cli/`. `src/core/` imports nothing from Playwright, Jest, sharp, or the folders beside it; the ESLint rule that guarded the core package now guards the folder, and a test walks the built `.` entry point to check it reaches only core modules. The reporter imports Playwright for types only, also enforced by ESLint and by a test that reads every module the entry points reach.

Rendering stays in one place: the core's `BundleRenderer` reads a bundle and writes one format, placed by a layout. The reporter uses it with the in-bundle layout (`<outputDir>/<test>/qa-steps.txt`, `.md` linking the bundle's `assets/`, `.html`); the command uses it with the output-directory layout (`<out>/<test>.txt`).

## Future adapters

A Jest adapter would be a `src/jest/` folder and a `./jest` entry point beside `./playwright`, feeding the same core port, with `jest` as another optional peer. If an adapter ever brings a heavy dependency that users of the other runner should not install, that adapter can move to its own package then.

## Considered Options

- **Keep three packages**: rejected; more to install and release, with no user who wanted only one of them.
- **Two packages (core, and adapters plus CLI)**: rejected; nobody uses the core alone yet, so the split would cost a second install and release for no one.
