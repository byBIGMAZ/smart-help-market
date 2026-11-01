
import { getDatabasePool } from './database'

async function setupListingsTable() {
  const db = getDatabasePool()

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS marketplace_listings (
        listing_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

        listing_key TEXT NOT NULL UNIQUE,

        category_key TEXT NOT NULL
          REFERENCES public.marketplace_categories(category_key)
          ON UPDATE CASCADE
          ON DELETE RESTRICT,

        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',

        price NUMERIC(14, 2) NOT NULL DEFAULT 0
          CHECK (price >= 0),

        price_unit TEXT NOT NULL DEFAULT '',
        location_display TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT '◈',
        listing_tag TEXT NOT NULL DEFAULT '',

        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (
            status IN (
              'draft',
              'pending_review',
              'published',
              'paused',
              'rented',
              'sold',
              'unavailable',
              'rejected'
            )
          ),

        is_demo BOOLEAN NOT NULL DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT marketplace_listings_key_not_blank
          CHECK (length(trim(listing_key)) > 0),

        CONSTRAINT marketplace_listings_title_not_blank
          CHECK (length(trim(title)) > 0),

        CONSTRAINT marketplace_listings_category_not_blank
          CHECK (length(trim(category_key)) > 0)
      )
    `)

    await db.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_listings_category_status
      ON public.marketplace_listings (
        category_key,
        status
      )
    `)

    await db.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_listings_published
      ON public.marketplace_listings (created_at DESC)
      WHERE status = 'published'
    `)

    const result = await db.query<{
      table_name: string | null
    }>(`
      SELECT to_regclass(
        'public.marketplace_listings'
      ) AS table_name
    `)

    if (!result.rows[0]?.table_name) {
      throw new Error(
        'The marketplace_listings table could not be verified.',
      )
    }

    console.log('LISTINGS TABLE CREATED OR ALREADY EXISTS')
    console.log(`Verified table: ${result.rows[0].table_name}`)
    console.log('Category relationship: verified by PostgreSQL')
    console.log('Listing status constraints: installed')
    console.log('Listing indexes: installed')
  } finally {
    await db.end()
  }
}

setupListingsTable().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown setup error'

  console.error('LISTINGS TABLE SETUP FAILED:', message)
  process.exitCode = 1
})
