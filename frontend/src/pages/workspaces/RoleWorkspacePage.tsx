import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getMarketplaceUser, marketplaceLogout, type MarketplaceUser } from '../../services/marketplaceAuth'
import '../../styles/extended-pages.css'
import ProfilePhotoSlideshow from '../../components/profile/ProfilePhotoSlideshow'

type Role = 'buyer' | 'landlord' | 'seller' | 'provider' | 'agent'

interface WorkspaceLink {
  label: string
  path: string
}

interface WorkspaceRecord {
  title: string
  description: string
  status: string
  path?: string
}

interface DashboardStat {
  label: string
  value: string
  caption: string
  icon: string
}

interface DashboardConfig {
  greeting: string
  introduction: string
  stats: DashboardStat[]
  activity: WorkspaceRecord[]
  actions: WorkspaceLink[]
}

const workspaces: Record<Role, {
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

const dashboardConfigs: Record<Role, DashboardConfig> = {
  buyer: {
    greeting: 'Your marketplace activity',
    introduction: 'Keep your favourite discoveries and purchase enquiries organised.',
    stats: [
      { label: 'Saved items', value: '3', caption: 'Items in your collection', icon: '♡' },
      { label: 'Open enquiries', value: '2', caption: 'Awaiting a response', icon: '✉' },
      { label: 'Upcoming inspections', value: '1', caption: 'Sample scheduled activity', icon: '▦' },
      { label: 'Transactions', value: '0', caption: 'No completed transactions', icon: '₦' },
    ],
    activity: [
      { title: 'Student self-contained apartment', description: 'Property saved to your collection.', status: 'Saved' },
      { title: 'HP Core i5 Laptop', description: 'Product saved for later comparison.', status: 'Saved' },
      { title: 'Professional electrical services', description: 'Service added to your discoveries.', status: 'Saved' },
    ],
    actions: [
      { label: 'Explore marketplace', path: '/explore' },
      { label: 'View saved items', path: '/buyer/saved' },
      { label: 'Open messages', path: '/buyer/messages' },
      { label: 'Track transactions', path: '/buyer/transactions' },
      { label: 'Join your neighbourhood', path: '/buyer/community' },
      { label: 'Find a compatible roommate', path: '/buyer/roommates' },
      { label: 'Publish a community post', path: '/buyer/community/new' },
    ],
  },
  landlord: {
    greeting: 'Your property portfolio',
    introduction: 'Monitor your property collection, available units and tenant activity.',
    stats: [
      { label: 'Properties', value: '3', caption: 'Sample portfolio', icon: '⌂' },
      { label: 'Available units', value: '5', caption: 'Ready for enquiries', icon: '▦' },
      { label: 'Occupied units', value: '2', caption: 'Sample occupancy', icon: '✓' },
      { label: 'Pending inspections', value: '1', caption: 'Requires attention', icon: '◷' },
    ],
    activity: [
      { title: 'Self-contained property', description: 'Two units available for inspection.', status: 'Available' },
      { title: 'Two-bedroom apartment', description: 'Property portfolio demonstration.', status: 'Occupied' },
      { title: 'New inspection request', description: 'Review your sample inspection schedule.', status: 'Pending' },
    ],
    actions: [
      { label: 'Add a property', path: '/landlord/properties/new' },
      { label: 'Manage properties', path: '/landlord/properties' },
      { label: 'Review inspections', path: '/landlord/inspections' },
      { label: 'Manage tenants', path: '/landlord/tenants' },
      { label: 'Track rent and renewals', path: '/landlord/rent' },
      { label: 'Resolve complaints', path: '/landlord/complaints' },
      { label: 'Manage maintenance', path: '/landlord/maintenance' },
    ],
  },
  seller: {
    greeting: 'Your sales and inventory',
    introduction: 'Keep your product catalogue, stock levels and orders organised.',
    stats: [
      { label: 'Products', value: '3', caption: 'Sample product catalogue', icon: '▣' },
      { label: 'Active products', value: '3', caption: 'Sample published products', icon: '✓' },
      { label: 'Orders', value: '2', caption: 'Sample customer orders', icon: '▤' },
      { label: 'Low stock alerts', value: '1', caption: 'Review inventory levels', icon: '!' },
    ],
    activity: [
      { title: 'Android smartphone', description: 'Product catalogue demonstration.', status: 'Active' },
      { title: 'HP Core i5 Laptop', description: 'Product catalogue demonstration.', status: 'Active' },
      { title: 'Customer order', description: 'Review the sample order workflow.', status: 'Processing' },
    ],
    actions: [
      { label: 'Add a product', path: '/seller/products/new' },
      { label: 'Manage products', path: '/seller/products' },
      { label: 'Review orders', path: '/seller/orders' },
      { label: 'Check inventory', path: '/seller/inventory' },
    ],
  },
  provider: {
    greeting: 'Your service business',
    introduction: 'Stay organised with your service catalogue, bookings and availability.',
    stats: [
      { label: 'Services', value: '3', caption: 'Sample service offerings', icon: '✦' },
      { label: 'New bookings', value: '2', caption: 'Sample booking requests', icon: '▤' },
      { label: 'Upcoming jobs', value: '1', caption: 'Sample scheduled work', icon: '◷' },
      { label: 'Availability', value: 'Open', caption: 'Demonstration availability', icon: '✓' },
    ],
    activity: [
      { title: 'Electrical installation', description: 'Professional service catalogue entry.', status: 'Active' },
      { title: 'Plumbing services', description: 'Professional service catalogue entry.', status: 'Active' },
      { title: 'Home cleaning request', description: 'Review the sample booking workflow.', status: 'Pending' },
    ],
    actions: [
      { label: 'Add a service', path: '/provider/services/new' },
      { label: 'Manage services', path: '/provider/services' },
      { label: 'Review bookings', path: '/provider/bookings' },
      { label: 'Set availability', path: '/provider/availability' },
    ],
  },
  agent: {
    greeting: 'Your agency overview',
    introduction: 'Track represented properties, prospective clients and commission activity.',
    stats: [
      { label: 'Assigned listings', value: '4', caption: 'Sample represented listings', icon: '⌂' },
      { label: 'Active clients', value: '3', caption: 'Sample client records', icon: '♙' },
      { label: 'Inspections', value: '2', caption: 'Sample inspection activity', icon: '▦' },
      { label: 'Pending commissions', value: '1', caption: 'Sample commission record', icon: '₦' },
    ],
    activity: [
      { title: 'Self-contained apartment', description: 'Sample property representation.', status: 'Active' },
      { title: 'Prospective property client', description: 'Sample client relationship.', status: 'Follow-up' },
      { title: 'Commission record', description: 'Demonstration commission tracking.', status: 'Pending' },
    ],
    actions: [
      { label: 'Add a listing', path: '/agent/listings/new' },
      { label: 'Manage listings', path: '/agent/listings' },
      { label: 'View clients', path: '/agent/clients' },
      { label: 'Track commissions', path: '/agent/commissions' },
    ],
  },
}

const sectionRecords: Record<Role, Record<string, WorkspaceRecord[]>> = {
  buyer: {
    saved: [
      { title: 'Student Self-Contained Apartment', description: 'Property discovery · Nearby', status: 'Saved' },
      { title: 'HP Core i5 Laptop', description: 'Product discovery · Electronics', status: 'Saved' },
      { title: 'Professional Electrical Services', description: 'Service discovery · Home services', status: 'Saved' },
    ],
    messages: [
      { title: 'Property enquiry', description: 'Sample conversation with a property advertiser.', status: 'Preview' },
      { title: 'Product enquiry', description: 'Sample conversation with a product seller.', status: 'Preview' },
    ],
    inspections: [
      { title: 'Apartment inspection', description: 'Sample inspection appointment.', status: 'Scheduled' },
    ],
    transactions: [
      { title: 'No completed transactions', description: 'Your completed marketplace transactions will appear here.', status: 'Empty' },
    ],
  },
  landlord: {
    properties: [
      { title: 'Student Self-Contained Apartment', description: 'Demonstration accommodation listing around Ekosodin, Benin City.', status: 'Available', path: '/listing/student-self-contained-ekosodin' },
      { title: 'Affordable Self-Contained Room', description: 'Demonstration accommodation listing around BDPA, Benin City.', status: 'Available', path: '/listing/self-contained-bdpa-benin' },
      { title: 'Modern Two-Bedroom Apartment', description: 'Demonstration residential apartment in GRA, Benin City.', status: 'Occupied', path: '/listing/two-bedroom-apartment-benin' },
    ],
    inspections: [
      { title: 'Prospective tenant inspection', description: 'Sample inspection request.', status: 'Pending' },
    ],
    tenants: [
      { title: 'Sample tenant record', description: 'Tenant management preview.', status: 'Active' },
      { title: 'Available unit', description: 'No tenant assigned to this sample unit.', status: 'Vacant' },
    ],
  },
  seller: {
    products: [
      { title: 'Android smartphone', description: 'Electronics · Sample product.', status: 'Active' },
      { title: 'HP Core i5 Laptop', description: 'Computers · Sample product.', status: 'Active' },
      { title: 'Living room sofa', description: 'Furniture · Sample product.', status: 'Active' },
    ],
    orders: [
      { title: 'Sample order #SHM-1001', description: 'Order processing demonstration.', status: 'Processing' },
      { title: 'Sample order #SHM-1002', description: 'Order fulfilment demonstration.', status: 'Pending' },
    ],
    inventory: [
      { title: 'Android smartphone', description: 'Sample stock monitoring record.', status: 'In stock' },
      { title: 'HP Core i5 Laptop', description: 'Sample stock monitoring record.', status: 'In stock' },
      { title: 'Living room sofa', description: 'Review sample inventory levels.', status: 'Low stock' },
    ],
  },
  provider: {
    services: [
      { title: 'Electrical installation', description: 'Professional electrical service.', status: 'Active' },
      { title: 'Plumbing services', description: 'Home and commercial plumbing.', status: 'Active' },
      { title: 'Home cleaning', description: 'Residential cleaning service.', status: 'Active' },
    ],
    bookings: [
      { title: 'Electrical repair request', description: 'Sample customer booking.', status: 'Pending' },
      { title: 'Home cleaning appointment', description: 'Sample scheduled booking.', status: 'Confirmed' },
    ],
    availability: [
      { title: 'Weekday availability', description: 'Sample working schedule.', status: 'Available' },
      { title: 'Weekend availability', description: 'Configure your preferred working hours.', status: 'Not configured' },
    ],
  },
  agent: {
    listings: [
      { title: 'Self-contained apartment, Nearby', description: 'Sample represented property.', status: 'Active' },
      { title: 'Two-bedroom apartment, GRA', description: 'Sample represented property.', status: 'Active' },
      { title: 'Land listing, Abuja', description: 'Sample land representation.', status: 'Under review' },
    ],
    clients: [
      { title: 'Prospective student tenant', description: 'Sample client enquiry.', status: 'Follow-up' },
      { title: 'Residential buyer', description: 'Sample buyer relationship.', status: 'Active' },
      { title: 'Property investor', description: 'Sample client relationship.', status: 'New' },
    ],
    inspections: [
      { title: 'Client property inspection', description: 'Sample scheduled property viewing.', status: 'Scheduled' },
      { title: 'Residential inspection report', description: 'Sample property condition review.', status: 'Completed' },
    ],
    commissions: [
      { title: 'Residential property commission', description: 'Sample commission calculation.', status: 'Pending' },
    ],
    earnings: [
      { title: 'Earnings overview', description: 'Your commission and earnings records will appear here.', status: 'Preview' },
    ],
  },
}

const dashboardActivityPaths: Record<Role, string[]> = {
  buyer: ['/buyer/saved', '/buyer/saved', '/explore'],
  landlord: ['/landlord/properties', '/landlord/properties', '/landlord/inspections'],
  seller: ['/seller/products', '/seller/products', '/seller/orders'],
  provider: ['/provider/services', '/provider/services', '/provider/bookings'],
  agent: ['/agent/listings', '/agent/clients', '/agent/commissions'],
}

const dashboardStatPaths: Record<Role, string[]> = {
  buyer: ['/buyer/saved', '/buyer/enquiries', '/buyer/inspections', '/buyer/transactions'],
  landlord: ['/landlord/properties', '/landlord/properties', '/landlord/tenants', '/landlord/inspections'],
  seller: ['/seller/products', '/seller/products', '/seller/orders', '/seller/inventory'],
  provider: ['/provider/services', '/provider/bookings', '/provider/bookings', '/provider/availability'],
  agent: ['/agent/listings', '/agent/clients', '/agent/inspections', '/agent/commissions'],
}

const demoWorkspaces: { role: Role; label: string; path: string }[] = [
  { role: 'buyer', label: 'Buyer', path: '/buyer/dashboard' },
  { role: 'landlord', label: 'Landlord', path: '/landlord/dashboard' },
  { role: 'seller', label: 'Seller', path: '/seller/dashboard' },
  { role: 'provider', label: 'Service Provider', path: '/provider/dashboard' },
  { role: 'agent', label: 'Agent', path: '/agent/dashboard' },
]


function AccountOverview({ role, user }: { role: Role; user: MarketplaceUser | null }) {
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || 'Welcome'
  const links = [
    { title: 'Personal profile', description: 'Update your name, biography and public-facing details.', path: `/${role}/profile`, icon: '♙' },
    { title: 'Privacy centre', description: 'Choose what other members can discover about you.', path: `/${role}/privacy-settings`, icon: '◈' },
    { title: 'Messages and alerts', description: 'Review your conversations and marketplace notifications.', path: `/${role}/notifications`, icon: '✉' },
    { title: 'Account activity', description: 'Review your saved items, enquiries and recent activity.', path: `/${role}/dashboard`, icon: '▤' },
  ]

  return (
    <div className="smart-feature-page">
      <section className="smart-account-hero">
        <span className="smart-account-avatar">
          {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : (user?.displayName?.trim().charAt(0) || role.charAt(0)).toUpperCase()}
        </span>
        <div>
          <span className="extended-kicker">YOUR MARKETPLACE IDENTITY</span>
          <h3>{firstName}'s account</h3>
          <p>{user?.email || 'Your account details and personal marketplace tools.'}</p>
          <span className="smart-account-role">{role.replace('-', ' ')} account</span>
        </div>
      </section>
      <div className="smart-feature-grid">
        {links.map((item) => (
          <Link className="smart-feature-card" to={item.path} key={item.title}>
            <span className="smart-feature-icon">{item.icon}</span>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
            <span className="smart-feature-open">Open section →</span>
          </Link>
        ))}
      </div>
      <section className="smart-info-panel">
        <strong>Your account, your choices</strong>
        <p>Manage your public identity, personal preferences and how the marketplace communicates with you. Sensitive account changes will require secure backend support.</p>
      </section>
    </div>
  )
}

function PrivacyCentre() {
  const [settings, setSettings] = useState({
    profileDiscoverable: true,
    showActivity: false,
    showSavedInterests: false,
    messageAlerts: true,
    enquiryAlerts: true,
    recommendationAlerts: true,
    neighbourhoodVisibility: true,
  })
  const [saved, setSaved] = useState(false)

  const groups = [
    { title: 'Profile discovery', description: 'Decide how other members can find and view your marketplace profile.', items: [
      ['profileDiscoverable', 'Allow members to find my profile'],
      ['showActivity', 'Display my recent marketplace activity'],
      ['showSavedInterests', 'Show my interests on my public profile'],
    ] },
    { title: 'Community participation', description: 'Choose how visible you are in neighbourhood conversations.', items: [
      ['neighbourhoodVisibility', 'Show my profile when I participate in local discussions'],
    ] },
    { title: 'Alerts and updates', description: 'Choose which marketplace updates deserve your attention.', items: [
      ['messageAlerts', 'New message alerts'],
      ['enquiryAlerts', 'Enquiry and response updates'],
      ['recommendationAlerts', 'Personalised discovery suggestions'],
    ] },
  ] as const

  return (
    <div className="smart-feature-page">
      <div className="smart-feature-intro">
        <span className="extended-kicker">CONTROL YOUR EXPERIENCE</span>
        <h3>Privacy and communication choices</h3>
        <p>Choose what appears on your profile and which updates you receive. These are local demonstration preferences until connected to your account settings service.</p>
      </div>
      {groups.map((group) => (
        <section className="smart-settings-group" key={group.title}>
          <div><h4>{group.title}</h4><p>{group.description}</p></div>
          {group.items.map(([key, label]) => (
            <label className="smart-toggle-row" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(event) => {
                  setSettings((previous) => ({ ...previous, [key]: event.target.checked }))
                  setSaved(false)
                }}
              />
            </label>
          ))}
        </section>
      ))}
      <button className="extended-primary" type="button" onClick={() => setSaved(true)}>Save my preferences</button>
      {saved && <p className="extended-success" role="status">Your preferences have been updated in this browser preview.</p>}
    </div>
  )
}


