/**
 * What a host has to be able to do.
 *
 * One interface, with exactly the operations the op vocabulary needs — no
 * capability flags, no feature negotiation, no plugin registry. The point of
 * having it at all is that the pure layers (plan, diff, loop) are written
 * against this and not against Electron, so they can be tested with a fake and
 * so a second host would be an implementation rather than a rewrite.
 *
 * It is deliberately *not* an abstraction over windowing systems in general.
 * There is one method per op, named after the op. If a second host needs a
 * different shape, that is the moment to find out, not now.
 */

import type { Rect, Size, ViewId, WindowId, WindowKind } from '../types.ts';
import type { ActualState } from '../actual/state.ts';

/** A handle the adapter uses to identify a window it created. Opaque here. */
export interface HostWindowHandle {
  readonly id: WindowId;
}

/**
 * The host's side of a reconcile.
 *
 * Every method here is a *mutation* except `snapshot`, and every mutation is
 * applied only by the commit path. That is the single-writer rule in code: the
 * loop computes ops, and one function translates them into these calls.
 */
export interface HostAdapter {
  /** Create a window. Idempotent: creating an existing id is a no-op. */
  createWindow(spec: {
    id: WindowId;
    kind: WindowKind;
    size: Size;
    minSize: Size | null;
  }): HostWindowHandle;

  /** Destroy a window and every view it owns. Idempotent. */
  destroyWindow(id: WindowId): void;

  /** Resize a window's content area. */
  setWindowSize(id: WindowId, size: Size): void;

  /** Put a window on screen. */
  showWindow(id: WindowId, kind: WindowKind): void;

  /** Take a window off screen without destroying it. */
  hideWindow(id: WindowId): void;

  /** Ask the host to focus a window. */
  focusWindow(id: WindowId): void;

  /** Create a view inside a window. Idempotent. */
  createView(window: WindowId, view: ViewId): void;

  /** Destroy a view. Idempotent. */
  destroyView(window: WindowId, view: ViewId): void;

  /** Attach a view to a window's content area at an index. */
  attachView(window: WindowId, view: ViewId, index: number): void;

  /** Detach a view from its window, keeping it alive. */
  detachView(window: WindowId, view: ViewId): void;

  /** Move a view to an index in the window's stacking order. */
  orderView(window: WindowId, view: ViewId, index: number): void;

  /** Set a view's rectangle, in the window's content coordinates. */
  setViewBounds(window: WindowId, view: ViewId, bounds: Rect): void;

  /** Show or hide a view without changing its rectangle. */
  setViewVisible(window: WindowId, view: ViewId, visible: boolean): void;

  /**
   * Read the screen, right now.
   *
   * Must query the host rather than return a cached model. This is the method
   * that makes convergence possible; see actual/state.ts.
   */
  snapshot(): ActualState;
}
