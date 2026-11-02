/**
 * Geometry as arithmetic, not as state.
 *
 * Every rectangle a view occupies is a pure function of the window's content
 * size, the chrome metrics, and the layer's declared extent. Nothing in here
 * reads or writes a window: given the same inputs it returns the same rect, and
 * that is the whole contract. Keeping it this way is what makes it impossible
 * for the tree and the screen to disagree — there is only one copy of the
 * answer, and it is recomputed rather than remembered.
 */

import type { ChromeMetrics, ChromeSpec, Extent, Rect, Size } from '../types.ts';

/** A rect of no area, at the origin. Used for anything that is not on screen. */
export const ZERO_RECT: Rect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

/** Whether two rects describe the same pixels. */
export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Whether two sizes describe the same pixels. */
export function sameSize(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height;
}

/** Clamp a rect to non-negative area. */
export function clampRect(rect: Rect): Rect {
  if (rect.width >= 0 && rect.height >= 0) return rect;
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
  };
}

/**
 * How tall the chrome bar is, given which lanes are open.
 *
 * `expanded` wins outright: when something is open *over* the content, the bar
 * covers the window so the overlay has somewhere to draw. The lanes are
 * additive and independent — a find bar, a permission bubble and a password
 * prompt can all be open at once, and the bar is the sum.
 *
 * Note what is *not* an input: anything about the layers. The content rect must
 * not move because an overlay appeared, or the page reflows every time a
 * dropdown opens. That invariant is enforced here by construction — this
 * function cannot see the layer stack.
 */
export function chromeHeight(
  window: Size,
  metrics: ChromeMetrics,
  spec: ChromeSpec,
): number {
  if (metrics.expanded) return Math.max(0, window.height);
  let height = metrics.tabStrip > 0 ? metrics.tabStrip : spec.tabStrip;
  if (metrics.bookmarkBar) height += spec.bookmarkBar;
  if (metrics.findBar) height += spec.findBar;
  if (metrics.permissionLane) height += spec.permissionLane;
  if (metrics.passwordLane) height += spec.passwordLane;
  return Math.max(0, height);
}

/** The rectangle the content area occupies. */
export function contentRect(window: Size, chrome: number): Rect {
  return clampRect({
    x: 0,
    y: chrome,
    width: window.width,
    height: window.height - chrome,
  });
}

/** Everything needed to turn an extent into pixels. */
export interface ProjectionContext {
  /** The window's content size. */
  readonly window: Size;
  /** The resolved chrome height for this frame. */
  readonly chrome: number;
}

/**
 * Turn a declared extent into the rectangle it occupies.
 *
 * This is the only place a view's geometry is decided. Callers hold extents —
 * reasons — and never rects, so there is no second copy to drift.
 */
export function projectExtent(extent: Extent, ctx: ProjectionContext): Rect {
  switch (extent.kind) {
    case 'hidden':
      return ZERO_RECT;

    case 'fill':
      return clampRect({
        x: 0,
        y: 0,
        width: ctx.window.width,
        height: ctx.window.height,
      });

    case 'content':
      return contentRect(ctx.window, ctx.chrome);

    case 'chrome':
      return clampRect({
        x: 0,
        y: 0,
        width: ctx.window.width,
        height: ctx.chrome,
      });

    case 'anchored': {
      const reference: Rect =
        (extent.against ?? 'content') === 'fill'
          ? { x: 0, y: 0, width: ctx.window.width, height: ctx.window.height }
          : contentRect(ctx.window, ctx.chrome);
      // Never larger than the box it is anchored to *minus its own margin*: a
      // float bigger than the content area would otherwise hang off the edge with
      // no way to reach it, and one that merely touched the edge would lose the
      // gap that tells the user it is floating rather than docked.
      const margin = Math.max(0, extent.margin);
      const maxWidth = Math.max(0, reference.width - margin * 2);
      const maxHeight = Math.max(0, reference.height - margin * 2);
      const width = Math.min(Math.max(0, extent.size.width), maxWidth);
      const height = Math.min(Math.max(0, extent.size.height), maxHeight);
      const left = reference.x + margin;
      const right = reference.x + reference.width - width - margin;
      const top = reference.y + margin;
      const bottom = reference.y + reference.height - height - margin;
      // Both edges are inside the reference box once the size has been clamped
      // to it, so the corner only chooses which edge to align to.
      switch (extent.corner) {
        case 'top-left':
          return { x: left, y: top, width, height };
        case 'top-right':
          return { x: right, y: top, width, height };
        case 'bottom-left':
          return { x: left, y: bottom, width, height };
        case 'bottom-right':
          return { x: right, y: bottom, width, height };
      }
    }
  }
}
