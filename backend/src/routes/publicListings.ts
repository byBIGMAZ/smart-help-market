
import { Router } from 'express'
import { getDatabasePool } from '../database'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const result = await getDatabasePool().query<{
      listing_id: string
      listing_key: string
      category_key: string
      category_name: string
      title: string
      description: string
      price: string
      price_unit: string
      location_display: string
      icon: string
      listing_tag: string
      is_demo: boolean
      created_at: Date
    }>(
      `
        SELECT
          l.listing_id::text AS listing_id,
          l.listing_key,
          l.category_key,
          c.category_name,
          l.title,
          l.description,
          l.price::text AS price,
          l.price_unit,
          l.location_display,
          l.icon,
          l.listing_tag,
          l.is_demo,
          l.created_at
        FROM public.marketplace_listings AS l
        INNER JOIN public.marketplace_categories AS c
          ON c.category_key = l.category_key
        WHERE l.status = 'published'
          AND c.is_active = TRUE
        ORDER BY l.created_at DESC, l.listing_id DESC
      `,
    )

    const listings = result.rows.map((row) => {
      const price = Number(row.price)

      if (!Number.isFinite(price) || price < 0) {
        throw new Error('A listing contains an invalid price.')
      }

      return {
        id: row.listing_id,
        key: row.listing_key,
        categoryKey: row.category_key,
        category: row.category_name,
        title: row.title,
        description: row.description,
        price,
        priceUnit: row.price_unit,
        location: row.location_display,
        icon: row.icon,
        tag: row.listing_tag,
        isDemo: row.is_demo,
        createdAt: row.created_at,
      }
    })

    res.status(200).json({ listings })
  } catch (error) {
    const details =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
          }
        : { message: 'Unknown error' }

    console.error('Public listings query failed:', details)

    res.status(503).json({
      error: 'Marketplace listings are temporarily unavailable.',
    })
  }
})

export default router
