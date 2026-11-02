import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcile, describeResult } from '../src/reconcile/loop.ts';
import { NO_FOCUS, requestFocus } from '../src/reconcile/focus.ts';
import { MemoryAdapter } from '../src/testing/memory.ts';
import { TEST_CHROME_SPEC, layerNode, windowNode, withChildren } from '../src/testing/index.ts';
import type { RootContainer } from '../src/react/hostConfig.ts';

function root(children: RootContainer['children']): RootContainer {
  return { type: 'root', children, onCommit: null };
}

function run(adapter: MemoryAdapter, tree: RootContainer, focus = NO_FOCUS) {
  return reconcile(tree, adapter, { chrome: TEST_CHROME_SPEC, focus });
}

test('a fresh window converges in one reconcile', () => {
  const adapter = new MemoryAdapter();
  const tree = root([
    withChildren(windowNode({ id: 'w', width: 800, height: 600, visible: true }), [
      layerNode({ name: 'content', viewId: 'v-content', extent: { kind: 'content' } }),
      layerNode({ name: 'chrome', viewId: 'v-chrome', extent: { kind: 'chrome' } }),
    ]),
  ]);
  const result = run(adapter, tree);
  assert.equal(result.converged, true, describeResult(result));
  assert.equal(adapter.windows.size, 1);

  const window = adapter.windows.get('w');
  assert.equal(window?.visible, true);
  assert.deepEqual(window?.order, ['v-content', 'v-chrome']);
  assert.deepEqual(window?.views.get('v-content')?.bounds, {
    x: 0,
    y: 40,
    width: 800,
    height: 560,
  });
  assert.deepEqual(window?.views.get('v-chrome')?.bounds, {
    x: 0,
    y: 0,
    width: 800,
    height: 40,
  });
});

test('a second reconcile on an unchanged tree is a no-op', () => {
  // This is the fixed point. If it did not hold, the loop would never stop and
  // every render would issue host calls.
  const adapter = new MemoryAdapter();
  const tree = root([
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'content', viewId: 'v1' }),
    ]),
  ]);
  run(adapter, tree);
  adapter.clearCalls();
  const second = run(adapter, tree);
  assert.equal(second.converged, true);
  assert.deepEqual(adapter.calls, [], 'a converged tree must touch nothing');
});

test('reordering layers converges to the document order', () => {
  const adapter = new MemoryAdapter();
  const first = root([
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'a', viewId: 'a' }),
      layerNode({ name: 'b', viewId: 'b' }),
      layerNode({ name: 'c', viewId: 'c' }),
    ]),
  ]);
  run(adapter, first);
  assert.deepEqual(adapter.windows.get('w')?.order, ['a', 'b', 'c']);

  // Swap a and c: exactly what React does for a keyed reorder.
  const second = root([
    withChildren(windowNode({ id: 'w', visible: true }), [
      layerNode({ name: 'c', viewId: 'c' }),
      layerNode({ name: 'b', viewId: 'b' }),
      layerNode({ name: 'a', viewId: 'a' }),
    ]),
  ]);
  adapter.clearCalls();
  const result = run(adapter, second);
  assert.equal(result.converged, true);
  assert.deepEqual(adapter.windows.get('w')?.order, ['c', 'b', 'a']);
  // No view was destroyed and recreated to achieve it.
  assert.equal(adapter.calls.some((c) => c.call === 'destroyView'), false);
  assert.equal(adapter.calls.some((c) => c.call === 'createView'), false);
});

test('the content rect follows the chrome lanes across reconciles', () => {
  const adapter = new MemoryAdapter();
  const window = withChildren(windowNode({ id: 'w', width: 900, height: 700, visible: true }), [
    layerNode({ name: 'content', viewId: 'content', extent: { kind: 'content' } }),
  ]);
  run(adapter, root([window]));
  assert.equal(adapter.windows.get('w')?.views.get('content')?.bounds.y, 40);

  window.chromeMetrics = { ...window.chromeMetrics, findBar: true };
  run(adapter, root([window]));
  assert.equal(adapter.windows.get('w')?.views.get('content')?.bounds.y, 76);
  assert.equal(adapter.windows.get('w')?.views.get('content')?.bounds.height, 700 - 76);
});

