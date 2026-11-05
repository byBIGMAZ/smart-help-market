import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { submitOwnerListingForReview, verifyOwnerListingFeePayment } from '../../services/ownerListingDrafts'
import ListingGalleryManager from '../../components/listings/ListingGalleryManager'
import {
  getOwnerListings,
  type OwnerMarketplaceListing,
} from '../../services/ownerListings'
import './OwnerListingsPage.css'

function readDraftValues(listing: OwnerMarketplaceListing): Record<string, string> {
  const details = listing.details
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {}
  const values = details.values
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {}
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function formatNaira(value: string | number | null | undefined): string {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0
    ? `₦${amount.toLocaleString('en-NG')}`
    : ''
}

function getListingFacts(listing: OwnerMarketplaceListing): string[] {
  const values = readDraftValues(listing)
  const details = listing.details as Record<string, unknown> | undefined
  const kind = details?.kind
  const facts: string[] = []
  const purpose = values.purpose
  const propertyType = values.propertyType
  if (purpose) facts.push(purpose)
  if (propertyType) facts.push(propertyType)

  if (kind === 'properties' && purpose !== 'For sale') {
    const rawUnits = Array.isArray(details?.units) ? details.units : []
    const unitPrices = rawUnits
      .map((unit) => unit && typeof unit === 'object' ? (unit as Record<string, unknown>).rent : '')
      .map((value) => formatNaira(typeof value === 'string' ? value : ''))
      .filter(Boolean)
    const sharedPrice = formatNaira(values.sharedUnitPrice)
    if (sharedPrice) facts.push(`All units: ${sharedPrice}`)
    else if (unitPrices.length) {
      const uniquePrices = [...new Set(unitPrices)]
      facts.push(uniquePrices.length === 1
        ? `Per unit: ${uniquePrices[0]}`
        : `Unit prices: ${uniquePrices.slice(0, 3).join(', ')}${uniquePrices.length > 3 ? ', …' : ''}`)
    } else {
      facts.push('Unit pricing not set')
    }
  } else {
    const price = formatNaira(listing.price)
    if (price) facts.push(price)
  }

  return facts
}

function formatPaymentAmount(amountMinor: number, currencyCode: string): string {
  const currency = currencyCode.toUpperCase()
  const exponent = ['JPY', 'KRW', 'XOF', 'XAF', 'CLP', 'UGX', 'RWF'].includes(currency)
    ? 0
    : ['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(currency)
      ? 3
      : 2
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(amountMinor / (10 ** exponent))
}

function getEditorPath(listing: OwnerMarketplaceListing): string {
  const details = listing.details as Record<string, unknown> | undefined
  const kind = details?.kind
  if (kind === 'products' || listing.categoryKey === 'products') return '/seller/products/new'
  if (kind === 'services' || listing.categoryKey === 'services') return '/provider/services/new'
  return '/landlord/properties/new'
}

export default function OwnerListingsPage() {
  const [listings, setListings] = useState<OwnerMarketplaceListing[]>([])
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [listingActionBusy, setListingActionBusy] = useState(false)
  const [listingActionMessage, setListingActionMessage] = useState('')
  const [listingActionError, setListingActionError] = useState('')
  const [pendingCheckout, setPendingCheckout] = useState<{ authorizationUrl: string; amountMinor: number; currencyCode: string } | null>(null)

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') !== 'return') return

    const listingId = params.get('listingId') || ''
    const reference = params.get('reference') || ''
    if (!listingId || !reference) {
      setListingActionError('The payment return details are incomplete. Refresh your listings and contact support if you were charged.')
      return
    }

    let active = true
    setListingActionBusy(true)
    setListingActionMessage('Confirming your payment securely with Paystack…')
    setListingActionError('')

    verifyOwnerListingFeePayment(listingId, reference)
      .then((result) => {
        if (!active) return
        setListingActionMessage(result.message || 'Payment confirmed and listing submitted for review.')
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('payment')
        cleanUrl.searchParams.delete('listingId')
        cleanUrl.searchParams.delete('reference')
        window.history.replaceState({}, '', cleanUrl.toString())
        return loadListings()
      })
      .catch((cause) => {
        if (!active) return
        setListingActionMessage('')
        setListingActionError(cause instanceof Error ? cause.message : 'Payment verification could not be completed.')
      })
      .finally(() => {
        if (active) setListingActionBusy(false)
      })

    return () => {
      active = false
    }
  }, [loadListings])

  async function submitSelectedListing() {
    if (!selectedListing || selectedListing.status.toLowerCase() !== 'draft') return
    setListingActionBusy(true)
    setListingActionMessage('')
    setListingActionError('')
    try {
      const result = await submitOwnerListingForReview(selectedListing.id)
      if (result.paymentRequired && result.authorizationUrl && Number.isSafeInteger(result.amountMinor) && result.currencyCode) {
        setPendingCheckout({ authorizationUrl: result.authorizationUrl, amountMinor: result.amountMinor as number, currencyCode: result.currencyCode })
        return
      }
      setListingActionMessage(result.message || 'Your listing has been submitted for review.')
      await loadListings()
    } catch (cause) {
      setListingActionError(cause instanceof Error ? cause.message : 'Your listing could not be submitted.')
    } finally {
      setListingActionBusy(false)
    }
  }

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

      {(listingActionMessage || listingActionError) && (
        <div
          className={`owner-listing-action-feedback ${listingActionError ? 'is-error' : 'is-success'}`}
          role={listingActionError ? 'alert' : 'status'}
        >
          <span>{listingActionError ? '!' : '✓'}</span>
          <p>{listingActionError || listingActionMessage}</p>
          {listingActionBusy && <small>Checking securely…</small>}
        </div>
      )}

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
                      <small className="owner-listing-facts">
                        {getListingFacts(listing).join(' · ') || 'Details saved'}
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

                  <div className="owner-selected-actions">
                    {selectedListing.status.toLowerCase() === 'draft' && (
                      <Link
                        className="owner-edit-draft"
                        to={`${getEditorPath(selectedListing)}?draftId=${encodeURIComponent(selectedListing.id)}`}
                      >
                        Edit draft
                      </Link>
                    )}
                    {selectedListing.status.toLowerCase() === 'draft' && (
                      <button
                        type="button"
                        className="owner-submit-listing"
                        onClick={() => void submitSelectedListing()}
                        disabled={listingActionBusy}
                      >
                        {listingActionBusy ? 'Processing…' : 'Submit for review'}
                      </button>
                    )}
                    {selectedListing.status.toLowerCase() === 'published' && (
                      <Link to={`/listing/${selectedListing.key}`}>
                        View public listing ↗
                      </Link>
                    )}
                  </div>
                </div>

                <div className="owner-listing-detail-facts">
                  {getListingFacts(selectedListing).map((fact) => (
                    <span key={fact}>{fact}</span>
                  ))}
                  <span>{selectedListing.images.length} photo(s) uploaded</span>
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

      {pendingCheckout && (
        <div className="owner-payment-confirm-backdrop" role="presentation">
          <section
            className="owner-payment-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-payment-confirm-title"
          >
            <span className="owner-payment-confirm-icon">₦</span>
            <p className="owner-listings-eyebrow">SECURE LISTING PAYMENT</p>
            <h2 id="owner-payment-confirm-title">Confirm listing fee</h2>
            <p className="owner-payment-confirm-copy">
              This is the listing fee configured by the marketplace administrator for this listing category.
              You will review and complete the payment on Paystack.
            </p>
            <strong className="owner-payment-confirm-amount">
              {formatPaymentAmount(pendingCheckout.amountMinor, pendingCheckout.currencyCode)}
            </strong>
            <small className="owner-payment-confirm-note">
              Your listing will remain unpublished. After payment is verified, it will enter the moderation queue.
            </small>
            <div className="owner-payment-confirm-actions">
              <button
                type="button"
                className="owner-payment-cancel"
                onClick={() => setPendingCheckout(null)}
              >
                Not now
              </button>
              <button
                type="button"
                className="owner-payment-continue"
                onClick={() => window.location.assign(pendingCheckout.authorizationUrl)}
              >
                Continue to Paystack ↗
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
