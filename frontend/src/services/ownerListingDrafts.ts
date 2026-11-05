export interface OwnerListingDraftInput {
  categoryKey: string
  details: {
    version: 1
    kind: 'properties' | 'products' | 'services'
    values: Record<string, string>
    units: Array<{
      id: string
      name: string
      rent: string
      bedrooms: string
      bathrooms: string
      description: string
    }>
  }
}

export interface SavedOwnerListingDraft {
  id: string
  key: string
  status: 'draft'
  categoryKey: string
  createdAt?: string
  updatedAt?: string
}

interface SaveDraftResponse {
  status: string
  message?: string
  listing?: SavedOwnerListingDraft
  error?: string
}

async function saveRequest(
  url: string,
  method: 'POST' | 'PATCH',
  input: OwnerListingDraftInput,
): Promise<SavedOwnerListingDraft> {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  const data = await response.json().catch(() => null) as SaveDraftResponse | null
  if (!response.ok) {
    throw new Error(
      data?.error ||
      (response.status === 401
        ? 'Sign in to save this draft to your marketplace account.'
        : 'The marketplace could not save this listing draft.'),
    )
  }

  if (!data || data.status !== 'ok' || !data.listing?.id || !data.listing.key) {
    throw new Error('The marketplace returned an invalid draft response.')
  }

  return data.listing
}

export async function createOwnerListingDraft(
  input: OwnerListingDraftInput,
): Promise<SavedOwnerListingDraft> {
  return saveRequest('/api/listings/owner', 'POST', input)
}

export async function updateOwnerListingDraft(
  listingId: string,
  input: OwnerListingDraftInput,
): Promise<SavedOwnerListingDraft> {
  if (!/^[1-9]\d*$/.test(listingId)) {
    throw new Error('A valid listing ID is required.')
  }
  return saveRequest(
    `/api/listings/owner/${encodeURIComponent(listingId)}`,
    'PATCH',
    input,
  )
}


export interface OwnerListingSubmissionResult {
  status: string
  submitted?: boolean
  paymentRequired?: boolean
  reference?: string
  amountMinor?: number
  currencyCode?: string
  authorizationUrl?: string
  message?: string
}

interface OwnerListingSubmissionResponse extends OwnerListingSubmissionResult {
  error?: string
}

async function ownerListingAction(
  listingId: string,
  action: 'submit' | 'verify-payment',
  reference?: string,
): Promise<OwnerListingSubmissionResult> {
  if (!/^[1-9]\d*$/.test(listingId)) {
    throw new Error('A valid listing ID is required.')
  }

  const response = await fetch(
    `/api/listings/owner/${encodeURIComponent(listingId)}/${action === 'submit' ? 'submit' : 'verify-payment'}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action === 'verify-payment' ? { reference } : {}),
    },
  )

  const data = await response.json().catch(() => null) as OwnerListingSubmissionResponse | null
  if (!response.ok || !data || data.status !== 'ok') {
    throw new Error(data?.error || 'The marketplace could not complete this listing action.')
  }
  return data
}

export function submitOwnerListingForReview(listingId: string) {
  return ownerListingAction(listingId, 'submit')
}

export function verifyOwnerListingFeePayment(listingId: string, reference: string) {
  return ownerListingAction(listingId, 'verify-payment', reference)
}
