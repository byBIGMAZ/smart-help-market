
export interface MarketplaceListing {
  id: string
  key: string
  categoryKey: string
  category: string
  title: string
  description: string
  price: number
  priceUnit: string
  location: string
  icon: string
  tag: string
  isDemo: boolean
  createdAt: string
}

interface PublicListingsResponse {
  listings: MarketplaceListing[]
}

function isMarketplaceListing(
  value: unknown,
): value is MarketplaceListing {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const item = value as Record<string, unknown>

  return (
    typeof item.id === 'string' &&
    typeof item.key === 'string' &&
    typeof item.categoryKey === 'string' &&
    typeof item.category === 'string' &&
    typeof item.title === 'string' &&
    typeof item.description === 'string' &&
    typeof item.price === 'number' &&
    Number.isFinite(item.price) &&
    item.price >= 0 &&
    typeof item.priceUnit === 'string' &&
    typeof item.location === 'string' &&
    typeof item.icon === 'string' &&
    typeof item.tag === 'string' &&
    typeof item.isDemo === 'boolean' &&
    typeof item.createdAt === 'string'
  )
}

export async function getPublicListings(): Promise<
  MarketplaceListing[]
> {
  const response = await fetch('/api/listings/public', {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Listings API returned HTTP ${response.status}`,
    )
  }

  const data: unknown = await response.json()

  if (
    typeof data !== 'object' ||
    data === null ||
    !('listings' in data) ||
    !Array.isArray(data.listings)
  ) {
    throw new Error(
      'The listings API returned an invalid response.',
    )
  }

  if (!data.listings.every(isMarketplaceListing)) {
    throw new Error(
      'The listings API returned an invalid listing record.',
    )
  }

  return (data as PublicListingsResponse).listings
}
