import { getDatabasePool } from './database'

const email = 'demo@smarthelpmarket.ng'

const requiredRoles = [
  'member',
  'buyer',
  'landlord',
  'seller',
  'service_provider',
  'agent',
] as const

async function repairMarketplaceDemoAccountRoles() {
  const db = getDatabasePool()

  try {
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const accountResult = await client.query<{
        user_id: string
        account_status: string
      }>(
        `SELECT user_id::text AS user_id, account_status
         FROM public.marketplace_users
         WHERE email_normalized = $1
         LIMIT 1
         FOR UPDATE`,
        [email],
      )

      const account = accountResult.rows[0]
      if (!account) {
        throw new Error(
          'The SMART HELP MARKET demo account was not found. No account was created or changed.',
        )
      }
      if (account.account_status !== 'active') {
        throw new Error(
          'The SMART HELP MARKET demo account is not active. Its status was not changed.',
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
      const missingRoles = requiredRoles.filter((role) => !roleMap.has(role))
      if (missingRoles.length > 0) {
        throw new Error(
          `Required marketplace roles are missing: ${missingRoles.join(', ')}. Run npm run seed:auth-roles first.`,
        )
      }

      for (const role of requiredRoles) {
        const roleId = roleMap.get(role)
        if (!roleId) throw new Error(`Role lookup failed: ${role}`)

        await client.query(
          `INSERT INTO public.marketplace_user_roles (user_id, role_id)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1
             FROM public.marketplace_user_roles
             WHERE user_id = $1 AND role_id = $2
           )`,
          [account.user_id, roleId],
        )
      }

      const verification = await client.query<{ role_key: string }>(
        `SELECT r.role_key
         FROM public.marketplace_user_roles AS ur
         INNER JOIN public.marketplace_roles AS r
           ON r.role_id = ur.role_id
         WHERE ur.user_id = $1
           AND r.role_key = ANY($2::text[])
         ORDER BY r.role_key`,
        [account.user_id, requiredRoles],
      )

      const assigned = new Set(verification.rows.map((row) => row.role_key))
      const stillMissing = requiredRoles.filter((role) => !assigned.has(role))
      if (stillMissing.length > 0) {
        throw new Error(
          `Demo role verification failed: ${stillMissing.join(', ')}`,
        )
      }

      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES (NULL, 'demo_account.roles_repaired', 'marketplace_user', $1, $2::jsonb)`,
        [
          account.user_id,
          JSON.stringify({
            email,
            assignedRoles: requiredRoles,
            administrativeAccessGranted: false,
          }),
        ],
      )

      await client.query('COMMIT')

      console.log('MARKETPLACE DEMO ACCOUNT ROLES REPAIRED')
      console.log(`Account: ${email}`)
      console.log(`Verified workspace roles: ${verification.rows.length}`)
      console.log('Roles: ' + requiredRoles.join(', '))
      console.log('Administrative access: NOT GRANTED')
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

repairMarketplaceDemoAccountRoles().catch((error: unknown) => {
  console.error(
    'DEMO ACCOUNT ROLE REPAIR FAILED:',
    error instanceof Error ? error.message : 'Unknown error',
  )
  process.exitCode = 1
})
