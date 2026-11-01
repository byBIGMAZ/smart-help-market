
export interface AdminPlatformSetting {
  key: string
  value: unknown
  group: string
  description: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminSettingsResponse {
  status: string
  settings: AdminPlatformSetting[]
  total: number
  generatedAt: string
}

export interface UpdateAdminSettingResponse {
  status: string
  message: string
  setting: AdminPlatformSetting
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

/**
 * Load all platform settings through the protected admin API.
 * Requires settings.view permission.
 */
export async function getAdminSettings(): Promise<AdminSettingsResponse> {
  const response = await fetch('/api/admin/settings', {
    method: 'GET',
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
        `Unable to load platform settings (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('settings' in data) ||
    !Array.isArray(data.settings)
  ) {
    throw new Error(
      'The platform settings endpoint returned an invalid response.',
    )
  }

  return data as AdminSettingsResponse
}

/**
 * Update an existing setting value.
 * Requires settings.manage permission.
 */
export async function updateAdminSetting(
  settingKey: string,
  value: unknown,
): Promise<UpdateAdminSettingResponse> {
  const response = await fetch(
    `/api/admin/settings/${encodeURIComponent(settingKey)}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    },
  )

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to update platform setting (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('setting' in data) ||
    !('message' in data) ||
    typeof data.message !== 'string'
  ) {
    throw new Error(
      'The platform settings endpoint returned an invalid update response.',
    )
  }

  return data as UpdateAdminSettingResponse
}
