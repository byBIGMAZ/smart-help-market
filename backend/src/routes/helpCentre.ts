import { Router, type Request, type Response } from 'express'
import { getDatabasePool } from '../database'
import { requireAuthenticatedSession } from '../auth/requireAuthenticatedSession'
import { requirePermission } from '../auth/requirePermission'
import { classifyBigmazIntent, countMeaningfulTokens, getBigmazModelVersion, hashIntentFeatures, type BigmazIntent, type IntentWeight } from '../intelligence/bigmazEngine'
import { resolveGeographicLocation } from '../geography/geocoding'

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
  guide?: { kind: 'escrow'; steps: Array<{ title: string; description: string; icon: string }>; disclaimer: string }
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

type WorkspaceRole = 'buyer' | 'landlord' | 'seller' | 'service_provider' | 'agent'

function canonicalWorkspaceRole(value: string | undefined): WorkspaceRole | null {
  const role = (value || '').toLowerCase()
  if (role === 'provider' || role === 'service_provider') return 'service_provider'
  if (role === 'buyer' || role === 'landlord' || role === 'seller' || role === 'agent') return role
  return null
}

function workspacePathRole(role: WorkspaceRole): string {
  return role === 'service_provider' ? 'provider' : role
}

function resolveAssistantRole(
  assignedRoles: string[],
  preferredRole: string | undefined,
  message: string,
  context: Record<string, unknown>,
): WorkspaceRole | null {
  const available = new Set(
    assignedRoles
      .map((role) => canonicalWorkspaceRole(role))
      .filter((role): role is WorkspaceRole => role !== null),
  )
  const requested = canonicalWorkspaceRole(preferredRole)
  if (requested && available.has(requested)) return requested

  const text = normalize(message)
  const explicitRoleCues: Array<{ role: WorkspaceRole; cues: string[] }> = [
    { role: 'landlord', cues: ['as a landlord', 'my landlord account', 'landlord workspace', 'property owner', 'as the property owner'] },
    { role: 'agent', cues: ['as an agent', 'my agent account', 'agent workspace', 'real estate agent', 'agency workspace'] },
    { role: 'seller', cues: ['as a seller', 'my seller account', 'seller workspace', 'vendor account'] },
    { role: 'service_provider', cues: ['as a service provider', 'my provider account', 'service provider workspace'] },
    { role: 'buyer', cues: ['as a buyer', 'my buyer account', 'buyer workspace'] },
  ]
  for (const item of explicitRoleCues) {
    if (available.has(item.role) && item.cues.some((cue) => text.includes(cue))) return item.role
  }

  const landlordTask = ['tenant', 'rent collection', 'rent payment', 'arrears', 'maintenance request', 'landlord complaint', 'renewal', 'occupancy'].some((cue) => text.includes(cue))
  const agentTask = ['commission', 'commissions', 'my clients', 'prospective client', 'represented property', 'agency listing'].some((cue) => text.includes(cue))
  const sellerTask = ['inventory', 'stock level', 'product order', 'my sales', 'seller listing'].some((cue) => text.includes(cue))
  const providerTask = ['service booking', 'my bookings', 'service availability', 'working hours'].some((cue) => text.includes(cue))

  if (landlordTask && available.has('landlord')) return 'landlord'
  if (landlordTask && available.has('agent')) return 'agent'
  if (agentTask && available.has('agent')) return 'agent'
  if (sellerTask && available.has('seller')) return 'seller'
  if (providerTask && available.has('service_provider')) return 'service_provider'

  const listingCreationIssue = ['create listing', 'creating listing', 'creating my listing', 'create my listing', 'post listing', 'posting listing', 'add property', 'add my property', 'new property', 'listing will not save', 'listing wont save', 'listing error', 'having issues creating my listing', 'trouble creating my listing'].some((cue) => text.includes(cue))
  if (listingCreationIssue) {
    const listingRoles = (['landlord', 'agent'] as const).filter((role) => available.has(role))
    if (listingRoles.length === 1) return listingRoles[0]
    if (listingRoles.length > 1) {
      const remembered = canonicalWorkspaceRole(typeof context.activeRole === 'string' ? context.activeRole : undefined)
      if (remembered && listingRoles.includes(remembered as 'landlord' | 'agent')) return remembered
      return null
    }
  }

  const remembered = canonicalWorkspaceRole(typeof context.activeRole === 'string' ? context.activeRole : undefined)
  if (remembered && available.has(remembered)) return remembered
  if (available.size === 1) return [...available][0]
  return null
}

