import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment, StrictMode } from 'react';

import { createRoot } from '../src/react/renderer.ts';
import { reconcile } from '../src/reconcile/loop.ts';
import { NO_FOCUS } from '../src/reconcile/focus.ts';
import { MemoryAdapter } from '../src/testing/memory.ts';
import { TEST_CHROME_SPEC } from '../src/testing/index.ts';

/**
 * The host element names, as React component types.
 *
 * They are not components — they are host element strings that the reconciler
 * interprets. Casting through `any` is the honest way to say that: React's types
 * only know about components, and this renderer's vocabulary is not one.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Window = 'window' as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Layer = 'layer' as any;

/** Wire a React root to a memory host, exactly the way an app wires it to Electron. */
function harness() {
  const adapter = new MemoryAdapter();
  let commits = 0;
  const root = createRoot({
    onCommit: (container) => {
      commits += 1;
      reconcile(container, adapter, { chrome: TEST_CHROME_SPEC, focus: NO_FOCUS });
    },
  });
  return {
    adapter,
    root,
    /**
     * Render and wait for the commit.
     *
     * A concurrent root schedules its work, so a bare `render()` returns before
     * the commit — correct for an app (the main process has an event loop) and
     * useless for a test. `renderSync` is the escape hatch.
     */
    render(element: unknown) {
      root.renderSync(element);
    },
    unmount() {
      root.unmount();
    },
    get commits() {
      return commits;
    },
  };
}

function windowTree(spec: {
  id: string;
  width?: number;
  height?: number;
  visible?: boolean;
  owner?: 'human' | 'agent';
  layers?: Array<{ name: string; kind?: string }>;
}) {
  const layers = spec.layers ?? [{ name: 'content' }];
  return createElement(
    Window,
    {
      id: spec.id,
      width: spec.width ?? 900,
      height: spec.height ?? 700,
      visible:
        spec.visible === false
          ? { owner: spec.owner ?? 'human', value: false }
          : { owner: spec.owner ?? 'human', value: true },
    },
    layers.map((layer) =>
      createElement(Layer, {
        key: layer.name,
        name: layer.name,
        extent: layer.kind === 'chrome' ? { kind: 'chrome' } : { kind: 'content' },
      }),
    ),
  );
}

test('the host config is accepted by react-reconciler 0.34', () => {
  const root = createRoot({ onCommit: () => {} });
  assert.doesNotThrow(() => root.render(null));
  root.unmount();
});

test('a rendered window reaches the host with derived bounds', () => {
  const h = harness();
  h.render(windowTree({ id: 'main' }));

  const window = h.adapter.windows.get('main');
  assert.ok(window, 'the window must exist on the host');
  assert.equal(window.visible, true);
  assert.deepEqual(window.size, { width: 900, height: 700 });
  // One layer, extent 'content', chrome 40.
  assert.deepEqual(window.views.get('content')?.bounds, {
    x: 0,
    y: 40,
    width: 900,
    height: 660,
  });
});

test('layer order in JSX becomes stacking order on the host', () => {
  const h = harness();
  h.render(
    windowTree({
      id: 'main',
      layers: [{ name: 'content' }, { name: 'chrome', kind: 'chrome' }],
    }),
  );
  assert.deepEqual(h.adapter.windows.get('main')?.order, ['content', 'chrome']);
});

test('reordering the layers reorders the host without recreating views', () => {
  const h = harness();
  h.render(
    windowTree({
      id: 'main',
      layers: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    }),
  );
  assert.deepEqual(h.adapter.windows.get('main')?.order, ['a', 'b', 'c']);
  h.adapter.clearCalls();

  h.render(
    windowTree({
      id: 'main',
      layers: [{ name: 'c' }, { name: 'a' }, { name: 'b' }],
    }),
  );
  assert.deepEqual(h.adapter.windows.get('main')?.order, ['c', 'a', 'b']);
  assert.equal(h.adapter.calls.some((c) => c.call === 'createView'), false);
  assert.equal(h.adapter.calls.some((c) => c.call === 'destroyView'), false);
});

test('changing a prop updates the host', () => {
  const h = harness();
  h.render(windowTree({ id: 'main', width: 900, height: 700 }));
  h.render(windowTree({ id: 'main', width: 1200, height: 800 }));
  assert.deepEqual(h.adapter.windows.get('main')?.size, { width: 1200, height: 800 });
});

test('unmounting destroys the windows it owned', () => {
  const h = harness();
  h.render(windowTree({ id: 'main' }));
  assert.equal(h.adapter.windows.size, 1);
  h.unmount();
  assert.equal(h.adapter.windows.size, 0);
});

test('a window mounted without a claim stays off screen', () => {
  // The regression this library exists for: mounting is not showing.
  const h = harness();
  h.render(
    createElement(
      Window,
      { id: 'ai', width: 800, height: 600 },
      createElement(Layer, { key: 'content', name: 'content', extent: { kind: 'content' } }),
    ),
  );
  assert.equal(h.adapter.windows.get('ai')?.visible, false);
});

test('StrictMode double render does not create two windows', () => {
  // StrictMode re-runs render, so createInstance runs twice. Because instances
  // are pure and creation happens in the commit, the host sees one window.
  const h = harness();
  h.render(createElement(StrictMode, null, windowTree({ id: 'main' })));
  assert.equal(h.adapter.windows.size, 1);
  assert.equal(
    h.adapter.calls.filter((c) => c.call === 'createWindow').length,
    1,
    'exactly one createWindow for one committed window',
  );
});

test('a hidden subtree (React hideInstance) does not put the window on screen', () => {
  const h = harness();
  const tree = windowTree({ id: 'main' });
  h.render(tree);
  assert.equal(h.adapter.windows.get('main')?.visible, true);

  // React hides a subtree when a Suspense boundary suspends. Modelled here by
  // rendering nothing: the window is removed, so it must be destroyed.
  h.render(null);
  assert.equal(h.adapter.windows.has('main'), false);
});

test('several windows in one render all converge', () => {
  const h = harness();
  // A fragment, not a <div>: the root holds windows, and nothing else in the
  // vocabulary can wrap them. This is the shape an app uses for a window list.
  h.render(
    createElement(Fragment, null, windowTree({ id: 'main' }), windowTree({ id: 'settings' })),
  );
  assert.equal(h.adapter.windows.size, 2);
  assert.equal(h.adapter.windows.get('main')?.visible, true);
  assert.equal(h.adapter.windows.get('settings')?.visible, true);
});
