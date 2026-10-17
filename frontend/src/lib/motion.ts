import { useEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Live reduced-motion preference. */
export function useReducedMotion(): boolean {
  const [r, setR] = useState(prefersReducedMotion());
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setR(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return r;
}

/** Tweens a number to its new value in < 400 ms; instant under reduced motion. */
export function useTweenedNumber(value: number | null | undefined, ms = 320): number | null {
  const [shown, setShown] = useState<number | null>(typeof value === 'number' ? value : null);
  const from = useRef<number | null>(shown);
  useEffect(() => {
    if (typeof value !== 'number') { setShown(null); from.current = null; return; }
    const start = from.current;
    if (start === null || prefersReducedMotion() || start === value) { setShown(value); from.current = value; return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * eased;
      setShown(k < 1 ? v : value);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, ms]);
  return shown;
}
