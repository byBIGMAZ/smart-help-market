import { Router, type Request, type Response } from 'express'
import { getDatabasePool } from '../database'
import { requireAuthenticatedSession } from '../auth/requireAuthenticatedSession'
import { requirePermission } from '../auth/requirePermission'

const router = Router()
const MAX_MESSAGE_LENGTH = 1200

type ListingMatch = {
  key: string
  title: string
  category: string
  location: string
  price: string
  priceUnit: string
  icon: string
  isDemo: boolean
}

type SuggestedAction = { label: string; path: string }
type AssistantResult = {
  text: string
  suggestions?: string[]
  actions?: SuggestedAction[]
  matches?: ListingMatch[]
  needsAdmin?: boolean
  context?: Record<string, unknown>
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

async function getSetting(key: string, fallback: unknown): Promise<unknown> {
  const result = await getDatabasePool().query<{ setting_value: unknown }>(
    'SELECT setting_value FROM public.platform_settings WHERE setting_key = $1 LIMIT 1',
    [key],
  )
  return result.rows[0]?.setting_value ?? fallback
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9₦\s-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function routeForRequest(message: string, roles: string[], preferredRole?: string): SuggestedAction[] {
  const text = normalize(message)
  const validRoles = ['buyer', 'landlord', 'seller', 'provider', 'agent']
  const role = preferredRole && validRoles.includes(preferredRole) && roles.includes(preferredRole)
    ? preferredRole
    : validRoles.find((item) => roles.includes(item)) || 'buyer'
  const roleListingPath = role === 'landlord' ? '/landlord/properties' : role === 'seller' ? '/seller/products' : role === 'provider' ? '/provider/services' : role === 'agent' ? '/agent/listings' : '/buyer/saved'
  const routes: Array<{ terms: string[]; label: string; path: string }> = [
    { terms: ['create community post', 'publish a post', 'new community post'], label: 'Create a community post', path: `/${role}/community/new` },
    { terms: ['neighbourhood', 'neighborhood', 'neighboarhood', 'community space', 'community'], label: 'Open neighbourhood space', path: `/${role}/community` },
    { terms: ['saved', 'favourite', 'favorite', 'wishlist'], label: 'Open saved items', path: '/buyer/saved' },
    { terms: ['my message', 'messages', 'inbox', 'chat'], label: 'Open messages', path: `/${role}/messages` },
    { terms: ['notification', 'alerts'], label: 'Open notifications', path: `/${role}/notifications` },
    { terms: ['my profile', 'edit profile', 'profile'], label: 'Open my profile', path: `/${role}/profile` },
    { terms: ['account', 'account settings'], label: 'Open account overview', path: `/${role}/account` },
    { terms: ['privacy', 'preferences'], label: 'Open privacy and preferences', path: `/${role}/privacy-settings` },
    { terms: ['inspection', 'visit property'], label: 'Open inspections', path: `/${role}/inspections` },
    { terms: ['enquiry', 'enquiries', 'my enquiries'], label: 'Open enquiries', path: `/${role}/enquiries` },
    { terms: ['transaction', 'transactions', 'purchase history'], label: 'Open transactions', path: '/buyer/transactions' },
    { terms: ['roommate', 'room mate', 'shared accommodation'], label: 'Open roommate matching', path: '/buyer/roommates' },
    { terms: ['tenant', 'tenants'], label: 'Open tenant management', path: '/landlord/tenants' },
    { terms: ['complaint', 'complaints'], label: 'Open complaints', path: '/landlord/complaints' },
    { terms: ['notice', 'notices', 'warning'], label: 'Open notices and warnings', path: '/landlord/notices' },
    { terms: ['review', 'reviews', 'dispute', 'disputes'], label: 'Open reviews and disputes', path: '/landlord/reviews' },
    { terms: ['rent payment', 'rent and renewal', 'renewal', 'arrears'], label: 'Open rent and renewals', path: '/landlord/rent' },
    { terms: ['maintenance', 'repair'], label: 'Open maintenance', path: '/landlord/maintenance' },
    { terms: ['my properties', 'manage properties', 'property portfolio'], label: 'Manage properties', path: '/landlord/properties' },
    { terms: ['add property', 'list property', 'post property'], label: 'Create a property listing', path: '/landlord/properties/new' },
    { terms: ['my products', 'manage products', 'inventory'], label: 'Open products and inventory', path: '/seller/products' },
    { terms: ['add product', 'list product'], label: 'Add a product', path: '/seller/products/new' },
    { terms: ['orders', 'my sales'], label: 'Open orders', path: '/seller/orders' },
    { terms: ['bookings', 'my services'], label: 'Open bookings and services', path: '/provider/bookings' },
    { terms: ['availability', 'working hours', 'schedule'], label: 'Manage service availability', path: '/provider/availability' },
    { terms: ['add service', 'list service'], label: 'Add a service', path: '/provider/services/new' },
    { terms: ['my listings', 'manage listings'], label: 'Open my listings', path: roleListingPath },
    { terms: ['clients'], label: 'Open clients', path: '/agent/clients' },
    { terms: ['commission', 'commissions', 'earnings'], label: 'Open commissions and earnings', path: '/agent/commissions' },
    { terms: ['dashboard', 'overview'], label: 'Open dashboard', path: `/${role}/dashboard` },
    { terms: ['browse', 'explore marketplace', 'marketplace'], label: 'Explore marketplace', path: '/explore' },
    { terms: ['category', 'categories'], label: 'Browse categories', path: '/categories' },
    { terms: ['help centre', 'help center', 'support'], label: 'Open Help Centre', path: '/help' },
  ]
  const match = routes.find((item) => item.terms.some((term) => text.includes(term)))
  return match ? [{ label: match.label, path: match.path }] : []
}

function amountFrom(value: string, unit = ''): number {
  const amount = Number(value.replace(/,/g, ''))
  if (!Number.isFinite(amount)) return 0
  const normalizedUnit = unit.toLowerCase()
  if (normalizedUnit === 'k' || normalizedUnit === 'thousand') return amount * 1000
  if (normalizedUnit === 'm' || normalizedUnit === 'million') return amount * 1000000
  return amount
}

function parseBudget(text: string): { min: number | null; max: number | null } {
  const range = text.match(/(?:between|from)?\\s*₦?([\d,.]+)\\s*(k|m|million|thousand)?\\s*(?:to|and|-)\\s*₦?([\d,.]+)\\s*(k|m|million|thousand)?/i)
  if (range) return { min: amountFrom(range[1], range[2] || ''), max: amountFrom(range[3], range[4] || range[2] || '') }
  const maximum = text.match(/(?:under|below|less than|up to|maximum|max|within)\\s*₦?([\d,.]+)\\s*(k|m|million|thousand)?/i)
  if (maximum) return { min: null, max: amountFrom(maximum[1], maximum[2] || '') }
  const minimum = text.match(/(?:above|over|more than|at least)\\s*₦?([\d,.]+)\\s*(k|m|million|thousand)?/i)
  if (minimum) return { min: amountFrom(minimum[1], minimum[2] || ''), max: null }
  return { min: null, max: null }
}

async function answerMessage(rawMessage: string, context: Record<string, unknown>, roles: string[], preferredRole?: string): Promise<AssistantResult> {
  const message = normalize(rawMessage)
  const nextContext = { ...context }
  let searchText = rawMessage
  const awaiting = typeof context.awaiting === 'string' ? context.awaiting : ''

  if (awaiting === 'location') {
    const previous = typeof context.pendingSearchText === 'string' ? context.pendingSearchText : ''
    searchText = `${previous} ${rawMessage}`.trim()
    delete nextContext.pendingSearchText
    if (normalize(rawMessage) === 'any location') delete nextContext.selectedLocation
    else nextContext.selectedLocation = rawMessage.trim()
    nextContext.awaiting = 'budget'
    nextContext.pendingBudgetSearchText = searchText
    return {
      text: 'Great. What budget range should I use? You can also choose any budget and I will show the available matches.',
      suggestions: ['Below ₦200k', '₦200k to ₦350k', '₦350k to ₦500k', 'Any budget'],
      context: nextContext,
    }
  }

  if (awaiting === 'budget') {
    const previous = typeof context.pendingBudgetSearchText === 'string' ? context.pendingBudgetSearchText : ''
    searchText = `${previous} ${rawMessage}`.trim()
    delete nextContext.pendingBudgetSearchText
    delete nextContext.awaiting
  }

  if (['speak to an administrator', 'contact support', 'talk to a person', 'human support', 'speak to support', 'report a problem', 'report an issue', 'submit a complaint', 'i have a complaint', 'need an admin'].some((term) => message.includes(term))) {
    return {
      text: 'Of course. I can pass this conversation to the support team. Please add a short subject and explain what you need so an administrator can follow up.',
      needsAdmin: true,
      context: nextContext,
    }
  }

  const lastSearch = typeof context.lastSearchText === 'string' ? context.lastSearchText : ''
  let resultOffset = readNumber(context.searchOffset, 0)
  if (!awaiting && lastSearch && ['show me more', 'show all available options', 'try another location', 'change my location'].some((term) => message.includes(term))) {
    searchText = lastSearch
    if (message.includes('show me more')) resultOffset = readNumber(context.searchOffset, 0)
    else resultOffset = 0
    if (message.includes('another location') || message.includes('change my location')) {
      const locations = await getDatabasePool().query<{ location: string }>(
        `SELECT DISTINCT location_display AS location
         FROM public.marketplace_listings
         WHERE status = 'published' AND length(trim(location_display)) > 0
         ORDER BY location_display
         LIMIT 8`,
      )
      nextContext.pendingSearchText = lastSearch
      nextContext.awaiting = 'location'
      delete nextContext.selectedLocation
      return {
        text: 'Which new area should I search? I will keep your original requirements and update only the location.',
        suggestions: [...locations.rows.map((row) => row.location), 'Any location'].slice(0, 8),
        context: nextContext,
      }
    }
  }

  const searchMessage = normalize(searchText)
  const actions = routeForRequest(rawMessage, roles, preferredRole)
  if (actions.length) {
    return {
      text: 'I found the right place for that. Use the shortcut below and I will take you directly there.',
      actions,
      suggestions: ['What else can you help me with?', 'Find something in the marketplace'],
      context: nextContext,
    }
  }

  const propertyTerms = ['apartment', 'house', 'home', 'room', 'flat', 'land', 'property', 'rent', 'buy', 'for sale', 'self contained', 'self-contained', 'accommodation', 'bedsitter', 'hostel']
  const productTerms = ['product', 'laptop', 'phone', 'computer', 'furniture', 'electronics', 'buy a', 'shop']
  const serviceTerms = ['service', 'plumber', 'plumbing', 'electrician', 'electrical', 'cleaning', 'repair', 'mechanic', 'designer']
  const category = propertyTerms.some((term) => searchMessage.includes(term))
    ? 'properties'
    : productTerms.some((term) => searchMessage.includes(term))
      ? 'products'
      : serviceTerms.some((term) => searchMessage.includes(term))
        ? 'services'
        : null

  if (!category && (message.includes('how do i') || message.includes('where can i') || message.includes('how can i'))) {
    const role = roles.find((item) => ['buyer', 'landlord', 'seller', 'provider', 'agent'].includes(item)) || 'buyer'
    return {
      text: 'I can guide you around the marketplace. Tell me the feature you want to use, or choose one of these destinations.',
      actions: [
        { label: 'My dashboard', path: `/${role}/dashboard` },
        { label: 'Explore marketplace', path: '/explore' },
        { label: 'My messages', path: `/${role}/messages` },
        { label: 'Neighbourhood space', path: `/${role}/community` },
      ],
      suggestions: ['How do I save a listing?', 'How do I contact a landlord?', 'How do I create a listing?'],
      context: nextContext,
    }
  }

  if (!category) {
    return {
      text: 'I can help you find properties, products and services, or guide you to any feature on the website. What are you trying to do?',
      suggestions: ['Find a property to rent', 'Find a product', 'Find a service', 'Help me navigate the website', 'Speak to an administrator'],
      context: nextContext,
    }
  }

  const hasLocation = /\\b(in|at|around|near|within)\\s+[a-z]/i.test(searchText)
  if (category === 'properties' && hasLocation && typeof nextContext.selectedLocation !== 'string') {
    const knownLocations = await getDatabasePool().query<{ location: string }>(
      `SELECT DISTINCT location_display AS location
       FROM public.marketplace_listings
       WHERE status = 'published' AND length(trim(location_display)) > 0
       ORDER BY location_display
       LIMIT 100`,
    )
    const matchedLocation = knownLocations.rows.find((row) => normalize(searchText).includes(normalize(row.location)) || normalize(searchText).includes(normalize(row.location.split(',')[0])))
    if (matchedLocation) nextContext.selectedLocation = matchedLocation.location
  }
  const hasBudget = /(?:₦|\\b(?:under|below|less than|up to|maximum|max|budget|between|above|over|at least)\\b|\d\\s*[km]\\b)/i.test(searchText)

  if (category === 'properties' && !hasLocation && awaiting !== 'budget') {
    const locations = await getDatabasePool().query<{ location: string }>(
      `SELECT DISTINCT location_display AS location
       FROM public.marketplace_listings
       WHERE status = 'published' AND length(trim(location_display)) > 0
       ORDER BY location_display
       LIMIT 8`,
    )
    const choices = locations.rows.map((row) => row.location).filter(Boolean)
    nextContext.pendingSearchText = rawMessage
    nextContext.awaiting = 'location'
    return {
      text: 'Which area would you prefer? I will check the published property listings for that location.',
      suggestions: [...choices, 'Any location'].slice(0, 8),
      context: nextContext,
    }
  }

  if (category === 'properties' && !hasBudget && awaiting !== 'budget') {
    nextContext.pendingBudgetSearchText = searchText
    nextContext.awaiting = 'budget'
    return {
      text: 'What budget range should I use? You can choose a range or ask me to show every available match.',
      suggestions: ['Below ₦200k', '₦200k to ₦350k', '₦350k to ₦500k', 'Any budget'],
      context: nextContext,
    }
  }

  const terms = normalize(searchText).split(' ').filter((word) => word.length > 2 && !['the', 'for', 'and', 'with', 'from', 'near', 'around', 'find', 'need', 'want', 'looking', 'show', 'available', 'please', 'some'].includes(word)).slice(0, 8)
  const patterns = terms.map((term) => `%${term}%`)
  const budget = parseBudget(searchText)
  const result = await getDatabasePool().query<ListingMatch>(
    `SELECT
       l.listing_key AS key,
       l.title,
       c.category_name AS category,
       l.location_display AS location,
       l.price::text AS price,
       l.price_unit AS "priceUnit",
       l.icon,
       l.is_demo AS "isDemo"
     FROM public.marketplace_listings l
     JOIN public.marketplace_categories c ON c.category_key = l.category_key
     WHERE l.status = 'published'
       AND c.is_active = TRUE
       AND l.category_key = $1
       AND (
         cardinality($2::text[]) = 0
         OR concat_ws(' ', l.title, l.description, l.location_display, c.category_name, l.listing_tag) ILIKE ANY($2::text[])
       )
       AND ($4::numeric IS NULL OR l.price >= $4)
       AND ($5::numeric IS NULL OR l.price <= $5)
       AND ($6::text IS NULL OR l.location_display ILIKE '%' || $6 || '%')
     ORDER BY
       CASE WHEN concat_ws(' ', l.title, l.location_display) ILIKE $3 THEN 0 ELSE 1 END,
       l.created_at DESC
     LIMIT 5`,
    [category, patterns, `%${normalize(searchText)}%`, budget.min, budget.max],
  )

  if (result.rows.length) {
    return {
      text: `I checked the published ${category} listings and found ${result.rows.length} possible match${result.rows.length === 1 ? '' : 'es'}. Open a result to review its details and availability.`,
      matches: result.rows,
      suggestions: ['Show me more options', 'Change my location', 'Speak to an administrator'],
      context: { ...nextContext, lastSearchText: searchText, searchOffset: resultOffset + result.rows.length },
    }
  }

  return {
    text: `I could not find a published ${category} listing matching those details right now. Would you like to broaden the search or try another location?`,
    suggestions: ['Show all available options', 'Try another location', 'Search another category', 'Speak to an administrator'],
    context: { ...nextContext, lastSearchText: searchText },
  }
}

function userIdFrom(res: Response): string {
  return String(res.locals.authenticatedUserId ?? '')
}

router.get('/public-config', async (_req, res) => {
  try {
    const enabled = await getSetting('help.assistant.enabled', true)
    res.json({ enabled: enabled !== false, guestPreview: true })
  } catch {
    res.status(503).json({ error: 'Help Centre configuration is unavailable.' })
  }
})

router.use(requireAuthenticatedSession)

router.get('/status', async (_req, res) => {
  try {
    const userId = userIdFrom(res)
    const [limitValue, enabledValue, usage] = await Promise.all([
      getSetting('help.messages.free_limit', 30),
      getSetting('help.assistant.enabled', true),
      getDatabasePool().query<{ messages_used: number; period_start: string }>(
        `SELECT messages_used, period_start::text
         FROM public.marketplace_help_usage
         WHERE user_id = $1 AND period_start = date_trunc('month', CURRENT_DATE)::date`,
        [userId],
      ),
    ])
    const limit = readNumber(limitValue, 30)
    const used = Number(usage.rows[0]?.messages_used ?? 0)
    res.json({ enabled: enabledValue !== false, used, limit, remaining: Math.max(0, limit - used), period: 'monthly' })
  } catch {
    res.status(503).json({ error: 'Help Centre usage could not be loaded.' })
  }
})

router.get('/conversations', async (_req, res) => {
  try {
    const result = await getDatabasePool().query(
      `SELECT conversation_id::text AS id, title, status, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM public.marketplace_help_conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC, conversation_id DESC
       LIMIT 30`,
      [userIdFrom(res)],
    )
    res.json({ conversations: result.rows })
  } catch {
    res.status(500).json({ error: 'Your Help Centre conversations could not be loaded.' })
  }
})

router.get('/conversations/:conversationId/messages', async (req, res) => {
  const conversationId = req.params.conversationId
  if (typeof conversationId !== 'string' || !/^[1-9]\d*$/.test(conversationId)) {
    res.status(400).json({ error: 'Invalid conversation.' })
    return
  }
  try {
    const owner = await getDatabasePool().query(
      'SELECT 1 FROM public.marketplace_help_conversations WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userIdFrom(res)],
    )
    if (!owner.rowCount) {
      res.status(404).json({ error: 'Conversation not found.' })
      return
    }
    const result = await getDatabasePool().query(
      `SELECT message_id::text AS id, sender_type AS sender, message_text AS text, metadata, created_at AS "createdAt"
       FROM public.marketplace_help_messages
       WHERE conversation_id = $1
       ORDER BY message_id ASC`,
      [conversationId],
    )
    res.json({ messages: result.rows })
  } catch {
    res.status(500).json({ error: 'Conversation messages could not be loaded.' })
  }
})

router.post('/chat', async (req: Request, res: Response) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  const requestedConversationId = req.body?.conversationId
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Enter a message between 1 and ${MAX_MESSAGE_LENGTH} characters.` })
    return
  }
  if (requestedConversationId !== undefined && (typeof requestedConversationId !== 'string' || !/^[1-9]\d*$/.test(requestedConversationId))) {
    res.status(400).json({ error: 'Invalid conversation.' })
    return
  }

  const userId = userIdFrom(res)
  const currentPath = typeof req.body?.currentPath === 'string' ? req.body.currentPath.slice(0, 300) : ''
  const preferredRole = currentPath.split('/').filter(Boolean)[0]
  const client = await getDatabasePool().connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [Number(userId)])
    const enabled = await client.query<{ setting_value: unknown }>(
      'SELECT setting_value FROM public.platform_settings WHERE setting_key = $1',
      ['help.assistant.enabled'],
    )
    if (enabled.rows[0]?.setting_value === false) {
      await client.query('ROLLBACK')
      res.status(503).json({ error: 'The Help Centre assistant is temporarily unavailable.' })
      return
    }
    const limitResult = await client.query<{ setting_value: unknown }>(
      'SELECT setting_value FROM public.platform_settings WHERE setting_key = $1',
      ['help.messages.free_limit'],
    )
    const limit = readNumber(limitResult.rows[0]?.setting_value, 30)
    await client.query(
      `INSERT INTO public.marketplace_help_usage (user_id, period_start)
       VALUES ($1, date_trunc('month', CURRENT_DATE)::date)
       ON CONFLICT (user_id, period_start) DO NOTHING`,
      [userId],
    )
    const usage = await client.query<{ messages_used: number }>(
      `SELECT messages_used FROM public.marketplace_help_usage
       WHERE user_id = $1 AND period_start = date_trunc('month', CURRENT_DATE)::date
       FOR UPDATE`,
      [userId],
    )
    const used = Number(usage.rows[0]?.messages_used ?? 0)
    if (used >= limit) {
      await client.query('ROLLBACK')
      res.status(429).json({
        error: 'You have used your included Help Centre messages for this month.',
        usage: { used, limit, remaining: 0 },
        paidPackagesAvailable: false,
        message: 'Additional paid messages will be available when secure payment integration is enabled.',
      })
      return
    }

    let conversationId = requestedConversationId as string | undefined
    let context: Record<string, unknown> = {}
    if (conversationId) {
      const conversation = await client.query<{ context: Record<string, unknown> }>(
        'SELECT context FROM public.marketplace_help_conversations WHERE conversation_id = $1 AND user_id = $2 FOR UPDATE',
        [conversationId, userId],
      )
      if (!conversation.rowCount) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Conversation not found.' })
        return
      }
      context = conversation.rows[0].context || {}
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.marketplace_help_conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING conversation_id::text AS id`,
        [userId, message.slice(0, 72)],
      )
      conversationId = created.rows[0].id
    }

    await client.query(
      `INSERT INTO public.marketplace_help_messages (conversation_id, sender_type, message_text)
       VALUES ($1, 'user', $2)`,
      [conversationId, message],
    )

    const roleResult = await client.query<{ role_key: string }>(
      `SELECT r.role_key FROM public.marketplace_user_roles ur
       JOIN public.marketplace_roles r ON r.role_id = ur.role_id
       WHERE ur.user_id = $1 ORDER BY r.role_key`,
      [userId],
    )
    const answer = await answerMessage(message, context, roleResult.rows.map((row) => row.role_key), preferredRole)
    await client.query(
      `INSERT INTO public.marketplace_help_messages (conversation_id, sender_type, message_text, metadata)
       VALUES ($1, 'assistant', $2, $3::jsonb)`,
      [conversationId, answer.text, JSON.stringify({
        suggestions: answer.suggestions || [],
        actions: answer.actions || [],
        matches: answer.matches || [],
      })],
    )
    await client.query(
      `UPDATE public.marketplace_help_conversations
       SET context = $2::jsonb, updated_at = NOW(), status = CASE WHEN $3 THEN 'needs_admin' ELSE status END
       WHERE conversation_id = $1`,
      [conversationId, JSON.stringify(answer.context || {}), answer.needsAdmin === true],
    )
    await client.query(
      `UPDATE public.marketplace_help_usage
       SET messages_used = messages_used + 1, updated_at = NOW()
       WHERE user_id = $1 AND period_start = date_trunc('month', CURRENT_DATE)::date`,
      [userId],
    )
    await client.query('COMMIT')
    res.json({
      conversationId,
      reply: answer.text,
      suggestions: answer.suggestions || [],
      actions: answer.actions || [],
      matches: answer.matches || [],
      usage: { used: used + 1, limit, remaining: Math.max(0, limit - used - 1) },
      needsAdmin: answer.needsAdmin === true,
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Help Centre chat failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'The assistant could not process your message. Please try again.' })
  } finally {
    client.release()
  }
})

