/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the boundaries that make the games testable and replaceable. These are rules about the
 * source files themselves, so they are checked by reading them.
 */

const SRC = join(process.cwd(), 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** Source text with comments removed, so a rule is not tripped by a sentence about it. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const name = (path: string) => relative(SRC, path).replace(/\\/g, '/')

/** Every import specifier of a file. */
const imports = (path: string) => [...code(path).matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])

const gameFolders = readdirSync(join(SRC, 'games')).filter(
  (folder) => folder !== 'shared' && statSync(join(SRC, 'games', folder)).isDirectory(),
)
const pureFiles = gameFolders.flatMap((game) =>
  ['engine', 'ai', 'types'].flatMap((layer) => {
    const directory = join(SRC, 'games', game, layer)
    return statSync(directory, { throwIfNoEntry: false })?.isDirectory() ? sourceFiles(directory) : []
  }),
)

describe('game engines and AIs', () => {
  it('exist for every game', () => {
    expect(gameFolders.sort()).toEqual(['2048', 'minesweeper', 'snake', 'tetris'])
    expect(pureFiles.length).toBeGreaterThan(10)
  })

  it.each(pureFiles.map((path) => [name(path), path]))('%s knows nothing of React or the browser', (_, path) => {
    const forbiddenImports = imports(path).filter(
      (specifier) => /^react|^@tanstack|^lucide|^@\/(api|components|pages|hooks|layouts|tcg)/.test(specifier),
    )
    expect(forbiddenImports).toEqual([])
    // No DOM, no timers, no storage: the rules run the same in a browser, a test or a server.
    expect(code(path)).not.toMatch(/\b(document|window|localStorage|sessionStorage)\s*\./)
    expect(code(path)).not.toMatch(/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/)
  })

  it.each(pureFiles.map((path) => [name(path), path]))('%s is deterministic', (_, path) => {
    // Randomness comes from the seed in the state and time from the caller, never from the environment.
    expect(code(path)).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now/)
  })
})

describe('game modules', () => {
  it.each(gameFolders)('%s does not reach into another game', (game) => {
    const others = gameFolders.filter((other) => other !== game)
    for (const path of sourceFiles(join(SRC, 'games', game))) {
      const crossing = imports(path).filter((specifier) =>
        others.some((other) => specifier.includes(`games/${other}`) || specifier.startsWith(`../${other}`) || specifier.includes(`/../${other}/`)),
      )
      expect(crossing, name(path)).toEqual([])
    }
  })

  it.each(gameFolders)('%s talks to the platform only through its module contract', (game) => {
    // A game gets onGameStart/onGameOver and reports a result; coins, rewards, leaderboards, accounts
    // and the card game are the platform's. Shared UI pieces (`@/components`, `@/lib`) are fine.
    for (const path of sourceFiles(join(SRC, 'games', game))) {
      expect(imports(path).filter((specifier) => /^@\/(pages|hooks|layouts|tcg|app|test)\//.test(specifier)), name(path)).toEqual([])
    }
  })

  it('never call the API themselves: the platform submits scores', () => {
    for (const path of sourceFiles(join(SRC, 'games'))) {
      expect(imports(path).filter((specifier) => specifier.startsWith('@/api/') && !path.endsWith('registry.ts') && !path.endsWith('types.ts')), name(path)).toEqual([])
      expect(code(path), name(path)).not.toMatch(/\bfetch\s*\(/)
    }
  })
})

describe('AI mode', () => {
  /** Specifiers a file imports for real, leaving out `import type` (which is erased from the build). */
  const runtimeImports = (path: string) =>
    [...code(path).matchAll(/^import\s+(?!type\s)[^;]*?\s+from\s+'([^']+)'/gm)].map((match) => match[1])

  /** Games with an AI; a game without one (Minesweeper) declares no `loadAi` and has no `ai/` folder. */
  const gamesWithAi = gameFolders.filter((game) => statSync(join(SRC, 'games', game, 'ai'), { throwIfNoEntry: false })?.isDirectory())

  it('are the games that have one', () => {
    expect(gamesWithAi.sort()).toEqual(['2048', 'snake', 'tetris'])
    expect(code(join(SRC, 'games', 'minesweeper', 'index.ts'))).not.toMatch(/loadAi/)
  })

  it.each(gamesWithAi)('%s ships its AI in a chunk of its own, loaded only through the module', (game) => {
    // A real import of the AI anywhere in the game would put the AI in the game's chunk, which every
    // player downloads. Only the module's `loadAi` reaches it, with a dynamic import.
    for (const path of sourceFiles(join(SRC, 'games', game)).filter((file) => !name(file).includes('/ai/'))) {
      expect(runtimeImports(path).filter((specifier) => /(^|\/)ai\//.test(specifier)), name(path)).toEqual([])
    }
    expect(code(join(SRC, 'games', game, 'index.ts'))).toMatch(/loadAi: \(\) => import\('\.\/ai\//)
  })

  it('is loaded by the platform only after the server allows it', () => {
    // Calls of loadAi(); merely asking whether a game has an AI (the admin page) is fine.
    const loaders = sourceFiles(SRC).filter((path) => !name(path).startsWith('games/') && /\bloadAi\s*\(\)/.test(code(path)))
    expect(loaders.map(name)).toEqual(['hooks/useGameAi.ts'])
    expect(code(join(SRC, 'hooks', 'useGameAi.ts'))).toMatch(/checkAiAccess\(/)
  })
})

describe('the card game module', () => {
  it('is used by the rest of the app only through its routes, its hub banner and the shop\'s pack panel', () => {
    const outside = sourceFiles(SRC).filter((path) => !name(path).startsWith('tcg/'))
    const uses = outside.flatMap((path) =>
      imports(path)
        .filter((specifier) => specifier.startsWith('@/tcg'))
        .map((specifier) => `${name(path)} -> ${specifier}`),
    )

    expect(uses.sort()).toEqual([
      'app/routes.tsx -> @/tcg/routes',
      'pages/GamesPage.tsx -> @/tcg/components/TcgHubBanner',
      'pages/HomePage.tsx -> @/tcg/components/TcgHubBanner',
      'pages/ShopPage.tsx -> @/tcg/components/PackAllowancePanel',
    ])
  })

  it('does not depend on the arcade games', () => {
    for (const path of sourceFiles(join(SRC, 'tcg'))) {
      expect(imports(path).filter((specifier) => specifier.startsWith('@/games')), name(path)).toEqual([])
    }
  })

  it('keeps the steps of a pack opening free of React', () => {
    expect(imports(join(SRC, 'tcg', 'opening', 'openingMachine.ts')).filter((specifier) => !specifier.startsWith('.'))).toEqual([])
  })
})
