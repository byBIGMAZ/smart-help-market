
import { getDatabasePool } from './database'

const testListings = [
  {
    listingKey: 'bigmaz-moderation-test-a',
    title: 'BIGMAZ Moderation Test A',
    description:
      'Temporary internal test listing for testing approval, publication and suspension workflows. Not a genuine customer submission.',
  },
  {
    listingKey: 'bigmaz-moderation-test-b',
    title: 'BIGMAZ Moderation Test B',
    description:
      'Temporary internal test listing for testing the rejection workflow. Not a genuine customer submission.',
  },
]

async function createModerationTestListings() {
  const db = getDatabasePool()
  const client = await db.connect()

  try {
    console.log('STARTING MODERATION TEST LISTING CREATION')

    await client.query('BEGIN')

    // Verify that the Services category exists and is active.
    const categoryResult = await client.query<{
      category_key: string
    }>(
      `SELECT category_key
       FROM public.marketplace_categories
       WHERE category_key = $1
         AND is_active = TRUE
       FOR SHARE`,
      ['services'],
    )

    if (categoryResult.rows.length !== 1) {
      throw new Error(
        'The active Services category could not be verified.',
      )
    }

    const createdListings: {
      id: string
      listingKey: string
      title: string
      status: string
      isDemo: boolean
    }[] = []

    for (const listing of testListings) {
      // Do not overwrite an existing record.
      const existingResult = await client.query(
        `SELECT
           listing_id::text AS id,
           listing_key AS "listingKey",
           title,
           status,
           is_demo AS "isDemo",
           owner_user_id::text AS "ownerUserId"
         FROM public.marketplace_listings
         WHERE listing_key = $1
         FOR UPDATE`,
        [listing.listingKey],
      )

      let record = existingResult.rows[0]

      if (!record) {
        const insertResult = await client.query(
          `INSERT INTO public.marketplace_listings (
             listing_key,
             category_key,
             title,
             description,
             price,
             price_unit,
             location_display,
             icon,
             listing_tag,
             status,
             is_demo,
             owner_user_id
           )
           VALUES (
             $1,
             'services',
             $2,
             $3,
             0,
             '',
             'Internal Testing',
             '🧪',
             'Internal Test',
             'pending_review',
             FALSE,
             NULL
           )
           RETURNING
             listing_id::text AS id,
             listing_key AS "listingKey",
             title,
             status,
             is_demo AS "isDemo",
             owner_user_id::text AS "ownerUserId"`,
          [
            listing.listingKey,
            listing.title,
            listing.description,
          ],
        )

        record = insertResult.rows[0]
      } else {
        // Never silently reuse or modify an unexpected record.
        if (
          record.status !== 'pending_review' ||
          record.isDemo !== false ||
          record.ownerUserId !== null ||
          record.title !== listing.title
        ) {
          throw new Error(
            `Existing record ${listing.listingKey} does not match the expected untouched test listing. No changes were made.`,
          )
        }
      }

      createdListings.push({
        id: String(record.id),
        listingKey: String(record.listingKey),
        title: String(record.title),
        status: String(record.status),
        isDemo: Boolean(record.isDemo),
      })
    }

    // Verify both test listings.
    if (createdListings.length !== 2) {
      throw new Error(
        'Expected exactly two moderation test listings.',
      )
    }

    if (
      createdListings.some(
        (listing) =>
          listing.status !== 'pending_review' ||
          listing.isDemo !== false,
      )
    ) {
      throw new Error(
        'Moderation test listing verification failed.',
      )
    }

    await client.query('COMMIT')

    console.log('')
    console.log('MODERATION TEST LISTINGS READY')
    console.log('-------------------------------')
    console.table(createdListings)
    console.log('Total test listings: 2')
    console.log('Initial status: pending_review')
    console.log('Demo records modified: NONE')
    console.log('Transaction: COMMITTED')
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined)

    console.error('')
    console.error('TEST LISTING CREATION FAILED')
    console.error(
      error instanceof Error
        ? error.message
        : 'Unknown error',
    )

    throw error
  } finally {
    client.release()
    await db.end()
  }
}

createModerationTestListings().catch(() => {
  process.exitCode = 1
})
