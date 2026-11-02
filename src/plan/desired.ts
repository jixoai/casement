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

import { chromeHeight, projectExtent, sameRect, ZERO_RECT } from './geometry.ts';
import { isLayer, isWindow, walk } from '../tree/nodes.ts';
import type { ContainerNode, WindowNode } from '../tree/nodes.ts';
import { isWindowVisible } from './visibility.ts';
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
export function planWindow(window: WindowNode, options: PlanOptions): DesiredWindow {
  const size = window.size;
  const chrome = chromeHeight(size, window.chromeMetrics, options.chrome);
  const ctx = { window: size, chrome };

  const views: DesiredView[] = [];
  // Document order is stacking order: a later layer is drawn over an earlier
  // one. This is the single definition of z-order in the library — the host
  // adapter is told the order and is never allowed to invent one.
  for (const child of window.children) {
    if (!isLayer(child)) continue;
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
export function plan(root: TreeSource, options: PlanOptions): DesiredState {
  const windows = new Map<WindowId, DesiredWindow>();
  for (const child of root.children) {
    if (isWindow(child)) windows.set(child.windowId, planWindow(child, options));
  }
  return { windows };
}

/** Whether two desired states describe the same screen. */
export function sameDesired(a: DesiredState, b: DesiredState): boolean {
  if (a.windows.size !== b.windows.size) return false;
  for (const [id, left] of a.windows) {
    const right = b.windows.get(id);
    if (right === undefined) return false;
    if (left.visible !== right.visible) return false;
    if (left.kind !== right.kind) return false;
    if (left.size.width !== right.size.width || left.size.height !== right.size.height) {
      return false;
    }
    if (!sameSizeOrNull(left.minSize, right.minSize)) return false;
    if (left.views.length !== right.views.length) return false;
    for (let i = 0; i < left.views.length; i += 1) {
      const lv = left.views[i];
      const rv = right.views[i];
      if (lv === undefined || rv === undefined) return false;
      if (lv.id !== rv.id) return false;
      if (lv.visible !== rv.visible) return false;
      if (!sameRect(lv.bounds, rv.bounds)) return false;
    }
  }
  return true;
}

function sameSizeOrNull(a: Size | null, b: Size | null): boolean {
  if (a === null || b === null) return a === b;
  return a.width === b.width && a.height === b.height;
}
