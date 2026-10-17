// Full click-through bug hunt. Captures console errors, failed requests, HTTP >= 400 and page errors per step.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:5173';
const ADMIN_PW = (readFileSync(new URL('../../backend/ADMIN_CREDENTIALS.txt', import.meta.url), 'utf8').match(/password: (.*)/) || [])[1];
const log = []; let step = 'start';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function session(width = 1440) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') log.push({ step, kind: 'console', text: m.text() }); });
  p.on('pageerror', e => log.push({ step, kind: 'pageerror', text: e.message }));
  p.on('requestfailed', r => log.push({ step, kind: 'requestfailed', text: `${r.method()} ${r.url()} ${r.failure()?.errorText}` }));
  p.on('response', r => { if (r.status() >= 400) log.push({ step, kind: 'http', text: `${r.status()} ${r.request().method()} ${r.url()}` }); });
  return { ctx, p };
}
const results = [];
async function t(name, fn) { step = name; try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); } }
const { p } = await session();
const u = `e2e${Date.now().toString(36)}`;
const go = async path => { await p.goto(BASE + path); await p.waitForLoadState('networkidle'); };
const notice = re => p.getByRole('status').filter({ hasText: re }).first().waitFor({ timeout: 30000 });

await t('signup → auto login → console', async () => {
  await go('/signup');
  await p.getByLabel('Email').fill(`${u}@example.org`); await p.getByLabel('Username').fill(u);
  await p.getByLabel('Password', { exact: true }).fill('Runway-27Left!'); await p.getByLabel('Confirm password').fill('Runway-27Left!');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.getByRole('heading', { name: 'Dashboard', level: 1 }).waitFor();
  await p.getByRole('button', { name: new RegExp(u) }).waitFor();
});
await t('duplicate signup shows field error', async () => {
  await p.getByRole('button', { name: new RegExp(u) }).click(); await p.getByRole('menuitem', { name: 'Sign out' }).click();
  await go('/signup');
  await p.getByLabel('Email').fill(`${u}x@example.org`); await p.getByLabel('Username').fill(u);
  await p.getByLabel('Password', { exact: true }).fill('Runway-27Left!'); await p.getByLabel('Confirm password').fill('Runway-27Left!');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.getByText('That username is already taken').waitFor();
});
await t('login wrong password shows error', async () => {
  await go('/login'); await p.getByLabel('Username').fill('admin'); await p.getByLabel('Password').fill('wrong');
  await p.getByRole('button', { name: 'Sign in' }).click(); await p.getByRole('alert').filter({ hasText: 'do not match' }).waitFor();
});
await t('login as admin', async () => {
  await p.getByLabel('Password').fill(ADMIN_PW); await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByRole('heading', { name: 'Dashboard', level: 1 }).waitFor(); await p.getByRole('button', { name: /admin/ }).waitFor();
});
await t('run baseline', async () => { await p.getByRole('button', { name: 'Run baseline' }).click(); await notice(/Run .*:/); });
await t('run optimizer + approve', async () => {
  await p.getByRole('button', { name: 'Run optimizer' }).click(); await notice(/Run .*:/);
  await p.getByRole('button', { name: 'Approve and apply' }).click(); await notice(/Approved schedule saved/);
});
await t('gantt bar → inspector drawer', async () => {
  await go('/console/schedule'); await p.locator('.gantt-bar').first().click(); await p.getByRole('dialog').waitFor();
  await p.keyboard.press('Escape'); await p.getByRole('dialog').waitFor({ state: 'detached' });
});
for (const [path, btn, json, label] of [
  ['/console/fleet', 'New aircraft', s => s.replace('"AC-NEW"', `"AC-${u}"`), `AC-${u}`],
  ['/console/personnel', 'New personnel', s => s.replace('"CREW-NEW"', `"CR-${u}"`), `CR-${u}`],
  ['/console/tasks', 'New task', s => s.replace('"TASK-NEW"', `"TK-${u}"`), `TK-${u}`],
]) {
  await t(`create ${label}`, async () => {
    await go(path); await p.getByRole('button', { name: btn }).click();
    const ta = p.getByLabel('Record JSON'); await ta.fill(json(await ta.inputValue()));
    await p.getByRole('button', { name: 'Save record' }).click(); await notice(/created/); await p.getByText(label).first().waitFor();
  });
  await t(`edit ${label}`, async () => {
    await p.getByRole('button', { name: `Edit ${label} as JSON` }).click();
    await p.getByRole('button', { name: 'Save record' }).click(); await notice(/updated/);
  });
  await t(`invalid JSON ${label}`, async () => {
    await p.getByRole('button', { name: `Edit ${label} as JSON` }).click();
    await p.getByLabel('Record JSON').fill('{ broken'); await p.getByRole('button', { name: 'Save record' }).click();
    await p.getByRole('dialog').getByRole('alert').waitFor(); await p.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  if (!path.endsWith('tasks')) {
    await t(`archive + restore ${label}`, async () => {
      await p.getByRole('button', { name: `Archive ${label}` }).click(); await notice(/archive done/);
      await p.getByRole('button', { name: 'Include archived' }).click();
      await p.getByRole('button', { name: `Restore ${label}` }).click(); await notice(/restore done/);
      await p.getByRole('button', { name: 'Active only' }).click();
    });
  } else {
    await t(`filter + cancel ${label}`, async () => {
      await p.getByLabel('Filter by status').selectOption('pending');
      await p.getByRole('button', { name: `Cancel task ${label}` }).click(); await notice(/cancel done/);
      await p.getByLabel('Filter by status').selectOption('cancelled'); await p.getByText(label).first().waitFor();
      await p.getByLabel('Filter by status').selectOption('all');
    });
  }
}
await t('scenario create/change/solve/apply', async () => {
  await go('/console/scenarios'); await p.getByLabel('Scenario name').fill(`S ${u}`);
  await p.getByRole('button', { name: 'Create from saved data' }).click(); await p.getByRole('note', { name: 'Scenario mode' }).waitFor();
  await p.getByRole('button', { name: 'Save isolated change' }).click(); await notice(/isolation/);
  await p.getByRole('button', { name: 'Run scenario solve' }).click(); await notice(/Solved/);
  await p.getByText('Saved baseline vs scenario').waitFor();
  await p.getByRole('button', { name: 'Apply to saved data' }).click(); await notice(/Applied scenario/);
});
await t('scenario create/discard', async () => {
  await p.getByLabel('Scenario name').fill(`D ${u}`); await p.getByRole('button', { name: 'Create from saved data' }).click();
  await p.getByRole('note', { name: 'Scenario mode' }).waitFor();
  await p.getByRole('button', { name: 'Discard' }).click(); await notice(/Discarded/);
});
await t('analytics spof/stress/compare', async () => {
  await go('/console/analytics');
  await p.getByRole('button', { name: 'Single-point failures' }).click(); await p.getByText(/Critical aircraft/).waitFor({ timeout: 60000 });
  await p.getByRole('button', { name: 'Stress cases' }).click(); await p.locator('.plain-list li').first().waitFor({ timeout: 60000 });
  await p.getByRole('button', { name: 'Compare solvers' }).click(); await p.getByText(/Baseline .* with/).waitFor({ timeout: 60000 });
});
await t('benchmarks comparison', async () => { await go('/console/benchmarks'); await p.getByRole('button', { name: 'Run comparison' }).click(); await p.getByText('Difference').first().waitFor({ timeout: 60000 }); });
await t('audit verify', async () => { await go('/console/audit'); await p.getByRole('button', { name: 'Verify chain' }).click(); await p.getByText(/Integrity pass|Broken at/).waitFor(); });
await t('command palette', async () => { await go('/console'); await p.keyboard.press('Control+k'); await p.getByLabel('Search pages').fill('aud'); await p.keyboard.press('Enter'); await p.getByRole('heading', { name: 'Audit log', level: 1 }).waitFor(); });
await t('back/forward', async () => { await p.goBack(); await p.getByRole('heading', { name: 'Dashboard', level: 1 }).waitFor(); await p.goForward(); await p.getByRole('heading', { name: 'Audit log', level: 1 }).waitFor(); });
await t('unknown route 404', async () => { await go('/console/nope'); await p.getByRole('heading', { name: 'Page not found' }).waitFor(); });
await t('theme switch v2 and back', async () => {
  await go('/console/settings'); await p.getByRole('radio', { name: 'v2 Lime' }).check(); await p.waitForLoadState('load'); await p.waitForTimeout(800);
  for (const n of ['Fleet', 'Personnel', 'Tasks', 'Schedule', 'Scenarios', 'Analytics', 'Audit log', 'Settings']) { await p.getByRole('button', { name: n, exact: true }).first().click(); await p.waitForTimeout(400); }
  await p.getByRole('radio', { name: 'v3 Cinematic' }).check(); await p.waitForLoadState('load'); await p.waitForTimeout(800);
  if ((await p.evaluate(() => document.documentElement.dataset.theme)) !== 'v3') throw new Error('not back on v3');
});
await t('logout from account menu', async () => {
  await go('/console'); await p.getByRole('button', { name: /admin/ }).click(); await p.getByRole('menuitem', { name: 'Sign out' }).click();
  await p.getByRole('heading', { name: 'Sign in to AeroOpt' }).waitFor();
});
// mobile
for (const w of [390, 768]) {
  const { p: m, ctx } = await session(w);
  await t(`mobile ${w}: nav drawer + pages`, async () => {
    await m.goto(BASE + '/'); await m.getByRole('link', { name: 'Sign in' }).first().waitFor();
    await m.goto(BASE + '/console'); await m.waitForLoadState('networkidle');
    for (const n of ['Schedule', 'Fleet', 'Tasks', 'Benchmarks', 'Settings']) {
      await m.getByRole('button', { name: 'Open navigation' }).click(); await m.getByRole('link', { name: n, exact: true }).click();
      await m.getByRole('heading', { name: n, level: 1 }).waitFor();
      const o = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) throw new Error(`${n} overflows by ${o}px`);
    }
    await m.goto(BASE + '/login'); await m.goto(BASE + '/signup');
    const o = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) throw new Error(`signup overflows ${o}px`);
  });
  await ctx.close();
}
await b.close();
console.log(results.join('\n'));
console.log('\nISSUES (' + log.length + ')');
for (const l of log) console.log(`[${l.step}] ${l.kind}: ${l.text}`);
