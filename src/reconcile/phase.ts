/**
 * The creating→ready phase, kept honest by the host.
 *
 * React's createInstance is synchronous and may run for work that is thrown away,
 * while creating a real OS window is neither cheap nor reversible. The gap between
 * those two facts is a lifecycle:
 *
 *   pending   the node exists; the host has nothing
 *   creating  the host window exists but is not fit to show
 *   ready     the host window can be shown
 *   closing   teardown has started
 *   closed    the host window is gone
 *
 * Only `ready` windows are ever shown (see plan/visibility.ts), which is what stops
 * a window flashing at the wrong size, or at all, before its content has loaded.
 *
 * The phase is a *host fact*, not app intent, so it is derived from the actual
 * state rather than stored as something the app writes. Deriving it here — once,
 * before planning — means the tree and the screen cannot disagree about whether a
 * window exists, and there is no second writer to get out of step.
 */

import type { ActualState } from '../actual/state.ts';
import type { TreeSource } from '../plan/desired.ts';
import { isWindow } from '../tree/nodes.ts';

/**
 * Bring each window node's phase in line with what the host reports.
 *
 * Monotonic within a reconcile: a window that exists is never put back to
 * `pending`, because that would re-open the door to showing a window the host has
 * already built.
 */
export function syncPhases(root: TreeSource, actual: ActualState): void {
  for (const node of root.children) {
    if (!isWindow(node)) continue;
    const have = actual.windows.get(node.windowId);
    if (have === undefined) {
      // The host has no such window. If we thought it was ready, we were wrong;
      // the diff will re-create it.
      if (node.phase !== 'closing' && node.phase !== 'closed') node.phase = 'pending';
      continue;
    }
    if (node.phase === 'closing' || node.phase === 'closed') continue;
    node.phase = have.ready ? 'ready' : 'creating';
  }
}
