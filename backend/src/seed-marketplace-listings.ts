
import { getDatabasePool } from './database'

const demoListings = [
  {
    listingKey: 'demo-self-contained-apartment',
    categoryKey: 'properties',
    title: 'Modern Self-Contained Apartment',
    description:
      'Demonstration listing for a self-contained apartment.',
    price: 450000,
    priceUnit: '/ year',
    locationDisplay: 'Benin City, Edo State',
    icon: '🏠',
    listingTag: 'For Rent',
  },
  {
    listingKey: 'demo-family-apartment',
    categoryKey: 'properties',
    title: 'Spacious Family Apartment',
    description:
      'Demonstration listing for a spacious family apartment.',
    price: 850000,
    priceUnit: '/ year',
    locationDisplay: 'Abuja, FCT',
    icon: '🏡',
    listingTag: 'For Rent',
  },
  {
    listingKey: 'demo-residential-land',
    categoryKey: 'properties',
    title: 'Residential Plot of Land',
    description:
      'Demonstration listing for a residential plot of land.',
    price: 3500000,
    priceUnit: ' total',
    locationDisplay: 'Auchi, Edo State',
    icon: '🌳',
    listingTag: 'For Sale',
  },
  {
    listingKey: 'demo-smartphone',
    categoryKey: 'products',
    title: 'Smartphone',
    description:
      'Demonstration product listing. Specifications are not verified.',
    price: 185000,
    priceUnit: ' each',
    locationDisplay: 'Benin City, Edo State',
    icon: '📱',
    listingTag: 'Demo Product',
  },
  {
    listingKey: 'demo-home-furniture',
    categoryKey: 'products',
    title: 'Home Furniture',
    description:
      'Demonstration furniture listing. Product details are not verified.',
    price: 120000,
    priceUnit: ' each',
    locationDisplay: 'Abuja, FCT',
    icon: '🪑',
    listingTag: 'Demo Product',
  },
  {
    listingKey: 'demo-home-cleaning',
    categoryKey: 'services',
    title: 'Home Cleaning Service',
    description:
      'Demonstration service listing. Provider availability is not verified.',
    price: 25000,
    priceUnit: ' per service',
    locationDisplay: 'Benin City, Edo State',
    icon: '🧹',
    listingTag: 'Demo Service',
  },
] as const

async function seedMarketplaceListings() {
  const db = getDatabasePool()

  try {
    await db.query('BEGIN')

    for (const listing of demoListings) {
      await db.query(
        `
          INSERT INTO public.marketplace_listings (
            listing_key,
            category_key,
            title,
            description,
            price,
            price_unit,
            location_display,
            icon,
            listing_tag,
            status,
            is_demo
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            'published',
            TRUE
          )
          ON CONFLICT (listing_key) DO NOTHING
        `,
        [
          listing.listingKey,
          listing.categoryKey,
          listing.title,
          listing.description,
          listing.price,
          listing.priceUnit,
          listing.locationDisplay,
          listing.icon,
          listing.listingTag,
        ],
      )
    }

    const verification = await db.query<{
      listing_key: string
      category_key: string
      status: string
      is_demo: boolean
    }>(
      `
        SELECT
          listing_key,
          category_key,
          status,
          is_demo
        FROM public.marketplace_listings
        WHERE listing_key = ANY($1::text[])
        ORDER BY listing_key
      `,
      [demoListings.map((listing) => listing.listingKey)],
    )

    await db.query('COMMIT')

    console.log('DEMONSTRATION LISTINGS SEED COMPLETED')
    console.log(`Expected seed records: ${demoListings.length}`)
    console.log(`Verified seed records: ${verification.rows.length}`)
    console.log(
      `Marked as demonstrations: ${
        verification.rows.filter((row) => row.is_demo).length
      }`,
    )

    for (const row of verification.rows) {
      console.log(
        `${row.listing_key} | ${row.category_key} | ${row.status} | demo=${row.is_demo}`,
      )
    }

    if (verification.rows.length !== demoListings.length) {
      throw new Error(
        'The number of verified demonstration listings does not match the seed.',
      )
    }

    if (verification.rows.some((row) => !row.is_demo)) {
      throw new Error(
        'A seeded listing is not marked as a demonstration.',
      )
    }
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await db.end()
  }
}

seedMarketplaceListings().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown seed error'

  console.error('DEMONSTRATION LISTINGS SEED FAILED:', message)
  process.exitCode = 1
})
