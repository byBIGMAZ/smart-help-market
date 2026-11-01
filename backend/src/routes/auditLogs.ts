
import { Router } from 'express'
import { getDatabasePool } from '../database'
import { requireSuperAdmin } from '../auth/requireSuperAdmin'

const auditLogsRouter = Router()

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_OFFSET = 1_000_000

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

/**
 * Protected audit activity directory.
 */
auditLogsRouter.get(
  '/audit-logs',
  requireSuperAdmin,
  async (req, res) => {
    try {
      const searchValue =
        typeof req.query.search === 'string'
          ? req.query.search.trim().slice(0, 100)
          : ''

      const actionValue =
        typeof req.query.action === 'string'
          ? req.query.action.trim()
          : ''

      const startDate =
        typeof req.query.startDate === 'string'
          ? req.query.startDate.trim()
          : ''

      const endDate =
        typeof req.query.endDate === 'string'
          ? req.query.endDate.trim()
          : ''

      const parsedLimit = Number(
        req.query.limit ?? DEFAULT_LIMIT,
      )

      const parsedOffset = Number(req.query.offset ?? 0)

      if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > MAX_LIMIT ||
        !Number.isInteger(parsedOffset) ||
        parsedOffset < 0 ||
        parsedOffset > MAX_OFFSET
      ) {
        res.status(400).json({
          error: 'Invalid pagination values.',
        })
        return
      }

      if (
        actionValue.length > 100 ||
        (actionValue !== '' &&
          !/^[a-z0-9_.-]+$/i.test(actionValue))
      ) {
        res.status(400).json({
          error: 'Invalid audit action filter.',
        })
        return
      }

      if (
        (startDate !== '' && !isValidDate(startDate)) ||
        (endDate !== '' && !isValidDate(endDate))
      ) {
        res.status(400).json({
          error: 'Dates must use the YYYY-MM-DD format.',
        })
        return
      }

      if (
        startDate !== '' &&
        endDate !== '' &&
        startDate > endDate
      ) {
        res.status(400).json({
          error: 'Start date cannot be later than end date.',
        })
        return
      }

      const db = getDatabasePool()

      const values: (string | number)[] = []
      const conditions: string[] = []

      if (searchValue) {
        values.push(`%${searchValue}%`)
        const position = values.length

        conditions.push(
          `(a.action_key ILIKE $${position}
            OR a.target_type ILIKE $${position}
            OR a.target_id ILIKE $${position}
            OR u.display_name ILIKE $${position}
            OR u.email ILIKE $${position})`,
        )
      }

      if (actionValue) {
        values.push(actionValue)
        conditions.push(`a.action_key = $${values.length}`)
      }

      if (startDate) {
        values.push(startDate)
        conditions.push(
          `a.created_at >= $${values.length}::date`,
        )
      }

      if (endDate) {
        values.push(endDate)
        conditions.push(
          `a.created_at < ($${values.length}::date + INTERVAL '1 day')`,
        )
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : ''

      const countResult = await db.query(
        `SELECT COUNT(*)::text AS total
         FROM public.marketplace_audit_logs a
         LEFT JOIN public.marketplace_users u
           ON u.user_id = a.actor_user_id
         ${whereClause}`,
        values,
      )

      const total = Number(countResult.rows[0]?.total ?? 0)

      const dataValues = [
        ...values,
        parsedLimit,
        parsedOffset,
      ]

      const logsResult = await db.query(
        `SELECT
           a.audit_id::text AS id,
           a.actor_user_id::text AS "actorUserId",
           COALESCE(
             u.display_name,
             CASE
               WHEN a.actor_user_id IS NULL
               THEN 'Deleted administrator'
               ELSE 'Unknown administrator'
             END
           ) AS "actorDisplayName",
           u.email AS "actorEmail",
           a.action_key AS "actionKey",
           a.target_type AS "targetType",
           a.target_id AS "targetId",
           a.details,
           a.created_at AS "createdAt"
         FROM public.marketplace_audit_logs a
         LEFT JOIN public.marketplace_users u
           ON u.user_id = a.actor_user_id
         ${whereClause}
         ORDER BY a.created_at DESC, a.audit_id DESC
         LIMIT $${values.length + 1}
         OFFSET $${values.length + 2}`,
        dataValues,
      )

      const actionsResult = await db.query(
        `SELECT DISTINCT action_key AS "actionKey"
         FROM public.marketplace_audit_logs
         ORDER BY action_key`,
      )

      res.status(200).json({
        status: 'ok',
        auditLogs: logsResult.rows,
        availableActions: actionsResult.rows.map(
          (row) => row.actionKey,
        ),
        pagination: {
          total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + logsResult.rows.length < total,
        },
        generatedAt: new Date().toISOString(),
      })
    } catch (error: unknown) {
      console.error(
        'Admin audit logs failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Audit logs could not be loaded.',
      })
    }
  },
)

export default auditLogsRouter
