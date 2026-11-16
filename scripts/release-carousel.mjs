// Builds the LinkedIn carousel: 7 portrait slides (1080x1350) from the real
// product screenshots, then exports PNGs and a combined PDF.
//
//   node scripts/release-carousel.mjs
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'release', 'linkedin')
mkdirSync(outDir, { recursive: true })

const LIVE = 'https://site-6b4858e07ae54a00be427ec8cfa46142.freebuff.page'
const GITHUB = 'github.com/pranaveshan/AEROOPT'

const image = (file) => {
  const buffer = readFileSync(path.join(root, 'screenshots', file))
  return `data:image/png;base64,${buffer.toString('base64')}`
}

const shots = {
  landing: image('01-aeropt-landing.png'),
  dashboard: image('02-aeropt-dashboard.png'),
  aircraft: image('03-aeropt-aircraft.png'),
  tasks: image('04-aeropt-tasks.png'),
  schedule: image('05-aeropt-schedule.png'),
  engine: image('06-aeropt-decision-engine.png'),
  security: image('07-aeropt-security.png'),
}

const slides = [
  {
    file: 'slide-01-cover.png',
    kicker: 'AEROOPT',
    title: 'Smarter aviation<br/>operations.',
    body: 'Aircraft readiness. Crew coordination. Intelligent scheduling.',
    media: `<div class="hero"><img src="${shots.landing}" alt=""></div>`,
    footer: 'Operations console · live product',
  },
  {
    file: 'slide-02-problem.png',
    kind: 'statement',
    kicker: 'The problem',
    title: 'Aviation operations<br/>demand precision.',
    body: 'An aircraft is only available if maintenance allows it. A crew is only assignable if qualifications, duty limits and rest hold. A task only flies if the payload, capability and window line up — and if the task it depends on finishes first.',
    points: ['Aircraft serviceability and maintenance windows', 'Crew qualifications, duty and rest limits', 'Task windows, payload and dependencies'],
    media: `<div class="strip"><img src="${shots.schedule}" alt=""></div>`,
    footer: 'Every constraint is evaluated on the server, per assignment',
  },
  {
    file: 'slide-03-solution.png',
    kicker: 'The solution',
    title: 'One platform.<br/>Connected operations.',
    body: 'AeroOpt keeps the operational record and answers the only question that matters: can this task actually fly, with this aircraft and this crew?',
    media: `<div class="shot"><img src="${shots.dashboard}" alt=""></div>`,
    footer: 'Operational overview · readiness, attention items, assignment timeline',
  },
  {
    file: 'slide-04-scheduling.png',
    kicker: 'Intelligent scheduling',
    title: 'From operational constraints<br/>to optimized schedules.',
    body: 'A deterministic, constraint-based planner builds a schedule, states what blocked each unassigned task, and proposes versions. Nothing becomes operational until a manager approves it.',
    media: `<div class="stack">
        <div class="shot small"><img src="${shots.schedule}" alt=""></div>
        <div class="shot small"><img src="${shots.engine}" alt=""></div>
      </div>`,
    footer: 'Greedy constrained planner · 4 orderings × preserve / rebuild · human approval',
  },
  {
    file: 'slide-05-operations.png',
    kicker: 'Operational visibility',
    title: 'Know what is available.<br/>Know what needs attention.',
    body: 'Aircraft registers, crew availability, task status and maintenance restrictions stay connected — so the reason behind every unassigned task is visible, not guessed.',
    media: `<div class="stack">
        <div class="shot small"><img src="${shots.aircraft}" alt=""></div>
        <div class="shot small"><img src="${shots.tasks}" alt=""></div>
      </div>`,
    footer: 'Aircraft register · task register with priority, window and assignment',
  },
  {
    file: 'slide-06-technology.png',
    kind: 'stack',
    kicker: 'Engineering',
    title: 'Built with<br/>engineering in mind.',
    body: 'Pure TypeScript domain engines shared by the API and the tests. Business rules, permissions and validation live on the server — the interface only renders what the API allows.',
    points: [
      'React 19 + Vite 8 frontend, code-split console',
      'Hono API on Cloudflare Workers, static assets behind it',
      'Cloudflare D1 (SQLite) with idempotent, versioned schema',
      'PBKDF2-SHA256 passwords, hashed sessions, server-side RBAC',
      '50 Vitest tests over the engine and API against real SQLite',
    ],
    media: `<div class="strip"><img src="${shots.security}" alt=""></div>`,
    footer: 'TypeScript end to end · no client-side authority over data',
  },
  {
    file: 'slide-07-live-product.png',
    kind: 'closing',
    kicker: 'Live product',
    title: 'Explore AeroOpt.',
    body: 'A working aviation operations and scheduling platform — synthetic demonstration data, real constraint checking, real persistence.',
    links: [
      ['Product', LIVE.replace('https://', '')],
      ['Repository', GITHUB],
    ],
    footer: 'Demo accounts available in the repository README',
  },
]

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#0b0d0f}
  .slide{
    position:relative;width:1080px;height:1350px;padding:84px 84px 68px;overflow:hidden;
    background:radial-gradient(120% 80% at 85% -10%, rgba(242,194,49,.10), transparent 60%), #0b0d0f;
    color:#eef3f4;font-family:'Inter Tight',ui-sans-serif,system-ui,sans-serif;
    display:flex;flex-direction:column;
  }
  .grid{position:absolute;inset:0;pointer-events:none;opacity:.16;
    background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);
    background-size:72px 72px;mask-image:linear-gradient(180deg,rgba(0,0,0,.9),transparent 78%)}
  header{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2}
  .brand{display:flex;align-items:center;gap:14px}
  .mark{width:44px;height:44px;border-radius:10px;background:#f2c231;color:#171203;display:grid;place-items:center;
    font-weight:700;font-size:22px;letter-spacing:-.02em}
  .word{font-size:20px;font-weight:600;letter-spacing:-.01em}
  .index{font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.16em;color:#7f8f97;text-transform:uppercase}
  .kicker{position:relative;z-index:2;margin-top:78px;font-size:14px;letter-spacing:.22em;text-transform:uppercase;
    color:#f2c231;font-family:'JetBrains Mono',monospace}
  h1{position:relative;z-index:2;margin-top:26px;font-size:70px;line-height:1.04;letter-spacing:-.035em;font-weight:600}
  .body{position:relative;z-index:2;margin-top:28px;font-size:25px;line-height:1.45;color:#a9b8bf;max-width:860px}
  ul{position:relative;z-index:2;margin-top:34px;display:flex;flex-direction:column;gap:16px}
  li{list-style:none;display:flex;gap:14px;font-size:22px;line-height:1.4;color:#d5dee2}
  li:before{content:'';flex:none;width:6px;height:6px;margin-top:11px;border-radius:2px;background:#f2c231}
  .media{position:relative;z-index:2;margin-top:auto;padding-top:44px}
  .hero,.shot{border:1px solid rgba(255,255,255,.11);border-radius:18px;overflow:hidden;background:#11161a;
    box-shadow:0 30px 70px rgba(0,0,0,.55)}
  .hero img,.shot img{display:block;width:100%;height:100%;object-fit:cover;object-position:top left}
  .hero{height:520px}
  .shot{height:470px}
  .shot.small{height:330px}
  .strip{height:264px;border:1px solid rgba(255,255,255,.11);border-radius:18px;overflow:hidden;background:#11161a}
  .strip img{display:block;width:100%;height:100%;object-fit:cover;object-position:top left}
  .stack{display:flex;flex-direction:column;gap:22px}
  .links{position:relative;z-index:2;margin-top:40px;display:flex;flex-direction:column;gap:20px}
  .link{border-top:1px solid rgba(255,255,255,.13);padding-top:18px;display:flex;align-items:baseline;gap:18px}
  .link span{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#7f8f97;width:132px;flex:none}
  .link strong{font-size:24px;font-weight:500;letter-spacing:-.01em;color:#eef3f4;word-break:break-all}
  .main{flex:1;display:flex;flex-direction:column;position:relative;min-height:0}
  footer{position:relative;z-index:2;margin-top:34px;padding-top:20px;border-top:1px solid rgba(255,255,255,.1);
    display:flex;justify-content:space-between;gap:20px;font-size:15px;color:#7f8f97;
    font-family:'JetBrains Mono',monospace;letter-spacing:.02em}
  .accent{color:#f2c231}
`

const slideHtml = (slide, index) => `
  <section class="slide" id="slide-${index + 1}">
    <div class="grid"></div>
    <header>
      <div class="brand"><div class="mark">A</div><div class="word">AeroOpt</div></div>
      <div class="index">${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}</div>
    </header>
    <div class="main">
      <div class="kicker">${slide.kicker}</div>
      <h1>${slide.title}</h1>
      <p class="body">${slide.body}</p>
      ${slide.points ? `<ul>${slide.points.map((point) => `<li>${point}</li>`).join('')}</ul>` : ''}
      ${slide.links ? `<div class="links">${slide.links.map(([label, value]) => `<div class="link"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>` : ''}
      ${slide.media ? `<div class="media">${slide.media}</div>` : ''}
    </div>
    <footer><span>${slide.footer}</span><span class="accent">AeroOpt</span></footer>
  </section>`

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>AeroOpt · LinkedIn carousel</title><style>${css}</style></head>
<body>${slides.map(slideHtml).join('')}</body></html>`

writeFileSync(path.join(outDir, 'carousel.html'), html)
console.log('wrote release/linkedin/carousel.html')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(path.join(outDir, 'carousel.html')).href, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(600)

for (const [index, slide] of slides.entries()) {
  const element = await page.$(`#slide-${index + 1}`)
  await element.screenshot({ path: path.join(outDir, slide.file) })
  console.log(`captured ${slide.file}`)
}

// Combined PDF (one slide per page) for easy upload.
await page.pdf({
  path: path.join(outDir, 'aeropt-linkedin-carousel.pdf'),
  width: '11.25in',
  height: '14.0625in',
  printBackground: true,
  pageRanges: '1-7',
})
console.log('wrote release/linkedin/aeropt-linkedin-carousel.pdf')

await browser.close()
