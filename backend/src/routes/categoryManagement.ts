
import { Router } from 'express'
import { getDatabasePool } from '../database'
import { requirePermission } from '../auth/requirePermission'

const router = Router()

interface CategoryRow {
  category_id: string
  category_key: string
  category_name: string
  description: string
  display_order: number
  is_active: boolean
  created_at: Date
  updated_at: Date
  total_listings: string
  published_listings: string
}

function formatCategory(row: CategoryRow) {
  return {
    id: row.category_id,
    key: row.category_key,
    name: row.category_name,
    description: row.description,
    displayOrder: row.display_order,
    isActive: row.is_active,
    totalListings: Number(row.total_listings),
    publishedListings: Number(row.published_listings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getCategoryId(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null
  }

  return value
}

function createCategoryKey(name: string): string {
  const key = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')

  return key
}

function readText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== 'string') return null

  const result = value.trim()

  if (result.length > maximumLength) return null

  return result
}

function readDisplayOrder(value: unknown): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100000
  ) {
    return null
  }

  return value
}

const categorySelect = `
  SELECT
    c.category_id::text AS category_id,
    c.category_key,
    c.category_name,
    c.description,
    c.display_order,
    c.is_active,
    c.created_at,
    c.updated_at,
    COUNT(l.listing_id)::text AS total_listings,
    COUNT(l.listing_id) FILTER (
      WHERE l.status = 'published'
    )::text AS published_listings
  FROM public.marketplace_categories c
  LEFT JOIN public.marketplace_listings l
    ON l.category_key = c.category_key
`

// List all categories, including inactive categories.
router.get(
  '/',
  requirePermission('categories.view'),
  async (_req, res) => {
    try {
      const result = await getDatabasePool().query<CategoryRow>(
        `${categorySelect}
         GROUP BY c.category_id
         ORDER BY c.display_order ASC, c.category_name ASC`,
      )

      res.status(200).json({
        status: 'ok',
        categories: result.rows.map(formatCategory),
        total: result.rows.length,
        generatedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error(
        'Admin category directory failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Category directory could not be loaded.',
      })
    }
  },
)

// Create a category with an automatically generated unique key.
router.post(
  '/',
  requirePermission('categories.manage'),
  async (req, res) => {
    const name = readText(req.body?.name, 100)
    const description = readText(req.body?.description ?? '', 500)
    const displayOrder =
      req.body?.displayOrder === undefined
        ? 0
        : readDisplayOrder(req.body.displayOrder)

    if (!name) {
      res.status(400).json({
        error: 'A valid category name is required.',
      })
      return
    }

    if (description === null) {
      res.status(400).json({
        error: 'Description must not exceed 500 characters.',
      })
      return
    }

    if (displayOrder === null) {
      res.status(400).json({
        error: 'Display order must be a whole number from 0 to 100000.',
      })
      return
    }

    const baseKey = createCategoryKey(name)

    if (!baseKey) {
      res.status(400).json({
        error: 'The category name must contain letters or numbers.',
      })
      return
    }

    const actorUserId = String(res.locals.authenticatedUserId ?? '')

    if (!actorUserId) {
      res.status(401).json({
        error: 'Administrator identity could not be verified.',
      })
      return
    }

    const db = getDatabasePool()
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      // Prevent concurrent category creation from generating the same key.
      await client.query(
        'SELECT pg_advisory_xact_lock($1::bigint)',
        [748291636],
      )

      const existingKeys = await client.query<{ category_key: string }>(
        `SELECT category_key
         FROM public.marketplace_categories
         WHERE category_key = $1
            OR category_key LIKE $2`,
        [baseKey, `${baseKey}-%`],
      )

      const usedKeys = new Set(
        existingKeys.rows.map((row) => row.category_key),
      )

      let categoryKey = baseKey
      let suffix = 2

      while (usedKeys.has(categoryKey)) {
        categoryKey = `${baseKey}-${suffix}`
        suffix += 1
      }

      const inserted = await client.query<{
        category_id: string
        category_key: string
        category_name: string
        description: string
        display_order: number
        is_active: boolean
        created_at: Date
        updated_at: Date
      }>(
        `INSERT INTO public.marketplace_categories
           (
             category_key,
             category_name,
             description,
             display_order,
             is_active
           )
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING
           category_id::text AS category_id,
           category_key,
           category_name,
           description,
           display_order,
           is_active,
           created_at,
           updated_at`,
        [categoryKey, name, description, displayOrder],
      )

      const category = inserted.rows[0]

      const details = {
        categoryId: category.category_id,
        categoryKey: category.category_key,
        categoryName: category.category_name,
        description: category.description,
        displayOrder: category.display_order,
        isActive: category.is_active,
      }

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
          'category.created',
          'marketplace_category',
          category.category_id,
          JSON.stringify(details),
        ],
      )

      await client.query('COMMIT')

      res.status(201).json({
        status: 'ok',
        message: 'Category created successfully.',
        category: {
          id: category.category_id,
          key: category.category_key,
          name: category.category_name,
          description: category.description,
          displayOrder: category.display_order,
          isActive: category.is_active,
          createdAt: category.created_at,
          updatedAt: category.updated_at,
        },
      })
    } catch (error) {
      await client.query('ROLLBACK')

      console.error(
        'Category creation failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Category could not be created.',
      })
    } finally {
      client.release()
    }
  },
)

