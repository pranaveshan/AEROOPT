// In-memory D1 stand-in backed by Node's built-in SQLite, so API and engine
// tests run against real SQL and real persistence semantics.
import { DatabaseSync } from 'node:sqlite'

import type { D1DatabaseLike, D1PreparedStatement, D1Result } from '../../src/worker/db'

export function createTestDb(): D1DatabaseLike & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')

  const prepare = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...values: unknown[]) => prepare(sql, values),
    all: async <T>() => ({ results: raw.prepare(sql).all(...(params as never[])) as T[], success: true }) as D1Result<T>,
    first: async <T>() => ((raw.prepare(sql).get(...(params as never[])) ?? null) as T | null),
    run: async () => {
      const info = raw.prepare(sql).run(...(params as never[]))
      return { success: true, meta: { changes: Number(info.changes) } }
    },
  })

  return {
    raw,
    prepare: (sql: string) => prepare(sql),
    batch: async <T>(statements: D1PreparedStatement[]) => {
      raw.exec('BEGIN')
      try {
        const results: D1Result<T>[] = []
        for (const statement of statements) results.push((await statement.run()) as D1Result<T>)
        raw.exec('COMMIT')
        return results
      } catch (error) {
        raw.exec('ROLLBACK')
        throw error
      }
    },
  }
}

export const testEnv = (db: D1DatabaseLike) => ({
  DB: db,
  ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
  ENVIRONMENT: 'test',
})

export function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie') ?? ''
  const match = header.match(/aeroopt_session=([^;]+)/)
  return match ? `aeroopt_session=${match[1]}` : ''
}

export async function json<T>(response: Response): Promise<T> {
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : ({} as T)
}
