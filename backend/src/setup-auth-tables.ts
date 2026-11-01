
import { getDatabasePool } from './database'

async function setupAuthTables() {
  const db = getDatabasePool()

  try {
    await db.query('BEGIN')

    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_users (
        user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL UNIQUE,

        password_hash TEXT NOT NULL,

        display_name TEXT NOT NULL,

        account_status TEXT NOT NULL DEFAULT 'active'
          CHECK (
            account_status IN (
              'active',
              'suspended',
              'disabled'
            )
          ),

        email_verified_at TIMESTAMPTZ,

        last_login_at TIMESTAMPTZ,

        password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT marketplace_users_email_not_blank
          CHECK (length(trim(email)) > 0),

        CONSTRAINT marketplace_users_email_normalized_not_blank
          CHECK (length(trim(email_normalized)) > 0),

        CONSTRAINT marketplace_users_password_hash_not_blank
          CHECK (length(trim(password_hash)) > 0),

        CONSTRAINT marketplace_users_display_name_not_blank
          CHECK (length(trim(display_name)) > 0)
      )
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_roles (
        role_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

        role_key TEXT NOT NULL UNIQUE,
        role_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT marketplace_roles_key_not_blank
          CHECK (length(trim(role_key)) > 0),

        CONSTRAINT marketplace_roles_name_not_blank
          CHECK (length(trim(role_name)) > 0)
      )
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_permissions (
        permission_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

        permission_key TEXT NOT NULL UNIQUE,
        permission_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT marketplace_permissions_key_not_blank
          CHECK (length(trim(permission_key)) > 0),

        CONSTRAINT marketplace_permissions_name_not_blank
          CHECK (length(trim(permission_name)) > 0)
      )
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_user_roles (
        user_id BIGINT NOT NULL
          REFERENCES public.marketplace_users(user_id)
          ON DELETE CASCADE,

        role_id BIGINT NOT NULL
          REFERENCES public.marketplace_roles(role_id)
          ON DELETE RESTRICT,

        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        PRIMARY KEY (user_id, role_id)
      )
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_role_permissions (
        role_id BIGINT NOT NULL
          REFERENCES public.marketplace_roles(role_id)
          ON DELETE CASCADE,

        permission_id BIGINT NOT NULL
          REFERENCES public.marketplace_permissions(permission_id)
          ON DELETE CASCADE,

        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        PRIMARY KEY (role_id, permission_id)
      )
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_sessions (
        session_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

        user_id BIGINT NOT NULL
          REFERENCES public.marketplace_users(user_id)
          ON DELETE CASCADE,

        token_hash TEXT NOT NULL UNIQUE,

        expires_at TIMESTAMPTZ NOT NULL,

        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT marketplace_sessions_token_hash_not_blank
          CHECK (length(trim(token_hash)) > 0),

        CONSTRAINT marketplace_sessions_expiry_after_creation
          CHECK (expires_at > created_at)
      )
    `)

    await db.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_sessions_user
      ON public.marketplace_sessions (user_id)
    `)

    await db.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_sessions_expiry
      ON public.marketplace_sessions (expires_at)
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_audit_logs (
        audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

        actor_user_id BIGINT
          REFERENCES public.marketplace_users(user_id)
          ON DELETE SET NULL,

        action_key TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT '',
        target_id TEXT NOT NULL DEFAULT '',

        details JSONB NOT NULL DEFAULT '{}'::jsonb,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT marketplace_audit_action_not_blank
          CHECK (length(trim(action_key)) > 0)
      )
    `)

    await db.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_audit_created
      ON public.marketplace_audit_logs (created_at DESC)
    `)

    const result = await db.query<{
      table_name: string
    }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name
    `, [[
      'marketplace_users',
      'marketplace_roles',
      'marketplace_permissions',
      'marketplace_user_roles',
      'marketplace_role_permissions',
      'marketplace_sessions',
      'marketplace_audit_logs',
    ]])

    const expectedTables = 7

    if (result.rows.length !== expectedTables) {
      throw new Error(
        `Expected ${expectedTables} authentication tables, found ${result.rows.length}.`,
      )
    }

    await db.query('COMMIT')

    console.log('AUTHENTICATION TABLE SETUP COMPLETED')
    console.log(`Verified tables: ${result.rows.length}`)

    for (const row of result.rows) {
      console.log(`Verified: public.${row.table_name}`)
    }

    console.log('No administrator account was created.')
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await db.end()
  }
}

setupAuthTables().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown setup error'

  console.error('AUTHENTICATION TABLE SETUP FAILED:', message)
  process.exitCode = 1
})
