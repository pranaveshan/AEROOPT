// Production capture + verification for AeroOpt.
// Uses the installed Chrome through playwright-core (no bundled browser download).
//
//   node scripts/release-capture.mjs <base-url>
//
// Writes 1440x900 @2x screenshots into /screenshots and prints a verification
// report (console errors, failed requests, responsive overflow) to stdout.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const base = (process.argv[2] ?? 'https://site-6b4858e07ae54a00be427ec8cfa46142.freebuff.page').replace(/\/$/, '')
const outDir = 'screenshots'
mkdirSync(outDir, { recursive: true })

const HIDE_SCROLLBARS = 'html{scrollbar-width:none}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const page = await context.newPage()

const consoleErrors = []
const failedRequests = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
page.on('response', (response) => {
  if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
})

const settle = async () => {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: HIDE_SCROLLBARS })
  await page.waitForTimeout(900)
}

const shot = async (name, path) => {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: false })
  console.log(`captured ${name} @ ${path}`)
}

// Signed-out protection check first, in a clean context.
const anon = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const anonPage = await anon.newPage()
await anonPage.goto(`${base}/console/tasks`, { waitUntil: 'networkidle' })
console.log(`anonymous /console/tasks -> ${new URL(anonPage.url()).pathname}`)
await anon.close()

// 1. Landing
await page.goto(`${base}/`, { waitUntil: 'networkidle' })
await settle()
await shot('01-aeropt-landing.png', '/')

// Sign in through the real form.
await page.goto(`${base}/signin`, { waitUntil: 'networkidle' })
await page.fill('#email', 'admin@aeroopt.io')
await page.fill('#password', 'AeroOpt#2026')
await page.click('button[type="submit"]')
await page.waitForURL(/\/console/, { timeout: 30000 })
console.log(`signed in -> ${new URL(page.url()).pathname}`)

const pages = [
  ['02-aeropt-dashboard.png', '/console'],
  ['03-aeropt-aircraft.png', '/console/aircraft'],
  ['04-aeropt-tasks.png', '/console/tasks'],
  ['05-aeropt-schedule.png', '/console/schedule'],
]

for (const [name, path] of pages) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  await settle()
  await shot(name, path)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 1) console.log(`!! horizontal overflow ${overflow}px on ${path}`)
}

// 6. Decision engine — run a real optimization, then capture the result.
await page.goto(`${base}/console/decision-engine`, { waitUntil: 'networkidle' })
await settle()
await page.getByRole('button', { name: 'Run optimization' }).click()
await page.getByText(/Proposal · schedule v/).waitFor({ timeout: 45000 })
// Let the success toast clear so it does not sit over the proposal table.
await page.waitForTimeout(5200)
await page.screenshot({ path: `${outDir}/06-aeropt-decision-engine.png`, fullPage: false })
console.log('captured 06-aeropt-decision-engine.png @ /console/decision-engine')

// 7. Security and system management.
await page.goto(`${base}/console/security`, { waitUntil: 'networkidle' })
await settle()
await shot('07-aeropt-security.png', '/console/security')

// Mobile verification (not saved).
await page.setViewportSize({ width: 390, height: 844 })
for (const path of ['/console', '/console/tasks', '/console/schedule']) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  console.log(`mobile 390 ${path}: overflow ${overflow}px`)
}

// Tablet verification (not saved).
await page.setViewportSize({ width: 820, height: 1180 })
await page.goto(`${base}/console/aircraft`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
console.log(`tablet 820 /console/aircraft: overflow ${await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)}px`)

console.log(`\nconsole errors: ${consoleErrors.length}`)
for (const error of consoleErrors.slice(0, 10)) console.log(`  ${error}`)
console.log(`failed requests: ${failedRequests.length}`)
for (const request of failedRequests.slice(0, 10)) console.log(`  ${request}`)

await browser.close()
