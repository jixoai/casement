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
import { chromeHeight, projectExtent, sameRect, ZERO_RECT } from "./geometry.js";
import { isLayer, isWindow, walk } from "../tree/nodes.js";
import { isWindowVisible } from "./visibility.js";
/** Plan one window. */
export function planWindow(window, options) {
    const size = window.size;
    const chrome = chromeHeight(size, window.chromeMetrics, options.chrome);
    const ctx = { window: size, chrome };
    const views = [];
    // Document order is stacking order: a later layer is drawn over an earlier
    // one. This is the single definition of z-order in the library — the host
    // adapter is told the order and is never allowed to invent one.
    for (const child of window.children) {
        if (!isLayer(child))
            continue;
        views.push({
            id: child.viewId,
            bounds: child.visible ? projectExtent(child.extent, ctx) : ZERO_RECT,
            visible: child.visible,
        });
    }
    return {
        id: window.windowId,
        kind: window.kind,
        visible: isWindowVisible({
            phase: window.phase,
            hiddenByReact: window.hiddenByReact,
            claim: window.visibleClaim,
        }),
        size,
        minSize: window.minSize,
        views,
    };
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
export function plan(root, options) {
    const windows = new Map();
    for (const child of root.children) {
        if (isWindow(child))
            windows.set(child.windowId, planWindow(child, options));
    }
    return { windows };
}
/** Whether two desired states describe the same screen. */
export function sameDesired(a, b) {
    if (a.windows.size !== b.windows.size)
        return false;
    for (const [id, left] of a.windows) {
        const right = b.windows.get(id);
        if (right === undefined)
            return false;
        if (left.visible !== right.visible)
            return false;
        if (left.kind !== right.kind)
            return false;
        if (left.size.width !== right.size.width || left.size.height !== right.size.height) {
            return false;
        }
        if (!sameSizeOrNull(left.minSize, right.minSize))
            return false;
        if (left.views.length !== right.views.length)
            return false;
        for (let i = 0; i < left.views.length; i += 1) {
            const lv = left.views[i];
            const rv = right.views[i];
            if (lv === undefined || rv === undefined)
                return false;
            if (lv.id !== rv.id)
                return false;
            if (lv.visible !== rv.visible)
                return false;
            if (!sameRect(lv.bounds, rv.bounds))
                return false;
        }
    }
    return true;
}
function sameSizeOrNull(a, b) {
    if (a === null || b === null)
        return a === b;
    return a.width === b.width && a.height === b.height;
}
