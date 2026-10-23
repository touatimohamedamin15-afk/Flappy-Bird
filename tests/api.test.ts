import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createApi, type Env } from '../src/worker/index'
import { fly } from './physics.test'

// Real SQLite exercises the SQL and transaction semantics behind the D1 contract.
let sqlite: Database, env: Env
class Statement {
  args: unknown[] = []
  constructor(readonly sql: string) {}
  bind(...args: unknown[]) {
    this.args = args
    return this
  }
  async first() {
    return sqlite.query(this.sql).get(...(this.args as never[]))
  }
  async all() {
    return { results: sqlite.query(this.sql).all(...(this.args as never[])) }
  }
  async run() {
    const result = sqlite.query(this.sql).run(...(this.args as never[]))
    return { meta: { changes: result.changes } }
  }
}
beforeEach(() => {
  sqlite = new Database(':memory:')
  env = {
    APP_ORIGIN: 'https://game.example',
    ASSETS: { fetch: async () => new Response('assets') } as unknown as Fetcher,
    DB: {
      prepare: (sql: string) => new Statement(sql),
      batch: async (statements: Statement[]) => {
        sqlite.exec('BEGIN')
        try {
          const out = []
          for (const statement of statements) out.push(await statement.run())
          sqlite.exec('COMMIT')
          return out
        } catch (e) {
          sqlite.exec('ROLLBACK')
          throw e
        }
      },
    } as unknown as D1Database,
  }
})
afterEach(() => sqlite.close())
const anon = createApi(async () => null)
const alice = createApi(async () => ({ sub: 'alice', name: 'Alice' }))
const bob = createApi(async () => ({ sub: 'bob', name: 'Bob' }))
const request = (
  path: string,
  body?: unknown,
  origin = 'https://game.example',
) =>
  new Request(`https://game.example/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
async function runFor(handler = alice, points = 8) {
  const response = await handler(request('runs', {}), env)
  const run = (await response.json()) as { id: string; seed: number }
  const replay = fly(run.seed, points)
  sqlite
    .query('UPDATE runs SET started_at = ? WHERE id = ?')
    .run(Date.now() - (replay.ticks / 120) * 1000 - 1000, run.id)
  return { id: run.id, ...replay }
}
describe('leaderboard API', () => {
  test('anonymous visitors read the board but cannot post scores', async () => {
    expect((await anon(request('leaderboard'), env)).status).toBe(200)
    expect((await anon(request('runs', {}), env)).status).toBe(401)
    expect((await anon(request('scores', { score: 9999 }), env)).status).toBe(
      401,
    )
  })
  test('refuses foreign-origin writes even for a signed-in user', async () => {
    expect(
      (await alice(request('runs', {}, 'https://attacker.example'), env))
        .status,
    ).toBe(403)
  })
  test('checks the owner, verifies replay, and ignores a forged score field', async () => {
    const run = await runFor()
    expect((await bob(request('scores', run), env)).status).toBe(400)
    expect(
      (await alice(request('scores', { ...run, score: 9999 }), env)).status,
    ).toBe(200)
    const board = await (await alice(request('leaderboard'), env)).json()
    expect(board.entries).toEqual([
      { name: 'Alice', score: run.score, isMe: 1 },
    ])
    expect(board.best).toBe(run.score)
    expect(
      await (await anon(request('leaderboard'), env)).text(),
    ).not.toContain('owner_sub')
  })
  test('retries are idempotent and a worse run never replaces a personal best', async () => {
    const first = await runFor()
    await alice(request('scores', first), env)
    expect((await alice(request('scores', first), env)).status).toBe(200)
    const next = await runFor(alice, 0)
    await alice(request('scores', next), env)
    const board = await (await alice(request('leaderboard'), env)).json()
    expect(board.entries.length).toBe(1)
    expect(board.best).toBe(first.score)
  })
  test('rejects impossible elapsed time, invalid replay, and expired flights', async () => {
    const run = await runFor()
    sqlite
      .query('UPDATE runs SET started_at = ? WHERE id = ?')
      .run(Date.now(), run.id)
    expect((await alice(request('scores', run), env)).status).toBe(400)
    expect(
      (await alice(request('scores', { ...run, inputs: [0, 0] }), env)).status,
    ).toBe(400)
    sqlite
      .query('UPDATE runs SET started_at = ? WHERE id = ?')
      .run(Date.now() - 31 * 60_000, run.id)
    expect((await alice(request('scores', run), env)).status).toBe(400)
  })
  test('throttles rapid run creation', async () => {
    expect((await alice(request('runs', {}), env)).status).toBe(200)
    expect((await alice(request('runs', {}), env)).status).toBe(429)
  })
  test('missing storage does not block the game or anonymous session', async () => {
    delete env.DB
    expect((await anon(new Request('https://game.example/'), env)).status).toBe(
      200,
    )
    expect((await anon(request('session'), env)).status).toBe(200)
    expect((await anon(request('leaderboard'), env)).status).toBe(503)
  })
})
