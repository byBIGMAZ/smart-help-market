import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getMarketplaceUser, type MarketplaceUser } from '../../services/marketplaceAuth'
import {
  createHelpSupportCase,
  getHelpConversationMessages,
  getHelpConversations,
  getHelpStatus,
  sendHelpMessage,
  submitHelpFeedback,
  type HelpConversation,
  type HelpGuide,
  type HelpMessage,
  type HelpUsage,
} from '../../services/helpCentre'
import './HelpCentreChat.css'

type Mode = 'floating' | 'page'

const guestScenarios = [
  {
    messages: [
      { sender: 'assistant', text: 'Good to see you! I can help you explore real marketplace opportunities.' },
      { sender: 'user', text: 'I need accommodation close to my school.' },
      { sender: 'assistant', text: 'I would first identify your campus, then prioritise suitable places by real travel distance.' },
    ],
    result: 'Location-aware property discovery',
    detail: 'Campus, road distance and budget matching',
    icon: '⌖',
  },
  {
    messages: [
      { sender: 'assistant', text: 'What are you trying to get done today?' },
      { sender: 'user', text: 'I need a reliable electrician.' },
      { sender: 'assistant', text: 'I would check published service providers and show only real matching profiles.' },
    ],
    result: 'Service provider discovery',
    detail: 'Published services and available details',
    icon: '⚡',
  },
  {
    messages: [
      { sender: 'assistant', text: 'I can help you find people with compatible accommodation preferences.' },
      { sender: 'user', text: 'I need a roommate who is tidy and does not smoke.' },
      { sender: 'assistant', text: 'I would compare the preferences people have chosen and explain the compatibility.' },
    ],
    result: 'Roommate compatibility',
    detail: 'Preferences, budget and location',
    icon: '♧',
  },
  {
    messages: [
      { sender: 'assistant', text: 'You can ask me about the area around a property too.' },
      { sender: 'user', text: 'Is the neighbourhood usually peaceful?' },
      { sender: 'assistant', text: 'I would review permitted community discussions and separate residents’ reports from verified facts.' },
    ],
    result: 'Neighbourhood intelligence',
    detail: 'Community context with source transparency',
    icon: '⌂',
  },
  {
    messages: [
      { sender: 'assistant', text: 'I can explain marketplace processes step by step.' },
      { sender: 'user', text: 'How does escrow work?' },
      { sender: 'assistant', text: 'I can walk you through the buyer, payment, seller and release stages with an interactive explanation.' },
    ],
    result: 'Interactive learning guide',
    detail: 'Visual explanations and guided steps',
    icon: '◇',
  },
]

function timeGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 21) return 'Good evening'
  return 'Working late?'
}

function InteractiveGuide({ guide }: { guide: HelpGuide }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = guide.steps[stepIndex]
  if (!step) return null

  return (
    <section className="help-interactive-guide" aria-label="Interactive escrow explanation">
      <div className="help-guide-topline">
        <strong>How escrow typically works</strong>
        <span>STEP {stepIndex + 1} OF {guide.steps.length}</span>
      </div>
      <div className="help-guide-progress" aria-hidden="true">
        <span style={{ width: `${((stepIndex + 1) / guide.steps.length) * 100}%` }}/>
      </div>
      <div className="help-guide-step">
        <span className="help-guide-step-icon">{step.icon}</span>
        <div><strong>{step.title}</strong><p>{step.description}</p></div>
      </div>
      <div className="help-guide-controls">
        <button type="button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0}>Previous</button>
        {stepIndex < guide.steps.length - 1
          ? <button type="button" onClick={() => setStepIndex((current) => Math.min(guide.steps.length - 1, current + 1))}>Next step ↗</button>
          : <button type="button" onClick={() => setStepIndex(0)}>Replay guide ↻</button>}
      </div>
      <p className="help-guide-disclaimer">{guide.disclaimer}</p>
    </section>
  )
}

