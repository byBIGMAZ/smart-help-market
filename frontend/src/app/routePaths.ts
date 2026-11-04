
export const ROUTES = {
  home: '/',
  explore: '/explore',
  categories: '/categories',
  listingDetails: '/listing/:id',

  about: '/about',
  contact: '/contact',
  howItWorks: '/how-it-works',
  help: '/help',
  faqs: '/faqs',
  terms: '/terms',
  privacy: '/privacy',

  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',

  buyer: {
    dashboard: '/buyer/dashboard',
    messages: '/buyer/messages',
    enquiries: '/buyer/enquiries',
    notifications: '/buyer/notifications',
    saved: '/buyer/saved',
    inspections: '/buyer/inspections',
    transactions: '/buyer/transactions',
    profile: '/buyer/profile',
  },

  landlord: {
    dashboard: '/landlord/dashboard',
    messages: '/landlord/messages',
    enquiries: '/landlord/enquiries',
    notifications: '/landlord/notifications',
    properties: '/landlord/properties',
    addProperty: '/landlord/properties/new',
    inspections: '/landlord/inspections',
    tenants: '/landlord/tenants',
    profile: '/landlord/profile',
  },

  seller: {
    dashboard: '/seller/dashboard',
    messages: '/seller/messages',
    enquiries: '/seller/enquiries',
    notifications: '/seller/notifications',
    products: '/seller/products',
    addProduct: '/seller/products/new',
    orders: '/seller/orders',
    inventory: '/seller/inventory',
    profile: '/seller/profile',
  },

  provider: {
    dashboard: '/provider/dashboard',
    messages: '/provider/messages',
    enquiries: '/provider/enquiries',
    notifications: '/provider/notifications',
    services: '/provider/services',
    bookings: '/provider/bookings',
    availability: '/provider/availability',
    profile: '/provider/profile',
  },

  agent: {
    dashboard: '/agent/dashboard',
    messages: '/agent/messages',
    enquiries: '/agent/enquiries',
    notifications: '/agent/notifications',
    listings: '/agent/listings',
    clients: '/agent/clients',
    commissions: '/agent/commissions',
    earnings: '/agent/earnings',
    profile: '/agent/profile',
  },

  admin: '/admin',
} as const
