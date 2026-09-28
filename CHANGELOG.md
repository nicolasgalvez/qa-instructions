# Changelog

## [2.0.0](https://github.com/procyon-creative/qa-instructions/compare/v1.0.0...v2.0.0) (2026-09-28)


### ⚠ BREAKING CHANGES

* the "@qa-instructions/playwright" root entry point (qa fixture, test, expect) and "@qa-instructions/playwright/collector" are removed. Import test/expect from @playwright/test and add "@qa-instructions/playwright/reporter" to the Playwright reporter list.

### Features

* choose which tests produce QA Instructions ([b33aec0](https://github.com/procyon-creative/qa-instructions/commit/b33aec0b9ed5d73db4b795d8b22f3beb664ad0f2))
* choose which tests produce QA Instructions by tag and file pattern ([82b8536](https://github.com/procyon-creative/qa-instructions/commit/82b85364608e447e0baafa1349f40c77f37e35d1))
* **cli:** render bundles to markdown and html ([af8794c](https://github.com/procyon-creative/qa-instructions/commit/af8794c6f88c87aff8b8eacd09a86d0769b19758))
* **core:** render QA Instructions as Markdown and standalone HTML ([59cb515](https://github.com/procyon-creative/qa-instructions/commit/59cb5156fac69867e750a681b42c74094bed252c))
* derive text QA Steps from unmodified Playwright tests ([4e450c3](https://github.com/procyon-creative/qa-instructions/commit/4e450c32837608f4c9c08a02b4d5eb4ef01e2348))
* derive text QA Steps from unmodified Playwright tests ([344c745](https://github.com/procyon-creative/qa-instructions/commit/344c745a42dca638aac383b30c9f7dab8ffdd2d6))
* expected results from checks that carry a custom message ([fd73663](https://github.com/procyon-creative/qa-instructions/commit/fd73663253286ddfc84113fe087ed3f85f38a8d3))
* expected results from checks that carry a custom message ([c7dd105](https://github.com/procyon-creative/qa-instructions/commit/c7dd105116e2583485cec71741d03d31d6b8b2eb))
* highlight click points on screen recording frames before Playwright 1.63 ([7ae1793](https://github.com/procyon-creative/qa-instructions/commit/7ae17933ae6f26128360a71a41c4f6e7471737de))
* highlight click points on screen recording frames before Playwright 1.63 ([5af670c](https://github.com/procyon-creative/qa-instructions/commit/5af670c57f94c5b1fc91fea2b0483e889e2b8dde))
* highlights on step screenshots ([0f88f09](https://github.com/procyon-creative/qa-instructions/commit/0f88f09ada17ffc4e69b0e1884c4c442a15bd246))
* highlights on step screenshots ([9f9d03b](https://github.com/procyon-creative/qa-instructions/commit/9f9d03b8fa797c8f2787ed4db1f38623dab13d8f))
* incomplete QA Instructions for failed tests, last attempt for retries ([d6581f3](https://github.com/procyon-creative/qa-instructions/commit/d6581f3cb2b7b9437b9b8eb0e615c2114b662646))
* incomplete QA Instructions for failed tests, last attempt for retries ([32c1c77](https://github.com/procyon-creative/qa-instructions/commit/32c1c77051ac8ec6963ad1689ea57d6dd0345e4b))
* keep QA Steps after a failed soft check and skip skipped tests ([4053e98](https://github.com/procyon-creative/qa-instructions/commit/4053e987678a8d7b10a7a95787b234a24b6f0ece))
* keep QA Steps after a failed soft check and skip skipped tests ([88eb880](https://github.com/procyon-creative/qa-instructions/commit/88eb880f04ba32b9e8ca67745403b8e349972c8f))
* mask passwords and configured secrets in QA Instructions ([e33b9b5](https://github.com/procyon-creative/qa-instructions/commit/e33b9b5875bebfe7fe0c6d40ea3eef3ca1b1dd2f))
* mask passwords and configured secrets in QA Instructions ([b95ce97](https://github.com/procyon-creative/qa-instructions/commit/b95ce97ae3f47e4e4ea5171af5f24e522c54dac0))
* name elements found by test id or CSS selector as the page shows them ([bd852ac](https://github.com/procyon-creative/qa-instructions/commit/bd852ace3d855f7957f175bb3a4284cfe8fc6429))
* name elements found by test id or CSS selector as the page shows them ([f096507](https://github.com/procyon-creative/qa-instructions/commit/f09650725ce0836331447a7756b1ab02bd0a458e))
* name the sections a script opened in its warning step ([9528963](https://github.com/procyon-creative/qa-instructions/commit/9528963a4fa4e92fd6567190277aa59b9f83602a))
* name the sections a script opened in its warning step ([1a72274](https://github.com/procyon-creative/qa-instructions/commit/1a7227417337fbc6b9519a80412a9f3fffe57c24))
* PR-ready Markdown and standalone HTML output ([ceb2f5b](https://github.com/procyon-creative/qa-instructions/commit/ceb2f5bbb8ef755fa9d882a4981f684495c8f2a4))
* present test.step groups as Sections, collapsed steps, or flat ([7c64233](https://github.com/procyon-creative/qa-instructions/commit/7c642334a55952f53e1e2ec81c525745a740dd95))
* present test.step groups as Sections, collapsed steps, or flat ([be93c51](https://github.com/procyon-creative/qa-instructions/commit/be93c5155ccdcdc7eafe9cb592eea7f02d6020fe))
* read check subjects and expected values from the trace before Playwright 1.63 ([9c8b4f9](https://github.com/procyon-creative/qa-instructions/commit/9c8b4f9c458601b37432b5643cb9c472940395fe))
* read check subjects and expected values from the trace before Playwright 1.63 ([20be83c](https://github.com/procyon-creative/qa-instructions/commit/20be83c74185aec024cc47ab50992ea9fcfda5b3))
* say which part of the page a scoped element is in ([36a8e8e](https://github.com/procyon-creative/qa-instructions/commit/36a8e8e5f2cc60308de3c347b0c5f3ff425bbb95))
* say which part of the page a scoped element is in ([c7ce3a0](https://github.com/procyon-creative/qa-instructions/commit/c7ce3a0ab7f6ffd3b56174cdedb1012c9c8dd2dc))
* step screenshots from the Playwright trace ([a5d4b7c](https://github.com/procyon-creative/qa-instructions/commit/a5d4b7c32a4285035dc1133ae929f21608c491a1))
* step screenshots from the Playwright trace ([107047e](https://github.com/procyon-creative/qa-instructions/commit/107047ea61605f32ab2315b401f1f9364f597014))
* support Playwright 1.53+ and degrade gracefully on setup mistakes ([60d260d](https://github.com/procyon-creative/qa-instructions/commit/60d260df263d425c126c2326346d3a745c067d3f))
* support Playwright 1.53+ and degrade gracefully on setup mistakes ([1a8e9c8](https://github.com/procyon-creative/qa-instructions/commit/1a8e9c8c8828c527a407a70b28a537833f6328fa))
* warn on script-driven page changes and forced clicks ([b8bcb3e](https://github.com/procyon-creative/qa-instructions/commit/b8bcb3e8e160da51a02078fb2252511f3d421708))
* warn on script-driven page changes and mark forced actions approximate ([4c312af](https://github.com/procyon-creative/qa-instructions/commit/4c312afaa3480cb582bd9a9a0d7f27b1c7f5b5f0))


### Bug Fixes

* give a 1.56 fill no frame unless the page is known not to have scrolled since ([fc7edf4](https://github.com/procyon-creative/qa-instructions/commit/fc7edf4037ee94e94d360810aad01c3104783bd6))
* give a 1.56 fill no frame unless the page is known not to have scrolled since ([85e4719](https://github.com/procyon-creative/qa-instructions/commit/85e47194d2382526137a8ef361e7f992c1147803))
* give a smooth-scrolling fill no frame unless the page was found still ([5114772](https://github.com/procyon-creative/qa-instructions/commit/5114772432ff246ecd3fb32703a1f7ffec57304a))
* give a smooth-scrolling fill no frame unless the page was found still ([d31d906](https://github.com/procyon-creative/qa-instructions/commit/d31d9065b83f879f5f575abe430248b4e7f9c5d5))
* name a checked form by its title, as later steps name it ([5b7a42f](https://github.com/procyon-creative/qa-instructions/commit/5b7a42f40adc6954299f3684569ee148c781a2ff))
* name a checked form by its title, as later steps name it ([de888ca](https://github.com/procyon-creative/qa-instructions/commit/de888ca59516afac52d934f1a140a426281015ce))
* pick screen recording frames that show the scroll before Playwright 1.63 ([7235982](https://github.com/procyon-creative/qa-instructions/commit/72359827e13b51fddc3854d1a3f5f27c7fea1008))
* pick screen recording frames that show the scroll before Playwright 1.63 ([22b1ca1](https://github.com/procyon-creative/qa-instructions/commit/22b1ca1010091113a6624b8dfaf0838677f8d2a6))
* remove stale QA Instructions after a full run ([0404cc9](https://github.com/procyon-creative/qa-instructions/commit/0404cc977261a0fb1998d780402c9f51306a0384))
* remove stale QA Instructions after a full run ([fdca3ed](https://github.com/procyon-creative/qa-instructions/commit/fdca3edbe047333ff026564469a8147fa276066c))
* show fills settled after a smooth scroll and skip no-op checks ([53fb007](https://github.com/procyon-creative/qa-instructions/commit/53fb007dba8d3406f6a597a6ba8ea24ede8b8104))
* show fills settled after a smooth scroll and skip no-op checks ([a71ec11](https://github.com/procyon-creative/qa-instructions/commit/a71ec11c1ce497d25fe1beee074269f4dd36e2c1))


### Code Refactoring

* remove the qa fixture and hand-authored step API ([8ac6428](https://github.com/procyon-creative/qa-instructions/commit/8ac6428a30837efaf8e95fd4c4053e9d3fbfce24))

## 1.0.0 (2026-09-03)

### Features

- **cli:** add render command ([1cd04be](https://github.com/procyon-creative/qa-instructions/commit/1cd04be819029e97959109d891159435c1fb8264))
- **core:** add bundle model and builder ([0abc860](https://github.com/procyon-creative/qa-instructions/commit/0abc8601387772f99faf4a15c0e7d3eadd6d1ebd))
- **core:** add renderers and bundle I/O ([a968712](https://github.com/procyon-creative/qa-instructions/commit/a968712015700b6e1ee21ec57a51820d4ced9b9c))
- **example:** add collect-to-render demo and README ([2bff44b](https://github.com/procyon-creative/qa-instructions/commit/2bff44bce0b0d16b8e3d38a485e1d81ca3f06501))
- **example:** add fixture-site verification e2e with golden probes ([93c556f](https://github.com/procyon-creative/qa-instructions/commit/93c556feb92ef41fe59576596309bc447c4574c8))
- **example:** add fixture-site verification e2e with golden probes ([3f75e41](https://github.com/procyon-creative/qa-instructions/commit/3f75e41929ac14e2d68a8b51cbc2af273ddec859))
- **playwright:** add qa fixture and collector reporter ([ee9384b](https://github.com/procyon-creative/qa-instructions/commit/ee9384ba32bef524cd64de3f9acbe34077dc129b))

### Bug Fixes

- **ci:** exclude e2e from unit CI and fix render bin ([783ef52](https://github.com/procyon-creative/qa-instructions/commit/783ef52847ab7c546160e563a44bfb0793a84a42))
- **ci:** exclude e2e from unit CI and fix render bin ([d0318fd](https://github.com/procyon-creative/qa-instructions/commit/d0318fd6d7989d16f7eba54826471b6d60808287))
- collector owns asset metadata; wire CLI bin and CI ([8aafa64](https://github.com/procyon-creative/qa-instructions/commit/8aafa6425a505abcc327f248ca6bcca22b6d9cbf))
- **e2e:** use node path for render in CI ([9b6c61a](https://github.com/procyon-creative/qa-instructions/commit/9b6c61adf055b5a34cb9bad07f358c3f0add241b))
- **e2e:** use node path for render in CI ([f5130f9](https://github.com/procyon-creative/qa-instructions/commit/f5130f9fdadac7177739a0a8047fb774ea443af1))
- **verification:** normalize testFile paths for CI golden compare ([b6f77b4](https://github.com/procyon-creative/qa-instructions/commit/b6f77b47b758990e69961ff9317dbf6773930f86))
- **verification:** normalize testFile paths for CI golden compare ([2bc5cdf](https://github.com/procyon-creative/qa-instructions/commit/2bc5cdf6c8034ea6b3a7c841954dee48ba95af68))
