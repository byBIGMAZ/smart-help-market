import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'crypto'
import { getDatabasePool } from '../database'
import { requireAuthenticatedSession } from '../auth/requireAuthenticatedSession'
import {
  cloudinary,
  CLOUDINARY_API_KEY,
  CLOUDINARY_CLOUD_NAME,
} from '../services/cloudinary'

const router = Router()

const MAX_IMAGES_PER_LISTING = 20
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif'])

function getRouteParam(req: Request, key: string): string {
  const value = req.params[key]
  return typeof value === 'string' ? value : ''
}

function isValidListingId(value: string): boolean {
  return /^[1-9]\d*$/.test(value)
}

function getAuthenticatedUserId(res: Response): string {
  return String(res.locals.authenticatedUserId ?? '')
}

async function verifyListingOwnership(
  listingId: string,
  userId: string,
): Promise<boolean> {
  const result = await getDatabasePool().query(
    `
      SELECT 1
      FROM public.marketplace_listings
      WHERE listing_id = $1
        AND owner_user_id = $2
      LIMIT 1
    `,
    [listingId, userId],
  )

  return result.rows.length > 0
}

function getListingFolder(listingId: string): string {
  return `smart-help-market/listings/${listingId}`
}

function isValidImageFormat(format: string): boolean {
  return ALLOWED_FORMATS.has(format.toLowerCase())
}

// --------------------------------------------------
// 1. RETRIEVE ALL LISTINGS OWNED BY THE AUTHENTICATED USER
// --------------------------------------------------

router.get(
  '/owner',
  requireAuthenticatedSession,
  async (_req, res) => {
    const userId = getAuthenticatedUserId(res)

    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' })
      return
    }

    try {
      const result = await getDatabasePool().query(
        `
          SELECT
            l.listing_id::text AS id,
            l.listing_key AS key,
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
            l.created_at AS "createdAt",
            l.property_relationship_type AS "propertyRelationshipType",
            l.parent_listing_id::text AS "parentListingId",
            COALESCE(gallery.images, '[]'::json) AS images
          FROM public.marketplace_listings AS l
          INNER JOIN public.marketplace_categories AS c
            ON c.category_key = l.category_key
          LEFT JOIN LATERAL (
            SELECT
              json_agg(
                json_build_object(
                  'id', image.image_id::text,
                  'url', image.secure_url,
                  'width', image.width,
                  'height', image.height,
                  'format', image.format,
                  'altText', image.alt_text,
                  'sortOrder', image.sort_order,
                  'isCover', image.is_cover
                )
                ORDER BY image.sort_order ASC, image.image_id ASC
              ) AS images
            FROM public.marketplace_listing_images AS image
            WHERE image.listing_id = l.listing_id
          ) AS gallery ON TRUE
          WHERE l.owner_user_id = $1
          ORDER BY l.created_at DESC, l.listing_id DESC
        `,
        [userId],
      )

      res.status(200).json({
        status: 'ok',
        listings: result.rows,
      })
    } catch (error: unknown) {
      console.error(
        'Owner listings retrieval failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Your listings could not be retrieved.',
      })
    }
  },
)

// --------------------------------------------------
// 2. RETRIEVE THE AUTHENTICATED OWNER'S IMAGE GALLERY
// --------------------------------------------------

