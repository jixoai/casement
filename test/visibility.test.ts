import test from 'node:test';
import assert from 'node:assert/strict';

import { isWindowVisible, makeClaim } from '../src/plan/visibility.ts';
import { planWindow } from '../src/plan/desired.ts';
import { TEST_CHROME_SPEC, windowNode } from '../src/testing/index.ts';

test('a ready window with a true claim is visible', () => {
  assert.equal(
    isWindowVisible({
      phase: 'ready',
      hiddenByReact: false,
      claim: makeClaim('human', true, 1),
    }),
    true,
  );
});

test('a window nobody asked for is not visible', () => {
  // This is the invariant the whole design exists for: mounting a window is
  // not the same gesture as showing it.
  assert.equal(
    isWindowVisible({ phase: 'ready', hiddenByReact: false, claim: null }),
    false,
  );
});

test('an agent claim is honoured exactly like a human one', () => {
  // No policy, no refusal: the author is recorded, not judged.
  assert.equal(
    isWindowVisible({
      phase: 'ready',
      hiddenByReact: false,
      claim: makeClaim('agent', true, 2),
    }),
    true,
  );
});

test('a false claim wins even for a human', () => {
  assert.equal(
    isWindowVisible({
      phase: 'ready',
      hiddenByReact: false,
      claim: makeClaim('human', false, 3),
    }),
    false,
  );
});

test('React hiding the subtree overrides a true claim', () => {
  assert.equal(
    isWindowVisible({
      phase: 'ready',
      hiddenByReact: true,
      claim: makeClaim('human', true, 4),
    }),
    false,
  );
});

test('a window that is not ready is never visible', () => {
  for (const phase of ['pending', 'creating', 'closing', 'closed'] as const) {
    assert.equal(
      isWindowVisible({
        phase,
        hiddenByReact: false,
        claim: makeClaim('human', true, 5),
      }),
      false,
      'phase ' + phase + ' must not be visible',
    );
  }
});

test('makeClaim freezes the claim', () => {
  const claim = makeClaim('agent', true, 1);
  assert.equal(Object.isFrozen(claim), true);
  assert.equal(claim.owner, 'agent');
  assert.equal(claim.value, true);
  assert.equal(claim.at, 1);
});

test('planWindow folds the claim into visibility', () => {
  const shown = planWindow(windowNode({ id: 'w', visible: true }), {
    chrome: TEST_CHROME_SPEC,
  });
  assert.equal(shown.visible, true);

  const silent = planWindow(windowNode({ id: 'w' }), { chrome: TEST_CHROME_SPEC });
  assert.equal(silent.visible, false);
});

test('an agent-created window stays off screen until someone asks', () => {
  // The regression this library was built for, expressed as a test: creating a
  // window for the agent must not put it in front of the user.
  const created = planWindow(
    windowNode({ id: 'ai-space', owner: 'agent', phase: 'creating' }),
    { chrome: TEST_CHROME_SPEC },
  );
  assert.equal(created.visible, false);

  const ready = planWindow(windowNode({ id: 'ai-space', owner: 'agent' }), {
    chrome: TEST_CHROME_SPEC,
  });
  assert.equal(ready.visible, false, 'ready but unclaimed is still off screen');

  const revealed = planWindow(
    windowNode({ id: 'ai-space', owner: 'agent', visible: true }),
    { chrome: TEST_CHROME_SPEC },
  );
  assert.equal(revealed.visible, true, 'an explicit ask does show it');
});
