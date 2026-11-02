/**
 * Test helpers.
 *
 * Published rather than kept in test/, because the useful thing to test with a
 * window layout is the layout, and an app author should not have to build a
 * fake host to do it.
 */
export { MemoryAdapter } from './memory.ts';
export type { MemoryCall, MemoryWindow } from './memory.ts';
import type { ContainerNode, LayerNode, WindowNode } from '../tree/nodes.ts';
import type { ChromeMetrics, ChromeSpec, Extent, Owner } from '../types.ts';
/** Chrome pixel heights used by tests and by the examples. */
export declare const TEST_CHROME_SPEC: ChromeSpec;
/** Chrome metrics with everything closed. */
export declare const CHROME_CLOSED: ChromeMetrics;
/**
 * Build a window node by hand.
 *
 * The React layer is exercised separately (test/react.test.ts); the planner and
 * diff tests build nodes directly so a failure points at the arithmetic rather
 * than at a render.
 */
export declare function windowNode(spec: {
    id: string;
    width?: number;
    height?: number;
    visible?: boolean;
    owner?: Owner;
    chrome?: Partial<ChromeMetrics>;
    phase?: WindowNode['phase'];
}): WindowNode;
/** Build a layer node by hand. */
export declare function layerNode(spec: {
    name: string;
    viewId?: string;
    extent?: Extent;
    visible?: boolean;
}): LayerNode;
/** Attach children to a node, keeping the parent pointers consistent. */
export declare function withChildren<T extends ContainerNode>(parent: T, children: ContainerNode[]): T;
