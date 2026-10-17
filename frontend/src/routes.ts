/** Route table shared by both themes. Console pages live under /console/*. */
export const CONSOLE_PAGES = [
  'schedule', 'fleet', 'personnel', 'tasks', 'scenarios', 'analytics', 'benchmarks', 'audit', 'settings', 'about',
] as const;

/** Old (pre-v3) paths → new paths. */
export const REDIRECTS: Record<string, string> = {
  '/mission': '/',
  '/dashboard': '/console',
  '/fleet': '/console/fleet',
  '/personnel': '/console/personnel',
  '/tasks': '/console/tasks',
  '/schedule': '/console/schedule',
  '/scenarios': '/console/scenarios',
  '/analytics': '/console/analytics',
  '/benchmarks': '/console/benchmarks',
  '/audit': '/console/audit',
  '/settings': '/console/settings',
  '/about': '/console/about',
  '/register': '/signup',
  '/signin': '/login',
  '/sign-in': '/login',
  '/sign-up': '/signup',
};

/** Normalises a pathname: strips trailing slashes and applies legacy redirects. */
export function normalizePath(path: string): string {
  let p = path.replace(/\/+$/, '') || '/';
  if (REDIRECTS[p]) p = REDIRECTS[p];
  return p;
}

export function isKnownPath(p: string): boolean {
  if (p === '/' || p === '/console' || p === '/signup' || p === '/login') return true;
  const m = p.match(/^\/console\/([a-z]+)$/);
  return !!m && (CONSOLE_PAGES as readonly string[]).includes(m[1]);
}
