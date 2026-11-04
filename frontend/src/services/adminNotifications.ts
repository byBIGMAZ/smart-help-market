
export type AdminNotificationType =
  | 'general'
  | 'announcement'
  | 'system'
  | 'security'
  | 'moderation'

export interface AdminNotification {
  id: string
  type: AdminNotificationType
  title: string
  message: string
  metadata: Record<string, unknown>
  created_at: string
  read_at: string | null
}

export interface AdminNotificationList {
  notifications: AdminNotification[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  unreadCount: number
}

async function readResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof data.error === 'string'
        ? data.error
        : `Request failed with HTTP ${response.status}`

    throw new Error(message)
  }

  return data as T
}

export async function getAdminNotifications(
  page = 1,
  pageSize = 20,
): Promise<AdminNotificationList> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })

  const response = await fetch(
    `/api/admin/notifications?${params.toString()}`,
    {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
  )

  return readResponse<AdminNotificationList>(response)
}

export async function getAdminNotificationUnreadCount(): Promise<number> {
  const response = await fetch(
    '/api/admin/notifications/unread-count',
    {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
  )

  const data = await readResponse<{ unreadCount: number }>(response)

  return data.unreadCount
}

export async function markAdminNotificationRead(
  notificationId: string,
): Promise<void> {
  const response = await fetch(
    `/api/admin/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
  )

  await readResponse<{ message: string }>(response)
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  const response = await fetch(
    '/api/admin/notifications/read-all',
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
  )

  await readResponse<{
    message: string
    updated: number
  }>(response)
}

export async function createAdminAnnouncement(input: {
  title: string
  message: string
  type: AdminNotificationType
}): Promise<void> {
  const response = await fetch('/api/admin/notifications', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  await readResponse<{
    message: string
    notification: AdminNotification
  }>(response)
}
