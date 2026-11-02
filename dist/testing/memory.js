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
/** The fake host. */
export class MemoryAdapter {
    windows = new Map();
    calls = [];
    /** Set to make the host refuse to reach the target, for loop-cap tests. */
    ignoreSizes = false;
    /** Windows the host reports as existing but not yet fit to show. */
    notReady = new Set();
    createWindow(spec) {
        if (this.windows.has(spec.id))
            return { id: spec.id };
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
    destroyWindow(id) {
        if (!this.windows.has(id))
            return;
        this.calls.push({ call: 'destroyWindow', id });
        this.windows.delete(id);
    }
    setWindowSize(id, size) {
        const window = this.windows.get(id);
        if (window === undefined)
            return;
        this.calls.push({ call: 'setWindowSize', id, size });
        if (this.ignoreSizes)
            return;
        window.size = size;
    }
    showWindow(id) {
        const window = this.windows.get(id);
        if (window === undefined)
            return;
        if (window.visible && !window.minimized)
            return;
        this.calls.push({ call: 'showWindow', id });
        window.visible = true;
        window.minimized = false;
    }
    hideWindow(id) {
        const window = this.windows.get(id);
        if (window === undefined)
            return;
        if (!window.visible)
            return;
        this.calls.push({ call: 'hideWindow', id });
        window.visible = false;
    }
    focusWindow(id) {
        const window = this.windows.get(id);
        if (window === undefined)
            return;
        this.calls.push({ call: 'focusWindow', id });
        for (const other of this.windows.values())
            other.focused = false;
        window.focused = true;
    }
    createView(window, view) {
        const target = this.windows.get(window);
        if (target === undefined)
            return;
        if (target.views.has(view))
            return;
        this.calls.push({ call: 'createView', window, view });
        target.views.set(view, { bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: true });
    }
    destroyView(window, view) {
        const target = this.windows.get(window);
        if (target === undefined)
            return;
        if (!target.views.has(view))
            return;
        this.calls.push({ call: 'destroyView', window, view });
        target.views.delete(view);
        target.order = target.order.filter((v) => v !== view);
    }
    attachView(window, view, index) {
        const target = this.windows.get(window);
        if (target === undefined)
            return;
        this.calls.push({ call: 'attachView', window, view });
        target.order = target.order.filter((v) => v !== view);
        const at = Math.max(0, Math.min(index, target.order.length));
        target.order.splice(at, 0, view);
    }
    detachView(window, view) {
        const target = this.windows.get(window);
        if (target === undefined)
            return;
        this.calls.push({ call: 'detachView', window, view });
        target.order = target.order.filter((v) => v !== view);
    }
    orderView(window, view, index) {
        const target = this.windows.get(window);
        if (target === undefined)
            return;
        if (!target.views.has(view))
            return;
        this.calls.push({ call: 'orderView', window, view, index });
        target.order = target.order.filter((v) => v !== view);
        const at = Math.max(0, Math.min(index, target.order.length));
        target.order.splice(at, 0, view);
    }
    setViewBounds(window, view, bounds) {
        const target = this.windows.get(window);
        const entry = target?.views.get(view);
        if (target === undefined || entry === undefined)
            return;
        this.calls.push({ call: 'setViewBounds', window, view, bounds });
        entry.bounds = bounds;
    }
    setViewVisible(window, view, visible) {
        const target = this.windows.get(window);
        const entry = target?.views.get(view);
        if (target === undefined || entry === undefined)
            return;
        this.calls.push({ call: 'setViewVisible', window, view, visible });
        entry.visible = visible;
    }
    snapshot() {
        const windows = new Map();
        for (const [id, window] of this.windows) {
            const views = [];
            for (const viewId of window.order) {
                const entry = window.views.get(viewId);
                if (entry === undefined)
                    continue;
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
    clearCalls() {
        this.calls.length = 0;
    }
}
