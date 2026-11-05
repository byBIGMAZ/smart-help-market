import type { AdminOverview } from '../../services/admin'
import './AdminOverviewPanel.css'

interface AdminOverviewPanelProps {
  overview: AdminOverview | null
  permissions: string[]
  isSuperAdmin: boolean
  onOpenUsers: () => void
  onOpenListings: () => void
  onOpenCategories: () => void
  onOpenSettings: () => void
  onOpenReports: () => void
  onOpenRoles: () => void
  onOpenAudit: () => void
  onOpenAutomation: () => void
  onRefresh: () => void
  refreshing: boolean
}

interface MetricCardProps {
  label: string
  value: number
  detail: string
  icon: string
  tone: 'green' | 'blue' | 'violet' | 'amber'
  onClick?: () => void
}

function MetricCard({ label, value, detail, icon, tone, onClick }: MetricCardProps) {
  const content = (
    <>
      <span className={`admin-overview-metric-icon tone-${tone}`} aria-hidden="true">{icon}</span>
      <span className="admin-overview-metric-label">{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <span className="admin-overview-metric-detail">{detail}</span>
    </>
  )

  if (!onClick) {
    return <article className="admin-overview-metric">{content}</article>
  }

  return (
    <button type="button" className="admin-overview-metric is-action" onClick={onClick}>
      {content}
      <span className="admin-overview-metric-arrow" aria-hidden="true">↗</span>
    </button>
  )
}

export default function AdminOverviewPanel({
  overview,
  permissions,
  isSuperAdmin,
  onOpenUsers,
  onOpenListings,
  onOpenCategories,
  onOpenSettings,
  onOpenReports,
  onOpenRoles,
  onOpenAudit,
  onOpenAutomation,
  onRefresh,
  refreshing,
}: AdminOverviewPanelProps) {
  const can = (permission: string) => isSuperAdmin || permissions.includes(permission)

  const quickActions = [
    { label: 'User management', description: 'Accounts, status and assigned roles', icon: '♙', permission: 'users.view', action: onOpenUsers },
    { label: 'Listing moderation', description: 'Review marketplace submissions', icon: '⌂', permission: 'listings.view', action: onOpenListings },
    { label: 'Categories', description: 'Manage marketplace structure', icon: '◇', permission: 'categories.view', action: onOpenCategories },
    { label: 'Platform settings', description: 'Review configurable platform rules', icon: '⚙', permission: 'settings.view', action: onOpenSettings },
    { label: 'Reports & analytics', description: 'Explore operational reporting', icon: '▥', permission: 'reports.view', action: onOpenReports },
    { label: 'Roles & permissions', description: 'Manage administrator access', icon: '♧', permission: 'roles.view', action: onOpenRoles },
    { label: 'Audit logs', description: 'Review recorded admin activity', icon: '▤', permission: 'audit.view', action: onOpenAudit },
    { label: 'Automation', description: 'Monitor automated operations', icon: '⟳', permission: 'automation.view', action: onOpenAutomation },
  ].filter((item) => can(item.permission))

  const activeRate = overview && overview.users.total > 0
    ? Math.min(100, Math.round((overview.users.active / overview.users.total) * 100))
    : 0
  const publishedRate = overview && overview.listings.total > 0
    ? Math.min(100, Math.round((overview.listings.published / overview.listings.total) * 100))
    : 0

  return (
    <section className="admin-overview-panel" aria-label="Marketplace administration overview">
      <div className="admin-overview-heading">
        <div>
          <span className="admin-kicker">PLATFORM AT A GLANCE</span>
          <h2>{isSuperAdmin ? 'Super Admin overview' : 'Administration overview'}</h2>
          <p>Key figures currently available from the marketplace database.</p>
        </div>
        <div className="admin-overview-heading-actions">
          <span className="admin-overview-source"><i aria-hidden="true" /> Database metrics</span>
          <button type="button" className="admin-secondary-button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {overview ? (
        <>
          <div className="admin-overview-metrics">
            <MetricCard label="Registered users" value={overview.users.total} detail={`${overview.users.active.toLocaleString()} active accounts`} icon="♙" tone="green" onClick={can('users.view') ? onOpenUsers : undefined} />
            <MetricCard label="Active accounts" value={overview.users.active} detail="Accounts currently marked active" icon="✓" tone="blue" onClick={can('users.view') ? onOpenUsers : undefined} />
            <MetricCard label="Total listings" value={overview.listings.total} detail={`${overview.listings.published.toLocaleString()} published listings`} icon="⌂" tone="violet" onClick={can('listings.view') ? onOpenListings : undefined} />
            <MetricCard label="Published listings" value={overview.listings.published} detail="Listings visible as published" icon="◈" tone="green" onClick={can('listings.view') ? onOpenListings : undefined} />
            <MetricCard label="Categories" value={overview.categories.total} detail="Configured marketplace categories" icon="▦" tone="amber" onClick={can('categories.view') ? onOpenCategories : undefined} />
            <MetricCard label="Active sessions" value={overview.activeSessions} detail="Sessions that have not expired" icon="◉" tone="blue" onClick={can('audit.view') ? onOpenAudit : undefined} />
          </div>

          <div className="admin-overview-lower-grid">
            <section className="admin-overview-card admin-overview-pulse">
              <div className="admin-overview-card-heading">
                <div>
                  <span className="admin-kicker">DATABASE SNAPSHOT</span>
                  <h3>Marketplace activity</h3>
                </div>
                <span className="admin-overview-card-mark" aria-hidden="true">⌁</span>
              </div>
              <div className="admin-overview-progress-item">
                <div><span>Active user accounts</span><strong>{activeRate}%</strong></div>
                <div className="admin-overview-progress-track"><span style={{ width: `${activeRate}%` }} /></div>
                <small>{overview.users.active.toLocaleString()} of {overview.users.total.toLocaleString()} registered users</small>
              </div>
              <div className="admin-overview-progress-item">
                <div><span>Published listings</span><strong>{publishedRate}%</strong></div>
                <div className="admin-overview-progress-track"><span style={{ width: `${publishedRate}%` }} /></div>
                <small>{overview.listings.published.toLocaleString()} of {overview.listings.total.toLocaleString()} total listings</small>
              </div>
              <p className="admin-overview-footnote">Percentages are calculated from the live totals above. They are descriptive ratios, not performance targets.</p>
            </section>

            <section className="admin-overview-card admin-overview-actions">
              <div className="admin-overview-card-heading">
                <div>
                  <span className="admin-kicker">WORKSPACE SHORTCUTS</span>
                  <h3>Quick access</h3>
                </div>
                <span className="admin-overview-card-count">{quickActions.length} available</span>
              </div>
              {quickActions.length > 0 ? (
                <div className="admin-overview-quick-grid">
                  {quickActions.map((item) => (
                    <button type="button" className="admin-overview-quick-action" key={item.label} onClick={item.action}>
                      <span className="admin-overview-quick-icon" aria-hidden="true">{item.icon}</span>
                      <span><strong>{item.label}</strong><small>{item.description}</small></span>
                      <span className="admin-overview-quick-arrow" aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="admin-overview-empty">No additional modules are assigned to this administrator.</p>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="admin-overview-unavailable" role="status">
          <span aria-hidden="true">◷</span>
          <div><strong>Dashboard statistics are unavailable</strong><p>We could not retrieve the current database totals. Try refreshing the overview.</p></div>
          <button type="button" className="admin-secondary-button" onClick={onRefresh} disabled={refreshing}>Retry</button>
        </div>
      )}
    </section>
  )
}
