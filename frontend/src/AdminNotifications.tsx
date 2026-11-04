
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import {
  createAdminAnnouncement,
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  type AdminNotification,
  type AdminNotificationType,
} from './services/adminNotifications'

import './AdminNotifications.css'

interface AdminNotificationsProps {
  canManage: boolean
  onNotice?: (message: string) => void
  onUnreadCountChange?: (count: number) => void
}

const PAGE_SIZE = 20

const notificationTypes: {
  value: AdminNotificationType
  label: string
}[] = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'general', label: 'General' },
  { value: 'system', label: 'System update' },
  { value: 'security', label: 'Security alert' },
  { value: 'moderation', label: 'Moderation' },
]

function formatNotificationDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return date.toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function AdminNotifications({
  canManage,
  onNotice,
  onUnreadCountChange,
}: AdminNotificationsProps) {
  const [notifications, setNotifications] = useState<
    AdminNotification[]
  >([])

  const [unreadCount, setUnreadCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)

  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')

  const [showComposer, setShowComposer] = useState(false)
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementMessage, setAnnouncementMessage] = useState('')
  const [announcementType, setAnnouncementType] =
    useState<AdminNotificationType>('announcement')

  const [composerError, setComposerError] = useState('')

const fetchNotifications = useCallback(
  async (requestedPage: number) => {
    return await getAdminNotifications(
      requestedPage,
      PAGE_SIZE,
    )
  },
  [],
)

const loadNotifications = useCallback(
  async (requestedPage = page) => {
    setLoading(true)
    setError('')

    try {
      const result = await fetchNotifications(requestedPage)

      setNotifications(result.notifications)
      setUnreadCount(result.unreadCount)
      onUnreadCountChange?.(result.unreadCount)
      setTotal(result.pagination.total)
      setTotalPages(result.pagination.totalPages)
      setPage(result.pagination.page)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load administrator notifications.',
      )
    } finally {
      setLoading(false)
    }
  },
  [page, onUnreadCountChange, fetchNotifications],
)

