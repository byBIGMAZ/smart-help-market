
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  getPublicListingByKey,
  type MarketplaceListing,
} from '../../services/marketplaceListings'
import ListingImageGallery from '../../components/listings/ListingImageGallery'

import { getPublicPlatformSettings } from '../../services/platformSettings'

import '../../styles/listing-details.css'

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

export default function ListingDetailsPage() {
  const { key } = useParams<{ key: string }>()

  const [listing, setListing] =
    useState<MarketplaceListing | null>(null)

  const [currency, setCurrency] = useState('NGN')
  const [locale, setLocale] = useState('en-NG')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadListing() {
      if (!key) {
        setError('The requested listing could not be identified.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        const [listingData, settings] = await Promise.all([
          getPublicListingByKey(key),
          getPublicPlatformSettings(),
        ])

        if (!active) return

        setListing(listingData)
        setCurrency(settings['platform.currency'] || 'NGN')
        setLocale(settings['platform.locale'] || 'en-NG')
      } catch (loadError) {
        console.error(
          'Unable to load listing details:',
          loadError,
        )

        if (active) {
          setListing(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load this listing.',
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadListing()

    return () => {
      active = false
    }
  }, [key])

  if (loading) {
    return (
      <main className="marketplace listing-details-page">
        <div className="details-loading" role="status">
          <span className="details-loading-icon">⌕</span>
          <h2>Loading listing details</h2>
          <p>Please wait while we retrieve this listing.</p>
        </div>
      </main>
    )
  }

  if (!listing || error) {
    return (
      <main className="marketplace listing-details-page">
        <div className="details-error">
          <span className="details-error-icon">!</span>
          <h1>Listing unavailable</h1>
          <p>{error || 'This listing could not be found.'}</p>

          <Link
            to="/explore"
            className="button button-primary"
          >
            Return to Explore
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="marketplace listing-details-page">
      <nav className="details-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/explore">Explore</Link>
        <span>/</span>
        <Link
          to={`/explore?category=${encodeURIComponent(listing.categoryKey)}`}
        >
          {listing.category}
        </Link>
        <span>/</span>
        <span aria-current="page">{listing.title}</span>
      </nav>

      <section className="details-main">
        <div className="details-heading">
          <div>
            <span className="section-kicker">
              {listing.category.toUpperCase()}
            </span>

            <h1>{listing.title}</h1>

            <p className="details-location">
              <span aria-hidden="true">⌖</span>
              {listing.location}
            </p>
          </div>

          <span className="details-tag">
            {listing.tag}
          </span>
        </div>

        <div className="details-layout">
          <section className="details-primary">
            <div
              className={`details-visual details-visual-${listing.categoryKey}`}
            >
              <ListingImageGallery
                images={listing.images}
                fallbackIcon={listing.icon || getCategoryIcon(listing.categoryKey)}
                category={listing.category}
                variant="detail"
                altTitle={listing.title}
              />

              {listing.isDemo && (
                <span className="sample-label">
                  DEMO LISTING
                </span>
              )}
            </div>

            <section className="details-information">
              <span className="section-kicker">
                LISTING INFORMATION
              </span>

              <h2>About this listing</h2>

              <p>
                {listing.description.trim() ||
                  'No additional description has been provided for this listing.'}
              </p>
            </section>

            <section className="details-information">
              <span className="section-kicker">
                LISTING LOCATION
              </span>

              <h2>Where it is located</h2>

              <p>{listing.location || 'Location not provided.'}</p>
            </section>
          </section>

          <aside className="details-sidebar">
            <div className="details-price-card">
              <span className="details-price-label">
                {listing.price === null ? 'Unit pricing' : 'Listed price'}
              </span>

              <strong className="details-price">
                {listing.price === null
                  ? 'Pricing varies by unit'
                  : formatCurrency(listing.price, currency, locale)}
              </strong>

              {listing.price !== null && (
                <span className="details-price-unit">
                  {listing.priceUnit}
                </span>
              )}

              <div className="details-divider" />

              <div className="details-meta">
                <span>Category</span>
                <strong>{listing.category}</strong>
              </div>

              <div className="details-meta">
                <span>Listing type</span>
                <strong>{listing.tag}</strong>
              </div>

              <div className="details-meta">
                <span>Published</span>
                <strong>
                  {new Date(listing.createdAt).toLocaleDateString(
                    locale,
                    {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    },
                  )}
                </strong>
              </div>

              <div className="details-divider" />

              <p className="details-contact-note">
                Contact, inspection and transaction features will
                become available through the platform's secure
                workflows.
              </p>
            </div>

            <Link
              to={`/explore?category=${encodeURIComponent(listing.categoryKey)}`}
              className="details-back-link"
            >
              Explore more {listing.category.toLowerCase()}
              <span aria-hidden="true">→</span>
            </Link>
          </aside>
        </div>

        {listing.isDemo && (
          <div className="details-demo-notice" role="note">
            <strong>Demonstration listing</strong>
            <p>
              This listing is sample development data. It is not a
              verified offer. Do not use it to make payments or
              financial commitments.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
