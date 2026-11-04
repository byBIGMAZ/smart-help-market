import { useMemo, useState } from 'react'
import './AdminProfileApprovals.css'

type ReviewStatus = 'pending' | 'approved' | 'rejected'
type ProfileField = 'Full legal name' | 'Phone number' | 'Date of birth' | 'Email address' | 'Identity details' | 'Business ownership' | 'Payout details'

interface ProfileRequest {
  id: string
  user: string
  email: string
  role: string
  field: ProfileField
  currentValue: string
  proposedValue: string
  submittedAt: string
  status: ReviewStatus
  reason?: string
  reviewedAt?: string
  reviewer?: string
  sourceStorageKey?: string
  sourceRecordId?: string
  fieldKey?: string
  sourceUserId?: string
}

const STORAGE_KEY = 'smart-help-market:admin-profile-approvals:v1'
const RULES_STORAGE_KEY = 'smart-help-market:admin-profile-approval-rules:v1'
const initialRequests: ProfileRequest[] = [
  { id: 'PR-2048', user: 'Ada Okafor', email: 'ada.okafor@example.com', role: 'Landlord', field: 'Full legal name', currentValue: 'Ada O. Okafor', proposedValue: 'Adaeze Okafor', submittedAt: '2026-11-04T07:10:00.000Z', status: 'pending' },
  { id: 'PR-2047', user: 'Emmanuel Eze', email: 'emmanuel.eze@example.com', role: 'Seller', field: 'Phone number', currentValue: '+234 803 000 0012', proposedValue: '+234 806 000 0044', submittedAt: '2026-11-03T18:25:00.000Z', status: 'pending' },
  { id: 'PR-2046', user: 'Maryam Bello', email: 'maryam.bello@example.com', role: 'Service provider', field: 'Business ownership', currentValue: 'Bello Home Services', proposedValue: 'Bello Integrated Services Ltd', submittedAt: '2026-11-03T12:40:00.000Z', status: 'pending' },
  { id: 'PR-2045', user: 'Chidi Nwosu', email: 'chidi.nwosu@example.com', role: 'Buyer', field: 'Date of birth', currentValue: 'Not provided', proposedValue: '12 August 1998', submittedAt: '2026-11-02T09:15:00.000Z', status: 'approved', reviewer: 'Super Admin', reviewedAt: '2026-11-02T11:20:00.000Z', reason: 'Supporting verification completed.' },
  { id: 'PR-2044', user: 'Zainab Musa', email: 'zainab.musa@example.com', role: 'Agent', field: 'Identity details', currentValue: 'Identity record ending 4421', proposedValue: 'Updated identity record ending 8830', submittedAt: '2026-11-01T14:00:00.000Z', status: 'rejected', reviewer: 'Super Admin', reviewedAt: '2026-11-01T16:30:00.000Z', reason: 'The submitted document was not sufficiently clear.' },
]

const defaultRules: Record<ProfileField, { approval: boolean; cooldown: number }> = {
  'Full legal name': { approval: true, cooldown: 24 },
  'Phone number': { approval: true, cooldown: 24 },
  'Date of birth': { approval: true, cooldown: 24 },
  'Email address': { approval: true, cooldown: 24 },
  'Identity details': { approval: true, cooldown: 24 },
  'Business ownership': { approval: true, cooldown: 24 },
  'Payout details': { approval: true, cooldown: 24 },
}