function NeighbourhoodCommunity({ createMode = false }: { createMode?: boolean }) {
  const [posts, setPosts] = useState([
    { id: 1, author: 'Community member', area: 'Nearby', category: 'Local question', text: 'Which streets around the neighbourhood have reliable water and electricity? I would appreciate recent experiences from residents.', likes: 8, comments: 3, time: '12 minutes ago' },
    { id: 2, author: 'Local resident', area: 'Nearby', category: 'Recommendation', text: 'Sharing recommendations for dependable laundry and cleaning services nearby. Please share providers you have personally used.', likes: 12, comments: 4, time: '35 minutes ago' },
    { id: 3, author: 'Student resident', area: 'Nearby', category: 'Accommodation', text: 'Looking for a quiet study-friendly environment. Any suggestions for suitable areas?', likes: 5, comments: 2, time: '1 hour ago' },
  ])
  const [area, setArea] = useState('Nearby')
  const [category, setCategory] = useState('Local question')
  const [message, setMessage] = useState('')
  const [areaFilter, setAreaFilter] = useState('All areas')
  const [categoryFilter, setCategoryFilter] = useState('All topics')
  const [likedIds, setLikedIds] = useState<number[]>([])
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({})
  const [replies, setReplies] = useState<Record<number, string[]>>({})
  const [notice, setNotice] = useState('')

  const visiblePosts = posts.filter((post) =>
    (areaFilter === 'All areas' || post.area === areaFilter) &&
    (categoryFilter === 'All topics' || post.category === categoryFilter)
  )

  function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!message.trim()) return
    setPosts((previous) => [{
      id: Date.now(),
      author: 'You',
      area,
      category,
      text: message.trim(),
      likes: 0,
      comments: 0,
      time: 'Just now',
    }, ...previous])
    setMessage('')
    setNotice('Your post is now at the top of this local preview feed.')
  }

  function toggleLike(id: number) {
    const alreadyLiked = likedIds.includes(id)
    setLikedIds((previous) => alreadyLiked ? previous.filter((item) => item !== id) : [...previous, id])
    setPosts((previous) => previous.map((post) =>
      post.id === id ? { ...post, likes: Math.max(0, post.likes + (alreadyLiked ? -1 : 1)) } : post
    ))
  }

  function publishReply(event: React.FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault()
    const reply = (replyDrafts[id] || '').trim()
    if (!reply) return
    setReplies((previous) => ({ ...previous, [id]: [...(previous[id] || []), reply] }))
    setPosts((previous) => previous.map((post) =>
      post.id === id ? { ...post, comments: post.comments + 1 } : post
    ))
    setReplyDrafts((previous) => ({ ...previous, [id]: '' }))
  }

  return (
    <div className="smart-community-page">
      <section className="smart-community-banner">
        <div>
          <span className="extended-kicker">SMART HELP COMMUNITY</span>
          <h3>Your neighbourhood is better together.</h3>
          <p>Discover local updates, ask questions, share recommendations and connect with people around you.</p>
        </div>
        <span className="smart-community-banner-icon" aria-hidden="true">⌂</span>
      </section>

      <div className="smart-community-layout">
        <aside className="smart-community-sidebar">
          <section className="smart-community-side-card">
            <strong>Explore community</strong>
            {['All areas', 'Nearby', 'Nearby'].map((item) => (
              <button type="button" key={item}
                className={areaFilter === item ? 'smart-community-side-active' : ''}
                onClick={() => setAreaFilter(item)}>
                <span aria-hidden="true">{item === 'All areas' ? '◉' : '⌖'}</span>{item}
              </button>
            ))}
          </section>
          <section className="smart-community-side-card">
            <strong>Community topics</strong>
            {['All topics', 'Local question', 'Recommendation', 'Accommodation', 'Safety update', 'Local event', 'Buy or sell'].map((item) => (
              <button type="button" key={item}
                className={categoryFilter === item ? 'smart-community-side-active' : ''}
                onClick={() => setCategoryFilter(item)}>
                <span aria-hidden="true">{item === 'All topics' ? '▦' : '◈'}</span>{item}
              </button>
            ))}
          </section>
        </aside>

        <div className="smart-community-main">
          <form className="smart-social-composer" onSubmit={publish}>
            <div className="smart-social-composer-top">
              <span className="smart-post-avatar smart-post-avatar-you">Y</span>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)}
                rows={2} maxLength={1200}
                placeholder={createMode ? 'What would you like to share with your neighbours?' : 'Share an update, ask a question or recommend a local service...'}
                required />
            </div>
            <div className="smart-social-composer-bottom">
              <div className="smart-social-composer-fields">
                <label><span aria-hidden="true">⌖</span>
                  <select value={area} onChange={(event) => setArea(event.target.value)} aria-label="Post neighbourhood">
                    <option>Nearby</option><option>Nearby</option><option>Other</option>
                  </select>
                </label>
                <label><span aria-hidden="true">▤</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Post category">
                    <option>Local question</option><option>Recommendation</option><option>Accommodation</option><option>Safety update</option><option>Local event</option><option>Buy or sell</option>
                  </select>
                </label>
              </div>
              <button className="extended-primary smart-publish-button" type="submit" disabled={!message.trim()}>Publish</button>
            </div>
            {notice && <p className="smart-inline-notice" role="status">{notice}</p>}
          </form>

          <div className="smart-social-feed-heading">
            <div><h4>Community feed</h4><p>Updates from around your neighbourhood</p></div>
            <span>{visiblePosts.length} posts</span>
          </div>

          {visiblePosts.map((post) => (
            <article className="smart-social-post" key={post.id}>
              <div className="smart-social-post-header">
                <span className="smart-post-avatar">{post.author.charAt(0).toUpperCase()}</span>
                <div className="smart-social-author">
                  <strong>{post.author}</strong>
                  <small>{post.area} <span>·</span> {post.time}</small>
                </div>
                <span className="smart-social-category">{post.category}</span>
              </div>
              <p className="smart-social-post-text">{post.text}</p>
              <div className="smart-social-post-meta">
                <span>♥ {post.likes} helpful reactions</span>
                <span>{post.comments} comments</span>
              </div>
              <div className="smart-social-actions">
                <button type="button" className={likedIds.includes(post.id) ? 'smart-social-liked' : ''}
                  onClick={() => toggleLike(post.id)}>
                  <span aria-hidden="true">{likedIds.includes(post.id) ? '♥' : '♡'}</span> Like
                </button>
                <button type="button" onClick={() => document.getElementById(`reply-${post.id}`)?.focus()}>
                  <span aria-hidden="true">▢</span> Comment
                </button>
                <button type="button" onClick={() => setNotice('Sharing will be available when community publishing is connected.')}>
                  <span aria-hidden="true">↗</span> Share
                </button>
              </div>
              {(replies[post.id] || []).map((reply, index) => (
                <div className="smart-social-reply" key={`${post.id}-${index}`}>
                  <span className="smart-post-avatar smart-reply-avatar">Y</span>
                  <p><strong>You</strong>{reply}</p>
                </div>
              ))}
              <form className="smart-social-reply-form" onSubmit={(event) => publishReply(event, post.id)}>
                <span className="smart-post-avatar smart-reply-avatar">Y</span>
                <input id={`reply-${post.id}`} value={replyDrafts[post.id] || ''}
                  onChange={(event) => setReplyDrafts((previous) => ({ ...previous, [post.id]: event.target.value }))}
                  placeholder="Write a comment..." aria-label={`Comment on ${post.author}'s post`} />
                <button type="submit" disabled={!(replyDrafts[post.id] || '').trim()}>Post</button>
              </form>
            </article>
          ))}

          {visiblePosts.length === 0 && (
            <div className="smart-community-empty">
              <span aria-hidden="true">⌕</span><strong>No posts found</strong>
              <p>Try another area or topic, or start a conversation.</p>
            </div>
          )}
          <p className="smart-demo-note">Posts, reactions and comments are temporary browser previews. Shared community publishing, reporting and moderation will be connected securely.</p>
        </div>
      </div>
    </div>
  )
}

