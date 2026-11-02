/**
 * What is actually on screen — a cache with one rule: refresh by asking.
 *
 * The tempting design is to keep this in sync from events. It does not work.
 * Electron does not emit an event for every change: a view's bounds can move
 * without a notification, a window can be resized by a tiling script that says
 * nothing, and a `show` we caused ourselves arrives back as an OS event that
 * looks exactly like a user's. A model fed only by events drifts, and a model
 * that has drifted produces oscillation — reconcile says "show", the stale copy
 * says "hidden", reconcile says "show" again.
 *
 * So: this is a cache, and the only way to trust it is to re-read it. `refresh`
 * asks the host. The reconcile loop asks before every diff, which is what makes
 * convergence a property of the loop rather than a hope about events.
 *
 * Events are still used — but for *policy*, not for truth. See reconcile/policy.
 */
/** An empty actual state — a process that has not opened a window yet. */
export const EMPTY_ACTUAL = Object.freeze({
    windows: new Map(),
});