function routeForRequest(message: string, roles: string[], activeRole: WorkspaceRole | null): SuggestedAction[] {
  const text = normalize(message)
  const availableRoles = roles
    .map((item) => canonicalWorkspaceRole(item))
    .filter((item): item is WorkspaceRole => item !== null)
  const role = activeRole || (availableRoles.length === 1 ? availableRoles[0] : 'buyer')
  const rolePath = workspacePathRole(role)
  const roleListingPath = role === 'landlord' ? '/landlord/properties' : role === 'seller' ? '/seller/products' : role === 'service_provider' ? '/provider/services' : role === 'agent' ? '/agent/listings' : '/buyer/saved'
  const routes: Array<{ terms: string[]; label: string; path: string; roles?: WorkspaceRole[] }> = [
    { terms: ['create community post', 'publish a post', 'new community post'], label: 'Create a community post', path: `/${rolePath}/community/new` },
    { terms: ['neighbourhood', 'neighborhood', 'neighboarhood', 'community space', 'community'], label: 'Open neighbourhood space', path: `/${rolePath}/community` },
    { terms: ['saved', 'favourite', 'favorite', 'wishlist'], label: 'Open saved items', path: '/buyer/saved' },
    { terms: ['my message', 'messages', 'inbox', 'chat'], label: 'Open messages', path: `/${rolePath}/messages` },
    { terms: ['notification', 'alerts'], label: 'Open notifications', path: `/${rolePath}/notifications` },
    { terms: ['my profile', 'edit profile', 'profile'], label: 'Open my profile', path: `/${rolePath}/profile` },
    { terms: ['account', 'account settings'], label: 'Open account overview', path: `/${rolePath}/account` },
    { terms: ['privacy', 'preferences'], label: 'Open privacy and preferences', path: `/${rolePath}/privacy-settings` },
    { terms: ['inspection', 'visit property'], label: 'Open inspections', path: `/${rolePath}/inspections` },
    { terms: ['enquiry', 'enquiries', 'my enquiries'], label: 'Open enquiries', path: `/${rolePath}/enquiries` },
    { terms: ['transaction', 'transactions', 'purchase history'], label: 'Open transactions', path: '/buyer/transactions' },
    { terms: ['roommate', 'room mate', 'shared accommodation'], label: 'Open roommate matching', path: '/buyer/roommates' },
    { terms: ['tenant', 'tenants'], label: 'Open tenant management', path: '/landlord/tenants', roles: ['landlord'] },
    { terms: ['complaint', 'complaints'], label: 'Open complaints', path: '/landlord/complaints', roles: ['landlord'] },
    { terms: ['notice', 'notices', 'warning'], label: 'Open notices and warnings', path: '/landlord/notices', roles: ['landlord'] },
    { terms: ['review', 'reviews', 'dispute', 'disputes'], label: 'Open reviews and disputes', path: '/landlord/reviews', roles: ['landlord'] },
    { terms: ['rent payment', 'rent and renewal', 'renewal', 'arrears'], label: 'Open rent and renewals', path: '/landlord/rent', roles: ['landlord'] },
    { terms: ['maintenance', 'repair'], label: 'Open maintenance', path: '/landlord/maintenance', roles: ['landlord'] },
    { terms: ['my properties', 'manage properties', 'property portfolio'], label: 'Manage properties', path: '/landlord/properties', roles: ['landlord'] },
    { terms: ['add property', 'list property', 'post property', 'create a property listing', 'create property listing', 'create listing'], label: 'Create a property listing', path: '/landlord/properties/new', roles: ['landlord'] },
    { terms: ['agent listing', 'represented property', 'list property for a client'], label: 'Create an agent listing', path: '/agent/listings/new', roles: ['agent'] },
    { terms: ['my products', 'manage products', 'inventory'], label: 'Open products and inventory', path: '/seller/products', roles: ['seller'] },
    { terms: ['add product', 'add a product', 'list product'], label: 'Add a product', path: '/seller/products/new', roles: ['seller'] },
    { terms: ['orders', 'my sales'], label: 'Open orders', path: '/seller/orders', roles: ['seller'] },
    { terms: ['bookings', 'my services'], label: 'Open bookings and services', path: '/provider/bookings', roles: ['service_provider'] },
    { terms: ['availability', 'working hours', 'schedule'], label: 'Manage service availability', path: '/provider/availability', roles: ['service_provider'] },
    { terms: ['add service', 'add a service', 'list service'], label: 'Add a service', path: '/provider/services/new', roles: ['service_provider'] },
    { terms: ['my listings', 'manage listings'], label: 'Open my listings', path: roleListingPath },
    { terms: ['clients'], label: 'Open clients', path: '/agent/clients', roles: ['agent'] },
    { terms: ['commission', 'commissions', 'earnings'], label: 'Open commissions and earnings', path: '/agent/commissions', roles: ['agent'] },
    { terms: ['dashboard', 'overview'], label: 'Open dashboard', path: `/${rolePath}/dashboard` },
    { terms: ['browse', 'explore marketplace', 'marketplace'], label: 'Explore marketplace', path: '/explore' },
    { terms: ['category', 'categories'], label: 'Browse categories', path: '/categories' },
    { terms: ['help centre', 'help center', 'support'], label: 'Open Help Centre', path: '/help' },
  ]
  const match = routes.find((item) => {
    const roleScopedPath = /^\/(buyer|landlord|seller|provider|agent)\//.test(item.path)
    const roleIsClear = activeRole !== null || availableRoles.length <= 1
    return (!item.roles || item.roles.includes(role))
      && (roleIsClear || !roleScopedPath)
      && item.terms.some((term) => text.includes(term))
  })
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
  const range = text.match(/(?:between|from)?\s*₦?([\d,.]+)\s*(k|m|million|thousand)?\s*(?:to|and|-)\s*₦?([\d,.]+)\s*(k|m|million|thousand)?/i)
  if (range) return { min: amountFrom(range[1], range[2] || ''), max: amountFrom(range[3], range[4] || range[2] || '') }
  const maximum = text.match(/(?:under|below|less than|up to|maximum|max|within)\s*₦?([\d,.]+)\s*(k|m|million|thousand)?/i)
  if (maximum) return { min: null, max: amountFrom(maximum[1], maximum[2] || '') }
  const minimum = text.match(/(?:above|over|more than|at least)\s*₦?([\d,.]+)\s*(k|m|million|thousand)?/i)
  if (minimum) return { min: amountFrom(minimum[1], minimum[2] || ''), max: null }
  return { min: null, max: null }
}

async function predictIntent(message: string) {
  const featureHashes = hashIntentFeatures(message)
  const [examples, weights] = await Promise.all([
    getDatabasePool().query<{ phrase: string; intent_key: BigmazIntent }>(
      `SELECT phrase, intent_key FROM public.marketplace_ai_training_examples
       WHERE approved = TRUE ORDER BY approved_at DESC NULLS LAST LIMIT 1000`,
    ).catch(() => ({ rows: [] as Array<{ phrase: string; intent_key: BigmazIntent }> })),
    featureHashes.length
      ? getDatabasePool().query<IntentWeight>(
          `SELECT feature_hash, intent_key, weight::float AS weight
           FROM public.marketplace_ai_intent_weights
           WHERE feature_hash = ANY($1::text[])`,
          [featureHashes],
        ).catch(() => ({ rows: [] as IntentWeight[] }))
      : Promise.resolve({ rows: [] as IntentWeight[] }),
  ])
  return classifyBigmazIntent(
    message,
    examples.rows.map((row) => ({ phrase: row.phrase, intent: row.intent_key })),
    weights.rows,
  )
}


type SuggestionSelection = {
  message: string
  context: Record<string, unknown>
}

