/**
 * What is actually on screen — a cache with one rule: refresh by asking.
 *
 * The tempting design is to keep this in sync from events. It does not work.
 * Electron does not emit an event for every change: a view's bounds can move
 * without a notification, a window can be resized by a tiling script that says
 * nothing, and a `show` we caused ourselves arrives back as an OS event that
 * looks exactly like a user's. A model fed only by events drifts, and a model
 * that has drifted produces oscillation — reconcile says "show", the stale copy
 * says "hidden", reconcile says "show" again.
 *
 * So: this is a cache, and the only way to trust it is to re-read it. `refresh`
 * asks the host. The reconcile loop asks before every diff, which is what makes
 * convergence a property of the loop rather than a hope about events.
 *
 * Events are still used — but for *policy*, not for truth. See reconcile/policy.
 */
import type { Rect, Size, ViewId, WindowId, WindowKind } from '../types.ts';
/** One view as the host reports it. */
export interface ActualView {
    readonly id: ViewId;
    readonly bounds: Rect;
    readonly visible: boolean;
}
/** One window as the host reports it. */
export interface ActualWindow {
    readonly id: WindowId;
    readonly kind: WindowKind;
    /** The content area the window really has. */
    readonly size: Size;
    /** Where the window is. The OS owns this; we only report it. */
    readonly position: {
        readonly x: number;
        readonly y: number;
    };
    readonly visible: boolean;
    readonly minimized: boolean;
    readonly maximized: boolean;
    readonly fullscreen: boolean;
    readonly focused: boolean;
    /**
     * Whether the window is fit to be shown.
     *
     * Creating an OS window and being able to display it are different moments:
     * Electron's BaseWindow exists immediately, but a window whose content has not
     * loaded would show as a blank rectangle. The host answers this, so the tree
     * never has to guess — see the creating→ready phase in the reconcile loop.
     */
    readonly ready: boolean;
    /** Views in the order the host actually stacks them, bottom first. */
    readonly views: readonly ActualView[];
}
/** The whole actual state. */
export interface ActualState {
    readonly windows: ReadonlyMap<WindowId, ActualWindow>;
}
/** An empty actual state — a process that has not opened a window yet. */
export declare const EMPTY_ACTUAL: ActualState;
/**
 * What the loop needs from a host in order to see the screen.
 *
 * Deliberately tiny and deliberately *query-shaped*: there is no subscription
 * here, because a subscription cannot answer "what is true right now".
 */
export interface ActualSource {
    /**
     * Read every window this renderer owns, right now.
     *
     * Must be a real query against the host, not a cached copy — that is the
     * entire point of this interface.
     */
    snapshot(): ActualState;
}
