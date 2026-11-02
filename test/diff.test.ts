import test from 'node:test';
import assert from 'node:assert/strict';

import { diff, isConverged } from '../src/diff/diff.ts';
import { describeOp } from '../src/diff/ops.ts';
import { plan } from '../src/plan/desired.ts';
import { EMPTY_ACTUAL } from '../src/actual/state.ts';
import { NO_FOCUS, requestFocus } from '../src/reconcile/focus.ts';
import type { ActualState } from '../src/actual/state.ts';
import type { RootContainer } from '../src/react/hostConfig.ts';
import { TEST_CHROME_SPEC, layerNode, windowNode, withChildren } from '../src/testing/index.ts';

function root(children: RootContainer['children']): RootContainer {
  return { type: 'root', children, onCommit: null };
}

function desiredOf(children: RootContainer['children']) {
  return plan(root(children), { chrome: TEST_CHROME_SPEC });
}

function actualOf(
  windows: Array<{
    id: string;
    size?: { width: number; height: number };
    visible?: boolean;
    minimized?: boolean;
    views?: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number }; visible?: boolean }>;
  }>,
): ActualState {
  const map = new Map();
  for (const w of windows) {
    map.set(w.id, {
      id: w.id,
      kind: 'profile' as const,
      size: w.size ?? { width: 1000, height: 700 },
      position: { x: 0, y: 0 },
      visible: w.visible ?? true,
      minimized: w.minimized ?? false,
      maximized: false,
      fullscreen: false,
      focused: false,
      views: (w.views ?? []).map((v) => ({
        id: v.id,
        bounds: v.bounds,
        visible: v.visible ?? true,
      })),
    });
  }
  return { windows: map };
}

test('an empty screen against an empty tree converges immediately', () => {
  const ops = diff(EMPTY_ACTUAL, desiredOf([]), { focus: NO_FOCUS });
  assert.equal(isConverged(ops), true);
});

test('a new window is created, its views attached, then shown', () => {
  const tree = [
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'content', viewId: 'v1', extent: { kind: 'content' } }),
    ]),
  ];
  const ops = diff(EMPTY_ACTUAL, desiredOf(tree), { focus: NO_FOCUS });
  assert.deepEqual(
    ops.map((o) => o.op),
    ['createWindow', 'createView', 'attachView', 'orderView', 'setViewBounds', 'showWindow'],
  );
});

test('a converged screen produces no ops at all', () => {
  const tree = [
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'content', viewId: 'v1', extent: { kind: 'content' } }),
    ]),
  ];
  const desired = desiredOf(tree);
  const actual = actualOf([
    {
      id: 'w',
      visible: true,
      views: [{ id: 'v1', bounds: { x: 0, y: 40, width: 1000, height: 660 } }],
    },
  ]);
  assert.deepEqual(diff(actual, desired, { focus: NO_FOCUS }), []);
});

test('the echo of our own show() cannot restart the loop', () => {
  // The OS reporting a window as visible is exactly what convergence leaves
  // behind; because the diff compares values, the echo produces nothing. This is
  // the mechanism that replaces a suppression flag.
  const tree = [
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'content', viewId: 'v1', extent: { kind: 'content' } }),
    ]),
  ];
  const actual = actualOf([
    {
      id: 'w',
      visible: true,
      views: [{ id: 'v1', bounds: { x: 0, y: 40, width: 1000, height: 660 } }],
    },
  ]);
  assert.equal(isConverged(diff(actual, desiredOf(tree), { focus: NO_FOCUS })), true);
});

test('a window with no claim is hidden, not shown', () => {
  const tree = [withChildren(windowNode({ id: 'w' }), [])];
  const actual = actualOf([{ id: 'w', visible: true }]);
  const ops = diff(actual, desiredOf(tree), { focus: NO_FOCUS });
  assert.deepEqual(ops.map((o) => o.op), ['hideWindow']);
});

test('a minimized window counts as off screen, and is shown rather than re-hidden', () => {
  const tree = [withChildren(windowNode({ id: 'w', visible: true }), [])];
  const actual = actualOf([{ id: 'w', visible: true, minimized: true }]);
  const ops = diff(actual, desiredOf(tree), { focus: NO_FOCUS });
  assert.deepEqual(ops.map((o) => o.op), ['showWindow']);
});

test('a window that is gone from the tree is destroyed last', () => {
  const tree = [withChildren(windowNode({ id: 'keep', visible: true }), [])];
  const actual = actualOf([
    { id: 'keep', visible: true },
    { id: 'gone', visible: true },
  ]);
  const ops = diff(actual, desiredOf(tree), { focus: NO_FOCUS });
  assert.equal(ops[ops.length - 1]?.op, 'destroyWindow');
  assert.deepEqual(ops.map((o) => o.op), ['destroyWindow']);
});

