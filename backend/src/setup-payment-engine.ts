import { Pool } from 'pg'

async function setupPaymentEngine(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not available.')

  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10000, max: 1 })
  try {
    await pool.query('BEGIN')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_payment_transactions (
        transaction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        user_id BIGINT NOT NULL REFERENCES public.marketplace_users(user_id) ON DELETE RESTRICT,
        gateway_key TEXT NOT NULL DEFAULT 'paystack' CHECK (gateway_key = 'paystack'),
        gateway_mode TEXT NOT NULL CHECK (gateway_mode IN ('test', 'live')),
        purpose_key TEXT NOT NULL CHECK (purpose_key ~ '^[a-z][a-z0-9_]{1,59}$'),
        subject_type TEXT,
        subject_id TEXT,
        amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
        currency_code CHAR(3) NOT NULL,
        customer_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'initialized'
          CHECK (status IN ('initialized','pending','success','failed','abandoned','reversed','refunded')),
        authorization_url TEXT,
        access_code TEXT,
        provider_transaction_id TEXT,
        idempotency_key TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        paid_at TIMESTAMPTZ,
        failure_message TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK ((subject_type IS NULL) = (subject_id IS NULL))
      )
    `)
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_user_idempotency
      ON public.marketplace_payment_transactions(user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_created
      ON public.marketplace_payment_transactions(user_id, created_at DESC)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_status_created
      ON public.marketplace_payment_transactions(status, created_at DESC)
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_payment_transaction_events (
        event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        transaction_id BIGINT NOT NULL REFERENCES public.marketplace_payment_transactions(transaction_id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL,
        event_source TEXT NOT NULL CHECK (event_source IN ('api','webhook','admin')),
        provider_event_id TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_provider_event
      ON public.marketplace_payment_transaction_events(event_source, provider_event_id)
      WHERE provider_event_id IS NOT NULL
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_created
      ON public.marketplace_payment_transaction_events(transaction_id, created_at DESC)
    `)
    await pool.query('COMMIT')

    const check = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [['marketplace_payment_transactions', 'marketplace_payment_transaction_events']],
    )
    if (check.rowCount !== 2) throw new Error('Payment engine schema verification failed.')
    console.log('PAYMENT ENGINE DATABASE SETUP COMPLETED')
    check.rows.forEach(row => console.log(`Verified public.${row.table_name}`))
    console.log('No transactions were created. Payment processing remains disabled until configured and tested.')
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await pool.end()
  }
}

setupPaymentEngine().catch((error: unknown) => {
  console.error('PAYMENT ENGINE SETUP FAILED:', error instanceof Error ? error.message : 'Unknown setup error')
  process.exitCode = 1
})
