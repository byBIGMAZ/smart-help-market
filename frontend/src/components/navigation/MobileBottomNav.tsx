import { useEffect, useState } from 'react'
import { getMarketplaceUser, type MarketplaceUser } from '../../services/marketplaceAuth'
import { useLocation } from 'react-router-dom'
import NavigationItem from './NavigationItem'

export default function MobileBottomNav() {
  const { pathname } = useLocation()
  const [user, setUser] = useState<MarketplaceUser | null>(null)

  useEffect(() => {
    let active = true
    getMarketplaceUser()
      .then((result) => {
        if (active) setUser(result)
      })
      .catch(() => {
        if (active) setUser(null)
      })
    return () => {
      active = false
    }
  }, [])

  const validRoles = ['buyer', 'landlord', 'seller', 'provider', 'agent']
  const routeRole = pathname.split('/').filter(Boolean)[0]
  const accountRole = validRoles.includes(routeRole)
    ? routeRole
    : (user?.roles?.[0] || 'buyer')

  const navigation = [
    { label: 'Home', icon: '⌂', to: '/' },
    { label: 'Explore', icon: '⌕', to: '/explore' },
    { label: 'Categories', icon: '◇', to: '/categories' },
    { label: 'Notifications', icon: '🔔', to: user ? `/${accountRole}/notifications` : '/login' },
    {
      label: 'Dashboard',
      icon: user?.avatarUrl ? (
        <img className="mobile-account-avatar-image" src={user.avatarUrl} alt="" />
      ) : (
        <span className="mobile-account-avatar-placeholder" aria-hidden="true">♙</span>
      ),
      to: user ? `/${accountRole}/dashboard` : '/login',
    },
  ]

  return (
    <nav
      className="mobile-bottom-nav"
      aria-label="Mobile marketplace navigation"
    >
      {navigation.map((item) => (
        <NavigationItem
          key={item.label}
          to={item.to}
          label={item.label}
          icon={item.icon}
          mobile
        />
      ))}
    </nav>
  )
}