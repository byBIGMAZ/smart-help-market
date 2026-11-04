export interface HelpUsage {
  used: number
  limit: number
  remaining: number
  period: string
}

export interface HelpMessage {
  id: string
  sender: 'user' | 'assistant' | 'admin'
  text: string
  metadata?: {
    suggestions?: string[]
    actions?: Array<{ label: string; path: string }>
    matches?: Array<{
      key: string
      title: string
      category: string
      location: string
      price: string
      priceUnit: string
      icon: string
      isDemo: boolean
    }>
  }
  createdAt: string
}

export interface HelpConversation {
  id: string
  title: string
  status: 'open' | 'needs_admin' | 'resolved'
  createdAt: string
  updatedAt: string
}

async function readApi<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `Help Centre request failed (HTTP ${response.status}).`
    throw new Error(message)
  }
  return data as T
}

export async function getHelpStatus(): Promise<HelpUsage & { enabled: boolean }> {
  return readApi<HelpUsage & { enabled: boolean }>(await fetch('/api/help-centre/status', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }))
}

export async function getHelpConversations(): Promise<HelpConversation[]> {
  const data = await readApi<{ conversations: HelpConversation[] }>(
    await fetch('/api/help-centre/conversations', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }),
  )
  return data.conversations
}

export async function getHelpConversationMessages(id: string): Promise<HelpMessage[]> {
  const data = await readApi<{ messages: HelpMessage[] }>(
    await fetch(`/api/help-centre/conversations/${encodeURIComponent(id)}/messages`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }),
  )
  return data.messages
}

export async function sendHelpMessage(message: string, conversationId?: string, currentPath?: string) {
  return readApi<{
    conversationId: string
    assistantMessageId: string
    reply: string
    suggestions: string[]
    actions: Array<{ label: string; path: string }>
    matches: NonNullable<HelpMessage['metadata']>['matches']
    needsAdmin: boolean
    usage: HelpUsage
  }>(
    await fetch('/api/help-centre/chat', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}), ...(currentPath ? { currentPath } : {}) }),
    }),
  )
}

export async function submitHelpFeedback(assistantMessageId: string, helpful: boolean, correctedIntent?: string) {
  return readApi<{ status: string; message: string }>(
    await fetch('/api/help-centre/feedback', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantMessageId, helpful, ...(correctedIntent ? { correctedIntent } : {}) }),
    }),
  )
}

export async function createHelpSupportCase(input: {
  conversationId: string
  subject: string
  details: string
}) {
  return readApi<{ status: string; caseId: string; message: string }>(
    await fetch('/api/help-centre/support-cases', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}
