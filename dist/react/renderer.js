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
import ReactReconciler from 'react-reconciler';
import { ConcurrentRoot } from 'react-reconciler/constants.js';
import { createHostConfig } from "./hostConfig.js";
/** Package identity, reported to React DevTools. */
const PACKAGE_NAME = '@jixoai/casement';
const VERSION = '0.1.0';
/**
 * Errors React recovers from without unmounting.
 *
 * Reported through reportError where the platform has it, so an uncaught error
 * in a component shows up in the host's error handling rather than disappearing
 * into a console line.
 */
function reportRecoverableError(error) {
    const report = globalThis.reportError;
    if (typeof report === 'function') {
        report(error);
        return;
    }
    console.error(error);
}
const reconciler = ReactReconciler(createHostConfig({ packageName: PACKAGE_NAME, version: VERSION }));
/**
 * Create a root.
 *
 * onCommit fires once per commit, not once per node: the commit already knows the
 * whole tree changed, and reconciling per node would run the loop once per window
 * for a single render.
 */
export function createRoot(options) {
    const container = {
        type: 'root',
        children: [],
        // The host config calls this with no arguments (it does not know the caller's
        // shape); the container is bound here.
        onCommit: () => options.onCommit(container),
    };
    const fiberRoot = reconciler.createContainer(container, ConcurrentRoot, null, // hydration callbacks
    false, // isStrictMode — StrictMode is a component, not a root flag
    null, // concurrentUpdatesByDefaultOverride
    '', // identifierPrefix
    options.onUncaughtError ?? reportRecoverableError, reportRecoverableError, // onCaughtError
    reportRecoverableError, // onRecoverableError
    null);
    return {
        container,
        render(element) {
            reconciler.updateContainer(element, fiberRoot, null, undefined);
        },
        renderSync(element) {
            reconciler.updateContainerSync(element, fiberRoot, null, undefined);
            reconciler.flushSyncWork();
        },
        /**
         * Tear the tree down, synchronously.
         *
         * Unmounting is the one path where scheduling would be actively wrong: the
         * caller is usually tearing down an app or a test, and it needs the windows
         * gone before it returns. There is also nothing to batch — the tree is going
         * away.
         */
        unmount() {
            reconciler.updateContainerSync(null, fiberRoot, null, undefined);
            reconciler.flushSyncWork();
        },
    };
}
/** Render into a container without creating a root. */
export function render(element, container, callback) {
    const fiberRoot = reconciler.createContainer(container, ConcurrentRoot, null, false, null, '', reportRecoverableError, reportRecoverableError, reportRecoverableError, null);
    reconciler.updateContainer(element, fiberRoot, null, callback);
}
/**
 * Flush pending work synchronously.
 *
 * react-reconciler 0.34 names this flushSyncFromReconciler; there is no
 * flushSync on the instance. Wrapping it keeps the name callers expect and
 * confines the version-specific detail to one line.
 */
export function flushSync(fn) {
    return reconciler.flushSyncFromReconciler(fn);
}
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
export function connectToDevTools() {
    const hook = globalThis
        .__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook === undefined || hook === null)
        return;
    try {
        reconciler.injectIntoDevTools();
    }
    catch {
        // DevTools is a convenience; a renderer that refuses to start because the
        // hook is an unexpected shape would be trading a debugging aid for the app.
    }
}
