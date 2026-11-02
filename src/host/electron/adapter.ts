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
import type { ActualState, ActualView, ActualWindow } from '../../actual/state.ts';
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
  getContentBounds(): { x: number; y: number; width: number; height: number };
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
  readonly webContents: { isDestroyed(): boolean; close(): void };
}

/** Per-window bookkeeping. */
interface WindowRecord {
  readonly kind: WindowKind;
  readonly window: ElectronBaseWindow;
  readonly views: Map<ViewId, ElectronWebContentsView>;
  /** Set while we are the ones closing it, so the OS closed event is quiet. */
  closing: boolean;
}

/**
 * The adapter.
 *
 * One instance per app. It owns the id-to-host-object maps, which is what keeps
 * the tree free of host handles and therefore serializable.
 */
export class ElectronAdapter implements HostAdapter {
  readonly #options: ElectronAdapterOptions;
  readonly #windows = new Map<WindowId, WindowRecord>();
  /** Views created but not yet attached, keyed by window. */
  readonly #pending = new Map<WindowId, Map<ViewId, ElectronWebContentsView>>();
  /** Windows the host considers fit to show. */
  readonly #ready = new Set<WindowId>();

  constructor(options: ElectronAdapterOptions) {
    this.#options = options;
  }

  // ---- windows ------------------------------------------------------------

  createWindow(spec: {
    id: WindowId;
    kind: WindowKind;
    size: Size;
    minSize: Size | null;
  }): HostWindowHandle {
    const existing = this.#windows.get(spec.id);
    if (existing !== undefined) return { id: spec.id };

    const base = this.#options.electron.BaseWindow;
    const options: Record<string, unknown> = {
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

    const record: WindowRecord = {
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

  destroyWindow(id: WindowId): void {
    const record = this.#windows.get(id);
    if (record === undefined) return;
    record.closing = true;
    this.#windows.delete(id);
    this.#pending.delete(id);
    this.#ready.delete(id);
    for (const view of record.views.values()) this.#destroyViewObject(view);
    record.views.clear();
    try {
      record.window.removeAllListeners();
      if (!record.window.isDestroyed()) record.window.destroy();
    } catch {
      // The window is already gone; there is nothing to destroy and nothing to
      // report. This is the normal case during app shutdown.
    }
  }

  setWindowSize(id: WindowId, size: Size): void {
    const record = this.#windows.get(id);
    if (record === undefined) return;
    const [width, height] = record.window.getContentSize();
    if (width === size.width && height === size.height) return;
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
  showWindow(id: WindowId, kind: WindowKind): void {
    const record = this.#windows.get(id);
    if (record === undefined) return;
    const window = record.window;
    if (window.isDestroyed()) return;
    if (window.isMinimized()) {
      window.restore();
      return;
    }
    if (window.isVisible()) return;
    if (kind === 'float') window.showInactive();
    else window.show();
  }

  hideWindow(id: WindowId): void {
    const record = this.#windows.get(id);
    if (record === undefined) return;
    const window = record.window;
    if (window.isDestroyed() || !window.isVisible()) return;
    window.hide();
  }

  focusWindow(id: WindowId): void {
    const record = this.#windows.get(id);
    if (record === undefined) return;
    const window = record.window;
    if (window.isDestroyed() || window.isFocused()) return;
    window.focus();
  }

  // ---- views --------------------------------------------------------------

  createView(window: WindowId, view: ViewId): void {
    const record = this.#windows.get(window);
    if (record === undefined) return;
    if (record.views.has(view)) return;
    const created = this.#options.views.create(window, view);
    let pending = this.#pending.get(window);
    if (pending === undefined) {
      pending = new Map();
      this.#pending.set(window, pending);
    }
    pending.set(view, created);
  }

  destroyView(window: WindowId, view: ViewId): void {
    const record = this.#windows.get(window);
    const pending = this.#pending.get(window);
    const created = pending?.get(view);
    if (created !== undefined) {
      pending?.delete(view);
      this.#destroyViewObject(created);
      return;
    }
    const attached = record?.views.get(view);
    if (attached === undefined) return;
    record?.views.delete(view);
    try {
      record?.window.contentView.removeChildView(attached);
    } catch {
      // already detached
    }
    this.#destroyViewObject(attached);
  }

  attachView(window: WindowId, view: ViewId, index: number): void {
    const record = this.#windows.get(window);
    if (record === undefined) return;
    const pending = this.#pending.get(window);
    const created = pending?.get(view);
    if (created === undefined) {
      // Already attached: attach means make sure it is attached at this index.
      if (record.views.has(view)) this.orderView(window, view, index);
      return;
    }
    pending?.delete(view);
    record.views.set(view, created);
    this.#insert(record, created, index);
  }

  detachView(window: WindowId, view: ViewId): void {
    const record = this.#windows.get(window);
    if (record === undefined) return;
    const attached = record.views.get(view);
    if (attached === undefined) return;
    record.views.delete(view);
    try {
      record.window.contentView.removeChildView(attached);
    } catch {
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
  orderView(window: WindowId, view: ViewId, index: number): void {
    const record = this.#windows.get(window);
    if (record === undefined) return;
    const target = record.views.get(view);
    if (target === undefined) return;
    const children = record.window.contentView.children;
    const current = children.indexOf(target);
    const clamped = Math.max(0, Math.min(index, children.length - 1));
    if (current === clamped) return;
    this.#insert(record, target, clamped);
  }

  setViewBounds(window: WindowId, view: ViewId, bounds: Rect): void {
    const record = this.#windows.get(window);
    const target = record?.views.get(view) ?? this.#pending.get(window)?.get(view);
    if (target === undefined) return;
    const have = target.getBounds();
    if (
      have.x === bounds.x &&
      have.y === bounds.y &&
      have.width === bounds.width &&
      have.height === bounds.height
    ) {
      return;
    }
    target.setBounds(bounds);
  }

  setViewVisible(window: WindowId, view: ViewId, visible: boolean): void {
    const record = this.#windows.get(window);
    const target = record?.views.get(view) ?? this.#pending.get(window)?.get(view);
    if (target === undefined) return;
    if (target.getVisible() === visible) return;
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
  snapshot(): ActualState {
    const windows = new Map<WindowId, ActualWindow>();
    for (const [id, record] of this.#windows) {
      const window = record.window;
      if (window.isDestroyed()) continue;
      const [width, height] = window.getContentSize();
      const bounds = window.getContentBounds();
      const byObject = new Map<ElectronWebContentsView, ViewId>();
      for (const [viewId, view] of record.views) byObject.set(view, viewId);
      const views: ActualView[] = [];
      for (const view of window.contentView.children) {
        const viewId = byObject.get(view);
        if (viewId === undefined) continue;
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
  #insert(record: WindowRecord, view: ElectronWebContentsView, index: number): void {
    const contentView = record.window.contentView;
    if (contentView.children.indexOf(view) !== -1) contentView.removeChildView(view);
    const siblings = contentView.children.slice();
    const clamped = Math.max(0, Math.min(index, siblings.length));
    contentView.addChildView(view);
    for (let i = clamped; i < siblings.length; i += 1) {
      const sibling = siblings[i];
      if (sibling !== undefined) contentView.addChildView(sibling);
    }
  }

  #destroyViewObject(view: ElectronWebContentsView): void {
    try {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    } catch {
      // The contents are already gone.
    }
  }

  #listen(id: WindowId, record: WindowRecord): void {
    const emit = (fact: string): void => {
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
