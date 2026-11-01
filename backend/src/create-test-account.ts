
import argon2 from 'argon2'
import { getDatabasePool } from './database'

async function createTestAccount() {
  const email = 'bigmaz.status-test@example.com'
  const displayName = 'BIGMAZ Status Test Account'
  const password = process.env.TEST_ACCOUNT_PASSWORD

  if (!password || password.length < 12 || password.length > 128) {
    throw new Error(
      'Set TEST_ACCOUNT_PASSWORD to a unique password of 12–128 characters before running this script.',
    )
  }

  const db = getDatabasePool()

  try {
    const existing = await db.query(
      `SELECT user_id
       FROM public.marketplace_users
       WHERE email_normalized = $1
       LIMIT 1`,
      [email],
    )

    if (existing.rows.length > 0) {
      throw new Error(
        'The dedicated test account already exists. No changes were made.',
      )
    }

    const roleResult = await db.query(
      `SELECT role_id
       FROM public.marketplace_roles
       WHERE role_key = 'member'
       LIMIT 1`,
    )

    const roleId = roleResult.rows[0]?.role_id

    if (!roleId) {
      throw new Error(
        'The member role was not found. Run the existing role-seeding script first.',
      )
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    })

    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const insertResult = await client.query(
        `INSERT INTO public.marketplace_users
           (email, email_normalized, password_hash, display_name,
            account_status, password_changed_at, created_at, updated_at)
         VALUES ($1, $1, $2, $3, 'active', NOW(), NOW(), NOW())
         RETURNING user_id::text AS id`,
        [email, passwordHash, displayName],
      )

      const userId = insertResult.rows[0]?.id

      if (!userId) {
        throw new Error('The test account could not be created.')
      }

      await client.query(
        `INSERT INTO public.marketplace_user_roles (user_id, role_id)
         VALUES ($1, $2)`,
        [userId, roleId],
      )

      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES (NULL, $1, $2, $3, $4::jsonb)`,
        [
          'test_account.created',
          'marketplace_user',
          userId,
          JSON.stringify({
            purpose: 'Account-status feature testing',
            role: 'member',
          }),
        ],
      )

      await client.query('COMMIT')

      console.log('TEST ACCOUNT CREATED SUCCESSFULLY')
      console.log(`Account ID: ${userId}`)
      console.log(`Display name: ${displayName}`)
      console.log(`Email: ${email}`)
      console.log('Role: member')
      console.log('Status: active')
      console.log('Password: not displayed')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } finally {
    await db.end()
  }
}

createTestAccount().catch((error: unknown) => {
  console.error(
    'TEST ACCOUNT CREATION FAILED:',
    error instanceof Error ? error.message : 'Unknown error',
  )
  process.exitCode = 1
})
