import type { MarketplaceUser } from './marketplaceAuth'

export type MarketplaceAccountType =
  | 'buyer'
  | 'landlord'
  | 'seller'
  | 'service_provider'
  | 'agent'

export interface MarketplaceRegistrationInput {
  displayName: string
  email: string
  password: string
  accountType: MarketplaceAccountType
}

interface RegistrationResponse {
  message?: string
  authenticated?: boolean
  user?: MarketplaceUser & {
    accountType: MarketplaceAccountType
    verificationStatus: 'not_required' | 'pending'
  }
  error?: string
}

export async function marketplaceRegister(
  input: MarketplaceRegistrationInput,
): Promise<NonNullable<RegistrationResponse['user']>> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      displayName: input.displayName.trim(),
      email: input.email.trim(),
      password: input.password,
      accountType: input.accountType,
    }),
  })

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof data.error === 'string'
        ? data.error
        : `Registration failed (${response.status}). Please try again.`

    throw new Error(message)
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('user' in data) ||
    typeof data.user !== 'object' ||
    data.user === null
  ) {
    throw new Error('The registration server returned an invalid response.')
  }

  return data.user as NonNullable<RegistrationResponse['user']>
}
