import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The committed build is part of the contract.
 *
 * Consumers install casement by commit SHA, so `dist/` is what they actually run.
 * These tests fail if the build is missing, unloadable, or has lost an export —
 * the three ways a stale `dist/` shows up in the wild.
 */

test('dist/index.js loads and exposes the public surface', async () => {
  const mod = await import('../dist/index.js');
  for (const name of [
    'createRoot',
    'reconcile',
    'commit',
    'plan',
    'diff',
    'isWindowVisible',
    'chromeHeight',
    'projectExtent',
    'policyFor',
    'requestFocus',
  ]) {
    assert.equal(typeof (mod as Record<string, unknown>)[name], 'function', name + ' must be exported');
  }
  assert.equal(typeof (mod as Record<string, unknown>)['POLICY'], 'object');
  assert.equal(typeof (mod as Record<string, unknown>)['NO_FOCUS'], 'object');
});

test('dist/host/electron/index.js loads without an Electron process', async () => {
  // The adapter module must not touch `electron` at import time: only the app
  // hands it the module, via ElectronAdapterOptions.electron.
  const mod = await import('../dist/host/electron/index.js');
  assert.equal(typeof (mod as Record<string, unknown>)['ElectronAdapter'], 'function');
});

test('dist/testing/index.js loads and provides a host', async () => {
  const mod = await import('../dist/testing/index.js');
  assert.equal(typeof (mod as Record<string, unknown>)['MemoryAdapter'], 'function');
});
