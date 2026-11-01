import { Router } from 'express'
import { getDatabasePool } from '../database'
import { requirePermission } from '../auth/requirePermission'

const router = Router()

const VALID_ACTIONS = [
  'enable',
  'pause',
  'resume',
  'emergency-stop',
] as const

type AutomationAction = typeof VALID_ACTIONS[number]

interface AutomationControlRow {
  control_id: number
  is_enabled: boolean
  is_paused: boolean
  pause_reason: string
  updated_by: string | null
  created_at: Date
  updated_at: Date
}

function formatControl(row: AutomationControlRow) {
  return {
    enabled: row.is_enabled,
    paused: row.is_paused,
    active: row.is_enabled && !row.is_paused,
    pauseReason: row.pause_reason,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isValidAction(value: unknown): value is AutomationAction {
  return (
    typeof value === 'string' &&
    VALID_ACTIONS.includes(value as AutomationAction)
  )
}

function getActionState(
  action: AutomationAction,
  reason: string,
) {
  switch (action) {
    case 'enable':
    case 'resume':
      return {
        isEnabled: true,
        isPaused: false,
        pauseReason: '',
      }

    case 'pause':
      return {
        isEnabled: true,
        isPaused: true,
        pauseReason: reason || 'Paused by administrator.',
      }

    case 'emergency-stop':
      return {
        isEnabled: false,
        isPaused: true,
        pauseReason: reason || 'Emergency stop activated.',
      }
  }
}

// View global automation status.
router.get(
  '/',
  requirePermission('automation.view'),
  async (_req, res) => {
    try {
      const result = await getDatabasePool().query<AutomationControlRow>(
        `
          SELECT
            control_id,
            is_enabled,
            is_paused,
            pause_reason,
            updated_by::text AS updated_by,
            created_at,
            updated_at
          FROM public.marketplace_automation_control
          WHERE control_id = 1
        `,
      )

      if (result.rowCount === 0) {
        res.status(503).json({
          error: 'Automation control has not been initialized.',
        })
        return
      }

      const control = result.rows[0]

      res.status(200).json({
        status: 'ok',
        automation: {
          ...formatControl(control),
          workerConfigurationEnabled:
            process.env.AUTOMATION_WORKER_ENABLED === 'true',
        },
        generatedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error(
        'Automation status retrieval failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Automation status could not be loaded.',
      })
    }
  },
)

// Change global automation control.
router.post(
  '/control/:action',
  requirePermission('automation.manage'),
  async (req, res) => {
    const actionValue = req.params.action

    if (!isValidAction(actionValue)) {
      res.status(400).json({
        error: 'Invalid automation control action.',
        allowedActions: VALID_ACTIONS,
      })
      return
    }

    const action = actionValue

    const reasonValue = req.body?.reason

    if (
      reasonValue !== undefined &&
      (
        typeof reasonValue !== 'string' ||
        reasonValue.length > 500
      )
    ) {
      res.status(400).json({
        error: 'Reason must be text and cannot exceed 500 characters.',
      })
      return
    }

    const reason = (
      typeof reasonValue === 'string'
        ? reasonValue.trim()
        : ''
    )

    const actorUserId = String(
      res.locals.authenticatedUserId ?? '',
    )

    if (!/^\d+$/.test(actorUserId)) {
      res.status(401).json({
        error: 'Administrator identity could not be verified.',
      })
      return
    }

    const nextState = getActionState(action, reason)

    const db = getDatabasePool()
    let client

    try {
      client = await db.connect()

      await client.query('BEGIN')

      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '15s'")

      // Lock the global control record to prevent
      // simultaneous administrators overwriting changes.
      const existing = await client.query<AutomationControlRow>(
        `
          SELECT
            control_id,
            is_enabled,
            is_paused,
            pause_reason,
            updated_by::text AS updated_by,
            created_at,
            updated_at
          FROM public.marketplace_automation_control
          WHERE control_id = 1
          FOR UPDATE
        `,
      )

      if (existing.rowCount === 0) {
        await client.query('ROLLBACK')

        res.status(503).json({
          error: 'Automation control has not been initialized.',
        })
        return
      }

      const previous = existing.rows[0]

      const updated = await client.query<AutomationControlRow>(
        `
          UPDATE public.marketplace_automation_control
          SET
            is_enabled = $2,
            is_paused = $3,
            pause_reason = $4,
            updated_by = $5,
            updated_at = NOW()
          WHERE control_id = 1
          RETURNING
            control_id,
            is_enabled,
            is_paused,
            pause_reason,
            updated_by::text AS updated_by,
            created_at,
            updated_at
        `,
        [
          nextState.isEnabled,
          nextState.isPaused,
          nextState.pauseReason,
          actorUserId,
        ],
      )

      const control = updated.rows[0]

      // Record the administrative action in the audit log.
      await client.query(
        `
          INSERT INTO public.marketplace_audit_logs (
            actor_user_id,
            action_key,
            target_type,
            target_id,
            details
          )
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          actorUserId,
          `automation.${action.replace('-', '_')}`,
          'automation_control',
          '1',
          JSON.stringify({
            action,
            reason: nextState.pauseReason,
            previousState: {
              enabled: previous.is_enabled,
              paused: previous.is_paused,
            },
            newState: {
              enabled: control.is_enabled,
              paused: control.is_paused,
            },
          }),
        ],
      )

      await client.query('COMMIT')

      console.log(
        `Automation control changed: ${action}, actor ${actorUserId}`,
      )

      res.status(200).json({
        status: 'ok',
        message: `Automation ${action} action completed successfully.`,
        automation: formatControl(control),
      })
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => undefined)
      }

      console.error(
        'Automation control update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Automation control could not be updated.',
      })
    } finally {
      client?.release()
    }
  },
)

export default router