function expandSuggestionSelection(
  label: string,
  previousAssistantText: string,
  context: Record<string, unknown>,
  roles: string[],
): SuggestionSelection {
  const selected = normalize(label)
  const prior = normalize(previousAssistantText)
  const nextContext = { ...context }
  const available = new Set(roles.map((role) => canonicalWorkspaceRole(role)).filter((role): role is WorkspaceRole => role !== null))
  const currentRole = canonicalWorkspaceRole(typeof context.activeRole === 'string' ? context.activeRole : undefined)
  nextContext.lastSelectedSuggestion = label
  nextContext.lastSuggestionContext = previousAssistantText.slice(0, 500)

  if (context.awaiting === 'location' || context.awaiting === 'budget') {
    return { message: label, context: nextContext }
  }
  if (['show me more options', 'show all available options', 'try another location', 'change my location'].includes(selected)) {
    return { message: label, context: nextContext }
  }

  if (context.awaiting === 'listing_role' || prior.includes('both landlord and agent access')) {
    if (selected === 'as a landlord' && available.has('landlord')) {
      nextContext.activeRole = 'landlord'
      nextContext.awaiting = 'listing_role'
      return { message: 'I am having issues creating my listing as a landlord for my own property.', context: nextContext }
    }
    if (selected === 'as an agent' && available.has('agent')) {
      nextContext.activeRole = 'agent'
      nextContext.awaiting = 'listing_role'
      return { message: 'I am having issues creating a listing as an agent for a property I represent.', context: nextContext }
    }
  }

  const listingTroubleshooting = prior.includes('troubleshoot your landlord property listing')
    || prior.includes('agent listing workflow')
    || prior.includes('listing studio')
    || prior.includes('represented property details')
  if (listingTroubleshooting) {
    if (selected.includes('listing studio') || selected.includes('listing form')) {
      nextContext.awaiting = 'listing_studio_issue'
      return { message: `I cannot open Listing Studio in my ${currentRole === 'agent' ? 'Agent' : 'Landlord'} workspace. Help me diagnose the problem.`, context: nextContext }
    }
    if (selected.includes('details will not save') || selected.includes('error when saving')) {
      nextContext.awaiting = 'listing_save_issue'
      return { message: `My ${currentRole === 'agent' ? 'agent listing' : 'property listing'} details will not save. Help me troubleshoot the save process.`, context: nextContext }
    }
  }

  const generalPrompts: Record<string, string> = {
    'find a property to rent': 'I want to find a property to rent. Please start a property search and ask me for my preferred location.',
    'find accommodation': 'I am looking for accommodation to rent. Please start a property search and ask me for my preferred location.',
    'find a product': 'I want to find a product to buy. Help me search the marketplace for products.',
    'find a service': 'I need to find a service provider. Help me search published services.',
    'help me navigate the website': 'I need help navigating SMART HELP MARKET. Show me the features and pages available in my assigned workspace.',
    'what else can you help me with': 'Show me the useful things you can help me do in my active workspace.',
    'find something in the marketplace': 'Take me to marketplace discovery and help me choose what to explore.',
    'view my saved items': 'Open my saved items in my buyer workspace.',
    'explain the buyer protection steps': 'Explain how buyer protection and escrow are intended to work, and clearly distinguish any live marketplace features from educational information.',
    'what happens if there is a dispute': 'Explain the marketplace dispute process and what the buyer and seller should do if a transaction problem occurs.',
    'how do i inspect a property': 'Explain how to arrange and prepare for a property inspection through the marketplace.',
    'what should i consider before sharing accommodation': 'Give me practical advice for choosing a compatible roommate and sharing accommodation safely.',
    'ask about electricity and water': 'Tell me how to assess electricity and water supply in a neighbourhood, and what questions to ask residents.',
    'ask about road conditions': 'Tell me how to assess road access and road conditions in a neighbourhood.',
    'how do i save a listing': 'As a buyer, explain how to save a listing and find it again in my saved items.',
    'how do i contact a landlord': 'As a buyer, explain how to send an enquiry to a property landlord through the marketplace.',
    'search another category': 'Help me choose a different marketplace category to search.',
    'create a property listing': currentRole === 'agent'
      ? 'As an agent, help me create a listing for a property I am authorised to represent.'
      : 'As a landlord, help me create a property listing for my own property.',
    'create an agent listing': 'As an agent, help me create a listing for a property I am authorised to represent.',
    'manage my tenants': 'As a landlord, I need help managing my tenants.',
    'track rent and renewals': 'As a landlord, I need help tracking rent payments, arrears and tenancy renewals.',
    'manage maintenance': 'As a landlord, I need help managing property maintenance requests.',
    'manage my listings': `Help me manage my listings in my ${currentRole || 'assigned'} workspace.`,
    'view my clients': 'As an agent, help me manage my clients and prospective clients.',
    'check commissions': 'As an agent, help me review my commissions and earnings.',
    'add a product': 'As a seller, help me add a product listing.',
    'manage inventory': 'As a seller, help me manage product inventory and stock levels.',
    'view orders': currentRole === 'service_provider'
      ? 'As a service provider, help me review my bookings.'
      : 'As a seller, help me review customer orders.',
    'review my sales': 'As a seller, help me review my sales.',
    'add a service': 'As a service provider, help me create a service listing.',
    'view bookings': 'As a service provider, help me review my service bookings.',
    'manage availability': 'As a service provider, help me manage my service availability.',
    'manage my services': 'As a service provider, help me manage my service listings.',
    'listing studio will not open': 'I cannot open Listing Studio. Help me diagnose the problem.',
    'my property details will not save': 'My property listing details will not save. Help me troubleshoot the save process.',
    'i get an error when saving': 'I get an error when saving my listing. Help me troubleshoot the save process.',
    'the agent listing form will not open': 'I cannot open the agent listing form. Help me diagnose the problem.',
    'my represented property details will not save': 'My represented property listing details will not save. Help me troubleshoot the save process.',
    'the page is blank': 'The listing page is blank when I try to open it.',
    'i see access denied': 'I receive an access denied message when opening the listing page.',
    'it keeps loading': 'The listing page keeps loading and never opens.',
    'the button does nothing': 'I click the listing button but nothing happens.',
    'required fields are missing': 'The listing form says required fields are missing when I save.',
    'save button does nothing': 'The listing save button does nothing when I click it.',
    'i see an error message': 'The listing form displays an error message when I save.',
    'my saved draft disappeared': 'I cannot find a listing draft I previously saved.',
    'the button stays unchanged': 'The Save draft button stays unchanged after I click it.',
    'a spinner appears': 'A spinner appears after I click Save draft and does not finish.',
    'i can see a success message': 'I can see a success message after saving my listing.',
    'the form still says fields are missing': 'The listing form still says required fields are missing after I completed them.',
    'the draft saved successfully': 'My listing draft saved successfully. What should I do next?',
    'i found the draft': 'I found my saved listing draft. What should I do next?',
    'it is still missing': 'My saved listing draft is still missing.',
    'i never saw a save confirmation': 'I never saw a confirmation after trying to save my listing.',
    'which fields are compulsory': 'Explain which listing fields are compulsory for my current listing type.',
    'it opens now': 'Listing Studio opens now. Guide me through the next step in my listing workflow.',
    'i can see the form now': 'The listing form is visible now. Guide me through the next step.',
    'it opened after refreshing': 'Listing Studio opened after refreshing. What should I do next?',
    'other pages work normally': 'Other pages work normally, but Listing Studio has a problem. Help me narrow it down.',
    'the whole website is slow': 'The whole marketplace website is slow, not just Listing Studio.',
    'the add property button': 'The Add property button does not respond when I click it.',
    'the save draft button': 'The Save draft button does not respond when I click it.',
    'another button': 'Another button on the listing page does not respond when I click it.',
    'what should a roommate agreement include': 'Explain what a practical roommate agreement should include, including rent, bills, deposits, house rules and ending the arrangement.',
    'what should i check during inspection': 'Give me a detailed checklist of what to inspect when viewing a property.',
    'there is an error on the page': 'An error appears on the listing page. Help me diagnose it.',
  }
  const mapped = generalPrompts[selected]
  if (mapped) return { message: mapped, context: nextContext }

  return {
    message: `The user selected "${label}" in response to the assistant's previous question: "${previousAssistantText}". Continue that exact conversation, interpret the selected option as their answer, and do not restart with a generic introduction.`,
    context: nextContext,
  }
}

