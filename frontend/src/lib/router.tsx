/**
 * Minimal history router with View Transitions, per-route scroll restoration,
 * focus management and hover/focus prefetch. No external dependency.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { normalizePath } from '../routes';
import { prefersReducedMotion } from './motion';

type Ctx = { path: string; navigate: (to: string, opts?: { replace?: boolean }) => void };
const RouterCtx = createContext<Ctx>({ path: '/', navigate: () => {} });
const scrollMemory = new Map<string, number>();
const prefetchers = new Map<string, () => void>();

/** Register a chunk prefetch for a route prefix (e.g. '/console'). */
export function registerPrefetch(prefix: string, fn: () => void) { prefetchers.set(prefix, fn); }
export function prefetch(to: string) {
  for (const [prefix, fn] of prefetchers) if (to === prefix || to.startsWith(prefix + '/') || prefix === to) fn();
}

type DocWithVT = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const pending = useRef<'push' | 'pop' | null>(null);

  const commit = useCallback((p: string) => {
    const doc = document as DocWithVT;
    if (doc.startViewTransition && !prefersReducedMotion()) {
      doc.startViewTransition(() => { flushSync(() => setPath(p)); });
    } else {
      setPath(p);
    }
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const [rawPath, hash] = to.split('#');
    const p = normalizePath(rawPath || window.location.pathname);
    scrollMemory.set(window.location.pathname, window.scrollY);
    const url = p + (hash ? `#${hash}` : '');
    if (opts?.replace) window.history.replaceState({}, '', url); else window.history.pushState({}, '', url);
    pending.current = 'push';
    commit(p);
  }, [commit]);

  useEffect(() => {
    const onPop = () => { pending.current = 'pop'; commit(normalizePath(window.location.pathname)); };
    window.addEventListener('popstate', onPop);
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    return () => window.removeEventListener('popstate', onPop);
  }, [commit]);

  // After a route change: restore scroll on back/forward, scroll to top (or hash) on push, focus the new <h1>.
  useLayoutEffect(() => {
    if (!pending.current) return;
    const kind = pending.current; pending.current = null;
    const hash = window.location.hash.slice(1);
    if (kind === 'pop') window.scrollTo(0, scrollMemory.get(path) ?? 0);
    else if (hash) document.getElementById(hash)?.scrollIntoView();
    else window.scrollTo(0, 0);
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }, [path]);

  return <RouterCtx.Provider value={{ path, navigate }}>{children}</RouterCtx.Provider>;
}

export const useRouter = () => useContext(RouterCtx);

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };
/** Real <a href> (works without JS, middle-click, copy link) that navigates client-side. */
export function Link({ to, onClick, onMouseEnter, onFocus, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      {...rest}
      onMouseEnter={e => { prefetch(to); onMouseEnter?.(e); }}
      onFocus={e => { prefetch(to); onFocus?.(e); }}
      onClick={e => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (to.startsWith('#')) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}
