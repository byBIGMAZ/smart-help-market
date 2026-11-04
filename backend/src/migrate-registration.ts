import { getDatabasePool } from './database'

async function migrateRegistration() {
  const db = getDatabasePool()

  try {
    await db.query('BEGIN')

    await db.query(`
      ALTER TABLE public.marketplace_users
      ADD COLUMN IF NOT EXISTS account_type TEXT
      NOT NULL DEFAULT 'buyer'
    `)

    await db.query(`
      ALTER TABLE public.marketplace_users
      ADD COLUMN IF NOT EXISTS verification_status TEXT
      NOT NULL DEFAULT 'not_required'
    `)

    await db.query(`
      UPDATE public.marketplace_users
      SET
        account_type = COALESCE(account_type, 'buyer'),
        verification_status = COALESCE(
          verification_status,
          'not_required'
        )
    `)

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'marketplace_users_account_type_check'
            AND conrelid = 'public.marketplace_users'::regclass
        ) THEN
          ALTER TABLE public.marketplace_users
          ADD CONSTRAINT marketplace_users_account_type_check
          CHECK (
            account_type IN (
              'buyer',
              'landlord',
              'seller',
              'service_provider',
              'agent'
            )
          );
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'marketplace_users_verification_status_check'
            AND conrelid = 'public.marketplace_users'::regclass
        ) THEN
          ALTER TABLE public.marketplace_users
          ADD CONSTRAINT marketplace_users_verification_status_check
          CHECK (
            verification_status IN (
              'not_required',
              'pending',
              'approved',
              'rejected'
            )
          );
        END IF;
      END
      $$;
    `)

    await db.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_users_account_type
      ON public.marketplace_users (account_type)
    `)

    await db.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_users_verification_status
      ON public.marketplace_users (verification_status)
    `)

    await db.query('COMMIT')

    const result = await db.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_users'
        AND column_name IN (
          'account_type',
          'verification_status'
        )
      ORDER BY column_name
    `)

    console.log('REGISTRATION DATABASE MIGRATION COMPLETED')
    console.table(result.rows)
    console.log('Existing marketplace users have been preserved.')
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await db.end()
  }
}

migrateRegistration().catch((error: unknown) => {
  console.error(
    'REGISTRATION MIGRATION FAILED:',
    error instanceof Error ? error.message : 'Unknown error',
  )
  process.exitCode = 1
})
