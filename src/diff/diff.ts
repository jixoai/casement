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

import type { ActualState, ActualWindow } from '../actual/state.ts';
import type { DesiredState, DesiredView } from '../plan/desired.ts';
import { sameRect } from '../plan/geometry.ts';
import type { Op } from './ops.ts';
import type { FocusRequest } from '../reconcile/focus.ts';

/** Options for the diff. */
export interface DiffOptions {
  /** The focus request counter, and how far we have applied it. */
  readonly focus: FocusRequest;
}

/** The subset of an actual view the diff needs. */
type ActualViewLike = {
  readonly id: string;
  readonly bounds: DesiredView['bounds'];
  readonly visible: boolean;
};

/**
 * Views are matched by id, and their *order* is compared as a sequence.
 *
 * A view that is present in both but at a different index is a reorder, not a
 * remove plus an insert: detaching and re-attaching a WebContentsView makes it
 * flash, and on Electron it drops its input focus. So the diff never detaches a
 * view that is staying; it only moves it.
 *
 * Ordering is applied bottom-up and by absolute index. After position i is
 * settled, positions below i are final, so a single ascending pass reaches the
 * target order from any starting permutation — including one that just had new
 * views attached at the end. This is why the ordering pass runs *after* creates:
 * it is the one step that does not need to know where an attach landed.
 */
function diffViews(
  windowId: string,
  desired: readonly DesiredView[],
  actual: readonly ActualViewLike[],
): Op[] {
  const ops: Op[] = [];
  const actualById = new Map(actual.map((v) => [v.id, v]));
  const desiredIds = new Set(desired.map((v) => v.id));

  // 1. Views the host does not have yet. Created and attached in one step at
  //    their final index; the ordering pass below settles any contention.
  let created = false;
  for (let i = 0; i < desired.length; i += 1) {
    const view = desired[i];
    if (view === undefined) continue;
    if (actualById.has(view.id)) continue;
    ops.push({ op: 'createView', window: windowId, view: view.id });
    ops.push({ op: 'attachView', window: windowId, view: view.id, index: i });
    created = true;
  }

  // 2. Views the tree no longer has.
  for (const view of actual) {
    if (desiredIds.has(view.id)) continue;
    ops.push({ op: 'detachView', window: windowId, view: view.id });
    ops.push({ op: 'destroyView', window: windowId, view: view.id });
  }

  // 3. Stacking order. Only views that survive the diff are compared; a view
  //    that was just created is already where step 1 put it, and `created`
  //    forces the pass so a mixed batch cannot land in the wrong order.
  const surviving = desired
    .map((v) => v.id)
    .filter((id) => actualById.has(id));
  const currentOrder = actual
    .map((v) => v.id)
    .filter((id) => desiredIds.has(id));
  if (created || !sameSequence(currentOrder, surviving)) {
    for (let i = 0; i < desired.length; i += 1) {
      const view = desired[i];
      if (view === undefined) continue;
      ops.push({ op: 'orderView', window: windowId, view: view.id, index: i });
    }
  }

  // 4. Geometry and per-view visibility.
  //
  //    A view created this pass has no actual entry to compare against, so it
  //    always gets its rect: a fresh WebContentsView starts at zero area, and
  //    leaving it there is a layer that exists and never appears. Visibility is
  //    only sent when the view must start hidden, because a new view is visible
  //    already and an unnecessary setVisible would be a wasted call.
  for (const view of desired) {
    const have = actualById.get(view.id);
    if (have === undefined) {
      ops.push({
        op: 'setViewBounds',
        window: windowId,
        view: view.id,
        bounds: view.bounds,
      });
      if (!view.visible) {
        ops.push({
          op: 'setViewVisible',
          window: windowId,
          view: view.id,
          visible: false,
        });
      }
      continue;
    }
    if (!sameRect(have.bounds, view.bounds)) {
      ops.push({
        op: 'setViewBounds',
        window: windowId,
        view: view.id,
        bounds: view.bounds,
      });
    }
    if (have.visible !== view.visible) {
      ops.push({
        op: 'setViewVisible',
        window: windowId,
        view: view.id,
        visible: view.visible,
      });
    }
  }

  return ops;
}

/** Whether two id sequences are the same. */
function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Whether the host window is on screen.
 *
 * A minimized window is off screen even though `isVisible()` says otherwise, and
 * treating it as visible would make the diff emit `show()` for a window the user
 * just minimized — which un-minimizes it. So minimization is folded in here, and
 * `showWindow` in the adapter is written to restore rather than to raise.
 */
function actualVisible(window: ActualWindow): boolean {
  return window.visible && !window.minimized;
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
export function diff(
  actual: ActualState,
  desired: DesiredState,
  options: DiffOptions,
): Op[] {
  const create: Op[] = [];
  const mutate: Op[] = [];
  const destroy: Op[] = [];

  for (const [id, want] of desired.windows) {
    const have = actual.windows.get(id);

    if (have === undefined) {
      create.push({
        op: 'createWindow',
        id,
        kind: want.kind,
        size: want.size,
        minSize: want.minSize,
      });
      mutate.push(...diffViews(id, want.views, []));
      if (want.visible) mutate.push({ op: 'showWindow', id, kind: want.kind });
      continue;
    }

    if (have.size.width !== want.size.width || have.size.height !== want.size.height) {
      mutate.push({ op: 'setWindowSize', id, size: want.size });
    }

    mutate.push(...diffViews(id, want.views, have.views));

    const wantVisible = want.visible;
    const haveVisible = actualVisible(have);
    if (wantVisible && !haveVisible) {
      mutate.push({ op: 'showWindow', id, kind: want.kind });
    } else if (!wantVisible && haveVisible) {
      mutate.push({ op: 'hideWindow', id });
    }
  }

  for (const id of actual.windows.keys()) {
    if (!desired.windows.has(id)) destroy.push({ op: 'destroyWindow', id });
  }

  // Focus is a request counter, not state: it is applied when the counter has
  // advanced past what we last applied, and only to a window that is actually on
  // screen. Focusing a hidden window is how a "closed" window comes back.
  const focus: Op[] = [];
  if (options.focus.seq > options.focus.appliedSeq && options.focus.target !== null) {
    const target = desired.windows.get(options.focus.target);
    if (target !== undefined && target.visible) {
      focus.push({ op: 'focusWindow', id: options.focus.target, seq: options.focus.seq });
    }
  }

  return [...create, ...mutate, ...focus, ...destroy];
}

/** Whether an op list is empty. */
export function isConverged(ops: readonly Op[]): boolean {
  return ops.length === 0;
}
