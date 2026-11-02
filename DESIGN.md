# casement — design

This document records *why* casement looks the way it does. It exists so that the next person can argue with a decision instead of rediscovering it.

## The problem, concretely

The window layer casement replaces was imperative: code called `win.show()`, `win.setBounds()`, `contentView.addChildView()` wherever it happened to need them. Two failure modes followed, and both were customer-visible.

**Side effects smuggled into creation.** Creating a window also revealed it, because the reveal was on the same line of code. An agent opening a window on the user's behalf therefore put a window in front of them, unasked. The fix at the call site was one deleted line — and it would have been re-added by the next person, because nothing in the type system or the structure said "these are two gestures".

**Z-order maintained by hand.** Stacking order was a list recomputed on every layout, plus a verifier that logged violations and re-ran the reorder as "self-healing". The verifier existing at all was the tell: if the order had to be *checked*, it was being maintained in a second place. React already maintains sibling order; the layer was re-deriving it, badly.

Both are symptoms of one cause: the arrangement lived in code that ran, rather than in a value that could be compared.

## The shape of the answer

```
        React render                      pure                    one place
  ┌──────────────────────┐   ┌────────────────────┐   ┌──────────────────────┐
  │  tree (elements)     │──▶│  plan() -> desired │──▶│  diff(actual,desired)│
  └──────────────────────┘   └────────────────────┘   └──────────┬───────────┘
            ▲                                                    │
            │                                          ┌─────────▼─────────┐
            │                                          │ commit(adapter)   │  ← the only
            │                                          └─────────┬─────────┘    mutation path
            │                                                    │
            │              ┌────────────────────┐                │
            └──────────────│ actual = snapshot()│◀───────────────┘
                           └────────────────────┘
```

Six decisions, each with the alternative that was rejected.

### 1. The tree is the only source of truth

**Chosen.** Windows and layers are React elements. Nothing else may describe the arrangement.

**Rejected: a state store that the window layer subscribes to.** A store plus a renderer is two sources — the store, and whatever the renderer last saw. Every bug then has an extra question ("did the store change, or did the renderer miss it?"). React already is a state-to-tree engine; using it removes a layer rather than adding one.

**Cost.** The tree must be expressible as elements, which means the app has to think in terms of windows and layers rather than in terms of calls. That is the point, but it is a real migration cost.

### 2. One commit path

**Chosen.** `src/reconcile/commit.ts` holds the only `switch` over ops and the only calls to mutating host methods. The `HostAdapter` instance is not reachable from anywhere else in the library.

**Rejected: a lint rule or a code-review convention.** A convention decays. An exhaustive `switch` over a closed union does not: a new op fails to compile until it is given a host call, and there is no `default:` branch that silently drops it.

**Cost.** Some host-specific needs do not fit an op. The escape hatch is to add an op — which is deliberate friction, and has been enough for everything so far.

### 3. Ownership is data, not a permission system

**Chosen.** `{ owner: 'human' | 'agent', value }`. Any writer may write; the author is recorded.

**Rejected: a policy engine with rules and an allow/deny decision.** Explicitly rejected by the owner as an unmaintainable concept, and correctly: the question that actually arose was "who asked for this?", which is provenance, not authorisation. Answering it needs a field, not an engine.

**Rejected: refusing agent writes to visibility.** Tempting and wrong. An agent *must* be able to show a window — that is a legitimate feature. What must not happen is showing one *incidentally*. The fix is separating creation from visibility, not fencing the agent out.

**Cost.** There is no enforcement. If an app passes `{ owner: 'human' }` for an agent-initiated reveal, casement will believe it. This is a diagnostic aid, not a security boundary, and the README says so.

### 4. Store causes, derive results

**Chosen.** A layer holds an `Extent` — `content`, `chrome`, `anchored { corner, margin, size }`. The rectangle is computed by `projectExtent` from the window size and chrome height on every plan.

**Rejected: storing a rect and updating it on resize.** This is what the previous layer did, and it produced two copies of the truth: the window's real size, and the rects computed from a size that might be stale. Deriving makes that class of bug unrepresentable — there is nothing to be out of date.

**Rejected: a layout engine (yoga/flexbox).** The arrangement here is one-dimensional and tiny: a bar at the top, content below it, floats anchored to a corner. A flexbox would be a dependency, a layout pass, and a second coordinate system for four cases.

**Cost.** An extent cannot express "wherever this other thing ended up". Anchoring is to a corner of a reference box, not to an arbitrary element. If that is ever needed, it is a new extent kind, deliberately.

### 5. `actual` is a query-backed cache

**Chosen.** `adapter.snapshot()` queries the host before every diff.

