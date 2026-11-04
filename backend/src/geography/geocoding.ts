import { createHash } from 'node:crypto'
import { getDatabasePool } from '../database'

export type GeocodeResult = {
  displayName: string
  latitude: number
  longitude: number
  countryCode: string | null
  provider: 'nominatim'
  placeId: string | null
  confidence: number | null
  attribution: '© OpenStreetMap contributors'
}

type NominatimResult = {
  place_id?: number
  lat?: string
  lon?: string
  display_name?: string
  address?: { country_code?: string }
  importance?: number
}

let lastProviderRequestAt = 0
let providerQueue: Promise<void> = Promise.resolve()

function normalizeQuery(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function settingNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback
}

async function readSetting(key: string, fallback: unknown): Promise<unknown> {
  const result = await getDatabasePool().query<{ setting_value: unknown }>(
    'SELECT setting_value FROM public.platform_settings WHERE setting_key = $1 LIMIT 1',
    [key],
  )
  return result.rows[0]?.setting_value ?? fallback
}

async function waitForProviderSlot(): Promise<void> {
  const previous = providerQueue
  let release: () => void = () => undefined
  providerQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    const waitMs = Math.max(0, 1100 - (Date.now() - lastProviderRequestAt))
    if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
    lastProviderRequestAt = Date.now()
  } finally {
    release()
  }
}

function validResult(item: NominatimResult, countryCode: string): GeocodeResult | null {
  const latitude = Number(item.lat)
  const longitude = Number(item.lon)
  const displayName = typeof item.display_name === 'string' ? item.display_name.trim() : ''
  const resultCountry = typeof item.address?.country_code === 'string'
    ? item.address.country_code.toLowerCase()
    : null

  if (
    !displayName ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180 ||
    (countryCode && resultCountry && resultCountry !== countryCode)
  ) return null

  return {
    displayName,
    latitude,
    longitude,
    countryCode: resultCountry,
    provider: 'nominatim',
    placeId: item.place_id ? String(item.place_id) : null,
    confidence: typeof item.importance === 'number'
      ? Math.max(0, Math.min(1, item.importance))
      : null,
    attribution: '© OpenStreetMap contributors',
  }
}

export async function resolveGeographicLocation(rawQuery: string): Promise<{
  status: 'resolved' | 'disabled' | 'not_configured' | 'not_found'
  result?: GeocodeResult
}> {
  const query = normalizeQuery(rawQuery)
  if (query.length < 2 || query.length > 160) {
    throw new Error('Location query must contain between 2 and 160 characters.')
  }

  const [enabledValue, providerValue, countryValue, ttlValue, maxResultsValue] = await Promise.all([
    readSetting('geo.enabled', false),
    readSetting('geo.provider', 'nominatim'),
    readSetting('geo.country_code', 'ng'),
    readSetting('geo.cache_ttl_hours', 720),
    readSetting('geo.max_results', 5),
  ])

  if (enabledValue !== true) return { status: 'disabled' }
  if (providerValue !== 'nominatim') return { status: 'not_configured' }

  const userAgent = process.env.GEOCODING_USER_AGENT?.trim()
  if (
    !userAgent ||
    userAgent.length < 20 ||
    userAgent.length > 200 ||
    !/SMART HELP MARKET/i.test(userAgent) ||
    !/(https?:\/\/|mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(userAgent)
  ) {
    return { status: 'not_configured' }
  }

  const countryCode = typeof countryValue === 'string' && /^[a-z]{2}$/i.test(countryValue)
    ? countryValue.toLowerCase()
    : 'ng'
  const queryHash = createHash('sha256')
    .update(`nominatim|v1|${countryCode}|${query}`)
    .digest('hex')

  const db = getDatabasePool()
  const cached = await db.query<{
    display_name: string
    latitude: string
    longitude: string
    country_code: string | null
    provider_place_id: string | null
    confidence: string | null
  }>(
    `SELECT display_name, latitude::text, longitude::text, country_code,
            provider_place_id, confidence::text
     FROM public.marketplace_geocode_cache
     WHERE query_hash = $1 AND expires_at > NOW()
     LIMIT 1`,
    [queryHash],
  )

  if (cached.rowCount) {
    const row = cached.rows[0]
    return {
      status: 'resolved',
      result: {
        displayName: row.display_name,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        countryCode: row.country_code,
        provider: 'nominatim',
        placeId: row.provider_place_id,
        confidence: row.confidence === null ? null : Number(row.confidence),
        attribution: '© OpenStreetMap contributors',
      },
    }
  }

  await waitForProviderSlot()

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(settingNumber(maxResultsValue, 5, 1, 5)))
  url.searchParams.set('countrycodes', countryCode)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new Error('The location provider could not be reached. Please try again later.')
  }

  if (response.status === 403 || response.status === 429) {
    throw new Error('The location provider temporarily declined the request. Please try again later.')
  }
  if (!response.ok) {
    throw new Error('The location provider returned an unavailable response.')
  }

  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) {
    throw new Error('The location provider returned an invalid response.')
  }

  const selected = payload
    .slice(0, settingNumber(maxResultsValue, 5, 1, 5))
    .map((item) => validResult(item as NominatimResult, countryCode))
    .find((item): item is GeocodeResult => item !== null)

  if (!selected) return { status: 'not_found' }

  const ttlHours = settingNumber(ttlValue, 720, 1, 8760)
  await db.query(
    `INSERT INTO public.marketplace_geocode_cache
       (query_hash, normalized_query, display_name, latitude, longitude,
        country_code, provider_key, provider_place_id, confidence, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'nominatim', $7, $8, NOW() + ($9::int * INTERVAL '1 hour'), NOW())
     ON CONFLICT (query_hash) DO UPDATE SET
       normalized_query = EXCLUDED.normalized_query,
       display_name = EXCLUDED.display_name,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       country_code = EXCLUDED.country_code,
       provider_key = EXCLUDED.provider_key,
       provider_place_id = EXCLUDED.provider_place_id,
       confidence = EXCLUDED.confidence,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [
      queryHash, query, selected.displayName, selected.latitude, selected.longitude,
      selected.countryCode, selected.placeId, selected.confidence, ttlHours,
    ],
  )

  return { status: 'resolved', result: selected }
}
