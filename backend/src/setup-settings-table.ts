
import { Pool } from 'pg'

async function createSettingsTable(): Promise<void> {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is not available.')
  }

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10000,
    max: 1,
  })

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value JSONB NOT NULL,
        setting_group TEXT NOT NULL,
        description TEXT,
        is_public BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT platform_settings_key_not_blank
          CHECK (length(trim(setting_key)) > 0),

        CONSTRAINT platform_settings_group_not_blank
          CHECK (length(trim(setting_group)) > 0)
      )
    `)

    const result = await pool.query<{
      table_name: string
    }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'platform_settings'`,
    )

    if (result.rowCount !== 1) {
      throw new Error('Settings table verification failed.')
    }

    console.log('SETTINGS TABLE CREATED OR ALREADY EXISTS')
    console.log('Verified table:', result.rows[0].table_name)
  } finally {
    await pool.end()
  }
}

createSettingsTable().catch(() => {
  console.error(
    'SETTINGS TABLE SETUP FAILED. Check the database connection and permissions.',
  )
  process.exitCode = 1
})
