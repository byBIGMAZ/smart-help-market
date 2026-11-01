
import { useCallback, useEffect, useState } from 'react'
import {
  getAutomationMonitoring,
} from './services/adminAutomationMonitoring'
import type {
  AutomationExecution,
  AutomationMonitoringResponse,
} from './services/adminAutomationMonitoring'
import './AdminAutomationMonitoring.css'

function formatDate(value: string | null) {
  if (!value) return 'Not completed'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Invalid date'

  return date.toLocaleString()
}

function StatusBadge({ status }: { status: string }) {
  const allowed = ['succeeded', 'failed', 'skipped', 'running']
  const safeStatus = allowed.includes(status) ? status : 'unknown'

  return (
    <span className={`automation-monitor-status ${safeStatus}`}>
      {safeStatus}
    </span>
  )
}

function ExecutionDetails({
  execution,
}: {
  execution: AutomationExecution
}) {
  return (
    <div className="automation-monitor-details">
      <div className="automation-monitor-detail-grid">
        <div>
          <span>Execution ID</span>
          <strong>{execution.executionId}</strong>
        </div>
        <div>
          <span>Event ID</span>
          <strong>{execution.eventId}</strong>
        </div>
        <div>
          <span>Rule ID</span>
          <strong>{execution.ruleId ?? 'No rule reference'}</strong>
        </div>
        <div>
          <span>Rule key</span>
          <strong>{execution.ruleKey ?? 'Unavailable'}</strong>
        </div>
        <div>
          <span>Event aggregate</span>
          <strong>
            {execution.aggregateType || 'N/A'}
            {execution.aggregateId
              ? ` / ${execution.aggregateId}`
              : ''}
          </strong>
        </div>
        <div>
          <span>Event status</span>
          <strong>{execution.eventStatus}</strong>
        </div>
        <div>
          <span>Event attempts</span>
          <strong>
            {execution.eventAttempts} / {execution.eventMaxAttempts}
          </strong>
        </div>
        <div>
          <span>Attempt number</span>
          <strong>{execution.attemptNumber}</strong>
        </div>
      </div>

      <div className="automation-monitor-detail-times">
        <div>
          <span>Started</span>
          <strong>{formatDate(execution.startedAt)}</strong>
        </div>
        <div>
          <span>Finished</span>
          <strong>{formatDate(execution.finishedAt)}</strong>
        </div>
        <div>
          <span>Recorded</span>
          <strong>{formatDate(execution.createdAt)}</strong>
        </div>
      </div>

      {execution.errorMessage && (
        <div className="automation-monitor-error-detail">
          <strong>Execution error</strong>
          <pre>{execution.errorMessage}</pre>
        </div>
      )}

      {execution.eventLastError && (
        <div className="automation-monitor-error-detail">
          <strong>Last event error</strong>
          <pre>{execution.eventLastError}</pre>
        </div>
      )}

      <div className="automation-monitor-output">
        <strong>Execution output</strong>
        <pre>
          {JSON.stringify(execution.output ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export default function AdminAutomationMonitoring() {
  const [data, setData] =
    useState<AutomationMonitoringResponse | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [status, setStatus] = useState('')
  const [eventType, setEventType] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await getAutomationMonitoring({
        page,
        pageSize,
        status,
        eventType,
      })

      setData(result)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load automation monitoring data.',
      )
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, status, eventType])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function applyStatus(value: string) {
    setStatus(value)
    setPage(1)
    setExpandedId(null)
  }

  function applyEventType(value: string) {
    setEventType(value)
    setPage(1)
    setExpandedId(null)
  }

  function changePageSize(value: number) {
    setPageSize(value)
    setPage(1)
    setExpandedId(null)
  }

  const summary = data?.summary

  const statCards = [
    {
      label: 'Events received',
      value: summary?.totalEvents ?? 0,
      detail: 'All recorded automation events',
    },
    {
      label: 'Pending events',
      value: summary?.pendingEvents ?? 0,
      detail: 'Waiting to be processed',
    },
    {
      label: 'Successful executions',
      value: summary?.successfulExecutions ?? 0,
      detail: 'Completed successfully',
    },
    {
      label: 'Failed executions',
      value: summary?.failedExecutions ?? 0,
      detail: 'Execution failures',
    },
    {
      label: 'Processing events',
      value: summary?.processingEvents ?? 0,
      detail: 'Currently marked processing',
    },
    {
      label: 'Skipped executions',
      value: summary?.skippedExecutions ?? 0,
      detail: 'Rules not executed',
    },
  ]

  return (
    <section className="automation-monitor">
      <header className="automation-monitor-header">
        <div>
          <h2>Automation Monitoring</h2>
          <p>
            Monitor marketplace automation events, execution outcomes
            and failure records.
          </p>
        </div>

        <button
          type="button"
          className="automation-monitor-refresh"
          onClick={() => void loadData()}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="automation-monitor-error" role="alert">
          {error}
        </div>
      )}

      <div className="automation-monitor-stats">
        {statCards.map(card => (
          <article
            className="automation-monitor-stat"
            key={card.label}
          >
            <span>{card.label}</span>
            <strong>{card.value.toLocaleString()}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </div>

      <div className="automation-monitor-secondary-stats">
        <div>
          <span>Total executions</span>
          <strong>{summary?.totalExecutions ?? 0}</strong>
        </div>
        <div>
          <span>Failed events</span>
          <strong>{summary?.failedEvents ?? 0}</strong>
        </div>
        <div>
          <span>Processed events</span>
          <strong>{summary?.processedEvents ?? 0}</strong>
        </div>
        <div>
          <span>Running executions</span>
          <strong>{summary?.runningExecutions ?? 0}</strong>
        </div>
      </div>

      <div className="automation-monitor-history">
        <div className="automation-monitor-history-heading">
          <div>
            <h3>Execution history</h3>
            <p>
              Review recorded attempts and inspect their results.
            </p>
          </div>

          {data && (
            <span>
              {data.pagination.total.toLocaleString()} records
            </span>
          )}
        </div>

        <div className="automation-monitor-filters">
          <label>
            Execution status
            <select
              value={status}
              onChange={event => applyStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </label>

          <label>
            Event type
            <input
              type="text"
              value={eventType}
              onChange={event => applyEventType(event.target.value)}
              maxLength={100}
              placeholder="e.g. listing.created"
            />
          </label>

          <label>
            Records per page
            <select
              value={pageSize}
              onChange={event =>
                changePageSize(Number(event.target.value))
              }
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="automation-monitor-empty">
            Loading execution history...
          </div>
        ) : !data || data.executions.length === 0 ? (
          <div className="automation-monitor-empty">
            <strong>No execution records found</strong>
            <p>
              Execution records will appear here when automation
              rules are processed.
            </p>
          </div>
        ) : (
          <div className="automation-monitor-table-wrap">
            <table className="automation-monitor-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Rule</th>
                  <th>Attempt</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.executions.map(execution => (
                  <>
                    <tr key={execution.executionId}>
                      <td>
                        <strong>{execution.eventType}</strong>
                        <small>Event #{execution.eventId}</small>
                      </td>
                      <td>
                        {execution.ruleName || 'Unavailable'}
                        {execution.ruleKey && (
                          <small>{execution.ruleKey}</small>
                        )}
                      </td>
                      <td>{execution.attemptNumber}</td>
                      <td>
                        <StatusBadge
                          status={execution.executionStatus}
                        />
                      </td>
                      <td>{formatDate(execution.startedAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="automation-monitor-detail-button"
                          onClick={() =>
                            setExpandedId(
                              expandedId === execution.executionId
                                ? null
                                : execution.executionId,
                            )
                          }
                        >
                          {expandedId === execution.executionId
                            ? 'Hide'
                            : 'View'}
                        </button>
                      </td>
                    </tr>

                    {expandedId === execution.executionId && (
                      <tr
                        key={`${execution.executionId}-details`}
                      >
                        <td colSpan={6}>
                          <ExecutionDetails execution={execution} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pagination.totalPages > 0 && (
          <div className="automation-monitor-pagination">
            <span>
              Page {data.pagination.page} of {data.pagination.totalPages}
            </span>

            <div>
              <button
                type="button"
                onClick={() => setPage(previous => Math.max(1, previous - 1))}
                disabled={!data.pagination.hasPreviousPage || loading}
              >
                Previous
              </button>

              <button
                type="button"
                onClick={() => setPage(previous => previous + 1)}
                disabled={!data.pagination.hasNextPage || loading}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {data && (
          <p className="automation-monitor-generated">
            Last updated: {formatDate(data.generatedAt)}
          </p>
        )}
      </div>
    </section>
  )
}
