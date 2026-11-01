
import { Router, Request, Response } from 'express'
import type { PoolClient } from 'pg'
import { getDatabasePool } from '../database'
import { enqueueAutomationEvent } from '../automation/events'
import { requirePermission } from '../auth/requirePermission'

const listingModerationRouter = Router()

const allowedStatuses = [
  'draft',
  'pending_review',
  'approved',
  'published',
  'paused',
  'rented',
  'sold',
  'unavailable',
  'rejected',
  'suspended',
] as const

type ListingStatus = (typeof allowedStatuses)[number]

type ModerationAction =
  | 'approve'
  | 'reject'
  | 'publish'
  | 'unpublish'
  | 'suspend'
  | 'restore'

const actionConfigurations: Record<
  ModerationAction,
  {
    permission: string
    allowedPreviousStatuses: ListingStatus[]
    newStatus: ListingStatus
    auditAction: string
    reasonRequired: boolean
  }
> = {
  approve: {
    permission: 'listings.review',
    allowedPreviousStatuses: ['pending_review'],
    newStatus: 'approved',
    auditAction: 'listing.approved',
    reasonRequired: false,
  },
  reject: {
    permission: 'listings.review',
    allowedPreviousStatuses: ['pending_review'],
    newStatus: 'rejected',
    auditAction: 'listing.rejected',
    reasonRequired: true,
  },
  publish: {
    permission: 'listings.manage',
    allowedPreviousStatuses: ['approved'],
    newStatus: 'published',
    auditAction: 'listing.published',
    reasonRequired: false,
  },
  unpublish: {
    permission: 'listings.manage',
    allowedPreviousStatuses: ['published'],
    newStatus: 'approved',
    auditAction: 'listing.unpublished',
    reasonRequired: false,
  },
  suspend: {
    permission: 'listings.manage',
    allowedPreviousStatuses: ['approved', 'published'],
    newStatus: 'suspended',
    auditAction: 'listing.suspended',
    reasonRequired: true,
  },
  restore: {
    permission: 'listings.manage',
    allowedPreviousStatuses: ['suspended'],
    newStatus: 'approved',
    auditAction: 'listing.restored',
    reasonRequired: false,
  },
}

function isValidListingId(value: string): boolean {
  return /^[1-9]\d*$/.test(value)
}

function getListingId(req: Request): string {
  const value = req.params.listingId
  return typeof value === 'string' ? value : ''
}

// --------------------------------------------------
// LIST ALL MARKETPLACE LISTINGS
// --------------------------------------------------

listingModerationRouter.get(
  '/listings',
  requirePermission('listings.view'),
  async (req, res) => {
    try {
      const search =
        typeof req.query.search === 'string'
          ? req.query.search.trim().slice(0, 100)
          : ''

      const status =
        typeof req.query.status === 'string'
          ? req.query.status
          : 'all'

      if (
        status !== 'all' &&
        !allowedStatuses.includes(status as ListingStatus)
      ) {
        res.status(400).json({
          error: 'Invalid listing status filter.',
        })
        return
      }

      const categoryKey =
        typeof req.query.categoryKey === 'string'
          ? req.query.categoryKey.trim().slice(0, 100)
          : ''

      const demoFilter =
        typeof req.query.demo === 'string'
          ? req.query.demo
          : 'all'

      if (!['all', 'true', 'false'].includes(demoFilter)) {
        res.status(400).json({
          error: 'Invalid demonstration listing filter.',
        })
        return
      }

      const limit = Number(req.query.limit ?? 25)
      const offset = Number(req.query.offset ?? 0)

      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 1_000_000
      ) {
        res.status(400).json({
          error: 'Invalid pagination values.',
        })
        return
      }

      const conditions: string[] = []
      const values: (string | number | boolean)[] = []

      if (search) {
        values.push(`%${search}%`)
        conditions.push(
          `(l.title ILIKE $${values.length}
            OR l.listing_key ILIKE $${values.length}
            OR l.location_display ILIKE $${values.length})`,
        )
      }

      if (status !== 'all') {
        values.push(status)
        conditions.push(`l.status = $${values.length}`)
      }

      if (categoryKey) {
        values.push(categoryKey)
        conditions.push(`l.category_key = $${values.length}`)
      }

      if (demoFilter !== 'all') {
        values.push(demoFilter === 'true')
        conditions.push(`l.is_demo = $${values.length}`)
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : ''

      const db = getDatabasePool()

      const countResult = await db.query(
        `SELECT COUNT(*)::text AS total
         FROM public.marketplace_listings l
         ${whereClause}`,
        values,
      )

      const total = Number(countResult.rows[0]?.total ?? 0)

      const dataValues = [...values, limit, offset]

      const listingsResult = await db.query(
        `SELECT
           l.listing_id::text AS id,
           l.listing_key AS "listingKey",
           l.category_key AS "categoryKey",
           c.category_name AS category,
           l.title,
           l.description,
           l.price::text AS price,
           l.price_unit AS "priceUnit",
           l.location_display AS location,
           l.icon,
           l.listing_tag AS tag,
           l.status,
           l.is_demo AS "isDemo",
           l.owner_user_id::text AS "ownerUserId",
           l.created_at AS "createdAt",
           l.updated_at AS "updatedAt"
         FROM public.marketplace_listings l
         LEFT JOIN public.marketplace_categories c
           ON c.category_key = l.category_key
         ${whereClause}
         ORDER BY
           CASE l.status
             WHEN 'pending_review' THEN 1
             WHEN 'approved' THEN 2
             WHEN 'published' THEN 3
             WHEN 'suspended' THEN 4
             WHEN 'rejected' THEN 5
             ELSE 6
           END,
           l.created_at DESC,
           l.listing_id DESC
         LIMIT $${values.length + 1}
         OFFSET $${values.length + 2}`,
        dataValues,
      )

      res.status(200).json({
        status: 'ok',
        listings: listingsResult.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + listingsResult.rows.length < total,
        },
        filters: {
          search,
          status,
          categoryKey,
          demo: demoFilter,
        },
      })
    } catch (error: unknown) {
      console.error(
        'Moderation listing directory failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Listing directory could not be loaded.',
      })
    }
  },
)