test('a resized window produces exactly one setWindowSize', () => {
  const tree = [withChildren(windowNode({ id: 'w', width: 1200, height: 900, visible: true }), [])];
  const actual = actualOf([{ id: 'w', size: { width: 1000, height: 700 }, visible: true }]);
  const ops = diff(actual, desiredOf(tree), { focus: NO_FOCUS });
  assert.deepEqual(ops.map((o) => o.op), ['setWindowSize']);
  assert.deepEqual(
    ops.map(describeOp),
    ['setWindowSize w -> 1200x900'],
  );
});

test('a view that moved is reordered, never detached', () => {
  const tree = [
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'content', viewId: 'content' }),
      layerNode({ name: 'chrome', viewId: 'chrome', extent: { kind: 'chrome' } }),
    ]),
  ];
  const desired = desiredOf(tree);
  const actual = actualOf([
    {
      id: 'w',
      visible: true,
      views: [
        { id: 'chrome', bounds: { x: 0, y: 0, width: 1000, height: 40 } },
        { id: 'content', bounds: { x: 0, y: 40, width: 1000, height: 660 } },
      ],
    },
  ]);
  const ops = diff(actual, desired, { focus: NO_FOCUS });
  const kinds = ops.map((o) => o.op);
  assert.equal(kinds.includes('detachView'), false, 'a reorder must not detach');
  assert.equal(kinds.includes('createView'), false, 'a reorder must not recreate');
  assert.deepEqual(kinds, ['orderView', 'orderView']);
});

test('a removed layer is detached before it is destroyed', () => {
  const tree = [withChildren(windowNode({ id: 'w', visible: true }), [])];
  const actual = actualOf([
    {
      id: 'w',
      visible: true,
      views: [{ id: 'stale', bounds: { x: 0, y: 0, width: 10, height: 10 } }],
    },
  ]);
  const ops = diff(actual, desiredOf(tree), { focus: NO_FOCUS });
  assert.deepEqual(ops.map((o) => o.op), ['detachView', 'destroyView']);
});

test('a view that only changed visibility gets one setViewVisible', () => {
  const tree = [
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'content', viewId: 'v1', extent: { kind: 'content' }, visible: false }),
    ]),
  ];
  const actual = actualOf([
    {
      id: 'w',
      visible: true,
      views: [{ id: 'v1', bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: true }],
    },
  ]);
  const ops = diff(actual, desiredOf(tree), { focus: NO_FOCUS });
  assert.deepEqual(ops.map((o) => o.op), ['setViewVisible']);
});

test('focus is applied once per request, not once per render', () => {
  const tree = [withChildren(windowNode({ id: 'w', visible: true }), [])];
  const desired = desiredOf(tree);
  const actual = actualOf([{ id: 'w', visible: true }]);

  const asked = requestFocus(NO_FOCUS, 'w');
  const first = diff(actual, desired, { focus: asked });
  assert.deepEqual(first.map((o) => o.op), ['focusWindow']);

  // Applying it advances appliedSeq; the same tree now yields nothing.
  const applied = { ...asked, appliedSeq: asked.seq };
  assert.deepEqual(diff(actual, desired, { focus: applied }), []);
});

test('focus is not applied to a window that is not on screen', () => {
  // Focusing a hidden window is how a window the user closed reappears.
  const tree = [withChildren(windowNode({ id: 'w' }), [])];
  const desired = desiredOf(tree);
  const actual = actualOf([{ id: 'w', visible: false }]);
  const ops = diff(actual, desired, { focus: requestFocus(NO_FOCUS, 'w') });
  assert.equal(ops.some((o) => o.op === 'focusWindow'), false);
});

test('focus naming a window that does not exist is a no-op', () => {
  const ops = diff(EMPTY_ACTUAL, desiredOf([]), { focus: requestFocus(NO_FOCUS, 'nope') });
  assert.deepEqual(ops, []);
});

test('a window created this pass still gets its views and its show', () => {
  const tree = [
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'a', viewId: 'a' }),
      layerNode({ name: 'b', viewId: 'b' }),
    ]),
  ];
  const ops = diff(EMPTY_ACTUAL, desiredOf(tree), { focus: NO_FOCUS });
  const kinds = ops.map((o) => o.op);
  assert.equal(kinds[0], 'createWindow');
  assert.equal(kinds.filter((k) => k === 'createView').length, 2);
  assert.equal(kinds.filter((k) => k === 'attachView').length, 2);
  assert.equal(kinds[kinds.length - 1], 'showWindow');
});

test('op ordering: creates precede attaches precede sizing precede showing', () => {
  const tree = [
    withChildren(windowNode({ id: 'w', visible: true, width: 500, height: 400 }), [
      layerNode({ name: 'content', viewId: 'v1', extent: { kind: 'content' } }),
    ]),
  ];
  const ops = diff(EMPTY_ACTUAL, desiredOf(tree), { focus: NO_FOCUS });
  const index = (name: string) => ops.findIndex((o) => o.op === name);
  assert.ok(index('createWindow') < index('createView'));
  assert.ok(index('createView') < index('attachView'));
  assert.ok(index('attachView') < index('setViewBounds'));
  assert.ok(index('setViewBounds') < index('showWindow'));
});
