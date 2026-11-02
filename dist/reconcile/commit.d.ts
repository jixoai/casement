/**
 * The single commit path.
 *
 * This function is the only place in casement that calls a mutating method on a
 * host. Everything else — the app, the React layer, the effects bridge — may
 * only produce ops or dispatch intent. That is the whole rule, and it is
 * enforced by keeping the adapter instance private to this module's callers:
 * `commit` is handed an adapter, and nothing else is.
 *
 * The switch below is exhaustive over `Op`, so adding a new kind of mutation
 * fails to compile until it is given a host call here. There is no default
 * branch that silently ignores an op — an unhandled op would be a bug that only
 * shows up as "the window did not move".
 */
import type { HostAdapter } from '../host/adapter.ts';
import type { Op } from '../diff/ops.ts';
import type { FocusRequest } from './focus.ts';
/** What a commit did, for logging and tests. */
export interface CommitResult {
    /** The focus counter after the commit. */
    readonly focus: FocusRequest;
    /** How many ops were applied. */
    readonly applied: number;
}
/**
 * Apply ops to a host, in order.
 *
 * Errors are not swallowed: a host that throws on `setViewBounds` has a real
 * problem, and the reconcile loop is the wrong place to hide it. What *is*
 * handled is the one benign race — an op against a window that has since been
 * destroyed — by having each adapter method be idempotent and total rather than
 * by catching here.
 */
export declare function commit(adapter: HostAdapter, ops: readonly Op[], focus: FocusRequest): CommitResult;
