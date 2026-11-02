/**
 * Test helpers.
 *
 * Published rather than kept in test/, because the useful thing to test with a
 * window layout is the layout, and an app author should not have to build a
 * fake host to do it.
 */
export { MemoryAdapter } from "./memory.js";
/** Chrome pixel heights used by tests and by the examples. */
export const TEST_CHROME_SPEC = Object.freeze({
    tabStrip: 40,
    bookmarkBar: 32,
    findBar: 36,
    permissionLane: 44,
    passwordLane: 48,
});
/** Chrome metrics with everything closed. */
export const CHROME_CLOSED = Object.freeze({
    tabStrip: 40,
    bookmarkBar: false,
    findBar: false,
    permissionLane: false,
    passwordLane: false,
    expanded: false,
});
/**
 * Build a window node by hand.
 *
 * The React layer is exercised separately (test/react.test.ts); the planner and
 * diff tests build nodes directly so a failure points at the arithmetic rather
 * than at a render.
 */
export function windowNode(spec) {
    return {
        type: 'window',
        id: 'window:' + spec.id,
        windowId: spec.id,
        kind: 'profile',
        parent: null,
        children: [],
        size: { width: spec.width ?? 1000, height: spec.height ?? 700 },
        minSize: null,
        visibleClaim: spec.visible === undefined
            ? null
            : { owner: spec.owner ?? 'human', value: spec.visible, at: 1 },
        hiddenByReact: false,
        phase: spec.phase ?? 'ready',
        chromeMetrics: { ...CHROME_CLOSED, ...spec.chrome },
    };
}
/** Build a layer node by hand. */
export function layerNode(spec) {
    return {
        type: 'layer',
        id: 'layer:' + spec.name,
        name: spec.name,
        viewId: spec.viewId ?? spec.name,
        parent: null,
        children: [],
        extent: spec.extent ?? { kind: 'content' },
        visible: spec.visible ?? true,
    };
}
/** Attach children to a node, keeping the parent pointers consistent. */
export function withChildren(parent, children) {
    for (const child of children) {
        child.parent = parent;
        parent.children.push(child);
    }
    return parent;
}
