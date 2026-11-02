/**
 * The vocabulary of changes.
 *
 * An op is a description of one mutation, not the mutation. Keeping them as
 * values means the diff can be tested by comparing lists, the loop can log what
 * it was about to do, and the single commit path has one exhaustive switch to
 * implement — so "which code is allowed to move a window" is answered by the
 * type system rather than by a code review.
 */
import type { Rect, Size, ViewId, WindowId, WindowKind } from '../types.ts';
/** Create a host window. */
export interface CreateWindowOp {
    readonly op: 'createWindow';
    readonly id: WindowId;
    readonly kind: WindowKind;
    readonly size: Size;
    readonly minSize: Size | null;
}
/** Destroy a host window and everything it owns. */
export interface DestroyWindowOp {
    readonly op: 'destroyWindow';
    readonly id: WindowId;
}
/** Resize a window's content area. */
export interface SetWindowSizeOp {
    readonly op: 'setWindowSize';
    readonly id: WindowId;
    readonly size: Size;
}
/** Put a window on screen. */
export interface ShowWindowOp {
    readonly op: 'showWindow';
    readonly id: WindowId;
    readonly kind: WindowKind;
}
/** Take a window off screen without destroying it. */
export interface HideWindowOp {
    readonly op: 'hideWindow';
    readonly id: WindowId;
}
/** Create a view and load it. */
export interface CreateViewOp {
    readonly op: 'createView';
    readonly window: WindowId;
    readonly view: ViewId;
}
/** Destroy a view. */
export interface DestroyViewOp {
    readonly op: 'destroyView';
    readonly window: WindowId;
    readonly view: ViewId;
}
/** Move a view to a position in the window's stacking order. */
export interface OrderViewOp {
    readonly op: 'orderView';
    readonly window: WindowId;
    readonly view: ViewId;
    /** Target index, counting from the bottom. */
    readonly index: number;
}
/** Attach a view to a window at an index. */
export interface AttachViewOp {
    readonly op: 'attachView';
    readonly window: WindowId;
    readonly view: ViewId;
    readonly index: number;
}
/** Detach a view from its window. */
export interface DetachViewOp {
    readonly op: 'detachView';
    readonly window: WindowId;
    readonly view: ViewId;
}
/** Move/resize a view. */
export interface SetViewBoundsOp {
    readonly op: 'setViewBounds';
    readonly window: WindowId;
    readonly view: ViewId;
    readonly bounds: Rect;
}
/** Show or hide a view without changing its bounds. */
export interface SetViewVisibleOp {
    readonly op: 'setViewVisible';
    readonly window: WindowId;
    readonly view: ViewId;
    readonly visible: boolean;
}
/**
 * Ask the host to focus a window.
 *
 * Focus is here because it has to be *somewhere*, but note that it carries a
 * sequence number and is produced from a request counter, not from state. See
 * reconcile/focus.ts for why it cannot be a boolean.
 */
export interface FocusWindowOp {
    readonly op: 'focusWindow';
    readonly id: WindowId;
    readonly seq: number;
}
/** Every op. */
export type Op = CreateWindowOp | DestroyWindowOp | SetWindowSizeOp | ShowWindowOp | HideWindowOp | CreateViewOp | DestroyViewOp | OrderViewOp | AttachViewOp | DetachViewOp | SetViewBoundsOp | SetViewVisibleOp | FocusWindowOp;
/** A one-line description, for logs and test failure messages. */
export declare function describeOp(op: Op): string;