function readRequests(): ProfileRequest[] {
  const linkedRequests: ProfileRequest[] = []
  const fieldLabels: Record<string, ProfileField> = {
    fullName: 'Full legal name',
    phone: 'Phone number',
    dateOfBirth: 'Date of birth',
    email: 'Email address',
    identityDetails: 'Identity details',
    businessOwnership: 'Business ownership',
    payoutDetails: 'Payout details',
  }

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith('smart-help-market:profile-protection:v1:')) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as {
        profile?: Record<string, string>
        pending?: Array<{ id: string; field: string; previousValue: string; proposedValue: string; submittedAt: string }>
        history?: Array<{ id: string; field: string; previousValue: string; proposedValue: string; submittedAt: string; status: string; reviewedAt?: string; reviewerNote?: string }>
      }
      const sourceUserId = key.slice('smart-help-market:profile-protection:v1:'.length)
      const common = (item: { id: string; field: string; previousValue: string; proposedValue: string; submittedAt: string }) => ({
        id: item.id.replace(/-history$/, ''),
        user: parsed.profile?.fullName || parsed.profile?.displayName || 'Marketplace member',
        email: 'Account email protected',
        role: 'Marketplace member',
        field: fieldLabels[item.field] || item.field as ProfileField,
        fieldKey: item.field,
        currentValue: item.previousValue || 'Not provided',
        proposedValue: item.proposedValue || 'Not provided',
        submittedAt: item.submittedAt,
        sourceStorageKey: key,
        sourceUserId,
        sourceRecordId: item.id.replace(/-history$/, ''),
      })
      const history = Array.isArray(parsed.history) ? parsed.history : []
      const historicalIds = new Set(history.map((item) => item.id.replace(/-history$/, '')))
      for (const item of parsed.pending || []) {
        if (historicalIds.has(item.id)) continue
        linkedRequests.push({ ...common(item), status: 'pending' })
      }
      for (const item of history) {
        if (item.status === 'Pending approval') continue
        const status: ReviewStatus = item.status === 'Approved' ? 'approved' : item.status === 'Rejected' ? 'rejected' : 'pending'
        if (status === 'pending') continue
        linkedRequests.push({
          ...common(item),
          status,
          reason: item.reviewerNote,
          reviewedAt: item.reviewedAt,
          reviewer: 'Super Admin reviewer',
        })
      }
    }
  } catch {
    // Ignore malformed local preview records and keep the rest of the queue available.
  }

  let savedSamples = initialRequests
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) savedSamples = (parsed as ProfileRequest[]).filter((item) => !item.sourceStorageKey)
    }
  } catch {
    // Use sample records if preview storage is unavailable.
  }
  return [...linkedRequests, ...savedSamples].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
}

