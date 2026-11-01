
import { Router } from 'express'
import { getDatabasePool } from '../database'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const db = getDatabasePool()

    const result = await db.query<{
      setting_key: string
      setting_value: unknown
    }>(
      `SELECT setting_key, setting_value
       FROM public.platform_settings
       WHERE is_public = TRUE
       ORDER BY setting_key`,
    )

    const settings = Object.fromEntries(
      result.rows.map((row) => [
        row.setting_key,
        row.setting_value,
      ]),
    )

    res.status(200).json({ settings })
  } catch (error) {
    const details =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            code: 'code' in error ? error.code : undefined,
          }
        : { message: 'Unknown error' }

    console.error('Public settings query failed:', details)

    res.status(503).json({
      error: 'Public settings are temporarily unavailable.',
    })
  }
})

export default router
