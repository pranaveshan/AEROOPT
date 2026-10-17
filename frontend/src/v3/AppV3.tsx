/** v3 "Cinematic Flight Ops": showcase at /, console at /console/*. */
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './styles/tokens-v3.css';
import './styles/v3.css';
import { Suspense, lazy, useEffect, type ComponentType } from 'react';
import { RouterProvider, registerPrefetch, useRouter, Link } from '../lib/router';
import { isKnownPath } from '../routes';
import { DataProvider } from './data';
import { AuthProvider } from './auth';
import { ConsoleShell } from './ConsoleShell';
import { ResourceEditor } from './ResourceEditor';
import { Skeleton, EmptyState } from './ui';
import Showcase from './pages/Showcase';
const Signup = lazy(() => import('./pages/Signup'));
const Login = lazy(() => import('./pages/Login'));
registerPrefetch('/login', () => { void import('./pages/Login'); });
registerPrefetch('/signup', () => { void import('./pages/Signup'); });

type Loader = () => Promise<{ default: ComponentType }>;
const loaders: Record<string, Loader> = {
  '/console': () => import('./pages/Dashboard'),
  '/console/schedule': () => import('./pages/Schedule'),
  '/console/fleet': () => import('./pages/Resources').then(m => ({ default: m.Fleet })),
  '/console/personnel': () => import('./pages/Resources').then(m => ({ default: m.Personnel })),
  '/console/tasks': () => import('./pages/Tasks'),
  '/console/scenarios': () => import('./pages/Scenarios'),
  '/console/analytics': () => import('./pages/Analytics'),
  '/console/benchmarks': () => import('./pages/Benchmarks'),
  '/console/audit': () => import('./pages/Audit'),
  '/console/settings': () => import('./pages/Settings'),
  '/console/about': () => import('./pages/About'),
};
const pages = Object.fromEntries(Object.entries(loaders).map(([k, l]) => [k, lazy(l)]));
Object.entries(loaders).forEach(([k, l]) => registerPrefetch(k, () => { void l(); }));

const TITLES: Record<string, string> = {
  '/': 'AeroOpt · Aviation resource scheduling', '/console': 'Dashboard', '/console/schedule': 'Schedule', '/console/fleet': 'Fleet',
  '/console/personnel': 'Personnel', '/console/tasks': 'Tasks', '/console/scenarios': 'Scenarios', '/console/analytics': 'Analytics',
  '/console/benchmarks': 'Benchmarks', '/console/audit': 'Audit log', '/console/settings': 'Settings', '/console/about': 'About and assumptions', '/signup': 'Create account', '/login': 'Sign in',
};

function Routes() {
  const { path } = useRouter();
  useEffect(() => { document.title = path === '/' ? TITLES['/'] : `${TITLES[path] ?? 'Not found'} · AeroOpt`; }, [path]);
  if (path === '/') return <Showcase />;
  if (path === '/login') return <Suspense fallback={null}><Login /></Suspense>;
  if (path === '/signup') return <Suspense fallback={null}><Signup /></Suspense>;
  const Page = pages[path];
  return (
    <ConsoleShell>
      {isKnownPath(path) && Page ? (
        <Suspense fallback={<div className="page-skeleton"><Skeleton rows={1} height={44} /><Skeleton rows={6} /></div>}><Page key={path} /></Suspense>
      ) : (
        <><h1>Page not found</h1><EmptyState title={`Nothing lives at ${path}`} body={<>Pick a page from the navigation or go to the <Link to="/console">Dashboard</Link>.</>} /></>
      )}
    </ConsoleShell>
  );
}

export default function AppV3() {
  return (
    <RouterProvider>
      <AuthProvider>
      <DataProvider>
        <Routes />
        <ResourceEditor />
      </DataProvider>
      </AuthProvider>
    </RouterProvider>
  );
}
