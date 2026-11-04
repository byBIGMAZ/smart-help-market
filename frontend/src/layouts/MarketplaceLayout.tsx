
import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import DesktopSidebar from '../components/navigation/DesktopSidebar'
import TopHeader from '../components/navigation/TopHeader'
import MobileBottomNav from '../components/navigation/MobileBottomNav'
import AmbientExperience from '../components/experience/AmbientExperience'
import QuickNavigationOrb from '../components/navigation/QuickNavigationOrb'
import WorkspaceFloatingSidebar from '../components/navigation/WorkspaceFloatingSidebar'
import { workspaces, type Role } from '../pages/workspaces/workspaceNavigation'

import { getPublicPlatformSettings } from '../services/platformSettings'

import '../styles/marketplace-layout.css'
import '../styles/navigation-polish.css'

interface MarketplaceLayoutProps {
  children: ReactNode
}

const DEFAULT_PLATFORM_NAME = 'SMART HELP MARKET BY BIGMAZ'

export default function MarketplaceLayout({
  children,
}: MarketplaceLayoutProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const routeRole = pathname.split('/').filter(Boolean)[0]
  const isOwnerWorkspaceRoute = pathname.startsWith('/owner/')
  const isWorkspaceRoute = ['buyer', 'landlord', 'seller', 'provider', 'agent'].includes(routeRole || '')
  const workspaceRole = (isWorkspaceRoute ? routeRole : isOwnerWorkspaceRoute ? 'landlord' : null) as Role | null
  const workspaceLinks = workspaceRole
    ? [...workspaces[workspaceRole].links, ...(workspaceRole === 'landlord' ? [{ label: 'My Listings', path: '/owner/listings' }] : [])]
    : []
  const isWorkspaceOverview = workspaceRole ? pathname === `/${workspaceRole}/dashboard` || pathname === `/${workspaceRole}` : false
  const [platformName, setPlatformName] = useState(
    DEFAULT_PLATFORM_NAME,
  )

  useEffect(() => {
    let active = true

    getPublicPlatformSettings()
      .then((settings) => {
        if (active && settings['platform.name']) {
          setPlatformName(settings['platform.name'])
        }
      })
      .catch((error: unknown) => {
        console.error(
          'Unable to load marketplace branding:',
          error,
        )
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="marketplace-shell">
      <AmbientExperience />
      <DesktopSidebar platformName={platformName} />

      <div className="marketplace-workspace">
        <TopHeader platformName={platformName} />

        {workspaceRole && (
          <>
            <nav className="workspace-route-controls" aria-label="Dashboard page controls">
              <button
                type="button"
                className="workspace-route-back"
                onClick={() => {
                  if (window.history.length > 1) navigate(-1)
                  else navigate(`/${workspaceRole}/dashboard`)
                }}
                aria-label="Go back to the previous page"
                title="Go back"
              >
                <span aria-hidden="true">←</span>
                <span>Back</span>
              </button>
              {!isWorkspaceOverview && (
                <Link
                  className="workspace-route-dashboard"
                  to={`/${workspaceRole}/dashboard`}
                  aria-label="Go to dashboard overview"
                  title="Go to dashboard"
                >
                  <span aria-hidden="true">⌂</span>
                  <span>Dashboard</span>
                </Link>
              )}
            </nav>
            <WorkspaceFloatingSidebar links={workspaceLinks} />
          </>
        )}

        <div className="marketplace-page-content">
          {children}
        </div>
      </div>

      <MobileBottomNav />
      {!['buyer', 'landlord', 'seller', 'provider', 'agent'].includes(pathname.split('/').filter(Boolean)[0] || '') && <QuickNavigationOrb />}
    </div>
  )
}
