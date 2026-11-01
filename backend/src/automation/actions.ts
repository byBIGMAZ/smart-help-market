
import type { PoolClient } from 'pg'

export type AutomationEventContext = {
  eventId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  payload: Record<string, unknown>
}

export type AutomationActionResult = {
  action: string
  status: 'succeeded' | 'skipped'
  output: Record<string, unknown>
}

type NotificationUserAction = {
  type: 'notification.user'
  recipientUserId: string
  title: string
  message: string
  notificationType?: string
  metadata?: Record<string, unknown>
}

type NotificationAdminsAction = {
  type: 'notification.admins'
  title: string
  message: string
  notificationType?: string
  metadata?: Record<string, unknown>
}

type EventLogAction = {
  type: 'event.log'
  message: string
}

type AutomationAction =
  | NotificationUserAction
  | NotificationAdminsAction
  | EventLogAction

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function requireText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    throw new Error(`Invalid automation action field: ${field}.`)
  }

  return value.trim()
}

function optionalMetadata(
  value: unknown,
): Record<string, unknown> {
  if (value === undefined) {
    return {}
  }

  if (!isObject(value)) {
    throw new Error('Automation metadata must be an object.')
  }

  return value
}

function parseAction(value: unknown): AutomationAction {
  if (!isObject(value)) {
    throw new Error('Automation action must be an object.')
  }

  const type = requireText(value.type, 'type', 100)

  switch (type) {
    case 'notification.user': {
      const recipientUserId = requireText(
        value.recipientUserId,
        'recipientUserId',
        30,
      )

      if (!/^[1-9]\d*$/.test(recipientUserId)) {
        throw new Error('Invalid notification recipient user ID.')
      }

      return {
        type,
        recipientUserId,
        title: requireText(value.title, 'title', 200),
        message: requireText(value.message, 'message', 5000),
        notificationType:
          value.notificationType === undefined
            ? 'general'
            : requireText(
                value.notificationType,
                'notificationType',
                100,
              ),
        metadata: optionalMetadata(value.metadata),
      }
    }

    case 'notification.admins':
      return {
        type,
        title: requireText(value.title, 'title', 200),
        message: requireText(value.message, 'message', 5000),
        notificationType:
          value.notificationType === undefined
            ? 'general'
            : requireText(
                value.notificationType,
                'notificationType',
                100,
              ),
        metadata: optionalMetadata(value.metadata),
      }

    case 'event.log':
      return {
        type,
        message: requireText(value.message, 'message', 2000),
      }

    default:
      throw new Error(`Unsupported automation action: ${type}.`)
  }
}

async function executeNotificationUser(
  client: PoolClient,
  event: AutomationEventContext,
  action: NotificationUserAction,
  actionIndex: number,
): Promise<AutomationActionResult> {
  const deduplicationKey =
    `automation:${event.eventId}:action:${actionIndex}`

  const result = await client.query(
    `
      INSERT INTO public.marketplace_notifications (
        recipient_user_id,
        audience,
        notification_type,
        title,
        message,
        source_event_id,
        deduplication_key,
        metadata
      )
      VALUES ($1, 'user', $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (deduplication_key) DO NOTHING
      RETURNING notification_id::text AS notification_id
    `,
    [
      action.recipientUserId,
      action.notificationType ?? 'general',
      action.title,
      action.message,
      event.eventId,
      deduplicationKey,
      JSON.stringify(action.metadata ?? {}),
    ],
  )

  return {
    action: action.type,
    status: result.rows.length > 0 ? 'succeeded' : 'skipped',
    output: {
      notificationId:
        result.rows[0]?.notification_id ?? null,
      deduplicationKey,
    },
  }
}

async function executeNotificationAdmins(
  client: PoolClient,
  event: AutomationEventContext,
  action: NotificationAdminsAction,
  actionIndex: number,
): Promise<AutomationActionResult> {
  const deduplicationKey =
    `automation:${event.eventId}:action:${actionIndex}`

  const result = await client.query(
    `
      INSERT INTO public.marketplace_notifications (
        recipient_user_id,
        audience,
        notification_type,
        title,
        message,
        source_event_id,
        deduplication_key,
        metadata
      )
      VALUES (NULL, 'administrators', $1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (deduplication_key) DO NOTHING
      RETURNING notification_id::text AS notification_id
    `,
    [
      action.notificationType ?? 'general',
      action.title,
      action.message,
      event.eventId,
      deduplicationKey,
      JSON.stringify(action.metadata ?? {}),
    ],
  )

  return {
    action: action.type,
    status: result.rows.length > 0 ? 'succeeded' : 'skipped',
    output: {
      notificationId:
        result.rows[0]?.notification_id ?? null,
      deduplicationKey,
    },
  }
}

async function executeEventLog(
  action: EventLogAction,
): Promise<AutomationActionResult> {
  return {
    action: action.type,
    status: 'succeeded',
    output: {
      message: action.message,
    },
  }
}

/**
 * Executes the supported actions for one automation event.
 *
 * The caller owns the database transaction.
 * Notification inserts must be committed or rolled back
 * together with the corresponding execution record.
 */
export async function executeAutomationActions(
  client: PoolClient,
  event: AutomationEventContext,
  rawActions: unknown[],
): Promise<AutomationActionResult[]> {
  if (!Array.isArray(rawActions)) {
    throw new Error('Automation actions must be an array.')
  }

  if (rawActions.length > 20) {
    throw new Error('An automation rule cannot contain more than 20 actions.')
  }

  const results: AutomationActionResult[] = []

  for (let index = 0; index < rawActions.length; index += 1) {
    const action = parseAction(rawActions[index])

    let result: AutomationActionResult

    switch (action.type) {
      case 'notification.user':
        result = await executeNotificationUser(
          client,
          event,
          action,
          index,
        )
        break

      case 'notification.admins':
        result = await executeNotificationAdmins(
          client,
          event,
          action,
          index,
        )
        break

      case 'event.log':
        result = await executeEventLog(action)
        break
    }

    results.push(result)
  }

  return results
}


/**
 * Validates automation actions without executing them.
 * Shared by rule management and the event processor.
 */
export function validateAutomationActions(
  rawActions: unknown,
): void {
  if (!Array.isArray(rawActions)) {
    throw new Error('Automation actions must be an array.')
  }

  if (rawActions.length < 1 || rawActions.length > 20) {
    throw new Error(
      'An automation rule must contain between 1 and 20 actions.',
    )
  }

  for (const action of rawActions) {
    parseAction(action)
  }
}