router.post('/support-cases', async (req: Request, res: Response) => {
  const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : ''
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim().slice(0, 160) : ''
  const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 2000) : ''
  if (!/^[1-9]\d*$/.test(conversationId) || !subject || !details) {
    res.status(400).json({ error: 'A conversation, subject and message are required.' })
    return
  }
  try {
    const db = getDatabasePool()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const owner = await client.query(
        'SELECT 1 FROM public.marketplace_help_conversations WHERE conversation_id = $1 AND user_id = $2 FOR UPDATE',
        [conversationId, userIdFrom(res)],
      )
      if (!owner.rowCount) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Conversation not found.' })
        return
      }
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.marketplace_help_support_cases (conversation_id, user_id, subject, details)
         VALUES ($1, $2, $3, $4) RETURNING case_id::text AS id`,
        [conversationId, userIdFrom(res), subject, details],
      )
      await client.query(
        `UPDATE public.marketplace_help_conversations SET status = 'needs_admin', updated_at = NOW()
         WHERE conversation_id = $1`,
        [conversationId],
      )
      await client.query(
        `INSERT INTO public.marketplace_notifications (audience, notification_type, title, message, metadata)
         VALUES ('administrators', 'help_support', $1, $2, $3::jsonb)`,
        ['Help Centre needs administrator attention', subject, JSON.stringify({ caseId: created.rows[0].id, conversationId })],
      )
      await client.query('COMMIT')
      res.status(201).json({ status: 'ok', caseId: created.rows[0].id, message: 'Your request has been sent to the support team.' })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch {
    res.status(500).json({ error: 'Your request could not be sent to the support team.' })
  }
})

router.get('/admin/cases', requirePermission('dashboard.view'), async (_req, res) => {
  try {
    const result = await getDatabasePool().query(
      `SELECT c.case_id::text AS id, c.subject, c.details, c.status,
              c.created_at AS "createdAt", u.display_name AS "userName", u.email,
              c.conversation_id::text AS "conversationId"
       FROM public.marketplace_help_support_cases c
       JOIN public.marketplace_users u ON u.user_id = c.user_id
       ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END, c.created_at DESC
       LIMIT 100`,
    )
    res.json({ cases: result.rows })
  } catch {
    res.status(500).json({ error: 'Support cases could not be loaded.' })
  }
})

router.patch('/admin/cases/:caseId', requirePermission('dashboard.view'), async (req, res) => {
  const caseId = req.params.caseId
  const status = req.body?.status
  if (typeof caseId !== 'string' || !/^[1-9]\d*$/.test(caseId) || !['open', 'assigned', 'resolved'].includes(status)) {
    res.status(400).json({ error: 'Invalid support case update.' })
    return
  }
  try {
    const result = await getDatabasePool().query(
      `UPDATE public.marketplace_help_support_cases
       SET status = $2, updated_at = NOW()
       WHERE case_id = $1
       RETURNING case_id::text AS id, status, conversation_id::text AS conversation_id`,
      [caseId, status],
    )
    if (!result.rowCount) {
      res.status(404).json({ error: 'Support case not found.' })
      return
    }
    await getDatabasePool().query(
      `UPDATE public.marketplace_help_conversations
       SET status = $2, updated_at = NOW()
       WHERE conversation_id = $1`,
      [result.rows[0].conversation_id, status === 'resolved' ? 'resolved' : 'needs_admin'],
    )
    res.json({ status: 'ok', supportCase: result.rows[0] })
  } catch {
    res.status(500).json({ error: 'Support case could not be updated.' })
  }
})


router.get('/admin/cases/:caseId/messages', requirePermission('dashboard.view'), async (req, res) => {
  const caseId = req.params.caseId
  if (typeof caseId !== 'string' || !/^[1-9]\d*$/.test(caseId)) {
    res.status(400).json({ error: 'Invalid support case.' })
    return
  }
  try {
    const result = await getDatabasePool().query(
      `SELECT m.message_id::text AS id, m.sender_type AS sender,
              m.message_text AS text, m.created_at AS "createdAt"
       FROM public.marketplace_help_messages m
       WHERE m.conversation_id = (
         SELECT conversation_id FROM public.marketplace_help_support_cases WHERE case_id = $1
       )
       ORDER BY m.message_id ASC`,
      [caseId],
    )
    res.json({ messages: result.rows })
  } catch {
    res.status(500).json({ error: 'Support conversation could not be loaded.' })
  }
})

router.post('/admin/cases/:caseId/reply', requirePermission('dashboard.view'), async (req, res) => {
  const caseId = req.params.caseId
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : ''
  if (typeof caseId !== 'string' || !/^[1-9]\d*$/.test(caseId) || !message) {
    res.status(400).json({ error: 'A valid case and reply message are required.' })
    return
  }
  try {
    const result = await getDatabasePool().query<{ conversation_id: string; user_id: string }>(
      'SELECT conversation_id::text, user_id::text FROM public.marketplace_help_support_cases WHERE case_id = $1',
      [caseId],
    )
    if (!result.rowCount) {
      res.status(404).json({ error: 'Support case not found.' })
      return
    }
    const item = result.rows[0]
    await getDatabasePool().query(
      `INSERT INTO public.marketplace_help_messages (conversation_id, sender_type, message_text)
       VALUES ($1, 'admin', $2)`,
      [item.conversation_id, message],
    )
    await getDatabasePool().query(
      `INSERT INTO public.marketplace_notifications (recipient_user_id, audience, notification_type, title, message, metadata)
       VALUES ($1, 'user', 'help_support_reply', 'Support team replied', $2, $3::jsonb)`,
      [item.user_id, message, JSON.stringify({ caseId })],
    )
    await getDatabasePool().query(
      'UPDATE public.marketplace_help_conversations SET updated_at = NOW() WHERE conversation_id = $1',
      [item.conversation_id],
    )
    res.status(201).json({ status: 'ok', message: 'Reply sent to the user.' })
  } catch {
    res.status(500).json({ error: 'Support reply could not be sent.' })
  }
})

export default router
