import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { getMarketplaceUser, type MarketplaceUser } from '../../services/marketplaceAuth'
import { useTheme } from '../../hooks/useTheme'

interface TopHeaderProps {
  platformName: string
}

export default function TopHeader({
  platformName,
}: TopHeaderProps) {
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [user, setUser] = useState<MarketplaceUser | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let active = true

    async function loadHeaderAccount() {
      try {
        const currentUser = await getMarketplaceUser()
        if (!active) return
        setUser(currentUser)

        if (!currentUser) {
          setUnreadCount(0)
          return
        }

        const response = await fetch('/api/notifications/unread-count', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })

        if (!response.ok) return
        const data: unknown = await response.json()
        if (
          active &&
          typeof data === 'object' &&
          data !== null &&
          'unreadCount' in data &&
          typeof data.unreadCount === 'number'
        ) {
          setUnreadCount(data.unreadCount)
        }
      } catch {
        if (active) setUnreadCount(0)
      }
    }

    void loadHeaderAccount()

    const refreshTimer = window.setInterval(() => {
      void loadHeaderAccount()
    }, 30000)

    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') {
        void loadHeaderAccount()
      }
    }

    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      active = false
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [])

  const routeRole = pathname.split('/').filter(Boolean)[0]
  const validRoles = ['buyer', 'landlord', 'seller', 'provider', 'agent']
  const accountRole = validRoles.includes(routeRole)
    ? routeRole
    : (user?.roles?.[0] || 'buyer')
  const notificationsPath = user ? `/${accountRole}/notifications` : '/login'

  function openMarketplaceSearch() {
    navigate('/explore')
  }

  return (
    <header className="marketplace-top-header">
      <div className="top-header-title">
        <span className="top-header-eyebrow">
          MARKETPLACE
        </span>

        <h1>{platformName}</h1>
      </div>

      <div className="top-header-actions">
        {user ? (
          <>
            <Link
              className="top-header-account-link"
              to={notificationsPath}
              aria-label={`Notifications, ${unreadCount} unread`}
              title="Marketplace notifications"
            >
              <span className="marketplace-notification-bell" aria-hidden="true">♧</span>
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="marketplace-notification-count">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <Link
              className="top-header-account-link top-header-account-primary top-header-profile-link"
              to={`/${accountRole}/account`}
            >
              <span className="top-header-avatar" aria-hidden="true">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" />
                ) : (
                  (user.displayName?.trim().charAt(0) || 'A').toUpperCase()
                )}
              </span>
              <span>{user.displayName || 'My account'}</span>
            </Link>
          </>
        ) : (
          <>
            <Link className="top-header-account-link" to="/login">
              Sign in
            </Link>
            <Link className="top-header-account-link top-header-account-primary" to="/register">
              Join
            </Link>
          </>
        )}
        <button
          type="button"
          className="top-header-search"
          onClick={openMarketplaceSearch}
          aria-label="Go to marketplace search"
          title="Search marketplace"
        >
          <span aria-hidden="true">⌕</span>
          <span>Search</span>
        </button>

        <div
          className="theme-selector"
          role="group"
          aria-label="Appearance preference"
        >
          <button
            type="button"
            className={theme === 'light' ? 'theme-active' : ''}
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
            title="Light theme"
          >
            <span aria-hidden="true">☀</span>
            <span>Light</span>
          </button>

          <button
            type="button"
            className={theme === 'system' ? 'theme-active' : ''}
            aria-pressed={theme === 'system'}
            onClick={() => setTheme('system')}
            title="Use system theme"
          >
            <span aria-hidden="true">◐</span>
            <span>System</span>
          </button>

          <button
            type="button"
            className={theme === 'dark' ? 'theme-active' : ''}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            title="Dark theme"
          >
            <span aria-hidden="true">☾</span>
            <span>Dark</span>
          </button>
        </div>
      </div>
    </header>
  )
}