// --------------------------------------------------
// MODERATE A LISTING
// Transaction includes:
// 1. Listing status update
// 2. Moderation history
// 3. Automation event
// 4. General audit log
// --------------------------------------------------

function createModerationHandler(action: ModerationAction) {
  const configuration = actionConfigurations[action]

  return async (req: Request, res: Response) => {
    const listingId = getListingId(req)

    const actorUserId = String(
      res.locals.authenticatedUserId ?? '',
    )

    const reason =
      typeof req.body?.reason === 'string'
        ? req.body.reason.trim()
        : ''

    if (!isValidListingId(listingId)) {
      res.status(400).json({
        error: 'Invalid listing ID.',
      })
      return
    }

    if (!actorUserId) {
      res.status(401).json({
        error: 'Administrator session is required.',
      })
      return
    }

    if (reason.length > 1000) {
      res.status(400).json({
        error: 'Reason must not exceed 1000 characters.',
      })
      return
    }

    if (configuration.reasonRequired && !reason) {
      res.status(400).json({
        error: 'A reason is required for this action.',
      })
      return
    }

    let client: PoolClient | undefined
    let transactionStarted = false

    try {
      const db = getDatabasePool()

      // Obtain the connection inside the try block.
      client = await db.connect()

      await client.query('BEGIN')
      transactionStarted = true

      // Prevent indefinitely waiting database statements.
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '15s'")

      // Lock the listing to prevent conflicting moderation actions.
      const listingResult = await client.query(
        `SELECT
           listing_id::text AS id,
           listing_key AS "listingKey",
           status,
           is_demo AS "isDemo",
           owner_user_id::text AS "ownerUserId"
         FROM public.marketplace_listings
         WHERE listing_id = $1
         FOR UPDATE`,
        [listingId],
      )

      const listing = listingResult.rows[0] as
        | {
            id: string
            listingKey: string
            status: ListingStatus
            isDemo: boolean
            ownerUserId: string | null
          }
        | undefined

      if (!listing) {
        await client.query('ROLLBACK')
        transactionStarted = false

        res.status(404).json({
          error: 'Listing not found.',
        })
        return
      }

      // Demonstration listings cannot be moderated.
      if (listing.isDemo) {
        await client.query('ROLLBACK')
        transactionStarted = false

        res.status(403).json({
          error: 'Demonstration listings cannot be moderated.',
        })
        return
      }

      // Verify the current listing status.
      if (
        !configuration.allowedPreviousStatuses.includes(
          listing.status,
        )
      ) {
        await client.query('ROLLBACK')
        transactionStarted = false

        res.status(409).json({
          error: `This action cannot be performed on a listing with status "${listing.status}".`,
          currentStatus: listing.status,
          requiredStatuses:
            configuration.allowedPreviousStatuses,
        })
        return
      }

      // Update listing status.
      await client.query(
        `UPDATE public.marketplace_listings
         SET
           status = $1,
           updated_at = NOW()
         WHERE listing_id = $2`,
        [configuration.newStatus, listingId],
      )

      const details = {
        action,
        listingKey: listing.listingKey,
        previousStatus: listing.status,
        newStatus: configuration.newStatus,
        reason,
      }

      // Record dedicated moderation history.
      const historyResult = await client.query<{
        history_id: string
      }>(
        `INSERT INTO public.marketplace_listing_moderation_history
           (
             listing_id,
             listing_key,
             actor_user_id,
             action_key,
             previous_status,
             new_status,
             reason,
             details
           )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING history_id::text AS history_id`,
        [
          listingId,
          listing.listingKey,
          actorUserId,
          configuration.auditAction,
          listing.status,
          configuration.newStatus,
          reason,
          JSON.stringify(details),
        ],
      )

      const historyId = historyResult.rows[0]?.history_id

      if (!historyId) {
        throw new Error(
          'Moderation history record could not be verified.',
        )
      }

      // Queue automation event in the same transaction.
      await enqueueAutomationEvent(client, {
        eventType: configuration.auditAction,
        aggregateType: 'marketplace_listing',
        aggregateId: listingId,
        idempotencyKey: `listing-moderation:${historyId}`,
        payload: {
          listingId,
          listingKey: listing.listingKey,
          ownerUserId: listing.ownerUserId,
          actorUserId,
          action,
          previousStatus: listing.status,
          newStatus: configuration.newStatus,
          reason,
          historyId,
        },
      })

      // Record the general audit log.
      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (
             actor_user_id,
             action_key,
             target_type,
             target_id,
             details
           )
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          actorUserId,
          configuration.auditAction,
          'marketplace_listing',
          listingId,
          JSON.stringify(details),
        ],
      )

      // Commit all four operations together.
      await client.query('COMMIT')
      transactionStarted = false

      console.log(
        `Listing moderation successful: ${action}, listing ${listingId}, actor ${actorUserId}`,
      )

      // Send the success response only after the commit.
      res.status(200).json({
        status: 'ok',
        message: 'Listing moderation action completed successfully.',
        listing: {
          id: listingId,
          listingKey: listing.listingKey,
          previousStatus: listing.status,
          status: configuration.newStatus,
        },
        historyId,
      })
    } catch (error: unknown) {
      if (client && transactionStarted) {
        await client.query('ROLLBACK').catch(() => undefined)
        transactionStarted = false
      }

      console.error(
        `Listing moderation action "${action}" failed:`,
        error instanceof Error ? error.message : 'Unknown error',
      )

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Listing moderation action could not be completed.',
        })
      }
    } finally {
      client?.release()
    }
  }
}

