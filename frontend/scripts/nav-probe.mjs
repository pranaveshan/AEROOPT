import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage(); const cdp = await p.context().newCDPSession(p); await cdp.send('Performance.enable');
let req = 0; p.on('request', r => r.url().includes(':8000') && req++);
const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const m = (await cdp.send('Performance.getMetrics')).metrics; return (m.find(x => x.name === 'JSHeapUsedSize').value / 1048576).toFixed(2); };
await p.goto('http://localhost:5173/console'); await p.waitForLoadState('networkidle'); console.log('heap0', await heap());
const names = ['Dashboard','Schedule','Fleet','Personnel','Tasks','Scenarios','Analytics','Benchmarks','Audit log','Settings'];
req = 0; let t = Date.now(); for (let i = 0; i < 50; i++) await p.getByRole('link', { name: names[i % 10], exact: true }).first().click({ noWaitAfter: true });
console.log('50 navs ms', Date.now() - t, 'api reqs', req); await p.waitForTimeout(3000); console.log('heap1', await heap());
t = Date.now(); for (let i = 0; i < 50; i++) await p.evaluate(n => { history.pushState({}, '', n); dispatchEvent(new PopStateEvent('popstate')); }, ['/console','/console/tasks','/console/fleet','/console/audit'][i % 4]);
console.log('50 programmatic navs ms', Date.now() - t); await p.waitForTimeout(3000); console.log('heap2', await heap()); for (let k = 0; k < 4; k++) { for (let i = 0; i < 100; i++) await p.evaluate(n => { history.pushState({}, '', n); dispatchEvent(new PopStateEvent('popstate')); }, ['/console','/console/tasks','/console/fleet','/console/audit','/console/analytics'][i % 5]); await p.waitForTimeout(2000); console.log('heap after +100 navs', await heap()); }
const t2 = await p.evaluate(async () => { const t = performance.now(); document.querySelector('a[href="/console/fleet"]').click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t; }); console.log('single click nav to paint ms', t2.toFixed(0)); await b.close();
