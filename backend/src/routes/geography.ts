import { Router, type Request, type Response } from 'express'
import { geocodeLocation } from '../geography/geocoding'

const router = Router()
const RATE_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 12
const requestWindows = new Map<string, { count: number; resetAt: number }>()

function enforceRequestLimit(req: Request, res: Response): boolean {
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()

  for (const [storedKey, value] of requestWindows) {
    if (value.resetAt <= now) requestWindows.delete(storedKey)
  }

  const current = requestWindows.get(key)
  if (!current || current.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))))
    res.status(429).json({ error: 'Too many location searches. Please wait a moment and try again.' })
    return false
  }

  current.count += 1
  return true
}

// This is an explicit search endpoint, not autocomplete.
// Provider requests are cached and paced server-side.
router.get('/geocode', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')

  if (!enforceRequestLimit(req, res)) return

  const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (query.length < 3 || query.length > 120) {
    res.status(400).json({ error: 'Enter a location between 3 and 120 characters.' })
    return
  }

  try {
    const result = await geocodeLocation(query)
    res.status(200).json({
      status: 'ok',
      query,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Location search failed.'
    const unavailable = /unavailable|not configured|not supported|declined/i.test(message)
    res.status(unavailable ? 503 : 400).json({ error: message })
  }
})

export default router
