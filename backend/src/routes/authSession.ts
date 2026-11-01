
import { Router, type Request, type Response, type NextFunction } from 'express'
import { getDatabasePool } from '../database'
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from '../auth/session'

const sessionRouter = Router()

function getCookieValue(
  req: Request,
  cookieName: string,
): string | undefined {
  const cookieHeader = req.headers.cookie

  if (!cookieHeader) {
    return undefined
  }

  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=')

    if (separator < 0) {
      continue
    }

    const name = item.slice(0, separator).trim()

    if (name !== cookieName) {
      continue
    }

    const value = item.slice(separator + 1).trim()

    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }

  return undefined
}

async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getCookieValue(req, SESSION_COOKIE_NAME)

  if (!token || token.length > 256) {
    res.status(401).json({
      error: 'Authentication required.',
    })
    return
  }

  try {
    const result = await getDatabasePool().query(
      `SELECT
         u.user_id,
         u.email,
         u.display_name,
         u.account_status,
         s.session_id
       FROM public.marketplace_sessions s
       JOIN public.marketplace_users u
         ON u.user_id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > NOW()
         AND u.account_status = 'active'
       LIMIT 1`,
      [hashSessionToken(token)],
    )

    const session = result.rows[0]

    if (!session) {
      res.status(401).json({
        error: 'Session expired or invalid.',
      })
      return
    }

    res.locals.authenticatedUser = {
      id: String(session.user_id),
      email: session.email,
      displayName: session.display_name,
      sessionId: String(session.session_id),
    }

    next()
  } catch (error: unknown) {
    console.error(
      'Session validation failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )

    res.status(500).json({
      error: 'Session validation failed.',
    })
  }
}

sessionRouter.get('/me', requireSession, async (_req, res) => {
  try {
    const user = res.locals.authenticatedUser as {
      id: string
      email: string
      displayName: string
      sessionId: string
    }

    const result = await getDatabasePool().query(
      `SELECT r.role_key
       FROM public.marketplace_user_roles ur
       JOIN public.marketplace_roles r
         ON r.role_id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY r.role_key`,
      [user.id],
    )

    const roles: string[] = result.rows.map(
      (row: { role_key: string }) => row.role_key,
    )

    res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles,
      },
    })
  } catch (error: unknown) {
    console.error(
      'Current-user lookup failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )

    res.status(500).json({
      error: 'Could not load the current user.',
    })
  }
})

sessionRouter.post('/logout', async (req, res) => {
  const token = getCookieValue(req, SESSION_COOKIE_NAME)

  try {
    if (token && token.length <= 256) {
      await getDatabasePool().query(
        `DELETE FROM public.marketplace_sessions
         WHERE token_hash = $1`,
        [hashSessionToken(token)],
      )
    }

    const secure =
      process.env.NODE_ENV === 'production' ? '; Secure' : ''

    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`,
    )

    res.status(200).json({
      message: 'Logged out successfully.',
    })
  } catch (error: unknown) {
    console.error(
      'Logout failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )

    res.status(500).json({
      error: 'Logout could not be completed.',
    })
  }
})

export default sessionRouter
