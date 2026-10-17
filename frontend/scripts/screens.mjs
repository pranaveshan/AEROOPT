// Playwright verification: screenshots of every page at 4 widths, axe checks, 3D metrics, a recorded route transition.
// Usage: node scripts/screens.mjs [baseUrl] [outDir]   (backend on :8000, frontend preview on :5173)
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? '../../screens';
mkdirSync(OUT, { recursive: true });
const PAGES = ['/', '/console', '/console/schedule', '/console/fleet', '/console/personnel', '/console/tasks', '/console/scenarios', '/console/analytics', '/console/benchmarks', '/console/audit', '/console/settings', '/console/about'];
const WIDTHS = [[1440, 900], [1024, 768], [768, 1024], [390, 844]];
const slug = p => (p === '/' ? 'showcase' : p.replace('/console', 'console').replace(/\//g, '-'));
const report = { axe: {}, overflow: [], primaries: {}, three: {}, errors: [] };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });

// 1) Populate real data through the UI: run optimizer and approve, then run a comparison.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => report.errors.push(`seed: ${e.message}`));
  await page.goto(`${BASE}/console`);
  await page.getByRole('button', { name: 'Run optimizer' }).click();
  await page.getByText(/Run .*: (FEASIBLE|OPTIMAL|UNKNOWN|INFEASIBLE)/).first().waitFor({ timeout: 30000 });
  const approve = page.getByRole('button', { name: 'Approve and apply' });
  if (await approve.count()) { await approve.click(); await page.getByText(/Approved schedule saved/).first().waitFor({ timeout: 15000 }); }
  await page.goto(`${BASE}/console/benchmarks`);
  await page.getByRole('button', { name: 'Run comparison' }).click();
  await page.getByText('Difference').first().waitFor({ timeout: 30000 });
  report.seed = 'optimizer run + approval + comparison done through the UI';
  await page.close();
}

// 2) Screenshots + overflow + primary-button count at every width; axe at 1440.
for (const [w, h] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  // carry the stored comparison into this context
  const page = await ctx.newPage();
  page.on('pageerror', e => report.errors.push(`${w}: ${e.message}`));
  await page.goto(`${BASE}/console/benchmarks`);
  // comparison results are stored per browser profile; run one here so the showcase shows real numbers
  await page.getByRole('button', { name: 'Run comparison' }).click();
  await page.getByText('Difference').first().waitFor({ timeout: 30000 });
  for (const p of PAGES) {
    await page.goto(`${BASE}${p}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(p === '/' || p === '/console' || p === '/console/fleet' ? 2500 : 600);
    await page.addStyleTag({ content: '[data-reveal]{opacity:1!important;transform:none!important}' });
    const file = `${OUT}/${slug(p)}-${w}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) report.overflow.push(`${p} @${w}: ${over}px`);
    const prim = await page.locator('.btn-primary:visible').count();
    report.primaries[`${p}@${w}`] = prim;
    if (w === 1440) {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      report.axe[p] = r.violations.map(v => `${v.id} (${v.impact}, ${v.nodes.length})`);
    }
  }
  await ctx.close();
}

// 3) 3D metrics: fps/worst frame (software GL in headless), heap on mount/unmount.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/console/about`); await page.waitForTimeout(800);
  const heap = () => page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null));
  report.three.heapBeforeMB = await heap();
  await page.getByRole('link', { name: 'Fleet' }).click();
  await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4000);
  report.three.canvasMounted = await page.locator('canvas').count() > 0;
  report.three.metrics = await page.evaluate(() => window.__aeroopt3d ?? null);
  report.three.heapMountedMB = await heap();
  await page.getByRole('link', { name: 'About & Assumptions' }).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.gc && window.gc());
  report.three.heapAfterUnmountMB = await heap();
  report.three.canvasAfterUnmount = await page.locator('canvas').count();
  // reduced motion + no-WebGL fallbacks
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${BASE}/?no3d`); await page.waitForTimeout(800);
  report.three.svgFallbackVisible = await page.locator('.airliner-svg').count() > 0;
  await page.screenshot({ path: `${OUT}/showcase-fallback-reduced-1440.png` });
  await page.close();
}

// 4) Recorded route transition.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`); await page.waitForTimeout(2000);
  await page.getByRole('link', { name: 'Open console' }).click(); await page.waitForTimeout(1500);
  for (const n of ['Schedule', 'Fleet', 'Tasks', 'Benchmarks']) { await page.getByRole('link', { name: n, exact: true }).click(); await page.waitForTimeout(1200); }
  const v = page.video(); await ctx.close();
  if (v) renameSync(await v.path(), `${OUT}/video/route-transitions.webm`);
}

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
