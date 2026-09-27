import type { ActionEvent } from '../events.js';

/**
 * Decides whether a piece of test plumbing changed the page, so the tester
 * is warned they may need to do something by hand at that point.
 *
 * Runners do not report what a script did, so the rule works from what the
 * test did with the script's result (see ADR 0001):
 * - an event fired by script (`dispatch`) always changes the page;
 * - a script whose result the test used was reading the page;
 * - any other script (result discarded, or unknown) may have changed it;
 * - a script that failed did not finish a change: the test stops there.
 */
export class ScriptChangeRule {
  changesPage(event: ActionEvent): boolean {
    if (event.failed) return false;
    switch (event.kind) {
      case 'dispatch':
        return true;
      case 'script':
        return event.resultUsed !== true;
      default:
        return false;
    }
  }
}