test('a window that becomes unclaimed is hidden but not destroyed', () => {
  const adapter = new MemoryAdapter();
  const window = windowNode({ id: 'w', visible: true });
  run(adapter, root([window]));
  assert.equal(adapter.windows.get('w')?.visible, true);

  window.visibleClaim = null;
  const result = run(adapter, root([window]));
  assert.equal(result.converged, true);
  assert.equal(adapter.windows.get('w')?.visible, false);
  assert.equal(adapter.windows.has('w'), true, 'hiding is not destroying');
});

test('removing a window from the tree destroys it and its views', () => {
  const adapter = new MemoryAdapter();
  run(
    adapter,
    root([
      withChildren(windowNode({ id: 'w', visible: true }), [
        layerNode({ name: 'content', viewId: 'v1' }),
      ]),
    ]),
  );
  assert.equal(adapter.windows.size, 1);

  const result = run(adapter, root([]));
  assert.equal(result.converged, true);
  assert.equal(adapter.windows.size, 0);
});

test('an OS that ignores a resize is reported, not looped on forever', () => {
  const adapter = new MemoryAdapter();
  // Converge at one size first: createWindow already takes the desired size, so
  // the refusal only shows up on a *change*.
  const window = windowNode({ id: 'w', width: 800, height: 600, visible: true });
  run(adapter, root([window]));
  assert.equal(adapter.windows.get('w')?.size.width, 800);

  adapter.ignoreSizes = true;
  window.size = { width: 900, height: 700 };
  const result = run(adapter, root([window]));
  assert.equal(result.converged, false);
  assert.equal(result.remaining.some((o) => o.op === 'setWindowSize'), true);
  assert.match(describeResult(result), /NOT converged/);
});

test('the pass cap bounds the work even when the host never agrees', () => {
  const adapter = new MemoryAdapter();
  const window = windowNode({ id: 'w', width: 800, height: 600, visible: true });
  run(adapter, root([window]));

  adapter.ignoreSizes = true;
  window.size = { width: 900, height: 700 };
  const result = reconcile(root([window]), adapter, {
    chrome: TEST_CHROME_SPEC,
    focus: NO_FOCUS,
    maxPasses: 2,
  });
  assert.equal(result.converged, false);
  assert.equal(result.passes, 2);
});

test('focus is requested, applied, and then not repeated', () => {
  const adapter = new MemoryAdapter();
  const tree = root([withChildren(windowNode({ id: 'w', visible: true }), [])]);

  const first = run(adapter, tree, requestFocus(NO_FOCUS, 'w'));
  assert.equal(first.converged, true);
  assert.equal(adapter.windows.get('w')?.focused, true);
  assert.equal(first.focus.appliedSeq, 1);

  adapter.clearCalls();
  const second = run(adapter, tree, first.focus);
  assert.equal(second.converged, true);
  assert.equal(adapter.calls.some((c) => c.call === 'focusWindow'), false);
});

test('a user resizing the window is not undone by the next reconcile', () => {
  // The policy question, end to end: 'resized' is adopted, so the app must write
  // the new size into the tree. Until it does, the tree is the truth and the
  // window goes back — which is the documented behaviour, not a bug.
  const adapter = new MemoryAdapter();
  const window = windowNode({ id: 'w', width: 800, height: 600, visible: true });
  run(adapter, root([window]));

  // Simulate the user dragging the window bigger.
  const live = adapter.windows.get('w');
  assert.ok(live);
  live.size = { width: 1100, height: 800 };

  // The app adopts it, as the policy table says it should.
  window.size = { width: 1100, height: 800 };
  const result = run(adapter, root([window]));
  assert.equal(result.converged, true);
  assert.deepEqual(adapter.windows.get('w')?.size, { width: 1100, height: 800 });
});

test('several windows converge together', () => {
  const adapter = new MemoryAdapter();
  const tree = root([
    withChildren(windowNode({ id: 'main', visible: true }), [layerNode({ name: 'content', viewId: 'm1' })]),
    withChildren(windowNode({ id: 'settings', visible: true }), [layerNode({ name: 'content', viewId: 's1' })]),
    withChildren(windowNode({ id: 'float', visible: true }), [layerNode({ name: 'body', viewId: 'f1' })]),
  ]);
  const result = run(adapter, tree);
  assert.equal(result.converged, true, describeResult(result));
  assert.equal(adapter.windows.size, 3);
  assert.equal(adapter.windows.get('float')?.visible, true);
});
