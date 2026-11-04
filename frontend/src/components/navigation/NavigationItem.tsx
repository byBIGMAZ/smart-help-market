import { Link, useLocation } from 'react-router-dom'

interface NavigationItemProps {
  to: string
  label: string
  icon: string
  mobile?: boolean
}

export default function NavigationItem({
  to,
  label,
  icon,
  mobile = false,
}: NavigationItemProps) {
  const location = useLocation()

  const isActive =
    to === '/'
      ? location.pathname === '/'
      : location.pathname === to ||
        location.pathname.startsWith(`${to}/`)

  return (
    <Link
      to={to}
      className={[
        'navigation-item',
        mobile ? 'navigation-item-mobile' : '',
        isActive ? 'navigation-item-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      title={mobile ? label : undefined}
    >
      <span className="navigation-item-icon" aria-hidden="true">
        {icon}
      </span>

      <span className="navigation-item-label">
        {label}
      </span>
    </Link>
  )
}