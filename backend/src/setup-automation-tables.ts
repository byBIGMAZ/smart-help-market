
import { getDatabasePool } from './database'

async function setupAutomationTables() {
  const db = getDatabasePool()
  const client = await db.connect()

const expectedTables = [
  'marketplace_automation_events',
  'marketplace_automation_rules',
  'marketplace_automation_executions',
  'marketplace_notifications',
  'marketplace_scheduled_tasks',
  'marketplace_automation_control',
]

  try {
    console.log('STARTING AUTOMATION DATABASE SETUP')

    await client.query('BEGIN')

    // 1. AUTOMATION EVENTS
    // Durable queue for marketplace events.
    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public.marketplace_automation_events (
          event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

          event_type TEXT NOT NULL,
          aggregate_type TEXT NOT NULL DEFAULT '',
          aggregate_id TEXT NOT NULL DEFAULT '',

          idempotency_key TEXT NOT NULL UNIQUE,

          payload JSONB NOT NULL DEFAULT '{}'::jsonb,

          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (
              status IN (
                'pending',
                'processing',
                'processed',
                'failed'
              )
            ),

          attempts INTEGER NOT NULL DEFAULT 0
            CHECK (attempts >= 0),

          max_attempts INTEGER NOT NULL DEFAULT 5
            CHECK (max_attempts BETWEEN 1 AND 20),

          available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          locked_at TIMESTAMPTZ,
          processed_at TIMESTAMPTZ,

          last_error TEXT NOT NULL DEFAULT '',

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT automation_events_type_not_blank
            CHECK (length(trim(event_type)) > 0),

          CONSTRAINT automation_events_key_not_blank
            CHECK (length(trim(idempotency_key)) > 0)
        )
    `)

    // 2. AUTOMATION RULES
    // Defines which events trigger which automation actions.
    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public.marketplace_automation_rules (
          rule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

          rule_key TEXT NOT NULL UNIQUE,
          rule_name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',

          event_type TEXT NOT NULL,

          conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
          actions JSONB NOT NULL DEFAULT '[]'::jsonb,

          is_active BOOLEAN NOT NULL DEFAULT FALSE,

          created_by BIGINT
            REFERENCES public.marketplace_users(user_id)
            ON DELETE SET NULL,

          updated_by BIGINT
            REFERENCES public.marketplace_users(user_id)
            ON DELETE SET NULL,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT automation_rules_key_not_blank
            CHECK (length(trim(rule_key)) > 0),

          CONSTRAINT automation_rules_name_not_blank
            CHECK (length(trim(rule_name)) > 0),

          CONSTRAINT automation_rules_event_not_blank
            CHECK (length(trim(event_type)) > 0),

          CONSTRAINT automation_rules_actions_array
            CHECK (jsonb_typeof(actions) = 'array'),

          CONSTRAINT automation_rules_conditions_object
            CHECK (jsonb_typeof(conditions) = 'object')
        )
    `)

    // 3. AUTOMATION EXECUTIONS
    // Records every attempt to execute an automation rule.
    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public.marketplace_automation_executions (
          execution_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

          event_id BIGINT NOT NULL
            REFERENCES public.marketplace_automation_events(event_id)
            ON DELETE RESTRICT,

          rule_id BIGINT
            REFERENCES public.marketplace_automation_rules(rule_id)
            ON DELETE SET NULL,

          attempt_number INTEGER NOT NULL
            CHECK (attempt_number >= 1),

          status TEXT NOT NULL
            CHECK (
              status IN (
                'running',
                'succeeded',
                'failed',
                'skipped'
              )
            ),

          output JSONB NOT NULL DEFAULT '{}'::jsonb,
          error_message TEXT NOT NULL DEFAULT '',

          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT automation_execution_attempt_unique
            UNIQUE (event_id, rule_id, attempt_number)
        )
    `)

    // 4. MARKETPLACE NOTIFICATIONS
    // Supports individual and administrator notifications.
    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public.marketplace_notifications (
          notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

          recipient_user_id BIGINT
            REFERENCES public.marketplace_users(user_id)
            ON DELETE CASCADE,

          audience TEXT NOT NULL DEFAULT 'user'
            CHECK (
              audience IN (
                'user',
                'administrators'
              )
            ),

          notification_type TEXT NOT NULL DEFAULT 'general',

          title TEXT NOT NULL,
          message TEXT NOT NULL,

          source_event_id BIGINT
            REFERENCES public.marketplace_automation_events(event_id)
            ON DELETE SET NULL,

          deduplication_key TEXT UNIQUE,

          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

          read_at TIMESTAMPTZ,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT notification_title_not_blank
            CHECK (length(trim(title)) > 0),

          CONSTRAINT notification_message_not_blank
            CHECK (length(trim(message)) > 0),

          CONSTRAINT notification_recipient_valid
            CHECK (
              (audience = 'user' AND recipient_user_id IS NOT NULL)
              OR
              (audience = 'administrators' AND recipient_user_id IS NULL)
            ),

          CONSTRAINT notification_metadata_object
            CHECK (jsonb_typeof(metadata) = 'object')
        )
    `)

    // 5. SCHEDULED TASKS
    // Stores recurring and one-time automation tasks.
    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public.marketplace_scheduled_tasks (
          task_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

          task_key TEXT NOT NULL UNIQUE,
          task_name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',

          task_type TEXT NOT NULL,

          schedule_type TEXT NOT NULL
            CHECK (
              schedule_type IN (
                'once',
                'interval'
              )
            ),

          run_at TIMESTAMPTZ,

          interval_seconds INTEGER
            CHECK (
              interval_seconds IS NULL
              OR interval_seconds >= 60
            ),

          next_run_at TIMESTAMPTZ,

          status TEXT NOT NULL DEFAULT 'paused'
            CHECK (
              status IN (
                'active',
                'paused',
                'completed',
                'failed'
              )
            ),

          payload JSONB NOT NULL DEFAULT '{}'::jsonb,

          attempts INTEGER NOT NULL DEFAULT 0
            CHECK (attempts >= 0),

          max_attempts INTEGER NOT NULL DEFAULT 3
            CHECK (max_attempts BETWEEN 1 AND 20),

          last_run_at TIMESTAMPTZ,
          last_error TEXT NOT NULL DEFAULT '',

          created_by BIGINT
            REFERENCES public.marketplace_users(user_id)
            ON DELETE SET NULL,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT scheduled_tasks_key_not_blank
            CHECK (length(trim(task_key)) > 0),

          CONSTRAINT scheduled_tasks_name_not_blank
            CHECK (length(trim(task_name)) > 0),

          CONSTRAINT scheduled_tasks_type_not_blank
            CHECK (length(trim(task_type)) > 0),

          CONSTRAINT scheduled_tasks_schedule_valid
            CHECK (
              (
                schedule_type = 'once'
                AND run_at IS NOT NULL
                AND interval_seconds IS NULL
              )
              OR
              (
                schedule_type = 'interval'
                AND interval_seconds IS NOT NULL
              )
            ),

          CONSTRAINT scheduled_tasks_payload_object
            CHECK (jsonb_typeof(payload) = 'object')
        )
    `)

        // 6. GLOBAL AUTOMATION CONTROL
    // Provides database-backed administrative control
    // over background automation processing.
    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public.marketplace_automation_control (
          control_id SMALLINT PRIMARY KEY DEFAULT 1
            CHECK (control_id = 1),

          is_enabled BOOLEAN NOT NULL DEFAULT FALSE,

          is_paused BOOLEAN NOT NULL DEFAULT TRUE,

          pause_reason TEXT NOT NULL DEFAULT '',

          updated_by BIGINT
            REFERENCES public.marketplace_users(user_id)
            ON DELETE SET NULL,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `)

    // Create the single global control record.
    // Existing control settings are never overwritten.
    await client.query(`
      INSERT INTO public.marketplace_automation_control (
        control_id,
        is_enabled,
        is_paused
      )
      VALUES (1, FALSE, TRUE)
      ON CONFLICT (control_id) DO NOTHING
    `)

    // 6. PERFORMANCE INDEXES

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_automation_events_pending
      ON public.marketplace_automation_events (
        available_at,
        event_id
      )
      WHERE status = 'pending'
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_automation_events_processing
      ON public.marketplace_automation_events (
        locked_at
      )
      WHERE status = 'processing'
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_automation_events_type
      ON public.marketplace_automation_events (
        event_type,
        created_at DESC
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_automation_rules_event_active
      ON public.marketplace_automation_rules (
        event_type,
        is_active
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_automation_executions_event
      ON public.marketplace_automation_executions (
        event_id,
        created_at DESC
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_notifications_user
      ON public.marketplace_notifications (
        recipient_user_id,
        created_at DESC
      )
      WHERE recipient_user_id IS NOT NULL
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_notifications_unread
      ON public.marketplace_notifications (
        recipient_user_id,
        created_at DESC
      )
      WHERE read_at IS NULL
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_scheduled_tasks_due
      ON public.marketplace_scheduled_tasks (
        next_run_at,
        task_id
      )
      WHERE status = 'active'
    `)

    // 7. VERIFY ALL FIVE TABLES

    const verification = await client.query<{
      table_name: string
    }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name
      `,
      [expectedTables],
    )

    const verifiedNames = verification.rows.map(
      (row) => row.table_name,
    )

    const missingTables = expectedTables.filter(
      (name) => !verifiedNames.includes(name),
    )

    if (missingTables.length > 0) {
      throw new Error(
        `Automation table verification failed: ${missingTables.join(', ')}`,
      )
    }

    await client.query('COMMIT')

    console.log('')
    console.log('AUTOMATION DATABASE SETUP SUCCESSFUL')
    console.log('-------------------------------------')
    console.log(`Verified tables: ${verifiedNames.length}`)

    for (const table of verifiedNames) {
      console.log(`Verified: public.${table}`)
    }

    console.log('Automation indexes: CREATED OR VERIFIED')
    console.log('Existing marketplace records: PRESERVED')
    console.log('Transaction: COMMITTED')
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined)

    console.error('')
    console.error('AUTOMATION DATABASE SETUP FAILED')

    console.error(
      error instanceof Error
        ? error.message
        : 'Unknown database setup error',
    )

    throw error
  } finally {
    client.release()
    await db.end()
  }
}

setupAutomationTables().catch(() => {
  process.exitCode = 1
})
