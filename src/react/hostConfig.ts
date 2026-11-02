/**
 * The react-reconciler host config.
 *
 * This is the one file that has to track React. react-reconciler is not a public
 * React API: it is the internal engine react-dom is built on, published so that
 * renderers like this one are possible, and its host-config surface changes with
 * React's minor versions (0.31 ↔ 19.0, 0.32 ↔ 19.1, 0.33 ↔ 19.2, 0.34 ↔ 19.3).
 * casement therefore pins both, and this file is expected to need work at each
 * upgrade. See DESIGN.md, "Accepted costs".
 *
 * Three things here are easy to get wrong and expensive to debug:
 *
 * 1. **createInstance must not touch the host.** React may render a tree and
 *    throw it away — StrictMode's double render, an abandoned transition, a
 *    Suspense retry that never commits. An instance that allocated an OS window
 *    during render leaks that window. So instances are pure objects and every
 *    host call happens in the commit phase (finalizeInitialChildren /
 *    commitMount / resetAfterCommit). react-x11 learned this the hard way
 *    (their issue #4); this design inherits the lesson.
 *
 * 2. **React hides a subtree only after inserting it.** `hideInstance` runs at
 *    the end of the mutation phase, so a window born inside a hidden subtree is
 *    inserted *then* hidden. If insertion showed it, it would flash — or, worse,
 *    on a window manager that redirects maps, get stuck on screen (react-x11
 *    issue #201). So showing is deferred to the end of the commit, when the
 *    hidden flag is already final.
 *
 * 3. **Members the types do not know about still get called.** React 19.3 added
 *    `createFragmentInstance` and `suspendOnActiveViewTransition` before
 *    @types/react-reconciler described them; a missing member is a TypeError at
 *    the worst possible moment. The members below are the union of what 0.34
 *    calls and what the types declare, with the extras called out.
 */

import { createContext } from 'react';
import type { ReactContext } from 'react-reconciler';
import {
  DefaultEventPriority,
  NoEventPriority,
} from 'react-reconciler/constants.js';

import type { ContainerNode, LayerNode, WindowNode } from '../tree/nodes.ts';
import { insertBefore, removeChild } from '../tree/nodes.ts';
import type { ChromeMetrics, Claim, Extent, Owner, Size, ViewId, WindowKind } from '../types.ts';

/** Props accepted by `<Window>`. */
export interface WindowProps {
  /** Stable identity. Two windows with the same id are the same window. */
  readonly id: string;
  readonly kind?: WindowKind;
  readonly width: number;
  readonly height: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  /**
   * Whether this window should be on screen, and who says so.
   *
   * Omitting it means "nobody has asked", and a window nobody asked to see is
   * not on screen. That default is the entire fix for the bug that motivated
   * casement: creating a window used to imply revealing it, so an agent opening
   * a window on the user's behalf could not avoid putting it in front of them.
   * Creation and visibility are now different gestures.
   */
  readonly visible?: { owner: Owner; value: boolean };
  readonly chrome?: Partial<ChromeMetrics>;
  readonly children?: unknown;
}

/** Props accepted by `<Layer>`. */
export interface LayerProps {
  readonly name: string;
  /** Overrides the generated view id. Must be unique across the app. */
  readonly viewId?: ViewId;
  readonly extent?: Extent;
  readonly visible?: boolean;
  readonly children?: unknown;
}

/** A window instance, with the React-side extras. */
export interface WindowInstance extends WindowNode {
  /** Mirrors the `visible` prop into a claim, stamped on write. */
  setVisibleClaim(claim: Claim<boolean> | null): void;
  setChrome(metrics: Partial<ChromeMetrics> | undefined): void;
  setSize(size: Size, minSize: Size | null): void;
}

/** A layer instance. */
export interface LayerInstance extends LayerNode {
  setExtent(extent: Extent): void;
  setVisible(visible: boolean): void;
}

/** The container handed to React: one per app. */
export interface RootContainer {
  readonly type: 'root';
  readonly children: ContainerNode[];
  /** Called at the end of every commit, so the app can reconcile. */
  onCommit: (() => void) | null;
}

/** Host context. Nothing needs to be threaded down yet. */
interface HostContext {
  readonly inWindow: boolean;
}

const ROOT_CONTEXT: HostContext = Object.freeze({ inWindow: false });
const IN_WINDOW_CONTEXT: HostContext = Object.freeze({ inWindow: true });

