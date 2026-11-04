import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'

const App = lazy(() => import('../App'))
const AdminApp = lazy(() => import('../AdminApp'))
const MarketplaceLayout = lazy(() => import('../layouts/MarketplaceLayout'))
const ExplorePage = lazy(() => import('../pages/public/ExplorePage'))
const CategoriesPage = lazy(() => import('../pages/public/CategoriesPage'))
const ListingDetailsPage = lazy(() => import('../pages/public/ListingDetailsPage'))
const NotFoundPage = lazy(() => import('../pages/public/NotFoundPage'))
const OwnerListingsPage = lazy(() => import('../pages/owner/OwnerListingsPage'))
const ListingEditorPage = lazy(() => import('../pages/owner/ListingEditorPage'))
const LoginPage = lazy(() => import('../pages/public/LoginPage'))
const RegisterPage = lazy(() => import('../pages/public/RegisterPage'))
const InformationPage = lazy(() => import('../pages/public/InformationPage'))
const EscrowProPage = lazy(() => import('../pages/public/EscrowProPage'))
const PasswordRecoveryPage = lazy(() => import('../pages/public/PasswordRecoveryPage'))
const RoleWorkspacePage = lazy(() => import('../pages/workspaces/RoleWorkspacePage'))
const CommunicationPage = lazy(() => import('../pages/communication/CommunicationPage'))

function RouteLoading() {
  return (
    <main className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-mark">SH</span>
      <p>Loading SMART HELP MARKET...</p>
    </main>
  )
}

function routeElement(element: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>
}

function marketplacePage(element: ReactNode) {
  return routeElement(
    <MarketplaceLayout>{element}</MarketplaceLayout>,
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: routeElement(<App />),
  },
  {
    path: '/explore',
    element: marketplacePage(<ExplorePage />),
  },
  {
    path: '/categories',
    element: marketplacePage(<CategoriesPage />),
  },
  {
    path: '/listing/:key',
    element: marketplacePage(<ListingDetailsPage />),
  },
  {
    path: '/login',
    element: marketplacePage(<LoginPage />),
  },
  {
    path: '/register',
    element: marketplacePage(<RegisterPage />),
  },
  { path: '/about', element: marketplacePage(<InformationPage />) },
  { path: '/contact', element: marketplacePage(<InformationPage />) },
  { path: '/how-it-works', element: marketplacePage(<InformationPage />) },
  { path: '/escrow-pro', element: marketplacePage(<EscrowProPage />) },
  { path: '/help', element: marketplacePage(<InformationPage />) },
  { path: '/faqs', element: marketplacePage(<InformationPage />) },
  { path: '/terms', element: marketplacePage(<InformationPage />) },
  { path: '/privacy', element: marketplacePage(<InformationPage />) },
  { path: '/forgot-password', element: marketplacePage(<PasswordRecoveryPage />) },
  { path: '/reset-password', element: marketplacePage(<PasswordRecoveryPage />) },

  { path: '/buyer/messages', element: marketplacePage(<CommunicationPage />) },
  { path: '/buyer/enquiries', element: marketplacePage(<CommunicationPage />) },
  { path: '/buyer/notifications', element: marketplacePage(<CommunicationPage />) },

  { path: '/landlord/messages', element: marketplacePage(<CommunicationPage />) },
  { path: '/landlord/enquiries', element: marketplacePage(<CommunicationPage />) },
  { path: '/landlord/notifications', element: marketplacePage(<CommunicationPage />) },

  { path: '/seller/messages', element: marketplacePage(<CommunicationPage />) },
  { path: '/seller/enquiries', element: marketplacePage(<CommunicationPage />) },
  { path: '/seller/notifications', element: marketplacePage(<CommunicationPage />) },

  { path: '/provider/messages', element: marketplacePage(<CommunicationPage />) },
  { path: '/provider/enquiries', element: marketplacePage(<CommunicationPage />) },
  { path: '/provider/notifications', element: marketplacePage(<CommunicationPage />) },

  { path: '/agent/messages', element: marketplacePage(<CommunicationPage />) },
  { path: '/agent/enquiries', element: marketplacePage(<CommunicationPage />) },
  { path: '/agent/notifications', element: marketplacePage(<CommunicationPage />) },

  { path: '/landlord/properties/new', element: marketplacePage(<ListingEditorPage />) },
  { path: '/seller/products/new', element: marketplacePage(<ListingEditorPage />) },
  { path: '/provider/services/new', element: marketplacePage(<ListingEditorPage />) },
  { path: '/agent/listings/new', element: marketplacePage(<ListingEditorPage />) },

  { path: '/buyer/*', element: marketplacePage(<RoleWorkspacePage />) },
  { path: '/landlord/*', element: marketplacePage(<RoleWorkspacePage />) },
  { path: '/seller/*', element: marketplacePage(<RoleWorkspacePage />) },
  { path: '/provider/*', element: marketplacePage(<RoleWorkspacePage />) },
  { path: '/agent/*', element: marketplacePage(<RoleWorkspacePage />) },

  {
    path: '/owner/listings',
    element: marketplacePage(<OwnerListingsPage />),
  },
  {
    path: '/admin/*',
    element: routeElement(<AdminApp />),
  },
  {
    path: '*',
    element: marketplacePage(<NotFoundPage />),
  },
])
