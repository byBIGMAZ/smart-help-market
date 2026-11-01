
import { Router, Request, Response } from 'express'
import { getDatabasePool } from '../database'
import { requirePermission } from '../auth/requirePermission'

const reportsRouter = Router()

const REPORT_TIMEZONE = 'Africa/Lagos'
const MAX_RANGE_DAYS = 366

type Granularity = 'day' | 'week' | 'month'

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function getTodayInLagos(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getDateRange(from?: string, to?: string) {
  const today = getTodayInLagos()

  const endDate = to || today
  const startDate = from || shiftDate(endDate, -29)

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return null
  }

  const startTime = new Date(`${startDate}T00:00:00.000Z`).getTime()
  const endTime = new Date(`${endDate}T00:00:00.000Z`).getTime()

  if (startTime > endTime) {
    return null
  }

  const days =
    Math.floor((endTime - startTime) / 86400000) + 1

  if (days > MAX_RANGE_DAYS) {
    return null
  }

  return {
    from: startDate,
    to: endDate,
    days,
    previousFrom: shiftDate(startDate, -days),
    previousTo: shiftDate(startDate, -1),
  }
}

function percentageChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null
  }

  return Number(
    (((current - previous) / previous) * 100).toFixed(2),
  )
}

// --------------------------------------------------
// OPERATIONAL REPORTS
// --------------------------------------------------

