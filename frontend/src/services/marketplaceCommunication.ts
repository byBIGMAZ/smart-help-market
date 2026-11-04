export type CommunicationRole =
  | 'buyer'
  | 'landlord'
  | 'seller'
  | 'provider'
  | 'agent'

export type EnquiryStatus =
  | 'New'
  | 'Responded'
  | 'In Progress'
  | 'Resolved'
  | 'Closed'

export interface MarketplaceConversation {
  id: string
  role: CommunicationRole
  name: string
  initials: string
  subject: string
  listing: string
  preview: string
  updatedAt: string
  unread: number
  messages: {
    id: string
    sender: 'you' | 'them'
    text: string
    time: string
  }[]
}

export interface MarketplaceEnquiry {
  id: string
  role: CommunicationRole
  subject: string
  listing: string
  sender: string
  senderEmail: string
  message: string
  createdAt: string
  status: EnquiryStatus
}

export interface MarketplaceNotification {
  id: string
  role: CommunicationRole
  title: string
  description: string
  category: 'message' | 'enquiry' | 'booking' | 'order' | 'marketplace'
  createdAt: string
  read: boolean
  link: string
}

const STORAGE_KEY = 'shm-marketplace-communication-v1'

interface CommunicationState {
  conversations: MarketplaceConversation[]
  enquiries: MarketplaceEnquiry[]
  notifications: MarketplaceNotification[]
}

const initialState: CommunicationState = {
  conversations: [
    {
      id: 'conversation-1',
      role: 'buyer',
      name: 'Property Advertiser',
      initials: 'PA',
      subject: 'Self-contained apartment',
      listing: 'Student Self-Contained Apartment',
      preview: 'The apartment is available for inspection.',
      updatedAt: '10:35 AM',
      unread: 2,
      messages: [
        { id: 'm1', sender: 'them', text: 'Hello! Thank you for your interest in the apartment.', time: '10:20 AM' },
        { id: 'm2', sender: 'you', text: 'I would like to know more about the available units.', time: '10:27 AM' },
        { id: 'm3', sender: 'them', text: 'The apartment is available for inspection.', time: '10:35 AM' },
      ],
    },
    {
      id: 'conversation-2',
      role: 'buyer',
      name: 'Electronics Seller',
      initials: 'ES',
      subject: 'HP Core i5 Laptop',
      listing: 'HP Core i5 Laptop',
      preview: 'Yes, the laptop is still available.',
      updatedAt: 'Yesterday',
      unread: 0,
      messages: [
        { id: 'm4', sender: 'you', text: 'Is this laptop still available?', time: 'Yesterday' },
        { id: 'm5', sender: 'them', text: 'Yes, the laptop is still available.', time: 'Yesterday' },
      ],
    },
    {
      id: 'conversation-3',
      role: 'landlord',
      name: 'Prospective Tenant',
      initials: 'PT',
      subject: 'Apartment inspection',
      listing: 'Self-contained property, Ekosodin',
      preview: 'Please let me know the inspection arrangements.',
      updatedAt: '9:15 AM',
      unread: 1,
      messages: [
        { id: 'm6', sender: 'them', text: 'I am interested in inspecting the available unit.', time: '9:10 AM' },
        { id: 'm7', sender: 'you', text: 'Thank you. I will confirm the arrangements.', time: '9:15 AM' },
      ],
    },
    {
      id: 'conversation-4',
      role: 'seller',
      name: 'Marketplace Customer',
      initials: 'MC',
      subject: 'Product availability',
      listing: 'Android smartphone',
      preview: 'Can you confirm the product specifications?',
      updatedAt: 'Yesterday',
      unread: 1,
      messages: [
        { id: 'm8', sender: 'them', text: 'Can you confirm the product specifications?', time: 'Yesterday' },
      ],
    },
    {
      id: 'conversation-5',
      role: 'provider',
      name: 'Service Customer',
      initials: 'SC',
      subject: 'Electrical installation',
      listing: 'Professional electrical services',
      preview: 'I would like to request your service.',
      updatedAt: 'Monday',
      unread: 0,
      messages: [
        { id: 'm9', sender: 'them', text: 'I would like to request your service.', time: 'Monday' },
      ],
    },
    {
      id: 'conversation-6',
      role: 'agent',
      name: 'Property Client',
      initials: 'PC',
      subject: 'Property viewing',
      listing: 'Two-bedroom apartment, GRA',
      preview: 'When can we arrange a viewing?',
      updatedAt: 'Tuesday',
      unread: 1,
      messages: [
        { id: 'm10', sender: 'them', text: 'When can we arrange a viewing?', time: 'Tuesday' },
      ],
    },
  ],
  enquiries: [
    {
      id: 'ENQ-1001',
      role: 'buyer',
      subject: 'Property availability',
      listing: 'Student Self-Contained Apartment',
      sender: 'Property Advertiser',
      senderEmail: 'advertiser@example.com',
      message: 'I would like to know more about the available rooms and arrange an inspection.',
      createdAt: 'Today, 10:20 AM',
      status: 'Responded',
    },
    {
      id: 'ENQ-1002',
      role: 'buyer',
      subject: 'Product specifications',
      listing: 'HP Core i5 Laptop',
      sender: 'Electronics Seller',
      senderEmail: 'seller@example.com',
      message: 'Please confirm the laptop specifications and current availability.',
      createdAt: 'Yesterday',
      status: 'New',
    },
    {
      id: 'ENQ-1003',
      role: 'landlord',
      subject: 'Rental inspection request',
      listing: 'Self-contained property, Ekosodin',
      sender: 'Prospective Tenant',
      senderEmail: 'tenant@example.com',
      message: 'I am interested in inspecting one of your available units.',
      createdAt: 'Today, 9:10 AM',
      status: 'New',
    },
    {
      id: 'ENQ-1004',
      role: 'seller',
      subject: 'Bulk purchase enquiry',
      listing: 'Android smartphone',
      sender: 'Marketplace Customer',
      senderEmail: 'customer@example.com',
      message: 'I would like to enquire about purchasing multiple units.',
      createdAt: 'Yesterday',
      status: 'In Progress',
    },
    {
      id: 'ENQ-1005',
      role: 'provider',
      subject: 'Service booking enquiry',
      listing: 'Electrical installation',
      sender: 'Service Customer',
      senderEmail: 'customer@example.com',
      message: 'Please provide an estimate for an electrical installation.',
      createdAt: 'Monday',
      status: 'Responded',
    },
    {
      id: 'ENQ-1006',
      role: 'agent',
      subject: 'Property viewing enquiry',
      listing: 'Two-bedroom apartment, GRA',
      sender: 'Property Client',
      senderEmail: 'client@example.com',
      message: 'I would like to schedule a property viewing.',
      createdAt: 'Tuesday',
      status: 'New',
    },
  ],
  notifications: [
    {
      id: 'NOT-1001',
      role: 'buyer',
      title: 'New message received',
      description: 'A property advertiser replied to your apartment enquiry.',
      category: 'message',
      createdAt: 'Today, 10:35 AM',
      read: false,
      link: '/buyer/messages',
    },
    {
      id: 'NOT-1002',
      role: 'buyer',
      title: 'Inspection update',
      description: 'Your sample property inspection request has been updated.',
      category: 'booking',
      createdAt: 'Today, 9:30 AM',
      read: false,
      link: '/buyer/inspections',
    },
    {
      id: 'NOT-1003',
      role: 'landlord',
      title: 'New property enquiry',
      description: 'A prospective tenant has requested a property inspection.',
      category: 'enquiry',
      createdAt: 'Today, 9:10 AM',
      read: false,
      link: '/landlord/enquiries',
    },
    {
      id: 'NOT-1004',
      role: 'seller',
      title: 'New customer order',
      description: 'A sample customer order is awaiting review.',
      category: 'order',
      createdAt: 'Yesterday',
      read: false,
      link: '/seller/orders',
    },
    {
      id: 'NOT-1005',
      role: 'provider',
      title: 'New service booking',
      description: 'A customer has submitted a sample service request.',
      category: 'booking',
      createdAt: 'Monday',
      read: true,
      link: '/provider/bookings',
    },
    {
      id: 'NOT-1006',
      role: 'agent',
      title: 'New client enquiry',
      description: 'A prospective client has requested a property viewing.',
      category: 'enquiry',
      createdAt: 'Tuesday',
      read: false,
      link: '/agent/enquiries',
    },
    {
      id: 'NOT-1007',
      role: 'buyer',
      title: 'Welcome to Smart Help Market',
      description: 'Discover properties, products and services in one marketplace.',
      category: 'marketplace',
      createdAt: 'Earlier',
      read: true,
      link: '/explore',
    },
  ],
}