function GuestPreview() {
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [visibleCount, setVisibleCount] = useState(0)
  const scenario = guestScenarios[scenarioIndex]

  useEffect(() => {
    const complete = visibleCount >= scenario.messages.length
    const timer = window.setTimeout(() => {
      if (!complete) {
        setVisibleCount((current) => current + 1)
        return
      }
      setVisibleCount(0)
      setScenarioIndex((current) => (current + 1) % guestScenarios.length)
    }, complete ? 2600 : 1850)
    return () => window.clearTimeout(timer)
  }, [scenarioIndex, visibleCount, scenario.messages.length])

  return (
    <div className="help-guest-preview">
      <div className="help-preview-heading">
        <div className="help-preview-orbit" aria-hidden="true"><span>✦</span></div>
        <div><strong>BIGMAZ AI</strong><small>{timeGreeting()} · Proprietary marketplace intelligence</small></div>
        <span className="help-preview-live"><i/> LIVE PREVIEW</span>
      </div>
      <div className="help-preview-stage" key={scenarioIndex}>
        {scenario.messages.slice(0, visibleCount).map((message, index) => (
          <div
            className={`help-preview-message ${message.sender === 'user' ? 'help-preview-user' : 'help-preview-assistant'}`}
            key={`${scenarioIndex}-${index}`}
          >
            {message.text}
          </div>
        ))}
        {visibleCount < scenario.messages.length && (
          <div className="help-preview-typing"><i/><i/><i/><span>BIGMAZ AI is thinking</span></div>
        )}
        {visibleCount >= scenario.messages.length && (
          <div className="help-preview-result help-preview-result-enter">
            <span>{scenario.icon}</span>
            <div><b>{scenario.result}</b><small>{scenario.detail}</small></div>
            <strong>↗</strong>
          </div>
        )}
      </div>
      <div className="help-preview-disclaimer">Preview conversation only. Live searches use published marketplace information after sign-in.</div>
      <div className="help-guest-lock">
        <span>🔐</span>
        <div><strong>Start your own intelligent conversation</strong><small>Sign in to search live listings, save conversations and receive personalised assistance.</small></div>
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
  const [feedbackSent, setFeedbackSent] = useState<Record<string, boolean>>({})
  const [correctionFor, setCorrectionFor] = useState('')
  const [correctionIntent, setCorrectionIntent] = useState('')
  const [, setClockTick] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((current) => current + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [])

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
        id: result.assistantMessageId,
        sender: 'assistant',
        text: result.reply,
        metadata: {
          suggestions: result.suggestions,
          actions: result.actions,
          matches: result.matches || [],
          guide: result.guide || null,
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

  async function rateResponse(messageId: string, helpful: boolean, correctedIntent?: string) {
    if (feedbackSent[messageId]) return
    try {
      await submitHelpFeedback(messageId, helpful, correctedIntent)
      setFeedbackSent((current) => ({ ...current, [messageId]: helpful }))
      setCorrectionFor('')
      setCorrectionIntent('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your feedback could not be saved.')
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
        <div className="help-chat-brand"><span className="help-chat-brand-icon">✦</span><div><strong>SMART HELP ASSISTANT</strong><small><i/> {timeGreeting()}, {user.displayName.split(' ')[0]} · BIGMAZ Intelligence</small></div></div>
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
                  {message.metadata?.guide?.kind === 'escrow' && <InteractiveGuide guide={message.metadata.guide}/>}
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
                  {message.sender === 'assistant' && /^\d+$/.test(message.id) && (
                    <>
                      <div className="help-message-feedback" aria-label="Rate this response">
                        {feedbackSent[message.id] !== undefined
                          ? <small>Thanks for helping BIGMAZ AI improve.</small>
                          : <>
                              <span>Was this helpful?</span>
                              <button type="button" onClick={() => void rateResponse(message.id, true)} aria-label="Helpful answer">👍</button>
                              <button type="button" onClick={() => { setCorrectionFor(message.id); setCorrectionIntent('') }} aria-label="Not helpful">👎</button>
                            </>}
                      </div>
                      {correctionFor === message.id && feedbackSent[message.id] === undefined && (
                        <div className="help-feedback-correction">
                          <small>What was your question mainly about?</small>
                          <select value={correctionIntent} onChange={(event) => setCorrectionIntent(event.target.value)}>
                            <option value="">Choose the correct topic</option>
                            <option value="property_search">Finding a property</option>
                            <option value="roommate_search">Finding a roommate</option>
                            <option value="product_search">Finding a product</option>
                            <option value="service_search">Finding a service</option>
                            <option value="neighbourhood_question">Neighbourhood information</option>
                            <option value="escrow_explanation">Understanding escrow</option>
                            <option value="navigation">Using a website feature</option>
                            <option value="support">Customer support</option>
                            <option value="general">Something else</option>
                          </select>
                          <div>
                            <button type="button" onClick={() => void rateResponse(message.id, false, correctionIntent)} disabled={!correctionIntent}>Send correction</button>
                            <button type="button" onClick={() => void rateResponse(message.id, false)}>Just rate it</button>
                          </div>
                        </div>
                      )}
                    </>
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
