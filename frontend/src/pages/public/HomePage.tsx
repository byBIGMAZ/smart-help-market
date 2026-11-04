
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EscrowExplainer from '../../components/experience/EscrowExplainer'
import SearchDiscovery from '../../components/experience/SearchDiscovery'
import { getPublicPlatformSettings } from '../../services/platformSettings'
import {
  getPublicCategories,
  type MarketplaceCategory,
} from '../../services/marketplaceCategories'
import {
  getPublicListings,
  type MarketplaceListing,
} from '../../services/marketplaceListings'
import '../../App.css'
import '../../AppSystemTheme.css'

type Category = 'All' | string

const HERO_PROMPTS = [
  'Looking for a place to call home? Start here.',
  'Need a product or a helping hand? We bring options closer.',
  'Have something to offer? Your next customer could be here.',
  'Whatever moves you forward, find it in one place.',
]

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

function App() {
  const [category, setCategory] = useState<Category>('All')
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('')
  const [saved, setSaved] = useState<string[]>([])
  const [heroPromptIndex, setHeroPromptIndex] = useState(0)

  const [platformName, setPlatformName] = useState(
    'SMART HELP MARKET BY BIGMAZ',
  )
  const [currency, setCurrency] = useState('NGN')
  const [locale, setLocale] = useState('en-NG')

  const [marketplaceCategories, setMarketplaceCategories] = useState<
    MarketplaceCategory[]
  >([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [listingsLoading, setListingsLoading] = useState(true)
  const [listingsError, setListingsError] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setHeroPromptIndex((current) => (current + 1) % HERO_PROMPTS.length), 4600)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true

    getPublicPlatformSettings()
      .then((settings) => {
        if (active) {
          setPlatformName(settings['platform.name'])
          setCurrency(settings['platform.currency'])
          setLocale(settings['platform.locale'])
        }
      })
      .catch((error: unknown) => {
        console.error('Unable to apply platform settings:', error)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    getPublicCategories()
      .then((items) => {
        if (!active) return

        setMarketplaceCategories(items)

        setCategory((current) => {
          if (
            current !== 'All' &&
            !items.some((item) => item.key === current)
          ) {
            return 'All'
          }

          return current
        })
      })
      .catch((error: unknown) => {
        console.error('Unable to apply marketplace categories:', error)
      })
      .finally(() => {
        if (active) {
          setCategoriesLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    getPublicListings()
      .then((items) => {
        if (active) {
          setListings(items)
          setListingsError('')
        }
      })
      .catch((error: unknown) => {
        console.error('Unable to load marketplace listings:', error)

        if (active) {
          setListings([])
          setListingsError(
            'Listings are temporarily unavailable. Please try again.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setListingsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const categories: { key: Category; name: string }[] = [
    { key: 'All', name: 'All' },
    ...marketplaceCategories.map((item) => ({
      key: item.key,
      name: item.name,
    })),
  ]

  const filteredListings = useMemo(() => {
    const query = search.trim().toLowerCase()
    const place = location.trim().toLowerCase()

    return listings.filter((listing) => {
      const matchesCategory =
        category === 'All' || listing.categoryKey === category

      const matchesSearch =
        !query ||
        `${listing.title} ${listing.description} ${listing.category} ${listing.tag}`
          .toLowerCase()
          .includes(query)

      const matchesLocation =
        !place || listing.location.toLowerCase().includes(place)

      return matchesCategory && matchesSearch && matchesLocation
    })
  }, [listings, category, search, location])

  function toggleSaved(id: string) {
    setSaved((current) =>
      current.includes(id)
        ? current.filter((savedId) => savedId !== id)
        : [...current, id],
    )
  }


  return (
    <main className="marketplace">
      <header className="site-header">
        <a
          className="brand"
          href="#home"
          aria-label={`${platformName} home`}
        >
          <span className="brand-mark">SH</span>
          <span className="brand-copy">
            <strong>{platformName.replace(/\s+BY\s+BIGMAZ$/i, '')}</strong>
            <small>BY BIGMAZ</small>
          </span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          <a href="#discover">Explore</a>
          <a href="#categories">Categories</a>
          <a href="#how-it-works">How it works</a>
        </nav>

        <div className="header-actions">
          <Link className="button button-quiet" to="/login">
            Log in
          </Link>

          <Link className="button button-primary" to="/register?type=landlord">
            + Start Listing
          </Link>
        </div>
      </header>

      <section className="hero" id="home">
        <div className="hero-content shm-animate-rise">
          <span className="eyebrow">
            <span className="status-dot" />
            YOUR NEEDS, ONE MARKETPLACE
          </span>

          <h1>
            Find what you need.
            <br />
            <span className="shm-hero-voice">Get help. Move forward.</span>
          </h1>

          <p>
            Discover properties, shop for everyday essentials, and find
            trusted services, all in one place.
          </p>

          <div className="shm-hero-prompt" key={heroPromptIndex} aria-live="polite"><i /> {HERO_PROMPTS[heroPromptIndex]}</div>

          <div className="hero-stats">
            <div>
              <strong>01</strong>
              <span>One marketplace</span>
            </div>
            <div>
              <strong>
                {marketplaceCategories.length.toString().padStart(2, '0')}
              </strong>
              <span>Main categories</span>
            </div>
            <div>
              <strong>NG</strong>
              <span>Made for Nigeria</span>
            </div>
          </div>
        </div>

        <div className="hero-art shm-animate-scale" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />

          <div className="art-card art-card-main">
            <span className="art-icon">⌂</span>
            <span className="art-label">PROPERTY</span>
            <strong>Find your next space</strong>
          </div>

          <div className="art-card art-card-float">
            <span className="art-icon">✦</span>
            <span className="art-label">SERVICES</span>
            <strong>Help is closer</strong>
          </div>

          <div className="art-spark spark-one">✦</div>
          <div className="art-spark spark-two">✧</div>
        </div>
      </section>

      <section className="search-section" aria-label="Search marketplace">
        <div className="search-heading">
          <div>
            <span className="section-kicker">START EXPLORING</span>
            <h2>What are you looking for?</h2>
          </div>
          <span className="search-hint">Search across the marketplace</span>
        </div>

        <SearchDiscovery
          search={search}
          location={location}
          onSearchChange={setSearch}
          onLocationChange={setLocation}
          onSubmit={() => {
            document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' })
          }}
        />
      </section>

      <section className="categories-section" id="categories">
        <div className="section-heading">
          <div>
            <span className="section-kicker">EXPLORE YOUR OPTIONS</span>
            <h2>One place. Many possibilities.</h2>
          </div>
          <p>Choose a category and find your next opportunity.</p>
        </div>

        {categoriesLoading && (
          <p className="search-hint" role="status">
            Loading marketplace categories…
          </p>
        )}

        <div className="category-grid shm-stagger">
          {marketplaceCategories.map((item) => (
            <button
              key={item.key}
              className={`category-card category-${item.key} ${
                category === item.key ? 'category-selected' : ''
              }`}
              onClick={() => setCategory(item.key)}
            >
              <span className="category-icon">
                {getCategoryIcon(item.key)}
              </span>

              <span className="category-card-copy">
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </span>

              <span className="category-arrow">↗</span>
            </button>
          ))}
        </div>
      </section>

      <section className="listings-section" id="discover">
        <div className="section-heading listings-heading">
          <div>
            <span className="section-kicker">DISCOVER THE MARKETPLACE</span>
            <h2>Explore listings</h2>
          </div>

          <span className="results-count shm-result-count">
            {listingsLoading
              ? 'Loading listings…'
              : `${filteredListings.length} ${
                  filteredListings.length === 1 ? 'listing' : 'listings'
                }`}
          </span>
        </div>

        <div className="filter-tabs" role="group" aria-label="Listing category">
          {categories.map((item) => (
            <button
              key={item.key}
              className={category === item.key ? 'filter-active' : ''}
              onClick={() => setCategory(item.key)}
            >
              {item.name}
            </button>
          ))}
        </div>

        {listingsLoading && (
          <div className="empty-state" role="status">
            <span>⌕</span>
            <h3>Loading marketplace listings</h3>
            <p>Please wait while we retrieve listings from the marketplace.</p>
          </div>
        )}

        {!listingsLoading && listingsError && (
          <div className="empty-state" role="alert">
            <span>!</span>
            <h3>Unable to load listings</h3>
            <p>{listingsError}</p>
            <button
              className="button button-primary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        )}

        {!listingsLoading && !listingsError && (
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
                    <span className="listing-emoji" aria-hidden="true">
                      {listing.icon}
                    </span>

                    <span className="listing-tag">{listing.tag}</span>

                    <button
                      className={`save-button ${
                        saved.includes(listing.id) ? 'is-saved' : ''
                      }`}
                      style={{ position: 'relative', zIndex: 2 }}
                      aria-label={
                        saved.includes(listing.id)
                          ? 'Remove from favourites'
                          : 'Save to favourites'
                      }
                      aria-pressed={saved.includes(listing.id)}
                      onClick={() => toggleSaved(listing.id)}
                    >
                      {saved.includes(listing.id) ? '♥' : '♡'}
                    </button>

                    {listing.isDemo && (
                      <span className="sample-label">DEMO LISTING</span>
                    )}
                  </div>

                  <div className="listing-content">
                    <span className="listing-category">
                      {listing.category}
                    </span>
                    <h3>{listing.title}</h3>
                    <p>{listing.description}</p>

                    <div className="listing-location">
                      <span aria-hidden="true">⌖</span> {listing.location}
                    </div>

                    <div className="listing-footer">
                      <div>
                        <strong>
                          {formatCurrency(listing.price, currency, locale)}
                        </strong>
                        <span>{listing.priceUnit}</span>
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
                  Try another search term or clear your location filter.
                </p>

                <button
                  className="button button-primary"
                  onClick={() => {
                    setSearch('')
                    setLocation('')
                    setCategory('All')
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}

            {listings.length > 0 && listings.every((item) => item.isDemo) && (
              <p className="demo-disclaimer">
                These are demonstration listings for development only. They
                are not verified offers, and no transactions can be made from
                this page.
              </p>
            )}
          </>
        )}
      </section>

      <section className="how-section" id="how-it-works">
        <div className="section-heading">
          <div>
            <span className="section-kicker">SIMPLE BY DESIGN</span>
            <h2>A smarter way to get things done.</h2>
          </div>
        </div>

        <div className="shm-how-journey">
          <article className="shm-how-card"><div className="shm-how-visual"><span className="shm-how-orbit" /><span className="shm-how-object">🔎</span></div><span className="step-number">01</span><h3>Discover what you need</h3><p>Explore homes, products and trusted services from one marketplace.</p></article>
          <article className="shm-how-card"><div className="shm-how-visual"><span className="shm-how-orbit" /><span className="shm-how-object">🧭</span></div><span className="step-number">02</span><h3>Compare and connect</h3><p>Review details, compare your options and contact the right person.</p></article>
          <article className="shm-how-card"><div className="shm-how-visual"><span className="shm-how-orbit" /><span className="shm-how-object">🤝</span></div><span className="step-number">03</span><h3>Move forward with confidence</h3><p>Follow the agreed steps and use available transaction protections where supported.</p></article>
        </div>
      </section>

      <EscrowExplainer />

      <section className="cta-section">
        <div>
          <span className="section-kicker">HAVE SOMETHING TO OFFER?</span>
          <h2>Bring your next opportunity to the market.</h2>
          <p>
            Landlords, sellers and service providers will be able to apply to
            list.
          </p>
        </div>

        <Link
          className="button button-light"
          to="/register?type=service_provider"
        >
          Become a pro <span aria-hidden="true">→</span>
        </Link>
      </section>

      <footer className="site-footer">
        <Link className="brand footer-brand" to="/">
          <span className="brand-mark">SH</span>
          <span className="brand-copy">
            <strong>{platformName.replace(/\s+BY\s+BIGMAZ$/i, '')}</strong>
            <small>BY BIGMAZ</small>
          </span>
        </Link>

        <p>Properties, products and services in one place.</p>

        <span>
          © {new Date().getFullYear()} {platformName}
        </span>
      </footer>
    </main>
  )
}

export default App
