/**
 * The Electron adapter — the only code in casement that mutates a window.
 *
 * Every call here corresponds to exactly one op, and every method is written to
 * be *idempotent and total*: calling it for a window that is already gone, or
 * twice for the same value, does nothing rather than throwing. That is not
 * defensive habit, it is a requirement of the design — the reconcile loop
 * re-reads and re-applies, and it also runs from OS events, so a call can
 * legitimately race a window the user just closed. Making the adapter tolerate
 * that is cheaper and far more predictable than making every caller guard.
 *
 * Three Electron-specific facts are load-bearing here:
 *
 * - BaseWindow has no webContents, and WebContentsView is not a window. Views
 *   are added to win.contentView, which is the root of a view tree the OS
 *   composites. So z-order is contentView.children order, and the only way to
 *   change it is add/remove.
 *
 * - addChildView on an already-attached view *moves it to the end*. That is what
 *   makes ordering possible without detaching (and detaching a WebContentsView
 *   can drop its input focus and flash its content), but it also means a single
 *   misplaced addChildView silently reorders the stack. The adapter never calls
 *   it for ordering except through orderView, which is index-exact.
 *
 * - setVisible on a view and a zero-area setBounds are different things. A
 *   zero-area view still exists and still renders for capturePage; a hidden view
 *   does not. Background tabs need the first (so a thumbnail pump keeps getting
 *   frames) and overlays need the second.
 */
import type { HostAdapter, HostWindowHandle } from '../adapter.ts';
import type { ActualState } from '../../actual/state.ts';
import type { Rect, Size, ViewId, WindowId, WindowKind } from '../../types.ts';
/** What the adapter needs to construct a view. Supplied by the app. */
export interface ViewFactory {
    /**
     * Build a WebContentsView for a layer.
     *
     * The app owns this because only it knows what to load, which preload to use,
     * and which session partition a view belongs to. The adapter owns *when*.
     */
    create(window: WindowId, view: ViewId): ElectronWebContentsView;
}
/** Options for the Electron adapter. */
export interface ElectronAdapterOptions {
    /** The electron module. Injected so tests can supply a fake. */
    readonly electron: ElectronLike;
    /** How to build views. */
    readonly views: ViewFactory;
    /** Called when the OS closes a window the user closed (not one we destroyed). */
    readonly onClosedByOs?: (window: WindowId) => void;
    /**
     * Called for every OS fact, with the fact's name. The app consults policyFor —
     * casement does not act on events itself, because acting on them is how a
     * model starts fighting the user.
     */
    readonly onOsEvent?: (window: WindowId, fact: string) => void;
}
/**
 * The slice of electron this adapter uses.
 *
 * Narrow on purpose: it documents exactly which host API casement depends on
 * (so an Electron upgrade has a checklist), and it lets the adapter be tested
 * against a fake with no Electron binary present.
 */
export interface ElectronLike {
    readonly BaseWindow: new (options: Record<string, unknown>) => ElectronBaseWindow;
    readonly WebContentsView: new (options: Record<string, unknown>) => ElectronWebContentsView;
}
/** The BaseWindow methods used. */
export interface ElectronBaseWindow {
    getContentSize(): [number, number];
    setContentSize(width: number, height: number): void;
    setMinimumSize(width: number, height: number): void;
    getContentBounds(): {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    isVisible(): boolean;
    isMinimized(): boolean;
    isMaximized(): boolean;
    isFullScreen(): boolean;
    isFocused(): boolean;
    isDestroyed(): boolean;
    show(): void;
    showInactive(): void;
    hide(): void;
    focus(): void;
    restore(): void;
    destroy(): void;
    readonly contentView: ElectronContentView;
    on(event: string, listener: (...args: unknown[]) => void): void;
    removeAllListeners(): void;
}
/** The View surface contentView exposes. */
export interface ElectronContentView {
    readonly children: ElectronWebContentsView[];
    addChildView(view: ElectronWebContentsView, index?: number): void;
    removeChildView(view: ElectronWebContentsView): void;
}
/** The WebContentsView methods used. */
export interface ElectronWebContentsView {
    setBounds(bounds: Rect): void;
    getBounds(): Rect;
    setVisible(visible: boolean): void;
    getVisible(): boolean;
    readonly webContents: {
        isDestroyed(): boolean;
        close(): void;
    };
}
/**
 * The adapter.
 *
 * One instance per app. It owns the id-to-host-object maps, which is what keeps
 * the tree free of host handles and therefore serializable.
 */
export declare class ElectronAdapter implements HostAdapter {
    #private;
    constructor(options: ElectronAdapterOptions);
    createWindow(spec: {
        id: WindowId;
        kind: WindowKind;
        size: Size;
        minSize: Size | null;
    }): HostWindowHandle;
    destroyWindow(id: WindowId): void;
    setWindowSize(id: WindowId, size: Size): void;
    /**
     * Show a window.
     *
     * Two distinctions matter and are easy to lose:
     *
     * - A float is shown *inactive*. It is a panel the app opened next to the
     *   user's work; taking their keyboard away to show it is the behaviour the
     *   whole design is trying to avoid.
     * - A minimized window is *restored*, not shown. show() on a minimized window
     *   is a no-op on some platforms, which would leave the tree saying visible
     *   while the screen disagreed, and the loop would try forever.
     */
    showWindow(id: WindowId, kind: WindowKind): void;
    hideWindow(id: WindowId): void;
    focusWindow(id: WindowId): void;
    createView(window: WindowId, view: ViewId): void;
    destroyView(window: WindowId, view: ViewId): void;
    attachView(window: WindowId, view: ViewId, index: number): void;
    detachView(window: WindowId, view: ViewId): void;
    /**
     * Move a view to an absolute index.
     *
     * Implemented as remove-then-insert because addChildView(view, index) is not
     * available on every Electron version casement supports, and because the
     * remove/insert pair is exactly the semantics we want: the view ends up at
     * index, not merely at least as high as it.
     */
    orderView(window: WindowId, view: ViewId, index: number): void;
    setViewBounds(window: WindowId, view: ViewId, bounds: Rect): void;
    setViewVisible(window: WindowId, view: ViewId, visible: boolean): void;
    /**
     * Read the screen.
     *
     * Every field comes from a real query. There is no cached model to go stale —
     * that is the whole point of this method existing at all (see
     * actual/state.ts), and it is why an OS event can be ignored as *truth* while
     * still being useful as a *trigger* to run the loop again.
     */
    snapshot(): ActualState;
}