async function answerMessage(rawMessage: string, context: Record<string, unknown>, roles: string[], preferredRole?: string): Promise<AssistantResult> {
  const activeRole = resolveAssistantRole(roles, preferredRole, rawMessage, context)

  const message = normalize(rawMessage)
  const nextContext = { ...context }
  const prediction = await predictIntent(rawMessage)
  let searchText = rawMessage
  const awaiting = typeof context.awaiting === 'string' ? context.awaiting : ''

  if (activeRole) nextContext.activeRole = activeRole

  if (awaiting === 'listing_studio_issue') {
    nextContext.awaiting = 'listing_studio_detail'
    const workspace = activeRole === 'agent' ? 'Agent' : 'Landlord'
    const listingPath = activeRole === 'agent' ? '/agent/listings/new' : '/landlord/properties/new'
    return {
      text: `Let's isolate why Listing Studio is not opening in your ${workspace} workspace. First, confirm that you are signed in to the correct account and open the listing form from your own workspace. Then refresh the page once and try again. Do not switch to another role's dashboard to bypass an access restriction. What exactly happens when you open it?`,
      actions: [{ label: `Open ${workspace.toLowerCase()} listing form`, path: listingPath }],
      suggestions: ['The page is blank', 'I see access denied', 'It keeps loading', 'The button does nothing'],
      context: nextContext,
    }
  }

  if (awaiting === 'listing_studio_detail') {
    const listingPath = activeRole === 'agent' ? '/agent/listings/new' : '/landlord/properties/new'
    if (message.includes('access denied')) {
      return {
        text: activeRole === 'agent'
          ? 'An access-denied message usually means the current session or listing permission did not authorise that page. Confirm that you are signed in to the correct Agent account, then open the form from Agent Listings. Agent access does not grant landlord-only tools. If the Agent listing page still denies access, send the exact message to support so the account role and server permission can be checked.'
          : 'An access-denied message usually means the current session or listing permission did not authorise that page. Confirm that you are signed in to the correct Landlord account, then open Add a property from the Landlord workspace. If the page still denies access, send the exact message to support so the account role and server permission can be checked.',
        actions: [{ label: 'Open my listing form', path: listingPath }],
        suggestions: ['I still see access denied', 'It opens now', 'Speak to an administrator'],
        context: { ...nextContext, awaiting: 'listing_studio_detail' },
      }
    }
    if (message.includes('blank')) {
      return {
        text: 'If the listing page is blank, try a hard refresh, then open the page in a private/incognito window. Check whether other marketplace pages load. If only Listing Studio is blank, tell me your browser, device and whether the page shows an error. Do not clear saved drafts or browser data as a first step.',
        suggestions: ['It is still blank', 'I can see the form now', 'There is an error on the page'],
        context: { ...nextContext, awaiting: 'listing_studio_detail' },
      }
    }
    if (message.includes('loading')) {
      return {
        text: 'If Listing Studio keeps loading, check that your internet connection is stable and wait briefly before refreshing once. Then reopen it from your correct workspace. If it continues, tell me whether the rest of SMART HELP MARKET loads normally and approximately how long the spinner remains visible.',
        suggestions: ['Other pages work normally', 'The whole website is slow', 'It opened after refreshing'],
        context: { ...nextContext, awaiting: 'listing_studio_detail' },
      }
    }
    if (message.includes('button does nothing') || message.includes('button does not respond')) {
      return {
        text: 'If the button does nothing, check whether the page has finished loading, then try once more. If you are on mobile, try rotating the device or opening the site in an updated browser. Please tell me the exact button label and whether anything changes when you click it.',
        suggestions: ['The Add property button', 'The Save draft button', 'Another button'],
        context: { ...nextContext, awaiting: 'listing_studio_detail' },
      }
    }
    return {
      text: 'Thanks. Please copy the exact error text if one appears, or describe what you see on the screen. I can then narrow the cause instead of guessing. If you cannot continue, I can help you send the details to support.',
      suggestions: ['There is an error on the page', 'It opens now', 'Speak to an administrator'],
      context: { ...nextContext, awaiting: 'listing_studio_detail' },
    }
  }

  if (awaiting === 'listing_save_issue') {
    nextContext.awaiting = 'listing_save_detail'
    return {
      text: `Let's check the save process in your ${activeRole === 'agent' ? 'Agent' : 'Landlord'} listing workflow. First, make sure the required listing fields are complete. Use Save draft if you are not ready to publish. Wait for the save confirmation before leaving the page. When editing an existing draft, reopen that same draft rather than starting a second listing. What happens when you try to save?`,
      suggestions: ['Required fields are missing', 'Save button does nothing', 'I see an error message', 'My saved draft disappeared'],
      context: nextContext,
    }
  }

  if (awaiting === 'listing_save_detail') {
    const listingPath = activeRole === 'agent' ? '/agent/listings' : '/landlord/properties'
    if (message.includes('required fields')) {
      return {
        text: 'Open each section of the listing form and look for fields marked as required. Complete the property or represented-property details, location, listing purpose and any required unit information. If the form highlights a field, correct that field first, then save the draft again. Tell me the exact field name if you are unsure what to enter.',
        actions: [{ label: 'Return to my listings', path: listingPath }],
        suggestions: ['Which fields are compulsory?', 'The form still says fields are missing', 'The draft saved successfully'],
        context: { ...nextContext, awaiting: 'listing_save_detail' },
      }
    }
    if (message.includes('button does nothing') || message.includes('button does not respond') || message.includes('button stays unchanged') || message.includes('spinner appears')) {
      return {
        text: 'If Save draft does nothing, check whether all required fields are complete and whether the page is still processing. Try once, wait for a confirmation, and avoid repeated clicks that could create confusion. If there is no response, tell me whether the button becomes disabled, shows a spinner, or remains unchanged.',
        suggestions: ['The button stays unchanged', 'A spinner appears', 'I can see a success message'],
        context: { ...nextContext, awaiting: 'listing_save_detail' },
      }
    }
    if (message.includes('validation error')) {
      return {
        text: 'A validation error means one or more values did not pass the form checks. Read the message carefully and note the field it identifies. Check that required fields are completed, numbers contain valid values, and unit details are consistent with the listing type. Share the exact validation text and field name so I can explain the correction.',
        suggestions: ['The form still says fields are missing', 'I corrected the field', 'Speak to an administrator'],
        context: { ...nextContext, awaiting: 'listing_save_detail' },
      }
    }
    if (message.includes('unauthorized')) {
      return {
        text: 'An unauthorized response is an account or permission issue, not something to bypass. Confirm that you are signed in to the account that owns this draft and that you opened it from the correct workspace. Do not try another person’s account or change roles yourself. If the correct account still receives this message, support needs to check the server-side ownership and role permissions.',
        suggestions: ['I am using the correct account', 'I may be signed into another account', 'Speak to an administrator'],
        context: { ...nextContext, awaiting: 'listing_save_detail' },
      }
    }
    if (message.includes('network error')) {
      return {
        text: 'A network error can occur when the browser cannot complete the save request. Check your connection, wait for it to stabilise, and retry once. Keep the current page open until you know whether the draft saved. Then open your listings page in the same account to check for the saved draft before trying again.',
        suggestions: ['I found the draft', 'It is still missing', 'The network is working now'],
        context: { ...nextContext, awaiting: 'listing_save_detail' },
      }
    }
    if (message.includes('error message') || message.includes('error')) {
      return {
        text: 'Please share the exact error message, including any field name or status code. Do not include passwords, session cookies or secret tokens. I will use the wording to identify whether this looks like a validation, permission, network or server-side error.',
        suggestions: ['It says validation error', 'It says unauthorized', 'It says network error', 'Speak to an administrator'],
        context: { ...nextContext, awaiting: 'listing_save_detail' },
      }
    }
    if (message.includes('draft saved successfully') || message.includes('found my saved listing draft') || message.includes('success message')) {
      return {
        text: 'Good. Your next step is to reopen the saved draft from your workspace and review it carefully. Confirm the listing purpose, location, unit details, prices and contact information. Save any corrections to the same draft. Only proceed to submission when the details are complete and accurate.',
        actions: [{ label: 'Open my saved listings', path: listingPath }],
        suggestions: ['Review my listing before submission', 'I need to edit the draft', 'I am ready to submit'],
        context: nextContext,
      }
    }
    if (message.includes('draft disappeared')) {
      return {
        text: 'First, open the same workspace’s listings page and check the Drafts section. Make sure you are signed in to the same account that created the draft. Do not create a replacement yet. If it is still missing, tell me the approximate time you saved it and whether you saw a save confirmation so support can trace the correct record.',
        actions: [{ label: 'Open my saved listings', path: listingPath }],
        suggestions: ['I found the draft', 'It is still missing', 'I never saw a save confirmation'],
        context: { ...nextContext, awaiting: 'listing_save_detail' },
      }
    }
    return {
      text: 'Tell me what the save process shows after you click Save draft. The exact message or change on the screen will help me narrow down the problem.',
      suggestions: ['It says validation error', 'It says unauthorized', 'It says network error', 'The draft saved successfully'],
      context: { ...nextContext, awaiting: 'listing_save_detail' },
    }
  }

  if (message.includes('navigate the website') || message.includes('navigate smart help market') || message.includes('navigating smart help market') || message.includes('help me navigate') || message.includes('help navigating') || message.includes('what else can you help me with') || message.includes('show me the useful things')) {
    const workspaceMenus: Record<WorkspaceRole, string[]> = {
      buyer: ['Find a property to rent', 'Find a product', 'Find a service', 'View my saved items'],
      landlord: ['Create a property listing', 'Manage my tenants', 'Track rent and renewals', 'Manage maintenance'],
      agent: ['Manage my listings', 'View my clients', 'Check commissions', 'Create an agent listing'],
      seller: ['Add a product', 'Manage inventory', 'View orders', 'Review my sales'],
      service_provider: ['Add a service', 'View bookings', 'Manage availability', 'Manage my services'],
    }
    if (!activeRole) {
      return {
        text: 'I can show you the correct tools, but I need to know which workspace you want to use. Your account may have more than one assigned role.',
        suggestions: roles.map((role) => canonicalWorkspaceRole(role)).filter((role): role is WorkspaceRole => role !== null).map((role) => `As a ${role === 'service_provider' ? 'service provider' : role}`),
        context: nextContext,
      }
    }
    return {
      text: `You are using the ${activeRole === 'service_provider' ? 'Service Provider' : activeRole.charAt(0).toUpperCase() + activeRole.slice(1)} workspace. Choose a task and I will guide you through it step by step. I will keep the guidance within the permissions assigned to this role.`,
      suggestions: workspaceMenus[activeRole],
      context: nextContext,
    }
  }

  const listingHelpRequest = [
    'issue creating listing', 'problem creating listing', 'trouble creating listing',
    'having issues creating my listing', 'cannot create listing', "can't create listing",
    'unable to create listing', 'listing will not save', 'listing wont save',
    'error creating listing', 'problem posting property', 'trouble posting property',
  ].some((cue) => message.includes(cue)) || awaiting === 'listing_role'

  if (listingHelpRequest) {
    const listingRoles = roles
      .map((role) => canonicalWorkspaceRole(role))
      .filter((role): role is WorkspaceRole => role === 'landlord' || role === 'agent')
    const listingRole = activeRole || (listingRoles.length === 1 ? listingRoles[0] : null)

    if (!listingRole && listingRoles.length > 1) {
      return {
        text: 'I can help with that. Your account has both Landlord and Agent access. Are you creating this listing as a landlord for your own property, or as an agent for a property you represent?',
        suggestions: ['As a landlord', 'As an agent'],
        context: { ...nextContext, awaiting: 'listing_role' },
      }
    }

    if (listingRole === 'landlord') {
      delete nextContext.awaiting
      return {
        text: 'I can help you troubleshoot your landlord property listing. Start from your Landlord workspace and open Add a property. Tell me exactly where you get stuck: opening Listing Studio, entering property details, adding unit information, saving the draft, or submitting the listing. I will guide you through the landlord workflow.',
        actions: [{ label: 'Open landlord property listings', path: '/landlord/properties' }, { label: 'Create a property listing', path: '/landlord/properties/new' }],
        suggestions: ['Listing Studio will not open', 'My property details will not save', 'I get an error when saving'],
        context: nextContext,
      }
    }

    if (listingRole === 'agent') {
      delete nextContext.awaiting
      return {
        text: 'I can help with the Agent listing workflow. Use your Agent workspace to create or manage a listing for a property you are authorised to represent. Agent tools are separate from the landlord’s property-ownership, tenant, rent and maintenance management tools. Tell me whether you are stuck opening the listing form, entering represented-property details, saving a draft, or submitting the listing.',
        actions: [{ label: 'Open agent listings', path: '/agent/listings' }, { label: 'Create an agent listing', path: '/agent/listings/new' }],
        suggestions: ['The agent listing form will not open', 'My represented property details will not save', 'I get an error when saving'],
        context: nextContext,
      }
    }

    if (roles.includes('agent') && !roles.includes('landlord')) {
      return {
        text: 'Your account has Agent access, not Landlord access. You can work with properties you are authorised to represent through the Agent listing workspace. Landlord-only tools such as managing the owner’s tenants, rent collection and property maintenance are not available through the Agent role. If you need to manage your own property as its landlord, request the Landlord role from the platform administrator.',
        actions: [{ label: 'Open agent listings', path: '/agent/listings' }],
        context: nextContext,
      }
    }

    return {
      text: 'I could not confirm a Landlord or Agent workspace on your account. Listing tools depend on the roles assigned to your account. Please check your account access or contact the platform administrator so the correct role can be assigned.',
      needsAdmin: true,
      context: nextContext,
    }
  }

  const landlordOnlyRequest = ['tenant', 'tenants', 'tenant management', 'collect rent', 'rent collection', 'rent arrears', 'property maintenance', 'maintenance request', 'manage occupancy', 'occupancy'].some((cue) => message.includes(cue))
  if (landlordOnlyRequest && activeRole === 'agent') {
    const alsoLandlord = roles.map((role) => canonicalWorkspaceRole(role)).includes('landlord')
    return {
      text: alsoLandlord
        ? 'That task belongs to your Landlord workspace, not the Agent workspace currently active. Your account also has Landlord access, so you can switch to that workspace to manage your own tenants, rent, occupancy and maintenance. The Agent role remains limited to authorised representation and agent activity.'
        : 'Those are Landlord property-management responsibilities. Your current Agent workspace is for properties you are authorised to represent, client enquiries and agent activity. It does not grant access to the landlord’s tenant, rent or maintenance management. You can ask the property owner to handle that action or contact the platform administrator if you believe your account role is incorrect.',
      actions: alsoLandlord
        ? [{ label: 'Open Landlord tenant management', path: '/landlord/tenants' }, { label: 'Open Agent workspace', path: '/agent/dashboard' }]
        : [{ label: 'Open Agent workspace', path: '/agent/dashboard' }],
      context: nextContext,
    }
  }


  if (prediction.intent === 'support' || ['speak to an administrator', 'contact support', 'talk to a person', 'human support', 'speak to support', 'report a problem', 'report an issue', 'submit a complaint', 'i have a complaint', 'need an admin'].some((term) => message.includes(term))) {
    return {
      text: 'Of course. I can pass this conversation to the support team. Please add a short subject and explain what you need so an administrator can follow up.',
      needsAdmin: true,
      context: nextContext,
    }
  }

  if (awaiting === 'location') {
    const previous = typeof context.pendingSearchText === 'string' ? context.pendingSearchText : ''
    searchText = `${previous} ${rawMessage}`.trim()
    delete nextContext.pendingSearchText
    let locationConfirmation = ''
    if (normalize(rawMessage) === 'any location') {
      delete nextContext.selectedLocation
      delete nextContext.selectedLocationVerified
    } else {
      nextContext.selectedLocation = rawMessage.trim()
      try {
        const geoEnabled = await getSetting('geo.enabled', false)
        if (geoEnabled === true) {
          const resolved = await resolveGeographicLocation(rawMessage)
          if (resolved.status === 'resolved' && resolved.result) {
            nextContext.selectedLocationVerified = resolved.result.displayName
            locationConfirmation = ` I also resolved the area as ${resolved.result.displayName}. Location data: ${resolved.result.attribution}.`
          }
        }
      } catch {
        // Geographic lookup is optional. Keep the user's original location for listing search.
      }
    }
    nextContext.awaiting = 'budget'
    nextContext.pendingBudgetSearchText = searchText
    return {
      text: `Great. What budget range should I use? You can also choose any budget and I will show the available matches.${locationConfirmation}`,
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
  const actions = routeForRequest(rawMessage, roles, activeRole)
  if (actions.length) {
    return {
      text: 'I found the right place for that. Use the shortcut below and I will take you directly there.',
      actions,
      suggestions: ['What else can you help me with?', 'Find something in the marketplace'],
      context: nextContext,
    }
  }

  if (prediction.intent === 'greeting') {
    const roleWelcome: Record<WorkspaceRole, { text: string; suggestions: string[] }> = {
      buyer: {
        text: 'Hello! 😊 I can help you discover properties, products and services, manage enquiries, save items and understand your buyer tools. What would you like to do?',
        suggestions: ['Find accommodation', 'Find a product', 'Find a service', 'View my saved items'],
      },
      landlord: {
        text: 'Hello! 😊 I am ready to help with your Landlord workspace, including property listings, units, tenant management, rent and renewals, and maintenance. What are you working on today?',
        suggestions: ['Create a property listing', 'Manage my tenants', 'Track rent and renewals', 'Manage maintenance'],
      },
      agent: {
        text: 'Hello! 😊 I can help with your Agent workspace, including represented property listings, clients, inspections and commissions. I will keep agent guidance separate from landlord-only property management. What do you need help with?',
        suggestions: ['Manage my listings', 'View my clients', 'Check commissions', 'Create an agent listing'],
      },
      seller: {
        text: 'Hello! 😊 I can help with your Seller workspace, including product listings, inventory, orders and sales. What would you like to work on?',
        suggestions: ['Add a product', 'Manage inventory', 'View orders', 'Review my sales'],
      },
      service_provider: {
        text: 'Hello! 😊 I can help with your Service Provider workspace, including service listings, bookings and availability. What would you like to work on?',
        suggestions: ['Add a service', 'View bookings', 'Manage availability', 'Manage my services'],
      },
    }
    const welcome = activeRole ? roleWelcome[activeRole] : null
    return {
      text: welcome?.text || 'Hello! 😊 I am ready to help you explore the marketplace, find what you need or understand how SMART HELP MARKET works. What would you like to do?',
      suggestions: welcome?.suggestions || ['Find accommodation', 'Find a roommate', 'Find a product', 'Find a service'],
      context: nextContext,
    }
  }

  if (message.includes('how do i save a listing') || message.includes('save a listing and find it again')) {
    return {
      text: 'Open the listing you are interested in and use its Save or favourite control. If the site asks you to sign in, complete sign-in first so the saved item is attached to your account. You can return to it later from Saved Items. Saving a listing does not reserve the property or product and does not replace contacting the owner or seller.',
      actions: [{ label: 'Open saved items', path: '/buyer/saved' }, { label: 'Explore listings', path: '/explore' }],
      suggestions: ['Find a property to rent', 'Find a product', 'How do I contact a landlord?'],
      context: nextContext,
    }
  }

  if (message.includes('how do i contact a landlord') || message.includes('send an enquiry to a property landlord')) {
    return {
      text: 'Open the property listing and review its details first. Use the enquiry or contact option shown on that listing to send your question through the marketplace. Include the property or unit you mean, your preferred inspection time and any important questions. Keep communication in the marketplace where possible, and do not send deposits before verifying the property, the person authorised to offer it and the agreed terms.',
      actions: [{ label: 'Explore properties', path: '/explore' }],
      suggestions: ['How do I inspect a property?', 'What should I ask before renting?', 'Speak to an administrator'],
      context: nextContext,
    }
  }

  if (message.includes('what happens if there is a dispute') || message.includes('marketplace dispute process')) {
    return {
      text: 'If a transaction dispute occurs, stop making additional payments and keep the listing details, messages, receipts, delivery evidence and any agreed terms. Contact the other party through the marketplace and use the available dispute or support channel. The outcome should follow the published transaction terms and any authorised payment provider’s process. Do not assume funds are held in escrow unless the live transaction explicitly confirms an authorised escrow arrangement.',
      suggestions: ['Explain how escrow works', 'Speak to an administrator', 'How do I inspect a property?'],
      context: nextContext,
    }
  }

  if (message.includes('how do i inspect a property') || message.includes('arrange a property inspection') || message.includes('what to inspect') || message.includes('inspection checklist')) {
    return {
      text: 'To prepare for a property inspection, first review the listing and contact the landlord or authorised agent through the marketplace. Agree on a date, time and who will meet you. Confirm the property address and inspection instructions through the authorised process, and do not rely on an unverified location pin. During the visit, check access, water, electricity, drainage, visible defects, security and the exact unit being offered. Ask about rent, deposits, fees, tenancy terms and what is included. Do not pay a deposit solely because you attended an inspection.',
      actions: [{ label: 'Open my inspections', path: '/buyer/inspections' }],
      suggestions: ['Find a property to rent', 'What should I check during inspection?', 'Speak to an administrator'],
      context: nextContext,
    }
  }

  if (prediction.intent === 'escrow_explanation') {
    return {
      text: 'Escrow is a transaction arrangement where an authorised independent provider holds a payment until the agreed conditions are met. Let me walk you through a typical example.',
      guide: {
        kind: 'escrow',
        steps: [
          { title: 'Agree on the terms', description: 'The buyer and seller agree on the item or service, amount, delivery requirements, inspection period and dispute conditions before payment.', icon: '🤝' },
          { title: 'Payment is secured', description: 'The buyer pays the authorised escrow provider. The provider confirms receipt and holds the funds under the agreed terms.', icon: '🛡️' },
          { title: 'Seller fulfils the agreement', description: 'The seller delivers the item or completes the agreed service. Evidence and milestones should follow the transaction terms.', icon: '📦' },
          { title: 'Buyer reviews the delivery', description: 'The buyer confirms that the agreement was fulfilled, or raises a dispute within the agreed review period.', icon: '🔎' },
          { title: 'Funds are released or disputed', description: 'The escrow provider releases funds or follows the agreed dispute-resolution process. The exact outcome depends on the contract and provider rules.', icon: '✅' },
        ],
        disclaimer: 'Educational example only. This does not mean SMART HELP MARKET currently holds or protects funds through a live escrow service. Check the active payment and transaction terms before paying.',
      },
      suggestions: ['Explain the buyer protection steps', 'What happens if there is a dispute?', 'How do I inspect a property?'],
      context: nextContext,
    }
  }

  if (prediction.intent === 'roommate_search' && (message.includes('advice') || message.includes('consider') || message.includes('compatible roommate') || message.includes('roommate agreement'))) {
    return {
      text: 'Before sharing accommodation, compare more than rent. Discuss each person’s budget and payment dates, preferred location, cleanliness, visitors, noise, smoking, cooking, work or study schedules, shared bills, security expectations and how disagreements will be handled. Agree in writing on deposits, utilities, notice periods and responsibility for damage before moving in. Meet safely, verify the accommodation and avoid sending money before confirming the arrangement.',
      suggestions: ['Find a roommate', 'Find a property to rent', 'What should a roommate agreement include?'],
      context: nextContext,
    }
  }

  if (prediction.intent === 'roommate_search') {
    return {
      text: 'I understand you are looking for a roommate or flatmate. I can take you to the roommate matching area where you can review the available matching features. I will not invent a match or show a profile that has not been published.',
      actions: [{ label: 'Open roommate matching', path: '/buyer/roommates' }],
      suggestions: ['What should I consider before sharing accommodation?', 'Find a property to rent'],
      context: nextContext,
    }
  }

  if (prediction.intent === 'neighbourhood_question') {
    return {
      text: 'You want to understand the neighbourhood, not just the property. The Neighbourhood Space is where community members share local experiences and discussions. I can open it for you. I will distinguish residents’ reports from independently verified facts, and I will not claim to have checked discussions that are not yet connected to this assistant.',
      actions: [{ label: 'Open neighbourhood space', path: '/buyer/community' }],
      suggestions: ['Find accommodation', 'Ask about electricity and water', 'Ask about road conditions'],
      context: nextContext,
    }
  }

  const propertyTerms = ['apartment', 'house', 'home', 'room', 'flat', 'land', 'property', 'rent', 'buy property', 'buy a house', 'for sale', 'self contained', 'self-contained', 'accommodation', 'bedsitter', 'hostel']
  const productTerms = ['product', 'laptop', 'phone', 'computer', 'furniture', 'electronics', 'buy a', 'shop']
  const serviceTerms = ['service', 'plumber', 'plumbing', 'electrician', 'electrical', 'cleaning', 'repair', 'mechanic', 'designer']
  const category = prediction.intent === 'property_search'
    ? 'properties'
    : prediction.intent === 'product_search'
      ? 'products'
      : prediction.intent === 'service_search'
        ? 'services'
        : propertyTerms.some((term) => searchMessage.includes(term))
          ? 'properties'
          : productTerms.some((term) => searchMessage.includes(term))
            ? 'products'
            : serviceTerms.some((term) => searchMessage.includes(term))
              ? 'services'
              : null

  if (!category && (message.includes('how do i') || message.includes('where can i') || message.includes('how can i'))) {
    const availableRoles = roles
      .map((role) => canonicalWorkspaceRole(role))
      .filter((role): role is WorkspaceRole => role !== null)
    if (!activeRole && availableRoles.length > 1) {
      return {
        text: 'I can guide you through the correct workspace. Which part of your marketplace account are you asking about?',
        suggestions: availableRoles.map((role) => `As a ${role === 'service_provider' ? 'service provider' : role}`),
        context: nextContext,
      }
    }
    const rolePath = activeRole ? workspacePathRole(activeRole) : 'buyer'
    return {
      text: 'I can guide you around the marketplace using the workspace assigned to your account. Tell me the feature you want to use, or choose one of these destinations.',
      actions: [
        ...(activeRole ? [{ label: 'My dashboard', path: `/${rolePath}/dashboard` }] : []),
        { label: 'Explore marketplace', path: '/explore' },
        ...(activeRole ? [{ label: 'My messages', path: `/${rolePath}/messages` }] : []),
        ...(activeRole ? [{ label: 'Neighbourhood space', path: `/${rolePath}/community` }] : []),
      ],
      suggestions: ['How do I save a listing?', 'How do I contact a landlord?', 'How do I create a listing?'],
      context: nextContext,
    }
  }

  if (!category && typeof nextContext.lastSelectedSuggestion === 'string') {
    const selected = nextContext.lastSelectedSuggestion
    const previous = typeof nextContext.lastSuggestionContext === 'string' ? nextContext.lastSuggestionContext : ''
    return {
      text: `I understand you selected "${selected}" after I asked: "${previous}". I will keep that context rather than restart the conversation. Please tell me one more detail about what you want to achieve, or describe what happens on your screen.`,
      suggestions: ['Explain what I should do next', 'I need more specific help', 'Speak to an administrator'],
      context: nextContext,
    }
  }

  if (!category) {
    return {
      text: 'I can help you find properties, products and services, or guide you to any feature on the website. Tell me what you are trying to achieve and I will ask focused follow-up questions.',
      suggestions: activeRole
        ? ['Help me navigate the website', 'What else can you help me with?', 'Speak to an administrator']
        : ['Find a property to rent', 'Find a product', 'Find a service', 'Help me navigate the website', 'Speak to an administrator'],
      context: nextContext,
    }
  }

  const hasLocation = /\b(in|at|around|near|within)\s+[a-z]/i.test(searchText)
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
  const hasBudget = /(?:₦|\b(?:under|below|less than|up to|maximum|max|budget|between|above|over|at least)\b|\d\s*[km]\b)/i.test(searchText)

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
    [category, patterns, `%${normalize(searchText)}%`, budget.min, budget.max, typeof nextContext.selectedLocation === 'string' ? nextContext.selectedLocation : null],
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
  const suggestionOfMessageId = req.body?.suggestionOfMessageId
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Enter a message between 1 and ${MAX_MESSAGE_LENGTH} characters.` })
    return
  }
  if (requestedConversationId !== undefined && (typeof requestedConversationId !== 'string' || !/^[1-9]\d*$/.test(requestedConversationId))) {
    res.status(400).json({ error: 'Invalid conversation.' })
    return
  }
  if (suggestionOfMessageId !== undefined && (typeof suggestionOfMessageId !== 'string' || !/^[1-9]\d*$/.test(suggestionOfMessageId) || !requestedConversationId)) {
    res.status(400).json({ error: 'Invalid suggestion selection.' })
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

    if (!suggestionOfMessageId) {
      delete context.lastSelectedSuggestion
      delete context.lastSuggestionContext
    }

    let effectiveMessage = message
    const roleResult = await client.query<{ role_key: string }>(
      `SELECT r.role_key FROM public.marketplace_user_roles ur
       JOIN public.marketplace_roles r ON r.role_id = ur.role_id
       WHERE ur.user_id = $1 ORDER BY r.role_key`,
      [userId],
    )
    const assignedRoles = roleResult.rows.map((row) => row.role_key)

    if (suggestionOfMessageId) {
      const previousAssistant = await client.query<{ message_text: string; metadata: unknown }>(
        `SELECT message_text, metadata
         FROM public.marketplace_help_messages
         WHERE message_id = $1 AND conversation_id = $2 AND sender_type = 'assistant'
         LIMIT 1`,
        [suggestionOfMessageId, conversationId],
      )
      if (!previousAssistant.rowCount) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: 'This suggestion is no longer available in that response. Please choose an option from the relevant assistant message.' })
        return
      }
      let previousMetadata = previousAssistant.rows[0].metadata
      if (typeof previousMetadata === 'string') {
        try { previousMetadata = JSON.parse(previousMetadata) as unknown } catch { previousMetadata = null }
      }
      const offeredSuggestions = typeof previousMetadata === 'object' && previousMetadata !== null
        && 'suggestions' in previousMetadata && Array.isArray(previousMetadata.suggestions)
        ? previousMetadata.suggestions.filter((item): item is string => typeof item === 'string')
        : []
      if (!offeredSuggestions.includes(message)) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: 'That option was not part of the selected assistant response. Please choose one of the displayed suggestions.' })
        return
      }
      const expanded = expandSuggestionSelection(message, previousAssistant.rows[0].message_text, context, assignedRoles)
      effectiveMessage = expanded.message
      context = expanded.context
    }

    await client.query(
      `INSERT INTO public.marketplace_help_messages (conversation_id, sender_type, message_text, metadata)
       VALUES ($1, 'user', $2, $3::jsonb)`,
      [conversationId, message, JSON.stringify(suggestionOfMessageId ? { selectedSuggestionOfMessageId: suggestionOfMessageId } : {})],
    )

    const answer = await answerMessage(effectiveMessage, context, assignedRoles, preferredRole)
    const prediction = await predictIntent(effectiveMessage)
    const assistantMessage = await client.query<{ id: string }>(
      `INSERT INTO public.marketplace_help_messages (conversation_id, sender_type, message_text, metadata)
       VALUES ($1, 'assistant', $2, $3::jsonb)
       RETURNING message_id::text AS id`,
      [conversationId, answer.text, JSON.stringify({
        suggestions: answer.suggestions || [],
        actions: answer.actions || [],
        matches: answer.matches || [],
        guide: answer.guide || null,
        intent: prediction.intent,
        modelVersion: prediction.modelVersion,
      })],
    )
    const learningEnabled = await client.query<{ setting_value: unknown }>(
      'SELECT setting_value FROM public.platform_settings WHERE setting_key = $1',
      ['help.ai.learning_enabled'],
    )
    if (learningEnabled.rows[0]?.setting_value !== false) {
      await client.query(
        `INSERT INTO public.marketplace_ai_learning_events
         (user_id, conversation_id, assistant_message_id, intent_key, confidence, meaningful_token_count, model_version, feature_hashes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [userId, conversationId, assistantMessage.rows[0].id, prediction.intent,
         prediction.confidence, countMeaningfulTokens(effectiveMessage), getBigmazModelVersion(), JSON.stringify(hashIntentFeatures(effectiveMessage))],
      )
    }
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
      assistantMessageId: assistantMessage.rows[0].id,
      reply: answer.text,
      suggestions: answer.suggestions || [],
      actions: answer.actions || [],
      matches: answer.matches || [],
      guide: answer.guide || null,
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

router.post('/feedback', async (req: Request, res: Response) => {
  const feedbackEnabled = await getSetting('help.ai.feedback_enabled', true).catch(() => true)
  if (feedbackEnabled === false) {
    res.status(503).json({ error: 'Response feedback is currently disabled.' })
    return
  }
  const messageId = typeof req.body?.assistantMessageId === 'string' ? req.body.assistantMessageId : ''
  const helpful = req.body?.helpful
  const allowedIntents: BigmazIntent[] = [
    'greeting', 'property_search', 'roommate_search', 'product_search',
    'service_search', 'neighbourhood_question', 'escrow_explanation',
    'navigation', 'support', 'general',
  ]
  const correctedIntent = typeof req.body?.correctedIntent === 'string'
    && allowedIntents.includes(req.body.correctedIntent as BigmazIntent)
    ? req.body.correctedIntent as BigmazIntent
    : null
  if (!/^[1-9]\d*$/.test(messageId) || typeof helpful !== 'boolean' || (req.body?.correctedIntent && !correctedIntent)) {
    res.status(400).json({ error: 'A valid assistant response and feedback rating are required.' })
    return
  }
  try {
    const db = getDatabasePool()
    const ownership = await db.query(
      `SELECT m.message_id
       FROM public.marketplace_help_messages m
       JOIN public.marketplace_help_conversations c ON c.conversation_id = m.conversation_id
       WHERE m.message_id = $1 AND c.user_id = $2 AND m.sender_type = 'assistant'`,
      [messageId, userIdFrom(res)],
    )
    if (!ownership.rowCount) {
      res.status(404).json({ error: 'Assistant response not found.' })
      return
    }
    const previous = await db.query<{ corrected_intent: string | null }>(
      'SELECT corrected_intent FROM public.marketplace_ai_feedback WHERE user_id = $1 AND message_id = $2',
      [userIdFrom(res), messageId],
    )
    await db.query(
      `INSERT INTO public.marketplace_ai_feedback (user_id, message_id, helpful, corrected_intent)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, message_id) DO UPDATE
       SET helpful = EXCLUDED.helpful, corrected_intent = EXCLUDED.corrected_intent`,
      [userIdFrom(res), messageId, helpful, correctedIntent],
    )
    const event = await db.query<{ intent_key: BigmazIntent; feature_hashes: string[] }>(
      `SELECT intent_key, feature_hashes FROM public.marketplace_ai_learning_events
       WHERE assistant_message_id = $1 LIMIT 1`,
      [messageId],
    )
    if (event.rowCount) {
      await db.query(
        `UPDATE public.marketplace_ai_learning_events SET outcome = $2 WHERE assistant_message_id = $1`,
        [messageId, helpful ? 'helpful' : 'not_helpful'],
      )
      const hashes = Array.isArray(event.rows[0].feature_hashes) ? event.rows[0].feature_hashes : []
      const correctionChanged = Boolean(correctedIntent && previous.rows[0]?.corrected_intent !== correctedIntent)
      const learningEnabled = await getSetting('help.ai.learning_enabled', true).catch(() => true)
      if (correctionChanged && learningEnabled !== false) {
        for (const featureHash of hashes) {
          await db.query(
            `INSERT INTO public.marketplace_ai_intent_weights (feature_hash, intent_key, weight, sample_count)
             VALUES ($1, $2, 0.12, 1)
             ON CONFLICT (feature_hash, intent_key) DO UPDATE
             SET weight = LEAST(1, GREATEST(-1, public.marketplace_ai_intent_weights.weight + 0.12)),
                 sample_count = public.marketplace_ai_intent_weights.sample_count + 1,
                 updated_at = NOW()`,
            [featureHash, correctedIntent],
          )
          if (event.rows[0].intent_key !== correctedIntent) {
            await db.query(
              `INSERT INTO public.marketplace_ai_intent_weights (feature_hash, intent_key, weight, sample_count)
               VALUES ($1, $2, -0.06, 1)
               ON CONFLICT (feature_hash, intent_key) DO UPDATE
               SET weight = LEAST(1, GREATEST(-1, public.marketplace_ai_intent_weights.weight - 0.06)),
                   sample_count = public.marketplace_ai_intent_weights.sample_count + 1,
                   updated_at = NOW()`,
              [featureHash, event.rows[0].intent_key],
            )
          }
        }
      }
    }
    res.status(201).json({
      status: 'ok',
      message: correctedIntent
        ? 'Thank you. BIGMAZ AI has recorded your correction for its adaptive intent model.'
        : 'Thank you. Your feedback will help us evaluate and improve BIGMAZ AI.',
    })
  } catch {
    res.status(500).json({ error: 'Your feedback could not be saved.' })
  }
})

router.get('/admin/intelligence/summary', requirePermission('dashboard.view'), async (_req, res) => {
  try {
    const [events, feedback, examples, adaptiveFeatures] = await Promise.all([
      getDatabasePool().query(
        `SELECT COUNT(*)::int AS interactions,
                COUNT(*) FILTER (WHERE outcome = 'helpful')::int AS helpful,
                COUNT(*) FILTER (WHERE outcome = 'not_helpful')::int AS not_helpful,
                COUNT(DISTINCT intent_key)::int AS intents_observed
         FROM public.marketplace_ai_learning_events
         WHERE created_at >= NOW() - INTERVAL '30 days'`,
      ),
      getDatabasePool().query(
        `SELECT COUNT(*)::int AS ratings,
                COUNT(*) FILTER (WHERE helpful = TRUE)::int AS positive
         FROM public.marketplace_ai_feedback
         WHERE created_at >= NOW() - INTERVAL '30 days'`,
      ),
      getDatabasePool().query(
        `SELECT COUNT(*) FILTER (WHERE approved = TRUE)::int AS approved,
                COUNT(*) FILTER (WHERE approved = FALSE)::int AS pending
         FROM public.marketplace_ai_training_examples`,
      ),
      getDatabasePool().query(
        `SELECT COUNT(*)::int AS learned_features,
                COALESCE(SUM(sample_count), 0)::int AS correction_samples
         FROM public.marketplace_ai_intent_weights`,
      ),
    ])
    res.json({
      engine: 'BIGMAZ Intelligence Engine',
      modelVersion: getBigmazModelVersion(),
      period: 'last_30_days',
      interactions: events.rows[0],
      feedback: feedback.rows[0],
      trainingExamples: examples.rows[0],
      adaptiveFeatures: adaptiveFeatures.rows[0],
    })
  } catch {
    res.status(500).json({ error: 'BIGMAZ Intelligence metrics could not be loaded.' })
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
