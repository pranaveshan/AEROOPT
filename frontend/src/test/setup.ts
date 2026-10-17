import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });

// jsdom has no WebGL or matchMedia: the 3D viewer must fall back to its SVG.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    value: (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }),
  });
}
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
