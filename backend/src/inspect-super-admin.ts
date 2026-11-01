
import { getDatabasePool } from './database'

async function inspectSuperAdmin(): Promise<void> {
  const db = getDatabasePool()

  try {
    const result = await db.query(
      `SELECT
         u.user_id,
         u.email,
         u.display_name,
         u.account_status,
         r.role_key,
         u.created_at
       FROM public.marketplace_users u
       JOIN public.marketplace_user_roles ur
         ON ur.user_id = u.user_id
       JOIN public.marketplace_roles r
         ON r.role_id = ur.role_id
       WHERE r.role_key = 'super_admin'
       ORDER BY u.user_id`,
    )

    console.log('\nSUPER ADMIN ACCOUNT INSPECTION')

    if (result.rows.length === 0) {
      console.log('No Super Admin account was found.')
      return
    }

    for (const account of result.rows) {
      console.log('------------------------------')
      console.log(`Account ID: ${account.user_id}`)
      console.log(`Email: ${account.email}`)
      console.log(`Display name: ${account.display_name}`)
      console.log(`Status: ${account.account_status}`)
      console.log(`Role: ${account.role_key}`)
      console.log(`Created: ${account.created_at}`)
    }

    console.log('\nInspection complete. No data was changed.')
  } finally {
    await db.end()
  }
}

inspectSuperAdmin().catch((error: unknown) => {
  console.error(
    'Inspection failed:',
    error instanceof Error ? error.message : 'Unknown error',
  )
  process.exitCode = 1
})
