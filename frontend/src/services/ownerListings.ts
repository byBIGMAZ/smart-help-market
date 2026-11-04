export interface OwnerListingImage {
  id: string
  url: string
  width: number | null
  height: number | null
  format: string | null
  altText: string | null
  sortOrder: number
  isCover: boolean
}

export interface OwnerMarketplaceListing {
  id: string
  key: string
  categoryKey: string
  category: string
  title: string
  description: string | null
  price: string | null
  priceUnit: string | null
  location: string | null
  icon: string | null
  tag: string | null
  status: string
  isDemo: boolean
  createdAt: string
  propertyRelationshipType: 'standalone' | 'parent' | 'child'
  parentListingId: string | null
  images: OwnerListingImage[]
}

interface OwnerListingsResponse {
  status: string
  listings: OwnerMarketplaceListing[]
}

export async function getOwnerListings(): Promise<OwnerMarketplaceListing[]> {
  const response = await fetch('/api/listings/owner', {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.message ||
      (response.status === 401
        ? 'Please sign in to view your listings.'
        : 'Unable to load your listings.')
    )
  }

  if (
    !data ||
    data.status !== 'ok' ||
    !Array.isArray(data.listings)
  ) {
    throw new Error('The server returned an invalid listings response.')
  }

  return (data as OwnerListingsResponse).listings
}
