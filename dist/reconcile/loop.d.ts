/**
 * Converge the screen onto the tree, then stop.
 *
 * The loop is: read the screen, diff it against the tree, apply, repeat until
 * the diff is empty. It is written this way — rather than "apply once and trust
 * it" — for one specific reason: the host is not a function. `setBounds` can be
 * clamped by the OS, `show` on a window whose content has not loaded can be
 * deferred, and a resize can arrive between two of our own calls. A single pass
 * would leave the screen and the tree disagreeing, and every later pass would
 * re-apply the same delta forever.
 *
 * Re-reading after each pass is what turns "eventually correct" into "correct,
 * and provably so": the loop's exit condition is `diff(actual, desired) is
 * empty`, which is a statement about the screen, not about our intent.
 *
 * The iteration cap is not a policy — it is a guard against a host that
 * genuinely cannot reach the target (an OS that refuses a size, say). Hitting it
 * is reported with the remaining ops so the failure is legible instead of being
 * an infinite loop that hangs the main process.
 */
import type { Op } from '../diff/ops.ts';
import type { FocusRequest } from './focus.ts';
import type { HostAdapter } from '../host/adapter.ts';
import type { DesiredState, PlanOptions, TreeSource } from '../plan/desired.ts';
/** Options for a reconcile. */
export interface ReconcileOptions extends PlanOptions {
    /** The focus request counter. */
    readonly focus: FocusRequest;
    /** How many passes before giving up. Defaults to 4. */
    readonly maxPasses?: number;
    /** Called for each pass, for logging. */
    readonly onPass?: (pass: ReconcilePass) => void;
}
/** One pass of the loop, reported to `onPass`. */
export interface ReconcilePass {
    readonly index: number;
    readonly ops: readonly Op[];
}
/** The outcome of a reconcile. */
export interface ReconcileResult {
    /** Whether the screen matches the tree. */
    readonly converged: boolean;
    /** The focus counter, advanced if a focus op was applied. */
    readonly focus: FocusRequest;
    /** How many passes applied at least one op. */
    readonly passes: number;
    /** Ops still outstanding. Empty exactly when `converged`. */
    readonly remaining: readonly Op[];
    /** The plan that was converged on, for callers that want to log it. */
    readonly desired: DesiredState;
}
/** The default pass cap. Four is enough for create→attach→order→size→show. */
export declare const DEFAULT_MAX_PASSES = 4;
/**
 * Run the loop.
 *
 * `plan()` runs once, not per pass: the tree cannot change during a synchronous
 * reconcile, so re-planning would only recompute the same answer. What *does*
 * change per pass is the actual state, which is the thing being converged.
 */
export declare function reconcile(root: TreeSource, adapter: HostAdapter, options: ReconcileOptions): ReconcileResult;
/** Format a result for a log line. */
export declare function describeResult(result: ReconcileResult): string;
