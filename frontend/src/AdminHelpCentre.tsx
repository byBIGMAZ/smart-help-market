import { useCallback, useEffect, useState, type FormEvent } from 'react'
import './AdminHelpCentre.css'

interface SupportCase {
  id: string
  subject: string
  details: string
  status: 'open' | 'assigned' | 'resolved'
  createdAt: string
  userName: string
  email: string
  conversationId: string
}
interface IntelligenceSummary {
  engine: string
  modelVersion: string
  interactions: { interactions: number; helpful: number; not_helpful: number; intents_observed: number }
  feedback: { ratings: number; positive: number }
  trainingExamples: { approved: number; pending: number }
  adaptiveFeatures: { learned_features: number; correction_samples: number }
}
interface SupportMessage {
  id: string
  sender: 'user' | 'assistant' | 'admin'
  text: string
  createdAt: string
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers as Record<string, string> | undefined) },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `Request failed (HTTP ${response.status}).`)
  return data as T
}

export default function AdminHelpCentre() {
  const [cases, setCases] = useState<SupportCase[]>([])
  const [selected, setSelected] = useState<SupportCase | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [intelligence, setIntelligence] = useState<IntelligenceSummary | null>(null)

  const loadCases = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api<{ cases: SupportCase[] }>('/api/help-centre/admin/cases')
      setCases(data.cases)
      setSelected((current) => current ? data.cases.find((item) => item.id === current.id) || null : data.cases[0] || null)
      void api<IntelligenceSummary>('/api/help-centre/admin/intelligence/summary')
        .then(setIntelligence)
        .catch(() => setIntelligence(null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Support inbox could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadCases() }, [loadCases])

  useEffect(() => {
    let active = true
    if (!selected) { setMessages([]); return }
    api<{ messages: SupportMessage[] }>(`/api/help-centre/admin/cases/${selected.id}/messages`)
      .then((data) => { if (active) setMessages(data.messages) })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Conversation could not be loaded.') })
    return () => { active = false }
  }, [selected?.id])

  async function updateStatus(status: SupportCase['status']) {
    if (!selected) return
    setError('')
    try {
      await api(`/api/help-centre/admin/cases/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setNotice('Support case status updated.')
      await loadCases()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Case status could not be updated.')
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !reply.trim()) return
    setSending(true)
    setError('')
    setNotice('')
    try {
      await api(`/api/help-centre/admin/cases/${selected.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: reply.trim() }),
      })
      setReply('')
      setNotice('Your reply has been sent to the user.')
      const data = await api<{ messages: SupportMessage[] }>(`/api/help-centre/admin/cases/${selected.id}/messages`)
      setMessages(data.messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your reply could not be sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="admin-help-centre">
      <div className="admin-help-heading">
        <div><span className="admin-kicker">CUSTOMER EXPERIENCE</span><h2>Help Centre Support Inbox</h2><p>Review conversations escalated by the SMART HELP assistant and reply directly to users.</p></div>
        <button type="button" className="admin-secondary-button" onClick={() => void loadCases()} disabled={loading}>↻ Refresh</button>
      </div>
      {error && <div className="admin-error" role="alert">{error}</div>}
      {notice && <div className="admin-message" role="status">{notice}</div>}
      {intelligence && (
        <section className="admin-ai-intelligence" aria-label="BIGMAZ Intelligence overview">
          <div className="admin-ai-intelligence-heading">
            <div><span className="admin-kicker">PROPRIETARY INTELLIGENCE</span><h3>{intelligence.engine}</h3></div>
            <span>{intelligence.modelVersion}</span>
          </div>
          <div className="admin-ai-intelligence-grid">
            <article><small>Interactions · 30 days</small><strong>{intelligence.interactions.interactions.toLocaleString('en-NG')}</strong></article>
            <article><small>Helpful ratings</small><strong>{intelligence.feedback.positive.toLocaleString('en-NG')} / {intelligence.feedback.ratings.toLocaleString('en-NG')}</strong></article>
            <article><small>Intent categories observed</small><strong>{intelligence.interactions.intents_observed}</strong></article>
            <article><small>Adaptive features learned</small><strong>{intelligence.adaptiveFeatures.learned_features.toLocaleString('en-NG')}</strong></article>
            <article><small>Intent correction samples</small><strong>{intelligence.adaptiveFeatures.correction_samples.toLocaleString('en-NG')}</strong></article>
            <article><small>Reviewed learning examples</small><strong>{intelligence.trainingExamples.approved} approved · {intelligence.trainingExamples.pending} pending</strong></article>
          </div>
          <p>BIGMAZ AI records privacy-preserving interaction signals and applies supervised intent corrections. Model changes remain bounded and measurable.</p>
        </section>
      )}
      <div className="admin-help-layout">
        <aside className="admin-help-case-list">
          <div className="admin-help-list-title"><strong>Support requests</strong><span>{cases.filter((item) => item.status !== 'resolved').length} open</span></div>
          {loading && <p className="admin-help-empty">Loading support requests...</p>}
          {!loading && cases.length === 0 && <p className="admin-help-empty">No support requests have been submitted yet.</p>}
          {cases.map((item) => (
            <button type="button" key={item.id} className={selected?.id === item.id ? 'is-active' : ''} onClick={() => setSelected(item)}>
              <span className={`admin-help-status status-${item.status}`}>{item.status.replace('_', ' ')}</span>
              <strong>{item.subject}</strong><small>{item.userName} · {new Date(item.createdAt).toLocaleDateString('en-NG')}</small>
            </button>
          ))}
        </aside>
        <section className="admin-help-thread">
          {!selected ? <div className="admin-help-empty">Select a support request to review its conversation.</div> : (
            <>
              <header className="admin-help-thread-header">
                <div><span className="admin-kicker">{selected.userName}</span><h3>{selected.subject}</h3><small>{selected.email}</small></div>
                <select value={selected.status} onChange={(event) => void updateStatus(event.target.value as SupportCase['status'])} aria-label="Support case status">
                  <option value="open">Open</option><option value="assigned">Assigned</option><option value="resolved">Resolved</option>
                </select>
              </header>
              <div className="admin-help-case-details"><strong>Customer request</strong><p>{selected.details}</p></div>
              <div className="admin-help-messages">
                {messages.map((item) => <article key={item.id} className={`admin-help-message message-${item.sender}`}><small>{item.sender === 'admin' ? 'SUPPORT TEAM' : item.sender === 'assistant' ? 'SMART HELP ASSISTANT' : selected.userName}</small><p>{item.text}</p><time>{new Date(item.createdAt).toLocaleString('en-NG')}</time></article>)}
              </div>
              <form className="admin-help-reply" onSubmit={(event) => void sendReply(event)}>
                <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={2000} placeholder="Write a reply to the user..." required/>
                <button type="submit" className="admin-primary-button" disabled={sending || !reply.trim()}>{sending ? 'Sending...' : 'Send reply'}</button>
              </form>
            </>
          )}
        </section>
      </div>
    </section>
  )
}