**Rejected: an event-driven model.** This is the trap, and it is worth spelling out because it looks obviously right. Electron does not emit an event for every change — a view's bounds can move silently, and a tiling script can resize a window without a notification. Worse, our own `show()` comes back as an OS event indistinguishable from the user's. A model fed by events drifts; a drifted model oscillates, because reconcile re-applies a delta the stale copy never accepted, and the loop never terminates.

**Cost.** Every reconcile costs a query per window. In practice this is a handful of property reads on objects already in memory, and it is what makes convergence a property rather than a hope.

### 6. Convergence, not suppression

**Chosen.** The loop exits when `diff(actual, desired)` is empty.

**Rejected: a `suppressEvents` flag around our own mutations.** Every renderer that starts with this flag eventually has a bug where the flag is set, an exception is thrown, and the flag is never cleared — after which the window layer is deaf. Idempotence has no state to leak: the echo arrives, the diff is already empty, nothing happens.

**Cost.** The loop can run more than once for a single change (create → attach → size → show is genuinely several host-visible steps). Capped at 4 passes, and measured: a full converge is sub-millisecond against the memory adapter.

## Accepted costs

These are known, permanent, and not going to be fixed by trying harder.

**1. `react-reconciler` is not a public React API.** Its host config tracks React's minors (0.31→19.0, 0.32→19.1, 0.33→19.2, 0.34→19.3). A React minor upgrade may require editing `src/react/hostConfig.ts`. Mitigation: pin both, and keep every version-specific detail in that one file with a comment naming the version it belongs to.

**2. The host config is large.** Around 48 members are required and roughly 114 more are optional; many are empty implementations. That is 300–500 lines of adapter that exist only because React calls them. Mitigation: every no-op is grouped and labelled by contract section, so the file reads as a checklist rather than as noise.

**3. The OS is a second author.** Users drag, minimize, and close windows. Without an explicit policy the app either fights the user or forgets what they did. Mitigation: `src/reconcile/policy.ts` is the complete table, in one place, with a reason per row. It is not extensible, on purpose.

**4. Asynchronous creation versus synchronous `createInstance`.** `createInstance` may run for a render that is discarded, so it must not allocate an OS window. Creation therefore happens in the commit, and there is a real gap between "the node exists" and "the window can be shown" — modelled explicitly as `pending → creating → ready`, with `ready` reported by the host and re-synced on every pass. Mitigation: only `ready` windows are ever shown, which also removes the blank-window flash.

**5. StrictMode double-mounts.** StrictMode re-runs render, so `createInstance` runs twice. A renderer that allocated during render would create two windows and leak one. Mitigation: instances are pure data and creation is in the commit, so the discarded pass costs nothing. There is a test for exactly this.

**6. Resize is a high-frequency event.** Each resize triggers a plan and a commit. Measured: the plan is arithmetic over a handful of layers, and the diff is a comparison of small arrays. If it ever matters, the plan can be memoised on `(size, chromeMetrics)` — but it is not memoised now, because premature caching is how stale values get introduced.

**7. A custom renderer is invisible in React DevTools by default.** Mitigation: `connectToDevTools()` injects into the hook when one is present, and is a no-op otherwise. Note that `injectIntoDevTools()` takes no arguments in 0.34 — it reads `rendererPackageName` and `rendererVersion` from the host config.

## Alternatives considered and rejected outright

**Preact (`preact-reconciler`).** v0.2.3, last published 2025-05, ~72 downloads/week. Effectively unmaintained. Its 4 KB advantage is worth nothing in an Electron main process, which already has React.

**Solid (`solid-js/universal`).** Officially supported and genuinely good, but the ecosystem around a custom universal renderer is thin, and it would be a second framework in a codebase that is React.

**Vue (`@vue/runtime-core` `createRenderer`).** The most stable custom-renderer API of the three, officially documented. Rejected only because it means a second framework — the renderer would be excellent and the codebase would be split.

**Effect 4 / Effect Atom.** The Atom API is `@stability unstable` and models UI shape, not OS resources. Effect is a good fit for scopes and resource lifetimes; it is not a reconciler, and adopting it would mean writing the reconciliation anyway, in a less familiar idiom.

**Buying it.** Nothing exists to buy. See the README's prior-art section: no repository combines `react-reconciler` with `BaseWindow` or `WebContentsView`.

## Things deliberately left out

- **No animation.** Windows appear and disappear. Animation would mean a time-varying desired state, which is a different (and much larger) model.
- **No persistence.** Window geometry is not saved. Session restore is an app concern; casement would have to own a schema and a migration story.
- **No multi-display logic.** Position is the OS's, so there is nothing to compute.
- **No second host.** The `HostAdapter` interface exists so that a second host *would be* an implementation rather than a rewrite. Writing a speculative second implementation now would be guessing at which parts are general.
