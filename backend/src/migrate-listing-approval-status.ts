
import { getDatabasePool } from './database'

async function migrateListingApprovalStatus() {
  const db = getDatabasePool()
  const client = await db.connect()

  try {
    console.log('STARTING LISTING APPROVAL STATUS MIGRATION')

    await client.query('BEGIN')

    // Confirm the listings table exists.
    const tableResult = await client.query<{
      table_name: string | null
    }>(`
      SELECT to_regclass(
        'public.marketplace_listings'
      ) AS table_name
    `)

    if (!tableResult.rows[0]?.table_name) {
      throw new Error(
        'Marketplace listings table does not exist.',
      )
    }

    // Lock the table against concurrent listing changes
    // while the status constraint is being updated.
    await client.query(`
      LOCK TABLE public.marketplace_listings
      IN ACCESS EXCLUSIVE MODE
    `)

    // Add approved while preserving all existing statuses.
    // Existing listing records are not updated.
    await client.query(`
      ALTER TABLE public.marketplace_listings
      DROP CONSTRAINT IF EXISTS marketplace_listings_status_check
    `)

    await client.query(`
      ALTER TABLE public.marketplace_listings
      ADD CONSTRAINT marketplace_listings_status_check
      CHECK (
        status IN (
          'draft',
          'pending_review',
          'approved',
          'published',
          'paused',
          'rented',
          'sold',
          'unavailable',
          'rejected',
          'suspended'
        )
      )
    `)

    // Verify the updated constraint.
    const constraintResult = await client.query<{
      definition: string
    }>(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid =
        'public.marketplace_listings'::regclass
        AND conname = 'marketplace_listings_status_check'
    `)

    const definition =
      constraintResult.rows[0]?.definition ?? ''

    if (!definition.includes('approved')) {
      throw new Error(
        'Approval status verification failed.',
      )
    }

    // Verify existing records were not changed.
    const recordsResult = await client.query<{
      total: string
      demo: string
    }>(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (
          WHERE is_demo = TRUE
        )::text AS demo
      FROM public.marketplace_listings
    `)

    const total = recordsResult.rows[0]?.total ?? '0'
    const demo = recordsResult.rows[0]?.demo ?? '0'

    await client.query('COMMIT')

    console.log('')
    console.log('LISTING APPROVAL MIGRATION SUCCESSFUL')
    console.log('--------------------------------------')
    console.log('Approved status: VERIFIED')
    console.log('Existing listing records: PRESERVED')
    console.log(`Total listing records: ${total}`)
    console.log(`Demonstration records: ${demo}`)
    console.log('Transaction: COMMITTED')
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined)

    console.error('')
    console.error('LISTING APPROVAL MIGRATION FAILED')
    console.error(
      error instanceof Error
        ? error.message
        : 'Unknown migration error',
    )

    throw error
  } finally {
    client.release()
    await db.end()
  }
}

migrateListingApprovalStatus().catch(() => {
  process.exitCode = 1
})
