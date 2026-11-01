
import { Router } from 'express'
import { getDatabasePool } from '../database'
import { requirePermission } from '../auth/requirePermission'
import { validateAutomationActions } from '../automation/actions'

const router = Router()

type RuleInput = {
  ruleKey: string
  ruleName: string
  description: string
  eventType: string
  conditions: Record<string, unknown>
  actions: unknown[]
  isActive: boolean
}

type RuleRow = {
  rule_id: string
  rule_key: string
  rule_name: string
  description: string
  event_type: string
  conditions: Record<string, unknown>
  actions: unknown[]
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: Date
  updated_at: Date
  execution_count?: number
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function validateRuleInput(
  body: unknown,
): RuleInput | null {
  if (!isObject(body)) return null

  const {
    ruleKey,
    ruleName,
    description,
    eventType,
    conditions,
    actions,
    isActive,
  } = body

  if (
    typeof ruleKey !== 'string' ||
    !/^[a-z0-9][a-z0-9_.-]{1,99}$/.test(ruleKey.trim())
  ) {
    throw new Error(
      'Rule key must contain 2 to 100 lowercase letters, numbers, dots, underscores or hyphens.',
    )
  }

  if (
    typeof ruleName !== 'string' ||
    !ruleName.trim() ||
    ruleName.trim().length > 200
  ) {
    throw new Error('Rule name is required and cannot exceed 200 characters.')
  }

  if (
    description !== undefined &&
    (
      typeof description !== 'string' ||
      description.length > 2000
    )
  ) {
    throw new Error('Description cannot exceed 2000 characters.')
  }

  if (
    typeof eventType !== 'string' ||
    !/^[a-z0-9_.-]{1,100}$/.test(eventType.trim())
  ) {
    throw new Error('Invalid automation event type.')
  }

  if (!isObject(conditions)) {
    throw new Error('Rule conditions must be an object.')
  }

  if (Object.keys(conditions).length > 20) {
    throw new Error('A rule cannot contain more than 20 conditions.')
  }

  for (const key of Object.keys(conditions)) {
    if (!key.trim() || key.length > 100) {
      throw new Error('A condition contains an invalid field name.')
    }
  }

  if (JSON.stringify(conditions).length > 10000) {
    throw new Error('Rule conditions cannot exceed 10 KB.')
  }

  if (!Array.isArray(actions)) {
  throw new Error('Rule actions must be an array.')
}

validateAutomationActions(actions)

  if (
    isActive !== undefined &&
    typeof isActive !== 'boolean'
  ) {
    throw new Error('isActive must be true or false.')
  }

  return {
    ruleKey: ruleKey.trim(),
    ruleName: ruleName.trim(),
    description:
      typeof description === 'string'
        ? description.trim()
        : '',
    eventType: eventType.trim(),
    conditions,
    actions,
    isActive: isActive ?? false,
  }
}

function formatRule(row: RuleRow) {
  return {
    ruleId: row.rule_id,
    ruleKey: row.rule_key,
    ruleName: row.rule_name,
    description: row.description,
    eventType: row.event_type,
    conditions: row.conditions,
    actions: row.actions,
    isActive: row.is_active,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    executionCount: row.execution_count ?? 0,
  }
}

function getActorId(res: {
  locals: Record<string, unknown>
}): string | null {
  const value = String(
    res.locals.authenticatedUserId ?? '',
  )

  return /^[1-9]\d*$/.test(value) ? value : null
}

// GET /rules
// List automation rules.
router.get(
  '/rules',
  requirePermission('automation.view'),
  async (_req, res) => {
    try {
      const result = await getDatabasePool().query<RuleRow>(
        `
          SELECT
            r.rule_id::text AS rule_id,
            r.rule_key,
            r.rule_name,
            r.description,
            r.event_type,
            r.conditions,
            r.actions,
            r.is_active,
            r.created_by::text AS created_by,
            r.updated_by::text AS updated_by,
            r.created_at,
            r.updated_at,
            COUNT(e.execution_id)::int AS execution_count
          FROM public.marketplace_automation_rules r
          LEFT JOIN public.marketplace_automation_executions e
            ON e.rule_id = r.rule_id
          GROUP BY r.rule_id
          ORDER BY r.created_at DESC, r.rule_id DESC
        `,
      )

      res.status(200).json({
        status: 'ok',
        rules: result.rows.map(formatRule),
        total: result.rowCount ?? 0,
      })
    } catch (error) {
      console.error(
        'Automation rules retrieval failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Automation rules could not be retrieved.',
      })
    }
  },
)

