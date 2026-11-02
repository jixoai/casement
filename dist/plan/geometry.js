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
/** A rect of no area, at the origin. Used for anything that is not on screen. */
export const ZERO_RECT = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
/** Whether two rects describe the same pixels. */
export function sameRect(a, b) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
/** Whether two sizes describe the same pixels. */
export function sameSize(a, b) {
    return a.width === b.width && a.height === b.height;
}
/** Clamp a rect to non-negative area. */
export function clampRect(rect) {
    if (rect.width >= 0 && rect.height >= 0)
        return rect;
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
export function chromeHeight(window, metrics, spec) {
    if (metrics.expanded)
        return Math.max(0, window.height);
    let height = metrics.tabStrip > 0 ? metrics.tabStrip : spec.tabStrip;
    if (metrics.bookmarkBar)
        height += spec.bookmarkBar;
    if (metrics.findBar)
        height += spec.findBar;
    if (metrics.permissionLane)
        height += spec.permissionLane;
    if (metrics.passwordLane)
        height += spec.passwordLane;
    return Math.max(0, height);
}
/** The rectangle the content area occupies. */
export function contentRect(window, chrome) {
    return clampRect({
        x: 0,
        y: chrome,
        width: window.width,
        height: window.height - chrome,
    });
}
/**
 * Turn a declared extent into the rectangle it occupies.
 *
 * This is the only place a view's geometry is decided. Callers hold extents —
 * reasons — and never rects, so there is no second copy to drift.
 */
export function projectExtent(extent, ctx) {
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
            const reference = (extent.against ?? 'content') === 'fill'
                ? { x: 0, y: 0, width: ctx.window.width, height: ctx.window.height }
                : contentRect(ctx.window, ctx.chrome);
            // Never larger than the box it is anchored to *minus its own margin*: a
            // float bigger than the content area would otherwise hang off the edge with
            // no way to reach it, and one that merely touched the edge would lose the
            // gap that tells the user it is floating rather than docked.
            const mx = typeof extent.margin === 'number' ? Math.max(0, extent.margin) : Math.max(0, extent.margin.x);
            const my = typeof extent.margin === 'number' ? Math.max(0, extent.margin) : Math.max(0, extent.margin.y);
            const maxWidth = Math.max(0, reference.width - mx * 2);
            const maxHeight = Math.max(0, reference.height - my * 2);
            const width = Math.min(Math.max(0, extent.size.width), maxWidth);
            const height = Math.min(Math.max(0, extent.size.height), maxHeight);
            const left = reference.x + mx;
            const right = reference.x + reference.width - width - mx;
            const top = reference.y + my;
            const bottom = reference.y + reference.height - height - my;
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
