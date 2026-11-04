import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getMarketplaceUser, type MarketplaceUser } from '../../services/marketplaceAuth'
import {
  createHelpSupportCase,
  getHelpConversationMessages,
  getHelpConversations,
  getHelpStatus,
  sendHelpMessage,
  type HelpConversation,
  type HelpMessage,
  type HelpUsage,
} from '../../services/helpCentre'
import './HelpCentreChat.css'

type Mode = 'floating' | 'page'

function GuestPreview() {
  return (
    <div className="help-guest-preview">
      <div className="help-preview-orbit" aria-hidden="true"><span>✦</span></div>
      <div className="help-preview-message help-preview-assistant">
        Hello! I can help you find a home, product or service, or guide you around the website.
      </div>
      <div className="help-preview-message help-preview-user">Find me an apartment in Auchi.</div>
      <div className="help-preview-message help-preview-assistant">
        Certainly. Let me check the marketplace and narrow down the available options.
        <div className="help-preview-typing"><i/><i/><i/><span>Searching listings</span></div>
      </div>
      <div className="help-preview-result"><span>⌂</span><div><b>Matching properties</b><small>Clickable marketplace results</small></div><strong>↗</strong></div>
      <div className="help-guest-lock">
        <span>🔐</span>
        <div><strong>Sign in to start your own conversation</strong><small>Your conversations and support requests stay connected to your account.</small></div>
      </div>
      <div className="help-guest-actions">
        <Link to="/login" className="help-chat-primary">Sign in</Link>
        <Link to="/register" className="help-chat-secondary">Create account</Link>
      </div>
    </div>
  )
}

