
import { Pool } from 'pg'

let pool: Pool | undefined

export function getDatabasePool(): Pool {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('Database configuration is unavailable.')
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 10000,
      max: 10,
    })
  }

  return pool
}
