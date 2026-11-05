import { useCallback, useEffect, useMemo, useState } from 'react'
import './AdminProfileApprovals.css'

type ReviewStatus = 'pending' | 'approved' | 'rejected'
type ApprovalView = 'queue' | 'history'

interface VerificationRequest {
  id: string
  displayName: string
  email: string
  accountType: string
  status: ReviewStatus
  submittedAt?: string
  reviewedAt?: string
  reviewer?: string | null
  reason?: string
}

function formatDate(value?: string) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

function accountTypeLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

async function readResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `Request failed (HTTP ${response.status}).`
    throw new Error(message)
  }
  return data as T
}

async function loadRequests(view: ApprovalView): Promise<VerificationRequest[]> {
  const response = await fetch(`/api/admin/profile-approvals?view=${view === 'history' ? 'history' : 'pending'}&limit=100`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await readResponse<{ requests: VerificationRequest[] }>(response)
  return Array.isArray(data.requests) ? data.requests : []
}

export default function AdminProfileApprovals() {
  const [view, setView] = useState<ApprovalView>('queue')
  const [requests, setRequests] = useState<VerificationRequest[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async (targetView: ApprovalView = view) => {
    setLoading(true)
    setError('')
    try {
      const next = await loadRequests(targetView)
      setRequests(next)
      setSelectedId((current) => next.some((item) => item.id === current) ? current : next[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account verification records could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [view])

  useEffect(() => {
    void refresh(view)
  }, [refresh, view])

  const selected = requests.find((item) => item.id === selectedId) || requests[0]
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return requests
    return requests.filter((item) =>
      [item.id, item.displayName, item.email, item.accountType, item.status]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [requests, query])

  async function decide(decision: Exclude<ReviewStatus, 'pending'>) {
    if (!selected || selected.status !== 'pending' || saving) return
    if (reason.trim().length < 8) {
      setError('Enter a clear verification review reason of at least 8 characters.')
      setNotice('')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/admin/profile-approvals/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision, reason: reason.trim() }),
      })
      const result = await readResponse<{ message: string }>(response)
      setNotice(result.message || 'Verification decision saved.')
      setReason('')
      await refresh('queue')
      setView('history')
      await refresh('history')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The verification decision could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-profile-approvals">
      <div className="admin-section-heading profile-approval-heading">
        <div>
          <span className="admin-kicker">ACCOUNT INTEGRITY</span>
          <h2>Account Verification Centre</h2>
          <p>Review marketplace account verification requests using live registration records. Decisions are saved to the database and recorded in the audit log.</p>
        </div>
        <button type="button" className="admin-secondary-button" onClick={() => void refresh()} disabled={loading || saving}>↻ Refresh</button>
      </div>

      <div className="profile-approval-notice" role="note">
        <strong>Verification workflow</strong>
        <span>This queue uses the account verification status created during registration. Identity documents are not currently collected by the platform, so review decisions must be based only on evidence obtained through an approved verification process. Do not approve an account without completing that process.</span>
      </div>

      <div className="profile-approval-stats">
        <article><span>{view === 'queue' ? 'Awaiting review' : 'Reviewed records'}</span><strong>{requests.length}</strong><small>{view === 'queue' ? 'Live accounts awaiting verification' : 'Database-backed decisions'}</small></article>
        <article><span>Review status</span><strong>{view === 'queue' ? 'Pending' : 'Recorded'}</strong><small>Current selected workspace</small></article>
        <article><span>Records shown</span><strong>{visible.length}</strong><small>Up to 100 most recent records</small></article>
        <article><span>Source</span><strong>Database</strong><small>Not browser preview data</small></article>
      </div>

      <div className="profile-approval-tabs" role="tablist" aria-label="Account verification views">
        <button type="button" role="tab" aria-selected={view === 'queue'} className={view === 'queue' ? 'active' : ''} onClick={() => { setView('queue'); setQuery(''); setReason('') }}>Review queue</button>
        <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'active' : ''} onClick={() => { setView('history'); setQuery(''); setReason('') }}>Decision history</button>
      </div>

      {error && <div className="admin-error" role="alert">{error}</div>}
      {notice && <div className="admin-message" role="status">{notice}</div>}

      <div className="profile-approval-workspace">
        <div className="profile-approval-list">
          <div className="profile-list-toolbar">
            <div><h3>{view === 'queue' ? 'Pending verification' : 'Reviewed verification'}</h3><small>{visible.length} record(s)</small></div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, ID..." aria-label="Search verification requests" />
          </div>
          {loading ? <div className="profile-empty-state"><strong>Loading records...</strong><span>Fetching live verification data.</span></div>
            : visible.length === 0 ? <div className="profile-empty-state"><strong>{view === 'queue' ? 'No pending verification requests' : 'No decisions recorded yet'}</strong><span>New records will appear here when available.</span></div>
              : visible.map((item) => (
                <button type="button" key={item.id} className={`profile-request-item ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); setReason('') }}>
                  <span className="profile-request-avatar">{item.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                  <span className="profile-request-copy"><strong>{item.displayName}</strong><small>{accountTypeLabel(item.accountType)}</small><small>Account #{item.id} · {formatDate(item.submittedAt || item.reviewedAt)}</small></span>
                  <span className={`profile-status status-${item.status}`}>{item.status}</span>
                </button>
              ))}
        </div>

        <div className="profile-approval-detail">
          {!selected ? <div className="profile-empty-state">Select a verification record to inspect its details.</div> : <>
            <div className="profile-detail-top">
              <div><span className="admin-kicker">ACCOUNT #{selected.id}</span><h3>{selected.displayName}</h3><p>{selected.email}</p></div>
              <span className={`profile-status status-${selected.status}`}>{selected.status}</span>
            </div>
            <div className="profile-value-comparison">
              <div><span>Account type</span><strong>{accountTypeLabel(selected.accountType)}</strong></div>
              <div><span>Verification status</span><strong>{accountTypeLabel(selected.status)}</strong></div>
            </div>
            <div className="profile-request-meta"><span>{view === 'queue' ? 'Registered' : 'Reviewed'}</span><strong>{formatDate(selected.submittedAt || selected.reviewedAt)}</strong></div>
            {view === 'queue' && selected.status === 'pending' ? <>
              <label className="profile-review-reason">Verification review reason <span>Required</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record the verification checks completed and the reason for your decision..." rows={4} maxLength={500} /></label>
              <div className="profile-review-actions">
                <button type="button" className="admin-secondary-button profile-reject-button" onClick={() => void decide('rejected')} disabled={saving || loading}>{saving ? 'Saving...' : 'Reject verification'}</button>
                <button type="button" className="admin-primary-button" onClick={() => void decide('approved')} disabled={saving || loading}>{saving ? 'Saving...' : 'Approve verification'}</button>
              </div>
            </> : <div className="profile-decision-record"><strong>Decision: {selected.status}</strong><span>{selected.reviewer || 'Administrator'} · {formatDate(selected.reviewedAt)}</span><p>{selected.reason || 'No additional review note was supplied.'}</p></div>}
          </>}
        </div>
      </div>
    </section>
  )
}
