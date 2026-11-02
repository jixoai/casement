/**
 * Host instances: the tree React builds and the planner reads.
 *
 * These are plain objects with no handle on an OS resource. There is no
 * `win.show` here and no `new BaseWindow`; a node knows its id, its declared
 * intent, and its children. That is a deliberate constraint with two payoffs:
 *
 * 1. `createInstance` is pure. A React render phase may be thrown away — that
 *    is what makes StrictMode's double render, abandoned transitions and
 *    Suspense retries safe — and a node that allocated an OS window during a
 *    discarded render would leak it. Creation happens later, in commit.
 * 2. The tree is serializable, so a bug report can carry the state that caused
 *    it, and a test can assert on it without a display.
 */
/** Whether a node can hold children. */
export function isContainer(node) {
    return node.type === 'window' || node.type === 'layer';
}
/** Whether a node is a window. */
export function isWindow(node) {
    return node.type === 'window';
}
/** Whether a node is a layer. */
export function isLayer(node) {
    return node.type === 'layer';
}
/**
 * Walk a subtree depth-first, parents before children.
 *
 * Iterative rather than recursive: a pathological tree (a deeply nested set of
 * layers) should produce a bad tree, not a stack overflow inside the planner.
 */
export function* walk(root) {
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        yield node;
        for (let i = node.children.length - 1; i >= 0; i -= 1) {
            const child = node.children[i];
            if (child !== undefined)
                stack.push(child);
        }
    }
}
/** The windows under a root node, in document order. */
export function windowsOf(root) {
    const out = [];
    for (const node of walk(root)) {
        if (isWindow(node))
            out.push(node);
    }
    return out;
}
/**
 * Insert `child` before `before` (or at the end when `before` is null).
 *
 * This is the single structural primitive the reconciler needs; React expresses
 * every reorder as a sequence of these. Returning the resulting index lets the
 * caller notice a no-op without walking the array again.
 */
export function insertBefore(parent, child, before) {
    const existing = parent.children.indexOf(child);
    if (existing !== -1)
        parent.children.splice(existing, 1);
    const at = before === null ? parent.children.length : parent.children.indexOf(before);
    const index = at === -1 ? parent.children.length : at;
    parent.children.splice(index, 0, child);
    child.parent = parent;
    return index;
}
/** Remove `child` from `parent`. Returns whether it was there. */
export function removeChild(parent, child) {
    const index = parent.children.indexOf(child);
    if (index === -1)
        return false;
    parent.children.splice(index, 1);
    if (child.parent === parent)
        child.parent = null;
    return true;
}
/** Detach a node from whatever holds it. */
export function detach(node) {
    const parent = node.parent;
    if (parent !== null)
        removeChild(parent, node);
}
