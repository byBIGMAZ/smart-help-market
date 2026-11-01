export interface AdminAutomationStatus {
  enabled: boolean
  paused: boolean
  active: boolean
  pauseReason: string
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  workerConfigurationEnabled: boolean
}

export interface AdminAutomationResponse {
  status: 'ok'
  automation: AdminAutomationStatus
  generatedAt: string
}

export type AdminAutomationAction =
  | 'enable'
  | 'pause'
  | 'resume'
  | 'emergency-stop'

export interface AdminAutomationControlResponse {
  status: 'ok'
  message: string
  automation: Omit<
    AdminAutomationStatus,
    'workerConfigurationEnabled'
  >
}

async function parseResponse<T>(
  response: Response,
): Promise<T> {
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.error || 'Automation request could not be completed.',
    )
  }

  if (!data || data.status !== 'ok') {
    throw new Error(
      'The automation server returned an invalid response.',
    )
  }

  return data as T
}

/**
 * Retrieves the global automation status.
 */
export async function getAdminAutomationStatus():
Promise<AdminAutomationResponse> {
  const response = await fetch('/api/admin/automation', {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  })

  const data =
    await parseResponse<AdminAutomationResponse>(response)

  if (
    !data.automation ||
    typeof data.automation.enabled !== 'boolean' ||
    typeof data.automation.paused !== 'boolean' ||
    typeof data.automation.active !== 'boolean' ||
    typeof data.automation.workerConfigurationEnabled !== 'boolean'
  ) {
    throw new Error(
      'The automation server returned an invalid status.',
    )
  }

  return data
}

/**
 * Changes the global automation control state.
 */
export async function updateAdminAutomationControl(
  action: AdminAutomationAction,
  reason = '',
): Promise<AdminAutomationControlResponse> {
  const response = await fetch(
    `/api/admin/automation/control/${action}`,
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

  const data =
    await parseResponse<AdminAutomationControlResponse>(response)

  if (
    !data.automation ||
    typeof data.automation.enabled !== 'boolean' ||
    typeof data.automation.paused !== 'boolean' ||
    typeof data.automation.active !== 'boolean'
  ) {
    throw new Error(
      'The automation server returned an invalid control response.',
    )
  }

  return data
}