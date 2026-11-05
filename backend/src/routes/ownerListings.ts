import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'crypto'
import { getDatabasePool } from '../database'
import { requireAuthenticatedSession } from '../auth/requireAuthenticatedSession'

const router = Router()

type ListingKind = 'properties' | 'products' | 'services'

interface DraftDetails {
  version: 1
  kind: ListingKind
  values: Record<string, string>
  units: Array<{
    id: string
    name: string
    rent: string
    bedrooms: string
    bathrooms: string
    description: string
  }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length <= maxLength ? normalized : null
}

function readDraftDetails(value: unknown, expectedKind: ListingKind): DraftDetails | null {
  if (!isRecord(value) || value.version !== 1 || value.kind !== expectedKind) {
    return null
  }

  if (!isRecord(value.values)) return null

  const entries = Object.entries(value.values)
  if (entries.length > 60) return null

  const values: Record<string, string> = {}
  for (const [key, fieldValue] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(key)) return null
    if (typeof fieldValue !== 'string' || fieldValue.length > 5000) return null
    values[key] = fieldValue
  }

  const rawUnits = value.units === undefined ? [] : value.units
  if (!Array.isArray(rawUnits) || rawUnits.length > 100) return null

  const units: DraftDetails['units'] = []
  for (const item of rawUnits) {
    if (!isRecord(item)) return null
    const id = readText(item.id, 100)
    const name = readText(item.name, 120)
    const rent = readText(item.rent, 40)
    const bedrooms = readText(item.bedrooms, 20)
    const bathrooms = readText(item.bathrooms, 20)
    const description = readText(item.description, 2000)
    if (
      id === null || name === null || rent === null ||
      bedrooms === null || bathrooms === null || description === null
    ) return null

    units.push({ id, name, rent, bedrooms, bathrooms, description })
  }

  if (expectedKind !== 'properties' && units.length > 0) return null

  const result: DraftDetails = { version: 1, kind: expectedKind, values, units }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 245760) return null
  return result
}

function isListingKind(value: unknown): value is ListingKind {
  return value === 'properties' || value === 'products' || value === 'services'
}

function getListingId(req: Request): string {
  const value = req.params.listingId
  return typeof value === 'string' ? value : ''
}

async function readAndValidateRequest(req: Request, res: Response) {
  const categoryKey = typeof req.body?.categoryKey === 'string'
    ? req.body.categoryKey.trim()
    : ''
  const kind = isRecord(req.body?.details) && isListingKind(req.body.details.kind)
    ? req.body.details.kind
    : null
  if (!categoryKey || categoryKey.length > 60 || !/^[a-z0-9-]+$/.test(categoryKey) || !kind ||
      (['properties', 'products', 'services'].includes(categoryKey) && categoryKey !== kind)) {
    res.status(400).json({ error: 'Choose a valid marketplace category and listing type.' })
    return null
  }

  const details = readDraftDetails(req.body?.details, kind)
  if (!details) {
    res.status(400).json({ error: 'The listing details are invalid or too large. Please review the form and try again.' })
    return null
  }

  const title = (details.values.title ?? '').trim()
  const description = (details.values.description ?? '').trim()
  const location = (details.values.location ?? '').trim()
  const priceUnit = (details.values.priceUnit ?? '').trim()
  const priceText = (details.values.price ?? '').trim()
  const price = priceText === '' ? 0 : Number(priceText)

  if (title.length > 180) {
    res.status(400).json({ error: 'The listing title must not exceed 180 characters.' })
    return null
  }
  if (description.length > 5000) {
    res.status(400).json({ error: 'The listing description must not exceed 5,000 characters.' })
    return null
  }
  if (location.length > 250 || priceUnit.length > 80) {
    res.status(400).json({ error: 'The location or price basis is too long.' })
    return null
  }
  if (!Number.isFinite(price) || price < 0 || price > 999999999999.99) {
    res.status(400).json({ error: 'Enter a valid listing price.' })
    return null
  }

  return {
    categoryKey,
    kind,
    details,
    title: title || 'Untitled draft',
    description,
    location,
    price,
    priceUnit,
  }
}

