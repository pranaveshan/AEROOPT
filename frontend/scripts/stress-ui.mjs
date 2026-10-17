import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
const heap = async () => (await p.evaluate(() => performance.memory.usedJSHeapSize / 1048576)).toFixed(1);
await p.goto('http://localhost:5173/console'); await p.waitForLoadState('networkidle');
console.log('heap start MB', await heap());
let t = Date.now(); await p.goto('http://localhost:5173/console/tasks'); await p.getByText('TK-301').first().waitFor();
console.log('tasks page with', await p.locator('tbody tr').count(), 'rows rendered in', Date.now() - t, 'ms');
t = Date.now(); await p.getByLabel('Filter by status').selectOption('pending'); await p.waitForTimeout(100); console.log('filter ms', Date.now() - t - 100, 'rows', await p.locator('tbody tr').count());
const names = ['Dashboard','Schedule','Fleet','Personnel','Tasks','Scenarios','Analytics','Benchmarks','Audit log','Settings'];
t = Date.now(); for (let i = 0; i < 200; i++) await p.getByRole('link', { name: names[i % 10], exact: true }).first().click();
console.log('200 rapid navs ms', Date.now() - t, 'heap', await heap());
await p.getByRole('link', { name: 'Schedule', exact: true }).first().click();
t = Date.now();
for (let i = 0; i < 20; i++) { await p.getByRole('button', { name: 'Run optimizer' }).first().click(); await p.getByRole('button', { name: 'Run optimizer' }).first().waitFor(); await p.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Run optimizer' && !b.disabled), null, { timeout: 60000 }); }
console.log('20 solves ms', Date.now() - t);
await p.evaluate(() => window.gc && window.gc()); await p.waitForTimeout(1500); console.log('heap end MB', await heap());
console.log('console errors', errs.length, errs.slice(0, 5)); await b.close();
