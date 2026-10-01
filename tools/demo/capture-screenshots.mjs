// Takes the README screenshots of a running arcade, signed in as the demo players.
//
//   node tools/demo/capture-screenshots.mjs [base-url]      (default http://localhost:3000)
//
// Run it after tools/demo/seed-demo-data.mjs. It drives a headless Chrome (or Edge) through the
// DevTools protocol with a throwaway profile, so it needs nothing installed beyond the browser.
// Set CHROME to the browser's path if it is not in the usual place. Opens one card pack.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'screenshots')
const DEMO_PASSWORD = 'arcade-demo-2026' // see seed-demo-data.mjs
const PORT = 9333

const browserPath = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A minimal DevTools protocol client for one page. */
async function connect() {
  let targets
  for (let attempt = 0; attempt < 50 && !targets; attempt++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    } catch {
      await sleep(200)
    }
  }
  const page = targets.find((target) => target.type === 'page')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))

  let nextId = 0
  const pending = new Map()
  const listeners = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    } else if (message.method && listeners.has(message.method)) {
      listeners.get(message.method)()
      listeners.delete(message.method)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  const once = (event) => new Promise((resolve) => listeners.set(event, resolve))
  return { send, once, close: () => socket.close() }
}

async function main() {
  if (!browserPath) throw new Error('No Chrome or Edge found; set CHROME to its path.')
  mkdirSync(OUT_DIR, { recursive: true })
  const profile = mkdtempSync(join(tmpdir(), 'cyan-arcade-shots-'))
  const browser = spawn(
    browserPath,
    ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'],
    { stdio: 'ignore' },
  )

  try {
    const page = await connect()
    await page.send('Page.enable')

    const viewport = (width, height, mobile = false) =>
      page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile })
    const go = async (path, settle = 1500) => {
      const loaded = page.once('Page.loadEventFired')
      await page.send('Page.navigate', { url: BASE_URL + path })
      await loaded
      await sleep(settle)
    }
    const run = async (expression) => {
      const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
      return result.value
    }
    const shoot = async (name) => {
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(OUT_DIR, `${name}.png`), Buffer.from(data, 'base64'))
      console.log(`  docs/screenshots/${name}.png`)
    }
    /** Signs in through the API from inside the page, the way the app itself does. */
    const signIn = async (username) => {
      await go('/', 500)
      await run(`(async () => {
        const token = () => decodeURIComponent((document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN=')) ?? '=').split('=')[1])
        await fetch('/api/auth/session')
        await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-XSRF-TOKEN': token() } })
        await fetch('/api/auth/session')
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token() },
          body: JSON.stringify({ username: ${JSON.stringify(username)}, password: ${JSON.stringify(DEMO_PASSWORD)} }),
        })
        if (!response.ok) throw new Error('login failed: ' + response.status)
      })()`)
    }
    const scrollTo = (selector, offset = 90) =>
      run(`window.scrollTo(0, document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top + window.scrollY - ${offset})`)
    const click = (selector) => run(`document.querySelector(${JSON.stringify(selector)}).click()`)

    console.log(`Capturing ${BASE_URL} with ${browserPath}`)
    await signIn('PixelPioneer')

    await viewport(1280, 900)
    await go('/')
    await shoot('home')

    await go('/games')
    await shoot('games')

    await go('/games/tetris')
    await run(`[...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.trim() === 'AI').click()`)
    await sleep(14_000)
    await scrollTo('aside[aria-label^="Today"]', 90)
    await sleep(800)
    await shoot('tetris-ai')

    await go('/leaderboard?game=2048')
    await shoot('leaderboard')

    await go('/profile', 2000)
    await shoot('profile')

    await go('/tcg/collection', 2000)
    await shoot('collection')

    // A pack opened halfway: some cards turned over, some still face down.
    await signIn('NeonNova')
    const packId = await run(`(async () => {
      const sets = await (await fetch('/api/tcg/sets?game=cyan-critters')).json()
      const packs = await (await fetch('/api/tcg/packs?set=' + sets[0].id)).json()
      return packs.find((pack) => pack.code === 'sunrise').id
    })()`)
    await go(`/tcg/packs/${packId}`)
    await shoot('pack')
    await run(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Open pack')).click()`)
    await sleep(2500)
    for (const position of [1, 2, 5]) {
      await click(`button[aria-label="Reveal card ${position}"]`)
      await sleep(250)
    }
    await sleep(1800)
    await scrollTo('nav[aria-label="Breadcrumb"]')
    await sleep(500)
    await shoot('pack-opening')

    await signIn('PixelPioneer')
    await viewport(390, 844, true)
    await go('/', 2000)
    await run('window.scrollTo(0, 0)')
    await sleep(300)
    await shoot('mobile-home')
    await go('/tcg/cyan-critters/pixel-meadow', 2000)
    await scrollTo('#set-cards-heading', 80)
    await sleep(500)
    await shoot('mobile-set')

    page.close()
  } finally {
    browser.kill()
    await sleep(500)
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
