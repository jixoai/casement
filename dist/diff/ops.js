/**
 * The vocabulary of changes.
 *
 * An op is a description of one mutation, not the mutation. Keeping them as
 * values means the diff can be tested by comparing lists, the loop can log what
 * it was about to do, and the single commit path has one exhaustive switch to
 * implement — so "which code is allowed to move a window" is answered by the
 * type system rather than by a code review.
 */
/** A one-line description, for logs and test failure messages. */
export function describeOp(op) {
    switch (op.op) {
        case 'createWindow':
            return `createWindow ${op.id} (${op.kind} ${op.size.width}x${op.size.height})`;
        case 'destroyWindow':
            return `destroyWindow ${op.id}`;
        case 'setWindowSize':
            return `setWindowSize ${op.id} -> ${op.size.width}x${op.size.height}`;
        case 'showWindow':
            return `showWindow ${op.id}`;
        case 'hideWindow':
            return `hideWindow ${op.id}`;
        case 'createView':
            return `createView ${op.window}/${op.view}`;
        case 'destroyView':
            return `destroyView ${op.window}/${op.view}`;
        case 'orderView':
            return `orderView ${op.window}/${op.view} @${op.index}`;
        case 'attachView':
            return `attachView ${op.window}/${op.view} @${op.index}`;
        case 'detachView':
            return `detachView ${op.window}/${op.view}`;
        case 'setViewBounds':
            return `setViewBounds ${op.window}/${op.view} -> ${op.bounds.x},${op.bounds.y} ${op.bounds.width}x${op.bounds.height}`;
        case 'setViewVisible':
            return `setViewVisible ${op.window}/${op.view} -> ${op.visible}`;
        case 'focusWindow':
            return `focusWindow ${op.id} #${op.seq}`;
    }
}
