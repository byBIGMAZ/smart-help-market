
import { Pool } from 'pg'

async function testDatabaseConnection(): Promise<void> {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.error('DATABASE_URL is missing. Check your Codespaces secret.')
    process.exitCode = 1
    return
  }

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10000,
    max: 1,
  })

  try {
    const result = await pool.query<{
      database_name: string
      server_time: Date
    }>(
      'SELECT current_database() AS database_name, NOW() AS server_time',
    )

    console.log('DATABASE CONNECTION SUCCESSFUL')
    console.log('Database:', result.rows[0].database_name)
    console.log('Server time:', result.rows[0].server_time.toISOString())
  } catch (error: unknown) {
  if (error && typeof error === 'object') {
    const details = error as {
      name?: string
      code?: string | number
    }

    console.error('DATABASE CONNECTION FAILED')
    console.error('Error type:', details.name ?? 'Unknown')
    console.error('Error code:', details.code ?? 'Not provided')
  } else {
    console.error('DATABASE CONNECTION FAILED')
    console.error('Error type: Unknown')
  }

  process.exitCode = 1
} finally {
    await pool.end()
  }
}

testDatabaseConnection().catch(() => {
  console.error('DATABASE TEST FAILED unexpectedly.')
  process.exitCode = 1
})
