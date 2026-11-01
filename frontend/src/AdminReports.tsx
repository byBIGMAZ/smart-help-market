
import { useCallback, useEffect, useState } from 'react'
import './AdminReports.css'
import {
  getAdminReports,
  type AdminReportsResponse,
  type ReportGranularity,
} from './services/adminReports'

function getLagosToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getPreviousDate(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() - days)
  return result.toISOString().slice(0, 10)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-NG').format(value)
}

function formatPeriod(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`)

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadReportCsv(report: AdminReportsResponse): void {
  const rows: string[][] = [
    ['Report Section', 'Period or Category', 'Metric', 'Value'],
  ]

  report.growth.forEach((item) => {
    rows.push([
      'Growth',
      item.period,
      'User registrations',
      String(item.registrations),
    ])
    rows.push([
      'Growth',
      item.period,
      'Listings created',
      String(item.listingsCreated),
    ])
  })

  report.moderation.forEach((item) => {
    const actions = [
      ['Approved', item.approved],
      ['Rejected', item.rejected],
      ['Published', item.published],
      ['Unpublished', item.unpublished],
      ['Suspended', item.suspended],
      ['Restored', item.restored],
    ] as const

    actions.forEach(([label, value]) => {
      rows.push([
        'Moderation',
        item.period,
        label,
        String(value),
      ])
    })
  })

  report.categories.forEach((item) => {
    rows.push([
      'Category Performance',
      item.categoryName,
      'Listings created',
      String(item.listingsCreated),
    ])
    rows.push([
      'Category Performance',
      item.categoryName,
      'Unique listings published',
      String(item.listingsPublished),
    ])
  })

  const comparisonMetrics = [
    ['User registrations', report.comparison.usersRegistered],
    ['Listings created', report.comparison.listingsCreated],
    ['Listings published', report.comparison.listingsPublished],
    ['Moderation actions', report.comparison.moderationActions],
  ] as const

  comparisonMetrics.forEach(([label, metric]) => {
    rows.push([
      'Period Comparison',
      `${report.filters.from} to ${report.filters.to}`,
      `${label} current period`,
      String(metric.current),
    ])
    rows.push([
      'Period Comparison',
      `${report.filters.previousFrom} to ${report.filters.previousTo}`,
      `${label} previous period`,
      String(metric.previous),
    ])
  })

  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `smart-help-market-reports-${report.filters.from}-to-${report.filters.to}.csv`

  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}

function GrowthChart({
  data,
}: {
  data: AdminReportsResponse['growth']
}) {
  if (!data.length) {
    return <div className="admin-report-empty">No growth activity for this period.</div>
  }

  const maximum = Math.max(
    1,
    ...data.map((item) =>
      Math.max(item.registrations, item.listingsCreated),
    ),
  )

  const chartWidth = 760
  const chartHeight = 230
  const chartTop = 15
  const chartBottom = 175
  const groupWidth = chartWidth / data.length
  const barWidth = Math.min(22, groupWidth * 0.25)

  return (
    <div className="admin-report-chart-scroll">
      <svg
        className="admin-report-chart"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="User registrations and listing creation over time"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const y = chartTop + ((chartBottom - chartTop) / 4) * step

          return (
            <g key={step}>
              <line
                x1="38"
                y1={y}
                x2="750"
                y2={y}
                className="admin-report-grid-line"
              />
              <text
                x="30"
                y={y + 4}
                textAnchor="end"
                className="admin-report-axis-label"
              >
                {Math.round(maximum * (4 - step) / 4)}
              </text>
            </g>
          )
        })}

        {data.map((item, index) => {
          const center = 45 + groupWidth * index + groupWidth / 2
          const registrationHeight =
            (item.registrations / maximum) * (chartBottom - chartTop)
          const listingHeight =
            (item.listingsCreated / maximum) * (chartBottom - chartTop)

          return (
            <g key={item.period}>
              <rect
                x={center - barWidth - 2}
                y={chartBottom - registrationHeight}
                width={barWidth}
                height={registrationHeight}
                rx="3"
                className="admin-report-bar-users"
              />
              <rect
                x={center + 2}
                y={chartBottom - listingHeight}
                width={barWidth}
                height={listingHeight}
                rx="3"
                className="admin-report-bar-listings"
              />
              <text
                x={center}
                y="200"
                textAnchor="middle"
                className="admin-report-axis-label"
              >
                {formatPeriod(item.period)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function ModerationChart({
  data,
}: {
  data: AdminReportsResponse['moderation']
}) {
  if (!data.length) {
    return <div className="admin-report-empty">No moderation activity for this period.</div>
  }

  const actions = [
    { key: 'approved', label: 'Approved', className: 'approved' },
    { key: 'rejected', label: 'Rejected', className: 'rejected' },
    { key: 'published', label: 'Published', className: 'published' },
    { key: 'unpublished', label: 'Unpublished', className: 'unpublished' },
    { key: 'suspended', label: 'Suspended', className: 'suspended' },
    { key: 'restored', label: 'Restored', className: 'restored' },
  ] as const

  const maximum = Math.max(
    1,
    ...data.map((item) =>
      Math.max(...actions.map((action) => item[action.key])),
    ),
  )

  const chartWidth = 760
  const chartHeight = 230
  const chartTop = 15
  const chartBottom = 175
  const groupWidth = chartWidth / data.length
  const barWidth = Math.min(15, groupWidth * 0.11)
  const totalBarsWidth = actions.length * barWidth + (actions.length - 1) * 3

  return (
    <div className="admin-report-chart-scroll">
      <svg
        className="admin-report-chart"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Moderation actions over time"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const y = chartTop + ((chartBottom - chartTop) / 4) * step

          return (
            <g key={step}>
              <line
                x1="38"
                y1={y}
                x2="750"
                y2={y}
                className="admin-report-grid-line"
              />
              <text
                x="30"
                y={y + 4}
                textAnchor="end"
                className="admin-report-axis-label"
              >
                {Math.round(maximum * (4 - step) / 4)}
              </text>
            </g>
          )
        })}

        {data.map((item, index) => {
          const center = 45 + groupWidth * index + groupWidth / 2
          const startX = center - totalBarsWidth / 2

          return (
            <g key={item.period}>
              {actions.map((action, actionIndex) => {
                const value = item[action.key]
                const height =
                  (value / maximum) * (chartBottom - chartTop)

                return (
                  <rect
                    key={action.key}
                    x={startX + actionIndex * (barWidth + 3)}
                    y={chartBottom - height}
                    width={barWidth}
                    height={height}
                    rx="2"
                    className={`admin-report-bar-${action.className}`}
                  />
                )
              })}

              <text
                x={center}
                y="200"
                textAnchor="middle"
                className="admin-report-axis-label"
              >
                {formatPeriod(item.period)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function CategoryChart({
  data,
}: {
  data: AdminReportsResponse['categories']
}) {
  if (!data.length) {
    return <div className="admin-report-empty">No category data available.</div>
  }

  const maximum = Math.max(
    1,
    ...data.map((item) =>
      Math.max(item.listingsCreated, item.listingsPublished),
    ),
  )

  return (
    <div className="admin-report-category-chart">
      {data.map((item) => (
        <div className="admin-report-category-row" key={item.categoryKey}>
          <div className="admin-report-category-name">
            {item.categoryName}
          </div>

          <div className="admin-report-category-bars">
            <div className="admin-report-category-track">
              <div
                className="admin-report-category-created"
                style={{
                  width: `${(item.listingsCreated / maximum) * 100}%`,
                }}
              />
            </div>

            <div className="admin-report-category-track">
              <div
                className="admin-report-category-published"
                style={{
                  width: `${(item.listingsPublished / maximum) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="admin-report-category-values">
            <span>{formatNumber(item.listingsCreated)}</span>
            <span>{formatNumber(item.listingsPublished)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ComparisonCard({
  title,
  metric,
}: {
  title: string
  metric: {
    current: number
    previous: number
    percentageChange: number | null
  }
}) {
  const change = metric.percentageChange

  return (
    <article className="admin-report-comparison-card">
      <div className="admin-report-card-title">{title}</div>

      <div className="admin-report-current-value">
        {formatNumber(metric.current)}
      </div>

      <div className="admin-report-card-previous">
        Previous period: {formatNumber(metric.previous)}
      </div>

      <div
        className={`admin-report-change ${
          change === null
            ? 'neutral'
            : change > 0
              ? 'positive'
              : change < 0
                ? 'negative'
                : 'neutral'
        }`}
      >
        {change === null
          ? 'N/A · No previous baseline'
          : `${change > 0 ? '+' : ''}${change}%`}
      </div>
    </article>
  )
}

export default function AdminReports() {
  const today = getLagosToday()

  const [from, setFrom] = useState(getPreviousDate(today, 29))
  const [to, setTo] = useState(today)
  const [granularity, setGranularity] =
    useState<ReportGranularity>('day')

  const [report, setReport] =
    useState<AdminReportsResponse | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError('')
    setNotice('')

    try {
      const result = await getAdminReports({
        from,
        to,
        granularity,
      })

      setReport(result)
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Reports could not be loaded.',
      )
    } finally {
      setLoading(false)
    }
  }, [from, to, granularity])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const handleExport = () => {
    if (!report) return

    downloadReportCsv(report)
    setNotice('Report CSV export started.')
  }

  return (
    <section className="admin-reports-section">
      <div className="admin-section-heading">
        <div>
          <h2>Reports &amp; Analytics</h2>
          <p className="admin-users-description">
            Monitor marketplace growth, moderation activity and category performance.
          </p>
        </div>

        <button
          type="button"
          className="admin-secondary-button"
          onClick={loadReports}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh reports'}
        </button>
      </div>

      <div className="admin-report-filter-panel">
        <div className="admin-report-filter-field">
          <label htmlFor="admin-report-from">Start date</label>
          <input
            id="admin-report-from"
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>

        <div className="admin-report-filter-field">
          <label htmlFor="admin-report-to">End date</label>
          <input
            id="admin-report-to"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>

        <div className="admin-report-filter-field">
          <label htmlFor="admin-report-granularity">Group results by</label>
          <select
            id="admin-report-granularity"
            value={granularity}
            onChange={(event) =>
              setGranularity(
                event.target.value as ReportGranularity,
              )
            }
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>

        <button
          type="button"
          className="admin-primary-button"
          onClick={loadReports}
          disabled={loading || !from || !to || from > to}
        >
          Apply filters
        </button>

        <button
          type="button"
          className="admin-secondary-button"
          onClick={handleExport}
          disabled={!report || loading}
        >
          Export CSV
        </button>
      </div>

      {report && (
        <div className="admin-report-period-note">
          Reporting period: <strong>{report.filters.from}</strong> to{' '}
          <strong>{report.filters.to}</strong>
          {' · '}
          Comparison period: <strong>{report.filters.previousFrom}</strong>{' '}
          to <strong>{report.filters.previousTo}</strong>
          {' · '}
          Timezone: {report.filters.timezone}
        </div>
      )}

      {notice && (
        <div className="admin-message" role="status">
          {notice}
        </div>
      )}

      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}

      {loading && !report && (
        <div className="admin-empty-panel">
          Loading operational reports...
        </div>
      )}

      {report && (
        <>
          <div className="admin-report-section-heading">
            <h3>Period comparison</h3>
            <p>Current period compared with the preceding equal period.</p>
          </div>

          <div className="admin-report-comparison-grid">
            <ComparisonCard
              title="New user registrations"
              metric={report.comparison.usersRegistered}
            />

            <ComparisonCard
              title="Listings created"
              metric={report.comparison.listingsCreated}
            />

            <ComparisonCard
              title="Listings published"
              metric={report.comparison.listingsPublished}
            />

            <ComparisonCard
              title="Moderation actions"
              metric={report.comparison.moderationActions}
            />
          </div>

          <div className="admin-report-section-heading">
            <h3>Marketplace growth</h3>
            <p>Daily, weekly or monthly user registrations and listing creation.</p>
          </div>

          <article className="admin-report-panel">
            <div className="admin-report-panel-heading">
              <h3>Growth trends</h3>
              <div className="admin-report-legend">
                <span>
                  <i className="admin-report-legend-users" />
                  User registrations
                </span>
                <span>
                  <i className="admin-report-legend-listings" />
                  Listings created
                </span>
              </div>
            </div>

            <GrowthChart data={report.growth} />
          </article>

          <div className="admin-report-section-heading">
            <h3>Moderation activity</h3>
            <p>Track the actions performed on marketplace listings.</p>
          </div>

          <article className="admin-report-panel">
            <div className="admin-report-panel-heading">
              <h3>Moderation trends</h3>
              <div className="admin-report-legend admin-report-legend-wrap">
                {[
                  ['approved', 'Approved'],
                  ['rejected', 'Rejected'],
                  ['published', 'Published'],
                  ['unpublished', 'Unpublished'],
                  ['suspended', 'Suspended'],
                  ['restored', 'Restored'],
                ].map(([key, label]) => (
                  <span key={key}>
                    <i className={`admin-report-legend-${key}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <ModerationChart data={report.moderation} />
          </article>

          <div className="admin-report-section-heading">
            <h3>Category performance</h3>
            <p>Compare unique listings created and published during the selected period.</p>
          </div>

          <article className="admin-report-panel">
            <div className="admin-report-panel-heading">
              <h3>Category activity</h3>
              <div className="admin-report-legend">
                <span>
                  <i className="admin-report-legend-users" />
                  Listings created
                </span>
                <span>
                  <i className="admin-report-legend-listings" />
                  Unique listings published
                </span>
              </div>
            </div>

            <CategoryChart data={report.categories} />
          </article>

          <p className="admin-report-footer-note">
            All report dates use Africa/Lagos time. Demonstration listings
            are excluded from growth and category performance figures.
          </p>
        </>
      )}
    </section>
  )
}
