/**
 * casement — a React renderer for OS windows.
 *
 * The public surface is deliberately small and split by concern:
 *
 * - `createRoot` / `render` — the React side.
 * - `reconcile` / `commit` — the convergence engine.
 * - `plan` / `diff` / geometry / visibility — pure functions, no host needed.
 * - `HostAdapter` — what a host must implement. Electron's is a separate entry
 *   point (`@jixoai/casement/electron`) so that importing this module never
 *   pulls Electron into a process that does not have it.
 */
// React side
export { createRoot, render, flushSync, connectToDevTools } from "./react/renderer.js";
// Convergence
export { reconcile, describeResult, DEFAULT_MAX_PASSES } from "./reconcile/loop.js";
export { commit } from "./reconcile/commit.js";
export { POLICY, policyFor, eventFacts } from "./reconcile/policy.js";
export { NO_FOCUS, requestFocus, markApplied, hasPendingFocus } from "./reconcile/focus.js";
// Pure planning
export { plan, planWindow, sameDesired } from "./plan/desired.js";
export { isWindowVisible, makeClaim } from "./plan/visibility.js";
export { chromeHeight, contentRect, projectExtent, sameRect, sameSize, clampRect, ZERO_RECT, } from "./plan/geometry.js";
// Diffing
export { diff, isConverged } from "./diff/diff.js";
export { describeOp } from "./diff/ops.js";
// Actual state
export { EMPTY_ACTUAL } from "./actual/state.js";
// Tree
export { walk, windowsOf, insertBefore, removeChild, detach, isWindow, isLayer, isContainer, } from "./tree/nodes.js";
