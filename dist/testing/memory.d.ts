/**
 * An in-memory host.
 *
 * This is the point of the pure-core design: the whole convergence loop runs
 * here, with no Electron and no display, and the tests assert on the resulting
 * screen. It is also useful to an app author writing unit tests for a window
 * layout, which is why it is a published entry point rather than a test file.
 *
 * It is deliberately faithful about the things that cause bugs: a window is
 * only visible after show(), a minimized window is not visible, and z-order is
 * a real array whose order the adapter changes.
 */
import type { HostAdapter, HostWindowHandle } from '../host/adapter.ts';
import type { ActualState } from '../actual/state.ts';
import type { Rect, Size, ViewId, WindowId, WindowKind } from '../types.ts';
/** A window as the fake host holds it. */
export interface MemoryWindow {
    id: WindowId;
    kind: WindowKind;
    size: Size;
    minSize: Size | null;
    position: {
        x: number;
        y: number;
    };
    visible: boolean;
    minimized: boolean;
    maximized: boolean;
    fullscreen: boolean;
    focused: boolean;
    /** View ids in stacking order, bottom first. */
    order: ViewId[];
    views: Map<ViewId, {
        bounds: Rect;
        visible: boolean;
    }>;
}
/** Every mutation the fake host saw, in order. Assertions use this. */
export type MemoryCall = {
    readonly call: 'createWindow';
    readonly id: WindowId;
    readonly size: Size;
} | {
    readonly call: 'destroyWindow';
    readonly id: WindowId;
} | {
    readonly call: 'setWindowSize';
    readonly id: WindowId;
    readonly size: Size;
} | {
    readonly call: 'showWindow';
    readonly id: WindowId;
} | {
    readonly call: 'hideWindow';
    readonly id: WindowId;
} | {
    readonly call: 'focusWindow';
    readonly id: WindowId;
} | {
    readonly call: 'createView';
    readonly window: WindowId;
    readonly view: ViewId;
} | {
    readonly call: 'destroyView';
    readonly window: WindowId;
    readonly view: ViewId;
} | {
    readonly call: 'attachView';
    readonly window: WindowId;
    readonly view: ViewId;
} | {
    readonly call: 'detachView';
    readonly window: WindowId;
    readonly view: ViewId;
} | {
    readonly call: 'orderView';
    readonly window: WindowId;
    readonly view: ViewId;
    readonly index: number;
} | {
    readonly call: 'setViewBounds';
    readonly window: WindowId;
    readonly view: ViewId;
    readonly bounds: Rect;
} | {
    readonly call: 'setViewVisible';
    readonly window: WindowId;
    readonly view: ViewId;
    readonly visible: boolean;
};
/** The fake host. */
export declare class MemoryAdapter implements HostAdapter {
    readonly windows: Map<string, MemoryWindow>;
    readonly calls: MemoryCall[];
    /** Set to make the host refuse to reach the target, for loop-cap tests. */
    ignoreSizes: boolean;
    /** Windows the host reports as existing but not yet fit to show. */
    readonly notReady: Set<string>;
    createWindow(spec: {
        id: WindowId;
        kind: WindowKind;
        size: Size;
        minSize: Size | null;
    }): HostWindowHandle;
    destroyWindow(id: WindowId): void;
    setWindowSize(id: WindowId, size: Size): void;
    showWindow(id: WindowId): void;
    hideWindow(id: WindowId): void;
    focusWindow(id: WindowId): void;
    createView(window: WindowId, view: ViewId): void;
    destroyView(window: WindowId, view: ViewId): void;
    attachView(window: WindowId, view: ViewId, index: number): void;
    detachView(window: WindowId, view: ViewId): void;
    orderView(window: WindowId, view: ViewId, index: number): void;
    setViewBounds(window: WindowId, view: ViewId, bounds: Rect): void;
    setViewVisible(window: WindowId, view: ViewId, visible: boolean): void;
    snapshot(): ActualState;
    /** Clear the recorded calls, so a test can assert on one pass. */
    clearCalls(): void;
}
