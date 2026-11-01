
export type AccountStatus = 'active' | 'suspended' | 'disabled'

export interface AdminManagedUser {
  id: string
  displayName: string
  email: string
  accountStatus: AccountStatus
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
  roles: string[]
}

export interface AdminUsersResponse {
  status: string
  users: AdminManagedUser[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface AdminUsersQuery {
  search?: string
  status?: 'all' | AccountStatus
  limit?: number
  offset?: number
}

export interface AdminAssignedRole {
  id: string
  roleKey: string
  roleName: string
}

export interface UpdateAdminUserRolesResponse {
  status: string
  message: string
  user: {
    id: string
    displayName: string
    roles: AdminAssignedRole[]
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

export async function getAdminUsers(
  query: AdminUsersQuery = {},
): Promise<AdminUsersResponse> {
  const params = new URLSearchParams()

  if (query.search?.trim()) {
    params.set('search', query.search.trim())
  }

  params.set('status', query.status ?? 'all')
  params.set('limit', String(query.limit ?? 25))
  params.set('offset', String(query.offset ?? 0))

  const response = await fetch(`/api/admin/users?${params.toString()}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  })

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to load users (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('users' in data) ||
    !Array.isArray(data.users) ||
    !('pagination' in data)
  ) {
    throw new Error('The user directory returned an invalid response.')
  }

  return data as AdminUsersResponse
}

export async function changeAdminUserStatus(
  userId: string,
  action: 'suspend' | 'reactivate',
): Promise<{
  status: string
  message: string
  user: { id: string; accountStatus: AccountStatus }
}> {
  const response = await fetch(
    `/api/admin/users/${encodeURIComponent(userId)}/status`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    },
  )

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to change account status (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('user' in data) ||
    typeof data.user !== 'object' ||
    data.user === null ||
    !('accountStatus' in data.user) ||
    !('message' in data) ||
    typeof data.message !== 'string'
  ) {
    throw new Error('The account-status endpoint returned an invalid response.')
  }

  return data as {
    status: string
    message: string
    user: { id: string; accountStatus: AccountStatus }
  }
}

/**
 * Replace all roles assigned to a marketplace user.
 */
export async function updateAdminUserRoles(
  userId: string,
  roleIds: string[],
): Promise<UpdateAdminUserRolesResponse> {
  const response = await fetch(
    `/api/admin/users/${encodeURIComponent(userId)}/roles`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roleIds }),
    },
  )

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to update user roles (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('user' in data) ||
    typeof data.user !== 'object' ||
    data.user === null ||
    !('roles' in data.user) ||
    !Array.isArray(data.user.roles) ||
    !('message' in data) ||
    typeof data.message !== 'string'
  ) {
    throw new Error('The user-role endpoint returned an invalid response.')
  }

  return data as UpdateAdminUserRolesResponse
}