export default function HelpCentreChat({ mode = 'floating', onClose }: { mode?: Mode; onClose?: () => void }) {
  const { pathname } = useLocation()
  const [user, setUser] = useState<MarketplaceUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [messages, setMessages] = useState<HelpMessage[]>([])
  const [conversations, setConversations] = useState<HelpConversation[]>([])
  const [conversationId, setConversationId] = useState('')
  const [usage, setUsage] = useState<HelpUsage | null>(null)
  const [assistantEnabled, setAssistantEnabled] = useState(true)
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showSupport, setShowSupport] = useState(false)
  const [supportSubject, setSupportSubject] = useState('')
  const [supportDetails, setSupportDetails] = useState('')
  const [supportNotice, setSupportNotice] = useState('')
  const [supportSending, setSupportSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    getMarketplaceUser()
      .then(async (currentUser) => {
        if (!active) return
        setUser(currentUser)
        if (!currentUser) return
        const [status, history] = await Promise.all([getHelpStatus(), getHelpConversations()])
        if (!active) return
        setUsage(status)
        setAssistantEnabled(status.enabled)
        setConversations(history)
        if (history[0]) {
          setConversationId(history[0].id)
          const thread = await getHelpConversationMessages(history[0].id)
          if (active) setMessages(thread)
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Help Centre is temporarily unavailable.')
      })
      .finally(() => { if (active) setAuthLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, typing])

  async function openConversation(id: string) {
    setError('')
    setConversationId(id)
    setMessages(await getHelpConversationMessages(id))
  }

  function startNewConversation() {
    setConversationId('')
    setMessages([])
    setError('')
    setShowSupport(false)
    setSupportNotice('')
  }

  async function submitMessage(event?: FormEvent<HTMLFormElement>, preset?: string) {
    event?.preventDefault()
    const value = (preset ?? input).trim()
    if (!value || sending || !user) return
    setInput('')
    setError('')
    setSending(true)
    setTyping(true)
    const optimistic: HelpMessage = {
      id: `local-${Date.now()}`,
      sender: 'user',
      text: value,
      createdAt: new Date().toISOString(),
    }
    setMessages((current) => [...current, optimistic])
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 420))
      const result = await sendHelpMessage(value, conversationId || undefined, pathname)
      setConversationId(result.conversationId)
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: result.reply,
        metadata: {
          suggestions: result.suggestions,
          actions: result.actions,
          matches: result.matches || [],
        },
        createdAt: new Date().toISOString(),
      }])
      setUsage({ ...result.usage, period: 'monthly' })
      if (result.needsAdmin) setShowSupport(true)
      const history = await getHelpConversations()
      setConversations(history)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your message could not be sent.')
    } finally {
      setTyping(false)
      setSending(false)
    }
  }

  async function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!conversationId || !supportSubject.trim() || !supportDetails.trim()) return
    setSupportSending(true)
    setSupportNotice('')
    setError('')
    try {
      const result = await createHelpSupportCase({
        conversationId,
        subject: supportSubject.trim(),
        details: supportDetails.trim(),
      })
      setSupportNotice(result.message)
      setShowSupport(false)
      setSupportSubject('')
      setSupportDetails('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your support request could not be sent.')
    } finally {
      setSupportSending(false)
    }
  }

  if (authLoading) {
    return <div className={`help-chat-loading help-chat-mode-${mode}`}><span className="help-chat-spinner"/>Preparing your Help Centre...</div>
  }

  if (!user) {
    return (
      <div className={`help-chat-shell help-chat-mode-${mode}`}>
        <GuestPreview />
      </div>
    )
  }

  return (
    <section className={`help-chat-shell help-chat-mode-${mode}`}>
      <header className="help-chat-header">
        <div className="help-chat-brand"><span className="help-chat-brand-icon">✦</span><div><strong>SMART HELP ASSISTANT</strong><small><i/> Ready to help, {user.displayName.split(' ')[0]}</small></div></div>
        <div className="help-chat-header-actions">
          {mode === 'page' && <button type="button" onClick={startNewConversation}>＋ New chat</button>}
          {mode === 'floating' && onClose && <button type="button" className="help-chat-close" onClick={onClose} aria-label="Close Help Centre">×</button>}
        </div>
      </header>

      <div className="help-chat-body">
        {mode === 'page' && (
          <aside className="help-chat-history">
            <div className="help-history-heading"><strong>Your conversations</strong><span>{conversations.length}</span></div>
            {conversations.length === 0 && <p className="help-history-empty">Your conversations will appear here.</p>}
            {conversations.map((conversation) => (
              <button type="button" key={conversation.id} className={conversation.id === conversationId ? 'is-active' : ''} onClick={() => void openConversation(conversation.id)}>
                <strong>{conversation.title}</strong><small>{new Date(conversation.updatedAt).toLocaleDateString('en-NG')}</small>
                {conversation.status === 'needs_admin' && <em>Support requested</em>}
              </button>
            ))}
          </aside>
        )}

        <div className="help-chat-main">
          <div className="help-chat-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="help-chat-welcome">
                <span>✦</span><h2>What can I help you with?</h2>
                <p>I can search published marketplace listings, help you compare options and guide you directly to features on SMART HELP MARKET.</p>
                <div className="help-chat-starters">
                  {['Find a property to rent', 'Find a product', 'Find a service', 'Help me navigate the website'].map((item) => <button type="button" key={item} onClick={() => void submitMessage(undefined, item)}>{item}<span>↗</span></button>)}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <article className={`help-chat-message help-chat-message-${message.sender}`} key={message.id}>
                {message.sender !== 'user' && <span className="help-message-avatar">{message.sender === 'admin' ? 'S' : '✦'}</span>}
                <div className="help-message-content">
                  {message.sender === 'admin' && <small>SUPPORT TEAM</small>}
                  <p>{message.text}</p>
                  {message.metadata?.matches?.map((match) => (
                    <Link className="help-match-card" to={`/listing/${encodeURIComponent(match.key)}`} key={match.key} onClick={onClose}>
                      <span className="help-match-icon">{match.icon || '◈'}</span>
                      <span><strong>{match.title}</strong><small>{match.category} · {match.location || 'Location not specified'}</small><small>{match.isDemo ? 'Demonstration listing' : 'Published listing'}</small><small>{Number(match.price) > 0 ? `₦${Number(match.price).toLocaleString('en-NG')} ${match.priceUnit || ''}` : 'Contact for price'}</small></span>
                      <b>↗</b>
                    </Link>
                  ))}
                  {message.metadata?.actions?.map((action) => <Link className="help-action-link" to={action.path} key={action.path} onClick={onClose}>{action.label}<span>↗</span></Link>)}
                  {message.metadata?.suggestions && message.metadata.suggestions.length > 0 && (
                    <div className="help-chat-suggestions">{message.metadata.suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={sending} onClick={() => void submitMessage(undefined, suggestion)}>{suggestion}</button>)}</div>
                  )}
                  <time>{new Date(message.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
              </article>
            ))}
            {typing && <div className="help-chat-typing"><span className="help-message-avatar">✦</span><div><i/><i/><i/><small>Thinking and checking the marketplace...</small></div></div>}
            <div ref={bottomRef}/>
          </div>

          {error && <div className="help-chat-error" role="alert">{error}</div>}
          {supportNotice && <div className="help-chat-success" role="status">{supportNotice}</div>}

          {showSupport && (
            <form className="help-support-form" onSubmit={submitSupport}>
              <strong>Contact the support team</strong>
              <input value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} placeholder="What do you need help with?" maxLength={160} required/>
              <textarea value={supportDetails} onChange={(event) => setSupportDetails(event.target.value)} placeholder="Explain the issue so our team can assist..." rows={3} maxLength={2000} required/>
              <div><button type="button" onClick={() => setShowSupport(false)}>Cancel</button><button type="submit" disabled={supportSending}>{supportSending ? 'Sending...' : 'Send to support'}</button></div>
            </form>
          )}

          {!assistantEnabled && <div className="help-chat-error" role="status">The Help Centre assistant is temporarily disabled by the administrator.</div>}
          <div className="help-chat-composer-wrap">
            {usage && <div className="help-chat-usage"><span>{usage.remaining} of {usage.limit} included messages remaining this month</span><span>{usage.used}/{usage.limit}</span></div>}
            <form className="help-chat-composer" onSubmit={(event) => void submitMessage(event)}>
              <textarea value={input} onChange={(event) => setInput(event.target.value)} disabled={!assistantEnabled} placeholder="Ask me anything about the marketplace..." rows={1} maxLength={1200} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitMessage() } }}/>
              <button type="submit" disabled={!assistantEnabled || !input.trim() || sending} aria-label="Send message">↑</button>
            </form>
            <div className="help-chat-footer"><span>Responses use marketplace information available to the assistant.</span><button type="button" onClick={() => { if (!conversationId) void submitMessage(undefined, 'Speak to an administrator'); else setShowSupport((current) => !current) }}>Need a person?</button></div>
          </div>
        </div>
      </div>
    </section>
  )
}