/** Monotonic clock for claim stamps. */
let clock = 0;
function stamp(): number {
  clock += 1;
  return clock;
}

/** Default chrome metrics: just a tab strip. */
function normaliseChrome(
  partial: Partial<ChromeMetrics> | undefined | null,
): ChromeMetrics {
  return {
    tabStrip: partial?.tabStrip ?? 0,
    bookmarkBar: partial?.bookmarkBar ?? false,
    findBar: partial?.findBar ?? false,
    permissionLane: partial?.permissionLane ?? false,
    passwordLane: partial?.passwordLane ?? false,
    expanded: partial?.expanded ?? false,
  };
}

/**
 * Deferred work for the commit in progress.
 *
 * A commit is synchronous, so these sets are only ever non-empty inside
 * `resetAfterCommit`; they exist to make the two "at the end of the commit"
 * behaviours explicit rather than implied.
 */
interface CommitQueue {
  /** Containers whose tree changed and need a reconcile. */
  readonly dirty: Set<RootContainer>;
}

const pendingCommit: CommitQueue = { dirty: new Set() };

let currentUpdatePriority: number = NoEventPriority;

/** Build the host config. One instance per renderer. */
export function createHostConfig(metadata: {
  readonly packageName: string;
  readonly version: string;
}): any {
  const hostConfig = {
    isPrimaryRenderer: true,
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    supportsMicrotasks: true,
    scheduleMicrotask: queueMicrotask,
    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
    noTimeout: -1,

    rendererPackageName: metadata.packageName,
    rendererVersion: metadata.version,
    extraDevToolsConfig: null,

    getRootHostContext(): HostContext {
      return ROOT_CONTEXT;
    },

    getChildHostContext(parent: HostContext, type: string): HostContext {
      if (type === 'window') return IN_WINDOW_CONTEXT;
      return parent;
    },

    getPublicInstance(instance: ContainerNode): ContainerNode {
      return instance;
    },

    /**
     * Instances are pure. No OS object is created here — see the header.
     *
     * The one thing that is decided here is whether the element is legal where
     * it was written, because a throw during render can be caught by an error
     * boundary above it, whereas a throw during commit cannot.
     */
    createInstance(
      type: string,
      props: Record<string, unknown>,
      container: RootContainer,
      hostContext: HostContext,
    ): ContainerNode {
      if (type === 'window') {
        const p = props as unknown as WindowProps;
        if (typeof p.id !== 'string' || p.id.length === 0) {
          throw new Error('casement: <Window> requires a non-empty string id');
        }
        if (typeof p.width !== 'number' || typeof p.height !== 'number') {
          throw new Error(
            `casement: <Window id="${p.id}"> requires numeric width and height`,
          );
        }
        const instance: WindowInstance = {
          type: 'window',
          id: `window:${p.id}`,
          windowId: p.id,
          kind: p.kind ?? 'profile',
          parent: null,
          children: [],
          size: { width: p.width, height: p.height },
          minSize:
            typeof p.minWidth === 'number' || typeof p.minHeight === 'number'
              ? {
                  width: p.minWidth ?? 0,
                  height: p.minHeight ?? 0,
                }
              : null,
          visibleClaim:
            p.visible === undefined
              ? null
              : { owner: p.visible.owner, value: p.visible.value, at: stamp() },
          hiddenByReact: false,
          phase: 'pending',
          chromeMetrics: normaliseChrome(p.chrome),
          setVisibleClaim(claim) {
            this.visibleClaim = claim;
            pendingCommit.dirty.add(container);
          },
          setChrome(metrics: Partial<ChromeMetrics> | undefined) {
            this.chromeMetrics = normaliseChrome(metrics);
            pendingCommit.dirty.add(container);
          },
          setSize(size, minSize) {
            this.size = size;
            this.minSize = minSize;
            pendingCommit.dirty.add(container);
          },
        };
        remember(instance, container);
        pendingCommit.dirty.add(container);
        return instance;
      }

      if (type === 'layer') {
        if (!hostContext.inWindow) {
          throw new Error(
            'casement: <Layer> must be inside a <Window>; a window holds layers, and layers hold nothing',
          );
        }
        const p = props as unknown as LayerProps;
        if (typeof p.name !== 'string' || p.name.length === 0) {
          throw new Error('casement: <Layer> requires a non-empty string name');
        }
        const instance: LayerInstance = {
          type: 'layer',
          id: `layer:${p.name}`,
          name: p.name,
          // Defaults to the layer's name. Ids only have to be unique within one
          // window (the adapter keys views per window), and a predictable id is
          // what lets the app say "the content view of this window" without
          // keeping a map. Set `viewId` explicitly when two layers in the same
          // window would share a name.
          viewId: p.viewId ?? p.name,
          parent: null,
          children: [],
          extent: p.extent ?? { kind: 'content' },
          visible: p.visible ?? true,
          setExtent(extent) {
            this.extent = extent;
            pendingCommit.dirty.add(container);
          },
          setVisible(visible) {
            this.visible = visible;
            pendingCommit.dirty.add(container);
          },
        };
        remember(instance, container);
        pendingCommit.dirty.add(container);
        return instance;
      }

      throw new Error(
        `casement: unknown element <${type}>. The vocabulary is <Window> and <Layer>.`,
      );
    },

    createTextInstance(): never {
      throw new Error(
        'casement: raw text is not renderable. A window tree holds <Window> and <Layer> elements only; put text in the web content behind a layer.',
      );
    },

    shouldSetTextContent(): boolean {
      return false;
    },

    appendInitialChild(parent: ContainerNode, child: ContainerNode): void {
      insertBefore(parent, child, null);
    },

    appendChild(parent: ContainerNode, child: ContainerNode): void {
      insertBefore(parent, child, null);
      markDirty(parent);
    },

    appendChildToContainer(container: RootContainer, child: ContainerNode): void {
      container.children.push(child);
      child.parent = null;
      pendingCommit.dirty.add(container);
    },

    insertBefore(
      parent: ContainerNode,
      child: ContainerNode,
      before: ContainerNode,
    ): void {
      insertBefore(parent, child, before);
      markDirty(parent);
    },

    insertInContainerBefore(
      container: RootContainer,
      child: ContainerNode,
      before: ContainerNode,
    ): void {
      const at = container.children.indexOf(before);
      if (at === -1) container.children.push(child);
      else container.children.splice(at, 0, child);
      child.parent = null;
      pendingCommit.dirty.add(container);
    },

    removeChild(parent: ContainerNode, child: ContainerNode): void {
      removeChild(parent, child);
      markDirty(parent);
    },

    removeChildFromContainer(container: RootContainer, child: ContainerNode): void {
      const at = container.children.indexOf(child);
      if (at !== -1) container.children.splice(at, 1);
      pendingCommit.dirty.add(container);
    },

    /**
     * Nothing to do: an instance holds no host resource yet, and the adapter
     * creates what it needs from the tree at commit time.
     */
    clearContainer(container: RootContainer): void {
      container.children.length = 0;
      pendingCommit.dirty.add(container);
    },

    /**
     * Always `true`: the commit hook is where a window is actually created, so
     * every window mount needs it. Returning false would mean a window that only
     * appears on the second commit.
     */
    finalizeInitialChildren(): boolean {
      return true;
    },

    /**
     * Runs in the layout phase, after the whole mutation phase. This is the
     * earliest moment at which "is this window hidden?" is final — see the
     * header's point 2.
     */
    commitMount(): void {
      // The reconcile happens once, in resetAfterCommit, for the whole tree.
      // Doing it per-instance would run the loop once per window.
    },

    commitUpdate(
      instance: ContainerNode,
      _type: string,
      _oldProps: Record<string, unknown>,
      newProps: Record<string, unknown>,
    ): void {
      if (instance.type === 'window') {
        const p = newProps as unknown as WindowProps;
        const window = instance as WindowInstance;
        window.kind = p.kind ?? 'profile';
        window.setSize(
          { width: p.width, height: p.height },
          typeof p.minWidth === 'number' || typeof p.minHeight === 'number'
            ? { width: p.minWidth ?? 0, height: p.minHeight ?? 0 }
            : null,
        );
        window.setChrome(p.chrome);
        window.setVisibleClaim(
          p.visible === undefined
            ? null
            : { owner: p.visible.owner, value: p.visible.value, at: stamp() },
        );
        return;
      }
      const p = newProps as unknown as LayerProps;
      const layer = instance as LayerInstance;
      layer.setExtent(p.extent ?? { kind: 'content' });
      layer.setVisible(p.visible ?? true);
    },

    commitTextUpdate(): void {
      throw new Error('casement: text instances are not supported');
    },

    resetTextContent(): void {},

    /**
     * React hiding a subtree — `<Activity>`, a suspended `<Suspense>` boundary.
     *
     * Recorded, not acted on: the window is hidden by the planner, which folds
     * this into the one visibility expression. Acting here would hide the window
     * before the commit had decided whether it should be shown at all.
     */
    hideInstance(instance: ContainerNode): void {
      if (instance.type !== 'window') return;
      instance.hiddenByReact = true;
      markDirty(instance);
    },

    unhideInstance(instance: ContainerNode): void {
      if (instance.type !== 'window') return;
      instance.hiddenByReact = false;
      markDirty(instance);
    },

    hideTextInstance(): void {},
    unhideTextInstance(): void {},

    prepareForCommit(): null {
      return null;
    },

    /**
     * The end of the commit: everything is inserted, every hidden flag is final,
     * and this is the one moment a reconcile can see a consistent tree.
     *
     * Deferring to here is also what makes StrictMode safe. StrictMode re-runs
     * render (so `createInstance` runs twice) but commits once; because
     * instances hold no host resource, the discarded pass costs nothing, and the
     * host sees exactly one create.
     */
    resetAfterCommit(): void {
      const containers = [...pendingCommit.dirty];
      pendingCommit.dirty.clear();
      for (const container of containers) container.onCommit?.();
    },

    preparePortalMount(): void {},
    prepareScopeUpdate(): void {},

    getInstanceFromNode(): null {
      return null;
    },

    getInstanceFromScope(): null {
      return null;
    },

    detachDeletedInstance(): void {},

    beforeActiveInstanceBlur(): void {},
    afterActiveInstanceBlur(): void {},

    // React 19.3 fragment refs. Not in @types/react-reconciler 0.34.1 yet, but
    // React calls it: a <Fragment ref> must resolve to null rather than crash.
    createFragmentInstance(): null {
      return null;
    },

    // React 19.3 calls this on every transition-lane commit. There is no view
    // transition here to wait for.
    suspendOnActiveViewTransition(): void {},

    // ---- scheduling contract -------------------------------------------------

    setCurrentUpdatePriority(priority: number): void {
      currentUpdatePriority = priority;
    },

    getCurrentUpdatePriority(): number {
      return currentUpdatePriority;
    },

    resolveUpdatePriority(): number {
      return currentUpdatePriority === NoEventPriority
        ? DefaultEventPriority
        : currentUpdatePriority;
    },

    shouldAttemptEagerTransition(): boolean {
      return false;
    },

    trackSchedulerEvent(): void {},
    requestPostPaintCallback(): void {},

    resolveEventType(): null {
      return null;
    },

    resolveEventTimeStamp(): number {
      return -1.1;
    },

    // ---- Suspensey commits: not used -----------------------------------------

    maySuspendCommit(): boolean {
      return false;
    },

    maySuspendCommitOnUpdate(): boolean {
      return false;
    },

    maySuspendCommitInSyncRender(): boolean {
      return false;
    },

    preloadInstance(): boolean {
      return true;
    },

    startSuspendingCommit(): void {},
    suspendInstance(): void {},

    waitForCommitToBeReady(): null {
      return null;
    },

    getSuspendedCommitReason(): null {
      return null;
    },

    // ---- form actions / transitions: required by the contract, unused --------

    NotPendingTransition: null,
    HostTransitionContext: createContext(null) as unknown as ReactContext<unknown>,
    resetFormInstance(): void {},

    bindToConsole(methodName: string, args: unknown[]): () => void {
      const method = (console as unknown as Record<string, unknown>)[methodName];
      return () => {
        if (typeof method === 'function') {
          (method as (...a: unknown[]) => void).apply(console, args);
        }
      };
    },
  };

  return hostConfig;
}

/**
 * Which container each instance belongs to.
 *
 * A back-pointer on the node would make the tree cyclic and therefore
 * un-serializable — and serializability is one of the reasons the tree exists as
 * plain data. A WeakMap keeps the association without either cost: it does not
 * appear in JSON, and it does not keep a removed node alive.
 */
const owner = new WeakMap<ContainerNode, RootContainer>();

/** Remember which container an instance belongs to. */
function remember(node: ContainerNode, container: RootContainer): void {
  owner.set(node, container);
}

/** The container an instance belongs to, if it is still known. */
function rootOf(node: ContainerNode): RootContainer | null {
  return owner.get(node) ?? null;
}

/** Mark a container dirty because a node inside it changed. */
function markDirty(node: ContainerNode): void {
  const container = rootOf(node);
  if (container !== null) pendingCommit.dirty.add(container);
}
