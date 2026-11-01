
import { Router } from 'express'
import { getDatabasePool } from '../database'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const result = await getDatabasePool().query<{
      category_key: string
      category_name: string
      description: string
    }>(
      `SELECT category_key, category_name, description
       FROM public.marketplace_categories
       WHERE is_active = TRUE
       ORDER BY display_order, category_name`,
    )

    res.status(200).json({
      categories: result.rows.map((row) => ({
        key: row.category_key,
        name: row.category_name,
        description: row.description,
      })),
    })
  } catch (error) {
    const details =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { message: 'Unknown error' }

    console.error('Public categories query failed:', details)

    res.status(503).json({
      error: 'Marketplace categories are temporarily unavailable.',
    })
  }
})

export default router
