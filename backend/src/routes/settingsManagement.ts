
import { Router } from 'express'
import { getDatabasePool } from '../database'
import { requirePermission } from '../auth/requirePermission'

const router = Router()

const MAX_VALUE_SIZE = 10000

interface SettingRow {
  setting_key: string
  setting_value: unknown
  setting_group: string
  description: string | null
  is_public: boolean
  created_at: Date
  updated_at: Date
}

function formatSetting(row: SettingRow) {
  return {
    key: row.setting_key,
    value: row.setting_value,
    group: row.setting_group,
    description: row.description,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isValidSettingKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(value)
  )
}

function serializeSettingValue(value: unknown): string | null {
  try {
    const serialized = JSON.stringify(value)

    if (
      serialized === undefined ||
      serialized.length > MAX_VALUE_SIZE
    ) {
      return null
    }

    return serialized
  } catch {
    return null
  }
}

// View all platform settings, including private settings.
// Access is controlled by the settings.view permission.
router.get(
  '/',
  requirePermission('settings.view'),
  async (_req, res) => {
    try {
      const result = await getDatabasePool().query<SettingRow>(
        `SELECT
           setting_key,
           setting_value,
           setting_group,
           description,
           is_public,
           created_at,
           updated_at
         FROM public.platform_settings
         ORDER BY setting_group ASC, setting_key ASC`,
      )

      res.status(200).json({
        status: 'ok',
        settings: result.rows.map(formatSetting),
        total: result.rows.length,
        generatedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error(
        'Admin settings directory failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Platform settings could not be loaded.',
      })
    }
  },
)

// Update an existing setting value.
// Setting keys, groups, descriptions and public visibility are immutable here.
router.put(
  '/:settingKey',
  requirePermission('settings.manage'),
  async (req, res) => {
    const settingKey = req.params.settingKey

    if (!isValidSettingKey(settingKey)) {
      res.status(400).json({
        error: 'Invalid setting key.',
      })
      return
    }

    if (
      !req.body ||
      typeof req.body !== 'object' ||
      !Object.prototype.hasOwnProperty.call(req.body, 'value')
    ) {
      res.status(400).json({
        error: 'A setting value is required.',
      })
      return
    }

    const serializedValue = serializeSettingValue(req.body.value)

    if (serializedValue === null) {
      res.status(400).json({
        error: 'Setting value must be valid JSON and cannot exceed 10000 characters.',
      })
      return
    }

    const actorUserId = String(
      res.locals.authenticatedUserId ?? '',
    )

    if (!actorUserId) {
      res.status(401).json({
        error: 'Administrator identity could not be verified.',
      })
      return
    }

    const db = getDatabasePool()
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const existing = await client.query<SettingRow>(
        `SELECT
           setting_key,
           setting_value,
           setting_group,
           description,
           is_public,
           created_at,
           updated_at
         FROM public.platform_settings
         WHERE setting_key = $1
         FOR UPDATE`,
        [settingKey],
      )

      if (existing.rowCount === 0) {
        await client.query('ROLLBACK')

        res.status(404).json({
          error: 'Platform setting not found.',
        })
        return
      }

      const previous = existing.rows[0]

      const updated = await client.query<SettingRow>(
        `UPDATE public.platform_settings
         SET
           setting_value = $2::jsonb,
           updated_at = NOW()
         WHERE setting_key = $1
         RETURNING
           setting_key,
           setting_value,
           setting_group,
           description,
           is_public,
           created_at,
           updated_at`,
        [settingKey, serializedValue],
      )

      const setting = updated.rows[0]

      // Do not copy setting values into audit logs.
      // This avoids exposing potentially sensitive configuration values.
      const auditDetails = {
        settingKey,
        settingGroup: previous.setting_group,
        change: 'setting_value_updated',
      }

      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (
             actor_user_id,
             action_key,
             target_type,
             target_id,
             details
           )
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          actorUserId,
          'platform_setting.updated',
          'platform_setting',
          settingKey,
          JSON.stringify(auditDetails),
        ],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: 'Platform setting updated successfully.',
        setting: formatSetting(setting),
      })
    } catch (error) {
      await client.query('ROLLBACK')

      console.error(
        'Platform setting update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Platform setting could not be updated.',
      })
    } finally {
      client.release()
    }
  },
)

export default router
