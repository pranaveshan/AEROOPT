// Scenario-mode and v2-theme verification screenshots.
import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? '../../screens';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.goto(`${BASE}/console/scenarios`);
const sel = p.getByRole('button', { name: /^Select scenario/ }).first();
if (!(await sel.count())) { await p.getByRole('button', { name: 'Create from saved data' }).click(); await p.getByText(/Created /).first().waitFor(); }
else await sel.click();
await p.getByRole('note', { name: 'Scenario mode' }).waitFor();
await p.screenshot({ path: `${OUT}/scenario-mode-scenarios-1440.png`, fullPage: true });
await p.getByRole('link', { name: 'Dashboard' }).click(); await p.waitForTimeout(2500);
const bannerOnDash = await p.getByRole('note', { name: 'Scenario mode' }).count();
await p.screenshot({ path: `${OUT}/scenario-mode-dashboard-1440.png`, fullPage: true });
await p.getByRole('button', { name: 'Return to saved data' }).click();
// v2 theme
await p.goto(`${BASE}/console/settings`);
await p.getByRole('radio', { name: 'v2 Lime' }).check(); await p.waitForLoadState('load'); await p.waitForTimeout(1500);
const v2 = { theme: await p.evaluate(() => document.documentElement.dataset.theme) };
await p.screenshot({ path: `${OUT}/v2-settings-1440.png`, fullPage: true });
await p.goto(`${BASE}/fleet`); await p.waitForTimeout(1200);
v2.legacyRedirect = p.url(); v2.fleetHasAircraft = await p.getByText('AC-101').count() > 0;
await p.screenshot({ path: `${OUT}/v2-fleet-1440.png`, fullPage: true });
await p.getByRole('button', { name: 'Tasks' }).first().click(); await p.waitForTimeout(800); v2.navTasksUrl = p.url();
await p.goto(`${BASE}/console/settings`); await p.getByRole('radio', { name: 'v3 Cinematic' }).check(); await p.waitForLoadState('load'); await p.waitForTimeout(1000);
v2.backToV3 = await p.evaluate(() => document.documentElement.dataset.theme);
console.log(JSON.stringify({ bannerOnDash, v2, errors }, null, 2));
await b.close();
