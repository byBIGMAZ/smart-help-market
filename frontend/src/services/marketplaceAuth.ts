export interface MarketplaceUser {
  id: string
  email: string
  displayName: string
  roles: string[]
  permissions: string[]
  avatarUrl?: string | null
}

interface AuthResponse {
  message?: string
  authenticated?: boolean
  user?: MarketplaceUser
  error?: string
}

async function readAuthResponse(
  response: Response,
): Promise<AuthResponse> {
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof data.error === 'string'
        ? data.error
        : `Authentication request failed (${response.status}).`

    throw new Error(message)
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('The authentication server returned an invalid response.')
  }

  return data as AuthResponse
}

export async function marketplaceLogin(
  email: string,
  password: string,
): Promise<MarketplaceUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email.trim(), password }),
  })

  const data = await readAuthResponse(response)

  if (!data.user) {
    throw new Error('The server did not return an authenticated user.')
  }

  return {
    ...data.user,
    email: data.user.email || email.trim(),
    permissions: data.user.permissions || [],
  }
}

export async function getMarketplaceUser(): Promise<MarketplaceUser | null> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  })

  if (response.status === 401) {
    return null
  }

  const data = await readAuthResponse(response)

  if (!data.authenticated || !data.user) {
    return null
  }

  return data.user
}

export async function marketplaceLogout(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  })

  await readAuthResponse(response)
}
