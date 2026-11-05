import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ListingGalleryManager from '../../components/listings/ListingGalleryManager'
import {
  getOwnerListings,
  type OwnerMarketplaceListing,
} from '../../services/ownerListings'
import './OwnerListingsPage.css'

export default function OwnerListingsPage() {
  const [listings, setListings] = useState<OwnerMarketplaceListing[]>([])
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadListings = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const results = await getOwnerListings()
      setListings(results)

      setSelectedListingId((current) => {
        if (current && results.some((listing) => listing.id === current)) {
          return current
        }

        return results[0]?.id ?? null
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your listings.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    Promise.resolve().then(async () => {
      if (active) {
        await loadListings()
      }
    })

    return () => {
      active = false
    }
  }, [loadListings])

  const selectedListing = listings.find(
    (listing) => listing.id === selectedListingId
  )

  if (loading) {
    return (
      <main className="owner-listings-page">
        <div className="owner-listings-loading">
          <span className="owner-listings-spinner" />
          <p>Loading your listings...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="owner-listings-page">
        <section className="owner-listings-message">
          <div className="owner-listings-message-icon">🔒</div>
          <h1>Unable to load your listings</h1>
          <p>{error}</p>
          <div className="owner-listings-actions">
            <button type="button" onClick={() => void loadListings()}>
              Try again
            </button>
            {error.toLowerCase().includes('sign in') && (
              <Link to="/login?redirect=%2Fowner%2Flistings">
                Sign in to continue
              </Link>
            )}
            <Link to="/">Return to marketplace</Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="owner-listings-page">
      <header className="owner-listings-header">
        <div>
          <p className="owner-listings-eyebrow">OWNER CENTRE</p>
          <h1>My Listings</h1>
          <p>
            Manage your marketplace listings and the photos displayed to
            potential customers.
          </p>
        </div>

        <button
          type="button"
          className="owner-listings-refresh"
          onClick={() => void loadListings()}
        >
          ↻ Refresh
        </button>
      </header>

      {listings.length === 0 ? (
        <section className="owner-listings-empty">
          <div className="owner-listings-empty-icon">📋</div>
          <h2>You have no listings yet</h2>
          <p>
            Listings you create will appear here. You will then be able to
            select each listing and manage its photo gallery.
          </p>
          <Link to="/landlord/properties/new">＋ Create a property listing</Link>
          <Link to="/explore">Explore the marketplace</Link>
          <small>
            Your saved drafts and listings are retrieved securely from your marketplace account.
          </small>
        </section>
      ) : (
        <div className="owner-listings-layout">
          <aside className="owner-listings-panel">
            <div className="owner-listings-panel-heading">
              <div>
                <h2>Your listings</h2>
                <span>{listings.length} listing(s)</span>
              </div>
            </div>

            <div className="owner-listings-list">
              {listings.map((listing) => {
                const isSelected = listing.id === selectedListingId

                return (
                  <button
                    type="button"
                    key={listing.id}
                    className={`owner-listing-option ${
                      isSelected ? 'selected' : ''
                    }`}
                    onClick={() => setSelectedListingId(listing.id)}
                  >
                    <span className="owner-listing-option-icon">
                      {listing.icon || '📦'}
                    </span>

                    <span className="owner-listing-option-content">
                      <strong>{listing.title}</strong>
                      <small>
                        {listing.category} · {listing.images.length} photo(s)
                      </small>
                      <span
                        className={`owner-listing-status status-${listing.status.toLowerCase()}`}
                      >
                        {listing.status}
                      </span>
                    </span>

                    <span className="owner-listing-option-arrow">›</span>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="owner-listings-workspace">
            {selectedListing ? (
              <>
                <div className="owner-selected-listing">
                  <div>
                    <span className="owner-selected-category">
                      {selectedListing.category}
                    </span>
                    <h2>{selectedListing.title}</h2>
                    <p>
                      {selectedListing.location || 'Location not specified'}
                    </p>
                  </div>

                  <Link to={`/listing/${selectedListing.key}`}>
                    View public listing ↗
                  </Link>
                </div>

                <ListingGalleryManager
                  listingId={selectedListing.id}
                  listingTitle={selectedListing.title}
                />
              </>
            ) : (
              <div className="owner-listings-empty-selection">
                Select a listing to manage its photos.
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
