/**
 * The renderer: a React root whose container is a window tree.
 *
 * The public shape is deliberately close to react-dom/client: createRoot returns
 * an object with render, renderSync and unmount, and there is a legacy render()
 * for scripts that do not want to manage a root. Anything more opinionated (an
 * app object, a scheduler, a store) belongs in the caller, not here.
 *
 * The reconciler instance is created once per module load and shared, because
 * react-reconciler keys internal state off the instance; creating a second one
 * per root would give two renderers that cannot see each other's fibers, which
 * breaks DevTools and act().
 *
 * Two render paths exist because a window tree has two very different callers:
 *
 * - render() schedules, the way a concurrent React root does. Correct for an
 *   app: the main process has an event loop, and a burst of state changes should
 *   collapse into one commit.
 * - renderSync() commits before returning. Needed by tests, by E2E drivers, and
 *   by any code that must observe the screen after it asked for a change.
 *
 * (react-reconciler 0.34 exposes the synchronous path as updateContainerSync +
 * flushSyncWork; there is no flushSync method on the instance.)
 */
import type { RootContainer } from './hostConfig.ts';
/** A mounted root. */
export interface CasementRoot {
    /** The tree React builds. Hand this to reconcile(). */
    readonly container: RootContainer;
    /** Render (or re-render) the tree, scheduling the commit. */
    render(element: unknown): void;
    /** Render and commit before returning. */
    renderSync(element: unknown): void;
    /** Tear the tree down, destroying every window it owns. */
    unmount(): void;
}
/** Options for createRoot. */
export interface CreateRootOptions {
    /**
     * Called at the end of every commit, after React has finished mutating the
     * tree, with the container holding it. This is where the app runs reconcile().
     *
     * The container is passed rather than closed over because it is created here,
     * inside createRoot, so there is no earlier moment at which the caller could
     * have it.
     *
     * Required: a renderer that updates a tree nobody reconciles is a renderer that
     * does nothing, and making it optional invites exactly that bug.
     */
    readonly onCommit: (container: RootContainer) => void;
    /** Called for errors React cannot recover from. Defaults to reportError. */
    readonly onUncaughtError?: (error: unknown) => void;
}
/**
 * Create a root.
 *
 * onCommit fires once per commit, not once per node: the commit already knows the
 * whole tree changed, and reconciling per node would run the loop once per window
 * for a single render.
 */
export declare function createRoot(options: CreateRootOptions): CasementRoot;
/** Render into a container without creating a root. */
export declare function render(element: unknown, container: RootContainer, callback?: () => void): void;
/**
 * Flush pending work synchronously.
 *
 * react-reconciler 0.34 names this flushSyncFromReconciler; there is no
 * flushSync on the instance. Wrapping it keeps the name callers expect and
 * confines the version-specific detail to one line.
 */
export declare function flushSync<R>(fn: () => R): R;
/**
 * Register the renderer with React DevTools, if the hook is installed.
 *
 * Without this a custom renderer is invisible in DevTools — one of the accepted
 * costs of not being react-dom, and cheap enough to pay. The call is a no-op when
 * no DevTools hook is present, which is the normal case in a packaged app.
 *
 * injectIntoDevTools takes no arguments in 0.34: it reads rendererPackageName and
 * rendererVersion from the host config.
 */
export declare function connectToDevTools(): void;