router.get(
  '/owner/:listingId',
  requireAuthenticatedSession,
  async (req, res) => {
    const listingId = getRouteParam(req, 'listingId')
    const userId = getAuthenticatedUserId(res)

    if (!isValidListingId(listingId)) {
      res.status(400).json({ error: 'Invalid listing ID.' })
      return
    }

    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' })
      return
    }

    try {
      const listingResult = await getDatabasePool().query(
        `
          SELECT listing_id::text AS id
          FROM public.marketplace_listings
          WHERE listing_id = $1
            AND owner_user_id = $2
          LIMIT 1
        `,
        [listingId, userId],
      )

      if (listingResult.rows.length === 0) {
        res.status(404).json({
          error: 'Listing not found or you do not have access to it.',
        })
        return
      }

      const imageResult = await getDatabasePool().query(
        `
          SELECT
            image_id::text AS id,
            secure_url AS url,
            width,
            height,
            format,
            alt_text AS "altText",
            sort_order AS "sortOrder",
            is_cover AS "isCover"
          FROM public.marketplace_listing_images
          WHERE listing_id = $1
          ORDER BY sort_order ASC, image_id ASC
        `,
        [listingId],
      )

      res.status(200).json({
        status: 'ok',
        listingId,
        images: imageResult.rows,
        imageLimit: MAX_IMAGES_PER_LISTING,
        maxImageBytes: MAX_IMAGE_BYTES,
        allowedFormats: [...ALLOWED_FORMATS],
      })
    } catch (error: unknown) {
      console.error(
        'Owner gallery retrieval failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'The listing image gallery could not be retrieved.',
      })
    }
  },
)

// --------------------------------------------------
// 2. REQUEST A SIGNED CLOUDINARY UPLOAD
// --------------------------------------------------

router.post(
  '/:listingId/signature',
  requireAuthenticatedSession,
  async (req, res) => {
    const listingId = getRouteParam(req, 'listingId')
    const userId = getAuthenticatedUserId(res)

    if (!isValidListingId(listingId)) {
      res.status(400).json({ error: 'Invalid listing ID.' })
      return
    }

    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' })
      return
    }

    try {
      const ownsListing = await verifyListingOwnership(
        listingId,
        userId,
      )

      if (!ownsListing) {
        res.status(403).json({
          error: 'You can only upload images to your own listings.',
        })
        return
      }

      const countResult = await getDatabasePool().query<{
        total: string
      }>(
        `
          SELECT COUNT(*)::text AS total
          FROM public.marketplace_listing_images
          WHERE listing_id = $1
        `,
        [listingId],
      )

      const currentCount = Number(countResult.rows[0]?.total ?? 0)

      if (currentCount >= MAX_IMAGES_PER_LISTING) {
        res.status(409).json({
          error: `A listing can have a maximum of ${MAX_IMAGES_PER_LISTING} images.`,
        })
        return
      }

      const timestamp = Math.floor(Date.now() / 1000)
      const folder = getListingFolder(listingId)
      const publicId = `${folder}/${randomUUID()}`

      const signatureParameters = {
        folder,
        public_id: publicId,
        timestamp,
      }

      const signature = cloudinary.utils.api_sign_request(
        signatureParameters,
        process.env.CLOUDINARY_API_SECRET as string,
      )

      res.status(200).json({
        status: 'ok',
        upload: {
          cloudName: CLOUDINARY_CLOUD_NAME,
          apiKey: CLOUDINARY_API_KEY,
          timestamp,
          folder,
          publicId,
          signature,
          maxBytes: MAX_IMAGE_BYTES,
          allowedFormats: [...ALLOWED_FORMATS],
        },
      })
    } catch (error: unknown) {
      console.error(
        'Cloudinary upload signature failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Image upload authorization could not be completed.',
      })
    }
  },
)

// --------------------------------------------------
// 2. REGISTER A SUCCESSFULLY UPLOADED IMAGE
// --------------------------------------------------

