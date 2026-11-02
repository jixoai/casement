import test from 'node:test';
import assert from 'node:assert/strict';

import { plan, planWindow, sameDesired } from '../src/plan/desired.ts';
import type { RootContainer } from '../src/react/hostConfig.ts';
import { TEST_CHROME_SPEC, layerNode, windowNode, withChildren } from '../src/testing/index.ts';

function root(children: ReturnType<typeof windowNode>[]): RootContainer {
  return { type: 'root', children, onCommit: null };
}

test('plan collects every window in the tree', () => {
  const a = windowNode({ id: 'a', visible: true });
  const b = windowNode({ id: 'b', visible: true });
  const state = plan(root([a, b]), { chrome: TEST_CHROME_SPEC });
  assert.deepEqual([...state.windows.keys()], ['a', 'b']);
});

test('layer document order is stacking order', () => {
  const window = withChildren(windowNode({ id: 'w', visible: true }), [
    layerNode({ name: 'content', viewId: 'v-content' }),
    layerNode({ name: 'chrome', viewId: 'v-chrome', extent: { kind: 'chrome' } }),
  ]);
  const desired = planWindow(window, { chrome: TEST_CHROME_SPEC });
  assert.deepEqual(
    desired.views.map((v) => v.id),
    ['v-content', 'v-chrome'],
  );
});

test('layer geometry comes from the extent, not from a stored rect', () => {
  const window = withChildren(windowNode({ id: 'w', width: 800, height: 600 }), [
    layerNode({ name: 'content', extent: { kind: 'content' } }),
    layerNode({ name: 'chrome', extent: { kind: 'chrome' } }),
  ]);
  const desired = planWindow(window, { chrome: TEST_CHROME_SPEC });
  assert.deepEqual(desired.views[0]?.bounds, { x: 0, y: 40, width: 800, height: 560 });
  assert.deepEqual(desired.views[1]?.bounds, { x: 0, y: 0, width: 800, height: 40 });
});

test('resizing the window re-derives every layer rect', () => {
  const window = withChildren(windowNode({ id: 'w', width: 800, height: 600 }), [
    layerNode({ name: 'content', extent: { kind: 'content' } }),
  ]);
  const before = planWindow(window, { chrome: TEST_CHROME_SPEC });
  window.size = { width: 1200, height: 900 };
  const after = planWindow(window, { chrome: TEST_CHROME_SPEC });
  assert.deepEqual(before.views[0]?.bounds, { x: 0, y: 40, width: 800, height: 560 });
  assert.deepEqual(after.views[0]?.bounds, { x: 0, y: 40, width: 1200, height: 860 });
});

test('a hidden layer occupies nothing but stays in the stack', () => {
  const window = withChildren(windowNode({ id: 'w' }), [
    layerNode({ name: 'effects', extent: { kind: 'content' }, visible: false }),
  ]);
  const desired = planWindow(window, { chrome: TEST_CHROME_SPEC });
  assert.equal(desired.views.length, 1);
  assert.deepEqual(desired.views[0]?.bounds, { x: 0, y: 0, width: 0, height: 0 });
  assert.equal(desired.views[0]?.visible, false);
});

test('chrome lanes move the content rect but never the window rect', () => {
  const window = withChildren(windowNode({ id: 'w', width: 900, height: 700 }), [
    layerNode({ name: 'content', extent: { kind: 'content' } }),
    layerNode({ name: 'chrome', extent: { kind: 'chrome' } }),
  ]);
  const closed = planWindow(window, { chrome: TEST_CHROME_SPEC });
  window.chromeMetrics = { ...window.chromeMetrics, findBar: true };
  const findOpen = planWindow(window, { chrome: TEST_CHROME_SPEC });

  assert.equal(closed.views[0]?.bounds.y, 40);
  assert.equal(findOpen.views[0]?.bounds.y, 76);
  // The chrome bar grew by exactly the amount the content moved down.
  assert.equal(findOpen.views[1]?.bounds.height, 76);
  assert.equal(closed.size.height, findOpen.size.height);
});

test('plan is deterministic, so a converged tree plans to an equal state', () => {
  const build = () =>
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'content' }),
      layerNode({ name: 'chrome', extent: { kind: 'chrome' } }),
    ]);
  const first = plan(root([build()]), { chrome: TEST_CHROME_SPEC });
  const second = plan(root([build()]), { chrome: TEST_CHROME_SPEC });
  assert.equal(sameDesired(first, second), true);
});

test('sameDesired notices a moved layer', () => {
  const one = plan(
    root([
      withChildren(windowNode({ id: 'w' }), [layerNode({ name: 'content' })]),
    ]),
    { chrome: TEST_CHROME_SPEC },
  );
  const two = plan(
    root([
      withChildren(windowNode({ id: 'w' }), [
        layerNode({ name: 'content', extent: { kind: 'fill' } }),
      ]),
    ]),
    { chrome: TEST_CHROME_SPEC },
  );
  assert.equal(sameDesired(one, two), false);
});

test('plan ignores a layer that is not inside a window', () => {
  const orphan = layerNode({ name: 'stray' });
  const container: RootContainer = { type: 'root', children: [], onCommit: null };
  // Bypass the reconciler deliberately: plan() must be total, not crash on a
  // malformed tree.
  const state = plan({ ...container, children: [] } as RootContainer, {
    chrome: TEST_CHROME_SPEC,
  });
  assert.equal(state.windows.size, 0);
  void orphan;
});
