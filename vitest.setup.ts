import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * jsdom does not implement the browser APIs the UI relies on. Provide inert
 * stand-ins so component tests exercise real component code instead of guards.
 */

// Node-environment suites (services/api) do not define `window`; the browser
// stubs below only apply to the jsdom suites.
const hasDom = typeof window !== 'undefined';

if (hasDom && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

if (hasDom && !globalThis.IntersectionObserver) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
  }
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

if (hasDom && !globalThis.ResizeObserver) {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}

if (hasDom) {
  // jsdom throws "Not implemented" for canvas contexts; return null so components
  // take their no-canvas fallback path.
  HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement['getContext'];

  if (!HTMLCanvasElement.prototype.toDataURL) {
    HTMLCanvasElement.prototype.toDataURL = () => 'data:,';
  }

  if (!window.scrollTo) {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  }
}

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      randomUUID: () =>
        `test-${Math.random().toString(16).slice(2)}` as `${string}-${string}-${string}-${string}-${string}`,
    },
  });
}

afterEach(() => {
  // RTL auto-cleanup only runs with globals enabled; we import explicitly.
  cleanup();
  vi.restoreAllMocks();
});
