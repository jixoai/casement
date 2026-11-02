/**
 * The react-reconciler host config.
 *
 * This is the one file that has to track React. react-reconciler is not a public
 * React API: it is the internal engine react-dom is built on, published so that
 * renderers like this one are possible, and its host-config surface changes with
 * React's minor versions (0.31 ↔ 19.0, 0.32 ↔ 19.1, 0.33 ↔ 19.2, 0.34 ↔ 19.3).
 * casement therefore pins both, and this file is expected to need work at each
 * upgrade. See DESIGN.md, "Accepted costs".
 *
 * Three things here are easy to get wrong and expensive to debug:
 *
 * 1. **createInstance must not touch the host.** React may render a tree and
 *    throw it away — StrictMode's double render, an abandoned transition, a
 *    Suspense retry that never commits. An instance that allocated an OS window
 *    during render leaks that window. So instances are pure objects and every
 *    host call happens in the commit phase (finalizeInitialChildren /
 *    commitMount / resetAfterCommit). react-x11 learned this the hard way
 *    (their issue #4); this design inherits the lesson.
 *
 * 2. **React hides a subtree only after inserting it.** `hideInstance` runs at
 *    the end of the mutation phase, so a window born inside a hidden subtree is
 *    inserted *then* hidden. If insertion showed it, it would flash — or, worse,
 *    on a window manager that redirects maps, get stuck on screen (react-x11
 *    issue #201). So showing is deferred to the end of the commit, when the
 *    hidden flag is already final.
 *
 * 3. **Members the types do not know about still get called.** React 19.3 added
 *    `createFragmentInstance` and `suspendOnActiveViewTransition` before
 *    @types/react-reconciler described them; a missing member is a TypeError at
 *    the worst possible moment. The members below are the union of what 0.34
 *    calls and what the types declare, with the extras called out.
 */
import type { ContainerNode, LayerNode, WindowNode } from '../tree/nodes.ts';
import type { ChromeMetrics, Claim, Extent, Owner, Size, ViewId, WindowKind } from '../types.ts';
/** Props accepted by `<Window>`. */
export interface WindowProps {
    /** Stable identity. Two windows with the same id are the same window. */
    readonly id: string;
    readonly kind?: WindowKind;
    readonly width: number;
    readonly height: number;
    readonly minWidth?: number;
    readonly minHeight?: number;
    /**
     * Whether this window should be on screen, and who says so.
     *
     * Omitting it means "nobody has asked", and a window nobody asked to see is
     * not on screen. That default is the entire fix for the bug that motivated
     * casement: creating a window used to imply revealing it, so an agent opening
     * a window on the user's behalf could not avoid putting it in front of them.
     * Creation and visibility are now different gestures.
     */
    readonly visible?: {
        owner: Owner;
        value: boolean;
    };
    readonly chrome?: Partial<ChromeMetrics>;
    readonly children?: unknown;
}
/** Props accepted by `<Layer>`. */
export interface LayerProps {
    readonly name: string;
    /** Overrides the generated view id. Must be unique across the app. */
    readonly viewId?: ViewId;
    readonly extent?: Extent;
    readonly visible?: boolean;
    readonly children?: unknown;
}
/** A window instance, with the React-side extras. */
export interface WindowInstance extends WindowNode {
    /** Mirrors the `visible` prop into a claim, stamped on write. */
    setVisibleClaim(claim: Claim<boolean> | null): void;
    setChrome(metrics: Partial<ChromeMetrics> | undefined): void;
    setSize(size: Size, minSize: Size | null): void;
}
/** A layer instance. */
export interface LayerInstance extends LayerNode {
    setExtent(extent: Extent): void;
    setVisible(visible: boolean): void;
}
/** The container handed to React: one per app. */
export interface RootContainer {
    readonly type: 'root';
    readonly children: ContainerNode[];
    /** Called at the end of every commit, so the app can reconcile. */
    onCommit: (() => void) | null;
}
/** Build the host config. One instance per renderer. */
export declare function createHostConfig(metadata: {
    readonly packageName: string;
    readonly version: string;
}): any;