function readRules(): Record<ProfileField, { approval: boolean; cooldown: number }> {
  try {
    const raw = window.localStorage.getItem(RULES_STORAGE_KEY)
    if (raw) return { ...defaultRules, ...(JSON.parse(raw) as Partial<typeof defaultRules>) }
  } catch {
    // Fall back to default preview policy.
  }
  return defaultRules
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AdminProfileApprovals() {
  const [requests, setRequests] = useState<ProfileRequest[]>(readRequests)
  const [view, setView] = useState<'queue' | 'history' | 'rules'>('queue')
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const [rules, setRules] = useState(readRules)

  const pending = requests.filter((item) => item.status === 'pending')
  const selected = requests.find((item) => item.id === selectedId) || requests.find((item) => item.status === 'pending') || requests[0]
  const visible = useMemo(() => requests.filter((item) => {
    const matchesView = view === 'history' ? item.status !== 'pending' : view === 'queue' ? item.status === 'pending' : true
    const term = query.trim().toLowerCase()
    return matchesView && (!term || [item.id, item.user, item.email, item.role, item.field].join(' ').toLowerCase().includes(term))
  }), [requests, query, view])

  function persist(next: ProfileRequest[]) {
    setRequests(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.filter((item) => !item.sourceStorageKey)))
    } catch {
      setNotice('Updated in this session only. Browser storage is unavailable.')
    }
  }

  function decide(status: Exclude<ReviewStatus, 'pending'>) {
    if (!selected || selected.status !== 'pending') return
    if (reason.trim().length < 8) {
      setNotice('Enter a clear review reason of at least 8 characters.')
      return
    }
    const now = new Date().toISOString()
    if (selected.sourceStorageKey && selected.sourceRecordId) {
      try {
        const raw = window.localStorage.getItem(selected.sourceStorageKey)
        if (raw) {
          const stored = JSON.parse(raw) as {
            profile?: Record<string, string>
            cooldownUntil?: string | null
            pending?: Array<{ id: string; field: string; previousValue: string; proposedValue: string; submittedAt: string; status: string }>
            history?: Array<{ id: string; field: string; previousValue: string; proposedValue: string; submittedAt: string; status: string; reviewedAt?: string; reviewerNote?: string }>
          }
          const matching = (stored.pending || []).find((item) => item.id === selected.sourceRecordId)
          if (matching) {
            if (status === 'approved' && stored.profile && selected.fieldKey) {
              stored.profile[selected.fieldKey] = matching.proposedValue
            }
            stored.pending = (stored.pending || []).filter((item) => item.id !== selected.sourceRecordId)
            stored.history = (stored.history || []).map((item) => item.id === `${selected.sourceRecordId}-history` || item.id === selected.sourceRecordId
              ? { ...item, status: status === 'approved' ? 'Approved' : 'Rejected', reviewedAt: now, reviewerNote: reason.trim() }
              : item)
            window.localStorage.setItem(selected.sourceStorageKey, JSON.stringify(stored))
          }
        }
      } catch {
        setNotice('The linked profile record could not be updated in browser storage.')
        return
      }
    }
    const next = requests.map((item) => item.id === selected.id
      ? { ...item, status, reason: reason.trim(), reviewer: 'Super Admin reviewer', reviewedAt: now }
      : item)
    persist(next)
    setReason('')
    setNotice(`${selected.id} marked ${status}. This is a local frontend preview only.`)
    setView('history')
  }

  function updateRule(field: ProfileField, patch: Partial<{ approval: boolean; cooldown: number }>) {
    setRules((current) => {
      const next = { ...current, [field]: { ...current[field], ...patch } }
      try { window.localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(next)) } catch { /* Session-only preview. */ }
      return next
    })
    setNotice('Rule updated in this browser preview. Server-enforced policy is not connected yet.')
  }

  return (
    <section className="admin-profile-approvals">
      <div className="admin-section-heading profile-approval-heading">
        <div>
          <span className="admin-kicker">ACCOUNT INTEGRITY</span>
          <h2>Profile Approval Centre</h2>
          <p>Review sensitive account changes before they replace a user's approved profile information.</p>
        </div>
        <button type="button" className="admin-secondary-button" onClick={() => { setRequests(readRequests()); setSelectedId(''); setNotice('Preview records refreshed.') }}>↻ Refresh</button>
      </div>

      <div className="profile-approval-notice" role="note">
        <strong>Frontend preview</strong>
        <span>These sample requests and decisions are stored in this browser only. No user profile is changed and no real approval is issued until secure backend workflows are connected.</span>
      </div>

      <div className="profile-approval-stats">
        <article><span>Awaiting review</span><strong>{pending.length}</strong><small>Requests requiring a decision</small></article>
        <article><span>Approved</span><strong>{requests.filter((item) => item.status === 'approved').length}</strong><small>Sample approved decisions</small></article>
        <article><span>Rejected</span><strong>{requests.filter((item) => item.status === 'rejected').length}</strong><small>Sample rejected decisions</small></article>
        <article><span>Protected fields</span><strong>{Object.keys(rules).length}</strong><small>Policy-controlled profile fields</small></article>
      </div>

      <div className="profile-approval-tabs" role="tablist" aria-label="Profile approval views">
        <button type="button" role="tab" aria-selected={view === 'queue'} className={view === 'queue' ? 'active' : ''} onClick={() => setView('queue')}>Review queue <span>{pending.length}</span></button>
        <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>Decision history</button>
        <button type="button" role="tab" aria-selected={view === 'rules'} className={view === 'rules' ? 'active' : ''} onClick={() => setView('rules')}>Approval rules</button>
      </div>

      {notice && <div className="admin-message" role="status">{notice}</div>}

      {view === 'rules' ? (
        <div className="profile-rules-panel">
          <div className="profile-panel-title"><div><h3>Profile change policy</h3><p>Configure the preview policy for each sensitive field.</p></div><span className="profile-protected-tag">Core safeguards stay enforced</span></div>
          <div className="profile-rule-list">
            {(Object.keys(rules) as ProfileField[]).map((field) => (
              <div className="profile-rule-row" key={field}>
                <div><strong>{field}</strong><small>Changes to this field are tracked in the approval history.</small></div>
                <label className="profile-rule-toggle"><input type="checkbox" checked={rules[field].approval} onChange={(event) => updateRule(field, { approval: event.target.checked })} /> Require approval</label>
                <label className="profile-cooldown-control">Cooldown
                  <select value={rules[field].cooldown} onChange={(event) => updateRule(field, { cooldown: Number(event.target.value) })}>
                    <option value={0}>No additional delay</option><option value={12}>12 hours</option><option value={24}>24 hours</option><option value={48}>48 hours</option><option value={72}>72 hours</option><option value={168}>7 days</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
          <p className="profile-rule-footnote">These controls demonstrate the intended policy interface. Production enforcement must remain server-side and cannot be disabled by ordinary administrators.</p>
        </div>
      ) : (
        <div className="profile-approval-workspace">
          <div className="profile-approval-list">
            <div className="profile-list-toolbar">
              <div><h3>{view === 'queue' ? 'Pending requests' : 'Reviewed requests'}</h3><small>{visible.length} record(s)</small></div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, role..." aria-label="Search profile requests" />
            </div>
            {visible.length === 0 ? <div className="profile-empty-state"><strong>No requests found</strong><span>Try another search or switch to a different view.</span></div> : visible.map((item) => (
              <button type="button" key={item.id} className={`profile-request-item ${selectedId === item.id ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); setReason('') }}>
                <span className="profile-request-avatar">{item.user.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                <span className="profile-request-copy"><strong>{item.user}</strong><small>{item.field} · {item.role}</small><small>{item.id} · {formatDate(item.submittedAt)}</small></span>
                <span className={`profile-status status-${item.status}`}>{item.status}</span>
              </button>
            ))}
          </div>

          <div className="profile-approval-detail">
            {selected ? <>
              <div className="profile-detail-top"><div><span className="admin-kicker">REQUEST {selected.id}</span><h3>{selected.field}</h3><p>{selected.user} · {selected.role} · {selected.email}</p></div><span className={`profile-status status-${selected.status}`}>{selected.status}</span></div>
              <div className="profile-value-comparison">
                <div><span>Current approved value</span><strong>{selected.currentValue}</strong></div>
                <div><span>Proposed new value</span><strong>{selected.proposedValue}</strong></div>
              </div>
              <div className="profile-request-meta"><span>Submitted</span><strong>{formatDate(selected.submittedAt)}</strong></div>
              {selected.status === 'pending' ? <>
                <label className="profile-review-reason">Review reason <span>Required</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the verification checks and your decision..." rows={4} maxLength={500} /></label>
                <div className="profile-review-actions">
                  <button type="button" className="admin-secondary-button profile-reject-button" onClick={() => decide('rejected')}>Reject request</button>
                  <button type="button" className="admin-primary-button" onClick={() => decide('approved')}>Approve request</button>
                </div>
              </> : <div className="profile-decision-record"><strong>Decision: {selected.status}</strong><span>{selected.reviewer || 'Reviewer'} · {selected.reviewedAt ? formatDate(selected.reviewedAt) : 'Date unavailable'}</span><p>{selected.reason || 'No review reason recorded.'}</p></div>}
            </> : <div className="profile-empty-state">Select a request to inspect its details.</div>}
          </div>
        </div>
      )}
    </section>
  )
}
