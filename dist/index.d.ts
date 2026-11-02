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
export { createRoot, render, flushSync, connectToDevTools } from './react/renderer.ts';
export type { CasementRoot, CreateRootOptions } from './react/renderer.ts';
export type { LayerProps, WindowProps, RootContainer, WindowInstance, LayerInstance, } from './react/hostConfig.ts';
export { reconcile, describeResult, DEFAULT_MAX_PASSES } from './reconcile/loop.ts';
export type { ReconcileOptions, ReconcileResult, ReconcilePass } from './reconcile/loop.ts';
export { commit } from './reconcile/commit.ts';
export type { CommitResult } from './reconcile/commit.ts';
export { POLICY, policyFor, eventFacts } from './reconcile/policy.ts';
export type { OsFact, PolicyAction } from './reconcile/policy.ts';
export { NO_FOCUS, requestFocus, markApplied, hasPendingFocus } from './reconcile/focus.ts';
export type { FocusRequest } from './reconcile/focus.ts';
export { plan, planWindow, sameDesired } from './plan/desired.ts';
export type { DesiredState, DesiredWindow, DesiredView, PlanOptions } from './plan/desired.ts';
export { isWindowVisible, makeClaim } from './plan/visibility.ts';
export type { VisibilityInput } from './plan/visibility.ts';
export { chromeHeight, contentRect, projectExtent, sameRect, sameSize, clampRect, ZERO_RECT, } from './plan/geometry.ts';
export type { ProjectionContext } from './plan/geometry.ts';
export { diff, isConverged } from './diff/diff.ts';
export type { DiffOptions } from './diff/diff.ts';
export { describeOp } from './diff/ops.ts';
export type { Op } from './diff/ops.ts';
export { EMPTY_ACTUAL } from './actual/state.ts';
export type { ActualState, ActualWindow, ActualView, ActualSource } from './actual/state.ts';
export { walk, windowsOf, insertBefore, removeChild, detach, isWindow, isLayer, isContainer, } from './tree/nodes.ts';
export type { CasementNode, ContainerNode, LayerNode, WindowNode, NodeType, } from './tree/nodes.ts';
export type { HostAdapter, HostWindowHandle } from './host/adapter.ts';
export type { ChromeMetrics, ChromeSpec, Claim, Extent, Owner, Rect, Size, ViewId, ViewSpec, WindowId, WindowKind, WindowPhase, } from './types.ts';
