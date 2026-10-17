import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { getTheme } from './theme';
import { normalizePath } from './routes';

// Apply legacy-path redirects before either theme reads the URL.
const target = normalizePath(window.location.pathname);
if (target !== window.location.pathname) {
  window.history.replaceState({}, '', target + window.location.search + window.location.hash);
}

const theme = getTheme();
document.documentElement.dataset.theme = theme;

// Each theme is its own chunk (with its own CSS) so the inactive one is never downloaded.
const App = theme === 'v2'
  ? lazy(async () => { await import('./v2/styles.css'); return import('./v2/AppV2'); })
  : lazy(() => import('./v3/AppV3'));

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}><App /></Suspense>
  </React.StrictMode>,
);
