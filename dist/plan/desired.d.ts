/**
 * The tree, projected into the state the screen should be in.
 *
 * `plan()` is a pure function of the tree. It walks the windows, derives each
 * one's visibility and each layer's rectangle, and returns a flat description
 * with no references back into the tree. Two consequences follow, and both are
 * load-bearing:
 *
 * - The diff compares two plain values, so "did anything change" is a value
 *   comparison rather than a guess about what some event meant.
 * - The planner can be run twice on the same tree and produce equal results,
 *   which is what makes convergence idempotent: re-planning a converged tree
 *   yields an empty diff, so the reconcile loop has a fixed point to stop at.
 *
 * Geometry is derived here and *only* here. A layer holds an extent (a reason);
 * the rect it occupies is computed fresh on every plan. There is no cached rect
 * in the tree to go stale.
 */
import type { ContainerNode, WindowNode } from '../tree/nodes.ts';
import type { ChromeSpec, Rect, Size, ViewId, WindowId, WindowKind } from '../types.ts';
/** One view, resolved to the pixels it should occupy. */
export interface DesiredView {
    readonly id: ViewId;
    readonly bounds: Rect;
    readonly visible: boolean;
}
/** One window, resolved. */
export interface DesiredWindow {
    readonly id: WindowId;
    readonly kind: WindowKind;
    readonly visible: boolean;
    /** The content size the window should have. Position is not ours to set. */
    readonly size: Size;
    readonly minSize: Size | null;
    /** Views in stacking order, bottom first. Index in this array is the z-order. */
    readonly views: readonly DesiredView[];
}
/** The whole desired state. */
export interface DesiredState {
    readonly windows: ReadonlyMap<WindowId, DesiredWindow>;
}
/** Options that shape the projection. */
export interface PlanOptions {
    /** Pixel heights for the chrome lanes. */
    readonly chrome: ChromeSpec;
}
/** Plan one window. */
export declare function planWindow(window: WindowNode, options: PlanOptions): DesiredWindow;
/**
 * Anything that holds windows: a React root container, or a window itself.
 *
 * Taking the shape rather than a concrete class means the planner can be handed
 * the reconciler's container, a hand-built tree in a test, or a subtree, without
 * any of them having to pretend to be the others.
 */
export interface TreeSource {
    readonly children: readonly ContainerNode[];
}
/**
 * Plan the whole tree.
 *
 * A root that holds layers directly (rather than windows) is a programming error
 * the reconciler rejects at create time, so anything reached here is a window or
 * inside one; a stray layer is skipped rather than silently promoted. `plan` is
 * total on purpose: a malformed tree should produce an empty plan, not an
 * exception thrown from the middle of a commit.
 */
export declare function plan(root: TreeSource, options: PlanOptions): DesiredState;
/** Whether two desired states describe the same screen. */
export declare function sameDesired(a: DesiredState, b: DesiredState): boolean;