reportsRouter.get(
  '/',
  requirePermission('reports.view'),
  async (req: Request, res: Response) => {
    try {
      const from =
        typeof req.query.from === 'string'
          ? req.query.from
          : undefined

      const to =
        typeof req.query.to === 'string'
          ? req.query.to
          : undefined

      const granularityValue =
        typeof req.query.granularity === 'string'
          ? req.query.granularity
          : 'day'

      if (
        !['day', 'week', 'month'].includes(granularityValue)
      ) {
        res.status(400).json({
          error: 'Invalid report granularity.',
        })
        return
      }

      const granularity = granularityValue as Granularity
      const range = getDateRange(from, to)

      if (!range) {
        res.status(400).json({
          error:
            'Invalid date range. Use YYYY-MM-DD dates, ensure the start is not after the end, and select no more than 366 days.',
        })
        return
      }

      const db = getDatabasePool()

      const currentFrom = range.from
      const currentTo = range.to
      const previousFrom = range.previousFrom
      const previousTo = range.previousTo

      const [
        growthResult,
        moderationResult,
        categoryResult,
        comparisonResult,
      ] = await Promise.all([
        // User registrations and non-demo listing creation.
        db.query(
          `SELECT
             TO_CHAR(
               DATE_TRUNC($3, created_at AT TIME ZONE $4),
               'YYYY-MM-DD'
             ) AS period,
             COUNT(*)::int AS registrations,
             0::int AS "listingsCreated"
           FROM public.marketplace_users
           WHERE created_at >=
             ($1::date::timestamp AT TIME ZONE $4)
             AND created_at <
             (($2::date + 1)::timestamp AT TIME ZONE $4)
           GROUP BY DATE_TRUNC(
             $3,
             created_at AT TIME ZONE $4
           )

           UNION ALL

           SELECT
             TO_CHAR(
               DATE_TRUNC($3, created_at AT TIME ZONE $4),
               'YYYY-MM-DD'
             ) AS period,
             0::int AS registrations,
             COUNT(*)::int AS "listingsCreated"
           FROM public.marketplace_listings
           WHERE is_demo = FALSE
             AND created_at >=
               ($1::date::timestamp AT TIME ZONE $4)
             AND created_at <
               (($2::date + 1)::timestamp AT TIME ZONE $4)
           GROUP BY DATE_TRUNC(
             $3,
             created_at AT TIME ZONE $4
           )

           ORDER BY period`,
          [
            currentFrom,
            currentTo,
            granularity,
            REPORT_TIMEZONE,
          ],
        ),

        // Dedicated moderation history.
        db.query(
          `SELECT
             TO_CHAR(
               DATE_TRUNC($3, created_at AT TIME ZONE $4),
               'YYYY-MM-DD'
             ) AS period,
             COUNT(*) FILTER (
               WHERE action_key = 'listing.approved'
             )::int AS approved,
             COUNT(*) FILTER (
               WHERE action_key = 'listing.rejected'
             )::int AS rejected,
             COUNT(*) FILTER (
               WHERE action_key = 'listing.published'
             )::int AS published,
             COUNT(*) FILTER (
               WHERE action_key = 'listing.unpublished'
             )::int AS unpublished,
             COUNT(*) FILTER (
               WHERE action_key = 'listing.suspended'
             )::int AS suspended,
             COUNT(*) FILTER (
               WHERE action_key = 'listing.restored'
             )::int AS restored
           FROM public.marketplace_listing_moderation_history
           WHERE created_at >=
             ($1::date::timestamp AT TIME ZONE $4)
             AND created_at <
             (($2::date + 1)::timestamp AT TIME ZONE $4)
           GROUP BY DATE_TRUNC(
             $3,
             created_at AT TIME ZONE $4
           )
           ORDER BY period`,
          [
            currentFrom,
            currentTo,
            granularity,
            REPORT_TIMEZONE,
          ],
        ),

        // Category-level creation and publication activity.
db.query(
  `SELECT
     c.category_key AS "categoryKey",
     c.category_name AS "categoryName",

     COUNT(DISTINCT l.listing_id) FILTER (
       WHERE l.is_demo = FALSE
         AND l.created_at >=
           ($1::date::timestamp AT TIME ZONE $3)
         AND l.created_at <
           (($2::date + 1)::timestamp AT TIME ZONE $3)
     )::int AS "listingsCreated",

     COUNT(DISTINCT l.listing_id) FILTER (
       WHERE l.is_demo = FALSE
         AND h.action_key = 'listing.published'
         AND h.created_at >=
           ($1::date::timestamp AT TIME ZONE $3)
         AND h.created_at <
           (($2::date + 1)::timestamp AT TIME ZONE $3)
     )::int AS "listingsPublished"

   FROM public.marketplace_categories c

   LEFT JOIN public.marketplace_listings l
     ON l.category_key = c.category_key

   LEFT JOIN public.marketplace_listing_moderation_history h
     ON h.listing_id = l.listing_id

   GROUP BY
     c.category_key,
     c.category_name,
     c.display_order

   ORDER BY c.display_order, c.category_name`,
  [currentFrom, currentTo, REPORT_TIMEZONE],
),

        // Current period compared with the preceding equal period.
        db.query(
          `SELECT
             (
               SELECT COUNT(*)::int
               FROM public.marketplace_users
               WHERE created_at >=
                 ($1::date::timestamp AT TIME ZONE $3)
                 AND created_at <
                 (($2::date + 1)::timestamp AT TIME ZONE $3)
             ) AS "usersRegistered",
             (
               SELECT COUNT(*)::int
               FROM public.marketplace_users
               WHERE created_at >=
                 ($4::date::timestamp AT TIME ZONE $3)
                 AND created_at <
                 (($5::date + 1)::timestamp AT TIME ZONE $3)
             ) AS "previousUsersRegistered",
             (
               SELECT COUNT(*)::int
               FROM public.marketplace_listings
               WHERE is_demo = FALSE
                 AND created_at >=
                   ($1::date::timestamp AT TIME ZONE $3)
                 AND created_at <
                   (($2::date + 1)::timestamp AT TIME ZONE $3)
             ) AS "listingsCreated",
             (
               SELECT COUNT(*)::int
               FROM public.marketplace_listings
               WHERE is_demo = FALSE
                 AND created_at >=
                   ($4::date::timestamp AT TIME ZONE $3)
                 AND created_at <
                   (($5::date + 1)::timestamp AT TIME ZONE $3)
             ) AS "previousListingsCreated",
             (
               SELECT COUNT(*)::int
               FROM public.marketplace_listing_moderation_history
               WHERE action_key = 'listing.published'
                 AND created_at >=
                   ($1::date::timestamp AT TIME ZONE $3)
                 AND created_at <
                   (($2::date + 1)::timestamp AT TIME ZONE $3)
             ) AS "listingsPublished",
             (
               SELECT COUNT(*)::int
               FROM public.marketplace_listing_moderation_history
               WHERE action_key = 'listing.published'
                 AND created_at >=
                   ($4::date::timestamp AT TIME ZONE $3)
                 AND created_at <
                   (($5::date + 1)::timestamp AT TIME ZONE $3)
             ) AS "previousListingsPublished",
             (
               SELECT COUNT(*)::int
               FROM public.marketplace_listing_moderation_history
               WHERE created_at >=
                 ($1::date::timestamp AT TIME ZONE $3)
                 AND created_at <
                   (($2::date + 1)::timestamp AT TIME ZONE $3)
             ) AS "moderationActions",
             (
               SELECT COUNT(*)::int
               FROM public.marketplace_listing_moderation_history
               WHERE created_at >=
                 ($4::date::timestamp AT TIME ZONE $3)
                 AND created_at <
                   (($5::date + 1)::timestamp AT TIME ZONE $3)
             ) AS "previousModerationActions"`,
          [
            currentFrom,
            currentTo,
            REPORT_TIMEZONE,
            previousFrom,
            previousTo,
          ],
        ),
      ])

      // Merge the two growth query result groups into one series.
      const growthMap = new Map<
        string,
        {
          period: string
          registrations: number
          listingsCreated: number
        }
      >()

      for (const row of growthResult.rows) {
        const existing = growthMap.get(row.period) || {
          period: row.period,
          registrations: 0,
          listingsCreated: 0,
        }

        existing.registrations += Number(row.registrations)
        existing.listingsCreated += Number(row.listingsCreated)

        growthMap.set(row.period, existing)
      }

      const growth = Array.from(growthMap.values()).sort(
        (a, b) => a.period.localeCompare(b.period),
      )

      const moderation = moderationResult.rows.map((row) => ({
        period: row.period,
        approved: Number(row.approved),
        rejected: Number(row.rejected),
        published: Number(row.published),
        unpublished: Number(row.unpublished),
        suspended: Number(row.suspended),
        restored: Number(row.restored),
      }))

      const categories = categoryResult.rows.map((row) => ({
        categoryKey: row.categoryKey,
        categoryName: row.categoryName,
        listingsCreated: Number(row.listingsCreated),
        listingsPublished: Number(row.listingsPublished),
      }))

      const comparisonRow = comparisonResult.rows[0]

      const usersRegistered = Number(
        comparisonRow.usersRegistered,
      )
      const previousUsersRegistered = Number(
        comparisonRow.previousUsersRegistered,
      )
      const listingsCreated = Number(
        comparisonRow.listingsCreated,
      )
      const previousListingsCreated = Number(
        comparisonRow.previousListingsCreated,
      )
      const listingsPublished = Number(
        comparisonRow.listingsPublished,
      )
      const previousListingsPublished = Number(
        comparisonRow.previousListingsPublished,
      )
      const moderationActions = Number(
        comparisonRow.moderationActions,
      )
      const previousModerationActions = Number(
        comparisonRow.previousModerationActions,
      )

      res.status(200).json({
        status: 'ok',
        filters: {
          from: range.from,
          to: range.to,
          previousFrom: range.previousFrom,
          previousTo: range.previousTo,
          granularity,
          timezone: REPORT_TIMEZONE,
        },
        comparison: {
          usersRegistered: {
            current: usersRegistered,
            previous: previousUsersRegistered,
            percentageChange: percentageChange(
              usersRegistered,
              previousUsersRegistered,
            ),
          },
          listingsCreated: {
            current: listingsCreated,
            previous: previousListingsCreated,
            percentageChange: percentageChange(
              listingsCreated,
              previousListingsCreated,
            ),
          },
          listingsPublished: {
            current: listingsPublished,
            previous: previousListingsPublished,
            percentageChange: percentageChange(
              listingsPublished,
              previousListingsPublished,
            ),
          },
          moderationActions: {
            current: moderationActions,
            previous: previousModerationActions,
            percentageChange: percentageChange(
              moderationActions,
              previousModerationActions,
            ),
          },
        },
        growth,
        moderation,
        categories,
      })
    } catch (error: unknown) {
      console.error(
        'Operational reports failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Operational reports could not be generated.',
      })
    }
  },
)

export default reportsRouter
