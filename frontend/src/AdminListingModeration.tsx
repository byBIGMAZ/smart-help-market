
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import {
  getAdminModerationListings,
  moderateAdminListing,
  getAdminListingModerationHistory,
  type AdminModerationListing,
  type AdminModerationHistoryEntry,
  type ListingStatus,
  type ListingModerationAction,
} from './services/adminModeration'

import './AdminListingModeration.css'

interface Props {
  onNotice: (message: string) => void
}

type StatusFilter = 'all' | ListingStatus
type DemoFilter = 'all' | 'true' | 'false'

const PAGE_SIZE = 25

const statuses: StatusFilter[] = [
  'all',
  'draft',
  'pending_review',
  'approved',
  'published',
  'paused',
  'rented',
  'sold',
  'unavailable',
  'rejected',
  'suspended',
]

function formatLabel(value: string): string {
  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatPrice(listing: AdminModerationListing): string {
  if (
    listing.price === null ||
    listing.price === undefined ||
    listing.price === ''
  ) {
    return 'Price not specified'
  }

  return `${listing.price}${listing.priceUnit ? ` / ${listing.priceUnit}` : ''}`
}

function getStatusClass(status: ListingStatus): string {
  return `moderation-status moderation-status-${status}`
}

function getActionLabel(action: ListingModerationAction): string {
  const labels: Record<ListingModerationAction, string> = {
    approve: 'Approve listing',
    reject: 'Reject listing',
    publish: 'Publish listing',
    unpublish: 'Unpublish listing',
    suspend: 'Suspend listing',
    restore: 'Restore listing',
  }

  return labels[action]
}

function AdminListingModeration({ onNotice }: Props) {
  const [listings, setListings] = useState<AdminModerationListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [demo, setDemo] = useState<DemoFilter>('all')

  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Dedicated review queue, independent of directory filters
  const [reviewQueue, setReviewQueue] = useState<AdminModerationListing[]>([])
  const [reviewQueueTotal, setReviewQueueTotal] = useState(0)
  const [reviewQueueLoading, setReviewQueueLoading] = useState(true)
  const [reviewQueueError, setReviewQueueError] = useState('')

  const [busyListingId, setBusyListingId] = useState<string | null>(null)

    const [pendingAction, setPendingAction] = useState<{
    listing: AdminModerationListing
    action: ListingModerationAction
  } | null>(null)

  const [actionReason, setActionReason] = useState('')
  const [actionDialogError, setActionDialogError] = useState('')

  const [historyListing, setHistoryListing] =
    useState<AdminModerationListing | null>(null)
  const [history, setHistory] = useState<AdminModerationHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const loadListings = useCallback(
    async (
      searchValue: string,
      statusValue: StatusFilter,
      demoValue: DemoFilter,
      pageOffset: number,
    ) => {
      setLoading(true)
      setError('')

      try {
        const result = await getAdminModerationListings({
          search: searchValue,
          status: statusValue,
          demo: demoValue,
          limit: PAGE_SIZE,
          offset: pageOffset,
        })

        setListings(result.listings)
        setTotal(result.pagination.total)
        setOffset(result.pagination.offset)
        setHasMore(result.pagination.hasMore)
      } catch (err) {
        setListings([])
        setTotal(0)
        setHasMore(false)
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load marketplace listings.',
        )
      } finally {
        setLoading(false)
      }
    },
    [],
  )

    // Load the main listing directory when the page first opens
  useEffect(() => {
    void loadListings('', 'all', 'all', 0)
  }, [loadListings])

    const loadReviewQueue = useCallback(async () => {
    setReviewQueueLoading(true)
    setReviewQueueError('')

    try {
      const result = await getAdminModerationListings({
        search: '',
        status: 'pending_review',
        demo: 'false',
        limit: 5,
        offset: 0,
      })

      setReviewQueue(result.listings)
      setReviewQueueTotal(result.pagination.total)
    } catch (err) {
      setReviewQueue([])
      setReviewQueueTotal(0)
      setReviewQueueError(
        err instanceof Error
          ? err.message
          : 'Unable to load the review queue.',
      )
    } finally {
      setReviewQueueLoading(false)
    }
  }, [])

    useEffect(() => {
    void loadReviewQueue()
  }, [loadReviewQueue])

  const pageCounts = useMemo(() => {
    return {
      pending: listings.filter(
        (listing) => listing.status === 'pending_review',
      ).length,
      published: listings.filter(
        (listing) => listing.status === 'published',
      ).length,
      suspended: listings.filter(
        (listing) => listing.status === 'suspended',
      ).length,
      approved: listings.filter(
        (listing) => listing.status === 'approved',
      ).length,
    }
  }, [listings])

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHistoryListing(null)
    await loadListings(search.trim(), status, demo, 0)
  }

  function resetFilters() {
    setSearch('')
    setStatus('all')
    setDemo('all')
    setHistoryListing(null)
    void loadListings('', 'all', 'all', 0)
  }

    function selectStatusFilter(nextStatus: StatusFilter) {
    setStatus(nextStatus)
    setHistoryListing(null)
    void loadListings(search.trim(), nextStatus, demo, 0)
  }

  async function loadHistory(listing: AdminModerationListing) {
    setHistoryListing(listing)
    setHistory([])
    setHistoryError('')
    setHistoryLoading(true)

    try {
      const result = await getAdminListingModerationHistory(
        listing.id,
        100,
        0,
      )

      setHistory(result.history)
    } catch (err) {
      setHistoryError(
        err instanceof Error
          ? err.message
          : 'Unable to load moderation history.',
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  function closeHistory() {
    setHistoryListing(null)
    setHistory([])
    setHistoryError('')
  }

    function performAction(
    listing: AdminModerationListing,
    action: ListingModerationAction,
  ) {
    if (listing.isDemo) {
      setError('Demonstration listings cannot be moderated.')
      return
    }

    if (busyListingId !== null) return

    setError('')
    setActionDialogError('')
    setActionReason('')
    setPendingAction({ listing, action })
  }

  function closeActionDialog() {
    if (busyListingId !== null) return

    setPendingAction(null)
    setActionReason('')
    setActionDialogError('')
  }

  async function confirmModerationAction() {
    if (!pendingAction || busyListingId !== null) return

    const { listing, action } = pendingAction
    const reason = actionReason.trim()

    if (action === 'reject' || action === 'suspend') {
      if (!reason) {
        setActionDialogError(
          'Please provide a reason before continuing.',
        )
        return
      }

      if (reason.length > 1000) {
        setActionDialogError(
          'The reason must not exceed 1000 characters.',
        )
        return
      }
    }

    setBusyListingId(listing.id)
    setActionDialogError('')
    setError('')

    try {
      const result = await moderateAdminListing(
        listing.id,
        action,
        reason,
      )

      setPendingAction(null)
      setActionReason('')
      onNotice(result.message)

      if (historyListing?.id === listing.id) {
        await loadHistory(listing)
      }

      await Promise.all([
        loadListings(search.trim(), status, demo, offset),
        loadReviewQueue(),
      ])
    } catch (err) {
      setActionDialogError(
        err instanceof Error
          ? err.message
          : 'The moderation action could not be completed.',
      )
    } finally {
      setBusyListingId(null)
    }
  }

  function renderActions(listing: AdminModerationListing) {
    if (listing.isDemo) {
      return (
        <div className="moderation-protected">
          <span aria-hidden="true">🔒</span>
          <span>Protected demo listing</span>
        </div>
      )
    }

    const disabled =
      busyListingId !== null || loading || pendingAction !== null

    return (
      <div className="moderation-actions">
        {listing.status === 'pending_review' && (
          <>
            <button
              type="button"
              className="moderation-action-button moderation-action-primary"
              disabled={disabled}
              onClick={() => void performAction(listing, 'approve')}
            >
              ✓ Approve
            </button>

            <button
              type="button"
              className="moderation-action-button moderation-action-danger"
              disabled={disabled}
              onClick={() => void performAction(listing, 'reject')}
            >
              Reject
            </button>
          </>
        )}

        {listing.status === 'approved' && (
          <>
            <button
              type="button"
              className="moderation-action-button moderation-action-primary"
              disabled={disabled}
              onClick={() => void performAction(listing, 'publish')}
            >
              ↑ Publish
            </button>

            <button
              type="button"
              className="moderation-action-button moderation-action-danger"
              disabled={disabled}
              onClick={() => void performAction(listing, 'suspend')}
            >
              Suspend
            </button>
          </>
        )}

        {listing.status === 'published' && (
          <>
            <button
              type="button"
              className="moderation-action-button moderation-action-secondary"
              disabled={disabled}
              onClick={() => void performAction(listing, 'unpublish')}
            >
              Unpublish
            </button>

            <button
              type="button"
              className="moderation-action-button moderation-action-danger"
              disabled={disabled}
              onClick={() => void performAction(listing, 'suspend')}
            >
              Suspend
            </button>
          </>
        )}

        {listing.status === 'suspended' && (
          <button
            type="button"
            className="moderation-action-button moderation-action-primary"
            disabled={disabled}
            onClick={() => void performAction(listing, 'restore')}
          >
            ↻ Restore
          </button>
        )}

        {![
          'pending_review',
          'approved',
          'published',
          'suspended',
        ].includes(listing.status) && (
          <span className="moderation-no-action">
            No action available
          </span>
        )}
      </div>
    )
  }

  function renderListingCard(listing: AdminModerationListing) {
    const isBusy = busyListingId === listing.id

    return (
      <article
        className="moderation-listing-card"
        key={listing.id}
      >
        <div className="moderation-card-main">
          <div className="moderation-card-heading">
            <div className="moderation-listing-icon" aria-hidden="true">
              {listing.icon || '◇'}
            </div>

            <div className="moderation-listing-title">
              <h3>{listing.title}</h3>
              <span>{listing.listingKey}</span>
            </div>

            <span className={getStatusClass(listing.status)}>
              {formatLabel(listing.status)}
            </span>
          </div>

          {listing.description && (
            <p className="moderation-listing-description">
              {listing.description}
            </p>
          )}

          <div className="moderation-listing-meta">
            <div>
              <span className="moderation-meta-label">Category</span>
              <strong>{listing.category || 'Uncategorised'}</strong>
            </div>

            <div>
              <span className="moderation-meta-label">Price</span>
              <strong>{formatPrice(listing)}</strong>
            </div>

            <div>
              <span className="moderation-meta-label">Location</span>
              <strong>{listing.location || 'Not specified'}</strong>
            </div>

            <div>
              <span className="moderation-meta-label">Listing type</span>
              <strong>
                {listing.isDemo ? 'Demonstration' : 'Regular'}
              </strong>
            </div>

            <div>
              <span className="moderation-meta-label">Created</span>
              <strong>{formatDate(listing.createdAt)}</strong>
            </div>

            <div>
              <span className="moderation-meta-label">Listing ID</span>
              <strong>#{listing.id}</strong>
            </div>
          </div>

          {listing.tag && (
            <div className="moderation-listing-tag">
              <span>Tag:</span> {listing.tag}
            </div>
          )}
        </div>

        <div className="moderation-card-actions">
          <div className="moderation-action-heading">
            <span>Moderation actions</span>
            {isBusy && <span className="moderation-working">Working…</span>}
          </div>

          {renderActions(listing)}

          <button
            type="button"
            className="moderation-history-button"
            onClick={() => void loadHistory(listing)}
            disabled={historyLoading}
          >
            <span aria-hidden="true">▤</span>
            View moderation history
          </button>
        </div>
      </article>
    )
  }

  return (
    <section className="admin-moderation-section">
      <div className="moderation-page-heading">
        <div>
          <span className="admin-kicker">MARKETPLACE CONTENT CONTROL</span>
          <h2>Listing Moderation</h2>
          <p>
            Review submissions, control publication and maintain the
            marketplace's content standards.
          </p>
        </div>

        <button
          type="button"
          className="admin-secondary-button moderation-refresh-button"
          onClick={() =>
            void loadListings(search.trim(), status, demo, offset)
          }
          disabled={loading}
        >
          <span aria-hidden="true">↻</span>
          {loading ? 'Refreshing…' : 'Refresh listings'}
        </button>
      </div>

            <div className="moderation-summary-grid">
        <button
          type="button"
          className={`moderation-summary-card ${
            status === 'all' ? 'is-selected' : ''
          }`}
          onClick={() => selectStatusFilter('all')}
          aria-pressed={status === 'all'}
        >
          <span className="moderation-summary-icon">▤</span>
          <span className="moderation-summary-label">Matching listings</span>
          <strong>{loading ? '—' : total.toLocaleString()}</strong>
          <small>View all matching listings</small>
        </button>

        <button
          type="button"
          className={`moderation-summary-card moderation-summary-pending ${
            status === 'pending_review' ? 'is-selected' : ''
          }`}
          onClick={() => selectStatusFilter('pending_review')}
          aria-pressed={status === 'pending_review'}
        >
          <span className="moderation-summary-icon">◷</span>
          <span className="moderation-summary-label">Pending review</span>
          <strong>{loading ? '—' : pageCounts.pending}</strong>
          <small>Click to review submissions</small>
        </button>

        <button
          type="button"
          className={`moderation-summary-card moderation-summary-published ${
            status === 'published' ? 'is-selected' : ''
          }`}
          onClick={() => selectStatusFilter('published')}
          aria-pressed={status === 'published'}
        >
          <span className="moderation-summary-icon">✓</span>
          <span className="moderation-summary-label">Published</span>
          <strong>{loading ? '—' : pageCounts.published}</strong>
          <small>View published listings</small>
        </button>

        <button
          type="button"
          className={`moderation-summary-card moderation-summary-suspended ${
            status === 'suspended' ? 'is-selected' : ''
          }`}
          onClick={() => selectStatusFilter('suspended')}
          aria-pressed={status === 'suspended'}
        >
          <span className="moderation-summary-icon">⊘</span>
          <span className="moderation-summary-label">Suspended</span>
          <strong>{loading ? '—' : pageCounts.suspended}</strong>
          <small>View suspended listings</small>
        </button>
      </div>

            {/* PRIORITY REVIEW QUEUE */}
      <section className="moderation-queue-panel">
        <div className="moderation-queue-heading">
          <div>
            <span className="admin-kicker">PRIORITY WORKSPACE</span>
            <h3>
              <span aria-hidden="true">◷</span> Review Queue
            </h3>
            <p>
              Regular listings awaiting your moderation decision.
            </p>
          </div>

          <div className="moderation-queue-counter">
            <strong>{reviewQueueLoading ? '—' : reviewQueueTotal}</strong>
            <span>Awaiting review</span>
          </div>
        </div>

        {reviewQueueError && (
          <div className="admin-message admin-error" role="alert">
            {reviewQueueError}
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => void loadReviewQueue()}
              disabled={reviewQueueLoading}
            >
              Retry
            </button>
          </div>
        )}

        {reviewQueueLoading && (
          <div className="moderation-queue-loading" role="status">
            Loading priority submissions…
          </div>
        )}

        {!reviewQueueLoading &&
          !reviewQueueError &&
          reviewQueue.length === 0 && (
            <div className="moderation-queue-empty">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>All caught up!</strong>
                <p>
                  There are currently no regular listings awaiting review.
                </p>
              </div>
            </div>
          )}

        {!reviewQueueLoading &&
          !reviewQueueError &&
          reviewQueue.length > 0 && (
            <>
              <div className="moderation-queue-list">
                {reviewQueue.map((listing) => (
                  <article
                    className="moderation-queue-item"
                    key={listing.id}
                  >
                    <div className="moderation-queue-item-info">
                      <div className="moderation-queue-item-title">
                        <span aria-hidden="true">
                          {listing.icon || '◇'}
                        </span>
                        <strong>{listing.title}</strong>
                      </div>

                      <span className="moderation-queue-item-key">
                        {listing.listingKey}
                      </span>

                      <div className="moderation-queue-item-meta">
                        <span>
                          {listing.category || 'Uncategorised'}
                        </span>
                        <span>{listing.location || 'Location not specified'}</span>
                        <span>{formatDate(listing.createdAt)}</span>
                      </div>
                    </div>

                    <div className="moderation-queue-item-actions">
                      {renderActions(listing)}
                    </div>
                  </article>
                ))}
              </div>

              {reviewQueueTotal > reviewQueue.length && (
                <div className="moderation-queue-footer">
                  <span>
                    Showing {reviewQueue.length} of {reviewQueueTotal}{' '}
                    pending submissions
                  </span>

                  <button
                    type="button"
                    className="admin-secondary-button"
                    onClick={() => selectStatusFilter('pending_review')}
                  >
                    View all pending listings →
                  </button>
                </div>
              )}
            </>
          )}

        {!reviewQueueLoading &&
          !reviewQueueError &&
          reviewQueueTotal > 0 &&
          reviewQueueTotal <= reviewQueue.length && (
            <div className="moderation-queue-footer">
              <span>
                All {reviewQueueTotal} pending submissions are shown above.
              </span>

              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => selectStatusFilter('pending_review')}
              >
                Open review directory →
              </button>
            </div>
          )}
      </section>

      <section className="moderation-filter-panel">
        <div className="moderation-filter-heading">
          <div>
            <span className="admin-kicker">LISTING DIRECTORY</span>
            <h3>Find and manage listings</h3>
          </div>

          <span className="moderation-filter-count">
            {loading ? 'Loading…' : `${total.toLocaleString()} results`}
          </span>
        </div>

        <form className="moderation-filter-form" onSubmit={applyFilters}>
          <label className="moderation-filter-search">
            <span>Search listings</span>
            <div className="moderation-search-input">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, listing key or location"
                maxLength={100}
              />
            </div>
          </label>

          <label className="moderation-filter-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as StatusFilter)
              }
            >
              {statuses.map((item) => (
                <option value={item} key={item}>
                  {item === 'all' ? 'All statuses' : formatLabel(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="moderation-filter-field">
            <span>Listing type</span>
            <select
              value={demo}
              onChange={(event) =>
                setDemo(event.target.value as DemoFilter)
              }
            >
              <option value="all">All listings</option>
              <option value="false">Regular listings</option>
              <option value="true">Demonstration listings</option>
            </select>
          </label>

          <div className="moderation-filter-buttons">
            <button
              type="submit"
              className="admin-primary-button"
              disabled={loading}
            >
              Apply filters
            </button>

            <button
              type="button"
              className="admin-secondary-button"
              onClick={resetFilters}
              disabled={loading}
            >
              Reset
            </button>
          </div>
        </form>
      </section>

      {error && (
        <div className="admin-message admin-error" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="moderation-loading-list" role="status">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="moderation-skeleton-card" key={index}>
              <div className="moderation-skeleton-line moderation-skeleton-wide" />
              <div className="moderation-skeleton-line" />
              <div className="moderation-skeleton-line moderation-skeleton-short" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="moderation-empty-state">
          <span aria-hidden="true">⌕</span>
          <h3>No listings found</h3>
          <p>
            Try another search term or change the selected filters.
          </p>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={resetFilters}
          >
            Clear filters
          </button>
        </div>
      )}

      {!loading && !error && listings.length > 0 && (
        <div className="moderation-results">
          <div className="moderation-results-heading">
            <div>
              <h3>Marketplace listings</h3>
              <p>
                Showing {offset + 1}–
                {Math.min(offset + listings.length, total)} of {total}
              </p>
            </div>

            <span className="moderation-results-page">
              Page {Math.floor(offset / PAGE_SIZE) + 1}
            </span>
          </div>

          <div className="moderation-listing-grid">
            {listings.map(renderListingCard)}
          </div>

          <div className="moderation-pagination">
            <span>
              {total.toLocaleString()} matching listing
              {total === 1 ? '' : 's'}
            </span>

            <div>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() =>
                  void loadListings(
                    search.trim(),
                    status,
                    demo,
                    Math.max(0, offset - PAGE_SIZE),
                  )
                }
                disabled={loading || offset === 0}
              >
                ← Previous
              </button>

              <button
                type="button"
                className="admin-secondary-button"
                onClick={() =>
                  void loadListings(
                    search.trim(),
                    status,
                    demo,
                    offset + PAGE_SIZE,
                  )
                }
                disabled={loading || !hasMore}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {historyListing && (
        <section className="moderation-history-panel">
          <div className="moderation-history-heading">
            <div>
              <span className="admin-kicker">MODERATION AUDIT TRAIL</span>
              <h3>{historyListing.title}</h3>
              <p>Listing key: {historyListing.listingKey}</p>
            </div>

            <button
              type="button"
              className="admin-secondary-button"
              onClick={closeHistory}
              disabled={historyLoading}
            >
              Close history
            </button>
          </div>

          {historyError && (
            <div className="admin-message admin-error" role="alert">
              {historyError}
            </div>
          )}

          {historyLoading && (
            <div className="moderation-history-loading">
              Loading moderation history…
            </div>
          )}

          {!historyLoading && !historyError && history.length === 0 && (
            <div className="moderation-empty-state moderation-history-empty">
              <span aria-hidden="true">▤</span>
              <h3>No moderation history</h3>
              <p>
                No moderation actions have been recorded for this listing.
              </p>
            </div>
          )}

          {!historyLoading && history.length > 0 && (
            <div className="moderation-history-table-wrap">
              <table className="moderation-history-table">
                <thead>
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Previous status</th>
                    <th scope="col">New status</th>
                    <th scope="col">Administrator</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Date and time</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <strong>{formatLabel(entry.action)}</strong>
                      </td>

                      <td>
                        {formatLabel(entry.previousStatus)}
                      </td>

                      <td>
                        {formatLabel(entry.newStatus)}
                      </td>

                      <td>
                        <strong>
                          {entry.actorName || 'Former administrator'}
                        </strong>
                        {entry.actorUserId && (
                          <small>ID: {entry.actorUserId}</small>
                        )}
                      </td>

                      <td>{entry.reason || 'No reason provided'}</td>

                      <td>{formatDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

            {pendingAction && (
        <div
          className="moderation-dialog-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              busyListingId === null
            ) {
              closeActionDialog()
            }
          }}
        >
          <section
            className="moderation-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="moderation-dialog-title"
            aria-describedby="moderation-dialog-description"
          >
            <div className="moderation-dialog-icon">
              {pendingAction.action === 'approve' && '✓'}
              {pendingAction.action === 'publish' && '↑'}
              {pendingAction.action === 'unpublish' && '↓'}
              {pendingAction.action === 'reject' && '!'}
              {pendingAction.action === 'suspend' && '⊘'}
              {pendingAction.action === 'restore' && '↻'}
            </div>

            <span className="admin-kicker">
              LISTING MODERATION CONFIRMATION
            </span>

            <h3 id="moderation-dialog-title">
              {getActionLabel(pendingAction.action)}
            </h3>

            <p id="moderation-dialog-description">
              You are about to{' '}
              <strong>
                {getActionLabel(pendingAction.action).toLowerCase()}
              </strong>{' '}
              the following listing:
            </p>

            <div className="moderation-dialog-listing">
              <strong>{pendingAction.listing.title}</strong>
              <span>{pendingAction.listing.listingKey}</span>
              <span className={getStatusClass(pendingAction.listing.status)}>
                {formatLabel(pendingAction.listing.status)}
              </span>
            </div>

            {(pendingAction.action === 'reject' ||
              pendingAction.action === 'suspend') && (
              <label className="moderation-dialog-reason">
                <span>
                  Reason <strong>Required</strong>
                </span>

                <textarea
                  value={actionReason}
                  onChange={(event) => {
                    setActionReason(event.target.value)
                    setActionDialogError('')
                  }}
                  placeholder={
                    pendingAction.action === 'reject'
                      ? 'Explain why this listing is being rejected...'
                      : 'Explain why this listing is being suspended...'
                  }
                  rows={4}
                  maxLength={1000}
                  disabled={busyListingId !== null}
                  autoFocus
                />

                <small>{actionReason.length}/1000 characters</small>
              </label>
            )}

            {pendingAction.action === 'publish' && (
              <p className="moderation-dialog-note">
                This listing will become visible on the public marketplace.
              </p>
            )}

            {pendingAction.action === 'unpublish' && (
              <p className="moderation-dialog-note">
                This listing will be removed from public marketplace
                visibility and returned to approved status.
              </p>
            )}

            {pendingAction.action === 'suspend' && (
              <p className="moderation-dialog-warning">
                The listing will be suspended and removed from public
                visibility.
              </p>
            )}

            {pendingAction.action === 'reject' && (
              <p className="moderation-dialog-warning">
                The listing will be marked as rejected. This action will be
                recorded in the moderation history.
              </p>
            )}

            {actionDialogError && (
              <div className="admin-message admin-error" role="alert">
                {actionDialogError}
              </div>
            )}

            <div className="moderation-dialog-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={closeActionDialog}
                disabled={busyListingId !== null}
              >
                Cancel
              </button>

              <button
                type="button"
                className={
                  pendingAction.action === 'reject' ||
                  pendingAction.action === 'suspend'
                    ? 'moderation-dialog-confirm moderation-dialog-danger'
                    : 'moderation-dialog-confirm'
                }
                onClick={() => void confirmModerationAction()}
                disabled={busyListingId !== null}
              >
                {busyListingId !== null
                  ? 'Processing…'
                  : 'Confirm action'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default AdminListingModeration
