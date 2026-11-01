
import { Router } from 'express'
import { getDatabasePool } from '../database'
import { requirePermission } from '../auth/requirePermission'

const router = Router()

const ALLOWED_STATUSES = [
  'running',
  'succeeded',
  'failed',
  'skipped',
] as const

type ExecutionStatus = typeof ALLOWED_STATUSES[number]

interface SummaryRow {
  total_events: string
  pending_events: string
  processing_events: string
  processed_events: string
  failed_events: string
}

interface ExecutionSummaryRow {
  succeeded: string
  failed: string
  skipped: string
  running: string
  total_executions: string
}

interface ExecutionRow {
  execution_id: string
  event_id: string
  rule_id: string | null
  rule_name: string | null
  rule_key: string | null
  event_type: string
  aggregate_type: string
  aggregate_id: string
  event_status: string
  event_attempts: number
  event_max_attempts: number
  event_last_error: string
  attempt_number: number
  execution_status: ExecutionStatus
  output: Record<string, unknown>
  error_message: string
  started_at: Date
  finished_at: Date | null
  created_at: Date
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value)

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

// GET /monitoring
// Read-only automation monitoring dashboard API.
router.get(
  '/monitoring',
  requirePermission('automation.view'),
  async (req, res) => {
    try {
      const page = parsePositiveInteger(
        req.query.page,
        1,
        1000000,
      )

      const pageSize = parsePositiveInteger(
        req.query.pageSize,
        25,
        100,
      )

      const offset = (page - 1) * pageSize

      if (!Number.isSafeInteger(offset)) {
        res.status(400).json({
          error: 'Invalid pagination parameters.',
        })
        return
      }

      const rawStatus = String(req.query.status ?? '').trim()
      const eventType = String(req.query.eventType ?? '').trim()

      let status: ExecutionStatus | null = null

      if (rawStatus) {
        if (
          !ALLOWED_STATUSES.includes(
            rawStatus as ExecutionStatus,
          )
        ) {
          res.status(400).json({
            error: 'Invalid execution status filter.',
          })
          return
        }

        status = rawStatus as ExecutionStatus
      }

      if (eventType.length > 100) {
        res.status(400).json({
          error: 'Event type filter cannot exceed 100 characters.',
        })
        return
      }

      const db = getDatabasePool()

      // 1. Overall event statistics.
      const eventSummary = await db.query<SummaryRow>(
        `
          SELECT
            COUNT(*)::text AS total_events,

            COUNT(*) FILTER (
              WHERE status = 'pending'
            )::text AS pending_events,

            COUNT(*) FILTER (
              WHERE status = 'processing'
            )::text AS processing_events,

            COUNT(*) FILTER (
              WHERE status = 'processed'
            )::text AS processed_events,

            COUNT(*) FILTER (
              WHERE status = 'failed'
            )::text AS failed_events

          FROM public.marketplace_automation_events
        `,
      )

      // 2. Overall execution statistics.
      const executionSummary =
        await db.query<ExecutionSummaryRow>(
          `
            SELECT
              COUNT(*) FILTER (
                WHERE status = 'succeeded'
              )::text AS succeeded,

              COUNT(*) FILTER (
                WHERE status = 'failed'
              )::text AS failed,

              COUNT(*) FILTER (
                WHERE status = 'skipped'
              )::text AS skipped,

              COUNT(*) FILTER (
                WHERE status = 'running'
              )::text AS running,

              COUNT(*)::text AS total_executions

            FROM public.marketplace_automation_executions
          `,
        )

      // 3. Count filtered execution history.
      const countResult = await db.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM public.marketplace_automation_executions x

          INNER JOIN public.marketplace_automation_events e
            ON e.event_id = x.event_id

          WHERE
            ($1::text IS NULL OR x.status = $1)
            AND
            ($2::text = '' OR e.event_type = $2)
        `,
        [status, eventType],
      )

      // 4. Retrieve one page of execution history.
      const executions = await db.query<ExecutionRow>(
        `
          SELECT
            x.execution_id::text AS execution_id,
            x.event_id::text AS event_id,

            x.rule_id::text AS rule_id,
            r.rule_name,
            r.rule_key,

            e.event_type,
            e.aggregate_type,
            e.aggregate_id,
            e.status AS event_status,
            e.attempts AS event_attempts,
            e.max_attempts AS event_max_attempts,
            e.last_error AS event_last_error,

            x.attempt_number,
            x.status AS execution_status,
            x.output,
            x.error_message,
            x.started_at,
            x.finished_at,
            x.created_at

          FROM public.marketplace_automation_executions x

          INNER JOIN public.marketplace_automation_events e
            ON e.event_id = x.event_id

          LEFT JOIN public.marketplace_automation_rules r
            ON r.rule_id = x.rule_id

          WHERE
            ($1::text IS NULL OR x.status = $1)
            AND
            ($2::text = '' OR e.event_type = $2)

          ORDER BY
            x.created_at DESC,
            x.execution_id DESC

          LIMIT $3
          OFFSET $4
        `,
        [status, eventType, pageSize, offset],
      )

      const total = Number(countResult.rows[0]?.total ?? 0)
      const totalPages = Math.ceil(total / pageSize)

      const eventStats = eventSummary.rows[0]
      const executionStats = executionSummary.rows[0]

      res.status(200).json({
        status: 'ok',

        summary: {
          totalEvents: Number(eventStats.total_events),
          pendingEvents: Number(eventStats.pending_events),
          processingEvents: Number(eventStats.processing_events),
          processedEvents: Number(eventStats.processed_events),
          failedEvents: Number(eventStats.failed_events),

          totalExecutions: Number(executionStats.total_executions),
          successfulExecutions: Number(executionStats.succeeded),
          failedExecutions: Number(executionStats.failed),
          skippedExecutions: Number(executionStats.skipped),
          runningExecutions: Number(executionStats.running),
        },

        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },

        filters: {
          status,
          eventType,
        },

        executions: executions.rows.map(row => ({
          executionId: row.execution_id,
          eventId: row.event_id,

          ruleId: row.rule_id,
          ruleName: row.rule_name,
          ruleKey: row.rule_key,

          eventType: row.event_type,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          eventStatus: row.event_status,
          eventAttempts: row.event_attempts,
          eventMaxAttempts: row.event_max_attempts,
          eventLastError: row.event_last_error,

          attemptNumber: row.attempt_number,
          executionStatus: row.execution_status,
          output: row.output,
          errorMessage: row.error_message,

          startedAt: row.started_at,
          finishedAt: row.finished_at,
          createdAt: row.created_at,
        })),

        generatedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error(
        'Automation monitoring retrieval failed:',
        error instanceof Error
          ? error.message
          : 'Unknown error',
      )

      res.status(500).json({
        error: 'Automation monitoring data could not be retrieved.',
      })
    }
  },
)

export default router