// Edit category name, description and display order.
// The category key is deliberately immutable.
router.put(
  '/:categoryId',
  requirePermission('categories.manage'),
  async (req, res) => {
    const categoryId = getCategoryId(req.params.categoryId)
    const name = readText(req.body?.name, 100)
    const description = readText(req.body?.description, 500)
    const displayOrder = readDisplayOrder(req.body?.displayOrder)

    if (!categoryId) {
      res.status(400).json({ error: 'Invalid category ID.' })
      return
    }

    if (!name) {
      res.status(400).json({
        error: 'A valid category name is required.',
      })
      return
    }

    if (description === null) {
      res.status(400).json({
        error: 'A valid description is required and must not exceed 500 characters.',
      })
      return
    }

    if (displayOrder === null) {
      res.status(400).json({
        error: 'A valid display order is required.',
      })
      return
    }

    const actorUserId = String(res.locals.authenticatedUserId ?? '')

    if (!actorUserId) {
      res.status(401).json({
        error: 'Administrator identity could not be verified.',
      })
      return
    }

    const db = getDatabasePool()
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const existing = await client.query<{
        category_key: string
        category_name: string
        description: string
        display_order: number
      }>(
        `SELECT
           category_key,
           category_name,
           description,
           display_order
         FROM public.marketplace_categories
         WHERE category_id = $1
         FOR UPDATE`,
        [categoryId],
      )

      if (existing.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Category not found.' })
        return
      }

      const previous = existing.rows[0]

      const updated = await client.query(
        `UPDATE public.marketplace_categories
         SET
           category_name = $2,
           description = $3,
           display_order = $4,
           updated_at = NOW()
         WHERE category_id = $1
         RETURNING
           category_id::text AS id,
           category_key AS key,
           category_name AS name,
           description,
           display_order AS "displayOrder",
           is_active AS "isActive",
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [categoryId, name, description, displayOrder],
      )

      const category = updated.rows[0]

      const details = {
        categoryId,
        categoryKey: previous.category_key,
        previous: {
          name: previous.category_name,
          description: previous.description,
          displayOrder: previous.display_order,
        },
        updated: {
          name,
          description,
          displayOrder,
        },
      }

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
          'category.updated',
          'marketplace_category',
          categoryId,
          JSON.stringify(details),
        ],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: 'Category updated successfully.',
        category,
      })
    } catch (error) {
      await client.query('ROLLBACK')

      console.error(
        'Category update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Category could not be updated.',
      })
    } finally {
      client.release()
    }
  },
)

// Activate or deactivate a category.
router.patch(
  '/:categoryId/status',
  requirePermission('categories.manage'),
  async (req, res) => {
    const categoryId = getCategoryId(req.params.categoryId)
    const isActive = req.body?.isActive

    if (!categoryId) {
      res.status(400).json({ error: 'Invalid category ID.' })
      return
    }

    if (typeof isActive !== 'boolean') {
      res.status(400).json({
        error: 'isActive must be true or false.',
      })
      return
    }

    const actorUserId = String(res.locals.authenticatedUserId ?? '')

    if (!actorUserId) {
      res.status(401).json({
        error: 'Administrator identity could not be verified.',
      })
      return
    }

    const db = getDatabasePool()
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const existing = await client.query<{
        category_key: string
        category_name: string
        is_active: boolean
      }>(
        `SELECT category_key, category_name, is_active
         FROM public.marketplace_categories
         WHERE category_id = $1
         FOR UPDATE`,
        [categoryId],
      )

      if (existing.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Category not found.' })
        return
      }

      const previous = existing.rows[0]

      if (previous.is_active === isActive) {
        await client.query('ROLLBACK')
        res.status(200).json({
          status: 'ok',
          message: `Category is already ${isActive ? 'active' : 'inactive'}.`,
          category: {
            id: categoryId,
            key: previous.category_key,
            name: previous.category_name,
            isActive,
          },
        })
        return
      }

      await client.query(
        `UPDATE public.marketplace_categories
         SET is_active = $2, updated_at = NOW()
         WHERE category_id = $1`,
        [categoryId, isActive],
      )

      const details = {
        categoryId,
        categoryKey: previous.category_key,
        categoryName: previous.category_name,
        previousIsActive: previous.is_active,
        isActive,
      }

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
          isActive ? 'category.activated' : 'category.deactivated',
          'marketplace_category',
          categoryId,
          JSON.stringify(details),
        ],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: `Category ${isActive ? 'activated' : 'deactivated'} successfully.`,
        category: {
          id: categoryId,
          key: previous.category_key,
          name: previous.category_name,
          isActive,
        },
      })
    } catch (error) {
      await client.query('ROLLBACK')

      console.error(
        'Category status update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Category status could not be updated.',
      })
    } finally {
      client.release()
    }
  },
)

export default router
