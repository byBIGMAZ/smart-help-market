
export type ListingStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'published'
  | 'paused'
  | 'rented'
  | 'sold'
  | 'unavailable'
  | 'rejected'
  | 'suspended'

export type ListingDemoFilter = 'all' | 'true' | 'false'

export type ListingModerationAction =
  | 'approve'
  | 'reject'
  | 'publish'
  | 'unpublish'
  | 'suspend'
  | 'restore'

export interface AdminModerationListing {
  id: string
  listingKey: string
  categoryKey: string
  category: string | null
  title: string
  description: string | null
  price: string | null
  priceUnit: string | null
  location: string | null
  icon: string | null
  tag: string | null
  status: ListingStatus
  isDemo: boolean
  ownerUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminModerationFilters {
  search?: string
  status?: 'all' | ListingStatus
  categoryKey?: string
  demo?: ListingDemoFilter
  limit?: number
  offset?: number
}

export interface AdminModerationListingsResponse {
  status: string
  listings: AdminModerationListing[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  filters: {
    search: string
    status: string
    categoryKey: string
    demo: string
  }
}

export interface AdminModerationActionResponse {
  status: string
  message: string
  listing: {
    id: string
    listingKey: string
    previousStatus: ListingStatus
    status: ListingStatus
  }
}

export interface AdminModerationHistoryEntry {
  id: string
  listingKey: string
  action: string
  previousStatus: ListingStatus
  newStatus: ListingStatus
  reason: string | null
  details: Record<string, unknown>
  createdAt: string
  actorUserId: string | null
  actorName: string | null
}

export interface AdminModerationHistoryResponse {
  status: string
  listing: {
    id: string
    listingKey: string
    title: string
  }
  history: AdminModerationHistoryEntry[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'string'
  ) {
    return data.error
  }

  return fallback
}

async function readResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `${fallback} (HTTP ${response.status}).`,
      ),
    )
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('The server returned an invalid response.')
  }

  return data as T
}

/**
 * Retrieve marketplace listings for administrative moderation.
 */
export async function getAdminModerationListings(
  filters: AdminModerationFilters = {},
): Promise<AdminModerationListingsResponse> {
  const params = new URLSearchParams()

  params.set('limit', String(filters.limit ?? 25))
  params.set('offset', String(filters.offset ?? 0))
  params.set('status', filters.status ?? 'all')
  params.set('demo', filters.demo ?? 'all')

  if (filters.search?.trim()) {
    params.set('search', filters.search.trim())
  }

  if (filters.categoryKey?.trim()) {
    params.set('categoryKey', filters.categoryKey.trim())
  }

  const response = await fetch(
    `/api/admin/moderation/listings?${params.toString()}`,
    {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  const data = await readResponse<AdminModerationListingsResponse>(
    response,
    'Unable to load marketplace listings',
  )

  if (!Array.isArray(data.listings) || !data.pagination) {
    throw new Error('The moderation directory returned an invalid response.')
  }

  return data
}

/**
 * Perform an administrative moderation action.
 */
export async function moderateAdminListing(
  listingId: string,
  action: ListingModerationAction,
  reason = '',
): Promise<AdminModerationActionResponse> {
  const response = await fetch(
    `/api/admin/moderation/listings/${encodeURIComponent(listingId)}/${action}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    },
  )

  const data = await readResponse<AdminModerationActionResponse>(
    response,
    'Unable to complete listing moderation',
  )

  if (!data.listing || typeof data.message !== 'string') {
    throw new Error('The moderation action returned an invalid response.')
  }

  return data
}

/**
 * Retrieve the moderation history for one listing.
 */
export async function getAdminListingModerationHistory(
  listingId: string,
  limit = 25,
  offset = 0,
): Promise<AdminModerationHistoryResponse> {
  const params = new URLSearchParams()

  params.set('limit', String(limit))
  params.set('offset', String(offset))

  const response = await fetch(
    `/api/admin/moderation/listings/${encodeURIComponent(listingId)}/history?${params.toString()}`,
    {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  const data = await readResponse<AdminModerationHistoryResponse>(
    response,
    'Unable to load listing moderation history',
  )

  if (!data.listing || !Array.isArray(data.history) || !data.pagination) {
    throw new Error('The moderation history returned an invalid response.')
  }

  return data
}
