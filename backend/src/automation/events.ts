
import type { PoolClient } from 'pg'

export type AutomationEventInput = {
  eventType: string
  aggregateType?: string
  aggregateId?: string
  idempotencyKey: string
  payload?: Record<string, unknown>
}

export type AutomationEventResult = {
  eventId: string | null
  inserted: boolean
}

/**
 * Adds an automation event using an existing database transaction.
 *
 * The caller must commit or roll back the transaction.
 * This ensures marketplace changes and their automation events
 * succeed or fail together.
 */
export async function enqueueAutomationEvent(
  client: PoolClient,
  input: AutomationEventInput,
): Promise<AutomationEventResult> {
  const eventType = input.eventType.trim()
  const idempotencyKey = input.idempotencyKey.trim()
  const aggregateType = input.aggregateType?.trim() ?? ''
  const aggregateId = input.aggregateId?.trim() ?? ''

  if (
    !/^[a-z0-9_.-]{1,100}$/.test(eventType)
  ) {
    throw new Error('Invalid automation event type.')
  }

  if (
    !idempotencyKey ||
    idempotencyKey.length > 200
  ) {
    throw new Error('Invalid automation idempotency key.')
  }

  if (
    aggregateType.length > 100 ||
    aggregateId.length > 200
  ) {
    throw new Error('Invalid automation event aggregate.')
  }

  const payload = input.payload ?? {}

  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error('Automation event payload must be an object.')
  }

  const result = await client.query<{
    event_id: string
  }>(
    `
      INSERT INTO public.marketplace_automation_events (
        event_type,
        aggregate_type,
        aggregate_id,
        idempotency_key,
        payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING event_id::text AS event_id
    `,
    [
      eventType,
      aggregateType,
      aggregateId,
      idempotencyKey,
      JSON.stringify(payload),
    ],
  )

  if (result.rows.length === 0) {
    return {
      eventId: null,
      inserted: false,
    }
  }

  return {
    eventId: result.rows[0].event_id,
    inserted: true,
  }
}
