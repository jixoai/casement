/**
 * The single commit path.
 *
 * This function is the only place in casement that calls a mutating method on a
 * host. Everything else — the app, the React layer, the effects bridge — may
 * only produce ops or dispatch intent. That is the whole rule, and it is
 * enforced by keeping the adapter instance private to this module's callers:
 * `commit` is handed an adapter, and nothing else is.
 *
 * The switch below is exhaustive over `Op`, so adding a new kind of mutation
 * fails to compile until it is given a host call here. There is no default
 * branch that silently ignores an op — an unhandled op would be a bug that only
 * shows up as "the window did not move".
 */
import { markApplied } from "./focus.js";
/**
 * Apply ops to a host, in order.
 *
 * Errors are not swallowed: a host that throws on `setViewBounds` has a real
 * problem, and the reconcile loop is the wrong place to hide it. What *is*
 * handled is the one benign race — an op against a window that has since been
 * destroyed — by having each adapter method be idempotent and total rather than
 * by catching here.
 */
export function commit(adapter, ops, focus) {
    let nextFocus = focus;
    for (const op of ops) {
        switch (op.op) {
            case 'createWindow':
                adapter.createWindow({
                    id: op.id,
                    kind: op.kind,
                    size: op.size,
                    minSize: op.minSize,
                });
                break;
            case 'destroyWindow':
                adapter.destroyWindow(op.id);
                break;
            case 'setWindowSize':
                adapter.setWindowSize(op.id, op.size);
                break;
            case 'showWindow':
                adapter.showWindow(op.id, op.kind);
                break;
            case 'hideWindow':
                adapter.hideWindow(op.id);
                break;
            case 'focusWindow':
                adapter.focusWindow(op.id);
                nextFocus = markApplied(nextFocus, op.seq);
                break;
            case 'createView':
                adapter.createView(op.window, op.view);
                break;
            case 'destroyView':
                adapter.destroyView(op.window, op.view);
                break;
            case 'attachView':
                adapter.attachView(op.window, op.view, op.index);
                break;
            case 'detachView':
                adapter.detachView(op.window, op.view);
                break;
            case 'orderView':
                adapter.orderView(op.window, op.view, op.index);
                break;
            case 'setViewBounds':
                adapter.setViewBounds(op.window, op.view, op.bounds);
                break;
            case 'setViewVisible':
                adapter.setViewVisible(op.window, op.view, op.visible);
                break;
        }
    }
    return { focus: nextFocus, applied: ops.length };
}
