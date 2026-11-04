import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  getConversations,
  getEnquiries,
  getNotifications,
  markAllNotificationsRead,
  markConversationRead,
  markNotificationRead,
  sendMarketplaceMessage,
  updateEnquiryStatus,
  type CommunicationRole,
  type EnquiryStatus,
  type MarketplaceConversation,
  type MarketplaceEnquiry,
  type MarketplaceNotification,
} from '../../services/marketplaceCommunication'
import '../../styles/communication.css'

type CommunicationSection = 'messages' | 'enquiries' | 'notifications'

type TemporaryMediaPreview = {
  name: string
  type: string
  url: string
}

const roleNames: Record<CommunicationRole, string> = {
  buyer: 'Buyer',
  landlord: 'Landlord',
  seller: 'Seller',
  provider: 'Service Provider',
  agent: 'Agent',
}

const enquiryStatuses: EnquiryStatus[] = [
  'New',
  'Responded',
  'In Progress',
  'Resolved',
  'Closed',
]

const notificationIcons: Record<MarketplaceNotification['category'], string> = {
  message: '✉',
  enquiry: '⌕',
  booking: '▦',
  order: '▣',
  marketplace: '✦',
}

export default function CommunicationPage() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)

  const role = (parts[0] in roleNames ? parts[0] : 'buyer') as CommunicationRole
  const section = (parts[1] || 'messages') as CommunicationSection

  const [conversations, setConversations] = useState<MarketplaceConversation[]>([])
  const [enquiries, setEnquiries] = useState<MarketplaceEnquiry[]>([])
  const [notifications, setNotifications] = useState<MarketplaceNotification[]>([])
  const [selectedConversation, setSelectedConversation] = useState('')
  const [selectedEnquiry, setSelectedEnquiry] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [notice, setNotice] = useState('')
  const [mediaPreview, setMediaPreview] = useState<TemporaryMediaPreview | null>(null)

  useEffect(() => {
    return () => {
      if (mediaPreview?.url) URL.revokeObjectURL(mediaPreview.url)
    }
  }, [mediaPreview?.url])

  function selectTemporaryMedia(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setNotice('Choose an image or video file.')
      event.target.value = ''
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      setNotice('Media preview limit is 20 MB.')
      event.target.value = ''
      return
    }

    setMediaPreview({
      name: file.name,
      type: file.type,
      url: URL.createObjectURL(file),
    })
    setNotice('Temporary local preview only. This media has not been uploaded or delivered.')
  }

  function removeTemporaryMedia() {
    setMediaPreview(null)
  }


  function refresh() {
    const nextConversations = getConversations(role)
    setConversations(nextConversations)
    setEnquiries(getEnquiries(role))
    setNotifications(getNotifications(role))

    if (!selectedConversation && nextConversations.length > 0) {
      setSelectedConversation(nextConversations[0].id)
    }
  }

  useEffect(() => {
    const nextConversations = getConversations(role)
    setConversations(nextConversations)
    setEnquiries(getEnquiries(role))
    setNotifications(getNotifications(role))
    setSelectedConversation(nextConversations[0]?.id || '')
    setSelectedEnquiry('')
    setSearch('')
    setFilter('All')
    setNotice('')
  }, [role, section])

  const currentConversation = conversations.find(
    (item) => item.id === selectedConversation,
  )

  const currentEnquiry = enquiries.find(
    (item) => item.id === selectedEnquiry,
  )

  const filteredConversations = useMemo(
    () => conversations.filter((item) =>
      `${item.name} ${item.subject} ${item.listing} ${item.preview}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
    [conversations, search],
  )

  const filteredEnquiries = enquiries.filter((item) => {
    const matchesSearch =
      `${item.id} ${item.subject} ${item.listing} ${item.sender}`
        .toLowerCase()
        .includes(search.toLowerCase())

    return matchesSearch && (filter === 'All' || item.status === filter)
  })

  const filteredNotifications = notifications.filter((item) => {
    const matchesSearch =
      `${item.title} ${item.description} ${item.category}`
        .toLowerCase()
        .includes(search.toLowerCase())

    return matchesSearch && (
      filter === 'All' ||
      (filter === 'Unread' && !item.read) ||
      (filter === 'Read' && item.read) ||
      item.category === filter
    )
  })

  const unreadMessages = conversations.reduce(
    (total, item) => total + item.unread,
    0,
  )
  const unreadNotifications = notifications.filter((item) => !item.read).length
  const openEnquiries = enquiries.filter(
    (item) => !['Resolved', 'Closed'].includes(item.status),
  ).length

  function openConversation(conversation: MarketplaceConversation) {
    setSelectedConversation(conversation.id)
    markConversationRead(conversation.id)
    refresh()
  }

  async function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentConversation || !message.trim()) return

    try {
      const policyResponse = await fetch('/api/messages/validate', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      })

      const policyResult: unknown = await policyResponse.json().catch(() => null)

      if (!policyResponse.ok) {
        const reason =
          typeof policyResult === 'object' &&
          policyResult !== null &&
          'reason' in policyResult &&
          typeof policyResult.reason === 'string'
            ? policyResult.reason
            : 'The marketplace could not approve this message.'
        setNotice(reason)
        return
      }
    } catch {
      setNotice('Server contact checks are unavailable. Your message was not added.')
      return
    }

    sendMarketplaceMessage(currentConversation.id, message)
    setMessage('')
    setNotice('Message added to this local demonstration conversation.')
    refresh()
  }

  function changeEnquiryStatus(id: string, status: EnquiryStatus) {
    updateEnquiryStatus(id, status)
    refresh()
    setNotice(`Enquiry status updated to ${status}.`)
  }

  function openNotification(notification: MarketplaceNotification) {
    markNotificationRead(notification.id)
    refresh()
  }

  const sectionTitle = section === 'messages'
    ? 'Messages'
    : section === 'enquiries'
      ? 'Enquiries'
      : 'Notifications'

  return (
    <main className="extended-page communication-page">
      <header className="communication-heading">
        <div>
          <span className="extended-kicker">{roleNames[role]} COMMUNICATION CENTRE</span>
          <h1>{sectionTitle}</h1>
          <p>
            {section === 'messages'
              ? 'Stay connected with people across your marketplace activity.'
              : section === 'enquiries'
                ? 'Review enquiries and manage your marketplace conversations.'
                : 'Keep track of important updates from your marketplace activity.'}
          </p>
        </div>
        <Link to={`/${role}/dashboard`} className="extended-secondary">
          Back to dashboard
        </Link>
      </header>

      <nav className="communication-tabs" aria-label="Communication navigation">
        <Link className={section === 'messages' ? 'active' : ''} to={`/${role}/messages`}>
          <span>✉</span> Messages
          {unreadMessages > 0 && <small>{unreadMessages}</small>}
        </Link>
        <Link className={section === 'enquiries' ? 'active' : ''} to={`/${role}/enquiries`}>
          <span>⌕</span> Enquiries
          {openEnquiries > 0 && <small>{openEnquiries}</small>}
        </Link>
        <Link className={section === 'notifications' ? 'active' : ''} to={`/${role}/notifications`}>
          <span>♧</span> Notifications
          {unreadNotifications > 0 && <small>{unreadNotifications}</small>}
        </Link>
      </nav>

      <section className="communication-content">
        {section === 'messages' && (
          <div className="communication-messages">
            <aside className="communication-inbox">
              <div className="communication-panel-heading">
                <div>
                  <h2>Inbox</h2>
                  <p>{conversations.length} conversations</p>
                </div>
                <span>{unreadMessages} unread</span>
              </div>

              <input
                className="communication-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations..."
                aria-label="Search conversations"
              />

              <div className="communication-conversation-list">
                {filteredConversations.map((conversation) => (
                  <button
                    type="button"
                    key={conversation.id}
                    className={`communication-conversation ${selectedConversation === conversation.id ? 'selected' : ''}`}
                    onClick={() => openConversation(conversation)}
                  >
                    <span className="communication-avatar">{conversation.initials}</span>
                    <span className="communication-conversation-info">
                      <strong>{conversation.name}</strong>
                      <small>{conversation.subject}</small>
                      <span>{conversation.preview}</span>
                    </span>
                    <span className="communication-conversation-meta">
                      <small>{conversation.updatedAt}</small>
                      {conversation.unread > 0 && (
                        <b>{conversation.unread}</b>
                      )}
                    </span>
                  </button>
                ))}

                {filteredConversations.length === 0 && (
                  <div className="communication-empty">
                    No conversations match your search.
                  </div>
                )}
              </div>
            </aside>

            <section className="communication-chat">
              {currentConversation ? (
                <>
                  <header className="communication-chat-heading">
                    <span className="communication-avatar">
                      {currentConversation.initials}
                    </span>
                    <div className="communication-participant">
                      <strong>{currentConversation.name}</strong>
                      <small>{currentConversation.listing}</small>
                      <span className="communication-presence">
                        <i aria-hidden="true" />
                        Active recently
                      </span>
                    </div>
                    <span className="communication-demo-tag">DEMO</span>
                  </header>

                  <div className="communication-chat-context">
                    <span>Conversation about</span>
                    <strong>{currentConversation.subject}</strong>
                    <Link
                      className="communication-listing-reference"
                      to={`/explore?search=${encodeURIComponent(currentConversation.listing)}`}
                      title="Find this listing in the marketplace"
                    >
                      <span aria-hidden="true">⌂</span>
                      <span>
                        <small>Referenced marketplace listing</small>
                        <strong>{currentConversation.listing}</strong>
                      </span>
                      <span aria-hidden="true">↗</span>
                    </Link>
                  </div>

                  <div className="communication-chat-messages">
                    {currentConversation.messages.map((item) => (
                      <div
                        key={item.id}
                        className={`communication-bubble-row ${item.sender === 'you' ? 'sent' : 'received'}`}
                      >
                        <div className="communication-bubble">
                          <p>{item.text}</p>
                          <small>{item.time}</small>
                        </div>
                      </div>
                    ))}
                  </div>

                  {mediaPreview && (
                    <div className="communication-media-preview">
                      {mediaPreview.type.startsWith('video/') ? (
                        <video src={mediaPreview.url} controls />
                      ) : (
                        <img src={mediaPreview.url} alt="Temporary message attachment preview" />
                      )}
                      <div>
                        <strong>{mediaPreview.name}</strong>
                        <small>Local preview only. Not uploaded.</small>
                        <button type="button" onClick={removeTemporaryMedia}>Remove</button>
                      </div>
                    </div>
                  )}

                  <form className="communication-compose" onSubmit={submitMessage}>
                    <label className="communication-attach-control" title="Choose a temporary photo or video">
                      <span aria-hidden="true">＋</span>
                      <span className="sr-only">Attach photo or video</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={selectTemporaryMedia}
                        aria-label="Choose a photo or video"
                      />
                    </label>
                    <input
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="Write a message..."
                      aria-label="Write a message"
                      required
                    />
                    <button type="submit" disabled={!message.trim()}>
                      Send <span>➤</span>
                    </button>
                  </form>
                </>
              ) : (
                <div className="communication-empty communication-chat-empty">
                  <span>✉</span>
                  <strong>Select a conversation</strong>
                  <p>Choose a conversation from your inbox to view messages.</p>
                </div>
              )}
            </section>
          </div>
        )}

        {section === 'enquiries' && (
          <div className="communication-record-section">
            <div className="communication-record-summary">
              <article><span>Total enquiries</span><strong>{enquiries.length}</strong></article>
              <article><span>Awaiting action</span><strong>{openEnquiries}</strong></article>
              <article><span>Resolved</span><strong>{enquiries.filter((item) => item.status === 'Resolved').length}</strong></article>
            </div>

            <div className="communication-toolbar">
              <input
                className="communication-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search enquiries..."
                aria-label="Search enquiries"
              />
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Filter enquiries by status"
              >
                <option value="All">All statuses</option>
                {enquiryStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="communication-enquiry-layout">
              <div className="communication-enquiry-list">
                {filteredEnquiries.map((enquiry) => (
                  <button
                    type="button"
                    key={enquiry.id}
                    className={`communication-enquiry-card ${selectedEnquiry === enquiry.id ? 'selected' : ''}`}
                    onClick={() => setSelectedEnquiry(enquiry.id)}
                  >
                    <div>
                      <span className="communication-enquiry-id">{enquiry.id}</span>
                      <span className={`communication-status status-${enquiry.status.toLowerCase().replaceAll(' ', '-')}`}>
                        {enquiry.status}
                      </span>
                    </div>
                    <strong>{enquiry.subject}</strong>
                    <span>{enquiry.listing}</span>
                    <small>From {enquiry.sender} · {enquiry.createdAt}</small>
                  </button>
                ))}

                {filteredEnquiries.length === 0 && (
                  <div className="communication-empty">No enquiries found.</div>
                )}
              </div>

              <section className="communication-enquiry-detail">
                {currentEnquiry ? (
                  <>
                    <span className="extended-kicker">ENQUIRY DETAILS</span>
                    <h2>{currentEnquiry.subject}</h2>
                    <span className="communication-enquiry-id">{currentEnquiry.id}</span>

                    <div className="communication-detail-grid">
                      <div><small>From</small><strong>{currentEnquiry.sender}</strong></div>
                      <div><small>Email</small><strong>{currentEnquiry.senderEmail}</strong></div>
                      <div><small>Related listing</small><strong>{currentEnquiry.listing}</strong></div>
                      <div><small>Received</small><strong>{currentEnquiry.createdAt}</strong></div>
                    </div>

                    <div className="communication-enquiry-message">
                      <strong>Enquiry message</strong>
                      <p>{currentEnquiry.message}</p>
                    </div>

                    <label className="communication-status-control">
                      Update enquiry status
                      <select
                        value={currentEnquiry.status}
                        onChange={(event) => changeEnquiryStatus(
                          currentEnquiry.id,
                          event.target.value as EnquiryStatus,
                        )}
                      >
                        {enquiryStatuses.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>

                    <Link
                      className="communication-reply-link"
                      to={`/${role}/messages`}
                    >
                      Open messages <span>→</span>
                    </Link>
                  </>
                ) : (
                  <div className="communication-empty">
                    <span>⌕</span>
                    <strong>Select an enquiry</strong>
                    <p>Choose an enquiry to review its details and update its status.</p>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {section === 'notifications' && (
          <div className="communication-record-section">
            <div className="communication-notification-summary">
              <div>
                <span className="extended-kicker">YOUR UPDATES</span>
                <h2>Notification centre</h2>
                <p>{unreadNotifications} unread notifications</p>
              </div>
              <button
                type="button"
                className="communication-mark-all"
                disabled={unreadNotifications === 0}
                onClick={() => {
                  markAllNotificationsRead(role)
                  refresh()
                  setNotice('All notifications have been marked as read.')
                }}
              >
                Mark all as read
              </button>
            </div>

            <div className="communication-toolbar">
              <input
                className="communication-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notifications..."
                aria-label="Search notifications"
              />
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Filter notifications"
              >
                <option value="All">All notifications</option>
                <option value="Unread">Unread only</option>
                <option value="Read">Read only</option>
                <option value="message">Messages</option>
                <option value="enquiry">Enquiries</option>
                <option value="booking">Bookings</option>
                <option value="order">Orders</option>
                <option value="marketplace">Marketplace updates</option>
              </select>
            </div>

            <div className="communication-notification-list">
              {filteredNotifications.map((notification) => (
                <article
                  className={`communication-notification ${notification.read ? '' : 'unread'}`}
                  key={notification.id}
                >
                  <span className="communication-notification-icon">
                    {notificationIcons[notification.category]}
                  </span>
                  <div className="communication-notification-body">
                    <strong>{notification.title}</strong>
                    <p>{notification.description}</p>
                    <small>{notification.createdAt} · {notification.category}</small>
                  </div>
                  <div className="communication-notification-actions">
                    {!notification.read && <span className="communication-unread-dot" />}
                    <Link
                      to={notification.link}
                      onClick={() => openNotification(notification)}
                    >
                      Open <span>→</span>
                    </Link>
                    {!notification.read && (
                      <button
                        type="button"
                        onClick={() => {
                          markNotificationRead(notification.id)
                          refresh()
                        }}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </article>
              ))}

              {filteredNotifications.length === 0 && (
                <div className="communication-empty">
                  <span>♧</span>
                  <strong>No notifications found</strong>
                  <p>There are no notifications matching your current filters.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {notice && (
        <div className="communication-notice" role="status">
          <span>✓</span> {notice}
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button>
        </div>
      )}

      <p className="communication-disclaimer">
        Demonstration only. Messages, enquiries and notification changes are
        stored locally in this browser. They are not delivered to other users
        or connected to live marketplace accounts.
      </p>
    </main>
  )
}
