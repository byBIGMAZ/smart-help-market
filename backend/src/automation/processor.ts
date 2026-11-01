import type { PoolClient } from 'pg'
import { getDatabasePool } from '../database'
import {
  executeAutomationActions,
  type AutomationEventContext,
} from './actions'

type PendingEvent = {
  event_id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

type AutomationRule = {
  rule_id: string
  rule_key: string
  rule_name: string
  conditions: unknown
  actions: unknown
}

export type AutomationProcessorResult = {
  processed: boolean
  eventId?: string
  status?: 'processed' | 'failed' | 'pending'
  message?: string
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

/**
 * Creates a stable JSON representation.
 * Object property order does not affect comparisons.
 */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue)
  }

  if (isObject(value)) {
    const sorted: Record<string, unknown> = {}

    for (const key of Object.keys(value).sort()) {
      sorted[key] = stableValue(value[key])
    }

    return sorted
  }

  return value
}

function matchesConditions(
  conditions: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  return Object.entries(conditions).every(
    ([key, expected]) => {
      if (
        !Object.prototype.hasOwnProperty.call(
          payload,
          key,
        )
      ) {
        return false
      }

      return (
        JSON.stringify(stableValue(payload[key])) ===
        JSON.stringify(stableValue(expected))
      )
    },
  )
}

/**
 * Processes at most one available automation event.
 *
 * Processing is allowed only when the database control
 * record exists, automation is enabled and the system
 * is not paused.
 *
 * Events without active rules remain pending.
 *
 * A savepoint protects marketplace actions. If an action
 * fails, those actions are rolled back while the event
 * claim is retained so failure history can be recorded.
 */
