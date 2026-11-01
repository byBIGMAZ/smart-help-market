
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

    const cookie = getSessionCookieOptions()

    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}${cookie.secure ? '; Secure' : ''}`,
    )

    res.status(200).json({
      message: 'Login successful.',
      user: {
        id: String(account.user_id),
        displayName: account.display_name,
        roles,
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