router.post(
  '/:listingId',
  requireAuthenticatedSession,
  async (req, res) => {
    const listingId = getRouteParam(req, 'listingId')
    const userId = getAuthenticatedUserId(res)

    if (!isValidListingId(listingId)) {
      res.status(400).json({ error: 'Invalid listing ID.' })
      return
    }

    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' })
      return
    }

    const {
      publicId,
      secureUrl,
      width,
      height,
      bytes,
      format,
      altText,
    } = req.body ?? {}

    if (
      typeof publicId !== 'string' ||
      typeof secureUrl !== 'string' ||
      typeof format !== 'string' ||
      typeof altText !== 'string' ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      !Number.isSafeInteger(bytes) ||
      width <= 0 ||
      height <= 0 ||
      bytes <= 0 ||
      bytes > MAX_IMAGE_BYTES ||
      altText.length > 300 ||
      !isValidImageFormat(format)
    ) {
      res.status(400).json({
        error: 'Invalid image metadata.',
      })
      return
    }

    const expectedFolder = getListingFolder(listingId)
    const expectedPrefix = `${expectedFolder}/`

    let parsedUrl: URL

    try {
      parsedUrl = new URL(secureUrl)
    } catch {
      res.status(400).json({
        error: 'Invalid Cloudinary image URL.',
      })
      return
    }

    if (
      !publicId.startsWith(expectedPrefix) ||
      publicId.length > 255 ||
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.hostname !== 'res.cloudinary.com' ||
      !parsedUrl.pathname.startsWith(`/${CLOUDINARY_CLOUD_NAME}/image/upload/`)
    ) {
      res.status(400).json({
        error: 'The uploaded image does not match this listing.',
      })
      return
    }

    try {
      const ownsListing = await verifyListingOwnership(
        listingId,
        userId,
      )

      if (!ownsListing) {
        res.status(403).json({
          error: 'You can only manage images on your own listings.',
        })
        return
      }

      // Verify the actual Cloudinary asset rather than trusting
      // metadata submitted by the browser.
      const asset = await cloudinary.api.resource(publicId, {
        resource_type: 'image',
      })

      if (
        asset.secure_url !== secureUrl ||
        asset.format?.toLowerCase() !== format.toLowerCase() ||
        asset.width !== width ||
        asset.height !== height ||
        asset.bytes !== bytes ||
        asset.bytes > MAX_IMAGE_BYTES ||
        !isValidImageFormat(asset.format ?? '')
      ) {
        res.status(400).json({
          error: 'Cloudinary image verification failed.',
        })
        return
      }

      const client = await getDatabasePool().connect()

      try {
        await client.query('BEGIN')
        await client.query("SET LOCAL lock_timeout = '5s'")

        const listingResult = await client.query(
          `
            SELECT listing_id
            FROM public.marketplace_listings
            WHERE listing_id = $1
              AND owner_user_id = $2
            FOR UPDATE
          `,
          [listingId, userId],
        )

        if (listingResult.rows.length === 0) {
          await client.query('ROLLBACK')

          res.status(403).json({
            error: 'You no longer have access to this listing.',
          })
          return
        }

        const countResult = await client.query<{
          total: string
        }>(
          `
            SELECT COUNT(*)::text AS total
            FROM public.marketplace_listing_images
            WHERE listing_id = $1
          `,
          [listingId],
        )

        if (
          Number(countResult.rows[0]?.total ?? 0) >=
          MAX_IMAGES_PER_LISTING
        ) {
          await client.query('ROLLBACK')

          res.status(409).json({
            error: `A listing can have a maximum of ${MAX_IMAGES_PER_LISTING} images.`,
          })
          return
        }

        const coverResult = await client.query(
          `
            SELECT 1
            FROM public.marketplace_listing_images
            WHERE listing_id = $1
              AND is_cover = TRUE
            LIMIT 1
          `,
          [listingId],
        )

        const isFirstImage = coverResult.rows.length === 0

        const orderResult = await client.query<{
          next_order: number
        }>(
          `
            SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
            FROM public.marketplace_listing_images
            WHERE listing_id = $1
          `,
          [listingId],
        )

        const insertResult = await client.query(
          `
            INSERT INTO public.marketplace_listing_images (
              listing_id,
              cloudinary_public_id,
              secure_url,
              width,
              height,
              bytes,
              format,
              alt_text,
              sort_order,
              is_cover
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
              image_id::text AS id,
              listing_id::text AS "listingId",
              cloudinary_public_id AS "publicId",
              secure_url AS "secureUrl",
              width,
              height,
              bytes,
              format,
              alt_text AS "altText",
              sort_order AS "sortOrder",
              is_cover AS "isCover"
          `,
          [
            listingId,
            publicId,
            asset.secure_url,
            asset.width,
            asset.height,
            asset.bytes,
            asset.format,
            altText.trim(),
            orderResult.rows[0].next_order,
            isFirstImage,
          ],
        )

        await client.query('COMMIT')

        res.status(201).json({
          status: 'ok',
          image: insertResult.rows[0],
        })
      } catch (error: unknown) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    } catch (error: unknown) {
      console.error(
        'Image registration failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'The uploaded image could not be registered.',
      })
    }
  },
)