export async function processNextAutomationEvent():
Promise<AutomationProcessorResult> {
  const db = getDatabasePool()

  let client: PoolClient | undefined
  let claimedEvent: PendingEvent | undefined
  let currentRule: AutomationRule | undefined

  let transactionStarted = false
  let savepointCreated = false
  let attemptNumber = 0

  try {
    client = await db.connect()

    await client.query('BEGIN')
    transactionStarted = true

    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '30s'")

    // 1. Check global database automation controls.
    const controlResult = await client.query<{
      is_enabled: boolean
      is_paused: boolean
    }>(
      `
        SELECT
          is_enabled,
          is_paused
        FROM public.marketplace_automation_control
        WHERE control_id = 1
      `,
    )

    const control = controlResult.rows[0]

    if (
      !control ||
      !control.is_enabled ||
      control.is_paused
    ) {
      await client.query('COMMIT')
      transactionStarted = false

      return {
        processed: false,
        message: 'Automation is disabled or paused.',
      }
    }

    // 2. Claim one event without blocking other workers.
    const eventResult = await client.query<PendingEvent>(
      `
        SELECT
          event_id::text AS event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload,
          attempts,
          max_attempts
        FROM public.marketplace_automation_events
        WHERE attempts < max_attempts
          AND (
            (
              status = 'pending'
              AND available_at <= NOW()
            )
            OR
            (
              status = 'processing'
              AND locked_at < NOW() - INTERVAL '5 minutes'
            )
          )
        ORDER BY available_at ASC, event_id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `,
    )

    claimedEvent = eventResult.rows[0]

    if (!claimedEvent) {
      await client.query('COMMIT')
      transactionStarted = false

      return {
        processed: false,
        message: 'No automation events are currently available.',
      }
    }

    // Claim the event without consuming an attempt yet.
    await client.query(
      `
        UPDATE public.marketplace_automation_events
        SET
          status = 'processing',
          locked_at = NOW(),
          last_error = '',
          updated_at = NOW()
        WHERE event_id = $1
      `,
      [claimedEvent.event_id],
    )

    if (!isObject(claimedEvent.payload)) {
      throw new Error('Automation event payload is invalid.')
    }

    const event: AutomationEventContext = {
      eventId: claimedEvent.event_id,
      eventType: claimedEvent.event_type,
      aggregateType: claimedEvent.aggregate_type,
      aggregateId: claimedEvent.aggregate_id,
      payload: claimedEvent.payload,
    }

    // 3. Retrieve active rules for this event type.
    const rulesResult = await client.query<AutomationRule>(
      `
        SELECT
          rule_id::text AS rule_id,
          rule_key,
          rule_name,
          conditions,
          actions
        FROM public.marketplace_automation_rules
        WHERE event_type = $1
          AND is_active = TRUE
        ORDER BY rule_id ASC
      `,
      [event.eventType],
    )

    // Never consume an event when no active rule exists.
    if (rulesResult.rows.length === 0) {
      await client.query(
        `
          UPDATE public.marketplace_automation_events
          SET
            status = 'pending',
            locked_at = NULL,
            available_at = NOW() + INTERVAL '60 seconds',
            updated_at = NOW()
          WHERE event_id = $1
        `,
        [event.eventId],
      )

      await client.query('COMMIT')
      transactionStarted = false

      return {
        processed: false,
        eventId: event.eventId,
        status: 'pending',
        message: 'No active automation rule exists for this event type.',
      }
    }

    // An actual processing attempt begins only after
    // at least one active rule has been found.
    attemptNumber = claimedEvent.attempts + 1

    await client.query(
      `
        UPDATE public.marketplace_automation_events
        SET
          attempts = $2,
          updated_at = NOW()
        WHERE event_id = $1
      `,
      [event.eventId, attemptNumber],
    )

    // Preserve the event claim and attempt count while
    // allowing all rule actions to be rolled back.
    await client.query('SAVEPOINT automation_execution')
    savepointCreated = true

    let successfulRules = 0
    let skippedRules = 0

    // 4. Execute active rules.
    for (const rule of rulesResult.rows) {
      currentRule = rule

      if (
        !isObject(rule.conditions) ||
        !Array.isArray(rule.actions)
      ) {
        throw new Error(
          `Automation rule "${rule.rule_key}" has invalid configuration.`,
        )
      }

      const conditionMatched = matchesConditions(
        rule.conditions,
        event.payload,
      )

      if (!conditionMatched) {
        await client.query(
          `
            INSERT INTO public.marketplace_automation_executions (
              event_id,
              rule_id,
              attempt_number,
              status,
              output,
              finished_at
            )
            VALUES ($1, $2, $3, 'skipped', $4::jsonb, NOW())
          `,
          [
            event.eventId,
            rule.rule_id,
            attemptNumber,
            JSON.stringify({
              reason: 'Rule conditions did not match.',
              ruleKey: rule.rule_key,
            }),
          ],
        )

        skippedRules += 1
        currentRule = undefined
        continue
      }

      const executionResult = await client.query(
        `
          INSERT INTO public.marketplace_automation_executions (
            event_id,
            rule_id,
            attempt_number,
            status
          )
          VALUES ($1, $2, $3, 'running')
          RETURNING execution_id::text AS execution_id
        `,
        [
          event.eventId,
          rule.rule_id,
          attemptNumber,
        ],
      )

      const executionId =
        executionResult.rows[0]?.execution_id

      if (!executionId) {
        throw new Error(
          `Execution record could not be created for rule "${rule.rule_key}".`,
        )
      }

      // Only registered automation actions are supported.
      const actionResults = await executeAutomationActions(
        client,
        event,
        rule.actions,
      )

      await client.query(
        `
          UPDATE public.marketplace_automation_executions
          SET
            status = 'succeeded',
            output = $2::jsonb,
            finished_at = NOW()
          WHERE execution_id = $1
        `,
        [
          executionId,
          JSON.stringify({
            ruleKey: rule.rule_key,
            ruleName: rule.rule_name,
            actions: actionResults,
          }),
        ],
      )

      successfulRules += 1
      currentRule = undefined
    }

    // 5. Mark the event processed.
    await client.query(
      `
        UPDATE public.marketplace_automation_events
        SET
          status = 'processed',
          locked_at = NULL,
          processed_at = NOW(),
          last_error = '',
          updated_at = NOW()
        WHERE event_id = $1
      `,
      [event.eventId],
    )

    await client.query('COMMIT')
    transactionStarted = false

    console.log(
      `Automation event processed: ${event.eventId}. ` +
      `Successful rules: ${successfulRules}. ` +
      `Skipped rules: ${skippedRules}.`,
    )

    return {
      processed: true,
      eventId: event.eventId,
      status: 'processed',
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown automation processing error.'

    console.error(
      'Automation event processing failed:',
      message,
    )

    // 6. Preserve failure history without preserving
    // partially completed marketplace actions.
    if (
      client &&
      transactionStarted &&
      savepointCreated &&
      claimedEvent &&
      attemptNumber > 0
    ) {
      try {
        await client.query(
          'ROLLBACK TO SAVEPOINT automation_execution',
        )

        const nextStatus =
          attemptNumber >= claimedEvent.max_attempts
            ? 'failed'
            : 'pending'

        const delaySeconds = Math.min(
          15 * 60,
          15 * Math.pow(
            2,
            Math.max(0, attemptNumber - 1),
          ),
        )

        // Preserve the failed rule execution.
        if (currentRule) {
          await client.query(
            `
              INSERT INTO public.marketplace_automation_executions (
                event_id,
                rule_id,
                attempt_number,
                status,
                error_message,
                output,
                finished_at
              )
              VALUES (
                $1,
                $2,
                $3,
                'failed',
                $4,
                $5::jsonb,
                NOW()
              )
              ON CONFLICT (
                event_id,
                rule_id,
                attempt_number
              )
              DO UPDATE SET
                status = 'failed',
                error_message = EXCLUDED.error_message,
                output = EXCLUDED.output,
                finished_at = NOW()
            `,
            [
              claimedEvent.event_id,
              currentRule.rule_id,
              attemptNumber,
              message.slice(0, 4000),
              JSON.stringify({
                ruleKey: currentRule.rule_key,
                ruleName: currentRule.rule_name,
                reason: 'Automation rule execution failed.',
              }),
            ],
          )
        }

        // Record the event failure and schedule a retry
        // when attempts remain.
        await client.query(
          `
            UPDATE public.marketplace_automation_events
            SET
              status = $2,
              locked_at = NULL,
              available_at = CASE
                WHEN $2 = 'pending'
                THEN NOW() + ($3 * INTERVAL '1 second')
                ELSE available_at
              END,
              last_error = $4,
              updated_at = NOW()
            WHERE event_id = $1
          `,
          [
            claimedEvent.event_id,
            nextStatus,
            delaySeconds,
            message.slice(0, 4000),
          ],
        )

        await client.query('COMMIT')
        transactionStarted = false
        savepointCreated = false

        console.error(
          `Automation event ${claimedEvent.event_id} is now ${nextStatus}.`,
        )

        return {
          processed: true,
          eventId: claimedEvent.event_id,
          status: nextStatus,
          message,
        }
      } catch (failureRecordingError: unknown) {
        await client.query('ROLLBACK').catch(() => undefined)
        transactionStarted = false

        console.error(
          'Could not preserve automation failure history:',
          failureRecordingError instanceof Error
            ? failureRecordingError.message
            : 'Unknown failure-recording error.',
        )

        throw failureRecordingError
      }
    }

    if (client && transactionStarted) {
      await client.query('ROLLBACK').catch(() => undefined)
      transactionStarted = false
    }

    throw error
  } finally {
    client?.release()
  }
}