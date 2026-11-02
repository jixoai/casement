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
import type { ActualState, ActualView, ActualWindow } from '../actual/state.ts';
import type { Rect, Size, ViewId, WindowId, WindowKind } from '../types.ts';

/** A window as the fake host holds it. */
export interface MemoryWindow {
  id: WindowId;
  kind: WindowKind;
  size: Size;
  minSize: Size | null;
  position: { x: number; y: number };
  visible: boolean;
  minimized: boolean;
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
  /** View ids in stacking order, bottom first. */
  order: ViewId[];
  views: Map<ViewId, { bounds: Rect; visible: boolean }>;
}

/** Every mutation the fake host saw, in order. Assertions use this. */
export type MemoryCall =
  | { readonly call: 'createWindow'; readonly id: WindowId; readonly size: Size }
  | { readonly call: 'destroyWindow'; readonly id: WindowId }
  | { readonly call: 'setWindowSize'; readonly id: WindowId; readonly size: Size }
  | { readonly call: 'showWindow'; readonly id: WindowId }
  | { readonly call: 'hideWindow'; readonly id: WindowId }
  | { readonly call: 'focusWindow'; readonly id: WindowId }
  | { readonly call: 'createView'; readonly window: WindowId; readonly view: ViewId }
  | { readonly call: 'destroyView'; readonly window: WindowId; readonly view: ViewId }
  | { readonly call: 'attachView'; readonly window: WindowId; readonly view: ViewId }
  | { readonly call: 'detachView'; readonly window: WindowId; readonly view: ViewId }
  | { readonly call: 'orderView'; readonly window: WindowId; readonly view: ViewId; readonly index: number }
  | { readonly call: 'setViewBounds'; readonly window: WindowId; readonly view: ViewId; readonly bounds: Rect }
  | { readonly call: 'setViewVisible'; readonly window: WindowId; readonly view: ViewId; readonly visible: boolean };

/** The fake host. */
export class MemoryAdapter implements HostAdapter {
  readonly windows = new Map<WindowId, MemoryWindow>();
  readonly calls: MemoryCall[] = [];
  /** Set to make the host refuse to reach the target, for loop-cap tests. */
  ignoreSizes = false;
  /** Windows the host reports as existing but not yet fit to show. */
  readonly notReady = new Set<WindowId>();

  createWindow(spec: {
    id: WindowId;
    kind: WindowKind;
    size: Size;
    minSize: Size | null;
  }): HostWindowHandle {
    if (this.windows.has(spec.id)) return { id: spec.id };
    this.calls.push({ call: 'createWindow', id: spec.id, size: spec.size });
    this.windows.set(spec.id, {
      id: spec.id,
      kind: spec.kind,
      size: spec.size,
      minSize: spec.minSize,
      position: { x: 0, y: 0 },
      visible: false,
      minimized: false,
      maximized: false,
      fullscreen: false,
      focused: false,
      order: [],
      views: new Map(),
    });
    return { id: spec.id };
  }

  destroyWindow(id: WindowId): void {
    if (!this.windows.has(id)) return;
    this.calls.push({ call: 'destroyWindow', id });
    this.windows.delete(id);
  }

  setWindowSize(id: WindowId, size: Size): void {
    const window = this.windows.get(id);
    if (window === undefined) return;
    this.calls.push({ call: 'setWindowSize', id, size });
    if (this.ignoreSizes) return;
    window.size = size;
  }

  showWindow(id: WindowId): void {
    const window = this.windows.get(id);
    if (window === undefined) return;
    if (window.visible && !window.minimized) return;
    this.calls.push({ call: 'showWindow', id });
    window.visible = true;
    window.minimized = false;
  }

  hideWindow(id: WindowId): void {
    const window = this.windows.get(id);
    if (window === undefined) return;
    if (!window.visible) return;
    this.calls.push({ call: 'hideWindow', id });
    window.visible = false;
  }

  focusWindow(id: WindowId): void {
    const window = this.windows.get(id);
    if (window === undefined) return;
    this.calls.push({ call: 'focusWindow', id });
    for (const other of this.windows.values()) other.focused = false;
    window.focused = true;
  }

  createView(window: WindowId, view: ViewId): void {
    const target = this.windows.get(window);
    if (target === undefined) return;
    if (target.views.has(view)) return;
    this.calls.push({ call: 'createView', window, view });
    target.views.set(view, { bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: true });
  }

  destroyView(window: WindowId, view: ViewId): void {
    const target = this.windows.get(window);
    if (target === undefined) return;
    if (!target.views.has(view)) return;
    this.calls.push({ call: 'destroyView', window, view });
    target.views.delete(view);
    target.order = target.order.filter((v) => v !== view);
  }

  attachView(window: WindowId, view: ViewId, index: number): void {
    const target = this.windows.get(window);
    if (target === undefined) return;
    this.calls.push({ call: 'attachView', window, view });
    target.order = target.order.filter((v) => v !== view);
    const at = Math.max(0, Math.min(index, target.order.length));
    target.order.splice(at, 0, view);
  }

  detachView(window: WindowId, view: ViewId): void {
    const target = this.windows.get(window);
    if (target === undefined) return;
    this.calls.push({ call: 'detachView', window, view });
    target.order = target.order.filter((v) => v !== view);
  }

  orderView(window: WindowId, view: ViewId, index: number): void {
    const target = this.windows.get(window);
    if (target === undefined) return;
    if (!target.views.has(view)) return;
    this.calls.push({ call: 'orderView', window, view, index });
    target.order = target.order.filter((v) => v !== view);
    const at = Math.max(0, Math.min(index, target.order.length));
    target.order.splice(at, 0, view);
  }

  setViewBounds(window: WindowId, view: ViewId, bounds: Rect): void {
    const target = this.windows.get(window);
    const entry = target?.views.get(view);
    if (target === undefined || entry === undefined) return;
    this.calls.push({ call: 'setViewBounds', window, view, bounds });
    entry.bounds = bounds;
  }

  setViewVisible(window: WindowId, view: ViewId, visible: boolean): void {
    const target = this.windows.get(window);
    const entry = target?.views.get(view);
    if (target === undefined || entry === undefined) return;
    this.calls.push({ call: 'setViewVisible', window, view, visible });
    entry.visible = visible;
  }

  snapshot(): ActualState {
    const windows = new Map<WindowId, ActualWindow>();
    for (const [id, window] of this.windows) {
      const views: ActualView[] = [];
      for (const viewId of window.order) {
        const entry = window.views.get(viewId);
        if (entry === undefined) continue;
        views.push({ id: viewId, bounds: entry.bounds, visible: entry.visible });
      }
      windows.set(id, {
        id,
        kind: window.kind,
        size: window.size,
        position: window.position,
        visible: window.visible,
        minimized: window.minimized,
        maximized: window.maximized,
        fullscreen: window.fullscreen,
        focused: window.focused,
        // The fake host has no content to load, so a window is ready the moment
        // it exists. Tests that need the creating phase add to notReady.
        ready: !this.notReady.has(id),
        views,
      });
    }
    return { windows };
  }

  /** Clear the recorded calls, so a test can assert on one pass. */
  clearCalls(): void {
    this.calls.length = 0;
  }
}
