export type Role = 'buyer' | 'landlord' | 'seller' | 'provider' | 'agent'

export interface WorkspaceLink {
  label: string
  path: string
}

export const workspaces: Record<Role, {
  title: string
  description: string
  links: WorkspaceLink[]
}> = {
  buyer: {
    title: 'Buyer workspace',
    description: 'Discover opportunities, manage enquiries and keep track of your marketplace activity.',
    links: [
      { label: 'Overview', path: '/buyer/dashboard' },
      { label: 'Saved items', path: '/buyer/saved' },
      { label: 'Messages', path: '/buyer/messages' },
      { label: 'Enquiries', path: '/buyer/enquiries' },
      { label: 'Notifications', path: '/buyer/notifications' },
      { label: 'Inspections', path: '/buyer/inspections' },
      { label: 'Transactions', path: '/buyer/transactions' },
      { label: 'Community', path: '/buyer/community' },
      { label: 'Create a community post', path: '/buyer/community/new' },
      { label: 'Roommate matching', path: '/buyer/roommates' },
      { label: 'Account overview', path: '/buyer/account' },
      { label: 'Privacy & preferences', path: '/buyer/privacy-settings' },
      { label: 'My profile', path: '/buyer/profile' },
    ],
  },
  landlord: {
    title: 'Landlord workspace',
    description: 'Manage your properties, available units, tenants and property-related activity.',
    links: [
      { label: 'Overview', path: '/landlord/dashboard' },
      { label: 'Properties', path: '/landlord/properties' },
      { label: 'Add property', path: '/landlord/properties/new' },
      { label: 'Inspections', path: '/landlord/inspections' },
      { label: 'Messages', path: '/landlord/messages' },
      { label: 'Enquiries', path: '/landlord/enquiries' },
      { label: 'Notifications', path: '/landlord/notifications' },
      { label: 'Tenants', path: '/landlord/tenants' },
      { label: 'Rent & renewals', path: '/landlord/rent' },
      { label: 'Complaints', path: '/landlord/complaints' },
      { label: 'Maintenance', path: '/landlord/maintenance' },
      { label: 'Notices & warnings', path: '/landlord/notices' },
      { label: 'Reviews & disputes', path: '/landlord/reviews' },
      { label: 'Neighbourhood community', path: '/landlord/community' },
      { label: 'Account overview', path: '/landlord/account' },
      { label: 'Privacy & preferences', path: '/landlord/privacy-settings' },
      { label: 'My profile', path: '/landlord/profile' },
    ],
  },
  seller: {
    title: 'Seller workspace',
    description: 'Manage your product catalogue, stock, customer orders and sales activity.',
    links: [
      { label: 'Overview', path: '/seller/dashboard' },
      { label: 'Products', path: '/seller/products' },
      { label: 'Add product', path: '/seller/products/new' },
      { label: 'Orders', path: '/seller/orders' },
      { label: 'Messages', path: '/seller/messages' },
      { label: 'Enquiries', path: '/seller/enquiries' },
      { label: 'Notifications', path: '/seller/notifications' },
      { label: 'Inventory', path: '/seller/inventory' },
      { label: 'Neighbourhood community', path: '/seller/community' },
      { label: 'Account overview', path: '/seller/account' },
      { label: 'Privacy & preferences', path: '/seller/privacy-settings' },
      { label: 'My profile', path: '/seller/profile' },
    ],
  },
  provider: {
    title: 'Service provider workspace',
    description: 'Manage your professional services, customer bookings and working availability.',
    links: [
      { label: 'Overview', path: '/provider/dashboard' },
      { label: 'My services', path: '/provider/services' },
      { label: 'Add service', path: '/provider/services/new' },
      { label: 'Bookings', path: '/provider/bookings' },
      { label: 'Messages', path: '/provider/messages' },
      { label: 'Enquiries', path: '/provider/enquiries' },
      { label: 'Notifications', path: '/provider/notifications' },
      { label: 'Availability', path: '/provider/availability' },
      { label: 'Neighbourhood community', path: '/provider/community' },
      { label: 'Account overview', path: '/provider/account' },
      { label: 'Privacy & preferences', path: '/provider/privacy-settings' },
      { label: 'My profile', path: '/provider/profile' },
    ],
  },
  agent: {
    title: 'Agent workspace',
    description: 'Manage property listings, prospective clients, inspections and commission activity.',
    links: [
      { label: 'Overview', path: '/agent/dashboard' },
      { label: 'Listings', path: '/agent/listings' },
      { label: 'Add listing', path: '/agent/listings/new' },
      { label: 'Clients', path: '/agent/clients' },
      { label: 'Messages', path: '/agent/messages' },
      { label: 'Enquiries', path: '/agent/enquiries' },
      { label: 'Notifications', path: '/agent/notifications' },
      { label: 'Inspections', path: '/agent/inspections' },
      { label: 'Commissions', path: '/agent/commissions' },
      { label: 'Earnings', path: '/agent/earnings' },
      { label: 'Neighbourhood community', path: '/agent/community' },
      { label: 'Account overview', path: '/agent/account' },
      { label: 'Privacy & preferences', path: '/agent/privacy-settings' },
      { label: 'My profile', path: '/agent/profile' },
    ],
  },
}
