import { mockMarketplaceListings } from '../mocks/marketplaceListings'

export interface MarketplaceListingImage {
  id: string
  url: string
  width: number | null
  height: number | null
  format: string | null
  altText: string
  sortOrder: number
  isCover: boolean
}

export type PropertyRelationshipType =
  | 'standalone'
  | 'parent'
  | 'child'

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
  propertyRelationshipType: PropertyRelationshipType
  parentListingId: string | null
  images: MarketplaceListingImage[]
  coverImage: MarketplaceListingImage | null
}

interface PublicListingsResponse {
  listings: MarketplaceListing[]
}

interface PublicListingResponse {
  listing: MarketplaceListing
}

function isMarketplaceListingImage(
  value: unknown,
): value is MarketplaceListingImage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const image = value as Record<string, unknown>

  return (
    typeof image.id === 'string' &&
    typeof image.url === 'string' &&
    image.url.startsWith('https://') &&
    (image.width === null ||
      (typeof image.width === 'number' && Number.isFinite(image.width))) &&
    (image.height === null ||
      (typeof image.height === 'number' && Number.isFinite(image.height))) &&
    (image.format === null || typeof image.format === 'string') &&
    typeof image.altText === 'string' &&
    typeof image.sortOrder === 'number' &&
    Number.isInteger(image.sortOrder) &&
    typeof image.isCover === 'boolean'
  )
}

function isMarketplaceListing(
  value: unknown,
): value is MarketplaceListing {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const item = value as Record<string, unknown>

  const validRelationshipTypes: PropertyRelationshipType[] = [
    'standalone',
    'parent',
    'child',
  ]

  const validImages =
    Array.isArray(item.images) &&
    item.images.every(isMarketplaceListingImage)

  const validCover =
    item.coverImage === null ||
    isMarketplaceListingImage(item.coverImage)

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
    typeof item.createdAt === 'string' &&
    typeof item.propertyRelationshipType === 'string' &&
    validRelationshipTypes.includes(
      item.propertyRelationshipType as PropertyRelationshipType,
    ) &&
    (item.parentListingId === null ||
      typeof item.parentListingId === 'string') &&
    validImages &&
    validCover
  )
}

// The frontend uses demonstration data until the complete UI is ready.
// Set VITE_MARKETPLACE_DATA_MODE=api when deliberately testing the backend.
function useMockMarketplaceData(): boolean {
  return import.meta.env.VITE_MARKETPLACE_DATA_MODE !== 'api'
}

export async function getPublicListings(): Promise<
  MarketplaceListing[]
> {
  if (useMockMarketplaceData()) {
    return [...mockMarketplaceListings]
  }

  const response = await fetch('/api/listings/public', {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Listings API returned HTTP ${response.status}`)
  }

  const data: unknown = await response.json()

  if (
    typeof data !== 'object' ||
    data === null ||
    !('listings' in data) ||
    !Array.isArray(data.listings)
  ) {
    throw new Error('The listings API returned an invalid response.')
  }

  if (!data.listings.every(isMarketplaceListing)) {
    throw new Error('The listings API returned an invalid listing record.')
  }

  return (data as PublicListingsResponse).listings
}

export async function getPublicListingByKey(
  listingKey: string,
): Promise<MarketplaceListing> {
  if (!listingKey.trim()) {
    throw new Error('A valid listing key is required.')
  }

  if (useMockMarketplaceData()) {
    const listing = mockMarketplaceListings.find(
      (item) => item.key === listingKey,
    )

    if (!listing) {
      throw new Error('This demonstration listing could not be found.')
    }

    return listing
  }

  const response = await fetch(
    `/api/listings/public/${encodeURIComponent(listingKey)}`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (response.status === 404) {
    throw new Error(
      'This listing does not exist or is no longer available.',
    )
  }

  if (!response.ok) {
    throw new Error(`Listing details API returned HTTP ${response.status}`)
  }

  const data: unknown = await response.json()

  if (
    typeof data !== 'object' ||
    data === null ||
    !('listing' in data) ||
    !isMarketplaceListing(data.listing)
  ) {
    throw new Error('The listing details API returned an invalid response.')
  }

  return (data as PublicListingResponse).listing
}