function readState(): CommunicationState {
  if (typeof window === 'undefined') return initialState

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return initialState

    const parsed = JSON.parse(saved) as Partial<CommunicationState>

    return {
      conversations: Array.isArray(parsed.conversations)
        ? parsed.conversations
        : initialState.conversations,
      enquiries: Array.isArray(parsed.enquiries)
        ? parsed.enquiries
        : initialState.enquiries,
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications
        : initialState.notifications,
    }
  } catch {
    return initialState
  }
}

function writeState(state: CommunicationState) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
}

function updateState(
  updater: (current: CommunicationState) => CommunicationState,
): CommunicationState {
  const next = updater(readState())
  writeState(next)
  return next
}

export function getConversations(role: CommunicationRole) {
  return readState().conversations.filter((item) => item.role === role)
}

export function getEnquiries(role: CommunicationRole) {
  return readState().enquiries.filter((item) => item.role === role)
}

export function getNotifications(role: CommunicationRole) {
  return readState().notifications.filter((item) => item.role === role)
}

export function sendMarketplaceMessage(
  conversationId: string,
  message: string,
) {
  const text = message.trim()
  if (!text) return

  updateState((state) => ({
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            preview: text,
            updatedAt: 'Just now',
            messages: [
              ...conversation.messages,
              {
                id: `local-${Date.now()}`,
                sender: 'you',
                text,
                time: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            ],
          }
        : conversation,
    ),
  }))
}

export function markConversationRead(conversationId: string) {
  updateState((state) => ({
    ...state,
    conversations: state.conversations.map((item) =>
      item.id === conversationId ? { ...item, unread: 0 } : item,
    ),
  }))
}

export function updateEnquiryStatus(
  enquiryId: string,
  status: EnquiryStatus,
) {
  updateState((state) => ({
    ...state,
    enquiries: state.enquiries.map((item) =>
      item.id === enquiryId ? { ...item, status } : item,
    ),
  }))
}

export function markNotificationRead(notificationId: string) {
  updateState((state) => ({
    ...state,
    notifications: state.notifications.map((item) =>
      item.id === notificationId ? { ...item, read: true } : item,
    ),
  }))
}

export function markAllNotificationsRead(role: CommunicationRole) {
  updateState((state) => ({
    ...state,
    notifications: state.notifications.map((item) =>
      item.role === role ? { ...item, read: true } : item,
    ),
  }))
}
