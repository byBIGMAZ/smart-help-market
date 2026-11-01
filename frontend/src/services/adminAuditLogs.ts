
export interface AdminAuditLog {
  id: string
  actorUserId: string | null
  actorDisplayName: string
  actorEmail: string | null
  actionKey: string
  targetType: string
  targetId: string
  details: Record<string, unknown>
  createdAt: string
}

export interface AdminAuditLogFilters {
  search?: string
  action?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export interface AdminAuditLogsResponse {
  status: string
  auditLogs: AdminAuditLog[]
  availableActions: string[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  generatedAt: string
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

export async function getAdminAuditLogs(
  filters: AdminAuditLogFilters = {},
): Promise<AdminAuditLogsResponse> {
  const params = new URLSearchParams()

  params.set('limit', String(filters.limit ?? 25))
  params.set('offset', String(filters.offset ?? 0))

  if (filters.search?.trim()) {
    params.set('search', filters.search.trim())
  }

  if (filters.action) {
    params.set('action', filters.action)
  }

  if (filters.startDate) {
    params.set('startDate', filters.startDate)
  }

  if (filters.endDate) {
    params.set('endDate', filters.endDate)
  }

  const response = await fetch(
    `/api/admin/audit-logs?${params.toString()}`,
    {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  return readResponse<AdminAuditLogsResponse>(response)
}
