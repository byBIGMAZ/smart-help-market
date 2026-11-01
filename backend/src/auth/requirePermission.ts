
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

export function requirePermission(permissionKey: string) {
  if (!/^[a-z0-9_.-]{1,100}$/.test(permissionKey)) {
    throw new Error('Invalid permission key.')
  }

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
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
            AND EXISTS (
              SELECT 1
              FROM public.marketplace_user_roles ur
              INNER JOIN public.marketplace_roles r
                ON r.role_id = ur.role_id
              LEFT JOIN public.marketplace_role_permissions rp
                ON rp.role_id = r.role_id
              LEFT JOIN public.marketplace_permissions p
                ON p.permission_id = rp.permission_id
              WHERE ur.user_id = u.user_id
                AND (
                  r.role_key = 'super_admin'
                  OR p.permission_key = $2
                )
            )
          LIMIT 1
        `,
        [hashSessionToken(token), permissionKey],
      )

      if (result.rows.length === 0) {
        res.status(403).json({
          error: 'You do not have permission to perform this action.',
          requiredPermission: permissionKey,
        })
        return
      }

      res.locals.authenticatedUserId = result.rows[0].user_id
      res.locals.permissionKey = permissionKey

      next()
    } catch (error: unknown) {
      console.error(
        'Permission authorization failed:',
        error instanceof Error
          ? error.message
          : 'Unknown error',
      )

      res.status(500).json({
        error: 'Permission verification could not be completed.',
      })
    }
  }
}
