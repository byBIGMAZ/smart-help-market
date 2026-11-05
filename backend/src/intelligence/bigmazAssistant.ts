export type BigmazConversationTurn = {
  sender: 'user' | 'assistant' | 'admin'
  text: string
}

export type BigmazAccountSnapshot = {
  displayName: string | null
  accountStatus: string
  assignedRoles: string[]
  permissions: string[]
  activeRole: string | null
  ownedListings: Array<{
    category: string
    status: string
    count: number
  }>
}

export type BigmazAssistantInput = {
  message: string
  deterministicReply: string
  suggestions: string[]
  actions: Array<{ label: string; path: string }>
  marketplaceMatches: Array<{
    title: string
    category: string
    location: string
    price: string
    priceUnit: string
  }>
  account: BigmazAccountSnapshot
  conversation: BigmazConversationTurn[]
  workflowContext: Record<string, unknown>
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

function readModelContent(payload: ChatCompletionResponse): string | null {
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') return null

  try {
    const parsed = JSON.parse(content) as { reply?: unknown }
    if (typeof parsed.reply !== 'string') return null
    const reply = parsed.reply.trim()
    return reply.length > 0 && reply.length <= 4000 ? reply : null
  } catch {
    return null
  }
}

/**
 * Optional model-backed language and reasoning layer.
 *
 * The deterministic marketplace engine remains the source of truth for
 * permissions, route actions, listing matches and workflow state. The model
 * may only improve the natural-language explanation and follow-up wording.
 */
export async function generateBigmazReply(input: BigmazAssistantInput): Promise<string | null> {
  const apiKey = process.env.BIGMAZ_AI_API_KEY?.trim()
  if (!apiKey) return null

  const baseUrl = (process.env.BIGMAZ_AI_BASE_URL || 'https://api.openai.com/v1/chat/completions').trim()
  const model = (process.env.BIGMAZ_AI_MODEL || 'gpt-4.1-mini').trim()
  let endpoint: URL

  try {
    endpoint = new URL(baseUrl)
  } catch {
    return null
  }

  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') {
    return null
  }
  if (!model || model.length > 120 || apiKey.length > 500) return null

  const systemPrompt = [
    'You are BIGMAZ, the support and marketplace assistant for SMART HELP MARKET, a Nigerian multi-category marketplace.',
    'Understand the user natural language, including informal phrasing, spelling mistakes, indirect descriptions and unusual ways of describing a problem.',
    'Ask one focused follow-up question when a necessary detail is missing. Do not ask for information already present in the conversation or verified account context.',
    'Give practical, numbered steps when explaining how to solve a problem. Keep the steps specific to the stated task and the available application evidence.',
    'Use only the supplied account roles, permissions, conversation, workflow context and marketplace evidence. Never claim that a user has a role or permission that is not listed.',
    'Never tell a user to bypass access controls, use another person account, or open a role workspace they are not assigned.',
    'Do not invent listing records, prices, payment states, bookings, tenant records, support actions, system errors or feature availability.',
    'If the evidence is insufficient to diagnose a problem, explain what is not yet known and ask for the smallest useful detail, such as the exact error text or page where it occurred.',
    'Do not claim that a database record was changed, a payment was made, an inspection was booked, a listing was published or an administrator was contacted unless the supplied evidence explicitly confirms it.',
    'Treat the deterministic response as trusted workflow guidance. Clarify it in natural language without changing its meaning.',
    'Preserve the workflow question and the purpose of the conversation. Do not restart with a generic greeting.',
    'Keep the answer concise but useful. Use plain English suitable for users in Nigeria.',
    'Return only valid JSON with exactly one property: {"reply":"your complete user-facing answer"}. Do not include markdown fences.',
  ].join(' ')

  const userPayload = {
    currentMessage: input.message,
    deterministicGuidance: input.deterministicReply,
    offeredSuggestions: input.suggestions,
    permittedNavigationActions: input.actions,
    verifiedMarketplaceMatches: input.marketplaceMatches,
    verifiedAccount: input.account,
    recentConversation: input.conversation,
    workflowState: input.workflowContext,
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 650,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      }),
      signal: AbortSignal.timeout(7000),
    })

    if (!response.ok) return null
    const payload = await response.json() as ChatCompletionResponse
    return readModelContent(payload)
  } catch {
    // The deterministic assistant must remain available if the AI provider
    // is not configured, times out, or returns an invalid response.
    return null
  }
}
