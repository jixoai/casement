# casement

A React renderer that reconciles a declarative element tree onto **OS windows and their view layers**. First host: Electron (`BaseWindow` + `WebContentsView`).

```tsx
import { createElement, Fragment } from 'react';
import { createRoot, reconcile, NO_FOCUS } from '@jixoai/casement';
import { ElectronAdapter } from '@jixoai/casement/electron';

const adapter = new ElectronAdapter({ electron, views });
const focus = { current: NO_FOCUS };

const root = createRoot({
  onCommit: (tree) => {
    focus.current = reconcile(tree, adapter, {
      chrome: { tabStrip: 40, bookmarkBar: 32, findBar: 36, permissionLane: 44, passwordLane: 48 },
      focus: focus.current,
    }).focus;
  },
});

root.render(
  createElement(Window, { id: 'main', width: 1280, height: 800, visible: { owner: 'human', value: true } },
    createElement(Layer, { key: 'content', name: 'content', extent: { kind: 'content' } }),
    createElement(Layer, { key: 'chrome', name: 'chrome', extent: { kind: 'chrome' } }),
  ),
);
```

---

## What it is

A window layer where **the tree is the only truth**. You describe windows and the layers inside them; casement converges the screen onto that description and then stops. It is not a UI toolkit — the pixels inside each layer are web content, rendered by Chromium exactly as before. What casement owns is the arrangement: which windows exist, which layers are in them, in what order, at what size, and whether they are on screen.

Six properties define it, and each one is a deliberate answer to a bug that the imperative alternative produces:

**1. The tree is the only source of truth.** A window is an element. A layer is an element. Nothing else may describe the arrangement, so there is exactly one thing to read when the screen is wrong.

**2. There is one commit path.** `commit()` in `src/reconcile/commit.ts` is the only code in the library that calls a mutating host method. Everything else produces ops or dispatches intent. Adding a new kind of mutation fails to compile until it is given a host call there.

**3. Ownership is data, not a permission system.** A value that more than one party can ask for is stored with its author: `{ owner: 'human' | 'agent', value }`. There are no error codes, no policy table, and no refusal logic. Recording who asked is enough to explain a screen, and nothing has to be *decided* about who is allowed.

**4. Causes are stored; results are derived.** A layer holds an `extent` — a reason, like "below the chrome bar" or "anchored top-right with a 12px margin". The rectangle is computed from the window size and the chrome metrics on every plan. A rect is never stored, so there is no second copy to drift.

**5. `actual` is a cache, refreshed by asking.** The host is queried (`getContentSize`, `isVisible`, `getBounds`, `getMinimized`) before every diff. Electron does not emit an event for every change, and a model fed only by events goes stale — which then oscillates, because reconcile keeps re-applying a delta the stale copy never accepted.

**6. Convergence is idempotent.** Reconcile pushes `actual` toward `desired` and stops when they are equal. The echo of our own `win.show()` terminates the loop by *producing an empty diff*, not by a suppression flag.

Two more things are modelled as what they are rather than as state:

- **Focus is a request counter** (`{ seq, target }`), not a boolean. A stored boolean fights the user: they click elsewhere, the tree still says `true`, and the next commit steals focus back.
- **Closing is an event**, not a value to converge on.

---

## What it is not

Being clear about this is worth more than a feature list.

- **Not a widget library.** There is no layout engine, no styling, no text, no hit testing. Layers contain web content; casement places them. Raw text is a render error, on purpose.
- **Not a window manager.** It does not tile, snap, animate, or manage virtual desktops. The OS owns window position; casement never writes it.
- **Not a framework integration.** No router, no store, no scheduler. `createRoot` returns `{ render, renderSync, unmount }` and nothing else.
- **Not a cross-platform abstraction yet.** There is one host interface with one implementation. That interface exists so a second host would be an implementation rather than a rewrite — not so that casement can claim to support something it has never run on.
- **Not a security boundary.** `owner` is provenance, not authorisation. If you need to *stop* an agent doing something, that check belongs in your code, before you dispatch the intent. casement will not refuse a write.
- **Not stable across React minors.** See below.

---

## The host-config API is not a public React API

casement is built on `react-reconciler`, the engine `react-dom` is implemented with. It is published, widely used by production renderers, and **not a public API**. Its host-config surface tracks React's minors:

