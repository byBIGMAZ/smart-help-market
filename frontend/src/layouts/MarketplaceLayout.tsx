
import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import DesktopSidebar from '../components/navigation/DesktopSidebar'
import TopHeader from '../components/navigation/TopHeader'
import MobileBottomNav from '../components/navigation/MobileBottomNav'
import AmbientExperience from '../components/experience/AmbientExperience'
import QuickNavigationOrb from '../components/navigation/QuickNavigationOrb'

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
  const { pathname } = useLocation()\n  const [platformName, setPlatformName] = useState(
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

        <div className="marketplace-page-content">
          {children}
        </div>
      </div>

      <MobileBottomNav />
      {!['buyer', 'landlord', 'seller', 'provider', 'agent'].includes(pathname.split('/').filter(Boolean)[0] || '') && <QuickNavigationOrb />
    </div>
  )
}
