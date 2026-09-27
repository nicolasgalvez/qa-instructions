# qa-instructions

Turns what an existing Playwright test does into instructions a person can follow by hand to check the same thing, with a screenshot for each step. Test authors change nothing in their tests.

## Language

**QA Instructions**:
The human-readable output for one test: a title, optional prerequisites, and an ordered list of QA Steps.
_Avoid_: test plan, script, report

**QA Step**:
One thing a person does in the browser to follow the test by hand, plus what they should see afterward.
_Avoid_: test step (that is Playwright's `test.step`)

**Action**:
The "do this" half of a QA Step: something a person can do in a browser, such as opening a URL, clicking, typing, choosing an option, or pressing a key. Test plumbing that a person cannot repeat (waits, scripts, reading values) is never an Action.

**Warning step**:
A QA Step placed where the test changed the page with a script instead of a user action (e.g. force-opening an accordion), telling the tester they may need to do something by hand to continue. It has no Highlight.

**Approximate**:
Said of an Action the test forced past the runner's usual checks (`force: true`); its Highlight may not line up.

**Secret**:
A value that must never appear in QA Instructions: text typed into a password field (as recorded on the page, not guessed from the test), or anything matching a configured mask pattern. It is shown as `[masked]`, and a step that typed a password tells the tester to type their own.

**Expected Result**:
The "you should see" half of a QA Step, taken from the test's own checks that follow the Action. A QA Step may have none.
_Avoid_: assertion (that is the test's code, not what the tester reads)

**Section**:
A named group of QA Steps, taken from a test's own grouping of its actions.

**Step Screenshot**:
The picture of the page at the moment of a QA Step's Action, with a Highlight on the element acted on.

**Highlight**:
The mark drawn on a Step Screenshot to show which element the Action touched and, for clicks, where. Its style is configurable.
_Avoid_: annotation (overloaded with Playwright test annotations)

## Example dialogue

> **Dev:** "The checkout test calls `waitForTimeout` and reads the cart's data attributes. Are those QA Steps?"
> **Domain expert:** "No. A tester can't repeat those. The QA Steps are opening the product page, entering 3, and clicking Purchase, and the Expected Result is that the cart shows 3."
