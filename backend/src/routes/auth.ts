import { Router } from 'express'
import argon2 from 'argon2'
import { getDatabasePool } from '../database'
import {
  createSessionToken,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  getSessionCookieOptions,
} from '../auth/session'

const authRouter = Router()

const allowedAccountTypes = [
  'buyer',
  'landlord',
  'seller',
  'service_provider',
  'agent',
] as const

type AccountType = (typeof allowedAccountTypes)[number]

function isAccountType(value: unknown): value is AccountType {
  return (
    typeof value === 'string' &&
    allowedAccountTypes.includes(value as AccountType)
  )
}

function setSessionCookie(res: Parameters<
  NonNullable<Parameters<typeof authRouter.post>[1]>
>[1], token: string) {
  const cookie = getSessionCookieOptions()

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}${cookie.secure ? '; Secure' : ''}`,
  )
}

authRouter.post('/register', async (req, res) => {
  const displayName =
    typeof req.body?.displayName === 'string'
      ? req.body.displayName.trim().replace(/\s+/g, ' ')
      : ''

  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : ''

  const password =
    typeof req.body?.password === 'string'
      ? req.body.password
      : ''

  const accountType = req.body?.accountType

  if (
    displayName.length < 2 ||
    displayName.length > 100 ||
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 6 ||
    password.length > 128 ||
    !isAccountType(accountType)
  ) {
    res.status(400).json({
      error:
        'Provide a valid full name, email, account type and password of 6–128 characters.',
    })
    return
  }

  let verificationStatus: 'not_required' | 'pending' = 'not_required'
  if (accountType !== 'buyer') {
    try {
      const verificationSetting = await getDatabasePool().query<{ setting_value: unknown }>(
        'SELECT setting_value FROM public.platform_settings WHERE setting_key = $1 LIMIT 1',
        [`verification.required.${accountType}`],
      )
      // Missing settings default to requiring verification. Only an explicit
      // boolean false disables this business verification requirement.
      verificationStatus = verificationSetting.rows[0]?.setting_value === false
        ? 'not_required'
        : 'pending'
    } catch (error) {
      console.error(
        'Account verification policy lookup failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      res.status(503).json({
        error: 'Account registration is temporarily unavailable because verification policy could not be checked.',
      })
      return
    }
  }

  try {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    })

    const db = getDatabasePool()
    const client = await db.connect()

    let sessionToken: string | null = null
    let registeredUser: {
      id: string
      displayName: string
    } | null = null

    try {
      await client.query('BEGIN')

      const roleResult = await client.query(
        `SELECT role_id
         FROM public.marketplace_roles
         WHERE role_key = 'member'
         LIMIT 1`,
      )

      const roleId = roleResult.rows[0]?.role_id

      if (!roleId) {
        throw new Error(
          'The member role is unavailable. Contact marketplace support.',
        )
      }

      const existingAccount = await client.query(
        `SELECT user_id
         FROM public.marketplace_users
         WHERE email_normalized = $1
         LIMIT 1`,
        [email],
      )

      if (existingAccount.rows.length > 0) {
        await client.query('ROLLBACK')
        res.status(409).json({
          error: 'An account with this email already exists. Please sign in.',
        })
        return
      }

      const insertResult = await client.query(
        `INSERT INTO public.marketplace_users (
           email,
           email_normalized,
           password_hash,
           display_name,
           account_status,
           account_type,
           verification_status,
           password_changed_at,
           created_at,
           updated_at
         )
         VALUES (
           $1, $1, $2, $3, 'active', $4, $5, NOW(), NOW(), NOW()
         )
         RETURNING user_id::text AS id, display_name`,
        [
          email,
          passwordHash,
          displayName,
          accountType,
          verificationStatus,
        ],
      )

      const account = insertResult.rows[0]

      if (!account?.id) {
        throw new Error('The new account could not be created.')
      }

      await client.query(
        `INSERT INTO public.marketplace_user_roles (user_id, role_id)
         VALUES ($1, $2)`,
        [account.id, roleId],
      )

      await client.query(
        `INSERT INTO public.marketplace_audit_logs (
           actor_user_id,
           action_key,
           target_type,
           target_id,
           details
         )
         VALUES (NULL, $1, $2, $3, $4::jsonb)`,
        [
          'account.registered',
          'marketplace_user',
          account.id,
          JSON.stringify({
            accountType,
            verificationStatus,
            assignedRole: 'member',
          }),
        ],
      )

      const token = createSessionToken()
      const tokenHash = hashSessionToken(token)

      await client.query(
        `INSERT INTO public.marketplace_sessions (
           user_id,
           token_hash,
           expires_at,
           last_seen_at
         )
         VALUES ($1, $2, NOW() + INTERVAL '8 hours', NOW())`,
        [account.id, tokenHash],
      )

      await client.query('COMMIT')

      sessionToken = token
      registeredUser = {
        id: String(account.id),
        displayName: account.display_name,
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)

      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        res.status(409).json({
          error: 'An account with this email already exists. Please sign in.',
        })
        return
      }

      throw error
    } finally {
      client.release()
    }

    if (!sessionToken || !registeredUser) {
      throw new Error('Registration could not be completed.')
    }

    setSessionCookie(res, sessionToken)

    res.status(201).json({
      message: 'Registration successful.',
      authenticated: true,
      user: {
        ...registeredUser,
        email,
        roles: ['member'],
        permissions: [],
        accountType,
        verificationStatus,
      },
    })
  } catch (error: unknown) {
    console.error(
      'Registration request failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )

    res.status(500).json({
      error: 'Registration could not be completed. Please try again.',
    })
  }
})

authRouter.post('/login', async (req, res) => {
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : ''

  const password =
    typeof req.body?.password === 'string'
      ? req.body.password
      : ''

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length > 128
  ) {
    res.status(400).json({ error: 'Enter a valid email and password.' })
    return
  }

  try {
    const db = getDatabasePool()

    const accountResult = await db.query(
      `SELECT
         u.user_id,
         u.password_hash,
         u.display_name,
         u.account_status
       FROM public.marketplace_users u
       WHERE u.email_normalized = $1
       LIMIT 1`,
      [email],
    )

    const account = accountResult.rows[0]

    if (
      !account ||
      account.account_status !== 'active' ||
      typeof account.password_hash !== 'string'
    ) {
      res.status(401).json({ error: 'Invalid email or password.' })
      return
    }

    let passwordMatches = false

    try {
      passwordMatches = await argon2.verify(
        account.password_hash,
        password,
      )
    } catch {
      passwordMatches = false
    }

    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid email or password.' })
      return
    }

    const rolesResult = await db.query(
      `SELECT r.role_key
       FROM public.marketplace_user_roles ur
       JOIN public.marketplace_roles r
         ON r.role_id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY r.role_key`,
      [account.user_id],
    )

    const roles: string[] = rolesResult.rows.map(
      (row: { role_key: string }) => row.role_key,
    )

    if (roles.length === 0) {
      res.status(403).json({ error: 'This account has no assigned role.' })
      return
    }

    // Return the same effective permissions used by the current-session endpoint.
    // Super Admin receives the complete permission catalogue; other roles receive
    // only permissions assigned to their roles.
    const permissionsResult = await db.query<{
      permission_key: string
    }>(
      `SELECT DISTINCT p.permission_key
       FROM public.marketplace_permissions p
       WHERE EXISTS (
         SELECT 1
         FROM public.marketplace_user_roles ur
         JOIN public.marketplace_roles r
           ON r.role_id = ur.role_id
         LEFT JOIN public.marketplace_role_permissions rp
           ON rp.role_id = r.role_id
         WHERE ur.user_id = $1
           AND (
             r.role_key = 'super_admin'
             OR rp.permission_id = p.permission_id
           )
       )
       ORDER BY p.permission_key`,
      [account.user_id],
    )

    const permissions: string[] = permissionsResult.rows.map(
      (row) => row.permission_key,
    )

    const token = createSessionToken()
    const tokenHash = hashSessionToken(token)

    await db.query(
      `INSERT INTO public.marketplace_sessions
         (user_id, token_hash, expires_at, last_seen_at)
       VALUES ($1, $2, NOW() + INTERVAL '8 hours', NOW())`,
      [account.user_id, tokenHash],
    )

    await db.query(
      `UPDATE public.marketplace_users
       SET last_login_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1`,
      [account.user_id],
    )

    setSessionCookie(res, token)

    res.status(200).json({
      message: 'Login successful.',
      user: {
        id: String(account.user_id),
        displayName: account.display_name,
        roles,
        permissions,
      },
    })
  } catch (error: unknown) {
    console.error(
      'Login request failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )

    res.status(500).json({ error: 'Login could not be completed.' })
  }
})

export default authRouter
