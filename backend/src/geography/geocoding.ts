import { createHash } from 'node:crypto'
import { getDatabasePool } from '../database'

const CACHE_TTL_FALLBACK_HOURS = 720
const PROVIDER_INTERVAL_MS = 1100
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search'

export interface GeographicCandidate {
  displayName: string
  latitude: number
  longitude: number
  category: string | null
  type: string | null
  city: string | null
  region: string | null
  country: string | null
  countryCode: string | null
  confidence: number | null
  provider: string
  attribution: string
}

interface NominatimResult {
  place_id?: number
  lat?: string
  lon?: string
  display_name?: string
  category?: string
  type?: string
  importance?: number
  address?: Record<string, string>
}

interface CacheRow {
  results: GeographicCandidate[] | null
  expires_at: Date
}

let providerQueue: Promise<void> = Promise.resolve()
let lastProviderRequestAt = 0

function normalizeQuery(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function readStringSetting(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function readNumberSetting(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)))
}

async function getSetting(key: string, fallback: unknown): Promise<unknown> {
  const result = await getDatabasePool().query<{ setting_value: unknown }>(
    'SELECT setting_value FROM public.platform_settings WHERE setting_key = $1 LIMIT 1',
    [key],
  )
  return result.rows[0]?.setting_value ?? fallback
}

function queryHash(query: string, countryCode: string, provider: string): string {
  return createHash('sha256')
    .update(`${provider}| ${countryCode}| ${query}`)
    .digest('hex')
}

async function reserveProviderSlot(): Promise<void> {
  let release!: () => void
  const previous = providerQueue
  providerQueue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous

  try {
    const waitMs = Math.max(0, lastProviderRequestAt + PROVIDER_INTERVAL_MS - Date.now())
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
    }
    lastProviderRequestAt = Date.now()
  } finally {
    release()
  }
}

function mapCandidate(item: NominatimResult): GeographicCandidate | null {
  const latitude = Number(item.lat)
  const longitude = Number(item.lon)
  const displayName = typeof item.display_name === 'string' ? item.display_name.trim() : ''

  if (
    !displayName ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }

  const address = item.address ?? {}
  const city = address.city || address.town || address.village || address.municipality || address.county || null
  const region = address.state || address.region || null
  const country = address.country || null
  const countryCode = address.country_code?.toLowerCase() || null
  const importance = Number(item.importance)

  return {
    displayName,
    latitude,
    longitude,
    category: item.category ?? null,
    type: item.type ?? null,
    city,
    region,
    country,
    countryCode,
    confidence: Number.isFinite(importance) ? Math.min(1, Math.max(0, importance)) : null,
    provider: 'nominatim',
    attribution: '© OpenStreetMap contributors',
  }
}

export async function geocodeLocation(rawQuery: string): Promise<{
  candidates: GeographicCandidate[]
  cached: boolean
  provider: string
  attribution: string
}> {
  const query = normalizeQuery(rawQuery)
  if (query.length < 3 || query.length > 120) {
    throw new Error('Enter a location between 3 and 120 characters.')
  }

  const [enabledValue, providerValue, countryValue, ttlValue, maxValue] = await Promise.all([
    getSetting('geo.enabled', false),
    getSetting('geo.provider', 'nominatim'),
    getSetting('geo.country_code', 'ng'),
    getSetting('geo.cache_ttl_hours', CACHE_TTL_FALLBACK_HOURS),
    getSetting('geo.max_results', 5),
  ])

  if (enabledValue !== true) {
    throw new Error('Geographic search is currently unavailable.')
  }

  const provider = readStringSetting(providerValue, 'nominatim').toLowerCase()
  if (provider !== 'nominatim') {
    throw new Error('The configured geographic provider is not supported by this server version.')
  }

  const countryCode = readStringSetting(countryValue, 'ng').toLowerCase()
  if (!/^[a-z]{2}$/.test(countryCode)) {
    throw new Error('The geographic country setting is invalid.')
  }

  const ttlHours = readNumberSetting(ttlValue, CACHE_TTL_FALLBACK_HOURS, 1, 8760)
  const maxResults = readNumberSetting(maxValue, 5, 1, 5)
  const hash = queryHash(query, countryCode, provider)
  const db = getDatabasePool()

  const cached = await db.query<CacheRow>(
    `SELECT results, expires_at
     FROM public.marketplace_geocode_cache
     WHERE query_hash = $1
       AND expires_at > NOW()
     LIMIT 1`,
    [hash],
  )

  if (cached.rows[0]) {
    return {
      candidates: Array.isArray(cached.rows[0].results)
        ? cached.rows[0].results.slice(0, maxResults)
        : [],
      cached: true,
      provider,
      attribution: '© OpenStreetMap contributors',
    }
  }

  const userAgent = process.env.BIGMAZ_GEO_USER_AGENT?.trim()
  if (!userAgent || !/SMART HELP MARKET/i.test(userAgent) || userAgent.length < 20) {
    throw new Error('The server geocoding identity is not configured. Set BIGMAZ_GEO_USER_AGENT before enabling geographic search.')
  }

  await reserveProviderSlot()

  const url = new URL(NOMINATIM_ENDPOINT)
  url.searchParams.set('q', rawQuery.trim())
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(maxResults))
  url.searchParams.set('countrycodes', countryCode)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (response.status === 403 || response.status === 429) {
    throw new Error('The location provider temporarily declined the request. Please try again later.')
  }

  if (!response.ok) {
    throw new Error('The location provider is temporarily unavailable.')
  }

  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) {
    throw new Error('The location provider returned an invalid response.')
  }

  const candidates = payload
    .map((item) => mapCandidate(item as NominatimResult))
    .filter((item): item is GeographicCandidate => item !== null)
    .slice(0, maxResults)

  if (candidates.length) {
    const first = candidates[0]
    await db.query(
      `INSERT INTO public.marketplace_geocode_cache
        (
          query_hash,
          normalized_query,
          display_name,
          latitude,
          longitude,
          country_code,
          provider_key,
          provider_place_id,
          confidence,
          results,
          expires_at,
          updated_at
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW() + ($11::int * INTERVAL '1 hour'), NOW())
       ON CONFLICT (query_hash) DO UPDATE SET
         normalized_query = EXCLUDED.normalized_query,
         display_name = EXCLUDED.display_name,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         country_code = EXCLUDED.country_code,
         provider_key = EXCLUDED.provider_key,
         provider_place_id = EXCLUDED.provider_place_id,
         confidence = EXCLUDED.confidence,
         results = EXCLUDED.results,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [
        hash,
        query,
        first.displayName,
        first.latitude,
        first.longitude,
        first.countryCode,
        provider,
        null,
        first.confidence,
        JSON.stringify(candidates),
        ttlHours,
      ],
    )
  }

  return {
    candidates,
    cached: false,
    provider,
    attribution: '© OpenStreetMap contributors',
  }
}
