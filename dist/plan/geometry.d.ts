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
export declare const ZERO_RECT: Rect;
/** Whether two rects describe the same pixels. */
export declare function sameRect(a: Rect, b: Rect): boolean;
/** Whether two sizes describe the same pixels. */
export declare function sameSize(a: Size, b: Size): boolean;
/** Clamp a rect to non-negative area. */
export declare function clampRect(rect: Rect): Rect;
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
export declare function chromeHeight(window: Size, metrics: ChromeMetrics, spec: ChromeSpec): number;
/** The rectangle the content area occupies. */
export declare function contentRect(window: Size, chrome: number): Rect;
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
export declare function projectExtent(extent: Extent, ctx: ProjectionContext): Rect;
