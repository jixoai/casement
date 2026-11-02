/**
 * Focus is a request, not a state.
 *
 * A `focused: boolean` in the tree is wrong in a way that is hard to see until
 * it bites: focus is not something the app owns. The user clicks another
 * window, the OS takes focus away, and now the tree says `true` while the screen
 * says otherwise. The next commit then "corrects" the screen by stealing focus
 * back — a window that fights the user.
 *
 * The fix is to model it as what it actually is: a counter of requests. Asking
 * for focus bumps a sequence number and names a target. The reconciler applies a
 * request when the sequence is newer than the last one it applied, and then
 * forgets about it. Re-rendering the same tree does not re-apply it, because the
 * counter has not moved. Nothing tries to keep the screen's focus equal to a
 * stored value, so there is nothing to fight over.
 *
 * "Who has focus right now" is still available — but it is a *query* answered by
 * the host (see actual/state.ts), not a field the app writes.
 */
/** No focus has ever been requested. */
export const NO_FOCUS = Object.freeze({
    seq: 0,
    target: null,
    appliedSeq: 0,
});
/**
 * Record a new focus request.
 *
 * Deliberately returns a new value rather than mutating: the loop holds one and
 * the app holds another, and a shared mutable counter is how "did I already
 * apply this" bugs start.
 */
export function requestFocus(current, target) {
    return Object.freeze({
        seq: current.seq + 1,
        target,
        appliedSeq: current.appliedSeq,
    });
}
/** Mark a request as applied. */
export function markApplied(current, seq) {
    if (seq <= current.appliedSeq)
        return current;
    return Object.freeze({
        seq: current.seq,
        target: current.target,
        appliedSeq: seq,
    });
}
/** Whether there is an outstanding request. */
export function hasPendingFocus(request) {
    return request.seq > request.appliedSeq && request.target !== null;
}