// --------------------------------------------------
// APPROVAL AND REJECTION
// --------------------------------------------------

listingModerationRouter.post(
  '/listings/:listingId/approve',
  requirePermission('listings.review'),
  createModerationHandler('approve'),
)

listingModerationRouter.post(
  '/listings/:listingId/reject',
  requirePermission('listings.review'),
  createModerationHandler('reject'),
)

// --------------------------------------------------
// PUBLICATION MANAGEMENT
// --------------------------------------------------

listingModerationRouter.post(
  '/listings/:listingId/publish',
  requirePermission('listings.manage'),
  createModerationHandler('publish'),
)

listingModerationRouter.post(
  '/listings/:listingId/unpublish',
  requirePermission('listings.manage'),
  createModerationHandler('unpublish'),
)

// --------------------------------------------------
// SUSPENSION AND RESTORATION
// --------------------------------------------------

listingModerationRouter.post(
  '/listings/:listingId/suspend',
  requirePermission('listings.manage'),
  createModerationHandler('suspend'),
)

listingModerationRouter.post(
  '/listings/:listingId/restore',
  requirePermission('listings.manage'),
  createModerationHandler('restore'),
)

// --------------------------------------------------
// VIEW MODERATION HISTORY
// --------------------------------------------------

listingModerationRouter.get(
  '/listings/:listingId/history',
  requirePermission('listings.view'),
  async (req, res) => {
    const listingId = getListingId(req)

    if (!isValidListingId(listingId)) {
      res.status(400).json({
        error: 'Invalid listing ID.',
      })
      return
    }

    const limit = Number(req.query.limit ?? 25)
    const offset = Number(req.query.offset ?? 0)

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 1_000_000
    ) {
      res.status(400).json({
        error: 'Invalid pagination values.',
      })
      return
    }

    try {
      const db = getDatabasePool()

      const listingResult = await db.query(
        `SELECT
           listing_id::text AS id,
           listing_key AS "listingKey",
           title
         FROM public.marketplace_listings
         WHERE listing_id = $1`,
        [listingId],
      )

      const listing = listingResult.rows[0]

      if (!listing) {
        res.status(404).json({
          error: 'Listing not found.',
        })
        return
      }

      const countResult = await db.query(
        `SELECT COUNT(*)::text AS total
         FROM public.marketplace_listing_moderation_history
         WHERE listing_id = $1`,
        [listingId],
      )

      const total = Number(countResult.rows[0]?.total ?? 0)

      const historyResult = await db.query(
        `SELECT
           h.history_id::text AS id,
           h.listing_key AS "listingKey",
           h.action_key AS action,
           h.previous_status AS "previousStatus",
           h.new_status AS "newStatus",
           h.reason,
           h.details,
           h.created_at AS "createdAt",
           h.actor_user_id::text AS "actorUserId",
           u.display_name AS "actorName"
         FROM public.marketplace_listing_moderation_history h
         LEFT JOIN public.marketplace_users u
           ON u.user_id = h.actor_user_id
         WHERE h.listing_id = $1
         ORDER BY h.created_at DESC, h.history_id DESC
         LIMIT $2
         OFFSET $3`,
        [listingId, limit, offset],
      )

      res.status(200).json({
        status: 'ok',
        listing,
        history: historyResult.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + historyResult.rows.length < total,
        },
      })
    } catch (error: unknown) {
      console.error(
        'Listing moderation history failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Listing moderation history could not be loaded.',
      })
    }
  },
)

export default listingModerationRouter
