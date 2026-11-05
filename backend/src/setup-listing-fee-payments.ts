import { getDatabasePool } from './database'

async function setupListingFeePayments(): Promise<void> {
  const db = getDatabasePool()
  const client = await db.connect()

  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '30s'")

    await client.query(`
      ALTER TABLE public.marketplace_listings
      ADD COLUMN IF NOT EXISTS listing_fee_paid_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS listing_fee_amount_minor BIGINT,
      ADD COLUMN IF NOT EXISTS listing_fee_currency CHAR(3),
      ADD COLUMN IF NOT EXISTS listing_fee_transaction_id BIGINT
    `)

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'marketplace_listings_listing_fee_transaction_fk'
            AND conrelid = 'public.marketplace_listings'::regclass
        ) THEN
          ALTER TABLE public.marketplace_listings
          ADD CONSTRAINT marketplace_listings_listing_fee_transaction_fk
          FOREIGN KEY (listing_fee_transaction_id)
          REFERENCES public.marketplace_payment_transactions(transaction_id)
          ON DELETE RESTRICT;
        END IF;
      END
      $$;
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_listings_listing_fee_transaction
      ON public.marketplace_listings(listing_fee_transaction_id)
      WHERE listing_fee_transaction_id IS NOT NULL
    `)

    const verified = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_listings'
        AND column_name = ANY($1::text[])
    `, [[
      'listing_fee_paid_at',
      'listing_fee_amount_minor',
      'listing_fee_currency',
      'listing_fee_transaction_id',
    ]])

    if (verified.rowCount !== 4) {
      throw new Error('One or more listing fee payment columns could not be verified.')
    }

    await client.query('COMMIT')
    console.log('LISTING FEE PAYMENT DATABASE SETUP COMPLETED')
    console.log('Verified listing fee payment timestamp, amount, currency and transaction link.')
    console.log('Existing listings preserved. No payments were initiated.')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await db.end()
  }
}

setupListingFeePayments().catch((error: unknown) => {
  console.error('LISTING FEE PAYMENT SETUP FAILED:', error instanceof Error ? error.message : 'Unknown setup error')
  process.exitCode = 1
})
