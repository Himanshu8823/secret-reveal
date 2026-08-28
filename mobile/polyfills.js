// 1. DOMException — React Native 0.81 ships a `DOMException` class but
//    does NOT install it as a global. A few libraries (e.g. `whatwg-fetch`)
//    reference it during module init for a defensive check. Provide a
//    minimum-viable class so that code path doesn't throw.
if (typeof globalThis.DOMException === 'undefined') {
  globalThis.DOMException = class DOMException extends Error {
    constructor(message = '', name = 'DOMException') {
      super(message);
      this.name = name;
    }
  };
}

// 2. RN 0.81's `Event` class (in
//    `react-native/src/private/webapis/dom/events/Event.js`) declares
//    constants like `+NONE: 0;` and then defines the same names on
//    `Event.prototype` via `Object.defineProperty` WITHOUT `writable: true`
//    or `configurable: true`. The babel preset's `loose: true` mode
//    rewrites each class field as a bare `this.X = 0;` in the constructor
//    — which throws "Cannot assign to read-only property 'NONE'" the
//    first time an `Event` is constructed (i.e. on the first network
//    call, when RN's XMLHttpRequest dispatches 'readystatechange').
//
//    Fix: redefine those four prototype properties as plain
//    writable + configurable + enumerable data properties. The class
//    field assignment `this.X = 0` then succeeds (creates an own
//    writable shadow) and downstream code that reads `Event.NONE` etc.
//    still gets `0` from the prototype.
(function patchEventConstants() {
  try {
    // Resolve RN's bundled Event class via a dummy `new Event('x')`.
    // This works in any RN runtime where Event is a global; if it's
    // not (e.g. unit tests on Node), skip silently.
    const Probe = globalThis.Event;
    if (!Probe) return;
    for (const key of ['NONE', 'CAPTURING_PHASE', 'AT_TARGET', 'BUBBLING_PHASE']) {
      // Re-define with explicit writable + configurable. We don't know
      // the original value, but the babel-loose output is `this.X = 0`
      // for NONE / `= 1` for CAPTURING_PHASE / `= 2` for AT_TARGET /
      // `= 3` for BUBBLING_PHASE. Setting the prototype to the matching
      // value keeps the contract intact for reads.
      const value = { NONE: 0, CAPTURING_PHASE: 1, AT_TARGET: 2, BUBBLING_PHASE: 3 }[key];
      Object.defineProperty(Probe.prototype, key, {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
  } catch {
    // If anything goes wrong, fall through — the original prototype
    // properties remain and the runtime will surface the same
    // "Cannot assign to read-only property" error rather than masking
    // it with a worse downstream failure.
  }
})();
