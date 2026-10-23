import {
  createFreebuffAuth,
  isSameOriginRequest,
  type FreebuffAuth,
  type FreebuffUser,
} from '@freebuff/auth'
import { verifyReplay } from '../game/physics'

export type Env = {
  ASSETS: Fetcher
  DB?: D1Database
  FREEBUFF_CLIENT_ID?: string
  FREEBUFF_ISSUER?: string
  APP_ORIGIN?: string
}
type ResolveUser = (request: Request, env: Env) => Promise<FreebuffUser | null>
let cached: { key: string; auth: FreebuffAuth } | undefined
function getAuth(env: Env) {
  if (!env.FREEBUFF_CLIENT_ID || !env.APP_ORIGIN) return null
  const key = `${env.FREEBUFF_CLIENT_ID}|${env.APP_ORIGIN}|${env.FREEBUFF_ISSUER ?? ''}`
  if (cached?.key !== key) {
    const url = new URL(env.APP_ORIGIN)
    cached = {
      key,
      auth: createFreebuffAuth({
        clientId: env.FREEBUFF_CLIENT_ID,
        issuer: env.FREEBUFF_ISSUER,
        baseUrl: env.APP_ORIGIN,
        allowInsecureLocalhost:
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
      }),
    }
  }
  return cached.auth
}
const initialized = new WeakMap<D1Database, Promise<unknown>>()
function database(db: D1Database) {
  let promise = initialized.get(db)
  if (!promise) {
    promise = db
      .batch([
        db.prepare(
          'CREATE TABLE IF NOT EXISTS leaderboard (owner_sub TEXT PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL CHECK(score >= 0), achieved_at INTEGER NOT NULL)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS leaderboard_rank ON leaderboard(score DESC, achieved_at ASC, owner_sub ASC)',
        ),
        db.prepare(
          'CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, owner_sub TEXT NOT NULL, seed INTEGER NOT NULL, started_at INTEGER NOT NULL, consumed_at INTEGER)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS runs_owner_started ON runs(owner_sub, started_at DESC)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS runs_expiry ON runs(started_at)',
        ),
      ])
      .catch((error) => {
        initialized.delete(db)
        throw error
      })
    initialized.set(db, promise)
  }
  return promise
}
function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return null
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 60000) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

