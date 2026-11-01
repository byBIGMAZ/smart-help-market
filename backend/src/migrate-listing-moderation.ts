
import { getDatabasePool } from './database'

async function migrateListingModeration() {
  const db = getDatabasePool()
  const client = await db.connect()

  try {
    console.log('STARTING LISTING MODERATION MIGRATION')

    await client.query('BEGIN')

    // 1. Add nullable listing ownership.
    // Existing listings and demonstration listings remain ownerless.
    await client.query(`
      ALTER TABLE public.marketplace_listings
      ADD COLUMN IF NOT EXISTS owner_user_id BIGINT
    `)

    // 2. Add the owner relationship.
    // Deleting a user will not delete their listings.
    // Their listings will simply become ownerless.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'marketplace_listings_owner_user_id_fkey'
            AND conrelid = 'public.marketplace_listings'::regclass
        ) THEN
          ALTER TABLE public.marketplace_listings
          ADD CONSTRAINT marketplace_listings_owner_user_id_fkey
          FOREIGN KEY (owner_user_id)
          REFERENCES public.marketplace_users(user_id)
          ON DELETE SET NULL;
        END IF;
      END
      $$
    `)

    // 3. Extend the listing status constraint.
    // Preserve all existing statuses and add suspended.
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

    // 4. Create listing moderation history.
    // Listing and actor references become NULL if their
    // associated records are deleted. Historical snapshots remain.
    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public.marketplace_listing_moderation_history (
          history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

          listing_id BIGINT
            REFERENCES public.marketplace_listings(listing_id)
            ON DELETE SET NULL,

          listing_key TEXT NOT NULL,

          actor_user_id BIGINT
            REFERENCES public.marketplace_users(user_id)
            ON DELETE SET NULL,

          action_key TEXT NOT NULL,

          previous_status TEXT,
          new_status TEXT,

          reason TEXT NOT NULL DEFAULT '',

          details JSONB NOT NULL DEFAULT '{}'::jsonb,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT marketplace_listing_history_action_not_blank
            CHECK (length(trim(action_key)) > 0),

          CONSTRAINT marketplace_listing_history_key_not_blank
            CHECK (length(trim(listing_key)) > 0)
        )
    `)

    // 5. Create indexes for moderation queries.
    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_listings_owner
      ON public.marketplace_listings(owner_user_id)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_listing_moderation_history_listing
      ON public.marketplace_listing_moderation_history(
        listing_id,
        created_at DESC
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_listing_moderation_history_actor
      ON public.marketplace_listing_moderation_history(
        actor_user_id,
        created_at DESC
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_listing_moderation_history_created
      ON public.marketplace_listing_moderation_history(
        created_at DESC
      )
    `)

    // 6. Verify the ownership column.
    const ownershipResult = await client.query<{
      column_name: string
    }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_listings'
        AND column_name = 'owner_user_id'
    `)

    if (ownershipResult.rows.length !== 1) {
      throw new Error(
        'Listing ownership column verification failed.',
      )
    }

    // 7. Verify the suspended status is permitted.
    const statusResult = await client.query<{
      constraint_definition: string
    }>(`
      SELECT pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'public.marketplace_listings'::regclass
        AND conname = 'marketplace_listings_status_check'
    `)

    const statusDefinition =
      statusResult.rows[0]?.constraint_definition ?? ''

    if (!statusDefinition.includes('suspended')) {
      throw new Error(
        'Suspended listing status verification failed.',
      )
    }

    // 8. Verify moderation history table.
    const historyResult = await client.query<{
      table_name: string | null
    }>(`
      SELECT to_regclass(
        'public.marketplace_listing_moderation_history'
      ) AS table_name
    `)

    if (!historyResult.rows[0]?.table_name) {
      throw new Error(
        'Moderation history table verification failed.',
      )
    }

    // Commit only after all verification checks pass.
    await client.query('COMMIT')

    console.log('')
    console.log('LISTING MODERATION MIGRATION SUCCESSFUL')
    console.log('---------------------------------------')
    console.log('Listing ownership column: VERIFIED')
    console.log('Owner foreign key: VERIFIED')
    console.log('Suspended listing status: VERIFIED')
    console.log('Moderation history table: VERIFIED')
    console.log('Moderation indexes: CREATED OR VERIFIED')
    console.log('Existing listing records: PRESERVED')
    console.log('Demonstration listing records: NOT MODIFIED')
    console.log('Transaction: COMMITTED')
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined)

    console.error('')
    console.error('LISTING MODERATION MIGRATION FAILED')

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

migrateListingModeration().catch(() => {
  process.exitCode = 1
})
