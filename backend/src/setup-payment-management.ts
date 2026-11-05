import { Pool } from 'pg'

async function setupPaymentManagement(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not available.')

  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10000, max: 1 })
  try {
    await pool.query('BEGIN')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_payment_configuration (
        configuration_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (configuration_id = 1),
        gateway_key TEXT NOT NULL DEFAULT 'paystack' CHECK (gateway_key = 'paystack'),
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        mode TEXT NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live')),
        public_key TEXT,
        secret_key_ciphertext TEXT,
        secret_key_mode TEXT CHECK (secret_key_mode IS NULL OR secret_key_mode IN ('test','live')),
        webhook_secret_ciphertext TEXT,
        currency_code TEXT NOT NULL DEFAULT 'NGN',
        payment_channels JSONB NOT NULL DEFAULT '["card","bank","ussd","mobile_money","bank_transfer"]'::jsonb,
        transaction_settings JSONB NOT NULL DEFAULT '{"transactionExpiryMinutes":30,"minimumAmount":100,"maximumAmount":100000000}'::jsonb,
        fee_settings JSONB NOT NULL DEFAULT '{"feePayer":"customer","platformFeeEnabled":false,"platformFeeType":"fixed","platformFeeValue":0,"agentCommissionEnabled":false,"agentCommissionType":"percentage","agentCommissionValue":0}'::jsonb,
        escrow_settings JSONB NOT NULL DEFAULT '{"enabled":false,"holdingPeriodHours":72,"automaticRelease":false}'::jsonb,
        inspection_settings JSONB NOT NULL DEFAULT '{"enabled":false,"requirePayment":true,"bookingExpiryHours":24}'::jsonb,
        updated_by BIGINT REFERENCES public.marketplace_users(user_id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await pool.query(`ALTER TABLE public.marketplace_payment_configuration ADD COLUMN IF NOT EXISTS secret_key_mode TEXT CHECK (secret_key_mode IS NULL OR secret_key_mode IN ('test','live'))`)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_payment_credential_otps (
        otp_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        admin_user_id BIGINT NOT NULL REFERENCES public.marketplace_users(user_id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await pool.query('CREATE INDEX IF NOT EXISTS idx_payment_credential_otps_admin_created ON public.marketplace_payment_credential_otps(admin_user_id, created_at DESC)')
    await pool.query('ALTER TABLE public.marketplace_payment_credential_otps ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ')
    await pool.query('ALTER TABLE public.marketplace_payment_credential_otps ADD COLUMN IF NOT EXISTS credential_change_token_hash TEXT')
    await pool.query(`
      INSERT INTO public.marketplace_payment_configuration (configuration_id)
      VALUES (1) ON CONFLICT (configuration_id) DO NOTHING
    `)
    await pool.query('COMMIT')
    const check = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       AND table_name = ANY($1::text[]) ORDER BY table_name`,
      [['marketplace_payment_configuration', 'marketplace_payment_credential_otps']],
    )
    if (check.rowCount !== 2) throw new Error('Payment management schema verification failed.')
    console.log('PAYMENT MANAGEMENT DATABASE SETUP COMPLETED')
    check.rows.forEach(row => console.log(`Verified public.${row.table_name}`))
    console.log('Paystack configuration initialized in disabled test mode. No credentials have been added.')
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await pool.end()
  }
}

setupPaymentManagement().catch((error: unknown) => {
  console.error('PAYMENT MANAGEMENT SETUP FAILED:', error instanceof Error ? error.message : 'Unknown setup error')
  process.exitCode = 1
})