// Dependency injection lets API tests exercise real SQLite and authorization
// boundaries without introducing a development identity into the shipped game.
export function createApi(
  resolveUser: ResolveUser = async (request, env) =>
    getAuth(env)?.getUser(request) ?? null,
) {
  return async (request: Request, env: Env): Promise<Response> => {
    const path = new URL(request.url).pathname
    if (!path.startsWith('/api/')) {
      if (path.startsWith('/auth/'))
        return json({ error: 'Sign-in is not configured.' }, 503)
      return env.ASSETS.fetch(request)
    }
    if (!['GET', 'POST'].includes(request.method))
      return json({ error: 'Method not allowed.' }, 405)
    if (
      request.method === 'POST' &&
      !isSameOriginRequest(
        request,
        env.APP_ORIGIN ?? new URL(request.url).origin,
      )
    ) {
      return json({ error: 'Cross-origin request refused.' }, 403)
    }
    const user = await resolveUser(request, env)
    if (path === '/api/session' && request.method === 'GET') {
      return json({
        authEnabled: Boolean(env.FREEBUFF_CLIENT_ID && env.APP_ORIGIN),
        user: user ? { name: user.name || 'Little bird' } : null,
      })
    }
    if (path === '/api/health' && request.method === 'GET')
      return json({ ok: true })
    if (!['/api/leaderboard', '/api/runs', '/api/scores'].includes(path))
      return json({ error: 'Not found.' }, 404)
    if (request.method === 'POST' && !user)
      return json({ error: 'Sign in to save a score.' }, 401)
    if (!env.DB) return json({ error: 'Leaderboard unavailable.' }, 503)
    const db = env.DB
    await database(db)
    if (path === '/api/leaderboard' && request.method === 'GET') {
      const { results } = await db
        .prepare(
          'SELECT name, score, owner_sub = ? AS isMe FROM leaderboard ORDER BY score DESC, achieved_at ASC, owner_sub ASC LIMIT 20',
        )
        .bind(user?.sub ?? '')
        .all()
      const best = user
        ? await db
            .prepare('SELECT score FROM leaderboard WHERE owner_sub = ?')
            .bind(user.sub)
            .first<{ score: number }>()
        : null
      return json({ entries: results, best: best?.score ?? 0 })
    }
    if (path === '/api/runs' && request.method === 'POST' && user) {
      const now = Date.now(),
        id = crypto.randomUUID(),
        seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const result = await db
        .prepare(
          'INSERT INTO runs (id, owner_sub, seed, started_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM runs WHERE owner_sub = ? AND started_at > ?)',
        )
        .bind(id, user.sub, seed, now, user.sub, now - 800)
        .run()
      if (!result.meta.changes)
        return json({ error: 'Take a breath, then try again.' }, 429)
      // Bounded cleanup; no sweeps of a shared service or production database.
      await db
        .prepare(
          'DELETE FROM runs WHERE id IN (SELECT id FROM runs WHERE started_at < ? ORDER BY started_at LIMIT 100)',
        )
        .bind(now - 30 * 60_000)
        .run()
      return json({ id, seed })
    }
    if (path === '/api/scores' && request.method === 'POST' && user) {
      const body = (await readBody(request)) as {
        id?: unknown
        ticks?: unknown
        inputs?: unknown
      } | null
      if (!body || typeof body.id !== 'string' || body.id.length > 50)
        return json({ error: 'Invalid flight.' }, 400)
      const run = await db
        .prepare(
          'SELECT seed, started_at, consumed_at FROM runs WHERE id = ? AND owner_sub = ?',
        )
        .bind(body.id, user.sub)
        .first<{
          seed: number
          started_at: number
          consumed_at: number | null
        }>()
      if (!run || Date.now() - run.started_at > 30 * 60_000)
        return json({ error: 'This flight expired.' }, 400)
      if (run.consumed_at !== null) return json({ saved: true }) // Idempotent network retry.
      const result = verifyReplay(run.seed, body.ticks, body.inputs)
      if (
        !result ||
        (result.ticks / 120) * 1000 > Date.now() - run.started_at + 1500
      )
        return json({ error: 'This flight could not be verified.' }, 400)
      const name =
        (user.name || 'Little bird')
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .trim()
          .slice(0, 40) || 'Little bird'
      // D1 batch is transactional. The one-use predicate and best-score upsert
      // preserve a better result even when two tabs finish in the other order.
      await db.batch([
        db
          .prepare(
            `INSERT INTO leaderboard (owner_sub, name, score, achieved_at)
          SELECT owner_sub, ?, ?, ? FROM runs WHERE id = ? AND owner_sub = ? AND consumed_at IS NULL
          ON CONFLICT(owner_sub) DO UPDATE SET name = excluded.name, score = excluded.score, achieved_at = excluded.achieved_at
          WHERE excluded.score > leaderboard.score`,
          )
          .bind(name, result.score, Date.now(), body.id, user.sub),
        db
          .prepare(
            'UPDATE runs SET consumed_at = ? WHERE id = ? AND owner_sub = ? AND consumed_at IS NULL',
          )
          .bind(Date.now(), body.id, user.sub),
      ])
      return json({ saved: true, score: result.score })
    }
    return json({ error: 'Method not allowed.' }, 405)
  }
}
const api = createApi()
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const auth = getAuth(env)
      return await (auth
        ? auth.wrap((req) => api(req, env))(request)
        : api(request, env))
    } catch {
      // Never log request URLs, cookies, or OIDC details.
      console.error('Flappy Bird request failed')
      return json({ error: 'Could not connect. Please try again.' }, 500)
    }
  },
}
