
import { Router } from 'express'
import { getDatabasePool } from '../database'
import { requirePermission } from '../auth/requirePermission'

const adminNotificationsRouter = Router()

const PAGE_SIZE_DEFAULT = 20
const PAGE_SIZE_MAX = 100

const ALLOWED_NOTIFICATION_TYPES = [
  'general',
  'announcement',
  'system',
  'security',
  'moderation',
] as const

type NotificationType =
  (typeof ALLOWED_NOTIFICATION_TYPES)[number]

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

/**
 * GET /api/admin/notifications
 *
 * Returns administrator-wide notifications.
 * Read status is calculated separately for each administrator.
 */
adminNotificationsRouter.get(
  '/',
  requirePermission('notifications.view'),
  async (req, res) => {
    const page = parsePositiveInteger(req.query.page, 1, 1000000)
    const pageSize = parsePositiveInteger(
      req.query.pageSize,
      PAGE_SIZE_DEFAULT,
      PAGE_SIZE_MAX,
    )

    const offset = (page - 1) * pageSize
    const userId = res.locals.authenticatedUserId as string

    try {
      const db = getDatabasePool()

      const [notificationsResult, countResult, unreadResult] =
        await Promise.all([
          db.query(
            `SELECT
               n.notification_id::text AS id,
               n.notification_type AS type,
               n.title,
               n.message,
               n.metadata,
               n.created_at,
               r.read_at
             FROM public.marketplace_notifications n
             LEFT JOIN public.marketplace_notification_reads r
               ON r.notification_id = n.notification_id
              AND r.user_id = $1
             WHERE n.audience = 'administrators'
             ORDER BY
               n.created_at DESC,
               n.notification_id DESC
             LIMIT $2 OFFSET $3`,
            [userId, pageSize, offset],
          ),

          db.query(
            `SELECT COUNT(*)::text AS total
             FROM public.marketplace_notifications
             WHERE audience = 'administrators'`,
          ),

          db.query(
            `SELECT COUNT(*)::text AS unread
             FROM public.marketplace_notifications n
             WHERE n.audience = 'administrators'
               AND NOT EXISTS (
                 SELECT 1
                 FROM public.marketplace_notification_reads r
                 WHERE r.notification_id = n.notification_id
                   AND r.user_id = $1
               )`,
            [userId],
          ),
        ])

      res.status(200).json({
        notifications: notificationsResult.rows,
        pagination: {
          page,
          pageSize,
          total: Number(countResult.rows[0]?.total ?? 0),
          totalPages: Math.ceil(
            Number(countResult.rows[0]?.total ?? 0) / pageSize,
          ),
        },
        unreadCount: Number(unreadResult.rows[0]?.unread ?? 0),
      })
    } catch (error: unknown) {
      console.error(
        'Administrator notifications lookup failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Administrator notifications could not be loaded.',
      })
    }
  },
)

/**
 * GET /api/admin/notifications/unread-count
 */
adminNotificationsRouter.get(
  '/unread-count',
  requirePermission('notifications.view'),
  async (_req, res) => {
    const userId = res.locals.authenticatedUserId as string

    try {
      const result = await getDatabasePool().query(
        `SELECT COUNT(*)::text AS unread
         FROM public.marketplace_notifications n
         WHERE n.audience = 'administrators'
           AND NOT EXISTS (
             SELECT 1
             FROM public.marketplace_notification_reads r
             WHERE r.notification_id = n.notification_id
               AND r.user_id = $1
           )`,
        [userId],
      )

      res.status(200).json({
        unreadCount: Number(result.rows[0]?.unread ?? 0),
      })
    } catch (error: unknown) {
      console.error(
        'Administrator unread-count lookup failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Unread notifications could not be counted.',
      })
    }
  },
)

/**
 * PATCH /api/admin/notifications/:notificationId/read
 *
 * Marks one notification as read for the current administrator only.
 */
