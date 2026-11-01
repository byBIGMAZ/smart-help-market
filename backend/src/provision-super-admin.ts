
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import argon2 from 'argon2'
import { getDatabasePool } from './database'

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

async function provisionSuperAdmin(): Promise<void> {
  const terminal = createInterface({ input: stdin, output: stdout })
  const db = getDatabasePool()

  let transactionStarted = false

  try {
    console.log('\nSMART HELP MARKET BY BIGMAZ')
    console.log('One-time Super Admin provisioning\n')

    const email = normalizeEmail(
      await terminal.question('Super Admin email: '),
    )
    const displayName = (
      await terminal.question('Super Admin display name: ')
    ).trim()

    const password = process.env.SUPER_ADMIN_PASSWORD

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Enter a valid email address.')
    }

    if (displayName.length < 2 || displayName.length > 100) {
      throw new Error('Display name must contain 2–100 characters.')
    }

    if (!password || password.length < 12 || password.length > 128) {
      throw new Error(
        'Password must be supplied securely and contain 12–128 characters.',
      )
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    })

    await db.query('BEGIN')
    transactionStarted = true

    // Serialize first-admin provisioning attempts.
    await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [
      '7319042186501',
    ])

    const roleResult = await db.query(
      `SELECT role_id
       FROM public.marketplace_roles
       WHERE role_key = 'super_admin'`,
    )

    if (roleResult.rows.length !== 1) {
      throw new Error(
        'The super_admin role is missing. Run the role seed step first.',
      )
    }

    const existingAdmin = await db.query(
      `SELECT 1
       FROM public.marketplace_user_roles ur
       JOIN public.marketplace_roles r ON r.role_id = ur.role_id
       WHERE r.role_key = 'super_admin'
       LIMIT 1`,
    )

    if (existingAdmin.rows.length > 0) {
      throw new Error(
        'A Super Admin already exists. First-admin provisioning is locked.',
      )
    }

    const existingEmail = await db.query(
      `SELECT 1
       FROM public.marketplace_users
       WHERE email_normalized = $1
       LIMIT 1`,
      [email],
    )

    if (existingEmail.rows.length > 0) {
      throw new Error(
        'This email already belongs to an account. No account was changed.',
      )
    }

    const userResult = await db.query(
      `INSERT INTO public.marketplace_users
         (email, email_normalized, password_hash, display_name,
          account_status, password_changed_at)
       VALUES ($1, $1, $2, $3, 'active', NOW())
       RETURNING user_id`,
      [email, passwordHash, displayName],
    )

    const userId = userResult.rows[0]?.user_id

    if (!userId) {
      throw new Error('Account creation did not return a user ID.')
    }

    await db.query(
      `INSERT INTO public.marketplace_user_roles (user_id, role_id)
       VALUES ($1, $2)`,
      [userId, roleResult.rows[0].role_id],
    )

    await db.query(
      `INSERT INTO public.marketplace_audit_logs
         (actor_user_id, action_key, target_type, target_id, details)
       VALUES (NULL, $1, $2, $3, $4::jsonb)`,
      [
        'super_admin.provisioned',
        'user',
        String(userId),
        JSON.stringify({ method: 'one_time_cli' }),
      ],
    )

    // Confirm the new account has the expected role before committing.
    const verification = await db.query(
      `SELECT u.user_id
       FROM public.marketplace_users u
       JOIN public.marketplace_user_roles ur ON ur.user_id = u.user_id
       JOIN public.marketplace_roles r ON r.role_id = ur.role_id
       WHERE u.user_id = $1
         AND r.role_key = 'super_admin'
         AND u.account_status = 'active'`,
      [userId],
    )

    if (verification.rows.length !== 1) {
      throw new Error('Super Admin account verification failed.')
    }

    await db.query('COMMIT')
    transactionStarted = false

    console.log('\nSUPER ADMIN ACCOUNT CREATED SUCCESSFULLY')
    console.log(`Account ID: ${userId}`)
    console.log(`Email: ${email}`)
    console.log('Role: super_admin')
    console.log('Password: securely hashed')
    console.log('Audit event: recorded')
    console.log('Email verification: not yet implemented')
    console.log('\nKeep your password private.')
  } catch (error: unknown) {
    if (transactionStarted) {
      await db.query('ROLLBACK').catch(() => undefined)
    }

    const message =
      error instanceof Error ? error.message : 'Unknown provisioning error'

    console.error('\nSUPER ADMIN PROVISIONING FAILED:', message)
    process.exitCode = 1
  } finally {
    terminal.close()
    await db.end()
  }
}

void createHash // Reserved for future session-token hashing; not used here.

provisionSuperAdmin().catch((error: unknown) => {
  console.error(
    'Unexpected provisioning error:',
    error instanceof Error ? error.message : 'Unknown error',
  )
  process.exitCode = 1
})