async function verifyOwnerCanCreate(
  userId: string,
  kind: ListingKind,
): Promise<boolean> {
  const result = await getDatabasePool().query<{
    account_type: string
    account_status: string
  }>(
    `SELECT account_type, account_status
     FROM public.marketplace_users
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  )

  const account = result.rows[0]
  if (!account || account.account_status !== 'active') return false

  const allowedTypes: Record<ListingKind, string[]> = {
    properties: ['landlord', 'agent'],
    products: ['seller'],
    services: ['service_provider'],
  }
  return allowedTypes[kind].includes(account.account_type)
}

async function verifyCategory(categoryKey: string): Promise<boolean> {
  const result = await getDatabasePool().query(
    `SELECT 1
     FROM public.marketplace_categories
     WHERE category_key = $1 AND is_active = TRUE
     LIMIT 1`,
    [categoryKey],
  )
  return result.rows.length > 0
}

router.post('/owner', requireAuthenticatedSession, async (req, res) => {
  const userId = String(res.locals.authenticatedUserId ?? '')
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }

  const input = await readAndValidateRequest(req, res)
  if (!input) return

  try {
    if (!(await verifyOwnerCanCreate(userId, input.kind))) {
      res.status(403).json({
        error: 'Your account type is not authorised to create this category of listing. Check your account type or contact marketplace support.',
      })
      return
    }
    if (!(await verifyCategory(input.categoryKey))) {
      res.status(400).json({ error: 'This marketplace category is unavailable.' })
      return
    }

    const db = getDatabasePool()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const listingKey = `SHM-${randomUUID()}`
      const result = await client.query<{
        id: string
        key: string
        status: string
        createdAt: Date
      }>(
        `INSERT INTO public.marketplace_listings (
           listing_key, category_key, title, description, price,
           price_unit, location_display, status, is_demo, owner_user_id,
           listing_details
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', FALSE, $8, $9::jsonb)
         RETURNING
           listing_id::text AS id,
           listing_key AS key,
           status,
           created_at AS "createdAt"`,
        [
          listingKey,
          input.categoryKey,
          input.title,
          input.description,
          input.price,
          input.priceUnit,
          input.location,
          userId,
          JSON.stringify(input.details),
        ],
      )
      const listing = result.rows[0]
      if (!listing?.id) throw new Error('The listing draft could not be created.')

      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, 'listing.draft_created', 'marketplace_listing', $2, $3::jsonb)`,
        [userId, listing.id, JSON.stringify({ listingKey, categoryKey: input.categoryKey })],
      )
      await client.query('COMMIT')

      res.status(201).json({
        status: 'ok',
        message: 'Listing draft saved to your marketplace account.',
        listing: { ...listing, categoryKey: input.categoryKey },
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch (error: unknown) {
    console.error('Owner listing draft creation failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'Your listing draft could not be saved to the marketplace.' })
  }
})

router.patch('/owner/:listingId', requireAuthenticatedSession, async (req, res) => {
  const userId = String(res.locals.authenticatedUserId ?? '')
  const listingId = getListingId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }
  if (!/^[1-9]\d*$/.test(listingId)) {
    res.status(400).json({ error: 'Invalid listing ID.' })
    return
  }

  const input = await readAndValidateRequest(req, res)
  if (!input) return

  try {
    if (!(await verifyOwnerCanCreate(userId, input.kind))) {
      res.status(403).json({ error: 'Your account type is not authorised to manage this category of listing.' })
      return
    }
    if (!(await verifyCategory(input.categoryKey))) {
      res.status(400).json({ error: 'This marketplace category is unavailable.' })
      return
    }

    const db = getDatabasePool()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const current = await client.query<{
        status: string
        is_demo: boolean
        category_key: string
      }>(
        `SELECT status, is_demo, category_key
         FROM public.marketplace_listings
         WHERE listing_id = $1 AND owner_user_id = $2
         FOR UPDATE`,
        [listingId, userId],
      )
      const listing = current.rows[0]
      if (!listing || listing.is_demo) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Listing draft not found.' })
        return
      }
      if (listing.status !== 'draft') {
        await client.query('ROLLBACK')
        res.status(409).json({ error: 'Only unpublished draft listings can be edited here.' })
        return
      }

      const updated = await client.query(
        `UPDATE public.marketplace_listings
         SET category_key = $1,
             title = $2,
             description = $3,
             price = $4,
             price_unit = $5,
             location_display = $6,
             listing_details = $7::jsonb,
             updated_at = NOW()
         WHERE listing_id = $8 AND owner_user_id = $9
         RETURNING
           listing_id::text AS id,
           listing_key AS key,
           status,
           updated_at AS "updatedAt"`,
        [
          input.categoryKey,
          input.title,
          input.description,
          input.price,
          input.priceUnit,
          input.location,
          JSON.stringify(input.details),
          listingId,
          userId,
        ],
      )
      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, 'listing.draft_updated', 'marketplace_listing', $2, $3::jsonb)`,
        [userId, listingId, JSON.stringify({ categoryKey: input.categoryKey, previousCategoryKey: listing.category_key })],
      )
      await client.query('COMMIT')
      res.status(200).json({
        status: 'ok',
        message: 'Listing draft updated.',
        listing: { ...updated.rows[0], categoryKey: input.categoryKey },
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch (error: unknown) {
    console.error('Owner listing draft update failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'Your listing draft could not be updated.' })
  }
})

export default router
