import { getDatabasePool } from './database'

const geographicSettings = [
  ['geo.enabled', false, 'geography', 'Enable server-side geographic lookup after a provider has been configured and tested.', false],
  ['geo.provider', 'nominatim', 'geography', 'Geocoding provider identifier. Provider credentials must remain in server environment variables.', false],
  ['geo.country_code', 'ng', 'geography', 'Default country restriction for location lookup.', false],
  ['geo.cache_ttl_hours', 720, 'geography', 'How long successful geocoding results may be reused from the server-side cache.', false],
  ['geo.max_results', 5, 'geography', 'Maximum number of geographic candidates returned by a lookup.', false],
  ['geo.store_listing_coordinates', true, 'geography', 'Allow approved listing workflows to store verified coordinates for geographic search.', false],
] as const

async function setupGeographicIntelligence() {
  const db = getDatabasePool()
  const client = await db.connect()

  try {
    await client.query('BEGIN')

    await client.query(`
      ALTER TABLE public.marketplace_listings
        ADD COLUMN IF NOT EXISTS location_latitude NUMERIC(10, 7),
        ADD COLUMN IF NOT EXISTS location_longitude NUMERIC(10, 7),
        ADD COLUMN IF NOT EXISTS location_geocode_status TEXT NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS location_geocode_provider TEXT,
        ADD COLUMN IF NOT EXISTS location_geocoded_at TIMESTAMPTZ
    `)

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'marketplace_listings_location_coordinates_range'
            AND conrelid = 'public.marketplace_listings'::regclass
        ) THEN
          ALTER TABLE public.marketplace_listings
            ADD CONSTRAINT marketplace_listings_location_coordinates_range
            CHECK (
              (location_latitude IS NULL AND location_longitude IS NULL)
              OR (
                location_latitude IS NOT NULL
                AND location_longitude IS NOT NULL
                AND location_latitude BETWEEN -90 AND 90
                AND location_longitude BETWEEN -180 AND 180
              )
            );
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'marketplace_listings_geocode_status_valid'
            AND conrelid = 'public.marketplace_listings'::regclass
        ) THEN
          ALTER TABLE public.marketplace_listings
            ADD CONSTRAINT marketplace_listings_geocode_status_valid
            CHECK (location_geocode_status IN ('pending', 'verified', 'manual', 'failed'));
        END IF;
      END
      $$;
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_listings_geo_coordinates
      ON public.marketplace_listings (location_latitude, location_longitude)
      WHERE status = 'published'
        AND location_latitude IS NOT NULL
        AND location_longitude IS NOT NULL
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.marketplace_geocode_cache (
        query_hash TEXT PRIMARY KEY,
        normalized_query TEXT NOT NULL,
        display_name TEXT NOT NULL,
        latitude NUMERIC(10, 7) NOT NULL
          CHECK (latitude BETWEEN -90 AND 90),
        longitude NUMERIC(10, 7) NOT NULL
          CHECK (longitude BETWEEN -180 AND 180),
        country_code TEXT,
        provider_key TEXT NOT NULL,
        provider_place_id TEXT,
        confidence NUMERIC(5, 4)
          CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
        results JSONB NOT NULL DEFAULT '[]'::jsonb,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      ALTER TABLE public.marketplace_geocode_cache
        ADD COLUMN IF NOT EXISTS results JSONB NOT NULL DEFAULT '[]'::jsonb
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_geocode_cache_expiry
      ON public.marketplace_geocode_cache (expires_at)
    `)

    for (const [key, value, group, description, isPublic] of geographicSettings) {
      await client.query(
        `INSERT INTO public.platform_settings
          (setting_key, setting_value, setting_group, description, is_public)
         VALUES ($1, $2::jsonb, $3, $4, $5)
         ON CONFLICT (setting_key) DO NOTHING`,
        [key, JSON.stringify(value), group, description, isPublic],
      )
    }

    const verification = await client.query<{ table_name: string | null }>(
      `SELECT to_regclass('public.marketplace_geocode_cache')::text AS table_name`,
    )
    if (!verification.rows[0]?.table_name) {
      throw new Error('Geocode cache table verification failed.')
    }

    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'marketplace_listings'
         AND column_name = ANY($1::text[])
       ORDER BY column_name`,
      [[
        'location_latitude',
        'location_longitude',
        'location_geocode_status',
        'location_geocode_provider',
        'location_geocoded_at',
      ]],
    )
    if (columns.rowCount !== 5) {
      throw new Error('Marketplace listing geographic columns could not be verified.')
    }

    console.log('GEOGRAPHIC INTELLIGENCE DATABASE SETUP COMPLETED')
    console.log('Verified public.marketplace_geocode_cache')
    columns.rows.forEach((row) => console.log(`Verified marketplace_listings.${row.column_name}`))
    console.log(`Verified ${geographicSettings.length} geographic settings.`)
    console.log('Geographic lookup remains disabled until an administrator enables it.')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await db.end()
  }
}

setupGeographicIntelligence().catch((error: unknown) => {
  console.error(
    'GEOGRAPHIC INTELLIGENCE DATABASE SETUP FAILED:',
    error instanceof Error ? error.message : 'Unknown setup error',
  )
  process.exitCode = 1
})