adminNotificationsRouter.patch(
  '/:notificationId/read',
  requirePermission('notifications.view'),
  async (req, res) => {
    const notificationId = req.params.notificationId
    const userId = res.locals.authenticatedUserId as string

    if (
      typeof notificationId !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(notificationId)
    ) {
      res.status(400).json({
        error: 'Invalid notification ID.',
      })
      return
    }

    try {
      const result = await getDatabasePool().query(
        `INSERT INTO public.marketplace_notification_reads (
           notification_id,
           user_id
         )
         SELECT n.notification_id, $2
         FROM public.marketplace_notifications n
         WHERE n.notification_id = $1
           AND n.audience = 'administrators'
         ON CONFLICT (notification_id, user_id)
         DO NOTHING
         RETURNING notification_id`,
        [notificationId, userId],
      )

      if (result.rowCount === 0) {
        const exists = await getDatabasePool().query(
          `SELECT 1
           FROM public.marketplace_notifications
           WHERE notification_id = $1
             AND audience = 'administrators'
           LIMIT 1`,
          [notificationId],
        )

        if (exists.rowCount === 0) {
          res.status(404).json({
            error: 'Administrator notification not found.',
          })
          return
        }
      }

      res.status(200).json({
        message: 'Notification marked as read.',
      })
    } catch (error: unknown) {
      console.error(
        'Administrator notification read update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Notification could not be marked as read.',
      })
    }
  },
)

/**
 * PATCH /api/admin/notifications/read-all
 */
adminNotificationsRouter.patch(
  '/read-all',
  requirePermission('notifications.view'),
  async (_req, res) => {
    const userId = res.locals.authenticatedUserId as string

    try {
      const result = await getDatabasePool().query(
        `INSERT INTO public.marketplace_notification_reads (
           notification_id,
           user_id
         )
         SELECT n.notification_id, $1
         FROM public.marketplace_notifications n
         WHERE n.audience = 'administrators'
         ON CONFLICT (notification_id, user_id)
         DO NOTHING`,
        [userId],
      )

      res.status(200).json({
        message: 'All administrator notifications marked as read.',
        updated: result.rowCount ?? 0,
      })
    } catch (error: unknown) {
      console.error(
        'Administrator mark-all-read failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Notifications could not be marked as read.',
      })
    }
  },
)

/**
 * POST /api/admin/notifications
 *
 * Creates an administrator-wide announcement.
 */
adminNotificationsRouter.post(
  '/',
  requirePermission('notifications.manage'),
  async (req, res) => {
    const title =
      typeof req.body?.title === 'string'
        ? req.body.title.trim()
        : ''

    const message =
      typeof req.body?.message === 'string'
        ? req.body.message.trim()
        : ''

    const requestedType =
      typeof req.body?.type === 'string'
        ? req.body.type.trim()
        : 'announcement'

    if (!title || title.length > 150) {
      res.status(400).json({
        error: 'Title is required and must not exceed 150 characters.',
      })
      return
    }

    if (!message || message.length > 10000) {
      res.status(400).json({
        error: 'Message is required and must not exceed 10,000 characters.',
      })
      return
    }

    if (
      !ALLOWED_NOTIFICATION_TYPES.includes(
        requestedType as NotificationType,
      )
    ) {
      res.status(400).json({
        error: 'Invalid notification type.',
      })
      return
    }

    const metadata =
      req.body?.metadata === undefined
        ? {}
        : req.body.metadata

    if (
      typeof metadata !== 'object' ||
      metadata === null ||
      Array.isArray(metadata)
    ) {
      res.status(400).json({
        error: 'Metadata must be a JSON object.',
      })
      return
    }

    try {
      const result = await getDatabasePool().query(
        `INSERT INTO public.marketplace_notifications (
           audience,
           notification_type,
           title,
           message,
           metadata
         )
         VALUES (
           'administrators',
           $1,
           $2,
           $3,
           $4::jsonb
         )
         RETURNING
           notification_id::text AS id,
           notification_type AS type,
           title,
           message,
           metadata,
           created_at`,
        [
          requestedType,
          title,
          message,
          JSON.stringify(metadata),
        ],
      )

      res.status(201).json({
        message: 'Administrator announcement created successfully.',
        notification: result.rows[0],
      })
    } catch (error: unknown) {
      console.error(
        'Administrator announcement creation failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'The administrator announcement could not be created.',
      })
    }
  },
)

export default adminNotificationsRouter
