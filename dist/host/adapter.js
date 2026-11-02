/**
 * What a host has to be able to do.
 *
 * One interface, with exactly the operations the op vocabulary needs — no
 * capability flags, no feature negotiation, no plugin registry. The point of
 * having it at all is that the pure layers (plan, diff, loop) are written
 * against this and not against Electron, so they can be tested with a fake and
 * so a second host would be an implementation rather than a rewrite.
 *
 * It is deliberately *not* an abstraction over windowing systems in general.
 * There is one method per op, named after the op. If a second host needs a
 * different shape, that is the moment to find out, not now.
 */
export {};
