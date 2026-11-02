/**
 * The Electron entry point.
 *
 * Separate from the root export on purpose: importing casement in a process
 * that has no Electron (a test runner, a CI box, a web build) must not drag
 * electron into the module graph. Everything here assumes it is running in an
 * Electron main process.
 */

export { ElectronAdapter } from './adapter.ts';
export type {
  ElectronAdapterOptions,
  ElectronBaseWindow,
  ElectronContentView,
  ElectronLike,
  ElectronWebContentsView,
  ViewFactory,
} from './adapter.ts';
