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
import type { ChromeMetrics, Claim, Extent, Size, ViewId, WindowId, WindowKind, WindowPhase } from '../types.ts';
/** Fields every node carries. */
interface NodeBase {
    /** Set by the reconciler; used to key diagnostics and the host registry. */
    readonly id: string;
    parent: ContainerNode | null;
    children: ContainerNode[];
}
/** The root of a window's view stack: an ordered list of layers. */
export interface LayerNode extends NodeBase {
    readonly type: 'layer';
    /** Stable name for diagnostics and for looking a layer up from the app. */
    readonly name: string;
    /** The id the host adapter knows this view by. */
    readonly viewId: ViewId;
    extent: Extent;
    visible: boolean;
}
/** A window. Holds layers; layers hold nothing. */
export interface WindowNode extends NodeBase {
    readonly type: 'window';
    readonly windowId: WindowId;
    kind: WindowKind;
    /** The size the app asked for, in the window's content area. */
    size: Size;
    /** Minimum content size, if the app set one. */
    minSize: Size | null;
    /** Whether the window should be on screen. Absent means nobody asked. */
    visibleClaim: Claim<boolean> | null;
    /**
     * Whether React is hiding this subtree (Suspense, `<Activity>`).
     *
     * Kept apart from `visibleClaim` because the two have different authors and
     * different lifetimes: React's flag is the framework's, the claim is the
     * app's. Folding them into one field would mean a Suspense boundary revealing
     * itself also reveals a window the app is deliberately holding back.
     */
    hiddenByReact: boolean;
    /** Lifecycle. Advanced by the adapter, read by the planner. */
    phase: WindowPhase;
    /** Chrome metrics — the *reason* the chrome height is what it is. */
    chromeMetrics: ChromeMetrics;
}
/** Anything that can hold children. */
export type ContainerNode = WindowNode | LayerNode;
/** Anything that can appear in the tree. */
export type CasementNode = ContainerNode;
/** A node the reconciler may create. */
export type NodeType = 'window' | 'layer';
/** Whether a node can hold children. */
export declare function isContainer(node: CasementNode): node is ContainerNode;
/** Whether a node is a window. */
export declare function isWindow(node: CasementNode): node is WindowNode;
/** Whether a node is a layer. */
export declare function isLayer(node: CasementNode): node is LayerNode;
/**
 * Walk a subtree depth-first, parents before children.
 *
 * Iterative rather than recursive: a pathological tree (a deeply nested set of
 * layers) should produce a bad tree, not a stack overflow inside the planner.
 */
export declare function walk(root: CasementNode): Generator<CasementNode>;
/** The windows under a root node, in document order. */
export declare function windowsOf(root: ContainerNode): WindowNode[];
/**
 * Insert `child` before `before` (or at the end when `before` is null).
 *
 * This is the single structural primitive the reconciler needs; React expresses
 * every reorder as a sequence of these. Returning the resulting index lets the
 * caller notice a no-op without walking the array again.
 */
export declare function insertBefore(parent: ContainerNode, child: ContainerNode, before: ContainerNode | null): number;
/** Remove `child` from `parent`. Returns whether it was there. */
export declare function removeChild(parent: ContainerNode, child: ContainerNode): boolean;
/** Detach a node from whatever holds it. */
export declare function detach(node: ContainerNode): void;
export {};