function RoommateDiscovery() {
  const [budget, setBudget] = useState('500000')
  const [area, setArea] = useState('Nearby')
  const [cleanliness, setCleanliness] = useState('Very tidy')
  const [socialStyle, setSocialStyle] = useState('Balanced')
  const [sleepStyle, setSleepStyle] = useState('Early sleeper')
  const [studyStyle, setStudyStyle] = useState('Quiet environment')
  const [interests, setInterests] = useState<string[]>(['Reading', 'Technology'])
  const [, setInterestNotice] = useState('')

  const candidates = [
    { name: 'Alex', area: 'Nearby', budget: 450000, cleanliness: 'Very tidy', social: 'Balanced', sleep: 'Early sleeper', study: 'Quiet environment', interests: ['Reading', 'Technology', 'Music'], bio: 'Enjoys a calm home, shared responsibilities and focused study time.' },
    { name: 'Jordan', area: 'Nearby', budget: 520000, cleanliness: 'Moderately tidy', social: 'Outgoing', sleep: 'Night owl', study: 'Social environment', interests: ['Sports', 'Music', 'Cooking'], bio: 'Friendly and active, enjoys group activities and shared meals.' },
    { name: 'Taylor', area: 'Nearby', budget: 480000, cleanliness: 'Very tidy', social: 'Quiet', sleep: 'Early sleeper', study: 'Quiet environment', interests: ['Reading', 'Technology', 'Fitness'], bio: 'Values personal space, cleanliness and a predictable routine.' },
    { name: 'Morgan', area: 'Nearby', budget: 400000, cleanliness: 'Moderately tidy', social: 'Balanced', sleep: 'Flexible', study: 'Quiet environment', interests: ['Reading', 'Cooking', 'Fitness'], bio: 'Looking for a respectful and cooperative shared living arrangement.' },
  ]

  const matches = candidates.map((person) => {
    let score = 0
    const reasons: string[] = []
    if (person.area === area) { score += 25; reasons.push('Same preferred area') }
    else score += 8
    const budgetGap = Math.abs(person.budget - Number(budget)) / Math.max(Number(budget), 1)
    score += Math.max(0, 20 - budgetGap * 30)
    if (person.cleanliness === cleanliness) { score += 15; reasons.push('Similar cleanliness habits') }
    if (person.social === socialStyle) { score += 12; reasons.push('Compatible social energy') }
    if (person.sleep === sleepStyle) { score += 12; reasons.push('Similar daily routine') }
    if (person.study === studyStyle) { score += 10; reasons.push('Similar home environment') }
    const shared = person.interests.filter((item) => interests.includes(item))
    score += Math.min(6, shared.length * 3)
    if (shared.length) reasons.push(`${shared.length} shared interest${shared.length > 1 ? 's' : ''}`)
    return { ...person, score: Math.min(99, Math.round(score)), reasons }
  }).sort((a, b) => b.score - a.score)

  const availableInterests = ['Reading', 'Technology', 'Music', 'Sports', 'Cooking', 'Fitness', 'Gaming', 'Art']

  return (
    <div className="smart-feature-page">
      <section className="smart-community-hero">
        <span className="extended-kicker">COMPATIBILITY-LED DISCOVERY</span>
        <h3>Find someone whose lifestyle works with yours.</h3>
        <p>Compare practical living habits, budget, location and shared interests. A good match is about everyday compatibility, not just finding an available room.</p>
      </section>
      <section className="smart-settings-group">
        <h4>Your roommate preferences</h4>
        <p>Your matches update instantly as you change any preference.</p>
        <div className="smart-preference-grid">
          <label>Annual rent budget (₦)<input type="number" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
          <label>Preferred area<select value={area} onChange={(event) => setArea(event.target.value)}><option>Nearby</option><option>Nearby</option></select></label>
          <label>Home cleanliness<select value={cleanliness} onChange={(event) => setCleanliness(event.target.value)}><option>Very tidy</option><option>Moderately tidy</option><option>Relaxed</option></select></label>
          <label>Social preference<select value={socialStyle} onChange={(event) => setSocialStyle(event.target.value)}><option>Quiet</option><option>Balanced</option><option>Outgoing</option></select></label>
          <label>Usual sleep routine<select value={sleepStyle} onChange={(event) => setSleepStyle(event.target.value)}><option>Early sleeper</option><option>Night owl</option><option>Flexible</option></select></label>
          <label>Preferred home atmosphere<select value={studyStyle} onChange={(event) => setStudyStyle(event.target.value)}><option>Quiet environment</option><option>Social environment</option><option>Flexible environment</option></select></label>
        </div>
        <strong className="smart-interest-heading">Your interests</strong>
        <div className="smart-interest-options">
          {availableInterests.map((interest) => (
            <label key={interest}><input type="checkbox" checked={interests.includes(interest)} onChange={(event) => setInterests((previous) => event.target.checked ? [...previous, interest] : previous.filter((item) => item !== interest))} />{interest}</label>
          ))}
        </div>
      </section>
      <div className="smart-community-toolbar"><strong>Suggested compatibility</strong><span>{matches.length} sample profiles</span></div>
      <div className="smart-match-list">
        {matches.map((person) => (
          <article className="smart-match-card" key={person.name}>
            <div className="smart-match-heading"><span className="smart-post-avatar">{person.name.charAt(0)}</span><div><strong>{person.name}</strong><small>{person.area} · Budget around ₦{person.budget.toLocaleString('en-NG')}/year</small></div><span className="smart-match-score">{person.score}%<small>fit</small></span></div>
            <p>{person.bio}</p>
            <div className="smart-match-reasons">{person.reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}</div>
            <button type="button" className="smart-match-interest" onClick={() => setInterestNotice(`Your interest in ${person.name}'s profile has been noted in this local preview.`)}>I'm interested</button>
          </article>
        ))}
      </div>
      <p className="smart-demo-note">These are fictional sample profiles. Compatibility scores are illustrative and use the preferences above. Real profiles, identity checks, consent, privacy controls and introductions will require backend integration.</p>
    </div>
  )
}



type TenantUploadedDocument = { name: string; type: string; dataUrl: string }
type TenantSharedSubmission = {
  email: string
  fullName: string
  phone: string
  occupation: string
  country: string
  state: string
  city: string
  neighbourhood: string
  bio: string
  documents: TenantUploadedDocument[]
  updatedAt: string
}
const TENANT_SUBMISSIONS_KEY = 'smart-help-market:tenant-submissions:v1'

