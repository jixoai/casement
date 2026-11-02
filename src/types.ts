/**
 * Vocabulary shared by every layer of casement.
 *
 * Nothing in this file knows what a window manager is. The same names are used
 * by the pure planner, by the diff, and by the host adapter, which is what lets
 * the first two be tested without an OS underneath them.
 */

/**
 * Who asked for a value.
 *
 * This is *data*, not a permission system: casement never refuses a write and
 * has no policy table. Recording the author is enough to answer the only
 * question that actually came up in practice — "did a human ask for this, or
 * did an agent ask for it while doing something else?" — without inventing a
 * concept to answer it.
 */
export type Owner = 'human' | 'agent';

/**
 * A value together with the author of the most recent write.
 *
 * `at` is a monotonic stamp from the writer's clock. It exists so that two
 * claims can be ordered when diagnosing a problem, and so a caller can tell a
 * fresh claim from a stale one. Nothing in casement compares claims to decide
 * who wins: there is exactly one slot per field, and the last write is the
 * value. "Who may write" is not modelled at all — see DESIGN.md.
 */
export interface Claim<T> {
  readonly owner: Owner;
  readonly value: T;
  readonly at: number;
}

/** A rectangle in device-independent pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A width/height pair. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Identity of a window. Stable for the life of the window; chosen by the app. */
export type WindowId = string;

/** Identity of a view (one WebContentsView on Electron). */
export type ViewId = string;

/**
 * What a window is for. Carried through to the host so that an adapter can make
 * host-specific choices (a `float` never takes focus on show, for instance)
 * without the app having to restate it at every call site.
 */
export type WindowKind = 'profile' | 'space' | 'settings' | 'float' | 'panel';

/**
 * Where a window is in its life.
 *
 * `createInstance` in a React renderer is synchronous and may run for work that
 * is then thrown away, while creating a real OS window is neither cheap nor
 * reversible. The phase is the explicit gap between the two: a node is born
 * `pending`, the adapter reports `creating` when it has a host window that is
 * not yet fit to show, and `ready` once it is. Only `ready` windows are ever
 * shown — which is what stops a window flashing at the wrong size before its
 * content has loaded.
 */
export type WindowPhase = 'pending' | 'creating' | 'ready' | 'closing' | 'closed';

/** How a layer is sized. This is the *reason*; the pixels are derived. */
export type Extent =
  /** The whole content area of the window. */
  | { readonly kind: 'fill' }
  /** Everything below the chrome bar: `{ x: 0, y: chromeHeight, w, h - chromeHeight }`. */
  | { readonly kind: 'content' }
  /** The chrome bar itself, from the top of the content area down to its own height. */
  | { readonly kind: 'chrome' }
  /** Anchored to a corner of a reference box, with a margin and a fixed size. */
  | {
      readonly kind: 'anchored';
      readonly corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
      /**
       * Gap between the float and the edge it is anchored to.
       *
       * A single number for the symmetric case; `{ x, y }` when the design wants
       * different gaps on each axis. That asymmetry is not hypothetical — the
       * browser's own floats sit 12px from the side and 8px below the chrome bar,
       * and rounding it to one number would shift every float by 4px.
       */
      readonly margin: number | { readonly x: number; readonly y: number };
      readonly size: Size;
      /** Which box to anchor against. Defaults to `content`. */
      readonly against?: 'fill' | 'content';
    }
  /** Present in the tree, occupying nothing. */
  | { readonly kind: 'hidden' };

/** One view in a window's stack. */
export interface ViewSpec {
  readonly id: ViewId;
  readonly extent: Extent;
  /**
   * Whether the view is on screen at all, independently of where it sits.
   *
   * Kept separate from `extent` on purpose: a view can be fully sized and still
   * hidden, which is what a background tab needs when something else (a
   * thumbnail pump, a screencast) still wants its pixels. Collapsing it to a
   * zero-area rect instead would starve that consumer.
   */
  readonly visible: boolean;
}

/** Metrics the chrome bar is composed of. Booleans are "which lane is open". */
export interface ChromeMetrics {
  /** The tab strip is always there; this is the bar's baseline height. */
  readonly tabStrip: number;
  /** Bookmark bar adds its own height under the tab strip. */
  readonly bookmarkBar: boolean;
  readonly findBar: boolean;
  readonly permissionLane: boolean;
  readonly passwordLane: boolean;
  /**
   * The bar is covering the whole window because something opened over the
   * content (a dropdown, a dialog, an overlay). The content area is unchanged;
   * only the bar grows.
   */
  readonly expanded: boolean;
}

/** The pixel heights a host supplies so the planner can do arithmetic. */
export interface ChromeSpec {
  readonly tabStrip: number;
  readonly bookmarkBar: number;
  readonly findBar: number;
  readonly permissionLane: number;
  readonly passwordLane: number;
}
