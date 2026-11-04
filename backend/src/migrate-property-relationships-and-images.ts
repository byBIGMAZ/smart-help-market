import { getDatabasePool } from './database'

async function migratePropertyRelationshipsAndImages() {
  const db = getDatabasePool()
  const client = await db.connect()

  try {
    await client.query('BEGIN')

    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '30s'")

    // 1. Add property relationship columns.
    await client.query(`
      ALTER TABLE public.marketplace_listings
        ADD COLUMN IF NOT EXISTS
          property_relationship_type TEXT NOT NULL DEFAULT 'standalone',
        ADD COLUMN IF NOT EXISTS
          parent_listing_id BIGINT
    `)

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname =
            'marketplace_listings_property_relationship_check'
            AND conrelid =
              'public.marketplace_listings'::regclass
        ) THEN
          ALTER TABLE public.marketplace_listings
            ADD CONSTRAINT
              marketplace_listings_property_relationship_check
            CHECK (
              property_relationship_type IN (
                'standalone', 'parent', 'child'
              )
              AND (
                (
                  property_relationship_type IN (
                    'standalone', 'parent'
                  )
                  AND parent_listing_id IS NULL
                )
                OR (
                  property_relationship_type = 'child'
                  AND parent_listing_id IS NOT NULL
                )
              )
            );
        END IF;
      END
      $$;
    `)

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname =
            'marketplace_listings_parent_listing_fk'
            AND conrelid =
              'public.marketplace_listings'::regclass
        ) THEN
          ALTER TABLE public.marketplace_listings
            ADD CONSTRAINT
              marketplace_listings_parent_listing_fk
            FOREIGN KEY (parent_listing_id)
            REFERENCES public.marketplace_listings(listing_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT;
        END IF;
      END
      $$;
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_listings_parent
      ON public.marketplace_listings (parent_listing_id)
      WHERE parent_listing_id IS NOT NULL
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_listings_property_relationship
      ON public.marketplace_listings (
        category_key,
        property_relationship_type,
        status
      )
    `)

    // 2. Enforce valid parent-child relationships.
    await client.query(`
      CREATE OR REPLACE FUNCTION
        public.validate_marketplace_property_relationship()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        parent_category TEXT;
        parent_relationship TEXT;
      BEGIN
        IF NEW.property_relationship_type = 'standalone' THEN
          RETURN NEW;
        END IF;

        IF NEW.category_key <> 'properties' THEN
          RAISE EXCEPTION
            'Parent-child relationships are only allowed for properties.';
        END IF;

        IF NEW.property_relationship_type = 'parent' THEN
          IF NEW.parent_listing_id IS NOT NULL THEN
            RAISE EXCEPTION
              'A parent property cannot have another parent listing.';
          END IF;

          RETURN NEW;
        END IF;

        IF NEW.property_relationship_type = 'child' THEN
          IF NEW.parent_listing_id IS NULL THEN
            RAISE EXCEPTION
              'A child property must reference a parent listing.';
          END IF;

          IF NEW.parent_listing_id = NEW.listing_id THEN
            RAISE EXCEPTION
              'A property cannot be its own parent.';
          END IF;

          SELECT category_key, property_relationship_type
          INTO parent_category, parent_relationship
          FROM public.marketplace_listings
          WHERE listing_id = NEW.parent_listing_id
          FOR KEY SHARE;

          IF NOT FOUND THEN
            RAISE EXCEPTION
              'The selected parent property does not exist.';
          END IF;

          IF parent_category <> 'properties'
            OR parent_relationship <> 'parent' THEN
            RAISE EXCEPTION
              'A child must belong to a valid parent property.';
          END IF;

          RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Invalid property relationship type.';
      END;
      $$;
    `)

    await client.query(`
      DROP TRIGGER IF EXISTS
        trg_validate_marketplace_property_relationship
      ON public.marketplace_listings
    `)

    await client.query(`
      CREATE TRIGGER
        trg_validate_marketplace_property_relationship
      BEFORE INSERT OR UPDATE OF
        category_key,
        property_relationship_type,
        parent_listing_id
      ON public.marketplace_listings
      FOR EACH ROW
      EXECUTE FUNCTION
        public.validate_marketplace_property_relationship()
    `)

    // 3. Create independent image galleries.
    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public.marketplace_listing_images (
          image_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

          listing_id BIGINT NOT NULL
            REFERENCES public.marketplace_listings(listing_id)
            ON UPDATE RESTRICT
            ON DELETE CASCADE,

          cloudinary_public_id TEXT NOT NULL UNIQUE,
          secure_url TEXT NOT NULL,

          width INTEGER NOT NULL CHECK (width > 0),
          height INTEGER NOT NULL CHECK (height > 0),
          bytes BIGINT NOT NULL CHECK (bytes > 0),

          format TEXT NOT NULL,
          alt_text TEXT NOT NULL DEFAULT '',

          sort_order INTEGER NOT NULL DEFAULT 0
            CHECK (sort_order >= 0),

          is_cover BOOLEAN NOT NULL DEFAULT FALSE,

          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT marketplace_listing_images_public_id_not_blank
            CHECK (length(trim(cloudinary_public_id)) > 0),

          CONSTRAINT marketplace_listing_images_url_not_blank
            CHECK (length(trim(secure_url)) > 0),

          CONSTRAINT marketplace_listing_images_format_not_blank
            CHECK (length(trim(format)) > 0)
        )
    `)

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        idx_marketplace_listing_images_one_cover
      ON public.marketplace_listing_images (listing_id)
      WHERE is_cover = TRUE
    `)

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        idx_marketplace_listing_images_order
      ON public.marketplace_listing_images (
        listing_id, sort_order
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        idx_marketplace_listing_images_gallery
      ON public.marketplace_listing_images (
        listing_id, sort_order, image_id
      )
    `)

    // 4. Verify migration.
    const columns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_listings'
        AND column_name IN (
          'property_relationship_type',
          'parent_listing_id'
        )
    `)

    if (columns.rows.length !== 2) {
      throw new Error('Property columns verification failed.')
    }

    const images = await client.query(`
      SELECT to_regclass(
        'public.marketplace_listing_images'
      ) AS table_name
    `)

    if (!images.rows[0]?.table_name) {
      throw new Error('Listing images table verification failed.')
    }

    const listingCount = await client.query(`
      SELECT COUNT(*)::text AS total
      FROM public.marketplace_listings
    `)

    const imageCount = await client.query(`
      SELECT COUNT(*)::text AS total
      FROM public.marketplace_listing_images
    `)

    await client.query('COMMIT')

    console.log('PROPERTY AND IMAGE MIGRATION COMPLETED')
    console.log('Property relationship columns: verified')
    console.log('Parent-child safeguards: installed')
    console.log('Listing image gallery table: verified')
    console.log('Single cover image constraint: installed')
    console.log('Image ordering constraint: installed')
    console.log(
      `Existing listings preserved: ${listingCount.rows[0].total}`,
    )
    console.log(
      `Existing gallery images: ${imageCount.rows[0].total}`,
    )
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await db.end()
  }
}

migratePropertyRelationshipsAndImages().catch(
  (error: unknown) => {
    console.error(
      'PROPERTY AND IMAGE MIGRATION FAILED:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    process.exitCode = 1
  },
)
