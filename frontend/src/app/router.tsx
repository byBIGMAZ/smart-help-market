import { createBrowserRouter } from 'react-router-dom'

import App from '../App'
import AdminApp from '../AdminApp'
import MarketplaceLayout from '../layouts/MarketplaceLayout'

import ExplorePage from '../pages/public/ExplorePage'
import CategoriesPage from '../pages/public/CategoriesPage'
import ListingDetailsPage from '../pages/public/ListingDetailsPage'
import NotFoundPage from '../pages/public/NotFoundPage'
import OwnerListingsPage from '../pages/owner/OwnerListingsPage'
import ListingEditorPage from '../pages/owner/ListingEditorPage'
import LoginPage from '../pages/public/LoginPage'
import RegisterPage from '../pages/public/RegisterPage'
import InformationPage from '../pages/public/InformationPage'
import PasswordRecoveryPage from '../pages/public/PasswordRecoveryPage'
import RoleWorkspacePage from '../pages/workspaces/RoleWorkspacePage'
import CommunicationPage from '../pages/communication/CommunicationPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/explore',
    element: (
      <MarketplaceLayout>
        <ExplorePage />
      </MarketplaceLayout>
    ),
  },
  {
    path: '/categories',
    element: (
      <MarketplaceLayout>
        <CategoriesPage />
      </MarketplaceLayout>
    ),
  },
  {
    path: '/listing/:key',
    element: (
      <MarketplaceLayout>
        <ListingDetailsPage />
      </MarketplaceLayout>
    ),
  },
  {
    path: '/login',
    element: (
      <MarketplaceLayout>
        <LoginPage />
      </MarketplaceLayout>
    ),
  },
  {
    path: '/register',
    element: (
      <MarketplaceLayout>
        <RegisterPage />
      </MarketplaceLayout>
    ),
  },
  { path: '/about', element: <MarketplaceLayout><InformationPage /></MarketplaceLayout> },
  { path: '/contact', element: <MarketplaceLayout><InformationPage /></MarketplaceLayout> },
  { path: '/how-it-works', element: <MarketplaceLayout><InformationPage /></MarketplaceLayout> },
  { path: '/help', element: <MarketplaceLayout><InformationPage /></MarketplaceLayout> },
  { path: '/faqs', element: <MarketplaceLayout><InformationPage /></MarketplaceLayout> },
  { path: '/terms', element: <MarketplaceLayout><InformationPage /></MarketplaceLayout> },
  { path: '/privacy', element: <MarketplaceLayout><InformationPage /></MarketplaceLayout> },
  { path: '/forgot-password', element: <MarketplaceLayout><PasswordRecoveryPage /></MarketplaceLayout> },
  { path: '/reset-password', element: <MarketplaceLayout><PasswordRecoveryPage /></MarketplaceLayout> },

  { path: '/buyer/messages', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/buyer/enquiries', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/buyer/notifications', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },

  { path: '/landlord/messages', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/landlord/enquiries', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/landlord/notifications', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },

  { path: '/seller/messages', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/seller/enquiries', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/seller/notifications', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },

  { path: '/provider/messages', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/provider/enquiries', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/provider/notifications', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },

  { path: '/agent/messages', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/agent/enquiries', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },
  { path: '/agent/notifications', element: <MarketplaceLayout><CommunicationPage /></MarketplaceLayout> },

  { path: '/landlord/properties/new', element: <MarketplaceLayout><ListingEditorPage /></MarketplaceLayout> },
  { path: '/seller/products/new', element: <MarketplaceLayout><ListingEditorPage /></MarketplaceLayout> },
  { path: '/provider/services/new', element: <MarketplaceLayout><ListingEditorPage /></MarketplaceLayout> },
  { path: '/agent/listings/new', element: <MarketplaceLayout><ListingEditorPage /></MarketplaceLayout> },

  { path: '/buyer/*', element: <MarketplaceLayout><RoleWorkspacePage /></MarketplaceLayout> },
  { path: '/landlord/*', element: <MarketplaceLayout><RoleWorkspacePage /></MarketplaceLayout> },
  { path: '/seller/*', element: <MarketplaceLayout><RoleWorkspacePage /></MarketplaceLayout> },
  { path: '/provider/*', element: <MarketplaceLayout><RoleWorkspacePage /></MarketplaceLayout> },
  { path: '/agent/*', element: <MarketplaceLayout><RoleWorkspacePage /></MarketplaceLayout> },

  {
    path: '/owner/listings',
    element: (
      <MarketplaceLayout>
        <OwnerListingsPage />
      </MarketplaceLayout>
    ),
  },
  {
    path: '/admin/*',
    element: <AdminApp />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
