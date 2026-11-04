import { getDatabasePool } from './database'

async function inspectRegistration() {
  const email = process.env.INSPECT_EMAIL?.trim().toLowerCase()

  if (!email) {
    throw new Error('Set INSPECT_EMAIL before running this script.')
  }

  const db = getDatabasePool()

  try {
    const result = await db.query(
      `SELECT
         u.user_id::text AS user_id,
         u.display_name,
         u.email_normalized,
         u.account_type,
         u.verification_status,
         u.account_status,
         u.email_verified_at,
         ARRAY_AGG(r.role_key ORDER BY r.role_key) AS assigned_roles,
         EXISTS (
           SELECT 1
           FROM public.marketplace_sessions s
           WHERE s.user_id = u.user_id
             AND s.expires_at > NOW()
         ) AS has_active_session
       FROM public.marketplace_users u
       LEFT JOIN public.marketplace_user_roles ur
         ON ur.user_id = u.user_id
       LEFT JOIN public.marketplace_roles r
         ON r.role_id = ur.role_id
       WHERE u.email_normalized = $1
       GROUP BY u.user_id
       LIMIT 1`,
      [email],
    )

    if (result.rows.length === 0) {
      console.log('No account found for that email.')
    } else {
      console.log('REGISTRATION ACCOUNT VERIFICATION')
      console.table(result.rows)
    }
  } finally {
    await db.end()
  }
}

inspectRegistration().catch((error: unknown) => {
  console.error(
    'INSPECTION FAILED:',
    error instanceof Error ? error.message : 'Unknown error',
  )
  process.exitCode = 1
})