// --------------------------------------------------
// 3. SET A LISTING COVER IMAGE
// --------------------------------------------------

router.patch(
  '/:listingId/:imageId/cover',
  requireAuthenticatedSession,
  async (req, res) => {
    const listingId = getRouteParam(req, 'listingId')
    const imageId = getRouteParam(req, 'imageId')
    const userId = getAuthenticatedUserId(res)

    if (
      !isValidListingId(listingId) ||
      !isValidListingId(imageId)
    ) {
      res.status(400).json({ error: 'Invalid listing or image ID.' })
      return
    }

    const client = await getDatabasePool().connect()

    try {
      await client.query('BEGIN')

      const listingResult = await client.query(
        `
          SELECT listing_id
          FROM public.marketplace_listings
          WHERE listing_id = $1
            AND owner_user_id = $2
          FOR UPDATE
        `,
        [listingId, userId],
      )

      if (listingResult.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(403).json({ error: 'Listing access denied.' })
        return
      }

      const imageResult = await client.query(
        `
          SELECT image_id
          FROM public.marketplace_listing_images
          WHERE image_id = $1
            AND listing_id = $2
        `,
        [imageId, listingId],
      )

      if (imageResult.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Image not found.' })
        return
      }

      await client.query(
        `
          UPDATE public.marketplace_listing_images
          SET is_cover = FALSE
          WHERE listing_id = $1
        `,
        [listingId],
      )

      await client.query(
        `
          UPDATE public.marketplace_listing_images
          SET is_cover = TRUE
          WHERE image_id = $1
            AND listing_id = $2
        `,
        [imageId, listingId],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: 'Cover image updated successfully.',
      })
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined)

      console.error(
        'Cover image update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Cover image could not be updated.',
      })
    } finally {
      client.release()
    }
  },
)

// --------------------------------------------------
// 4. REORDER A LISTING GALLERY
// --------------------------------------------------

router.patch(
  '/:listingId/order',
  requireAuthenticatedSession,
  async (req, res) => {
    const listingId = getRouteParam(req, 'listingId')
    const userId = getAuthenticatedUserId(res)
    const imageIds: unknown = req.body?.imageIds

    if (!isValidListingId(listingId)) {
      res.status(400).json({ error: 'Invalid listing ID.' })
      return
    }

    if (
      !Array.isArray(imageIds) ||
      imageIds.length > MAX_IMAGES_PER_LISTING ||
      !imageIds.every(
        (id) => typeof id === 'string' && isValidListingId(id),
      ) ||
      new Set(imageIds).size !== imageIds.length
    ) {
      res.status(400).json({
        error: 'Provide a valid, unique array of image IDs.',
      })
      return
    }

    const client = await getDatabasePool().connect()

    try {
      await client.query('BEGIN')

      const listingResult = await client.query(
        `
          SELECT listing_id
          FROM public.marketplace_listings
          WHERE listing_id = $1
            AND owner_user_id = $2
          FOR UPDATE
        `,
        [listingId, userId],
      )

      if (listingResult.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(403).json({ error: 'Listing access denied.' })
        return
      }

      const currentResult = await client.query<{
        image_id: string
      }>(
        `
          SELECT image_id::text AS image_id
          FROM public.marketplace_listing_images
          WHERE listing_id = $1
          ORDER BY sort_order, image_id
          FOR UPDATE
        `,
        [listingId],
      )

      const currentIds = currentResult.rows.map(
        (row) => row.image_id,
      )

      if (
        currentIds.length !== imageIds.length ||
        currentIds.some((id) => !imageIds.includes(id))
      ) {
        await client.query('ROLLBACK')

        res.status(400).json({
          error: 'The order must contain every image belonging to this listing exactly once.',
        })
        return
      }

      await client.query(
        `
          UPDATE public.marketplace_listing_images
          SET sort_order = sort_order + 1000
          WHERE listing_id = $1
        `,
        [listingId],
      )

      for (let index = 0; index < imageIds.length; index += 1) {
        await client.query(
          `
            UPDATE public.marketplace_listing_images
            SET sort_order = $1
            WHERE image_id = $2
              AND listing_id = $3
          `,
          [index, imageIds[index], listingId],
        )
      }

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: 'Image order updated successfully.',
      })
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined)

      console.error(
        'Image ordering failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Image order could not be updated.',
      })
    } finally {
      client.release()
    }
  },
)

