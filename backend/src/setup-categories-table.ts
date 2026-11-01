
import { getDatabasePool } from './database'

async function setupCategoriesTable() {
  const db = getDatabasePool()

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS marketplace_categories (
        category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        category_key TEXT NOT NULL UNIQUE,
        category_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT marketplace_categories_key_not_blank
          CHECK (length(trim(category_key)) > 0),

        CONSTRAINT marketplace_categories_name_not_blank
          CHECK (length(trim(category_name)) > 0)
      )
    `)

    const result = await db.query<{ table_name: string | null }>(
      `SELECT to_regclass('public.marketplace_categories') AS table_name`,
    )

    if (!result.rows[0]?.table_name) {
      throw new Error('The marketplace_categories table was not found.')
    }

    console.log('CATEGORY TABLE CREATED OR ALREADY EXISTS')
    console.log(`Verified table: ${result.rows[0].table_name}`)
  } finally {
    await db.end()
  }
}

setupCategoriesTable().catch((error: unknown) => {
  const details =
    error instanceof Error ? error.message : 'Unknown setup error'

  console.error('CATEGORY TABLE SETUP FAILED:', details)
  process.exitCode = 1
})
