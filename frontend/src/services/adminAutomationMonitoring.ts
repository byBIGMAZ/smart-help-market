
export interface AutomationMonitoringSummary {
  totalEvents: number
  pendingEvents: number
  processingEvents: number
  processedEvents: number
  failedEvents: number
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  skippedExecutions: number
  runningExecutions: number
}

export interface AutomationExecution {
  executionId: string
  eventId: string
  ruleId: string | null
  ruleName: string | null
  ruleKey: string | null
  eventType: string
  aggregateType: string
  aggregateId: string
  eventStatus: string
  eventAttempts: number
  eventMaxAttempts: number
  eventLastError: string
  attemptNumber: number
  executionStatus: 'running' | 'succeeded' | 'failed' | 'skipped'
  output: Record<string, unknown>
  errorMessage: string
  startedAt: string
  finishedAt: string | null
  createdAt: string
}

export interface AutomationMonitoringPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface AutomationMonitoringResponse {
  status: 'ok'
  summary: AutomationMonitoringSummary
  pagination: AutomationMonitoringPagination
  filters: {
    status: string | null
    eventType: string
  }
  executions: AutomationExecution[]
  generatedAt: string
}

export interface AutomationMonitoringFilters {
  page?: number
  pageSize?: number
  status?: string
  eventType?: string
}

export async function getAutomationMonitoring(
  filters: AutomationMonitoringFilters = {},
): Promise<AutomationMonitoringResponse> {
  const params = new URLSearchParams()

  if (filters.page) {
    params.set('page', String(filters.page))
  }

  if (filters.pageSize) {
    params.set('pageSize', String(filters.pageSize))
  }

  if (filters.status) {
    params.set('status', filters.status)
  }

  if (filters.eventType?.trim()) {
    params.set('eventType', filters.eventType.trim())
  }

  const query = params.toString()

  const response = await fetch(
    `/api/admin/automation/monitoring${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      credentials: 'include',
    },
  )

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.error ||
      'Automation monitoring data could not be retrieved.',
    )
  }

  if (
    !data ||
    data.status !== 'ok' ||
    !data.summary ||
    !data.pagination ||
    !Array.isArray(data.executions)
  ) {
    throw new Error('Invalid automation monitoring response.')
  }

  return data as AutomationMonitoringResponse
}