| react-reconciler | React |
| --- | --- |
| 0.31 | 19.0 |
| 0.32 | 19.1 |
| 0.33 | 19.2 |
| 0.34 | 19.3 |

casement pins `react-reconciler@^0.34.0` and peer-requires `react@^19.3.0`. **A React minor upgrade may require changes to `src/react/hostConfig.ts`.** Expect to read that file, not just bump a version. Two specific traps, both of which cost real time to find:

- React 19.3 added `createFragmentInstance` and `suspendOnActiveViewTransition` *before* `@types/react-reconciler` described them. A missing member is a `TypeError` at commit time, not a type error at build time.
- `react-reconciler@0.34` has **no `flushSync`** on the instance. The synchronous path is `updateContainerSync` + `flushSyncWork`, and `flushSyncFromReconciler` is the escape hatch. `injectIntoDevTools()` takes **no arguments** — it reads the renderer name and version from the host config.

If you pin React, pin it here too. See [DESIGN.md](./DESIGN.md) for the full list of accepted costs.

---

## Install

Not published to npm. Consume it from git, pinned to a commit:

```json
{
  "dependencies": {
    "@jixoai/casement": "github:jixoai/casement#<sha>&path:."
  }
}
```

`dist/` is committed so that installing by SHA needs no build step on your machine. `pnpm check:dist` fails if `dist/` is older than `src/`.

---

## Entry points

| Import | What it gives you | Pulls Electron? |
| --- | --- | --- |
| `@jixoai/casement` | React root, reconcile, plan, diff, geometry, policy | no |
| `@jixoai/casement/electron` | `ElectronAdapter` | yes |
| `@jixoai/casement/testing` | `MemoryAdapter` and tree builders | no |

The split is deliberate: importing casement in a test runner or a CI box must not drag Electron into the module graph.

---

## The element vocabulary

There are two elements. That is the whole vocabulary.

### `<Window>`

| Prop | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable identity. Two elements with the same id are the same window. |
| `kind` | `'profile' \| 'space' \| 'settings' \| 'float' \| 'panel'` | Lets the host choose host-specific behaviour (a `float` is shown without taking focus). |
| `width`, `height` | `number` | Content size. |
| `minWidth`, `minHeight` | `number?` | Minimum content size. |
| `visible` | `{ owner, value }?` | **Whether it should be on screen, and who says so.** Omitted means nobody asked — and a window nobody asked for is not on screen. |
| `chrome` | `Partial<ChromeMetrics>?` | Which chrome lanes are open. |

The `visible` default is the whole point. Creating a window used to imply revealing it, so an agent opening a window on the user's behalf could not avoid putting it in front of them. Mounting is now a separate gesture from showing.

### `<Layer>`

| Prop | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | Required. Also the default view id. |
| `viewId` | `string?` | Override the view id. Must be unique within the window. |
| `extent` | `Extent` | How it is sized. Defaults to `{ kind: 'content' }`. |
| `visible` | `boolean?` | Off screen while keeping its rectangle. Defaults to `true`. |

**Document order is stacking order**: a later layer is drawn over an earlier one. This is the single definition of z-order in the library. The adapter is told the order and is never allowed to invent one.

### Extents

```ts
{ kind: 'fill' }                                        // whole content area
{ kind: 'content' }                                     // below the chrome bar
{ kind: 'chrome' }                                      // the chrome bar itself
{ kind: 'hidden' }                                      // present, occupying nothing
{ kind: 'anchored', corner, margin, size, against? }    // a float
```

An anchored extent is clamped to its reference box *minus its own margin*, so a float always keeps the gap that says it is floating and can never hang off the edge where it cannot be reached.

---

## Reconcile policy: which OS facts may write back

The OS is a second author. The user drags, minimizes, and closes; a tiling script resizes. `src/reconcile/policy.ts` is the complete answer, in one table:

| Fact | Action | Why |
| --- | --- | --- |
| `moved` | ignore | Position belongs to the OS. casement never stores it, so there is nothing to adopt. |
| `resized` | **adopt** | Undoing a resize the user just made is the classic "bouncing window" bug. |
| `minimize` / `restore` | **adopt** | Otherwise a later commit un-minimizes a window they put away. |
| `maximize` / `unmaximize` | **adopt** | Same. |
| `enter-full-screen` / `leave-full-screen` | **adopt** | Same. |
| `show` / `hide` | ignore | These are echoes of our own calls. Adopting them would make derived visibility feed itself; convergence terminates the echo instead. |
| `focus` / `blur` | ignore | Focus is a request counter. "Who is focused" is a query. |
| `closed` / `destroyed` | **event** | Not state. The app unmounts the window; the unmount destroys it. |

