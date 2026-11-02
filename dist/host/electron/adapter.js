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
/**
 * The adapter.
 *
 * One instance per app. It owns the id-to-host-object maps, which is what keeps
 * the tree free of host handles and therefore serializable.
 */
export class ElectronAdapter {
    #options;
    #windows = new Map();
    /** Views created but not yet attached, keyed by window. */
    #pending = new Map();
    /** Windows the host considers fit to show. */
    #ready = new Set();
    constructor(options) {
        this.#options = options;
    }
    // ---- windows ------------------------------------------------------------
    createWindow(spec) {
        const existing = this.#windows.get(spec.id);
        if (existing !== undefined)
            return { id: spec.id };
        const base = this.#options.electron.BaseWindow;
        const options = {
            width: spec.size.width,
            height: spec.size.height,
            show: false,
            frame: false,
        };
        if (spec.kind === 'float') {
            options['alwaysOnTop'] = true;
            options['skipTaskbar'] = true;
        }
        const window = new base(options);
        if (spec.minSize !== null) {
            window.setMinimumSize(spec.minSize.width, spec.minSize.height);
        }
        const record = {
            kind: spec.kind,
            window,
            views: new Map(),
            closing: false,
        };
        this.#windows.set(spec.id, record);
        this.#ready.add(spec.id);
        this.#listen(spec.id, record);
        return { id: spec.id };
    }
    destroyWindow(id) {
        const record = this.#windows.get(id);
        if (record === undefined)
            return;
        record.closing = true;
        this.#windows.delete(id);
        this.#pending.delete(id);
        this.#ready.delete(id);
        for (const view of record.views.values())
            this.#destroyViewObject(view);
        record.views.clear();
        try {
            record.window.removeAllListeners();
            if (!record.window.isDestroyed())
                record.window.destroy();
        }
        catch {
            // The window is already gone; there is nothing to destroy and nothing to
            // report. This is the normal case during app shutdown.
        }
    }
    setWindowSize(id, size) {
        const record = this.#windows.get(id);
        if (record === undefined)
            return;
        const [width, height] = record.window.getContentSize();
        if (width === size.width && height === size.height)
            return;
        record.window.setContentSize(size.width, size.height);
    }
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
    showWindow(id, kind) {
        const record = this.#windows.get(id);
        if (record === undefined)
            return;
        const window = record.window;
        if (window.isDestroyed())
            return;
        if (window.isMinimized()) {
            window.restore();
            return;
        }
        if (window.isVisible())
            return;
        if (kind === 'float')
            window.showInactive();
        else
            window.show();
    }
    hideWindow(id) {
        const record = this.#windows.get(id);
        if (record === undefined)
            return;
        const window = record.window;
        if (window.isDestroyed() || !window.isVisible())
            return;
        window.hide();
    }
    focusWindow(id) {
        const record = this.#windows.get(id);
        if (record === undefined)
            return;
        const window = record.window;
        if (window.isDestroyed() || window.isFocused())
            return;
        window.focus();
    }
    // ---- views --------------------------------------------------------------
    createView(window, view) {
        const record = this.#windows.get(window);
        if (record === undefined)
            return;
        if (record.views.has(view))
            return;
        const created = this.#options.views.create(window, view);
        let pending = this.#pending.get(window);
        if (pending === undefined) {
            pending = new Map();
            this.#pending.set(window, pending);
        }
        pending.set(view, created);
    }
    destroyView(window, view) {
        const record = this.#windows.get(window);
        const pending = this.#pending.get(window);
        const created = pending?.get(view);
        if (created !== undefined) {
            pending?.delete(view);
            this.#destroyViewObject(created);
            return;
        }
        const attached = record?.views.get(view);
        if (attached === undefined)
            return;
        record?.views.delete(view);
        try {
            record?.window.contentView.removeChildView(attached);
        }
        catch {
            // already detached
        }
        this.#destroyViewObject(attached);
    }
    attachView(window, view, index) {
        const record = this.#windows.get(window);
        if (record === undefined)
            return;
        const pending = this.#pending.get(window);
        const created = pending?.get(view);
        if (created === undefined) {
            // Already attached: attach means make sure it is attached at this index.
            if (record.views.has(view))
                this.orderView(window, view, index);
            return;
        }
        pending?.delete(view);
        record.views.set(view, created);
        this.#insert(record, created, index);
    }
    detachView(window, view) {
        const record = this.#windows.get(window);
        if (record === undefined)
            return;
        const attached = record.views.get(view);
        if (attached === undefined)
            return;
        record.views.delete(view);
        try {
            record.window.contentView.removeChildView(attached);
        }
        catch {
            // already detached
        }
    }
    /**
     * Move a view to an absolute index.
     *
     * Implemented as remove-then-insert because addChildView(view, index) is not
     * available on every Electron version casement supports, and because the
     * remove/insert pair is exactly the semantics we want: the view ends up at
     * index, not merely at least as high as it.
     */
    orderView(window, view, index) {
        const record = this.#windows.get(window);
        if (record === undefined)
            return;
        const target = record.views.get(view);
        if (target === undefined)
            return;
        const children = record.window.contentView.children;
        const current = children.indexOf(target);
        const clamped = Math.max(0, Math.min(index, children.length - 1));
        if (current === clamped)
            return;
        this.#insert(record, target, clamped);
    }
    setViewBounds(window, view, bounds) {
        const record = this.#windows.get(window);
        const target = record?.views.get(view) ?? this.#pending.get(window)?.get(view);
        if (target === undefined)
            return;
        const have = target.getBounds();
        if (have.x === bounds.x &&
            have.y === bounds.y &&
            have.width === bounds.width &&
            have.height === bounds.height) {
            return;
        }
        target.setBounds(bounds);
    }
    setViewVisible(window, view, visible) {
        const record = this.#windows.get(window);
        const target = record?.views.get(view) ?? this.#pending.get(window)?.get(view);
        if (target === undefined)
            return;
        if (target.getVisible() === visible)
            return;
        target.setVisible(visible);
    }
    // ---- reading ------------------------------------------------------------
    /**
     * Read the screen.
     *
     * Every field comes from a real query. There is no cached model to go stale —
     * that is the whole point of this method existing at all (see
     * actual/state.ts), and it is why an OS event can be ignored as *truth* while
     * still being useful as a *trigger* to run the loop again.
     */
    snapshot() {
        const windows = new Map();
        for (const [id, record] of this.#windows) {
            const window = record.window;
            if (window.isDestroyed())
                continue;
            const [width, height] = window.getContentSize();
            const bounds = window.getContentBounds();
            const byObject = new Map();
            for (const [viewId, view] of record.views)
                byObject.set(view, viewId);
            const views = [];
            for (const view of window.contentView.children) {
                const viewId = byObject.get(view);
                if (viewId === undefined)
                    continue;
                views.push({ id: viewId, bounds: view.getBounds(), visible: view.getVisible() });
            }
            windows.set(id, {
                id,
                kind: record.kind,
                size: { width, height },
                position: { x: bounds.x, y: bounds.y },
                visible: window.isVisible(),
                minimized: window.isMinimized(),
                maximized: window.isMaximized(),
                fullscreen: window.isFullScreen(),
                focused: window.isFocused(),
                // A BaseWindow is usable the instant the constructor returns, so readiness
                // is immediate. An app that wants to wait for first paint would hold the
                // window out of #ready until the view content had loaded.
                ready: this.#ready.has(id),
                views,
            });
        }
        return { windows };
    }
    // ---- internals ----------------------------------------------------------
    /**
     * Put a view at an absolute index in contentView.children.
     *
     * Electron only appends, so an index-exact insert is: remove it (wherever it
     * is), then append it, then re-append everything that must sit above it in
     * order. The last step is what makes the result index-exact rather than
     * merely on top.
     */
    #insert(record, view, index) {
        const contentView = record.window.contentView;
        if (contentView.children.indexOf(view) !== -1)
            contentView.removeChildView(view);
        const siblings = contentView.children.slice();
        const clamped = Math.max(0, Math.min(index, siblings.length));
        contentView.addChildView(view);
        for (let i = clamped; i < siblings.length; i += 1) {
            const sibling = siblings[i];
            if (sibling !== undefined)
                contentView.addChildView(sibling);
        }
    }
    #destroyViewObject(view) {
        try {
            if (!view.webContents.isDestroyed())
                view.webContents.close();
        }
        catch {
            // The contents are already gone.
        }
    }
    #listen(id, record) {
        const emit = (fact) => {
            this.#options.onOsEvent?.(id, fact);
        };
        for (const fact of [
            'moved',
            'resized',
            'minimize',
            'restore',
            'maximize',
            'unmaximize',
            'enter-full-screen',
            'leave-full-screen',
            'show',
            'hide',
            'focus',
            'blur',
        ]) {
            record.window.on(fact, () => emit(fact));
        }
        record.window.on('closed', () => {
            const wasClosing = record.closing;
            this.#windows.delete(id);
            this.#pending.delete(id);
            if (!wasClosing) {
                emit('closed');
                this.#options.onClosedByOs?.(id);
            }
        });
    }
}
