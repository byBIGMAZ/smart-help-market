
export interface MarketplaceCategory {
  key: string
  name: string
  description: string
}

const DEFAULT_CATEGORIES: MarketplaceCategory[] = [
  {
    key: 'properties',
    name: 'Properties',
    description: 'Rent, buy or explore land',
  },
  {
    key: 'products',
    name: 'Products',
    description: 'Shop everyday essentials',
  },
  {
    key: 'services',
    name: 'Services',
    description: 'Find skills and expert help',
  },
]

export async function getPublicCategories(): Promise<MarketplaceCategory[]> {
  try {
    const response = await fetch('/api/categories/public', {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Categories API returned HTTP ${response.status}`)
    }

    const data: unknown = await response.json()

    if (
      typeof data !== 'object' ||
      data === null ||
      !('categories' in data) ||
      !Array.isArray(data.categories)
    ) {
      throw new Error('Invalid categories API response.')
    }

    const categories = data.categories.filter(
      (item): item is MarketplaceCategory =>
        typeof item === 'object' &&
        item !== null &&
        'key' in item &&
        typeof item.key === 'string' &&
        'name' in item &&
        typeof item.name === 'string' &&
        item.name.trim().length > 0 &&
        'description' in item &&
        typeof item.description === 'string',
    )

    return categories.length > 0 ? categories : DEFAULT_CATEGORIES
  } catch (error) {
    console.error('Unable to load marketplace categories:', error)
    return DEFAULT_CATEGORIES
  }
}
