
import { Router, type Request, type Response } from 'express'
import { getDatabasePool } from '../database'
import { requireAuthenticatedSession } from '../auth/requireAuthenticatedSession'

const notificationsRouter = Router()

notificationsRouter.use(requireAuthenticatedSession)

function getAuthenticatedUserId(res: Response): string {
  return res.locals.authenticatedUserId as string
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return fallback
  }

  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

/**
 * GET /api/notifications
 * Returns only notifications belonging to the authenticated user.
 */
notificationsRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthenticatedUserId(res)
      const page = parsePositiveInteger(req.query.page, 1, 1000000)
      const pageSize = parsePositiveInteger(req.query.pageSize, 25, 100)
      const offset = (page - 1) * pageSize

      if (!Number.isSafeInteger(offset)) {
        res.status(400).json({
          error: 'Invalid pagination values.',
        })
        return
      }

      const pool = getDatabasePool()

      const [notificationsResult, countResult, unreadResult] =
        await Promise.all([
          pool.query(
            `
              SELECT
                notification_id::text AS notification_id,
                notification_type,
                title,
                message,
                metadata,
                read_at,
                created_at
              FROM public.marketplace_notifications
              WHERE audience = 'user'
                AND recipient_user_id = $1
              ORDER BY created_at DESC, notification_id DESC
              LIMIT $2 OFFSET $3
            `,
            [userId, pageSize, offset],
          ),

          pool.query<{ total: string }>(
            `
              SELECT COUNT(*)::text AS total
              FROM public.marketplace_notifications
              WHERE audience = 'user'
                AND recipient_user_id = $1
            `,
            [userId],
          ),

          pool.query<{ unread: string }>(
            `
              SELECT COUNT(*)::text AS unread
              FROM public.marketplace_notifications
              WHERE audience = 'user'
                AND recipient_user_id = $1
                AND read_at IS NULL
            `,
            [userId],
          ),
        ])

      const total = Number(countResult.rows[0]?.total ?? 0)

      res.json({
        status: 'ok',
        notifications: notificationsResult.rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        unreadCount: Number(unreadResult.rows[0]?.unread ?? 0),
      })
    } catch (error: unknown) {
      console.error(
        'Could not load personal notifications:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Notifications could not be loaded.',
      })
    }
  },
)

/**
 * GET /api/notifications/unread-count
 */
notificationsRouter.get(
  '/unread-count',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthenticatedUserId(res)

      const result = await getDatabasePool().query<{ unread: string }>(
        `
          SELECT COUNT(*)::text AS unread
          FROM public.marketplace_notifications
          WHERE audience = 'user'
            AND recipient_user_id = $1
            AND read_at IS NULL
        `,
        [userId],
      )

      res.json({
        status: 'ok',
        unreadCount: Number(result.rows[0]?.unread ?? 0),
      })
    } catch (error: unknown) {
      console.error(
        'Could not count unread notifications:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Unread notifications could not be counted.',
      })
    }
  },
)

/**
 * PATCH /api/notifications/:notificationId/read
 */
notificationsRouter.patch(
  '/:notificationId/read',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthenticatedUserId(res)
      const notificationId = req.params.notificationId

      if (
        typeof notificationId !== 'string' ||
        !/^[1-9]\d*$/.test(notificationId)
      ) {
        res.status(400).json({
          error: 'Invalid notification ID.',
        })
        return
      }

      const result = await getDatabasePool().query(
        `
          UPDATE public.marketplace_notifications
          SET read_at = COALESCE(read_at, NOW())
          WHERE notification_id = $1
            AND audience = 'user'
            AND recipient_user_id = $2
          RETURNING
            notification_id::text AS notification_id,
            read_at
        `,
        [notificationId, userId],
      )

      if (result.rows.length === 0) {
        res.status(404).json({
          error: 'Notification not found.',
        })
        return
      }

      res.json({
        status: 'ok',
        notification: result.rows[0],
      })
    } catch (error: unknown) {
      console.error(
        'Could not mark notification as read:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Notification could not be marked as read.',
      })
    }
  },
)

/**
 * PATCH /api/notifications/read-all
 */
notificationsRouter.patch(
  '/read-all',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthenticatedUserId(res)

      const result = await getDatabasePool().query(
        `
          UPDATE public.marketplace_notifications
          SET read_at = NOW()
          WHERE audience = 'user'
            AND recipient_user_id = $1
            AND read_at IS NULL
          RETURNING notification_id
        `,
        [userId],
      )

      res.json({
        status: 'ok',
        markedAsRead: result.rowCount ?? 0,
      })
    } catch (error: unknown) {
      console.error(
        'Could not mark all notifications as read:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Notifications could not be marked as read.',
      })
    }
  },
)

export default notificationsRouter
