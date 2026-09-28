import type { ActionEvent } from '../events.js';
import type { ActionCapture } from '../screenshots/source.js';

/** What a recording of the page (e.g. a trace) says about one call. */
export type RecordedChange = Pick<ActionCapture, 'pageChanged'>;

/**
 * Decides whether a piece of test plumbing changed the page, so the tester
 * is warned they may need to do something by hand at that point (see
 * ADR 0001). Only scripts (`script`) and events fired by script (`dispatch`)
 * can; a script that failed did not finish a change: the test stops there.
 *
 * When the page was recorded before and after the call, the recording
 * decides, whatever the test did with the script's result. Otherwise the
 * rule works from the test's source:
 * - an event fired by script always changes the page;
 * - a script whose result the test used was reading the page;
 * - any other script (result discarded, or unknown) may have changed it.
 */
export class ScriptChangeRule {
  /** The call is a script that may have changed the page, before any recording is consulted. */
  mayChangePage(event: ActionEvent): boolean {
    return (
      !event.failed && (event.kind === 'script' || event.kind === 'dispatch')
    );
  }

  changesPage(event: ActionEvent, recorded: RecordedChange = {}): boolean {
    if (!this.mayChangePage(event)) return false;
    if (recorded.pageChanged !== undefined) return recorded.pageChanged;
    return event.kind === 'dispatch' || event.resultUsed !== true;
  }
}
