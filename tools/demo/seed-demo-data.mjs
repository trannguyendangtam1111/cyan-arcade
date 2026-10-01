// Fills a fresh local arcade with demo data through the public API, the way players would:
// a few accounts, finished games on every leaderboard, and some opened card packs.
//
//   node tools/demo/seed-demo-data.mjs [base-url]      (default http://localhost:3000)
//
// Meant for a freshly reset development database (docker compose down -v && docker compose up -d).
// Runs are started together and finished one after the other over about two minutes, so their
// durations, which the server measures itself, look like real games.
//
// The demo accounts all use the password below. It exists only for local demos; never reuse it.

const BASE_URL = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const DEMO_PASSWORD = 'arcade-demo-2026'

/** Each player: avatar, finished games as [game, score, details], and packs to open as [set, pack, count]. */
const players = [
  {
    username: 'PixelPioneer',
    avatar: 'CAT',
    runs: [
      ['snake', 31, { length: 34, level: 7 }],
      ['2048', 7412, { highestTile: 512, moves: 520 }],
      ['tetris', 4210, { lines: 27, level: 3 }],
      ['snake', 18, { length: 21, level: 4 }],
    ],
    packs: [
      ['pixel-meadow', 'sunrise', 3],
      ['pixel-meadow', 'twilight', 2],
      ['neon-depths', 'tide', 2],
    ],
  },
  {
    username: 'NeonNova',
    avatar: 'ROCKET',
    runs: [
      ['snake', 42, { length: 45, level: 9 }],
      ['tetris', 6830, { lines: 41, level: 5 }],
      ['2048', 3196, { highestTile: 256, moves: 301 }],
    ],
    packs: [['neon-depths', 'abyss', 2]],
  },
  {
    username: 'ByteBandit',
    avatar: 'GHOST',
    runs: [
      ['2048', 12056, { highestTile: 1024, moves: 790 }],
      ['snake', 25, { length: 28, level: 6 }],
      ['tetris', 1890, { lines: 12, level: 2 }],
    ],
    packs: [],
  },
  {
    username: 'TileTamer',
    avatar: 'CROWN',
    runs: [
      ['2048', 16348, { highestTile: 1024, moves: 1040 }],
      ['2048', 5480, { highestTile: 512, moves: 455 }],
      ['snake', 12, { length: 15, level: 3 }],
    ],
    packs: [],
  },
  {
    username: 'LineLegend',
    avatar: 'BIRD',
    runs: [
      ['tetris', 9120, { lines: 58, level: 6 }],
      ['tetris', 3340, { lines: 22, level: 3 }],
      ['snake', 9, { length: 12, level: 2 }],
    ],
    packs: [],
  },
]

/** Games played without an account, so the boards show guests too. */
const guestRuns = [
  ['snake', 21, { length: 24, level: 5 }],
  ['2048', 2340, { highestTile: 256, moves: 240 }],
  ['tetris', 2560, { lines: 16, level: 2 }],
]

/** A browser of sorts: keeps cookies and sends the CSRF token back as the real app does. */
class Client {
  cookies = new Map()

  async request(method, path, body) {
    // A request that changes something needs the CSRF cookie first, and the same token in a header.
    if (method !== 'GET' && !this.cookies.has('XSRF-TOKEN')) await this.request('GET', '/api/auth/session')
    const headers = { Accept: 'application/json', Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (method !== 'GET') headers['X-XSRF-TOKEN'] = this.cookies.get('XSRF-TOKEN')
    const response = await fetch(BASE_URL + path, { method, headers, body: body && JSON.stringify(body) })
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const [name, ...value] = pair.split('=')
      if (value.join('=') === '') this.cookies.delete(name)
      else this.cookies.set(name, value.join('='))
    }
    const text = await response.text()
    const json = text ? JSON.parse(text) : undefined
    if (!response.ok) {
      const error = new Error(`${method} ${path} -> ${response.status} ${json?.code ?? ''} ${json?.detail ?? ''}`)
      error.status = response.status
      throw error
    }
    return json
  }
}

async function signIn(player) {
  const client = new Client()
  const credentials = { username: player.username, password: DEMO_PASSWORD }
  try {
    await client.request('POST', '/api/auth/register', credentials)
  } catch (error) {
    if (error.status !== 409) throw error
    await client.request('POST', '/api/auth/login', credentials)
  }
  await client.request('PATCH', '/api/users/me', { avatar: player.avatar })
  return client
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  console.log(`Seeding ${BASE_URL}`)
  const clients = new Map()
  for (const player of players) clients.set(player.username, await signIn(player))

  // Start every run now...
  const runs = []
  for (const player of players) {
    for (const [game, score, details] of player.runs) {
      const client = clients.get(player.username)
      const { id } = await client.request('POST', '/api/game-sessions', { gameSlug: game })
      runs.push({ who: player.username, client, id, game, score, details })
    }
  }
  for (const [game, score, details] of guestRuns) {
    const client = new Client()
    const { id } = await client.request('POST', '/api/game-sessions', { gameSlug: game })
    runs.push({ who: 'a guest', client, id, game, score, details })
  }

  // ...and finish them one by one, so each lasted somewhere between half a minute and two minutes.
  const finishing = runs.map(async (run, index) => {
    await sleep(30_000 + ((index * 37) % 90) * 1_000)
    await run.client.request('POST', `/api/game-sessions/${run.id}/finish`, { score: run.score, details: run.details })
    console.log(`  ${run.who} finished ${run.game} with ${run.score}`)
  })
  console.log(`Started ${runs.length} games; finishing them over the next two minutes...`)

  // Card packs, while the games run.
  const sets = await new Client().request('GET', '/api/tcg/sets?game=cyan-critters')
  for (const player of players) {
    for (const [setCode, packCode, count] of player.packs) {
      const set = sets.find((candidate) => candidate.code === setCode)
      const packs = await new Client().request('GET', `/api/tcg/packs?set=${set.id}`)
      const pack = packs.find((candidate) => candidate.code === packCode)
      for (let opened = 0; opened < count; opened++) {
        const { opening } = await clients.get(player.username).request('POST', `/api/tcg/packs/${pack.id}/open`)
        const names = opening.cards.map((pulled) => `${pulled.card.name} (${pulled.card.rarity.name})`)
        console.log(`  ${player.username} opened ${pack.name}: ${names.join(', ')}`)
      }
    }
  }

  await Promise.all(finishing)
  console.log(`Done: ${players.length} players, ${runs.length} finished games.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
