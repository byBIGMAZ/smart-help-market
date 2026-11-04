import { Link } from 'react-router-dom'
import NavigationItem from './NavigationItem'

interface DesktopSidebarProps {
  platformName: string
}

export default function DesktopSidebar({
  platformName,
}: DesktopSidebarProps) {
  const brandName = platformName.replace(
    /\s+BY\s+BIGMAZ$/i,
    '',
  )

  const navigation = [
    { label: 'Home', icon: '⌂', to: '/' },
    { label: 'Explore', icon: '⌕', to: '/explore' },
    { label: 'Categories', icon: '◇', to: '/categories' },
    { label: 'About us', icon: 'ⓘ', to: '/about' },
    { label: 'How it works', icon: '☷', to: '/how-it-works' },
  ]

  return (
    <aside className="desktop-sidebar">
      <Link
        to="/"
        className="sidebar-brand"
        aria-label={`${platformName} homepage`}
      >
        <span className="sidebar-brand-mark">SH</span>

        <span className="sidebar-brand-copy">
          <strong>{brandName}</strong>
          <small>BY BIGMAZ</small>
        </span>
      </Link>

      <div className="sidebar-section">
        <span className="sidebar-section-label">
          MARKETPLACE
        </span>

        <nav
          className="sidebar-navigation"
          aria-label="Marketplace navigation"
        >
          {navigation.map((item) => (
            <NavigationItem
              key={item.label}
              {...item}
            />
          ))}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <Link to="/help" className="sidebar-help" aria-label="Visit the Help Centre">
          <span className="sidebar-help-icon" aria-hidden="true">
            ?
          </span>

          <span className="sidebar-help-copy">
            <strong>Need assistance?</strong>
            <span>Visit our Help Centre.</span>
          </span>
          <span className="sidebar-help-arrow" aria-hidden="true">→</span>
        </Link>

        <span className="sidebar-version">
          Marketplace by BIGMAZ
        </span>
      </div>
    </aside>
  )
}