// POST /rules
// Create a new automation rule.
router.post(
  '/rules',
  requirePermission('automation.manage'),
  async (req, res) => {
    const actorId = getActorId(res)

    if (!actorId) {
      res.status(401).json({
        error: 'Administrator identity could not be verified.',
      })
      return
    }

    let input: RuleInput | null

    try {
      input = validateRuleInput(req.body)
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error
          ? error.message
          : 'Invalid automation rule.',
      })
      return
    }

    if (!input) {
      res.status(400).json({
        error: 'Invalid automation rule data.',
      })
      return
    }

    const db = getDatabasePool()
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const inserted = await client.query<RuleRow>(
        `
          INSERT INTO public.marketplace_automation_rules (
            rule_key,
            rule_name,
            description,
            event_type,
            conditions,
            actions,
            is_active,
            created_by,
            updated_by
          )
          VALUES (
            $1, $2, $3, $4,
            $5::jsonb, $6::jsonb,
            $7, $8, $8
          )
          RETURNING
            rule_id::text AS rule_id,
            rule_key,
            rule_name,
            description,
            event_type,
            conditions,
            actions,
            is_active,
            created_by::text AS created_by,
            updated_by::text AS updated_by,
            created_at,
            updated_at
        `,
        [
          input.ruleKey,
          input.ruleName,
          input.description,
          input.eventType,
          JSON.stringify(input.conditions),
          JSON.stringify(input.actions),
          input.isActive,
          actorId,
        ],
      )

      const rule = inserted.rows[0]

      await client.query(
        `
          INSERT INTO public.marketplace_audit_logs (
            actor_user_id,
            action_key,
            target_type,
            target_id,
            details
          )
          VALUES ($1, 'automation.rule_created', 'automation_rule', $2, $3::jsonb)
        `,
        [
          actorId,
          rule.rule_id,
          JSON.stringify({
            ruleKey: rule.rule_key,
            ruleName: rule.rule_name,
            eventType: rule.event_type,
            isActive: rule.is_active,
          }),
        ],
      )

      await client.query('COMMIT')

      res.status(201).json({
        status: 'ok',
        message: 'Automation rule created successfully.',
        rule: formatRule(rule),
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)

      const databaseError = error as {
        code?: string
      }

      if (databaseError.code === '23505') {
        res.status(409).json({
          error: 'An automation rule with this key already exists.',
        })
        return
      }

      console.error(
        'Automation rule creation failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Automation rule could not be created.',
      })
    } finally {
      client.release()
    }
  },
)

// PUT /rules/:ruleId
// Update an existing automation rule.
router.put(
  '/rules/:ruleId',
  requirePermission('automation.manage'),
  async (req, res) => {
    const ruleId = String(req.params.ruleId ?? '')
    const actorId = getActorId(res)

    if (!/^[1-9]\d*$/.test(ruleId)) {
      res.status(400).json({
        error: 'Invalid automation rule ID.',
      })
      return
    }

    if (!actorId) {
      res.status(401).json({
        error: 'Administrator identity could not be verified.',
      })
      return
    }

    let input: RuleInput | null

    try {
      input = validateRuleInput(req.body)
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error
          ? error.message
          : 'Invalid automation rule.',
      })
      return
    }

    if (!input) {
      res.status(400).json({
        error: 'Invalid automation rule data.',
      })
      return
    }

    const client = await getDatabasePool().connect()

    try {
      await client.query('BEGIN')

      const existing = await client.query(
        `
          SELECT rule_id
          FROM public.marketplace_automation_rules
          WHERE rule_id = $1
          FOR UPDATE
        `,
        [ruleId],
      )

      if (existing.rowCount === 0) {
        await client.query('ROLLBACK')

        res.status(404).json({
          error: 'Automation rule not found.',
        })
        return
      }

      const updated = await client.query<RuleRow>(
        `
          UPDATE public.marketplace_automation_rules
          SET
            rule_key = $2,
            rule_name = $3,
            description = $4,
            event_type = $5,
            conditions = $6::jsonb,
            actions = $7::jsonb,
            is_active = $8,
            updated_by = $9,
            updated_at = NOW()
          WHERE rule_id = $1
          RETURNING
            rule_id::text AS rule_id,
            rule_key,
            rule_name,
            description,
            event_type,
            conditions,
            actions,
            is_active,
            created_by::text AS created_by,
            updated_by::text AS updated_by,
            created_at,
            updated_at
        `,
        [
          ruleId,
          input.ruleKey,
          input.ruleName,
          input.description,
          input.eventType,
          JSON.stringify(input.conditions),
          JSON.stringify(input.actions),
          input.isActive,
          actorId,
        ],
      )

      const rule = updated.rows[0]

      await client.query(
        `
          INSERT INTO public.marketplace_audit_logs (
            actor_user_id,
            action_key,
            target_type,
            target_id,
            details
          )
          VALUES ($1, 'automation.rule_updated', 'automation_rule', $2, $3::jsonb)
        `,
        [
          actorId,
          ruleId,
          JSON.stringify({
            ruleKey: rule.rule_key,
            ruleName: rule.rule_name,
            eventType: rule.event_type,
            isActive: rule.is_active,
          }),
        ],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: 'Automation rule updated successfully.',
        rule: formatRule(rule),
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)

      const databaseError = error as {
        code?: string
      }

      if (databaseError.code === '23505') {
        res.status(409).json({
          error: 'An automation rule with this key already exists.',
        })
        return
      }

      console.error(
        'Automation rule update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Automation rule could not be updated.',
      })
    } finally {
      client.release()
    }
  },
)

