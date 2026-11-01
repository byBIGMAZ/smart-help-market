
import { useCallback, useEffect, useState } from 'react'
import {
  getAdminAutomationStatus,
  updateAdminAutomationControl,
} from './services/adminAutomation'
import type { AdminAutomationStatus } from './services/adminAutomation'
import './AdminAutomation.css'

interface AdminAutomationProps {
  onNotice?: (message: string) => void
}

export default function AdminAutomation({
  onNotice,
}: AdminAutomationProps) {
  const [status, setStatus] = useState<AdminAutomationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await getAdminAutomationStatus()
      setStatus(response.automation)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load automation status.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const runAction = async (
    action: 'enable' | 'pause' | 'resume' | 'emergency-stop',
  ) => {
    if (processing) return

    if (
      (action === 'enable' || action === 'resume') &&
      !status?.workerConfigurationEnabled
    ) {
      setError(
        'The background worker is not configured. Enable its environment setting before starting automation.',
      )
      return
    }

    if (
      (action === 'pause' || action === 'emergency-stop') &&
      !reason.trim()
    ) {
      setError('Please provide a reason for this control action.')
      return
    }

    const labels = {
      enable: 'enable automation',
      pause: 'pause automation',
      resume: 'resume automation',
      'emergency-stop': 'perform an emergency stop',
    }

    const confirmed = window.confirm(
      `Are you sure you want to ${labels[action]}?`,
    )

    if (!confirmed) return

    setProcessing(true)
    setError('')

    try {
      await updateAdminAutomationControl(action, reason.trim())
      setReason('')
      await loadStatus()

      const message = `Automation control action completed: ${labels[action]}.`
      onNotice?.(message)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The automation control action failed.',
      )
    } finally {
      setProcessing(false)
    }
  }

  const workerReady = status?.workerConfigurationEnabled === true
  const automationRunning =
    status?.enabled === true && status?.paused === false

  return (
    <div className="admin-automation">
      <div className="admin-automation-header">
        <div>
          <h2>Automation Control</h2>
          <p>
            Monitor and control the marketplace automation engine.
          </p>
        </div>

        <button
          type="button"
          className="automation-refresh-button"
          onClick={() => void loadStatus()}
          disabled={loading || processing}
        >
          Refresh status
        </button>
      </div>

      {error && (
        <div className="automation-alert automation-alert-error">
          {error}
        </div>
      )}

      {loading && !status ? (
        <div className="automation-loading">
          Loading automation status...
        </div>
      ) : status ? (
        <>
          <div className="automation-status-grid">
            <section className="automation-status-card">
              <span className="automation-card-label">
                Automation status
              </span>
              <strong
                className={
                  automationRunning
                    ? 'automation-status-value status-running'
                    : 'automation-status-value status-stopped'
                }
              >
                {automationRunning ? 'Running' : 'Not running'}
              </strong>
              <p>
                {status.enabled
                  ? status.paused
                    ? 'Automation is enabled but currently paused.'
                    : 'Automation is enabled and not paused.'
                  : 'Automation is currently disabled.'}
              </p>
            </section>

            <section className="automation-status-card">
              <span className="automation-card-label">
                Background worker
              </span>
              <strong
                className={
                  workerReady
                    ? 'automation-status-value status-running'
                    : 'automation-status-value status-warning'
                }
              >
                {workerReady ? 'Configured' : 'Disabled'}
              </strong>
              <p>
                {workerReady
                  ? 'The server is configured to start the background worker.'
                  : 'The background worker environment setting is currently disabled.'}
              </p>
            </section>

            <section className="automation-status-card">
              <span className="automation-card-label">
                Control state
              </span>
              <strong className="automation-status-value">
                {status.paused ? 'Paused' : 'Not paused'}
              </strong>
              <p>
                {status.pauseReason || 'No pause reason recorded.'}
              </p>
            </section>
          </div>

          {!workerReady && (
            <div className="automation-alert automation-alert-warning">
              <strong>Background worker is disabled.</strong>
              <p>
                Automation cannot process events until the worker is
                configured and the backend is restarted. Enable and
                Resume are unavailable while this setting is disabled.
                We are keeping this setting unchanged during testing.
              </p>
            </div>
          )}

          <section className="automation-control-panel">
            <h3>Engine controls</h3>
            <p>
              These controls change the automation engine's database
              control state.
            </p>

            <div className="automation-reason-field">
              <label htmlFor="automation-reason">
                Reason for pause or emergency stop
              </label>
              <textarea
                id="automation-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Enter a reason before pausing or stopping automation..."
                rows={3}
                maxLength={500}
              />
              <small>{reason.length}/500 characters</small>
            </div>

            <div className="automation-actions">
              <button
                type="button"
                className="automation-button button-enable"
                onClick={() => void runAction('enable')}
                disabled={
                  processing ||
                  loading ||
                  !workerReady ||
                  status.enabled
                }
              >
                Enable automation
              </button>

              <button
                type="button"
                className="automation-button button-resume"
                onClick={() => void runAction('resume')}
                disabled={
                  processing ||
                  loading ||
                  !workerReady ||
                  !status.enabled ||
                  !status.paused
                }
              >
                Resume automation
              </button>

              <button
                type="button"
                className="automation-button button-pause"
                onClick={() => void runAction('pause')}
                disabled={
                  processing ||
                  loading ||
                  !reason.trim() ||
                  !status.enabled ||
                  status.paused
                }
              >
                Pause automation
              </button>

              <button
                type="button"
                className="automation-button button-emergency"
                onClick={() => void runAction('emergency-stop')}
                disabled={processing || loading || !reason.trim()}
              >
                Emergency stop
              </button>
            </div>

            {processing && (
              <p className="automation-processing">
                Processing control request...
              </p>
            )}
          </section>

          <section className="automation-information">
            <h3>Control information</h3>
            <div>
              <span>Last updated</span>
              <strong>
                {status.updatedAt
                  ? new Date(status.updatedAt).toLocaleString()
                  : 'Not available'}
              </strong>
            </div>
            <div>
              <span>Last updated by</span>
              <strong>{status.updatedBy ?? 'Not available'}</strong>
            </div>
            <div>
              <span>Current pause reason</span>
              <strong>{status.pauseReason || 'None recorded'}</strong>
            </div>
          </section>
        </>
      ) : (
        <div className="automation-loading">
          No automation status is currently available.
        </div>
      )}
    </div>
  )
}
