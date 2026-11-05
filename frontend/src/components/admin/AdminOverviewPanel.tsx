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

function StatusCount({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`admin-overview-status-count status-${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
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
  const publishedRate = overview && overview.listings.liveTotal > 0
    ? Math.min(100, Math.round((overview.listings.published / overview.listings.liveTotal) * 100))
    : 0

  return (
    <section className="admin-overview-panel" aria-label="Marketplace administration overview">
      <div className="admin-overview-heading">
        <div>
          <span className="admin-kicker">PLATFORM AT A GLANCE</span>
          <h2>{isSuperAdmin ? 'Super Admin overview' : 'Administration overview'}</h2>
          <p>Live operational figures retrieved from the marketplace database.</p>
        </div>
        <div className="admin-overview-heading-actions">
          <span className="admin-overview-source"><i aria-hidden="true" /> Live database metrics</span>
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
            <MetricCard label="Total listings" value={overview.listings.total} detail={`${overview.listings.liveTotal.toLocaleString()} non-demo listings`} icon="⌂" tone="violet" onClick={can('listings.view') ? onOpenListings : undefined} />
            <MetricCard label="Published listings" value={overview.listings.published} detail="Currently published listings" icon="◈" tone="green" onClick={can('listings.view') ? onOpenListings : undefined} />
            <MetricCard label="Awaiting review" value={overview.listings.pendingReview} detail="Live listings pending moderation" icon="◷" tone="amber" onClick={can('listings.view') ? onOpenListings : undefined} />
            <MetricCard label="Administrator accounts" value={overview.administrators.total} detail={`${overview.administrators.superAdmins.toLocaleString()} Super Admin accounts`} icon="♧" tone="blue" onClick={can('users.view') ? onOpenUsers : undefined} />
            <MetricCard label="Categories" value={overview.categories.total} detail="Configured marketplace categories" icon="▦" tone="amber" onClick={can('categories.view') ? onOpenCategories : undefined} />
            <MetricCard label="Active sessions" value={overview.activeSessions} detail="Sessions that have not expired" icon="◉" tone="blue" onClick={can('audit.view') ? onOpenAudit : undefined} />
            <MetricCard label="Platform settings" value={overview.configuration.settingsCount} detail="Database-backed configuration records" icon="⚙" tone="violet" onClick={can('settings.view') ? onOpenSettings : undefined} />
            <MetricCard label="Audit activity, 7 days" value={overview.activity.auditActionsLast7Days} detail="Recorded actions in the last seven days" icon="▤" tone="green" onClick={can('audit.view') ? onOpenAudit : undefined} />
          </div>

          <div className="admin-overview-lower-grid">
            <section className="admin-overview-card admin-overview-pulse">
              <div className="admin-overview-card-heading">
                <div>
                  <span className="admin-kicker">ACCOUNT AND LISTING HEALTH</span>
                  <h3>Marketplace snapshot</h3>
                </div>
                <span className="admin-overview-card-mark" aria-hidden="true">⌁</span>
              </div>
              <div className="admin-overview-progress-item">
                <div><span>Active user accounts</span><strong>{activeRate}%</strong></div>
                <div className="admin-overview-progress-track"><span style={{ width: `${activeRate}%` }} /></div>
                <small>{overview.users.active.toLocaleString()} of {overview.users.total.toLocaleString()} registered users</small>
              </div>
              <div className="admin-overview-progress-item">
                <div><span>Published listings, excluding demos</span><strong>{publishedRate}%</strong></div>
                <div className="admin-overview-progress-track"><span style={{ width: `${publishedRate}%` }} /></div>
                <small>{overview.listings.published.toLocaleString()} of {overview.listings.liveTotal.toLocaleString()} live listings</small>
              </div>
              <p className="admin-overview-footnote">These are descriptive database ratios, not targets or ratings.</p>
            </section>

            <section className="admin-overview-card admin-overview-actions">
              <div className="admin-overview-card-heading">
                <div>
                  <span className="admin-kicker">LISTING WORKFLOW</span>
                  <h3>Current listing statuses</h3>
                </div>
                {can('listings.view') && <button type="button" className="admin-overview-text-link" onClick={onOpenListings}>Open moderation ↗</button>}
              </div>
              <div className="admin-overview-status-grid">
                <StatusCount label="Pending review" value={overview.listings.pendingReview} tone="warning" />
                <StatusCount label="Drafts" value={overview.listings.drafts} tone="neutral" />
                <StatusCount label="Paused" value={overview.listings.paused} tone="info" />
                <StatusCount label="Rejected" value={overview.listings.rejected} tone="danger" />
                <StatusCount label="Suspended" value={overview.listings.suspended} tone="danger" />
                <StatusCount label="Published" value={overview.listings.published} tone="success" />
              </div>
              <p className="admin-overview-footnote">Status counts exclude demonstration listings. Other listing states, such as rented or sold, remain included in the live total.</p>
            </section>
          </div>

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
