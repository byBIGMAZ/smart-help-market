
import { getDatabasePool } from './database'

const initialCategories = [
  {
    key: 'properties',
    name: 'Properties',
    description: 'Rent, buy or explore land',
    order: 1,
  },
  {
    key: 'products',
    name: 'Products',
    description: 'Shop everyday essentials',
    order: 2,
  },
  {
    key: 'services',
    name: 'Services',
    description: 'Find skills and expert help',
    order: 3,
  },
]

async function seedMarketplaceCategories() {
  const db = getDatabasePool()

  try {
    for (const category of initialCategories) {
      await db.query(
        `INSERT INTO marketplace_categories
          (category_key, category_name, description, display_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (category_key) DO NOTHING`,
        [
          category.key,
          category.name,
          category.description,
          category.order,
        ],
      )
    }

    const result = await db.query<{
      category_key: string
      category_name: string
      is_active: boolean
    }>(
      `SELECT category_key, category_name, is_active
       FROM marketplace_categories
       ORDER BY display_order, category_key`,
    )

    console.log('INITIAL MARKETPLACE CATEGORIES VERIFIED')
    console.table(result.rows)
    console.log(`Verified ${result.rowCount ?? 0} categories.`)
  } finally {
    await db.end()
  }
}

seedMarketplaceCategories().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown seeding error'

  console.error('CATEGORY SEEDING FAILED:', message)
  process.exitCode = 1
})