// --------------------------------------------------
// 5. DELETE A LISTING IMAGE
// --------------------------------------------------

router.delete(
  '/:listingId/:imageId',
  requireAuthenticatedSession,
  async (req, res) => {
    const listingId = getRouteParam(req, 'listingId')
    const imageId = getRouteParam(req, 'imageId')
    const userId = getAuthenticatedUserId(res)

    if (
      !isValidListingId(listingId) ||
      !isValidListingId(imageId)
    ) {
      res.status(400).json({ error: 'Invalid listing or image ID.' })
      return
    }

    try {
      const client = await getDatabasePool().connect()
      let publicId = ''

      try {
        await client.query('BEGIN')

        const listingResult = await client.query(
          `
            SELECT listing_id
            FROM public.marketplace_listings
            WHERE listing_id = $1
              AND owner_user_id = $2
            FOR UPDATE
          `,
          [listingId, userId],
        )

        if (listingResult.rows.length === 0) {
          await client.query('ROLLBACK')
          res.status(403).json({ error: 'Listing access denied.' })
          return
        }

        const imageResult = await client.query<{
          cloudinary_public_id: string
        }>(
          `
            SELECT cloudinary_public_id
            FROM public.marketplace_listing_images
            WHERE image_id = $1
              AND listing_id = $2
            FOR UPDATE
          `,
          [imageId, listingId],
        )

        if (imageResult.rows.length === 0) {
          await client.query('ROLLBACK')
          res.status(404).json({ error: 'Image not found.' })
          return
        }

        publicId = imageResult.rows[0].cloudinary_public_id

        await client.query(
          `
            DELETE FROM public.marketplace_listing_images
            WHERE image_id = $1
              AND listing_id = $2
          `,
          [imageId, listingId],
        )

        // Promote the next image if the deleted image was the cover.
        const remainingCover = await client.query(
          `
            SELECT image_id
            FROM public.marketplace_listing_images
            WHERE listing_id = $1
              AND is_cover = TRUE
            LIMIT 1
          `,
          [listingId],
        )

        if (remainingCover.rows.length === 0) {
          await client.query(
            `
              UPDATE public.marketplace_listing_images
              SET is_cover = TRUE
              WHERE image_id = (
                SELECT image_id
                FROM public.marketplace_listing_images
                WHERE listing_id = $1
                ORDER BY sort_order, image_id
                LIMIT 1
              )
            `,
            [listingId],
          )
        }

        await client.query('COMMIT')
      } catch (error: unknown) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }

      // Remove the Cloudinary asset after the database record is deleted.
      try {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: 'image',
          invalidate: true,
        })
      } catch (cloudinaryError: unknown) {
        console.error(
          'Cloudinary image cleanup failed:',
          cloudinaryError instanceof Error
            ? cloudinaryError.message
            : 'Unknown error',
        )

        res.status(200).json({
          status: 'ok',
          message: 'Image removed from the listing. Cloudinary cleanup needs retry.',
          cloudinaryCleanupPending: true,
        })
        return
      }

      res.status(200).json({
        status: 'ok',
        message: 'Image deleted successfully.',
      })
    } catch (error: unknown) {
      console.error(
        'Image deletion failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Image could not be deleted.',
      })
    }
  },
)

export default router
