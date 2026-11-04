import argon2 from 'argon2'
import { getDatabasePool } from './database'

const email = 'demo@smarthelpmarket.ng'
const displayName = 'SMART HELP MARKET Demo Account'

const requiredRoles = [
  'member',
  'buyer',
  'landlord',
  'seller',
  'service_provider',
  'agent',
] as const

async function createMarketplaceDemoAccount() {
  const password = process.env.DEMO_ACCOUNT_PASSWORD

  if (!password || password.length < 6 || password.length > 128) {
    throw new Error(
      'Set DEMO_ACCOUNT_PASSWORD to a unique password of 6-128 characters.',
    )
  }

  const db = getDatabasePool()

  try {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    })

    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const existing = await client.query(
        `SELECT user_id
         FROM public.marketplace_users
         WHERE email_normalized = $1
         LIMIT 1
         FOR UPDATE`,
        [email],
      )

      if (existing.rows.length > 0) {
        throw new Error(
          'The marketplace demo account already exists. No changes were made.',
        )
      }

      const roleResult = await client.query<{
        role_id: string
        role_key: string
      }>(
        `SELECT role_id::text AS role_id, role_key
         FROM public.marketplace_roles
         WHERE role_key = ANY($1::text[])`,
        [requiredRoles],
      )

      const roleMap = new Map(
        roleResult.rows.map((row) => [row.role_key, row.role_id]),
      )

      const missingRoles = requiredRoles.filter(
        (role) => !roleMap.has(role),
      )

      if (missingRoles.length > 0) {
        throw new Error(
          `Missing roles: ${missingRoles.join(', ')}. Run the authentication role seed first.`,
        )
      }

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
        throw new Error('The marketplace demo account could not be created.')
      }

      for (const role of requiredRoles) {
        const roleId = roleMap.get(role)

        if (!roleId) {
          throw new Error(`Role assignment failed: ${role}`)
        }

        await client.query(
          `INSERT INTO public.marketplace_user_roles (user_id, role_id)
           VALUES ($1, $2)`,
          [userId, roleId],
        )
      }

      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES (NULL, $1, $2, $3, $4::jsonb)`,
        [
          'demo_account.created',
          'marketplace_user',
          userId,
          JSON.stringify({
            purpose: 'Development dashboard preview',
            roles: requiredRoles,
            administrativeAccess: false,
          }),
        ],
      )

      await client.query('COMMIT')

      console.log('MARKETPLACE DEMO ACCOUNT CREATED SUCCESSFULLY')
      console.log(`Account ID: ${userId}`)
      console.log(`Display name: ${displayName}`)
      console.log(`Email: ${email}`)
      console.log(`Assigned roles: ${requiredRoles.join(', ')}`)
      console.log('Administrative roles: NONE')
      console.log('Password: NOT DISPLAYED')
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

createMarketplaceDemoAccount().catch((error: unknown) => {
  console.error(
    'MARKETPLACE DEMO ACCOUNT CREATION FAILED:',
    error instanceof Error ? error.message : 'Unknown error',
  )
  process.exitCode = 1
})
