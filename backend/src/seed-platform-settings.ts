
import { Pool } from 'pg'

type InitialSetting = {
  key: string
  value: unknown
  group: string
  description: string
  isPublic: boolean
}

const initialSettings: InitialSetting[] = [
  {
    key: 'platform.name',
    value: 'SMART HELP MARKET BY BIGMAZ',
    group: 'branding',
    description: 'The marketplace display name.',
    isPublic: true,
  },
  {
    key: 'platform.currency',
    value: 'NGN',
    group: 'regional',
    description: 'The default currency code for marketplace prices.',
    isPublic: true,
  },
  {
    key: 'platform.locale',
    value: 'en-NG',
    group: 'regional',
    description: 'The default locale used for regional formatting.',
    isPublic: true,
  },
  {
    key: 'platform.timezone',
    value: 'Africa/Lagos',
    group: 'regional',
    description: 'The default timezone for marketplace display and scheduling.',
    isPublic: true,
  },
]

async function seedPlatformSettings(): Promise<void> {
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
    await pool.query('BEGIN')

    for (const setting of initialSettings) {
      await pool.query(
        `INSERT INTO platform_settings
          (setting_key, setting_value, setting_group, description, is_public)
         VALUES ($1, $2::jsonb, $3, $4, $5)
         ON CONFLICT (setting_key) DO NOTHING`,
        [
          setting.key,
          JSON.stringify(setting.value),
          setting.group,
          setting.description,
          setting.isPublic,
        ],
      )
    }

    await pool.query('COMMIT')

    const result = await pool.query<{
      setting_key: string
      setting_group: string
    }>(
      `SELECT setting_key, setting_group
       FROM platform_settings
       WHERE setting_key = ANY($1::text[])
       ORDER BY setting_key`,
      [initialSettings.map((setting) => setting.key)],
    )

    console.log('INITIAL PLATFORM SETTINGS VERIFIED')
    for (const setting of result.rows) {
      console.log(`${setting.setting_key} [${setting.setting_group}]`)
    }
    console.log(`Verified ${result.rows.length} initial settings.`)
  } catch {
    await pool.query('ROLLBACK').catch(() => undefined)
    throw new Error(
      'Platform settings setup failed. Database details were not displayed.',
    )
  } finally {
    await pool.end()
  }
}

seedPlatformSettings().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Platform settings setup failed.',
  )
  process.exitCode = 1
})
