import { Router } from 'express'
import { getDatabasePool } from '../database'

const router = Router()

interface ListingImage {
  id: string
  url: string
  width: number | null
  height: number | null
  format: string | null
  altText: string
  sortOrder: number
  isCover: boolean
}

interface ListingRow {
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
  property_relationship_type: string
  parent_listing_id: string | null
  images: ListingImage[] | null
}

function formatListing(row: ListingRow) {
  const price = Number(row.price)

  if (!Number.isFinite(price) || price < 0) {
    throw new Error('A listing contains an invalid price.')
  }

  const images = Array.isArray(row.images) ? row.images : []

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
    propertyRelationshipType: row.property_relationship_type,
    parentListingId: row.parent_listing_id,
    images,
    coverImage: images.find((image) => image.isCover) ?? images[0] ?? null,
  }
}

const PUBLIC_LISTING_SELECT = `
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
    l.created_at,
    l.property_relationship_type,
    l.parent_listing_id::text AS parent_listing_id,
    COALESCE(gallery.images, '[]'::json) AS images
  FROM public.marketplace_listings AS l
  INNER JOIN public.marketplace_categories AS c
    ON c.category_key = l.category_key
  LEFT JOIN LATERAL (
    SELECT
      json_agg(
        json_build_object(
          'id', image.image_id::text,
          'url', image.secure_url,
          'width', image.width,
          'height', image.height,
          'format', image.format,
          'altText', image.alt_text,
          'sortOrder', image.sort_order,
          'isCover', image.is_cover
        )
        ORDER BY image.sort_order ASC, image.image_id ASC
      ) AS images
    FROM public.marketplace_listing_images AS image
    WHERE image.listing_id = l.listing_id
  ) AS gallery ON TRUE
`

// Retrieve all published listings with their own image galleries.
router.get('/', async (_req, res) => {
  try {
    const result = await getDatabasePool().query<ListingRow>(
      `
        ${PUBLIC_LISTING_SELECT}
        WHERE l.status = 'published'
          AND c.is_active = TRUE
        ORDER BY l.created_at DESC, l.listing_id DESC
      `,
    )

    res.status(200).json({
      listings: result.rows.map(formatListing),
    })
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

// Retrieve one published listing by its unique listing key.
router.get('/:listingKey', async (req, res) => {
  try {
    const { listingKey } = req.params

    const result = await getDatabasePool().query<ListingRow>(
      `
        ${PUBLIC_LISTING_SELECT}
        WHERE l.listing_key = $1
          AND l.status = 'published'
          AND c.is_active = TRUE
        LIMIT 1
      `,
      [listingKey],
    )

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'This listing does not exist or is no longer available.',
      })
      return
    }

    res.status(200).json({
      listing: formatListing(result.rows[0]),
    })
  } catch (error) {
    const details =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
          }
        : { message: 'Unknown error' }

    console.error('Public listing details query failed:', details)

    res.status(503).json({
      error: 'Listing details are temporarily unavailable.',
    })
  }
})

export default router