useEffect(() => {
  let active = true

  fetchNotifications(1)
    .then(result => {
      if (active) {
        setNotifications(result.notifications)
        setUnreadCount(result.unreadCount)
        onUnreadCountChange?.(result.unreadCount)
        setTotal(result.pagination.total)
        setTotalPages(result.pagination.totalPages)
        setPage(result.pagination.page)
        setError('')
      }
    })
    .catch(err => {
      if (active) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load administrator notifications.',
        )
      }
    })
    .finally(() => {
      if (active) {
        setLoading(false)
      }
    })

  return () => {
    active = false
  }
}, [fetchNotifications, onUnreadCountChange])

  async function handleMarkRead(notification: AdminNotification) {
    if (notification.read_at || actionLoading) return

    setActionLoading(true)
    setError('')

    try {
      await markAdminNotificationRead(notification.id)
      await loadNotifications(page)
      onNotice?.('Notification marked as read.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update this notification.',
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0 || actionLoading) return

    setActionLoading(true)
    setError('')

    try {
      await markAllAdminNotificationsRead()
      await loadNotifications(page)
      onNotice?.('All administrator notifications marked as read.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to mark notifications as read.',
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCreateAnnouncement(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!canManage || actionLoading) return

    const title = announcementTitle.trim()
    const message = announcementMessage.trim()

    if (!title || !message) {
      setComposerError('Enter both a title and message.')
      return
    }

    setActionLoading(true)
    setComposerError('')
    setError('')

    try {
      await createAdminAnnouncement({
        title,
        message,
        type: announcementType,
      })

      setAnnouncementTitle('')
      setAnnouncementMessage('')
      setAnnouncementType('announcement')
      setShowComposer(false)

      await loadNotifications(1)

      onNotice?.('Administrator announcement published successfully.')
    } catch (err) {
      setComposerError(
        err instanceof Error
          ? err.message
          : 'Unable to publish the announcement.',
      )
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <section className="admin-notifications-section">
      <div className="admin-notifications-heading">
        <div>
          <span className="admin-kicker">
            ADMINISTRATIVE COMMUNICATIONS
          </span>

          <h2>Notification Centre</h2>

          <p>
            View important marketplace alerts and administrator
            announcements.
          </p>
        </div>

        <button
          type="button"
          className="admin-secondary-button"
          onClick={() => void loadNotifications(page)}
          disabled={loading || actionLoading}
        >
          ↻ Refresh
        </button>
      </div>

      <div className="admin-notification-stats">
        <article>
          <span className="admin-notification-stat-icon">♧</span>
          <div>
            <strong>{unreadCount}</strong>
            <span>Unread notifications</span>
          </div>
        </article>

        <article>
          <span className="admin-notification-stat-icon">▤</span>
          <div>
            <strong>{total}</strong>
            <span>Total notifications</span>
          </div>
        </article>
      </div>

      <div className="admin-notification-toolbar">
        <div>
          <h3>Notification history</h3>
          <p>Latest administrator-wide messages appear first.</p>
        </div>

        <div className="admin-notification-toolbar-actions">
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => void handleMarkAllRead()}
            disabled={unreadCount === 0 || actionLoading}
          >
            Mark all as read
          </button>

          {canManage && (
            <button
              type="button"
              className="admin-primary-button"
              onClick={() => {
                setShowComposer((current) => !current)
                setComposerError('')
              }}
            >
              {showComposer ? 'Close composer' : '+ New announcement'}
            </button>
          )}
        </div>
      </div>

      {showComposer && canManage && (
        <form
          className="admin-notification-composer"
          onSubmit={handleCreateAnnouncement}
        >
          <div>
            <span className="admin-kicker">NEW ADMINISTRATOR MESSAGE</span>
            <h3>Create announcement</h3>
            <p>
              This message will be visible to administrators with
              notification viewing permission.
            </p>
          </div>

          <label className="admin-notification-field">
            Announcement title
            <input
              type="text"
              value={announcementTitle}
              onChange={(event) =>
                setAnnouncementTitle(event.target.value)
              }
              maxLength={150}
              placeholder="Enter announcement title"
              required
            />
            <small>{announcementTitle.length}/150 characters</small>
          </label>

          <label className="admin-notification-field">
            Notification type
            <select
              value={announcementType}
              onChange={(event) =>
                setAnnouncementType(
                  event.target.value as AdminNotificationType,
                )
              }
            >
              {notificationTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-notification-field">
            Message
            <textarea
              value={announcementMessage}
              onChange={(event) =>
                setAnnouncementMessage(event.target.value)
              }
              maxLength={10000}
              rows={6}
              placeholder="Write your administrator announcement..."
              required
            />
            <small>
              {announcementMessage.length.toLocaleString()}/10,000
              characters
            </small>
          </label>

          {composerError && (
            <div className="admin-message admin-error" role="alert">
              {composerError}
            </div>
          )}

          <div className="admin-notification-form-actions">
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => setShowComposer(false)}
              disabled={actionLoading}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="admin-primary-button"
              disabled={actionLoading}
            >
              {actionLoading ? 'Publishing…' : 'Publish announcement'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="admin-message admin-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="admin-notification-empty">
          Loading notifications…
        </div>
      ) : notifications.length === 0 ? (
        <div className="admin-notification-empty">
          <span aria-hidden="true">♧</span>
          <h3>No notifications yet</h3>
          <p>
            Important administrator announcements and system alerts
            will appear here.
          </p>
        </div>
      ) : (
        <div className="admin-notification-list">
          {notifications.map((notification) => {
            const isRead = Boolean(notification.read_at)

            return (
              <article
                key={notification.id}
                className={`admin-notification-card ${
                  isRead ? 'is-read' : 'is-unread'
                }`}
              >
                <div className="admin-notification-card-top">
                  <div className="admin-notification-type">
                    <span
                      className={`admin-notification-dot ${
                        isRead ? 'is-read' : 'is-unread'
                      }`}
                    />
                    {notification.type.replace(/[_-]/g, ' ')}
                  </div>

                  <time>
                    {formatNotificationDate(notification.created_at)}
                  </time>
                </div>

                <h3>{notification.title}</h3>

                <p className="admin-notification-message">
                  {notification.message}
                </p>

                <div className="admin-notification-card-bottom">
                  <span className={isRead ? 'read-label' : 'unread-label'}>
                    {isRead ? 'Read' : 'Unread'}
                  </span>

                  {!isRead && (
                    <button
                      type="button"
                      className="admin-notification-read-button"
                      onClick={() => void handleMarkRead(notification)}
                      disabled={actionLoading}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="admin-notification-pagination">
          <span>
            Page {page} of {totalPages}
          </span>

          <div>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => void loadNotifications(page - 1)}
              disabled={page <= 1 || actionLoading}
            >
              ← Previous
            </button>

            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => void loadNotifications(page + 1)}
              disabled={page >= totalPages || actionLoading}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default AdminNotifications
