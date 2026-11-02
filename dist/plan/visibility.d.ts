/**
 * The one place a window's visibility is decided.
 *
 * This function is short on purpose. The bug that motivated casement was a
 * window appearing because the *act of creating it* also revealed it: creation
 * and visibility were the same gesture, so an agent opening a window on the
 * user's behalf could not avoid putting it on screen. The fix is not a check
 * that refuses the reveal — it is that the two are now different things, and
 * this is the only expression that can make a window visible.
 *
 * There is no policy table here and no notion of who is *allowed* to ask. Any
 * writer may set the claim; the claim is what it says it is. What changed is
 * that saying "this window exists" no longer says "and show it".
 */
import type { Claim } from '../types.ts';
import type { WindowNode } from '../tree/nodes.ts';
/** The inputs to the decision, spelled out so the decision can be tested alone. */
export interface VisibilityInput {
    /** Where the window is in its life. */
    readonly phase: WindowNode['phase'];
    /** Whether React is currently hiding the subtree. */
    readonly hiddenByReact: boolean;
    /** The last explicit request, or null when nobody has made one. */
    readonly claim: Claim<boolean> | null;
}
/**
 * Whether a window belongs on screen.
 *
 * A window is visible when, and only when, all four hold:
 *
 * - it is `ready` — showing a window that has no content yet is a flash of
 *   background, and showing one that is `closing` is a resurrect;
 * - React is not hiding its subtree — a Suspense boundary that suspends must
 *   not leave a window behind it;
 * - somebody has actually asked — a window nobody asked for is not on screen,
 *   which is the whole point: mounting is not asking;
 * - and what they asked for is `true`.
 *
 * Note the shape: one expression, four inputs, no branches that consult
 * anything else. Adding a fifth input is a design change, not a tweak.
 */
export declare function isWindowVisible(input: VisibilityInput): boolean;
/** A claim, or nothing. */
export declare function makeClaim<T>(owner: Claim<T>['owner'], value: T, at: number): Claim<T>;
