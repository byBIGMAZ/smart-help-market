
export interface AdminRolePermission {
  key: string
  name: string
  description: string | null
}

export interface AdminRole {
  id: string
  roleKey: string
  roleName: string
  description: string | null
  userCount: number
  permissions: AdminRolePermission[]
}

export interface AdminRolesResponse {
  status: string
  roles: AdminRole[]
  generatedAt: string
}

export interface CreateAdminRoleInput {
  roleName: string
  description: string
}

export interface AdminPermissionsResponse {
  status: string
  permissions: AdminRolePermission[]
  total: number
}

async function readResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
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

export async function getAdminRoles(): Promise<AdminRolesResponse> {
  const response = await fetch('/api/admin/roles', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  const data = await readResponse(response)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, `Unable to load roles (HTTP ${response.status}).`),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('roles' in data) ||
    !Array.isArray(data.roles)
  ) {
    throw new Error('The role directory returned an invalid response.')
  }

  return data as AdminRolesResponse
}

export async function createAdminRole(
  input: CreateAdminRoleInput,
): Promise<{ message: string; role: AdminRole }> {
  const response = await fetch('/api/admin/roles', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  const data = await readResponse(response)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to create role (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('role' in data) ||
    !('message' in data) ||
    typeof data.message !== 'string'
  ) {
    throw new Error('The server returned an invalid role creation response.')
  }

  return data as { message: string; role: AdminRole }
}

// Retrieve all permissions registered in the database.
export async function getAdminPermissions(): Promise<AdminPermissionsResponse> {
  const response = await fetch('/api/admin/permissions', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  const data = await readResponse(response)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to load permissions (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('permissions' in data) ||
    !Array.isArray(data.permissions)
  ) {
    throw new Error('The permission catalogue returned an invalid response.')
  }

  return data as AdminPermissionsResponse
}

// Save the complete permission selection for a role.
export async function saveAdminRolePermissions(
  roleId: string,
  permissionKeys: string[],
): Promise<{ message: string }> {
  const response = await fetch(
    `/api/admin/roles/${encodeURIComponent(roleId)}/permissions`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ permissionKeys }),
    },
  )

  const data = await readResponse(response)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to save permissions (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('message' in data) ||
    typeof data.message !== 'string'
  ) {
    throw new Error('The server returned an invalid permission response.')
  }

  return { message: data.message }
}
