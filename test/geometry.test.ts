import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chromeHeight,
  contentRect,
  projectExtent,
  sameRect,
  clampRect,
  ZERO_RECT,
} from '../src/plan/geometry.ts';
import { CHROME_CLOSED, TEST_CHROME_SPEC } from '../src/testing/index.ts';
import type { ChromeMetrics } from '../src/types.ts';

const windowSize = { width: 1000, height: 700 };

test('chromeHeight: closed bar is just the tab strip', () => {
  assert.equal(chromeHeight(windowSize, CHROME_CLOSED, TEST_CHROME_SPEC), 40);
});

test('chromeHeight: lanes are additive and independent', () => {
  const withFind: ChromeMetrics = { ...CHROME_CLOSED, findBar: true };
  assert.equal(chromeHeight(windowSize, withFind, TEST_CHROME_SPEC), 76);

  const all: ChromeMetrics = {
    ...CHROME_CLOSED,
    bookmarkBar: true,
    findBar: true,
    permissionLane: true,
    passwordLane: true,
  };
  // 40 + 32 + 36 + 44 + 48
  assert.equal(chromeHeight(windowSize, all, TEST_CHROME_SPEC), 200);
});

test('chromeHeight: expanded covers the whole window', () => {
  const expanded: ChromeMetrics = { ...CHROME_CLOSED, expanded: true, findBar: true };
  assert.equal(chromeHeight(windowSize, expanded, TEST_CHROME_SPEC), 700);
});

test('chromeHeight: a tabStrip metric overrides the spec default', () => {
  const metrics: ChromeMetrics = { ...CHROME_CLOSED, tabStrip: 52 };
  assert.equal(chromeHeight(windowSize, metrics, TEST_CHROME_SPEC), 52);
});

test('contentRect sits below the chrome and keeps full width', () => {
  assert.deepEqual(contentRect(windowSize, 40), {
    x: 0,
    y: 40,
    width: 1000,
    height: 660,
  });
});

test('contentRect clamps instead of going negative', () => {
  const rect = contentRect({ width: 300, height: 100 }, 200);
  assert.equal(rect.height, 0);
  assert.equal(rect.y, 200);
});

test('projectExtent: fill ignores the chrome', () => {
  assert.deepEqual(projectExtent({ kind: 'fill' }, { window: windowSize, chrome: 40 }), {
    x: 0,
    y: 0,
    width: 1000,
    height: 700,
  });
});

test('projectExtent: content and chrome tile the window exactly', () => {
  const ctx = { window: windowSize, chrome: 40 };
  const content = projectExtent({ kind: 'content' }, ctx);
  const chrome = projectExtent({ kind: 'chrome' }, ctx);
  assert.equal(chrome.height + content.height, windowSize.height);
  assert.equal(chrome.y + chrome.height, content.y);
});

test('projectExtent: hidden is zero area at the origin', () => {
  assert.deepEqual(projectExtent({ kind: 'hidden' }, { window: windowSize, chrome: 40 }), ZERO_RECT);
});

test('projectExtent: anchored top-right lands inside the content box', () => {
  const rect = projectExtent(
    { kind: 'anchored', corner: 'top-right', margin: 12, size: { width: 360, height: 240 } },
    { window: windowSize, chrome: 40 },
  );
  assert.deepEqual(rect, { x: 1000 - 360 - 12, y: 40 + 12, width: 360, height: 240 });
});

test('projectExtent: an oversized float is clamped but keeps its margin', () => {
  const rect = projectExtent(
    { kind: 'anchored', corner: 'top-right', margin: 12, size: { width: 5000, height: 5000 } },
    { window: { width: 400, height: 300 }, chrome: 40 },
  );
  // The content box is 400x260; the margin is honoured on both sides.
  assert.equal(rect.width, 400 - 12 * 2);
  assert.equal(rect.height, 260 - 12 * 2);
  assert.equal(rect.x, 12);
  assert.equal(rect.y, 40 + 12);
  // Still inside the content box.
  assert.equal(rect.x + rect.width, 400 - 12);
  assert.equal(rect.y + rect.height, 300 - 12);
});

test('projectExtent: anchored against fill ignores the chrome', () => {
  const rect = projectExtent(
    {
      kind: 'anchored',
      corner: 'bottom-right',
      margin: 10,
      size: { width: 100, height: 100 },
      against: 'fill',
    },
    { window: windowSize, chrome: 40 },
  );
  assert.deepEqual(rect, { x: 890, y: 590, width: 100, height: 100 });
});

test('sameRect compares all four fields', () => {
  const a = { x: 1, y: 2, width: 3, height: 4 };
  assert.equal(sameRect(a, { ...a }), true);
  assert.equal(sameRect(a, { ...a, height: 5 }), false);
});

test('clampRect only touches negative extents', () => {
  assert.deepEqual(clampRect({ x: 5, y: 5, width: -3, height: 10 }), {
    x: 5,
    y: 5,
    width: 0,
    height: 10,
  });
  const ok = { x: 1, y: 1, width: 1, height: 1 };
  assert.equal(clampRect(ok), ok);
});

test('geometry is pure: the same inputs give the same rects', () => {
  const ctx = { window: windowSize, chrome: 76 };
  const a = projectExtent({ kind: 'content' }, ctx);
  const b = projectExtent({ kind: 'content' }, ctx);
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
});
