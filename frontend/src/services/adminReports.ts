
export type ReportGranularity = 'day' | 'week' | 'month'

export interface AdminReportFilters {
  from: string
  to: string
  previousFrom: string
  previousTo: string
  granularity: ReportGranularity
  timezone: string
}

export interface ReportComparisonMetric {
  current: number
  previous: number
  percentageChange: number | null
}

export interface AdminReportComparison {
  usersRegistered: ReportComparisonMetric
  listingsCreated: ReportComparisonMetric
  listingsPublished: ReportComparisonMetric
  moderationActions: ReportComparisonMetric
}

export interface AdminGrowthEntry {
  period: string
  registrations: number
  listingsCreated: number
}

export interface AdminModerationTrendEntry {
  period: string
  approved: number
  rejected: number
  published: number
  unpublished: number
  suspended: number
  restored: number
}

export interface AdminCategoryPerformance {
  categoryKey: string
  categoryName: string
  listingsCreated: number
  listingsPublished: number
}

export interface AdminReportsResponse {
  status: 'ok'
  filters: AdminReportFilters
  comparison: AdminReportComparison
  growth: AdminGrowthEntry[]
  moderation: AdminModerationTrendEntry[]
  categories: AdminCategoryPerformance[]
}

export interface AdminReportQuery {
  from?: string
  to?: string
  granularity?: ReportGranularity
}

export async function getAdminReports(
  filters: AdminReportQuery = {},
): Promise<AdminReportsResponse> {
  const params = new URLSearchParams()

  if (filters.from) {
    params.set('from', filters.from)
  }

  if (filters.to) {
    params.set('to', filters.to)
  }

  if (filters.granularity) {
    params.set('granularity', filters.granularity)
  }

  const query = params.toString()

  const response = await fetch(
    `/api/admin/reports${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.error || 'Operational reports could not be loaded.',
    )
  }

  if (
    !data ||
    data.status !== 'ok' ||
    !data.filters ||
    !data.comparison ||
    !Array.isArray(data.growth) ||
    !Array.isArray(data.moderation) ||
    !Array.isArray(data.categories)
  ) {
    throw new Error('The reports server returned an invalid response.')
  }

  return data as AdminReportsResponse
}
