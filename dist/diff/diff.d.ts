/**
 * Actual against desired, producing the ops that close the gap.
 *
 * Pure: no host is touched, so the interesting cases — a window that must be
 * created and shown in one pass, a layer that moved down the stack, a view that
 * must keep its pixels while losing its place — are all testable as value
 * comparisons.
 *
 * Two rules make the output safe to apply in order:
 *
 * 1. Ops are ordered by dependency: create before attach before order before
 *    size before show; detach before destroy; destroys last, so a window that is
 *    being replaced is still there while its replacement is built.
 * 2. Anything already true produces no op. "Show a window that is visible" is
 *    not emitted, which is what gives the reconcile loop its fixed point: on a
 *    converged screen the diff is empty and the loop stops, without anyone
 *    needing to remember that we were the ones who caused the last change.
 */
import type { ActualState } from '../actual/state.ts';
import type { DesiredState } from '../plan/desired.ts';
import type { Op } from './ops.ts';
import type { FocusRequest } from '../reconcile/focus.ts';
/** Options for the diff. */
export interface DiffOptions {
    /** The focus request counter, and how far we have applied it. */
    readonly focus: FocusRequest;
}
/**
 * Compute the ops that move `actual` toward `desired`.
 *
 * The result is empty exactly when the screen already matches the tree. That is
 * the loop's termination condition, and it is a property of the values rather
 * than of the sequence of events that produced them — which is why an echo of
 * our own `show()` cannot restart anything: by the time the echo arrives, the
 * diff is already empty.
 */
export declare function diff(actual: ActualState, desired: DesiredState, options: DiffOptions): Op[];
/** Whether an op list is empty. */
export declare function isConverged(ops: readonly Op[]): boolean;
