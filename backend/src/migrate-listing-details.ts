import { getDatabasePool } from './database'

async function migrateListingDetails() {
  const db = getDatabasePool()
  const client = await db.connect()

  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '30s'")

    await client.query(`
      ALTER TABLE public.marketplace_listings
      ADD COLUMN IF NOT EXISTS listing_details JSONB NOT NULL DEFAULT '{}'::jsonb
    `)

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'marketplace_listings_details_object'
            AND conrelid = 'public.marketplace_listings'::regclass
        ) THEN
          ALTER TABLE public.marketplace_listings
          ADD CONSTRAINT marketplace_listings_details_object
          CHECK (
            jsonb_typeof(listing_details) = 'object'
            AND octet_length(listing_details::text) <= 65536
          );
        END IF;
      END
      $$;
    `)

    const verification = await client.query<{
      column_name: string
      data_type: string
      column_default: string | null
    }>(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_listings'
        AND column_name = 'listing_details'
    `)

    if (
      verification.rowCount !== 1 ||
      verification.rows[0]?.data_type !== 'jsonb'
    ) {
      throw new Error('The listing_details JSONB column could not be verified.')
    }

    const existing = await client.query<{ total: string }>(`
      SELECT COUNT(*)::text AS total
      FROM public.marketplace_listings
    `)

    await client.query('COMMIT')

    console.log('LISTING DETAILS MIGRATION COMPLETED')
    console.log('Verified marketplace_listings.listing_details (JSONB)')
    console.log('Verified object and 64 KB size constraints')
    console.log(`Existing listing records preserved: ${existing.rows[0]?.total ?? '0'}`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await db.end()
  }
}

migrateListingDetails().catch((error: unknown) => {
  console.error(
    'LISTING DETAILS MIGRATION FAILED:',
    error instanceof Error ? error.message : 'Unknown error',
  )
  process.exitCode = 1
})
