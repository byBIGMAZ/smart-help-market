
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

    if (separator < 0) {
      continue
    }

    const name = part.slice(0, separator).trim()

    if (name !== SESSION_COOKIE_NAME) {
      continue
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }

  return undefined
}

export async function requireSuperAdmin(
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
    const result = await getDatabasePool().query(
      `SELECT u.user_id
       FROM public.marketplace_sessions s
       JOIN public.marketplace_users u
         ON u.user_id = s.user_id
       JOIN public.marketplace_user_roles ur
         ON ur.user_id = u.user_id
       JOIN public.marketplace_roles r
         ON r.role_id = ur.role_id
       WHERE s.token_hash = $1
         AND s.expires_at > NOW()
         AND u.account_status = 'active'
         AND r.role_key = 'super_admin'
       LIMIT 1`,
      [hashSessionToken(token)],
    )

    if (result.rows.length === 0) {
      res.status(403).json({
        error: 'Super Admin permission required.',
      })
      return
    }

    res.locals.superAdminUserId = String(result.rows[0].user_id)

    next()
  } catch (error: unknown) {
    console.error(
      'Super Admin authorization failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )

    res.status(500).json({
      error: 'Authorization could not be completed.',
    })
  }
}
