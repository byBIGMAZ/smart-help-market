
import type { Request, Response, NextFunction } from 'express'
import { getDatabasePool } from '../database'
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from './session'

function getSessionToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie

  if (!cookieHeader) {
    return undefined
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')

    if (separator < 0) continue

    const name = part.slice(0, separator).trim()

    if (name !== SESSION_COOKIE_NAME) continue

    try {
      return decodeURIComponent(
        part.slice(separator + 1).trim(),
      )
    } catch {
      return undefined
    }
  }

  return undefined
}

export async function requireAuthenticatedSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getSessionToken(req)

  if (!token || token.length > 256) {
    res.status(401).json({
      error: 'Authentication required.',
    })
    return
  }

  try {
    const result = await getDatabasePool().query<{
      user_id: string
    }>(
      `
        SELECT u.user_id::text AS user_id
        FROM public.marketplace_sessions s
        INNER JOIN public.marketplace_users u
          ON u.user_id = s.user_id
        WHERE s.token_hash = $1
          AND s.expires_at > NOW()
          AND u.account_status = 'active'
        LIMIT 1
      `,
      [hashSessionToken(token)],
    )

    if (result.rows.length === 0) {
      res.status(401).json({
        error: 'Your session is invalid or has expired.',
      })
      return
    }

    res.locals.authenticatedUserId = result.rows[0].user_id

    next()
  } catch (error: unknown) {
    console.error(
      'Session authentication failed:',
      error instanceof Error
        ? error.message
        : 'Unknown error',
    )

    res.status(500).json({
      error: 'Authentication could not be completed.',
    })
  }
}
