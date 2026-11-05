
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import {
  getPublicCategories,
  type MarketplaceCategory,
} from '../../services/marketplaceCategories'

import {
  getPublicListings,
  type MarketplaceListing,
} from '../../services/marketplaceListings'
import ListingImageGallery from '../../components/listings/ListingImageGallery'
import SearchDiscovery from '../../components/experience/SearchDiscovery'

import { getPublicPlatformSettings } from '../../services/platformSettings'

import '../../App.css'
import '../../AppSystemTheme.css'
import '../../styles/marketplace-browse.css'

function formatCurrency(
  amount: number,
  currency: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount)
  }
}

function getCategoryIcon(key: string): string {
  switch (key.toLowerCase()) {
    case 'properties':
      return '⌂'
    case 'products':
      return '◇'
    case 'services':
      return '✳'
    default:
      return '◈'
  }
}

interface MarketplaceBrowsePageProps {
  mode: 'explore' | 'categories'
}

export default function MarketplaceBrowsePage({
  mode,
}: MarketplaceBrowsePageProps) {
  const [searchParams, setSearchParams] = useSearchParams()

  const [categories, setCategories] = useState<
    MarketplaceCategory[]
  >([])

  const [listings, setListings] = useState<
    MarketplaceListing[]
  >([])

  const [search, setSearch] = useState(
    searchParams.get('search') ?? '',
  )

  const [location, setLocation] = useState(
    searchParams.get('location') ?? '',
  )

  const [category, setCategory] = useState(
    searchParams.get('category') ?? 'All',
  )

  const [currency, setCurrency] = useState('NGN')
  const [locale, setLocale] = useState('en-NG')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadMarketplace() {
      setLoading(true)
      setError('')

      try {
        const [categoryData, listingData, settings] =
          await Promise.all([
            getPublicCategories(),
            getPublicListings(),
            getPublicPlatformSettings(),
          ])

        if (!active) return

        setCategories(categoryData)
        setListings(listingData)

        setCurrency(settings['platform.currency'] || 'NGN')
        setLocale(settings['platform.locale'] || 'en-NG')
      } catch (loadError) {
        console.error(
          'Unable to load marketplace browsing data:',
          loadError,
        )

        if (active) {
          setError(
            'We could not load marketplace listings. Please try again.',
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadMarketplace()

    return () => {
      active = false
    }
  }, [])

  const selectedCategory =
    category !== 'All' &&
    categories.length > 0 &&
    !categories.some((item) => item.key === category)
      ? 'All'
      : category

  const filteredListings = useMemo(() => {
    const query = search.trim().toLowerCase()
    const place = location.trim().toLowerCase()

    return listings.filter((listing) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        listing.categoryKey === selectedCategory

      const searchableText = [
        listing.title,
        listing.description,
        listing.category,
        listing.tag,
        listing.location,
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch =
        !query || searchableText.includes(query)

      const matchesLocation =
        !place ||
        listing.location.toLowerCase().includes(place)

      return (
        matchesCategory &&
        matchesSearch &&
        matchesLocation
      )
    })
  }, [listings, selectedCategory, search, location])

  function updateFilters(
    nextCategory: string,
    nextSearch = search,
    nextLocation = location,
  ) {
    setCategory(nextCategory)
    setSearch(nextSearch)
    setLocation(nextLocation)

    const params = new URLSearchParams()

    if (nextCategory !== 'All') {
      params.set('category', nextCategory)
    }

    if (nextSearch.trim()) {
      params.set('search', nextSearch.trim())
    }

    if (nextLocation.trim()) {
      params.set('location', nextLocation.trim())
    }

    setSearchParams(params)
  }

  function clearFilters() {
    updateFilters('All', '', '')
  }

  return (
    <main className="marketplace browse-page">
      <section className="browse-intro">
        <span className="section-kicker">
          {mode === 'explore'
            ? 'DISCOVER THE MARKETPLACE'
            : 'EXPLORE YOUR OPTIONS'}
        </span>

        <h1>
          {mode === 'explore'
            ? 'Explore the marketplace'
            : 'Browse all categories'}
        </h1>

        <p>
          {mode === 'explore'
            ? 'Find properties, products and services that match your needs.'
            : 'Choose a category and discover available opportunities.'}
        </p>
      </section>

      {mode === 'categories' && (
        <section className="browse-category-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                MARKETPLACE CATEGORIES
              </span>
              <h2>What are you looking for?</h2>
            </div>
          </div>

          <div className="category-grid shm-stagger">
            {categories.map((item) => {
              const count = listings.filter(
                (listing) =>
                  listing.categoryKey === item.key,
              ).length

              return (
                <Link
                  key={item.key}
                  to={`/explore?category=${encodeURIComponent(item.key)}`}
                  className={`category-card category-${item.key}`}
                >
                  <span className="category-icon">
                    <span className={`category-icon-art category-art-${item.key.toLowerCase().replace(/[^a-z0-9-]/g, '')}`} aria-hidden="true">{getCategoryIcon(item.key)}</span>
                  </span>

                  <span className="category-card-copy">
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                    <small>
                      {count} {count === 1 ? 'listing' : 'listings'}
                    </small>
                  </span>

                  <span className="category-arrow">↗</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {mode === 'explore' && (
        <>
          <section className="browse-search-section">
            <SearchDiscovery
              search={search}
              location={location}
              onSearchChange={(value) => updateFilters(selectedCategory, value)}
              onLocationChange={(value) => updateFilters(selectedCategory, search, value)}
              onSubmit={() => updateFilters(selectedCategory)}
              suggestions={[
                ...categories.map((item) => item.name),
                'Self-contained apartment',
                'Laptops and electronics',
                'Plumbing services',
                'Land for sale',
              ]}
            />
          </section>

          <section className="browse-results-section">
            <div className="section-heading listings-heading">
              <div>
                <span className="section-kicker">
                  AVAILABLE OPPORTUNITIES
                </span>
                <h2>Marketplace listings</h2>
              </div>

              <span className="results-count shm-result-count">
                {loading
                  ? 'Loading listings…'
                  : `${filteredListings.length} ${
                      filteredListings.length === 1
                        ? 'listing'
                        : 'listings'
                    }`}
              </span>
            </div>

            <div
              className="filter-tabs"
              role="group"
              aria-label="Filter by category"
            >
              <button
                className={
                  selectedCategory === 'All'
                    ? 'filter-active'
                    : ''
                }
                onClick={() => updateFilters('All')}
              >
                All
              </button>

              {categories.map((item) => (
                <button
                  key={item.key}
                  className={
                    selectedCategory === item.key
                      ? 'filter-active'
                      : ''
                  }
                  onClick={() => updateFilters(item.key)}
                >
                  {item.name}
                </button>
              ))}
            </div>

            {loading && (
              <div className="empty-state" role="status">
                <span>⌕</span>
                <h3>Loading marketplace listings</h3>
                <p>
                  Please wait while we retrieve available listings.
                </p>
              </div>
            )}

            {!loading && error && (
              <div className="empty-state" role="alert">
                <span>!</span>
                <h3>Unable to load listings</h3>
                <p>{error}</p>

                <button
                  className="button button-primary"
                  onClick={() => window.location.reload()}
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && !error && (
              <>
                <div className="listing-grid shm-stagger">
                  {filteredListings.map((listing) => (
                    <article
                      className="listing-card"
                      key={listing.id}
                      style={{ position: 'relative' }}
                    >
                      <Link
                        className="listing-card-overlay"
                        to={`/listing/${encodeURIComponent(listing.key)}`}
                        aria-label={`View details for ${listing.title}`}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          zIndex: 1,
                          display: 'block',
                          borderRadius: 'inherit',
                        }}
                      />

                      <div
                        className={`listing-image listing-image-${listing.categoryKey}`}
                      >
                        <ListingImageGallery
                          images={listing.images}
                          fallbackIcon={listing.icon || getCategoryIcon(listing.categoryKey)}
                          category={listing.category}
                          variant="card"
                          altTitle={listing.title}
                        />

                        <span className="listing-tag">
                          {listing.tag}
                        </span>

                        {listing.isDemo && (
                          <span className="sample-label">
                            DEMO LISTING
                          </span>
                        )}
                      </div>

                      <div className="listing-content">
                        <span className="listing-category">
                          {listing.category}
                        </span>

                        <h3>{listing.title}</h3>

                        <p>{listing.description}</p>

                        <div className="listing-location">
                          <span aria-hidden="true">⌖</span>
                          {listing.location}
                        </div>

                        <div className="listing-footer">
                          <div>
                            <strong>
                              {listing.price === null
                                ? 'Pricing varies by unit'
                                : formatCurrency(listing.price, currency, locale)}
                            </strong>

                            {listing.price !== null && <span>{listing.priceUnit}</span>}
                          </div>

                          <span className="details-button">
                            View details <span aria-hidden="true">→</span>
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {filteredListings.length === 0 && (
                  <div className="empty-state">
                    <span>⌕</span>
                    <h3>No matching listings</h3>
                    <p>
                      Try another search term or clear your filters.
                    </p>

                    <button
                      className="button button-primary"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </button>
                  </div>
                )}

                {listings.length > 0 &&
                  listings.every((item) => item.isDemo) && (
                    <p className="demo-disclaimer">
                      These are demonstration listings for development
                      only. They are not verified offers, and no
                      transactions can be made from this page.
                    </p>
                  )}
              </>
            )}
          </section>
        </>
      )}
    </main>
  )
}
