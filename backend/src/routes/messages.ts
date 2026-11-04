
import { Router, type Request, type Response } from 'express'
import { getDatabasePool } from '../database'
import { requireAuthenticatedSession } from '../auth/requireAuthenticatedSession'
import {
  defaultMessagePolicy,
  parseMessagePolicy,
  validateMessageAgainstPolicy,
} from '../services/messagePolicy'

const router = Router()
router.use(requireAuthenticatedSession)

router.post('/validate', async (req: Request, res: Response): Promise<void> => {
  const message = req.body?.message

  if (typeof message !== 'string') {
    res.status(400).json({ allowed: false, reason: 'A message is required.' })
    return
  }

  try {
    const result = await getDatabasePool().query<{ setting_value: unknown }>(
      'SELECT setting_value FROM public.platform_settings WHERE setting_key = $1 LIMIT 1',
      ['communication.contact_policy'],
    )

    const policy = result.rows[0]
      ? parseMessagePolicy(result.rows[0].setting_value)
      : defaultMessagePolicy

    const validation = validateMessageAgainstPolicy(message, policy)
    res.status(validation.allowed ? 200 : 422).json(validation)
  } catch (error) {
    console.error(
      'Message policy validation failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    res.status(503).json({
      allowed: false,
      reason: 'Message safety checks are unavailable. Please try again.',
    })
  }
})

export default router