// PATCH /rules/:ruleId/status
// Activate or deactivate a rule.
router.patch(
  '/rules/:ruleId/status',
  requirePermission('automation.manage'),
  async (req, res) => {
    const ruleId = String(req.params.ruleId ?? '')
    const actorId = getActorId(res)
    const isActive = req.body?.isActive

    if (!/^[1-9]\d*$/.test(ruleId)) {
      res.status(400).json({
        error: 'Invalid automation rule ID.',
      })
      return
    }

    if (!actorId) {
      res.status(401).json({
        error: 'Administrator identity could not be verified.',
      })
      return
    }

    if (typeof isActive !== 'boolean') {
      res.status(400).json({
        error: 'isActive must be true or false.',
      })
      return
    }

    const client = await getDatabasePool().connect()

    try {
      await client.query('BEGIN')

      const updated = await client.query<RuleRow>(
        `
          UPDATE public.marketplace_automation_rules
          SET
            is_active = $2,
            updated_by = $3,
            updated_at = NOW()
          WHERE rule_id = $1
          RETURNING
            rule_id::text AS rule_id,
            rule_key,
            rule_name,
            description,
            event_type,
            conditions,
            actions,
            is_active,
            created_by::text AS created_by,
            updated_by::text AS updated_by,
            created_at,
            updated_at
        `,
        [ruleId, isActive, actorId],
      )

      if (updated.rowCount === 0) {
        await client.query('ROLLBACK')

        res.status(404).json({
          error: 'Automation rule not found.',
        })
        return
      }

      const rule = updated.rows[0]

      await client.query(
        `
          INSERT INTO public.marketplace_audit_logs (
            actor_user_id,
            action_key,
            target_type,
            target_id,
            details
          )
          VALUES ($1, $2, 'automation_rule', $3, $4::jsonb)
        `,
        [
          actorId,
          isActive
            ? 'automation.rule_activated'
            : 'automation.rule_deactivated',
          ruleId,
          JSON.stringify({
            ruleKey: rule.rule_key,
            isActive,
          }),
        ],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: isActive
          ? 'Automation rule activated.'
          : 'Automation rule deactivated.',
        rule: formatRule(rule),
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)

      console.error(
        'Automation rule status update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Automation rule status could not be updated.',
      })
    } finally {
      client.release()
    }
  },
)

// DELETE /rules/:ruleId
// Only unused, inactive rules may be permanently deleted.
router.delete(
  '/rules/:ruleId',
  requirePermission('automation.manage'),
  async (req, res) => {
    const ruleId = String(req.params.ruleId ?? '')
    const actorId = getActorId(res)

    if (!/^[1-9]\d*$/.test(ruleId)) {
      res.status(400).json({
        error: 'Invalid automation rule ID.',
      })
      return
    }

    if (!actorId) {
      res.status(401).json({
        error: 'Administrator identity could not be verified.',
      })
      return
    }

    const client = await getDatabasePool().connect()

    try {
      await client.query('BEGIN')

      const existing = await client.query<{
        rule_key: string
        is_active: boolean
      }>(
        `
          SELECT rule_key, is_active
          FROM public.marketplace_automation_rules
          WHERE rule_id = $1
          FOR UPDATE
        `,
        [ruleId],
      )

      if (existing.rowCount === 0) {
        await client.query('ROLLBACK')

        res.status(404).json({
          error: 'Automation rule not found.',
        })
        return
      }

      const rule = existing.rows[0]

      if (rule.is_active) {
        await client.query('ROLLBACK')

        res.status(409).json({
          error: 'Deactivate this rule before deleting it.',
        })
        return
      }

      const executions = await client.query(
        `
          SELECT 1
          FROM public.marketplace_automation_executions
          WHERE rule_id = $1
          LIMIT 1
        `,
        [ruleId],
      )

      if ((executions.rowCount ?? 0) > 0) {
        await client.query('ROLLBACK')

        res.status(409).json({
          error: 'This rule has execution history and cannot be permanently deleted.',
        })
        return
      }

      await client.query(
        `
          INSERT INTO public.marketplace_audit_logs (
            actor_user_id,
            action_key,
            target_type,
            target_id,
            details
          )
          VALUES ($1, 'automation.rule_deleted', 'automation_rule', $2, $3::jsonb)
        `,
        [
          actorId,
          ruleId,
          JSON.stringify({
            ruleKey: rule.rule_key,
          }),
        ],
      )

      await client.query(
        `
          DELETE FROM public.marketplace_automation_rules
          WHERE rule_id = $1
        `,
        [ruleId],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: 'Automation rule deleted successfully.',
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)

      console.error(
        'Automation rule deletion failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Automation rule could not be deleted.',
      })
    } finally {
      client.release()
    }
  },
)

export default router
