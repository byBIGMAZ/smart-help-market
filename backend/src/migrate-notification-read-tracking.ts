import { getDatabasePool } from './database'

async function migrateNotificationReadTracking(): Promise<void> {
  const db = getDatabasePool()
  const client = await db.connect()

  try {
    console.log('STARTING NOTIFICATION READ-TRACKING MIGRATION')

    await client.query('BEGIN')

    // Each administrator gets an independent read record
    // for each administrator-wide notification.
    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public.marketplace_notification_reads (
          notification_id BIGINT NOT NULL
            REFERENCES public.marketplace_notifications(notification_id)
            ON DELETE CASCADE,

          user_id BIGINT NOT NULL
            REFERENCES public.marketplace_users(user_id)
            ON DELETE CASCADE,

          read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT marketplace_notification_reads_pk
            PRIMARY KEY (notification_id, user_id)
        )
    `)

    // Efficiently retrieve the notifications read by one administrator.
    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_notification_reads_user
      ON public.marketplace_notification_reads (
        user_id,
        notification_id
      )
    `)

    // Efficiently retrieve administrator-wide notifications by date.
    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_notifications_admin_created
      ON public.marketplace_notifications (
        created_at DESC,
        notification_id DESC
      )
      WHERE audience = 'administrators'
    `)

    // Verify the new table exists.
    const tableResult = await client.query<{
      table_name: string
    }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'marketplace_notification_reads'
      `,
    )

    if (tableResult.rows.length !== 1) {
      throw new Error(
        'Notification read-tracking table verification failed.',
      )
    }

    // Verify the expected columns exist.
    const columnResult = await client.query<{
      column_name: string
    }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'marketplace_notification_reads'
        ORDER BY ordinal_position
      `,
    )

    const expectedColumns = [
      'notification_id',
      'user_id',
      'read_at',
      'created_at',
    ]

    const actualColumns = columnResult.rows.map(
      (row) => row.column_name,
    )

    const missingColumns = expectedColumns.filter(
      (column) => !actualColumns.includes(column),
    )

    if (missingColumns.length > 0) {
      throw new Error(
        `Missing migration columns: ${missingColumns.join(', ')}`,
      )
    }

    await client.query('COMMIT')

    console.log('')
    console.log('NOTIFICATION READ-TRACKING MIGRATION SUCCESSFUL')
    console.log('------------------------------------------------')
    console.log(
      'Verified table: public.marketplace_notification_reads',
    )
    console.log('Verified columns: 4')
    console.log('Administrator read tracking: ENABLED')
    console.log('Customer notification records: PRESERVED')
    console.log('Existing notification table: PRESERVED')
    console.log('Transaction: COMMITTED')
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined)

    console.error('')
    console.error('NOTIFICATION READ-TRACKING MIGRATION FAILED')

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

migrateNotificationReadTracking().catch(() => {
  process.exitCode = 1
})
