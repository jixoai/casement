/**
 * The reconcile policy: which OS facts are allowed to write back into the tree.
 *
 * The OS is a second author. A user drags a window, minimizes it, closes it, or
 * a tiling script resizes it — and none of that came from the tree. Something
 * has to decide, per fact, whether the tree should be updated to agree.
 *
 * Getting this wrong in either direction is a bug class:
 *
 * - Write back too much, and the app fights the user: the OS reports the window
 *   as visible (because we just showed it), we write "visible" into the tree, and
 *   now the tree says visible for a reason nobody intended. Worse, a *transient*
 *   OS state — minimized during a hide animation — becomes permanent intent.
 * - Write back too little, and the app forgets what the user did: they resize a
 *   window, the next commit restores the old size, and the resize appears to
 *   bounce.
 *
 * The table below is the whole answer, in one place, so it can be argued with
 * rather than discovered. It is deliberately not extensible by callers: a policy
 * engine with rules is the complexity this design exists to avoid.
 */
/** The table. Read this before adding an event handler. */
export const POLICY = Object.freeze({
    // The user moved the window. Position is theirs; casement never stores it, so
    // there is nothing to adopt. It is still read into actual state so a debug
    // dump can say where the window is.
    moved: 'ignore',
    // The user resized the window. Adopt it: the next commit must not undo a
    // gesture the user just made. Note this writes *size* only — position stays
    // out of the tree, because a window that re-centres itself on every commit is
    // the classic symptom of storing a position you do not own.
    resized: 'adopt',
    // Minimize/restore are the user's; adopt so a later commit does not un-minimize
    // a window they just put away.
    minimize: 'adopt',
    restore: 'adopt',
    maximize: 'adopt',
    unmaximize: 'adopt',
    'enter-full-screen': 'adopt',
    'leave-full-screen': 'adopt',
    // Our own visibility echoes. This is the important row: `show` and `hide`
    // arrive for changes *we* made, so adopting them would make the derived
    // visibility feed itself. They are ignored as facts — the derived expression
    // is the truth — and convergence terminates the echo, not a suppression flag.
    show: 'ignore',
    hide: 'ignore',
    // Focus is a request counter, never a stored boolean. Both are ignored as
    // state; "who is focused" is answered by querying.
    focus: 'ignore',
    blur: 'ignore',
    // Closing is an event. There is no "closing" value in the tree to converge on;
    // the app unmounts the window, and the unmount is what destroys it.
    closed: 'event',
    destroyed: 'event',
});
/** Look up what to do with a fact. */
export function policyFor(fact) {
    return POLICY[fact];
}
/** Every fact the app can be notified about. */
export function eventFacts() {
    return Object.keys(POLICY).filter((f) => POLICY[f] === 'event');
}
