import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement Range#getClientRects / getBoundingClientRect
// properly, which causes Svelte's click handlers to throw when an element
// is scrolled into view. Polyfill the methods to return empty/default values.
if (typeof Range !== 'undefined' && Range.prototype) {
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = function (): DOMRectList {
      const list: DOMRect[] = [];
      const empty: DOMRectList = {
        length: 0,
        item: (_i: number) => null,
        [Symbol.iterator]: function* () {},
        ...list,
      } as unknown as DOMRectList;
      return empty;
    };
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = function (): DOMRect {
      return {
        x: 0,
        y: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  }
}

// jsdom 25 also doesn't implement Element.prototype.scrollIntoView reliably.
if (typeof Element !== 'undefined' && Element.prototype) {
  const proto = Element.prototype as { scrollIntoView?: (arg?: boolean | ScrollIntoViewOptions) => void };
  if (typeof proto.scrollIntoView !== 'function') {
    proto.scrollIntoView = function (): void {
      // no-op
    };
  }
}

// jsdom 25 doesn't have PointerEvent in some test contexts.
if (typeof globalThis.PointerEvent === 'undefined' && typeof MouseEvent !== 'undefined') {
  // @ts-expect-error - polyfill for testing
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    public pointerId: number;
    public pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  };
}

// jsdom doesn't implement matchMedia. The SplitPane component uses it
// for the auto mobile/desktop detection. Polyfill a no-op implementation.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// ResizeObserver polyfill (SplitPane uses it to track container width).
if (typeof globalThis.ResizeObserver === 'undefined') {
  // @ts-expect-error - polyfill for testing
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
