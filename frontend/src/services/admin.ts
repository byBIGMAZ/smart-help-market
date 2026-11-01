
export interface AdminUser {
  id: string
  displayName: string
  roles: string[]
}

export interface AdminOverview {
  users: {
    total: number
    active: number
  }
  listings: {
    total: number
    published: number
  }
  categories: {
    total: number
  }
  activeSessions: number
}

async function readResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof data.error === 'string'
        ? data.error
        : `Request failed with HTTP ${response.status}`

    throw new Error(message)
  }

  return data as T
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<AdminUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await readResponse<{
    message: string
    user: AdminUser
  }>(response)

  return data.user
}

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const response = await fetch('/api/auth/me', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  if (response.status === 401) {
    return null
  }

  const data = await readResponse<{
    user: AdminUser
  }>(response)

  return data.user
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const response = await fetch('/api/admin/overview', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  const data = await readResponse<{
    status: string
    overview: AdminOverview
  }>(response)

  return data.overview
}

export async function adminLogout(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  await readResponse<{ message: string }>(response)
}
