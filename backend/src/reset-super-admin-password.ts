
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import argon2 from 'argon2'
import { getDatabasePool } from './database'

async function resetSuperAdminPassword(): Promise<void> {
  const terminal = createInterface({ input: stdin, output: stdout })
  const db = getDatabasePool()

  let transactionStarted = false

  try {
    const password = process.env.SUPER_ADMIN_NEW_PASSWORD

    if (!password || password.length < 8 || password.length > 128) {
  throw new Error(
    'Provide a new password containing 8–128 characters using the secure terminal method.',
  )
}

    if (password.trim() !== password) {
      throw new Error('The password must not begin or end with spaces.')
    }

    const confirmation = await terminal.question(
      'Type RESET to confirm the password change: ',
    )

    if (confirmation !== 'RESET') {
      console.log('Cancelled. No account was changed.')
      return
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    })

    await db.query('BEGIN')
    transactionStarted = true

    await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [
      '7319042186501',
    ])

    const accounts = await db.query(
      `SELECT u.user_id
       FROM public.marketplace_users u
       JOIN public.marketplace_user_roles ur
         ON ur.user_id = u.user_id
       JOIN public.marketplace_roles r
         ON r.role_id = ur.role_id
       WHERE r.role_key = 'super_admin'
         AND u.account_status = 'active'
       FOR UPDATE OF u`,
    )

    if (accounts.rows.length !== 1) {
      throw new Error(
        'Expected exactly one active Super Admin. No password was changed.',
      )
    }

    const userId = accounts.rows[0].user_id

    const updated = await db.query(
      `UPDATE public.marketplace_users
       SET password_hash = $1,
           password_changed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING user_id`,
      [passwordHash, userId],
    )

    if (updated.rows.length !== 1) {
      throw new Error('Password update verification failed.')
    }

    // Revoke any existing sessions for this account.
    await db.query(
      `DELETE FROM public.marketplace_sessions
       WHERE user_id = $1`,
      [userId],
    )

    await db.query(
      `INSERT INTO public.marketplace_audit_logs
         (actor_user_id, action_key, target_type, target_id, details)
       VALUES (NULL, $1, $2, $3, $4::jsonb)`,
      [
        'super_admin.password_reset',
        'user',
        String(userId),
        JSON.stringify({ method: 'one_time_cli' }),
      ],
    )

    await db.query('COMMIT')
    transactionStarted = false

    console.log('\nSUPER ADMIN PASSWORD RESET SUCCESSFUL')
    console.log(`Account ID: ${userId}`)
    console.log('Super Admin role: preserved')
    console.log('Password: securely hashed')
    console.log('Existing sessions: revoked')
    console.log('Audit event: recorded')
  } catch (error: unknown) {
    if (transactionStarted) {
      await db.query('ROLLBACK').catch(() => undefined)
    }

    console.error(
      '\nPASSWORD RESET FAILED:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    process.exitCode = 1
  } finally {
    terminal.close()
    await db.end()
  }
}

resetSuperAdminPassword().catch((error: unknown) => {
  console.error(
    'Unexpected password reset error:',
    error instanceof Error ? error.message : 'Unknown error',
  )
  process.exitCode = 1
})