Adopting means writing the fact into the tree as a claim authored by `human` — the user's gesture is the most authoritative statement of intent available. It is deliberately **not** extensible by callers: a rule engine is the complexity this design exists to avoid.

---

## Convergence, and why the loop is a loop

```
actual = adapter.snapshot()        // query the host
desired = plan(tree)               // pure projection
ops = diff(actual, desired)        // pure
if ops is empty -> done
commit(adapter, ops)               // the one mutation path
repeat
```

One pass would not be enough. `setBounds` can be clamped, `show` on an unloaded window can be deferred, and a resize can arrive between two of our own calls. Re-reading after each pass is what turns "eventually correct" into "correct, and provably so": the exit condition is a statement about the screen, not about our intent.

The pass cap (default 4) is a guard, not a policy. Hitting it is reported with the outstanding ops, so an OS that genuinely refuses a size is legible instead of hanging the main process.

---

## Testing without a display

The pure layers — plan, geometry, visibility, diff — never touch a host, and the loop runs against `MemoryAdapter`. That is not a testing convenience bolted on afterwards; it is the reason the design is split this way.

```ts
import { reconcile, NO_FOCUS } from '@jixoai/casement';
import { MemoryAdapter, TEST_CHROME_SPEC, windowNode, layerNode, withChildren } from '@jixoai/casement/testing';

const adapter = new MemoryAdapter();
const tree = {
  type: 'root',
  children: [withChildren(windowNode({ id: 'w', visible: true }), [layerNode({ name: 'content' })])],
  onCommit: null,
};
reconcile(tree, adapter, { chrome: TEST_CHROME_SPEC, focus: NO_FOCUS });
// adapter.windows, adapter.calls are now assertable
```

---

## Development

```bash
pnpm install
pnpm typecheck      # tsc --noEmit
pnpm test           # node --test, 70 tests, no display needed
pnpm build          # tsc -> dist/ (committed)
pnpm check:dist     # fails if dist/ is stale
```

Tests run on Node's built-in runner with type stripping, so there is no test framework and no transform step. That requires Node >= 22.6 and erasable-only TypeScript syntax (no `enum`, no `namespace`, no parameter properties) — a constraint the source follows throughout.

---

## Prior art

casement is not the first React renderer for a non-DOM host, and it borrows deliberately:

- **[react-x11](https://github.com/sidorares/react-x11)** — the closest analogue: React onto X11 windows. Three lessons came from it directly. `createInstance` must perform no host calls, because a render phase may be discarded (their issue #4). Showing must be deferred to the end of the commit, because React hides a subtree only *after* inserting it, and a map-then-unmap pair can leave a window stuck on screen under a redirecting window manager (their issue #201). And a window's visibility should be re-derived from its writers rather than toggled imperatively — their `_applyHidden` is the direct ancestor of `isWindowVisible`.
- **[ink](https://github.com/vadimdemedes/ink)** — the most complete production renderer on exactly our stack (`react-reconciler@^0.34.0`, `react@^19.3.0`). Its host config is the reference for the 0.34 member surface, including the React 19.3 members the types do not yet describe.
- **[react-nil](https://github.com/pmndrs/react-nil)** — the minimal viable host config, and a useful check on how little is actually required.
- **[react-tray](https://github.com/mkramb/react-tray)** — an Electron tray renderer. Proof that this direction works on Electron, and a reminder of how much a pre-0.20 host config leaves out.

Nothing off-the-shelf does this. A GitHub code search for `react-reconciler` together with `WebContentsView` or `BaseWindow` returns nothing; the closest repository, `javaxiu/reactron`, is a single-commit Electron + React boilerplate with no reconciler in it, and `electron-webcontentsview-manager` is a DOM-side React component that drives a main-process manager over IPC — a different architecture, in which the window tree is not the source of truth.

---

## License

Apache-2.0. Commercial terms for uses the licence does not cover are negotiable separately.
