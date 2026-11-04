import { getDatabasePool } from './database'

const initialSettings = [
  ['help.assistant.enabled', true, 'help_centre', 'Enable or disable the Help Centre assistant.', false],
  ['help.messages.free_limit', 30, 'help_centre', 'Included assistant messages per user per calendar month.', false],
  ['help.messages.paid_enabled', false, 'help_centre', 'Enable paid assistant message packages after payment integration is connected.', false],
  ['help.messages.pack_size', 50, 'help_centre', 'Number of additional assistant messages in one paid package.', false],
  ['help.messages.pack_price_ngn', 500, 'help_centre', 'Price in NGN for one additional assistant message package.', false],
] as const

async function setupHelpCentreTables() {
  const db = getDatabasePool()
  try {
    await db.query('BEGIN')
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_help_conversations (
        conversation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES public.marketplace_users(user_id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'New conversation',
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'needs_admin', 'resolved')),
        context JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_help_messages (
        message_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        conversation_id BIGINT NOT NULL REFERENCES public.marketplace_help_conversations(conversation_id) ON DELETE CASCADE,
        sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'assistant', 'admin')),
        message_text TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT help_message_text_not_blank CHECK (length(trim(message_text)) > 0)
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_help_usage (
        user_id BIGINT NOT NULL REFERENCES public.marketplace_users(user_id) ON DELETE CASCADE,
        period_start DATE NOT NULL,
        messages_used INTEGER NOT NULL DEFAULT 0 CHECK (messages_used >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, period_start)
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_help_support_cases (
        case_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        conversation_id BIGINT NOT NULL REFERENCES public.marketplace_help_conversations(conversation_id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES public.marketplace_users(user_id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'assigned', 'resolved')),
        assigned_to BIGINT REFERENCES public.marketplace_users(user_id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query('CREATE INDEX IF NOT EXISTS idx_help_conversations_user_updated ON public.marketplace_help_conversations(user_id, updated_at DESC)')
    await db.query('CREATE INDEX IF NOT EXISTS idx_help_messages_conversation ON public.marketplace_help_messages(conversation_id, message_id)')
    await db.query('CREATE INDEX IF NOT EXISTS idx_help_cases_status_created ON public.marketplace_help_support_cases(status, created_at DESC)')
    for (const [key, value, group, description, isPublic] of initialSettings) {
      await db.query(
        `INSERT INTO public.platform_settings (setting_key, setting_value, setting_group, description, is_public)
         VALUES ($1, $2::jsonb, $3, $4, $5)
         ON CONFLICT (setting_key) DO NOTHING`,
        [key, JSON.stringify(value), group, description, isPublic],
      )
    }
    await db.query('COMMIT')
    const result = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [['marketplace_help_conversations', 'marketplace_help_messages', 'marketplace_help_usage', 'marketplace_help_support_cases']],
    )
    if (result.rowCount !== 4) throw new Error('Help Centre table verification failed.')
    console.log('HELP CENTRE DATABASE SETUP COMPLETED')
    result.rows.forEach((row) => console.log(`Verified public.${row.table_name}`))
    console.log(`Verified ${initialSettings.length} Help Centre settings.`)
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await db.end()
  }
}

setupHelpCentreTables().catch((error: unknown) => {
  console.error('HELP CENTRE DATABASE SETUP FAILED:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
})