function readTenantSubmissions(): Record<string, TenantSharedSubmission> {
  try {
    const raw = window.localStorage.getItem(TENANT_SUBMISSIONS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, TenantSharedSubmission>
      : {}
  } catch {
    return {}
  }
}

type LandlordDemoRecord = {
  id: number
  title: string
  detail: string
  status: string
  amount?: number
  tenantProfile?: {
    email: string
    phone: string
    property: string
    unit: string
    tenancyStart: string
    tenancyEnd: string
    rentFrequency: string
    deposit: number
    agreementStatus: string
    renewalDate: string
    occupancyHistory: string[]
  }
}

function LandlordManagementCenter({ section, title }: { section: string; title: string }) {
  const modules: Record<string, { intro: string; action: string; records: LandlordDemoRecord[] }> = {
    tenants: {
      intro: 'Keep tenant profiles, occupied units and tenancy relationships organised. Starting a move-out closes the tenancy relationship, not the tenant marketplace account.',
      action: 'Add tenant record',
      records: [
        { id: 1, title: 'Sample tenant: Ada O.', detail: 'Two-bedroom apartment · Unit A · Tenancy started January 2026', status: 'Active', tenantProfile: { email: 'ada.sample@example.com', phone: '0800 000 0001', property: 'Two-bedroom apartment', unit: 'Unit A', tenancyStart: '2026-01-15', tenancyEnd: '2027-01-14', rentFrequency: 'Annual', deposit: 100000, agreementStatus: 'Signed', renewalDate: '2026-12-15', occupancyHistory: ['15 January 2026: Tenancy commenced', '15 January 2026: Move-in condition report recorded'] } },
        { id: 2, title: 'Sample tenant: John E.', detail: 'Self-contained apartment · Unit B · Tenancy started March 2026', status: 'Active', tenantProfile: { email: 'john.sample@example.com', phone: '0800 000 0002', property: 'Self-contained apartment', unit: 'Unit B', tenancyStart: '2026-03-01', tenancyEnd: '2027-02-28', rentFrequency: 'Annual', deposit: 50000, agreementStatus: 'Pending signature', renewalDate: '2027-01-28', occupancyHistory: ['1 March 2026: Tenancy commenced'] } },
        { id: 3, title: 'Vacant unit', detail: 'Self-contained apartment · Unit C · No active tenant', status: 'Vacant' },
      ],
    },
    rent: {
      intro: 'Track rent due dates, payments, arrears and upcoming renewals. Payment records here are demonstrations and do not collect or verify money.',
      action: 'Add rent record',
      records: [
        { id: 1, title: 'Ada O. · Two-bedroom apartment', detail: 'Annual rent · Due 15 November 2026 · Renewal approaching', status: 'Due soon', amount: 850000 },
        { id: 2, title: 'John E. · Self-contained apartment', detail: 'Annual rent · Due 1 December 2026', status: 'Upcoming', amount: 450000 },
        { id: 3, title: 'Previous rent record', detail: 'Sample payment record · October 2026', status: 'Paid', amount: 450000 },
      ],
    },
    complaints: {
      intro: 'Receive, prioritise and resolve tenant complaints while maintaining a clear communication and resolution history.',
      action: 'Log complaint',
      records: [
        { id: 1, title: 'Water supply interruption', detail: 'Ada O. · Two-bedroom apartment · Reported today · Priority: High', status: 'Open' },
        { id: 2, title: 'Noise complaint', detail: 'John E. · Self-contained apartment · Reported yesterday', status: 'Under review' },
      ],
    },
    maintenance: {
      intro: 'Manage repairs from request to completion, including responsibility, progress and estimated costs.',
      action: 'Create maintenance request',
      records: [
        { id: 1, title: 'Repair leaking kitchen tap', detail: 'Unit A · Plumbing · Assigned technician: Not assigned', status: 'Requested', amount: 25000 },
        { id: 2, title: 'Electrical inspection', detail: 'Unit B · Electrical · Technician visit pending', status: 'In progress', amount: 40000 },
      ],
    },
    notices: {
      intro: 'Keep formal notices, tenancy warnings and delivery history organised. Notice templates and statutory timelines should be configurable and legally reviewed.',
      action: 'Create notice',
      records: [
        { id: 1, title: 'Rent renewal reminder', detail: 'Ada O. · Draft reminder · Review before sending', status: 'Draft' },
        { id: 2, title: 'Maintenance access notice', detail: 'Unit B · Sample notice record', status: 'Issued' },
      ],
    },
    inspections: {
      intro: 'Record move-in, periodic and move-out property conditions. Attachments and photographs will be connected to secure storage later.',
      action: 'Schedule inspection',
      records: [
        { id: 1, title: 'Periodic property inspection', detail: 'Unit A · Sample inspection · Condition report pending', status: 'Pending' },
        { id: 2, title: 'Move-in condition report', detail: 'Unit B · Sample report', status: 'Completed' },
      ],
    },
    reviews: {
      intro: 'Review tenancy-related feedback, handle disputes and record moderation decisions. Only verified tenancy relationships should qualify for verified reviews.',
      action: 'Add review case',
      records: [
        { id: 1, title: 'Tenant feedback · Unit A', detail: 'Sample review awaiting moderation', status: 'Pending review' },
        { id: 2, title: 'Review dispute · Unit B', detail: 'Sample dispute awaiting response', status: 'Appeal received' },
      ],
    },
  }

  const config = modules[section] || modules.tenants

  const [recordsBySection, setRecordsBySection] = useState<
    Record<string, LandlordDemoRecord[]>
  >(() => {
    const defaults = Object.fromEntries(
      Object.entries(modules).map(([key, value]) => [key, value.records]),
    ) as Record<string, LandlordDemoRecord[]>

    try {
      const saved = window.localStorage.getItem(
        'smart-help-market:landlord-management:v1',
      )
      if (!saved) return defaults

      const parsed: unknown = JSON.parse(saved)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...defaults, ...(parsed as Record<string, LandlordDemoRecord[]>) }
      }
    } catch {
      // Continue with the built-in demonstration records.
    }

    return defaults
  })

  const records = recordsBySection[section] ?? config.records
  const [selectedRecord, setSelectedRecord] = useState<LandlordDemoRecord | null>(null)
  const [tenantSubmissions] = useState<Record<string, TenantSharedSubmission>>(readTenantSubmissions)

  const setRecords = (
    update:
      | LandlordDemoRecord[]
      | ((current: LandlordDemoRecord[]) => LandlordDemoRecord[]),
  ) => {
    setRecordsBySection((current) => ({
      ...current,
      [section]:
        typeof update === 'function'
          ? update(current[section] ?? config.records)
          : update,
    }))
  }

  const [query, setQuery] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDetail, setNewDetail] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [tenantEmail, setTenantEmail] = useState('')
  const [tenantPhone, setTenantPhone] = useState('')
  const [tenantProperty, setTenantProperty] = useState('')
  const [tenantUnit, setTenantUnit] = useState('')
  const [tenancyStart, setTenancyStart] = useState('')
  const [tenancyEnd, setTenancyEnd] = useState('')
  const [rentFrequency, setRentFrequency] = useState('Annual')
  const [tenantDeposit, setTenantDeposit] = useState('')
  const [agreementStatus, setAgreementStatus] = useState('Draft')
  const [renewalDate, setRenewalDate] = useState('')
  const [notice, setNotice] = useState('')
  const [moveOutTenantId, setMoveOutTenantId] = useState<number | null>(null)
  const [moveOutBalance, setMoveOutBalance] = useState('')
  const [moveOutDeposit, setMoveOutDeposit] = useState('')
  const [moveOutInspection, setMoveOutInspection] = useState('Pending')
  const [moveOutKeysReturned, setMoveOutKeysReturned] = useState(false)
  const [moveOutMeterRecorded, setMoveOutMeterRecorded] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'smart-help-market:landlord-management:v1',
        JSON.stringify(recordsBySection),
      )
    } catch {
      // Keep the management centre usable if browser storage is unavailable.
    }
  }, [recordsBySection])

  useEffect(() => {
    setQuery('')
    setSelectedRecord(null)
    setNewTitle('')
    setNewDetail('')
    setNewAmount('')
    setTenantEmail('')
    setTenantPhone('')
    setTenantProperty('')
    setTenantUnit('')
    setTenancyStart('')
    setTenancyEnd('')
    setRentFrequency('Annual')
    setTenantDeposit('')
    setAgreementStatus('Draft')
    setRenewalDate('')
    setNotice('')
    setMoveOutTenantId(null)
    setMoveOutBalance('')
    setMoveOutDeposit('')
    setMoveOutInspection('Pending')
    setMoveOutKeysReturned(false)
    setMoveOutMeterRecorded(false)
  }, [section])

  const filtered = records.filter((record) =>
    `${record.title} ${record.detail} ${record.status}`.toLowerCase().includes(query.toLowerCase())
  )

  const updateStatus = (id: number, status: string) => {
    setRecords((current) => current.map((record) =>
      record.id === id ? { ...record, status } : record
    ))
    setNotice(`Record updated: ${status}. This change is saved in this browser preview only.`)
  }

  const completeMoveOut = () => {
    if (moveOutTenantId === null) return

    if (!moveOutKeysReturned || !moveOutMeterRecorded || moveOutInspection !== 'Completed') {
      setNotice('Complete the key handover, meter reading and final inspection before closing the tenancy.')
      return
    }

    const today = new Date().toISOString().slice(0, 10)
    const balance = Number(moveOutBalance) || 0
    const deposit = Number(moveOutDeposit) || 0

    setRecords((current) => current.map((record) => {
      if (record.id !== moveOutTenantId || !record.tenantProfile) return record

      return {
        ...record,
        status: 'Moved out',
        detail: `${record.tenantProfile.property} · ${record.tenantProfile.unit} · Tenancy closed ${today}`,
        tenantProfile: {
          ...record.tenantProfile,
          occupancyHistory: [
            ...record.tenantProfile.occupancyHistory,
            `${today}: Move-out completed`,
            `Final outstanding balance recorded: ₦${balance.toLocaleString('en-NG')}`,
            `Deposit disposition recorded: ₦${deposit.toLocaleString('en-NG')}`,
            'Keys returned, meter reading recorded and final inspection completed',
          ],
        },
      }
    }))

    setMoveOutTenantId(null)
    setMoveOutBalance('')
    setMoveOutDeposit('')
    setMoveOutInspection('Pending')
    setMoveOutKeysReturned(false)
    setMoveOutMeterRecorded(false)
    setNotice('Tenancy closed and move-out history saved. The tenant marketplace account remains unaffected.')
  }

  const actionLabel: Record<string, string> = {
    tenants: 'Start move-out',
    rent: 'Mark as paid',
    complaints: 'Mark resolved',
    maintenance: 'Mark completed',
    notices: 'Mark issued',
    inspections: 'Complete inspection',
    reviews: 'Moderate review',
  }

  const nextStatus: Record<string, string> = {
    tenants: 'Move-out started',
    rent: 'Paid',
    complaints: 'Resolved',
    maintenance: 'Completed',
    notices: 'Issued',
    inspections: 'Completed',
    reviews: 'Moderated',
  }

  return (
    <div className="landlord-management">
      <section className="landlord-management-hero">
        <div>
          <span className="extended-kicker">PROPERTY OPERATIONS</span>
          <h3>{title}</h3>
          <p>{config.intro}</p>
        </div>
        <span className="landlord-management-icon" aria-hidden="true">⌂</span>
      </section>

      <div className="landlord-management-stats">
        <article><span>Total records</span><strong>{records.length}</strong></article>
        <article><span>Needs attention</span><strong>{records.filter((r) => !['Paid', 'Completed', 'Resolved', 'Vacant', 'Moderated'].includes(r.status)).length}</strong></article>
        <article><span>Completed / closed</span><strong>{records.filter((r) => ['Paid', 'Completed', 'Resolved', 'Moderated'].includes(r.status)).length}</strong></article>
      </div>

      <section className="landlord-management-panel">
        <div className="landlord-management-toolbar">
          <div>
            <h4>{title} records</h4>
            <p>Search and update your local demonstration records.</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${title.toLowerCase()}...`}
            aria-label={`Search ${title}`}
          />
        </div>

        <div className="landlord-management-records">
          {filtered.map((record) => (
            <article className="landlord-management-record" key={record.id}>
              <div className="landlord-record-symbol" aria-hidden="true">⌂</div>
              <div className="landlord-record-content">
                <strong>{record.title}</strong>
                <p>{record.detail}</p>
                {section === 'tenants' && record.tenantProfile && tenantSubmissions[record.tenantProfile.email.trim().toLowerCase()] && (
                  <small className="shm-tenant-submitted-indicator">
                    ✓ Tenant profile shared · {tenantSubmissions[record.tenantProfile.email.trim().toLowerCase()].documents?.length || 0} supporting document(s)
                  </small>
                )}
                {section === 'tenants' && record.tenantProfile && (
                  <div className="landlord-tenant-profile">
                    <div><span>Property</span><strong>{record.tenantProfile.property}</strong></div>
                    <div><span>Unit</span><strong>{record.tenantProfile.unit}</strong></div>
                    <div><span>Phone</span><strong>{record.tenantProfile.phone || 'Not provided'}</strong></div>
                    <div><span>Email</span><strong>{record.tenantProfile.email || 'Not provided'}</strong></div>
                    <div><span>Tenancy starts</span><strong>{record.tenantProfile.tenancyStart || 'Not set'}</strong></div>
                    <div><span>Tenancy ends</span><strong>{record.tenantProfile.tenancyEnd || 'Not set'}</strong></div>
                    <div><span>Rent frequency</span><strong>{record.tenantProfile.rentFrequency}</strong></div>
                    <div><span>Deposit</span><strong>₦{record.tenantProfile.deposit.toLocaleString('en-NG')}</strong></div>
                    <div><span>Agreement</span><strong>{record.tenantProfile.agreementStatus}</strong></div>
                    <div><span>Renewal date</span><strong>{record.tenantProfile.renewalDate || 'Not scheduled'}</strong></div>
                    <div className="landlord-tenant-history">
                      <span>Occupancy history</span>
                      {record.tenantProfile.occupancyHistory.map((entry, index) => (
                        <small key={`${record.id}-history-${index}`}>{entry}</small>
                      ))}
                    </div>
                  </div>
                )}
                {record.amount !== undefined && (
                  <span className="landlord-record-amount">₦{record.amount.toLocaleString('en-NG')}</span>
                )}
              </div>
              <span className="landlord-record-status">{record.status}</span>
              <button type="button" className="landlord-record-view" onClick={() => setSelectedRecord(record)}>View details</button>
              {record.status !== nextStatus[section] && (section !== 'tenants' || Boolean(record.tenantProfile)) && (
                <button
                  type="button"
                  onClick={() => section === 'tenants'
                    ? (
                        setMoveOutTenantId(record.id),
                        setMoveOutBalance('0'),
                        setMoveOutDeposit(String(record.tenantProfile?.deposit ?? 0)),
                        setMoveOutInspection('Pending'),
                        setMoveOutKeysReturned(false),
                        setMoveOutMeterRecorded(false)
                      )
                    : updateStatus(record.id, nextStatus[section])}
                >
                  {actionLabel[section]}
                </button>
              )}
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="workspace-empty-state">
              <strong>No matching records</strong>
              <p>Try another search or add a new record.</p>
            </div>
          )}
        </div>
      </section>

      {selectedRecord && (
        <div className="shm-record-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedRecord(null) }}>
          <section className="shm-record-modal" role="dialog" aria-modal="true" aria-labelledby="landlord-record-modal-title">
            <button type="button" className="shm-record-modal-close" onClick={() => setSelectedRecord(null)} aria-label="Close record details">×</button>
            <span className="extended-kicker">{section.toUpperCase()} DETAILS</span>
            <h3 id="landlord-record-modal-title">{selectedRecord.title}</h3>
            <p>{selectedRecord.detail}</p>
            <div className="shm-record-detail-grid">
              <div><span>Current status</span><strong>{selectedRecord.status}</strong></div>
              {selectedRecord.amount !== undefined && <div><span>Amount</span><strong>₦{selectedRecord.amount.toLocaleString('en-NG')}</strong></div>}
              {selectedRecord.tenantProfile && <>
                <div><span>Tenant email</span><strong>{selectedRecord.tenantProfile.email || 'Not provided'}</strong></div>
                <div><span>Phone</span><strong>{selectedRecord.tenantProfile.phone || 'Not provided'}</strong></div>
                <div><span>Property</span><strong>{selectedRecord.tenantProfile.property}</strong></div>
                <div><span>Unit</span><strong>{selectedRecord.tenantProfile.unit}</strong></div>
                <div><span>Tenancy start</span><strong>{selectedRecord.tenantProfile.tenancyStart || 'Not set'}</strong></div>
                <div><span>Tenancy end</span><strong>{selectedRecord.tenantProfile.tenancyEnd || 'Not set'}</strong></div>
                <div><span>Rent frequency</span><strong>{selectedRecord.tenantProfile.rentFrequency}</strong></div>
                <div><span>Security deposit</span><strong>₦{selectedRecord.tenantProfile.deposit.toLocaleString('en-NG')}</strong></div>
                <div><span>Agreement status</span><strong>{selectedRecord.tenantProfile.agreementStatus}</strong></div>
                <div><span>Renewal date</span><strong>{selectedRecord.tenantProfile.renewalDate || 'Not scheduled'}</strong></div>
                {(() => {
                  const submission = tenantSubmissions[selectedRecord.tenantProfile.email.trim().toLowerCase()]
                  if (!submission) return <p className="shm-record-modal-note">No tenant-submitted profile is linked to this email in this browser preview. Ask the tenant to complete their profile and share their tenant information using the same email address.</p>
                  return <div className="shm-tenant-submission">
                    <h4>Information submitted by tenant</h4>
                    <div><span>Full name</span><strong>{submission.fullName || 'Not provided'}</strong></div>
                    <div><span>Occupation</span><strong>{submission.occupation || 'Not provided'}</strong></div>
                    <div><span>Location</span><strong>{[submission.neighbourhood, submission.city, submission.state, submission.country].filter(Boolean).join(', ') || 'Not provided'}</strong></div>
                    <div className="shm-tenant-submission-bio"><span>About the tenant</span><p>{submission.bio || 'No biography supplied.'}</p></div>
                    <div className="shm-tenant-documents"><strong>Uploaded documents</strong>
                      {(submission.documents || []).length ? (submission.documents || []).map((doc, index) => <a key={index} href={doc.dataUrl} download={doc.name} target="_blank" rel="noreferrer">{doc.name} ↗</a>) : <small>No supporting documents uploaded.</small>}
                    </div>
                    <small>Tenant submission updated {new Date(submission.updatedAt).toLocaleString('en-NG')}</small>
                  </div>
                })()}
                <div className="shm-record-history"><span>Occupancy history</span>{selectedRecord.tenantProfile.occupancyHistory.map((entry,index)=><small key={index}>{entry}</small>)}</div>
              </>}
            </div>
            <button type="button" className="extended-secondary" onClick={() => setSelectedRecord(null)}>Close details</button>
          </section>
        </div>
      )}

      {section === 'tenants' && moveOutTenantId !== null && (
        <section className="landlord-management-panel landlord-moveout-panel">
          <div className="landlord-management-toolbar">
            <div>
              <h4>Tenant move-out and handover</h4>
              <p>Complete the close-out checklist and preserve the tenancy history.</p>
            </div>
            <span className="landlord-local-label">LOCAL PREVIEW</span>
          </div>
          <div className="landlord-tenant-form">
            <h5>Financial close-out</h5>
            <label>Outstanding balance (₦)
              <input type="number" min="0" value={moveOutBalance} onChange={(event) => setMoveOutBalance(event.target.value)} />
            </label>
            <label>Deposit amount to be returned or otherwise settled (₦)
              <input type="number" min="0" value={moveOutDeposit} onChange={(event) => setMoveOutDeposit(event.target.value)} />
            </label>
            <p className="landlord-tenant-form-note">Record the agreed financial outcome. This preview does not transfer funds or determine legal deposit deductions.</p>
            <h5>Handover checklist</h5>
            <label className="landlord-moveout-check">
              <input type="checkbox" checked={moveOutKeysReturned} onChange={(event) => setMoveOutKeysReturned(event.target.checked)} />
              Keys and access devices returned
            </label>
            <label className="landlord-moveout-check">
              <input type="checkbox" checked={moveOutMeterRecorded} onChange={(event) => setMoveOutMeterRecorded(event.target.checked)} />
              Final utility meter readings recorded
            </label>
            <label>Final property inspection
              <select value={moveOutInspection} onChange={(event) => setMoveOutInspection(event.target.value)}>
                <option>Pending</option><option>Completed</option><option>Issues recorded</option>
              </select>
            </label>
            <p className="landlord-tenant-form-note">The tenancy can only be closed here when keys are returned, meter readings are recorded and the final inspection is completed. Any issues should be documented separately.</p>
          </div>
          <div className="landlord-tenant-editor-actions">
            <button type="button" className="extended-primary" onClick={completeMoveOut}>Complete move-out</button>
            <button type="button" className="landlord-secondary-action" onClick={() => setMoveOutTenantId(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className="landlord-management-panel">
        <div className="landlord-management-toolbar">
          <div>
            <h4>{config.action}</h4>
            <p>Create a local record for this management area.</p>
          </div>
          <span className="landlord-local-label">LOCAL PREVIEW</span>
        </div>
        <form className="landlord-management-form" onSubmit={(event) => {
          event.preventDefault()
          if (!newTitle.trim()) return
          if (section === 'tenants' && (!tenantProperty.trim() || !tenantUnit.trim() || !tenancyStart)) {
            setNotice('For a tenant record, enter the property, unit and tenancy start date.')
            return
          }

          setRecords((current) => [{
            id: Math.max(0, ...current.map((record) => record.id)) + 1,
            title: newTitle.trim(),
            detail: newDetail.trim() || 'New demonstration record',
            status: section === 'tenants' ? 'Active' : 'New',
            ...(newAmount.trim() ? { amount: Number(newAmount) } : {}),
            ...(section === 'tenants' ? {
              tenantProfile: {
                email: tenantEmail.trim(),
                phone: tenantPhone.trim(),
                property: tenantProperty.trim(),
                unit: tenantUnit.trim(),
                tenancyStart,
                tenancyEnd,
                rentFrequency,
                deposit: Number(tenantDeposit) || 0,
                agreementStatus,
                renewalDate,
                occupancyHistory: [`${tenancyStart}: Tenancy record created in browser preview`],
              },
            } : {}),
          }, ...current])
          setNewTitle('')
          setNewDetail('')
          setNewAmount('')
          setTenantEmail('')
          setTenantPhone('')
          setTenantProperty('')
          setTenantUnit('')
          setTenancyStart('')
          setTenancyEnd('')
          setTenantDeposit('')
          setRenewalDate('')
          setAgreementStatus('Draft')
          setNotice(section === 'tenants'
            ? 'Tenant profile and tenancy record added to this browser preview.'
            : 'New record added to this browser preview.')
        }}>
          <label>
            Record title
            <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} required placeholder="Enter a name or subject" />
          </label>
          <label>
            Details
            <textarea value={newDetail} onChange={(event) => setNewDetail(event.target.value)} rows={3} placeholder="Property, unit, tenant or other relevant details" />
          </label>
          {(section === 'rent' || section === 'maintenance' || section === 'tenants') && (
            <label>
              {section === 'tenants' ? 'Rent amount (₦)' : 'Amount (₦)'}
              <input type="number" min="0" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} placeholder="Enter amount" />
            </label>
          )}
          {section === 'tenants' && (
            <div className="landlord-tenant-form">
              <h5>Tenant contact details</h5>
              <label>Email address<input type="email" value={tenantEmail} onChange={(event) => setTenantEmail(event.target.value)} placeholder="Tenant email" /></label>
              <label>Phone number<input type="tel" value={tenantPhone} onChange={(event) => setTenantPhone(event.target.value)} placeholder="Tenant phone" /></label>

              <h5>Property and tenancy</h5>
              <label>Property<input value={tenantProperty} onChange={(event) => setTenantProperty(event.target.value)} required placeholder="Property name or type" /></label>
              <label>Unit<input value={tenantUnit} onChange={(event) => setTenantUnit(event.target.value)} required placeholder="Unit or apartment number" /></label>
              <label>Tenancy start<input type="date" value={tenancyStart} onChange={(event) => setTenancyStart(event.target.value)} required /></label>
              <label>Tenancy end<input type="date" value={tenancyEnd} onChange={(event) => setTenancyEnd(event.target.value)} /></label>
              <label>Rent frequency
                <select value={rentFrequency} onChange={(event) => setRentFrequency(event.target.value)}>
                  <option>Annual</option><option>Monthly</option><option>Quarterly</option><option>Six-monthly</option><option>Weekly</option>
                </select>
              </label>
              <label>Security deposit (₦)<input type="number" min="0" value={tenantDeposit} onChange={(event) => setTenantDeposit(event.target.value)} placeholder="Deposit amount" /></label>

              <h5>Tenancy agreement</h5>
              <label>Agreement status
                <select value={agreementStatus} onChange={(event) => setAgreementStatus(event.target.value)}>
                  <option>Draft</option><option>Awaiting signature</option><option>Signed</option><option>Expired</option><option>Under review</option>
                </select>
              </label>
              <label>Renewal reminder date<input type="date" value={renewalDate} onChange={(event) => setRenewalDate(event.target.value)} /></label>
              <p className="landlord-tenant-form-note">This records agreement details and status only. Document uploads, e-signatures and legally valid agreement execution will be connected in a later stage.</p>
            </div>
          )}
          <button className="extended-primary" type="submit">Add record</button>
        </form>
        {notice && <p className="extended-success" role="status">{notice}</p>}
      </section>

      <p className="smart-demo-note">
        Demonstration data only. No real rent payment, legal notice, tenant communication, inspection evidence or review moderation is performed by this preview.
      </p>
    </div>
  )
}


type ProfileChangeRecord = {
  id: string
  field: string
  previousValue: string
  proposedValue: string
  submittedAt: string
  status: 'Pending approval' | 'Approved' | 'Rejected'
  reviewedAt?: string
  reviewerNote?: string
}

type ProfilePreviewState = {
  profile: Record<string, string>
  cooldownUntil: string | null
  history: ProfileChangeRecord[]
  pending: ProfileChangeRecord[]
}





function ProfileEditor({ user, role }: { user: MarketplaceUser | null; role: Role }) {
  const defaults: Record<string, string> = {
    fullName: user?.displayName || '',
    displayName: user?.displayName || '',
    phone: '',
    dateOfBirth: '',
    occupation: '',
    gender: '',
    country: 'Nigeria',
    state: '',
    city: '',
    neighbourhood: '',
    radius: '10',
    bio: '',
    interests: '',
    languages: '',
    interestsCategory: 'all',
    visibility: 'members',
  }

  const storageKey = `smart-help-market:profile-protection:v1:${user?.id || 'preview'}`
  const [saved, setSaved] = useState<ProfilePreviewState>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ProfilePreviewState>
        return {
          profile: { ...defaults, ...(parsed.profile || {}) },
          cooldownUntil: parsed.cooldownUntil || null,
          history: Array.isArray(parsed.history) ? parsed.history : [],
          pending: Array.isArray(parsed.pending) ? parsed.pending : [],
        }
      }
    } catch {
      // Use defaults when local browser data is unavailable or invalid.
    }

    return {
      profile: defaults,
      cooldownUntil: null,
      history: [],
      pending: [],
    }
  })
  const [photo, setPhoto] = useState(user?.avatarUrl || '')
  const existingTenantSubmission = readTenantSubmissions()[user?.email.trim().toLowerCase() || '']
  const [shareTenantProfile, setShareTenantProfile] = useState(Boolean(existingTenantSubmission))
  const [tenantDocuments, setTenantDocuments] = useState<TenantUploadedDocument[]>(existingTenantSubmission?.documents || [])
  const [notice, setNotice] = useState('')
  const [formVersion, setFormVersion] = useState(0)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(saved))
    } catch {
      setNotice('Browser storage is unavailable. Changes may not survive a refresh.')
    }
  }, [saved, storageKey])

  useEffect(() => {
    const email = user?.email.trim().toLowerCase()
    if (role !== 'buyer' || !email) return
    const directory = readTenantSubmissions()
    if (shareTenantProfile) {
      directory[email] = {
        email,
        fullName: saved.profile.fullName || saved.profile.displayName || user?.displayName || '',
        phone: saved.profile.phone || '',
        occupation: saved.profile.occupation || '',
        country: saved.profile.country || '',
        state: saved.profile.state || '',
        city: saved.profile.city || '',
        neighbourhood: saved.profile.neighbourhood || '',
        bio: saved.profile.bio || '',
        documents: tenantDocuments,
        updatedAt: new Date().toISOString(),
      }
    } else {
      delete directory[email]
    }
    try {
      window.localStorage.setItem(TENANT_SUBMISSIONS_KEY, JSON.stringify(directory))
    } catch {
      setNotice('Tenant information could not be shared because browser storage is full.')
    }
  }, [role, shareTenantProfile, tenantDocuments, saved.profile, user?.email, user?.displayName])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => () => {
    if (photo.startsWith('blob:')) URL.revokeObjectURL(photo)
  }, [photo])

  const cooldownTime = saved.cooldownUntil ? Date.parse(saved.cooldownUntil) : 0
  const cooldownActive = Number.isFinite(cooldownTime) && cooldownTime > now
  const remainingSeconds = cooldownActive
    ? Math.ceil((cooldownTime - now) / 1000)
    : 0
  const countdown = [
    Math.floor(remainingSeconds / 3600),
    Math.floor((remainingSeconds % 3600) / 60),
    remainingSeconds % 60,
  ].map((value) => String(value).padStart(2, '0')).join(':')

  const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
  }

  const fieldLabels: Record<string, string> = {
    fullName: 'Full name',
    displayName: 'Display name',
    phone: 'Phone number',
    dateOfBirth: 'Date of birth',
    occupation: 'Occupation',
    gender: 'Gender',
    country: 'Country',
    state: 'State',
    city: 'City or town',
    neighbourhood: 'Neighbourhood',
    radius: 'Discovery distance',
    bio: 'Biography',
    interests: 'Interests',
    languages: 'Languages',
    interestsCategory: 'Marketplace interests',
    visibility: 'Profile visibility',
  }

  const approvalFieldLabels: Record<string, string> = {
    fullName: 'Full legal name',
    phone: 'Phone number',
    dateOfBirth: 'Date of birth',
  }
  const approvalFields = new Set(['fullName', 'phone', 'dateOfBirth'])

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (cooldownActive) {
      setNotice(`Profile editing is temporarily locked. You can make another update in ${countdown}.`)
      return
    }

    const form = new FormData(event.currentTarget)
    const keys = Object.keys(defaults)
    const submitted: Record<string, string> = {}

    for (const key of keys) {
      submitted[key] = String(form.get(key) ?? '').trim()
    }

    const changedKeys = keys.filter(
      (key) => submitted[key] !== (saved.profile[key] ?? defaults[key] ?? ''),
    )

    if (changedKeys.length === 0) {
      setNotice('There are no profile changes to save.')
      return
    }

    const timestamp = new Date().toISOString()
    type ProfilePolicy = { approval: boolean; cooldown: number }
    const defaultPolicy: Record<string, ProfilePolicy> = {
      'Full legal name': { approval: true, cooldown: 24 },
      'Phone number': { approval: true, cooldown: 24 },
      'Date of birth': { approval: true, cooldown: 24 },
    }
    let policy = defaultPolicy
    try {
      const rawPolicy = window.localStorage.getItem('smart-help-market:admin-profile-approval-rules:v1')
      if (rawPolicy) policy = { ...defaultPolicy, ...(JSON.parse(rawPolicy) as Record<string, ProfilePolicy>) }
    } catch {
      // Security-sensitive defaults remain enabled if policy preview data is invalid.
    }
    const approvalChanges = changedKeys.filter((key) => {
      if (!approvalFields.has(key)) return false
      return policy[approvalFieldLabels[key]]?.approval !== false
    })
    const ordinaryChanges = changedKeys.filter((key) => !approvalChanges.includes(key))

    const newPending: ProfileChangeRecord[] = approvalChanges.map((field) => ({
      id: `${Date.now()}-${field}`,
      field,
      previousValue: saved.profile[field] ?? '',
      proposedValue: submitted[field],
      submittedAt: timestamp,
      status: 'Pending approval',
    }))

    const newHistory: ProfileChangeRecord[] = changedKeys.map((field) => ({
      id: `${Date.now()}-${field}-history`,
      field,
      previousValue: saved.profile[field] ?? '',
      proposedValue: submitted[field],
      submittedAt: timestamp,
      status: approvalChanges.includes(field) ? 'Pending approval' : 'Approved',
      ...(approvalChanges.includes(field) ? {} : {
        reviewedAt: timestamp,
        reviewerNote: 'Routine profile update applied in local preview.',
      }),
    }))

    const updatedProfile = { ...saved.profile }
    for (const field of ordinaryChanges) {
      updatedProfile[field] = submitted[field]
    }

    const cooldownHours = changedKeys.reduce((maximum, key) => {
      if (!approvalFields.has(key)) return Math.max(maximum, 24)
      const fieldPolicy = policy[approvalFieldLabels[key]]
      return Math.max(maximum, Number.isFinite(fieldPolicy?.cooldown) ? Math.max(0, fieldPolicy.cooldown) : 24)
    }, 0)
    const nextCooldown = cooldownHours > 0
      ? new Date(Date.now() + cooldownHours * 60 * 60 * 1000).toISOString()
      : saved.cooldownUntil

    setSaved((current) => ({
      ...current,
      profile: updatedProfile,
      cooldownUntil: nextCooldown,
      pending: [
        ...current.pending.filter(
          (item) => !approvalChanges.includes(item.field),
        ),
        ...newPending,
      ],
      history: [...newHistory, ...current.history].slice(0, 100),
    }))

    setFormVersion((current) => current + 1)

    if (ordinaryChanges.length > 0 && approvalChanges.length > 0) {
      setNotice('Routine changes have been saved. Sensitive changes are waiting for admin approval.')
    } else if (ordinaryChanges.length > 0) {
      setNotice('Your profile changes have been saved. The 24-hour editing cooldown has started.')
    } else {
      setNotice('Your sensitive changes have been submitted for admin approval. Your current approved details remain unchanged.')
    }
  }

  return (
    <div className="smart-profile-editor">
      <section className="smart-profile-cover">
        <div className="smart-profile-photo-wrap">
          <span className="smart-profile-photo">
            {photo ? <img src={photo} alt="Profile preview" /> : (user?.displayName?.charAt(0) || 'A').toUpperCase()}
          </span>
          <label className="smart-photo-upload">
            Change photo
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              if (file.size > 5 * 1024 * 1024) {
                setNotice('Please choose an image below 5MB.')
                return
              }
              if (photo.startsWith('blob:')) URL.revokeObjectURL(photo)
              setPhoto(URL.createObjectURL(file))
              setNotice('Photo preview selected. Permanent image storage will be connected during backend integration.')
            }} />
          </label>
        </div>
        <div>
          <span className="extended-kicker">YOUR MARKETPLACE IDENTITY</span>
          <h3>Build your personal profile</h3>
          <p>Manage your own account details. Other marketplace members cannot edit your personal profile.</p>
        </div>
      </section>

      <section className="smart-profile-protection" aria-live="polite">
        <div className="smart-profile-protection-heading">
          <span aria-hidden="true">🔐</span>
          <div>
            <strong>Profile change protection</strong>
            <p>Profile edits follow the platform cooldown policy. Sensitive details may require administrator review.</p>
          </div>
        </div>
        {cooldownActive ? (
          <div className="smart-profile-cooldown">
            <span>Next profile edit available in</span>
            <strong>{countdown}</strong>
            <small>Available again {formatDate(saved.cooldownUntil!)}</small>
          </div>
        ) : (
          <div className="smart-profile-ready">
            <strong>Profile editing available</strong>
            <span>You can submit a profile update now.</span>
          </div>
        )}
        <div className="smart-profile-rules">
          <span>Cooldown: applied according to profile policy</span>
          <span>Full name, phone and date of birth: protected by approval rules</span>
        </div>
      </section>

      <form key={formVersion} className="smart-profile-form" onSubmit={saveProfile}>
        <fieldset disabled={cooldownActive} className="smart-profile-fieldset">
          <section className="smart-profile-section">
            <div className="smart-profile-section-heading">
              <span>01</span><div><h4>Personal details</h4><p>Your basic account information.</p></div>
            </div>
            <div className="smart-profile-fields">
              <label>Full name<input name="fullName" defaultValue={saved.profile.fullName} required placeholder="Your full name" /><small>Changes require admin approval.</small></label>
              <label>Display name<input name="displayName" defaultValue={saved.profile.displayName} placeholder="How people should address you" /></label>
              <label>Email address<input type="email" value={user?.email || ''} readOnly /><small>Email changes require a separate secure verification process.</small></label>
              <label>Phone number<input name="phone" type="tel" defaultValue={saved.profile.phone} placeholder="Private account phone number" /><small>Changes require verification and admin approval.</small></label>
              <label>Date of birth<input name="dateOfBirth" type="date" defaultValue={saved.profile.dateOfBirth} /><small>Changes require admin approval.</small></label>
              <label>Occupation<input name="occupation" defaultValue={saved.profile.occupation} placeholder="Your work, profession or status" /></label>
              <label>Gender (optional)<select name="gender" defaultValue={saved.profile.gender}><option value="">Prefer not to say</option><option>Male</option><option>Female</option><option>Other</option></select></label>
            </div>
          </section>

          <section className="smart-profile-section">
            <div className="smart-profile-section-heading">
              <span>02</span><div><h4>Location and discovery</h4><p>Help us organise relevant local recommendations.</p></div>
            </div>
            <div className="smart-profile-fields">
              <label>Country<input name="country" defaultValue={saved.profile.country} /></label>
              <label>State<input name="state" defaultValue={saved.profile.state} placeholder="Your state" /></label>
              <label>City or town<input name="city" defaultValue={saved.profile.city} placeholder="Your city or town" /></label>
              <label>Neighbourhood<input name="neighbourhood" defaultValue={saved.profile.neighbourhood} placeholder="Your preferred neighbourhood" /></label>
              <label>Discovery distance<select name="radius" defaultValue={saved.profile.radius}><option value="2">2 kilometres</option><option value="5">5 kilometres</option><option value="10">10 kilometres</option><option value="25">25 kilometres</option><option value="any">Any distance</option></select></label>
            </div>
          </section>

          <section className="smart-profile-section">
            <div className="smart-profile-section-heading">
              <span>03</span><div><h4>About you and your interests</h4><p>Make your recommendations and community experience more relevant.</p></div>
            </div>
            <div className="smart-profile-fields">
              <label className="smart-profile-full">Biography<textarea name="bio" rows={5} maxLength={600} defaultValue={saved.profile.bio} placeholder="Tell people a little about yourself..." /></label>
              <label>Interests<input name="interests" defaultValue={saved.profile.interests} placeholder="Reading, technology, sports..." /></label>
              <label>Languages<input name="languages" defaultValue={saved.profile.languages} placeholder="Languages you speak" /></label>
              <label>Marketplace interests<select name="interestsCategory" defaultValue={saved.profile.interestsCategory}><option value="all">All marketplace categories</option><option value="property">Property and accommodation</option><option value="products">Products and shopping</option><option value="services">Services</option><option value="community">Community and shared living</option></select></label>
              <label>Public profile visibility<select name="visibility" defaultValue={saved.profile.visibility}><option value="members">Marketplace members</option><option value="community">Community participants</option><option value="private">Private</option></select></label>
            </div>
          </section>

        </fieldset>

          {role === 'buyer' && (
            <section className="smart-profile-section">
              <div className="smart-profile-section-heading">
                <span>04</span><div><h4>Tenant information and documents</h4><p>Optionally share the details and supporting documents a landlord needs when you apply for a property.</p></div>
              </div>
              <label className="shm-tenant-share-toggle">
                <input type="checkbox" checked={shareTenantProfile} onChange={(event) => setShareTenantProfile(event.target.checked)} />
                Allow my landlord to view the tenant information and documents I submit using this email address.
              </label>
              <div className="shm-tenant-upload-box">
                <label>Upload supporting document
                  <input type="file" accept="image/*,.pdf" onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (!file) return
                    if (file.size > 512 * 1024) {
                      setNotice('Each tenant document must be 512 KB or smaller in this browser preview.')
                      return
                    }
                    const reader = new FileReader()
                    reader.onload = () => {
                      if (typeof reader.result !== 'string') return
                      setTenantDocuments((current) => [...current, { name: file.name, type: file.type || 'application/octet-stream', dataUrl: reader.result as string }].slice(0, 3))
                      setShareTenantProfile(true)
                      setNotice('Tenant document added to your local profile preview.')
                    }
                    reader.onerror = () => setNotice('Unable to read this document. Please try again.')
                    reader.readAsDataURL(file)
                  }} />
                </label>
                <small>Up to three files, maximum 512 KB each. Images and PDF files are supported in this preview.</small>
                {tenantDocuments.map((document, index) => (
                  <div className="shm-tenant-uploaded-file" key={`${document.name}-${index}`}>
                    <span>▤ {document.name}</span>
                    <button type="button" onClick={() => setTenantDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                  </div>
                ))}
              </div>
              <p className="smart-profile-empty">Only share information you are comfortable providing. This browser preview shares data only within the same browser and is not a secure cross-device document service.</p>
            </section>
          )}

        <div className="smart-profile-submit">
          <p>{cooldownActive
            ? `Editing is locked until ${formatDate(saved.cooldownUntil!)}.`
            : 'Changes are stored in this browser preview. Secure server-side enforcement will be added during backend integration.'}</p>
          <button className="extended-primary" type="submit" disabled={cooldownActive}>
            {cooldownActive ? 'Profile editing locked' : 'Save profile changes'}
          </button>
        </div>
        {notice && <p className="extended-success" role="status">{notice}</p>}
      </form>

      <section className="smart-profile-approval-panel">
        <div className="smart-profile-section-heading">
          <span>05</span>
          <div><h4>Approval requests</h4><p>Sensitive changes stay separate from your approved profile until reviewed.</p></div>
        </div>
        {saved.pending.length > 0 ? saved.pending.map((item) => (
          <article className="smart-profile-change-row" key={item.id}>
            <div>
              <strong>{fieldLabels[item.field] || item.field}</strong>
              <p>Proposed value: {item.proposedValue || 'Not provided'}</p>
              <small>Submitted {formatDate(item.submittedAt)}</small>
            </div>
            <span className="smart-profile-pending-status">Pending approval</span>
          </article>
        )) : (
          <p className="smart-profile-empty">You have no profile changes awaiting approval.</p>
        )}
      </section>

      <section className="smart-profile-approval-panel">
        <div className="smart-profile-section-heading">
          <span>06</span>
          <div><h4>Profile change history</h4><p>A record of profile changes and their current review status.</p></div>
        </div>
        {saved.history.length > 0 ? saved.history.slice(0, 12).map((item) => (
          <article className="smart-profile-change-row" key={item.id}>
            <div>
              <strong>{fieldLabels[item.field] || item.field}</strong>
              <p>{item.previousValue || 'Empty'} → {item.proposedValue || 'Empty'}</p>
              <small>{formatDate(item.submittedAt)}</small>
              {item.reviewerNote && <small>{item.reviewerNote}</small>}
            </div>
            <span className={item.status === 'Approved' ? 'smart-profile-approved-status' : 'smart-profile-pending-status'}>
              {item.status}
            </span>
          </article>
        )) : (
          <p className="smart-profile-empty">Your profile change history will appear here.</p>
        )}
      </section>

      <p className="smart-demo-note">
        This is a frontend demonstration. Browser storage is not secure approval or identity verification. Cooldowns, pending requests and approval decisions must be enforced by the backend before production use.
      </p>
    </div>
  )
}

export default function RoleWorkspacePage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const parts = pathname.split('/').filter(Boolean)
  const role = (parts[0] in workspaces ? parts[0] : 'buyer') as Role
  const workspace = workspaces[role]
  const dashboard = dashboardConfigs[role]

  const active = workspace.links.find((item) => item.path === pathname)
    || workspace.links.find((item) => item.path === `/${role}/community/new` && pathname.endsWith('/community/new'))
    || workspace.links[0]

  const section = active.path.split('/').filter(Boolean).at(-1) || 'dashboard'
  const isDashboard = section === 'dashboard'
  const isCreate = section === 'new'
  const isProfile = section === 'profile'
  const isAccount = section === 'account'
  const isPrivacy = section === 'privacy-settings'
  const isCommunity = section === 'community'
  const isCommunityCreate = section === 'new' && parts.includes('community')
  const isRoommates = section === 'roommates'

  const [notice, setNotice] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [search, setSearch] = useState('')
  const [created, setCreated] = useState<string[]>([])
  const [isDemoAccount, setIsDemoAccount] = useState(false)
  const [marketplaceUser, setMarketplaceUser] = useState<MarketplaceUser | null>(null)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [workspaceMenuPosition, setWorkspaceMenuPosition] = useState({ top: 16, left: 16 })
  const [selectedWorkspaceRecord, setSelectedWorkspaceRecord] = useState<WorkspaceRecord | null>(null)
  const [dashboardNow, setDashboardNow] = useState(() => new Date())

  useEffect(() => {
    const clock = window.setInterval(() => setDashboardNow(new Date()), 60000)
    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    setWorkspaceMenuOpen(false)
    setSelectedWorkspaceRecord(null)
  }, [pathname])

  useEffect(() => {
    let active = true

    getMarketplaceUser()
      .then((user) => {
        if (active) {
          setMarketplaceUser(user)
          setIsDemoAccount(
            user?.email.toLowerCase() === 'demo@smarthelpmarket.ng',
          )
        }
      })
      .catch(() => {
        if (active) {
          setIsDemoAccount(false)
          setMarketplaceUser(null)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const records = (sectionRecords[role][section] || [])
    .filter((item) =>
      `${item.title} ${item.description} ${item.status}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )

  const title = isDashboard ? 'Overview' : active.label

  async function handleWorkspaceSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setNotice('')
    try {
      await marketplaceLogout()
      setMarketplaceUser(null)
      navigate('/', { replace: true })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <main className="extended-page workspace-page">
      <div className="workspace-heading">
        <div>
          <span className="extended-kicker">{role.toUpperCase()} WORKSPACE</span>
          <h1>{workspace.title}</h1>
          <p>{workspace.description}</p>
        </div>
        <div className="workspace-heading-actions">
          <button
            type="button"
            className="workspace-navigation-trigger"
            aria-expanded={workspaceMenuOpen}
            aria-controls="workspace-navigation"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              const panelWidth = Math.min(340, window.innerWidth - 24)
              const panelHeight = Math.min(520, window.innerHeight - 24)
              const top = rect.bottom + 10 + panelHeight <= window.innerHeight
                ? rect.bottom + 10
                : Math.max(12, rect.top - panelHeight - 10)
              const left = Math.max(12, Math.min(window.innerWidth - panelWidth - 12, rect.left))
              setWorkspaceMenuPosition({ top, left })
              setWorkspaceMenuOpen((open) => !open)
            }}
          >
            <span aria-hidden="true">☰</span>
            Navigation
          </button>
          <Link className="extended-secondary" to="/explore">
            Browse marketplace
          </Link>
          <button
            type="button"
            className="workspace-signout-icon"
            onClick={() => void handleWorkspaceSignOut()}
            disabled={signingOut}
            aria-label={signingOut ? 'Signing out' : 'Sign out'}
            title={signingOut ? 'Signing out...' : 'Sign out'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M10 17l5-5-5-5M15 12H3m9-7h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6" />
            </svg>
          </button>
        </div>
      </div>

      {isDemoAccount && (
        <nav className="demo-role-switcher" aria-label="Demo dashboard switcher">
          <div className="demo-role-switcher-heading">
            <strong>Explore all dashboards</strong>
            <span>Demo account preview</span>
          </div>
          <div className="demo-role-switcher-links">
            {demoWorkspaces.map((item) => (
              <Link
                key={item.role}
                to={item.path}
                className={role === item.role ? 'demo-role-active' : ''}
                aria-current={role === item.role ? 'page' : undefined}
              >
                {item.label}
                {role === item.role && <span aria-hidden="true">✓</span>}
              </Link>
            ))}
          </div>
        </nav>
      )}


      {createPortal((
        <>
          {workspaceMenuOpen && (
            <button
              type="button"
              className="workspace-menu-backdrop"
              aria-label="Close workspace menu"
              onClick={() => setWorkspaceMenuOpen(false)}
            />
          )}
          <aside
            id="workspace-navigation"
            className={`workspace-nav workspace-nav-viewport ${workspaceMenuOpen ? 'workspace-nav-open' : ''}`}
            style={{
              top: workspaceMenuPosition.top,
              left: workspaceMenuPosition.left,
            }}
          >
            <button
              type="button"
              className="workspace-nav-close"
              aria-label="Close workspace menu"
              onClick={() => setWorkspaceMenuOpen(false)}
            >×</button>
            <strong>WORKSPACE MENU</strong>
            {workspace.links.map((item) => (
              <Link
                className={item.path === pathname ? 'workspace-nav-active' : ''}
                to={item.path}
                key={item.path}
                onClick={() => setWorkspaceMenuOpen(false)}
              >
                {item.label}<span>›</span>
              </Link>
            ))}
          </aside>
        </>
      ), document.body)}

      <div className="workspace-layout">
        <section className="workspace-main">
          <div className="workspace-section-heading">
            <div>
              <span className="extended-kicker">YOUR ACTIVITY</span>
              <h2>{title}</h2>
            </div>
            <span className="workspace-demo-label">DEMO WORKSPACE</span>
          </div>

          {isAccount ? (
            <AccountOverview role={role} user={marketplaceUser} />
          ) : isPrivacy ? (
            <PrivacyCentre />
          ) : isCommunity || isCommunityCreate ? (
            <NeighbourhoodCommunity createMode={isCommunityCreate} />
          ) : isRoommates && role === 'buyer' ? (
            <RoommateDiscovery />
          ) : role === 'landlord' && ['tenants', 'rent', 'complaints', 'maintenance', 'notices', 'inspections', 'reviews'].includes(section) ? (
            <LandlordManagementCenter section={section} title={active.label} />
          ) : isDashboard ? (
            <div className="workspace-dashboard">
              {(() => {
                const hour = dashboardNow.getHours()
                const timeScene = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 21 ? 'evening' : 'night'
                const greeting = timeScene === 'morning' ? 'Good morning' : timeScene === 'afternoon' ? 'Good afternoon' : timeScene === 'evening' ? 'Good evening' : 'Good night'
                const firstName = marketplaceUser?.displayName?.trim().split(/\s+/)[0]
                return <div className={`workspace-welcome shm-time-welcome shm-time-${timeScene}`}>
                  <div className="shm-time-copy">
                    <span className="extended-kicker">{role === 'buyer' ? 'YOUR MARKETPLACE & COMMUNITY' : 'YOUR DASHBOARD'}</span>
                    <h3>{greeting}{firstName ? `, ${firstName}` : ''}!</h3>
                    <p>{dashboard.introduction}</p>
                  </div>
                  <ProfilePhotoSlideshow
                    storageKey={`shm.dashboard.photos.${role}.${marketplaceUser?.email || 'account'}`}
                    initialImage={marketplaceUser?.avatarUrl}
                    displayName={marketplaceUser?.displayName}
                  />
                  <div className="shm-time-art" aria-hidden="true">
                    <span className="shm-time-sun" />
                    <span className="shm-time-rays" />
                    <span className="shm-time-cloud shm-time-cloud-one" />
                    <span className="shm-time-cloud shm-time-cloud-two" />
                    <span className="shm-time-moon" />
                    <span className="shm-time-stars">✦　·　✧　·　✦　·　✧</span>
                    <span className="shm-time-horizon" />
                  </div>
                  <span className="workspace-welcome-icon" aria-hidden="true">
                    {role === 'buyer' ? '⌕' : role === 'landlord' ? '⌂' : role === 'seller' ? '▣' : role === 'provider' ? '✦' : '♙'}
                  </span>
                </div>
              })()}

              <div className="workspace-stats workspace-stats-four">
                {dashboard.stats.map((stat, index) => (
                  <Link className="workspace-stat-card workspace-stat-card-link" key={stat.label} to={dashboardStatPaths[role][index] || `/${role}/dashboard`}>
                    <span className="workspace-stat-icon" aria-hidden="true">
                      {stat.icon}
                    </span>
                    <span className="workspace-stat-label">{stat.label}</span>
                    <strong>{stat.value}</strong>
                    <small>{stat.caption}</small>
                    <span className="workspace-stat-index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </Link>
                ))}
              </div>

              {role === 'landlord' && (
                <section className="landlord-dashboard-analytics" aria-label="Landlord portfolio analytics">
                  <div className="landlord-analytics-heading">
                    <div>
                      <span className="extended-kicker">PROPERTY PERFORMANCE</span>
                      <h3>Portfolio at a glance</h3>
                      <p>Operational overview from the current demonstration records.</p>
                    </div>
                    <span className="landlord-analytics-tag">SAMPLE ANALYTICS</span>
                  </div>

                  <div className="landlord-analytics-kpis">
                    <Link className="landlord-kpi-link" to="/landlord/properties">
                      <span className="landlord-kpi-icon">⌂</span>
                      <span>Property records</span>
                      <strong>3</strong>
                      <small>Properties in this preview</small>
                    </Link>
                    <Link className="landlord-kpi-link" to="/landlord/tenants">
                      <span className="landlord-kpi-icon">♙</span>
                      <span>Active tenants</span>
                      <strong>2</strong>
                      <small>Sample active tenancy records</small>
                    </Link>
                    <Link className="landlord-kpi-link" to="/landlord/rent">
                      <span className="landlord-kpi-icon">₦</span>
                      <span>Rent scheduled</span>
                      <strong>₦1.3m</strong>
                      <small>₦850k due soon · ₦450k upcoming</small>
                    </Link>
                    <Link className="landlord-kpi-link" to="/landlord/complaints">
                      <span className="landlord-kpi-icon">⚙</span>
                      <span>Open operational cases</span>
                      <strong>4</strong>
                      <small>2 complaints · 2 maintenance requests</small>
                    </Link>
                  </div>

                  <div className="landlord-analytics-grid">
                    <article className="landlord-chart-panel">
                      <div className="landlord-chart-heading">
                        <div>
                          <span className="extended-kicker">RENT MANAGEMENT</span>
                          <h4>Rent record breakdown</h4>
                        </div>
                        <Link to="/landlord/rent">View rent records ↗</Link>
                      </div>
                      <div className="landlord-rent-total">
                        <strong>₦1,750,000</strong>
                        <span>All three sample rent records</span>
                      </div>
                      <div className="landlord-bar-chart" role="img" aria-label="Rent records: 850 thousand naira due soon, 450 thousand upcoming and 450 thousand previously paid">
                        <div className="landlord-bar-row">
                          <div><span>Due soon</span><strong>₦850,000</strong></div>
                          <div className="landlord-bar-track"><span className="landlord-bar-due" style={{ width: '100%' }} /></div>
                        </div>
                        <div className="landlord-bar-row">
                          <div><span>Upcoming</span><strong>₦450,000</strong></div>
                          <div className="landlord-bar-track"><span className="landlord-bar-upcoming" style={{ width: '53%' }} /></div>
                        </div>
                        <div className="landlord-bar-row">
                          <div><span>Previously paid</span><strong>₦450,000</strong></div>
                          <div className="landlord-bar-track"><span className="landlord-bar-paid" style={{ width: '53%' }} /></div>
                        </div>
                      </div>
                      <p className="landlord-chart-footnote">These are sample records, not verified collections or live account balances.</p>
                    </article>

                    <article className="landlord-chart-panel">
                      <div className="landlord-chart-heading">
                        <div>
                          <span className="extended-kicker">PROPERTY OPERATIONS</span>
                          <h4>Requests and inspections</h4>
                        </div>
                        <Link to="/landlord/complaints">Manage cases ↗</Link>
                      </div>
                      <div className="landlord-operations-list">
                        <Link to="/landlord/complaints">
                          <span className="landlord-operation-icon">!</span>
                          <span><strong>Complaints</strong><small>1 open · 1 under review</small></span>
                          <b>2</b><i aria-hidden="true">↗</i>
                        </Link>
                        <Link to="/landlord/maintenance">
                          <span className="landlord-operation-icon">⚒</span>
                          <span><strong>Maintenance</strong><small>1 requested · 1 in progress</small></span>
                          <b>2</b><i aria-hidden="true">↗</i>
                        </Link>
                        <Link to="/landlord/inspections">
                          <span className="landlord-operation-icon">⌕</span>
                          <span><strong>Inspections</strong><small>1 pending · 1 completed</small></span>
                          <b>2</b><i aria-hidden="true">↗</i>
                        </Link>
                      </div>
                      <p className="landlord-chart-footnote">Counts reflect the illustrative records in the management modules.</p>
                    </article>
                  </div>

                  <div className="landlord-analytics-shortcuts">
                    <Link to="/landlord/tenants"><span>♙</span><div><strong>Tenant records</strong><small>Profiles and tenancy history</small></div><b>→</b></Link>
                    <Link to="/landlord/maintenance"><span>⚒</span><div><strong>Maintenance</strong><small>Repairs, assignments and costs</small></div><b>→</b></Link>
                    <Link to="/landlord/inspections"><span>⌕</span><div><strong>Inspections</strong><small>Property condition reports</small></div><b>→</b></Link>
                    <Link to="/landlord/reviews"><span>☆</span><div><strong>Reviews and disputes</strong><small>Feedback and moderation</small></div><b>→</b></Link>
                  </div>
                </section>
              )}


              <div className="workspace-dashboard-columns">
                <section className="workspace-dashboard-panel">
                  <div className="workspace-panel-heading">
                    <div>
                      <span className="extended-kicker">LATEST UPDATES</span>
                      <h3>Recent activity</h3>
                    </div>
                    <span className="workspace-panel-count">
                      {dashboard.activity.length}
                    </span>
                  </div>

                  <div className="workspace-activity-list">
                    {dashboard.activity.map((item, index) => (
                      <Link className="workspace-activity-item" key={item.title} to={dashboardActivityPaths[role][index] || `/${role}/dashboard`}>
                        <span className="workspace-activity-marker">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.description}</p>
                        </div>
                        <span className="workspace-status">
                          {item.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>

                <section className="workspace-dashboard-panel workspace-actions-panel">
                  <div className="workspace-panel-heading">
                    <div>
                      <span className="extended-kicker">GET THINGS DONE</span>
                      <h3>Quick actions</h3>
                    </div>
                    <span aria-hidden="true">↗</span>
                  </div>

                  <div className="workspace-action-list">
                    {dashboard.actions.map((action, index) => (
                      <Link to={action.path} key={action.path}>
                        <span className="workspace-action-number">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <strong>{action.label}</strong>
                        <span className="workspace-action-arrow">→</span>
                      </Link>
                    ))}
                  </div>
                </section>
              </div>

              <div className="workspace-dashboard-note">
                <span aria-hidden="true">✦</span>
                <div>
                  <strong>Your workspace is ready to grow.</strong>
                  <p>
                    These figures and activities are demonstration data.
                    Your real records will appear here when the corresponding
                    marketplace services are connected.
                  </p>
                </div>
              </div>

              {created.length > 0 && (
                <section className="workspace-dashboard-panel workspace-created-panel">
                  <h3>Your locally created entries</h3>
                  {created.map((item, index) => (
                    <p key={`${item}-${index}`}>{item} <span>Draft</span></p>
                  ))}
                </section>
              )}
            </div>
          ) : isCreate ? (
            <div className="extended-form-card workspace-form">
              <h3>Create a demonstration entry</h3>
              <p>This is a local preview. Use the dedicated listing editor to create a complete listing.</p>
              <form onSubmit={(event) => {
                event.preventDefault()
                const form = event.currentTarget
                const data = new FormData(form)
                const name = String(data.get('title') || '').trim()
                if (name) setCreated((previous) => [...previous, name])
                setNotice('Your sample entry has been added to this local session.')
                form.reset()
              }}>
                <label>
                  Title
                  <input name="title" required placeholder="Enter a title" />
                </label>
                <label>
                  Description
                  <textarea name="description" rows={4} required placeholder="Describe your entry" />
                </label>
                <label>
                  Price in naira
                  <input name="price" type="number" min="0" required placeholder="Enter amount" />
                </label>
                <button className="extended-primary" type="submit">
                  Save demonstration entry
                </button>
              </form>
              {notice && <p className="extended-success" role="status">{notice}</p>}
            </div>
          ) : isProfile ? (
            <ProfileEditor user={marketplaceUser} role={role} />
          ) : (
            <>
              <div className="workspace-record-toolbar">
                <div>
                  <h3>{active.label}</h3>
                  <p>Manage and review your {active.label.toLowerCase()}.</p>
                </div>
                <span>{records.length} sample records</span>
              </div>

              <input
                className="workspace-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${active.label.toLowerCase()}...`}
                aria-label={`Search ${active.label}`}
              />

              <div className="workspace-list">
                {records.map((record, index) => (
                  <article
                    key={`${record.title}-${index}`}
                    className="workspace-record-card"
                    role="button"
                    tabIndex={0}
                    aria-label={`View details for ${record.title}`}
                    onClick={() => record.path ? navigate(record.path) : setSelectedWorkspaceRecord(record)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        if (record.path) navigate(record.path)
                        else setSelectedWorkspaceRecord(record)
                      }
                    }}
                  >
                    <span className="workspace-list-icon" aria-hidden="true">
                      {role === 'buyer' ? '♡' :
                        role === 'landlord' ? '⌂' :
                        role === 'seller' ? '▣' :
                        role === 'provider' ? '✦' : '♙'}
                    </span>
                    <div>
                      <strong>{record.title}</strong>
                      <small>{record.description}</small>
                    </div>
                    <span className="workspace-record-status">{record.status}</span>
                  </article>
                ))}

                {records.length === 0 && (
                  <div className="workspace-empty-state">
                    <span aria-hidden="true">⌕</span>
                    <strong>No matching records</strong>
                    <p>Try another search term or check back later.</p>
                  </div>
                )}

                {created.map((item, index) => (
                  <article
                    key={`${item}-${index}`}
                    className="workspace-record-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedWorkspaceRecord({ title: item, description: 'Created in this browser session.', status: 'Draft' })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedWorkspaceRecord({ title: item, description: 'Created in this browser session.', status: 'Draft' })
                      }
                    }}
                  >
                    <span className="workspace-list-icon">＋</span>
                    <div>
                      <strong>{item}</strong>
                      <small>Created in this browser session.</small>
                    </div>
                    <span className="workspace-record-status">Draft</span>
                  </article>
                ))}
              </div>

              {selectedWorkspaceRecord && (
                <div className="shm-record-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedWorkspaceRecord(null) }}>
                  <section className="shm-record-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-record-modal-title">
                    <button type="button" className="shm-record-modal-close" onClick={() => setSelectedWorkspaceRecord(null)} aria-label="Close record details">×</button>
                    <span className="extended-kicker">{active.label.toUpperCase()} DETAILS</span>
                    <h3 id="workspace-record-modal-title">{selectedWorkspaceRecord.title}</h3>
                    <p>{selectedWorkspaceRecord.description}</p>
                    <div className="shm-record-detail-grid">
                      <div><span>Record type</span><strong>{active.label}</strong></div>
                      <div><span>Status</span><strong>{selectedWorkspaceRecord.status}</strong></div>
                    </div>
                    <button type="button" className="extended-secondary" onClick={() => setSelectedWorkspaceRecord(null)}>Close details</button>
                  </section>
                </div>
              )}
              {notice && <p className="extended-success" role="status">{notice}</p>}
            </>
          )}

          <p className="workspace-disclaimer">
            This is a frontend demonstration. Account permissions, publishing,
            messaging, payments and live records remain subject to secure
            backend integration.
          </p>
        </section>
      </div>
    </main>
  )
}
