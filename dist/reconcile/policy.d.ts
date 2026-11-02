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
/**
 * What to do with an OS fact.
 *
 * - `ignore` — read it into the actual state (so the diff can see it) but never
 *   write it into the tree. Use for facts the app does not own.
 * - `adopt` — write it into the tree as a claim authored by `human`, because the
 *   user's gesture is the most authoritative statement of intent there is.
 * - `event` — not state at all. Hand it to the app as a notification; the app
 *   decides what to do, usually by unmounting something.
 */
export type PolicyAction = 'ignore' | 'adopt' | 'event';
/** Every OS fact casement has an opinion about. */
export type OsFact = 'moved' | 'resized' | 'minimize' | 'restore' | 'maximize' | 'unmaximize' | 'enter-full-screen' | 'leave-full-screen' | 'show' | 'hide' | 'focus' | 'blur' | 'closed' | 'destroyed';
/** The table. Read this before adding an event handler. */
export declare const POLICY: Readonly<Record<OsFact, PolicyAction>>;
/** Look up what to do with a fact. */
export declare function policyFor(fact: OsFact): PolicyAction;
/** Every fact the app can be notified about. */
export declare function eventFacts(): OsFact[];
