
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import {
  adminLogin,
  adminLogout,
  getAdminOverview,
  getCurrentAdmin,
  type AdminOverview,
  type AdminUser,
} from './services/admin'

import {
  getAdminUsers,
  changeAdminUserStatus,
  updateAdminUserRoles,
  type AdminManagedUser,
  type AccountStatus,
} from './services/adminUsers'

import {
  getAdminRoles,
  createAdminRole,
  getAdminPermissions,
  saveAdminRolePermissions,
  type AdminRole,
  type AdminRolePermission,
} from './services/adminRoles'

import {
  getAdminAuditLogs,
  type AdminAuditLog,
} from './services/adminAuditLogs'

import AdminListingModeration from './AdminListingModeration'
import AdminCategoryManagement from './AdminCategoryManagement'
import AdminSettingsManagement from './AdminSettingsManagement'
import AdminReports from './AdminReports'
import AdminAutomation from './AdminAutomation'
import AdminAutomationRules from './AdminAutomationRules'
import AdminAutomationMonitoring from './AdminAutomationMonitoring'

import './AdminApp.css'
import './AdminAuditLogs.css'
import './AdminSystemTheme.css'

type Screen = 'checking' | 'login' | 'dashboard'

type AdminSection =
  | 'overview'
  | 'users'
  | 'roles'
  | 'moderation'
  | 'categories'
  | 'settings'
  | 'reports'
  | 'audit'
  | 'automation'
  | 'automation-rules'
  | 'automation-monitoring'

type UserStatusFilter = 'all' | AccountStatus

const USER_PAGE_SIZE = 25
const AUDIT_PAGE_SIZE = 25

function formatDate(value: string | null): string {
  if (!value) return 'Never'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatAction(value: string): string {
  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function AdminApp() {
  const [screen, setScreen] = useState<Screen>('checking')
  const [section, setSection] = useState<AdminSection>('overview')
  const [user, setUser] = useState<AdminUser | null>(null)
  const [overview, setOverview] = useState<AdminOverview | null>(null)

  // Authentication
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // User management
  const [adminUsers, setAdminUsers] = useState<AdminManagedUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [statusChangingUserId, setStatusChangingUserId] =
    useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userStatus, setUserStatus] = useState<UserStatusFilter>('all')
  const [userOffset, setUserOffset] = useState(0)
  const [userTotal, setUserTotal] = useState(0)

  // User role assignment
  const [selectedRoleUserId, setSelectedRoleUserId] =
    useState<string | null>(null)
  const [selectedUserRoleIds, setSelectedUserRoleIds] =
    useState<string[]>([])
  const [userRoleEditorLoading, setUserRoleEditorLoading] =
    useState(false)
  const [userRoleSaving, setUserRoleSaving] = useState(false)
  const [userRoleError, setUserRoleError] = useState('')

  // Role management
  const [adminRoles, setAdminRoles] = useState<AdminRole[]>([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesError, setRolesError] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDescription, setNewRoleDescription] = useState('')
  const [roleCreating, setRoleCreating] = useState(false)

  // Permission management
  const [permissionCatalogue, setPermissionCatalogue] =
    useState<AdminRolePermission[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [selectedPermissionKeys, setSelectedPermissionKeys] =
    useState<string[]>([])
  const [permissionEditorLoading, setPermissionEditorLoading] =
    useState(false)
  const [permissionSaving, setPermissionSaving] = useState(false)
  const [permissionError, setPermissionError] = useState('')

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([])
  const [auditActions, setAuditActions] = useState<string[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditAction, setAuditAction] = useState('')
  const [auditStartDate, setAuditStartDate] = useState('')
  const [auditEndDate, setAuditEndDate] = useState('')
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditHasMore, setAuditHasMore] = useState(false)
  const [auditGeneratedAt, setAuditGeneratedAt] = useState('')
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    const data = await getAdminOverview()
    setOverview(data)
  }, [])

  const loadUsers = useCallback(
    async (
      search = userSearch,
      status: UserStatusFilter = userStatus,
      offset = userOffset,
    ) => {
      setUsersLoading(true)
      setUsersError('')

      try {
        const result = await getAdminUsers({
          search,
          status,
          limit: USER_PAGE_SIZE,
          offset,
        })

        setAdminUsers(result.users)
        setUserTotal(result.pagination.total)
        setUserOffset(result.pagination.offset)
      } catch (err) {
        setAdminUsers([])
        setUserTotal(0)
        setUsersError(
          err instanceof Error
            ? err.message
            : 'Unable to load the user directory.',
        )
      } finally {
        setUsersLoading(false)
      }
    },
    [userSearch, userStatus, userOffset],
  )

  const loadRoles = useCallback(async () => {
    setRolesLoading(true)
    setRolesError('')

    try {
      const result = await getAdminRoles()
      setAdminRoles(result.roles)
    } catch (err) {
      setAdminRoles([])
      setRolesError(
        err instanceof Error
          ? err.message
          : 'Unable to load the role directory.',
      )
    } finally {
      setRolesLoading(false)
    }
  }, [])

  const loadAuditLogs = useCallback(
    async (
      search = auditSearch,
      action = auditAction,
      startDate = auditStartDate,
      endDate = auditEndDate,
      offset = auditOffset,
    ) => {
      setAuditLoading(true)
      setAuditError('')

      try {
        const result = await getAdminAuditLogs({
          search,
          action,
          startDate,
          endDate,
          limit: AUDIT_PAGE_SIZE,
          offset,
        })

        setAuditLogs(result.auditLogs)
        setAuditActions(result.availableActions)
        setAuditTotal(result.pagination.total)
        setAuditOffset(result.pagination.offset)
        setAuditHasMore(result.pagination.hasMore)
        setAuditGeneratedAt(result.generatedAt)
        setExpandedAuditId(null)
      } catch (err) {
        setAuditLogs([])
        setAuditTotal(0)
        setAuditHasMore(false)
        setAuditError(
          err instanceof Error
            ? err.message
            : 'Unable to load audit activity.',
        )
      } finally {
        setAuditLoading(false)
      }
    },
    [auditSearch, auditAction, auditStartDate, auditEndDate, auditOffset],
  )

  // Create a custom role
  async function handleCreateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setRolesError('')
    setNotice('')
    setRoleCreating(true)

    try {
      const result = await createAdminRole({
        roleName: newRoleName.trim(),
        description: newRoleDescription.trim(),
      })

      setNewRoleName('')
      setNewRoleDescription('')
      setNotice(result.message)

      await loadRoles()
    } catch (err) {
      setRolesError(
        err instanceof Error ? err.message : 'Unable to create this role.',
      )
    } finally {
      setRoleCreating(false)
    }
  }

  // Open permission editor
  async function openPermissionEditor(role: AdminRole) {
    if (role.roleKey === 'super_admin') return

    setSelectedRoleId(role.id)
    setSelectedPermissionKeys(role.permissions.map((item) => item.key))
    setPermissionError('')
    setPermissionEditorLoading(true)

    try {
      const result = await getAdminPermissions()
      setPermissionCatalogue(result.permissions)
    } catch (err) {
      setPermissionError(
        err instanceof Error
          ? err.message
          : 'Unable to load available permissions.',
      )
    } finally {
      setPermissionEditorLoading(false)
    }
  }

  function togglePermission(permissionKey: string, checked: boolean) {
    setSelectedPermissionKeys((current) =>
      checked
        ? current.includes(permissionKey)
          ? current
          : [...current, permissionKey]
        : current.filter((key) => key !== permissionKey),
    )
  }

  async function handleSavePermissions() {
    if (!selectedRoleId) return

    setPermissionSaving(true)
    setPermissionError('')
    setNotice('')

    try {
      const result = await saveAdminRolePermissions(
        selectedRoleId,
        selectedPermissionKeys,
      )

      setNotice(result.message)
      setSelectedRoleId(null)

      await loadRoles()
    } catch (err) {
      setPermissionError(
        err instanceof Error
          ? err.message
          : 'Unable to save role permissions.',
      )
    } finally {
      setPermissionSaving(false)
    }
  }

  // Check existing administrator session
  useEffect(() => {
    let active = true

    getCurrentAdmin()
      .then(async (currentUser) => {
        if (!active) return

        if (
          !currentUser ||
          !currentUser.roles.includes('super_admin')
        ) {
          setScreen('login')
          return
        }

        setUser(currentUser)

        try {
          await loadOverview()
        } catch {
          if (active) {
            setError('Dashboard statistics could not be loaded.')
          }
        }

        if (active) setScreen('dashboard')
      })
      .catch(() => {
        if (active) {
          setError('Unable to check your session. Please try again.')
          setScreen('login')
        }
      })

    return () => {
      active = false
    }
  }, [loadOverview])

  // Administrator login
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const loggedInUser = await adminLogin(email.trim(), password)

      if (!loggedInUser.roles.includes('super_admin')) {
        await adminLogout()
        throw new Error('This account does not have Super Admin access.')
      }

      setUser(loggedInUser)
      setPassword('')

      try {
        await loadOverview()
      } catch {
        setError('Signed in, but dashboard statistics could not be loaded.')
      }

      setScreen('dashboard')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Login failed. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  // Administrator logout
  async function handleLogout() {
    setBusy(true)
    setError('')

    try {
      await adminLogout()
      setUser(null)
      setOverview(null)
      setAdminUsers([])
      setAdminRoles([])
      setAuditLogs([])
      setSelectedRoleId(null)
      setSelectedRoleUserId(null)
      setPassword('')
      setNotice('You have signed out successfully.')
      setScreen('login')
    } catch {
      setError('Unable to sign out. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function refreshOverview() {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      await loadOverview()
      setNotice('Dashboard statistics refreshed.')
    } catch {
      setError('Unable to refresh dashboard statistics.')
    } finally {
      setBusy(false)
    }
  }

  // Navigation
  function openUsers() {
    setSection('users')
    setSelectedRoleId(null)
    setSelectedRoleUserId(null)
    setError('')
    setNotice('')
    setUserSearch('')
    setUserStatus('all')
    setUserOffset(0)
    void loadUsers('', 'all', 0)
  }

  function openOverview() {
    setSection('overview')
    setSelectedRoleId(null)
    setSelectedRoleUserId(null)
    setUsersError('')
    setRolesError('')
    setAuditError('')
    setError('')
    setNotice('')
  }

  function openRoles() {
    setSection('roles')
    setSelectedRoleId(null)
    setSelectedRoleUserId(null)
    setError('')
    setNotice('')
    setUsersError('')
    void loadRoles()
  }

  function openModeration() {
    setSection('moderation')
    setSelectedRoleId(null)
    setSelectedRoleUserId(null)
    setUsersError('')
    setRolesError('')
    setAuditError('')
    setError('')
    setNotice('')
  }

  function openCategories() {
    setSection('categories')
    setSelectedRoleId(null)
    setSelectedRoleUserId(null)
    setUsersError('')
    setRolesError('')
    setAuditError('')
    setError('')
    setNotice('')
  }

  function openSettings() {
  setSection('settings')
  setSelectedRoleId(null)
  setSelectedRoleUserId(null)
  setUsersError('')
  setRolesError('')
  setAuditError('')
  setError('')
  setNotice('')
}

function openReports() {
  setSection('reports')
  setSelectedRoleId(null)
  setSelectedRoleUserId(null)
  setUsersError('')
  setRolesError('')
  setAuditError('')
  setError('')
  setNotice('')
}

function openAutomation() {
  setSection('automation')
  setSelectedRoleId(null)
  setSelectedRoleUserId(null)
  setUsersError('')
  setRolesError('')
  setAuditError('')
  setError('')
  setNotice('')
}

function openAutomationRules() {
  setSection('automation-rules')
  setSelectedRoleId(null)
  setSelectedRoleUserId(null)
  setUsersError('')
  setRolesError('')
  setAuditError('')
  setError('')
  setNotice('')
}

function openAutomationMonitoring() {
  setSection('automation-monitoring')
  setSelectedRoleId(null)
  setSelectedRoleUserId(null)
  setUsersError('')
  setRolesError('')
  setAuditError('')
  setError('')
  setNotice('')
}

  function openAuditLogs() {
    setSection('audit')
    setSelectedRoleId(null)
    setSelectedRoleUserId(null)
    setError('')
    setNotice('')
    setAuditSearch('')
    setAuditAction('')
    setAuditStartDate('')
    setAuditEndDate('')
    setAuditOffset(0)
    void loadAuditLogs('', '', '', '', 0)
  }

  // User filters
  function applyUserFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void loadUsers(userSearch, userStatus, 0)
  }

  function changeUserStatusFilter(value: UserStatusFilter) {
    setUserStatus(value)
    void loadUsers(userSearch, value, 0)
  }

  function goToUserPage(offset: number) {
    if (offset < 0 || offset >= userTotal) return
    void loadUsers(userSearch, userStatus, offset)
  }

  // Account status
  async function handleAccountStatusChange(
    managedUser: AdminManagedUser,
    action: 'suspend' | 'reactivate',
  ) {
    const actionLabel = action === 'suspend' ? 'suspend' : 'reactivate'

    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabel} ${managedUser.displayName} (${managedUser.email})? ${
        action === 'suspend'
          ? 'Their existing sessions will be revoked.'
          : 'They will be able to sign in again with their existing credentials.'
      }`,
    )

    if (!confirmed) return

    setStatusChangingUserId(managedUser.id)
    setError('')
    setNotice('')
    setUsersError('')

    try {
      const result = await changeAdminUserStatus(managedUser.id, action)

      setNotice(result.message)

      await Promise.all([
        loadUsers(userSearch, userStatus, userOffset),
        loadOverview(),
      ])
    } catch (err) {
      setUsersError(
        err instanceof Error
          ? err.message
          : 'Unable to change this account status.',
      )
    } finally {
      setStatusChangingUserId(null)
    }
  }

  // User role assignment
  async function openUserRoleEditor(managedUser: AdminManagedUser) {
    if (
      managedUser.id === user?.id ||
      managedUser.accountStatus !== 'active'
    ) {
      return
    }

    setSelectedRoleUserId(managedUser.id)
    setSelectedUserRoleIds([])
    setUserRoleError('')
    setUserRoleEditorLoading(true)
    setRolesError('')

    try {
      const result = await getAdminRoles()
      setAdminRoles(result.roles)

      const assignedRoleIds = result.roles
        .filter((role) => managedUser.roles.includes(role.roleKey))
        .map((role) => role.id)

      setSelectedUserRoleIds(assignedRoleIds)
    } catch (err) {
      setUserRoleError(
        err instanceof Error
          ? err.message
          : 'Unable to load available roles.',
      )
    } finally {
      setUserRoleEditorLoading(false)
    }
  }

  function toggleUserRole(roleId: string, checked: boolean) {
    setSelectedUserRoleIds((current) =>
      checked
        ? current.includes(roleId)
          ? current
          : [...current, roleId]
        : current.filter((id) => id !== roleId),
    )
  }

  async function handleSaveUserRoles() {
    if (!selectedRoleUserId) return

    setUserRoleSaving(true)
    setUserRoleError('')
    setError('')
    setNotice('')

    try {
      const result = await updateAdminUserRoles(
        selectedRoleUserId,
        selectedUserRoleIds,
      )

      setNotice(result.message)
      setSelectedRoleUserId(null)
      setSelectedUserRoleIds([])

      await loadUsers(userSearch, userStatus, userOffset)
    } catch (err) {
      setUserRoleError(
        err instanceof Error
          ? err.message
          : 'Unable to update this user’s roles.',
      )
    } finally {
      setUserRoleSaving(false)
    }
  }

  // Audit filters and pagination
  function applyAuditFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuditOffset(0)
    void loadAuditLogs(
      auditSearch,
      auditAction,
      auditStartDate,
      auditEndDate,
      0,
    )
  }

  function resetAuditFilters() {
    setAuditSearch('')
    setAuditAction('')
    setAuditStartDate('')
    setAuditEndDate('')
    setAuditOffset(0)
    void loadAuditLogs('', '', '', '', 0)
  }

  function goToAuditPage(offset: number) {
    if (offset < 0 || offset >= auditTotal) return

    void loadAuditLogs(
      auditSearch,
      auditAction,
      auditStartDate,
      auditEndDate,
      offset,
    )
  }

  // Permission editor
  function renderPermissionEditor() {
    if (!selectedRoleId) return null

    const selectedRole = adminRoles.find(
      (role) => role.id === selectedRoleId,
    )

    if (!selectedRole) return null

    const permissionGroups = [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'users', label: 'User Management' },
      { key: 'roles', label: 'Role Management' },
      { key: 'listings', label: 'Listings' },
      { key: 'categories', label: 'Categories' },
      { key: 'settings', label: 'Platform Settings' },
      { key: 'reports', label: 'Reports & Analytics' },
      { key: 'audit', label: 'Audit Logs' },
      { key: 'profile', label: 'User Profile' },
    ]

    return (
      <section className="admin-permission-editor">
        <div className="admin-permission-editor-heading">
          <div>
            <span className="admin-kicker">PERMISSION CONFIGURATION</span>
            <h3>{selectedRole.roleName}</h3>
            <p>Select the permissions this role should have.</p>
          </div>

          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => setSelectedRoleId(null)}
            disabled={permissionSaving}
          >
            Close
          </button>
        </div>

        {permissionError && (
          <div className="admin-message admin-error" role="alert">
            {permissionError}
          </div>
        )}

        {permissionEditorLoading ? (
          <div className="admin-empty-panel">
            Loading permission catalogue…
          </div>
        ) : (
          <>
            <div className="admin-permission-toolbar">
              <span>
                <strong>{selectedPermissionKeys.length}</strong> of{' '}
                {permissionCatalogue.length} permissions selected
              </span>

              <div>
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={() =>
                    setSelectedPermissionKeys(
                      permissionCatalogue.map((permission) => permission.key),
                    )
                  }
                >
                  Select all
                </button>

                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={() => setSelectedPermissionKeys([])}
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="admin-permission-groups">
              {permissionGroups.map((group) => {
                const groupPermissions = permissionCatalogue.filter(
                  (permission) =>
                    permission.key.startsWith(`${group.key}.`),
                )

                if (groupPermissions.length === 0) return null

                return (
                  <div className="admin-permission-group" key={group.key}>
                    <h4>{group.label}</h4>

                    {groupPermissions.map((permission) => (
                      <label
                        className="admin-permission-option"
                        key={permission.key}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPermissionKeys.includes(
                            permission.key,
                          )}
                          onChange={(event) =>
                            togglePermission(
                              permission.key,
                              event.target.checked,
                            )
                          }
                        />

                        <span>
                          <strong>{permission.name}</strong>
                          <small>{permission.key}</small>
                          {permission.description && (
                            <p>{permission.description}</p>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>

            <div className="admin-permission-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => setSelectedRoleId(null)}
                disabled={permissionSaving}
              >
                Cancel
              </button>

              <button
                type="button"
                className="admin-primary-button"
                onClick={() => void handleSavePermissions()}
                disabled={permissionSaving}
              >
                {permissionSaving ? 'Saving permissions…' : 'Save permissions'}
              </button>
            </div>
          </>
        )}
      </section>
    )
  }

  // Login checking screen
  if (screen === 'checking') {
    return (
      <main className="admin-shell">
        <div className="admin-loading">
          <div className="admin-brand-mark">SH</div>
          <h1>SMART HELP MARKET</h1>
          <p>Checking your secure session…</p>
        </div>
      </main>
    )
  }

  // Login screen
  if (screen === 'login') {
    return (
      <main className="admin-shell">
        <section className="admin-login-layout">
          <div className="admin-login-brand">
            <div className="admin-brand-mark">SH</div>
            <span className="admin-kicker">BY BIGMAZ</span>
            <h1>Manage the marketplace with confidence.</h1>
            <p>
              Secure administration for users, listings, platform activity
              and marketplace operations.
            </p>
            <div className="admin-security-note">
              <span aria-hidden="true">◆</span>
              Access is checked by the server.
            </div>
          </div>

          <form className="admin-login-card" onSubmit={handleLogin}>
            <span className="admin-kicker">RESTRICTED ACCESS</span>
            <h2>Super Admin</h2>
            <p className="admin-muted">
              Sign in using your provisioned administrator account.
            </p>

            {error && (
              <div className="admin-message admin-error" role="alert">
                {error}
              </div>
            )}

            {notice && (
              <div className="admin-message" role="status">
                {notice}
              </div>
            )}

            <label className="admin-field">
              Email address
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
                placeholder="admin@example.com"
              />
            </label>

            <label className="admin-field">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={128}
                placeholder="Enter your password"
              />
            </label>

            <button
              className="admin-primary-button"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Signing in…' : 'Sign in securely'}
              <span aria-hidden="true">→</span>
            </button>

            <a className="admin-back-link" href="/">
              ← Return to public marketplace
            </a>
          </form>
        </section>
      </main>
    )
  }

  // Main dashboard
  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <a className="admin-brand" href="/">
          <span className="admin-brand-mark">SH</span>
          <span>
            <strong>SMART HELP MARKET</strong>
            <small>SUPER ADMIN CONSOLE</small>
          </span>
        </a>

        <div className="admin-topbar-actions">
          <span className="admin-status">
            <span /> Administrator
          </span>

          <button
            className="admin-secondary-button"
            onClick={handleLogout}
            disabled={busy}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="admin-content">
        <div className="admin-page-heading">
          <div>
            <span className="admin-kicker">PLATFORM CONTROL CENTRE</span>
            <h1>
              Good to see you, {user?.displayName || 'Administrator'}.
            </h1>
            <p>Manage your marketplace from one secure workspace.</p>
          </div>

          {section === 'overview' && (
            <button
              className="admin-primary-button admin-refresh-button"
              onClick={refreshOverview}
              disabled={busy}
            >
              ↻ {busy ? 'Working…' : 'Refresh statistics'}
            </button>
          )}
        </div>

        {error && (
          <div className="admin-message admin-error" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="admin-message" role="status">
            {notice}
          </div>
        )}

        {/* MAIN NAVIGATION */}
        <nav className="admin-section-nav" aria-label="Admin sections">
          <button
            type="button"
            className={`admin-nav-button ${
              section === 'overview' ? 'is-active' : ''
            }`}
            aria-current={section === 'overview' ? 'page' : undefined}
            onClick={openOverview}
          >
            <span aria-hidden="true">▦</span>
            Overview
          </button>

          <button
            type="button"
            className={`admin-nav-button ${
              section === 'users' ? 'is-active' : ''
            }`}
            aria-current={section === 'users' ? 'page' : undefined}
            onClick={openUsers}
          >
            <span aria-hidden="true">♙</span>
            User Management
          </button>

          <button
            type="button"
            className={`admin-nav-button ${
              section === 'moderation' ? 'is-active' : ''
            }`}
            aria-current={section === 'moderation' ? 'page' : undefined}
            onClick={openModeration}
          >
            <span aria-hidden="true">◈</span>
            Listing Moderation
          </button>

          <button
            type="button"
            className={`admin-nav-button ${
              section === 'categories' ? 'is-active' : ''
            }`}
            aria-current={section === 'categories' ? 'page' : undefined}
            onClick={openCategories}
          >
            <span aria-hidden="true">◇</span>
            Categories
          </button>

          <button
            type="button"
            className={`admin-nav-button ${
            section === 'settings' ? 'is-active' : ''
            }`}
            aria-current={section === 'settings' ? 'page' : undefined}
            onClick={openSettings}
          >
            <span aria-hidden="true">⚙</span>
            Platform Settings
          </button>

          <button
  type="button"
  className={`admin-nav-button ${
    section === 'reports' ? 'is-active' : ''
  }`}
  aria-current={section === 'reports' ? 'page' : undefined}
  onClick={openReports}
>
  <span aria-hidden="true">▥</span>
  Reports &amp; Analytics
</button>

<button
  type="button"
  className={`admin-nav-button ${
    section === 'automation' ? 'is-active' : ''
  }`}
  aria-current={section === 'automation' ? 'page' : undefined}
  onClick={openAutomation}
>
  <span aria-hidden="true">⚡</span>
  Automation Control
</button>

<button
  type="button"
  className={`admin-nav-button ${
    section === 'automation-rules' ? 'is-active' : ''
  }`}
  aria-current={section === 'automation-rules' ? 'page' : undefined}
  onClick={openAutomationRules}
>
  <span aria-hidden="true">⚙</span>
  Automation Rules
</button>

<button
  type="button"
  className={`admin-nav-button ${
    section === 'automation-monitoring' ? 'is-active' : ''
  }`}
  aria-current={section === 'automation-monitoring' ? 'page' : undefined}
  onClick={openAutomationMonitoring}
>
  <span aria-hidden="true">📊</span>
  Automation Monitoring
</button>

          <button
            type="button"
            className={`admin-nav-button ${
              section === 'roles' ? 'is-active' : ''
            }`}
            aria-current={section === 'roles' ? 'page' : undefined}
            onClick={openRoles}
          >
            <span aria-hidden="true">🛡</span>
            Role Management
          </button>

          <button
            type="button"
            className={`admin-nav-button ${
              section === 'audit' ? 'is-active' : ''
            }`}
            aria-current={section === 'audit' ? 'page' : undefined}
            onClick={openAuditLogs}
          >
            <span aria-hidden="true">▤</span>
            Audit Logs
          </button>
        </nav>

        {/* OVERVIEW */}
        {section === 'overview' && (
          <>
            <div className="admin-welcome-panel">
              <div>
                <span className="admin-panel-label">YOUR PLATFORM</span>
                <h2>SMART HELP MARKET BY BIGMAZ</h2>
                <p>
                  Properties, products and services in one marketplace.
                </p>
              </div>

              <div className="admin-welcome-symbol" aria-hidden="true">
                SH
              </div>
            </div>

            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">LIVE DATABASE COUNTS</span>
                <h2>Marketplace overview</h2>
              </div>

              <span className="admin-live-label">
                <span /> Server data
              </span>
            </div>

            {overview ? (
              <div className="admin-stat-grid">
                <article className="admin-stat-card">
                  <span className="admin-stat-icon">♙</span>
                  <span className="admin-stat-label">Total users</span>
                  <strong>{overview.users.total.toLocaleString()}</strong>
                  <small>{overview.users.active} active accounts</small>
                </article>

                <article className="admin-stat-card">
                  <span className="admin-stat-icon">⌂</span>
                  <span className="admin-stat-label">Total listings</span>
                  <strong>{overview.listings.total.toLocaleString()}</strong>
                  <small>{overview.listings.published} published</small>
                </article>

                <article className="admin-stat-card">
                  <span className="admin-stat-icon">◇</span>
                  <span className="admin-stat-label">Categories</span>
                  <strong>{overview.categories.total.toLocaleString()}</strong>
                  <small>Marketplace categories</small>
                </article>

                <article className="admin-stat-card">
                  <span className="admin-stat-icon">◉</span>
                  <span className="admin-stat-label">Active sessions</span>
                  <strong>{overview.activeSessions.toLocaleString()}</strong>
                  <small>Sessions not yet expired</small>
                </article>
              </div>
            ) : (
              <div className="admin-empty-panel">
                <h3>Statistics are not available yet</h3>
                <p>Refresh the dashboard to try loading them again.</p>
                <button
                  className="admin-secondary-button"
                  onClick={refreshOverview}
                  disabled={busy}
                >
                  Retry
                </button>
              </div>
            )}

            <section className="admin-next-panel">
              <span className="admin-kicker">ADMINISTRATION ROADMAP</span>
              <h2>Marketplace administration is growing.</h2>
              <p>
                Core account controls, access management, listing moderation,
                category administration and administrative activity are
                available. Platform settings, reporting and workflow
                automation are planned.
              </p>

              <div className="admin-roadmap-list">
                <span>✓ Protected administrator sign-in</span>
                <span>✓ Session-aware dashboard</span>
                <span>✓ Live database statistics</span>
                <span>✓ User account management</span>
                <span>✓ Role and permission directory</span>
                <span>✓ Listing review and moderation</span>
                <span>✓ Audit activity directory</span>
                <span>✓ Category management</span>
                <span>✓ Platform settings</span>
                <span>✓ Reports and operational analytics</span>
                <span>○ Workflow automation</span>
              </div>
            </section>
          </>
        )}

        {/* USER MANAGEMENT */}
        {section === 'users' && (
          <section className="admin-users-section">
            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">ACCOUNT DIRECTORY</span>
                <h2>User Management</h2>
                <p className="admin-users-description">
                  Search accounts and review their status, roles and activity.
                </p>
              </div>

              <span className="admin-live-label">
                <span /> Protected data
              </span>
            </div>

            <form className="admin-user-filters" onSubmit={applyUserFilters}>
              <label className="admin-user-search">
                Search users
                <input
                  type="search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search by name or email"
                  maxLength={100}
                />
              </label>

              <label className="admin-user-status-filter">
                Account status
                <select
                  value={userStatus}
                  onChange={(event) =>
                    changeUserStatusFilter(
                      event.target.value as UserStatusFilter,
                    )
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>

              <button
                className="admin-primary-button"
                type="submit"
                disabled={usersLoading}
              >
                {usersLoading ? 'Searching…' : 'Search'}
              </button>
            </form>

            <div className="admin-users-summary">
              <span>
                {usersLoading
                  ? 'Loading users…'
                  : `${userTotal.toLocaleString()} account${
                      userTotal === 1 ? '' : 's'
                    } found`}
              </span>

              <button
                className="admin-secondary-button"
                type="button"
                onClick={() =>
                  void loadUsers(userSearch, userStatus, userOffset)
                }
                disabled={usersLoading}
              >
                ↻ Refresh list
              </button>
            </div>

            {usersError && (
              <div className="admin-message admin-error" role="alert">
                {usersError}
              </div>
            )}

            {!usersError && usersLoading && (
              <div className="admin-empty-panel" role="status">
                Loading the protected user directory…
              </div>
            )}

            {!usersError && !usersLoading && adminUsers.length === 0 && (
              <div className="admin-empty-panel">
                <h3>No users found</h3>
                <p>
                  Try a different search term or select another account status.
                </p>
              </div>
            )}

            {!usersError && adminUsers.length > 0 && (
              <>
                <div className="admin-users-table-wrap">
                  <table className="admin-users-table">
                    <thead>
                      <tr>
                        <th scope="col">User</th>
                        <th scope="col">Account status</th>
                        <th scope="col">Roles</th>
                        <th scope="col">Email verification</th>
                        <th scope="col">Last login</th>
                        <th scope="col">Registered</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {adminUsers.map((managedUser) => (
                        <tr key={managedUser.id}>
                          <td>
                            <div className="admin-user-identity">
                              <strong>{managedUser.displayName}</strong>
                              <span>{managedUser.email}</span>
                              <small>ID: {managedUser.id}</small>
                            </div>
                          </td>

                          <td>
                            <span
                              className={`admin-account-status status-${managedUser.accountStatus}`}
                            >
                              {managedUser.accountStatus}
                            </span>
                          </td>

                          <td>
                            <div className="admin-user-roles">
                              {managedUser.roles.length > 0
                                ? managedUser.roles.join(', ')
                                : 'No roles assigned'}
                            </div>
                          </td>

                          <td>
                            <span
                              className={
                                managedUser.emailVerified
                                  ? 'admin-verification verified'
                                  : 'admin-verification unverified'
                              }
                            >
                              {managedUser.emailVerified
                                ? 'Verified'
                                : 'Not verified'}
                            </span>
                          </td>

                          <td>{formatDate(managedUser.lastLoginAt)}</td>
                          <td>{formatDate(managedUser.createdAt)}</td>

                          <td>
                            {managedUser.id === user?.id ? (
                              <span className="admin-muted">Your account</span>
                            ) : (
                              <div className="admin-user-action-buttons">
                                {managedUser.accountStatus === 'active' && (
                                  <button
                                    className="admin-secondary-button"
                                    type="button"
                                    onClick={() =>
                                      void openUserRoleEditor(managedUser)
                                    }
                                    disabled={
                                      statusChangingUserId !== null ||
                                      userRoleSaving
                                    }
                                  >
                                    Manage Roles
                                  </button>
                                )}

                                {managedUser.accountStatus === 'active' ? (
                                  <button
                                    className="admin-secondary-button"
                                    type="button"
                                    onClick={() =>
                                      void handleAccountStatusChange(
                                        managedUser,
                                        'suspend',
                                      )
                                    }
                                    disabled={statusChangingUserId !== null}
                                  >
                                    {statusChangingUserId === managedUser.id
                                      ? 'Working…'
                                      : 'Suspend'}
                                  </button>
                                ) : managedUser.accountStatus === 'suspended' ? (
                                  <button
                                    className="admin-secondary-button"
                                    type="button"
                                    onClick={() =>
                                      void handleAccountStatusChange(
                                        managedUser,
                                        'reactivate',
                                      )
                                    }
                                    disabled={statusChangingUserId !== null}
                                  >
                                    {statusChangingUserId === managedUser.id
                                      ? 'Working…'
                                      : 'Reactivate'}
                                  </button>
                                ) : (
                                  <span className="admin-muted">
                                    No action available
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="admin-user-pagination">
                  <span>
                    Showing {userOffset + 1}–
                    {Math.min(userOffset + adminUsers.length, userTotal)} of{' '}
                    {userTotal}
                  </span>

                  <div>
                    <button
                      className="admin-secondary-button"
                      type="button"
                      onClick={() =>
                        goToUserPage(userOffset - USER_PAGE_SIZE)
                      }
                      disabled={usersLoading || userOffset === 0}
                    >
                      ← Previous
                    </button>

                    <button
                      className="admin-secondary-button"
                      type="button"
                      onClick={() =>
                        goToUserPage(userOffset + USER_PAGE_SIZE)
                      }
                      disabled={
                        usersLoading ||
                        userOffset + adminUsers.length >= userTotal
                      }
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* USER ROLE ASSIGNMENT EDITOR */}
            {selectedRoleUserId && (
              <section className="admin-permission-editor">
                <div className="admin-permission-editor-heading">
                  <div>
                    <span className="admin-kicker">
                      USER ROLE ASSIGNMENT
                    </span>

                    <h3>
                      Manage roles for{' '}
                      {adminUsers.find(
                        (item) => item.id === selectedRoleUserId,
                      )?.displayName || 'Selected user'}
                    </h3>

                    <p>
                      Select all the roles this user should have. Unchecked
                      roles will be removed when you save.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="admin-secondary-button"
                    onClick={() => {
                      setSelectedRoleUserId(null)
                      setSelectedUserRoleIds([])
                      setUserRoleError('')
                    }}
                    disabled={userRoleSaving}
                  >
                    Close
                  </button>
                </div>

                {userRoleError && (
                  <div className="admin-message admin-error" role="alert">
                    {userRoleError}
                  </div>
                )}

                {userRoleEditorLoading ? (
                  <div className="admin-empty-panel">
                    Loading available roles…
                  </div>
                ) : (
                  <>
                    <div className="admin-permission-toolbar">
                      <span>
                        <strong>{selectedUserRoleIds.length}</strong> role(s)
                        selected
                      </span>

                      <div>
                        <button
                          type="button"
                          className="admin-secondary-button"
                          onClick={() =>
                            setSelectedUserRoleIds(
                              adminRoles.map((role) => role.id),
                            )
                          }
                          disabled={userRoleSaving}
                        >
                          Select all
                        </button>

                        <button
                          type="button"
                          className="admin-secondary-button"
                          onClick={() => setSelectedUserRoleIds([])}
                          disabled={userRoleSaving}
                        >
                          Clear all
                        </button>
                      </div>
                    </div>

                    <div className="admin-permission-groups">
                      <div className="admin-permission-group">
                        <h4>Available marketplace roles</h4>

                        {adminRoles.map((role) => (
                          <label
                            className="admin-permission-option"
                            key={role.id}
                          >
                            <input
                              type="checkbox"
                              checked={selectedUserRoleIds.includes(role.id)}
                              onChange={(event) =>
                                toggleUserRole(
                                  role.id,
                                  event.target.checked,
                                )
                              }
                              disabled={userRoleSaving}
                            />

                            <span>
                              <strong>{role.roleName}</strong>
                              <small>{role.roleKey}</small>

                              {role.description && <p>{role.description}</p>}

                              {role.roleKey === 'super_admin' && (
                                <p>
                                  Warning: this role grants full administrator
                                  access.
                                </p>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="admin-permission-actions">
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => {
                          setSelectedRoleUserId(null)
                          setSelectedUserRoleIds([])
                          setUserRoleError('')
                        }}
                        disabled={userRoleSaving}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="admin-primary-button"
                        onClick={() => void handleSaveUserRoles()}
                        disabled={userRoleSaving}
                      >
                        {userRoleSaving ? 'Saving roles…' : 'Save user roles'}
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
          </section>
        )}

        {/* ROLE MANAGEMENT */}
        {section === 'roles' && (
          <section className="admin-users-section">
            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">ACCESS CONTROL</span>
                <h2>Role Management</h2>
                <p className="admin-users-description">
                  Create custom roles and manage their permissions. The Super
                  Admin system role is protected.
                </p>
              </div>

              <button
                className="admin-secondary-button"
                type="button"
                onClick={() => void loadRoles()}
                disabled={rolesLoading}
              >
                {rolesLoading ? 'Loading…' : '↻ Refresh roles'}
              </button>
            </div>

            {rolesError && (
              <div className="admin-message admin-error" role="alert">
                {rolesError}
                <button
                  className="admin-secondary-button"
                  type="button"
                  onClick={() => void loadRoles()}
                  disabled={rolesLoading}
                >
                  Retry
                </button>
              </div>
            )}

            {!rolesError && rolesLoading && (
              <div className="admin-empty-panel" role="status">
                Loading roles and permissions…
              </div>
            )}

            {!rolesError && !rolesLoading && adminRoles.length === 0 && (
              <div className="admin-empty-panel">
                <h3>No roles returned</h3>
                <p>The role directory is empty. Refresh to try again.</p>
              </div>
            )}

            <form
              className="admin-create-role-form"
              onSubmit={handleCreateRole}
            >
              <div>
                <span className="admin-kicker">NEW ACCESS ROLE</span>
                <h3>Create a custom role</h3>
                <p>
                  Create an additional role for users with a specific
                  responsibility on the marketplace.
                </p>
              </div>

              <label>
                Role name
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(event) => setNewRoleName(event.target.value)}
                  placeholder="e.g. Customer Support"
                  minLength={3}
                  maxLength={60}
                  required
                  disabled={roleCreating}
                />
              </label>

              <label>
                Description
                <textarea
                  value={newRoleDescription}
                  onChange={(event) =>
                    setNewRoleDescription(event.target.value)
                  }
                  placeholder="Explain what this role is responsible for..."
                  maxLength={250}
                  rows={3}
                  disabled={roleCreating}
                />
              </label>

              <button
                className="admin-primary-button"
                type="submit"
                disabled={roleCreating || newRoleName.trim().length < 3}
              >
                {roleCreating ? 'Creating role…' : '+ Create role'}
              </button>

              <small>
                New roles are created without permissions initially.
              </small>
            </form>

            {!rolesError && adminRoles.length > 0 && (
              <div className="admin-role-grid">
                {adminRoles.map((role) => (
                  <article className="admin-role-card" key={role.id}>
                    <div className="admin-role-card-header">
                      <span className="admin-kicker">ROLE</span>
                      <span className="admin-role-user-count">
                        {role.userCount} user{role.userCount === 1 ? '' : 's'}
                      </span>
                    </div>

                    <h3>{role.roleName}</h3>

                    {role.roleKey === 'super_admin' ? (
                      <span className="admin-protected-role">
                        🔒 Protected system role
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="admin-secondary-button admin-manage-permissions-button"
                        onClick={() => void openPermissionEditor(role)}
                      >
                        Manage Permissions
                      </button>
                    )}

                    <code className="admin-role-key">{role.roleKey}</code>

                    <p className="admin-role-description">
                      {role.description || 'No description provided.'}
                    </p>

                    <div className="admin-role-permissions-heading">
                      <strong>
                        Permissions ({role.permissions.length})
                      </strong>
                    </div>

                    {role.permissions.length > 0 ? (
                      <ul className="admin-role-permissions">
                        {role.permissions.map((permission) => (
                          <li key={permission.key}>
                            <strong>{permission.name}</strong>
                            <code>{permission.key}</code>
                            {permission.description && (
                              <p>{permission.description}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="admin-muted">
                        No permissions assigned.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ROLE PERMISSION EDITOR */}
        {section === 'roles' && renderPermissionEditor()}

        {/* LISTING MODERATION */}
        {section === 'moderation' && (
          <AdminListingModeration onNotice={setNotice} />
        )}

        {/* CATEGORY MANAGEMENT */}
        {section === 'categories' && (
          <AdminCategoryManagement onNotice={setNotice} />
        )}

        {/* PLATFORM SETTINGS */}
        {section === 'settings' && (
          <AdminSettingsManagement />
        )}

        {/* REPORTS AND ANALYTICS */}
        {section === 'reports' && (
          <AdminReports />
        )}

        {/* AUTOMATION CONTROL */}
{section === 'automation' && (
  <AdminAutomation onNotice={setNotice} />
)}

{/* AUTOMATION RULES */}
{section === 'automation-rules' && (
  <AdminAutomationRules onNotice={setNotice} />
)}

{/* AUTOMATION MONITORING */}
{section === 'automation-monitoring' && (
  <AdminAutomationMonitoring />
)}

        {/* AUDIT LOGS */}
        {section === 'audit' && (
          <section className="admin-audit-section">
            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">SECURITY AND ACCOUNTABILITY</span>
                <h2>Audit Logs</h2>
                <p className="admin-users-description">
                  Review administrative activity recorded by the marketplace.
                  Use the filters to find specific events.
                </p>
              </div>

              <span className="admin-live-label">
                <span /> Protected records
              </span>
            </div>

            <form
              className="admin-audit-filters"
              onSubmit={applyAuditFilters}
            >
              <label className="admin-audit-field">
                Search activity
                <input
                  type="search"
                  value={auditSearch}
                  onChange={(event) => setAuditSearch(event.target.value)}
                  placeholder="Administrator, action or target"
                  maxLength={100}
                />
              </label>

              <label className="admin-audit-field">
                Action type
                <select
                  value={auditAction}
                  onChange={(event) => setAuditAction(event.target.value)}
                >
                  <option value="">All actions</option>
                  {auditActions.map((action) => (
                    <option value={action} key={action}>
                      {formatAction(action)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-audit-field">
                Start date
                <input
                  type="date"
                  value={auditStartDate}
                  max={auditEndDate || undefined}
                  onChange={(event) => setAuditStartDate(event.target.value)}
                />
              </label>

              <label className="admin-audit-field">
                End date
                <input
                  type="date"
                  value={auditEndDate}
                  min={auditStartDate || undefined}
                  onChange={(event) => setAuditEndDate(event.target.value)}
                />
              </label>

              <div className="admin-audit-filter-actions">
                <button
                  className="admin-primary-button"
                  type="submit"
                  disabled={auditLoading}
                >
                  {auditLoading ? 'Searching…' : 'Apply filters'}
                </button>

                <button
                  className="admin-secondary-button"
                  type="button"
                  onClick={resetAuditFilters}
                  disabled={auditLoading}
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="admin-audit-summary">
              <span>
                {auditLoading
                  ? 'Loading activity…'
                  : `${auditTotal.toLocaleString()} audit record${
                      auditTotal === 1 ? '' : 's'
                    } found`}
              </span>

              <button
                className="admin-secondary-button"
                type="button"
                onClick={() =>
                  void loadAuditLogs(
                    auditSearch,
                    auditAction,
                    auditStartDate,
                    auditEndDate,
                    auditOffset,
                  )
                }
                disabled={auditLoading}
              >
                ↻ Refresh activity
              </button>
            </div>

            {auditError && (
              <div className="admin-message admin-error" role="alert">
                {auditError}
              </div>
            )}

            {!auditError && auditLoading && (
              <div className="admin-empty-panel" role="status">
                Loading protected audit records…
              </div>
            )}

            {!auditError && !auditLoading && auditLogs.length === 0 && (
              <div className="admin-empty-panel">
                <h3>No audit records found</h3>
                <p>
                  No activity matches the selected filters. Try changing your
                  search or date range.
                </p>
              </div>
            )}

            {!auditError && auditLogs.length > 0 && (
              <>
                <div className="admin-audit-table-wrap">
                  <table className="admin-audit-table">
                    <thead>
                      <tr>
                        <th scope="col">Administrator</th>
                        <th scope="col">Action</th>
                        <th scope="col">Target</th>
                        <th scope="col">Date and time</th>
                        <th scope="col">Details</th>
                      </tr>
                    </thead>

                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <div className="admin-audit-actor">
                              <strong>{log.actorDisplayName}</strong>
                              <span>
                                {log.actorEmail || 'Email unavailable'}
                              </span>
                              <small>
                                {log.actorUserId
                                  ? `Administrator ID: ${log.actorUserId}`
                                  : 'Account no longer linked'}
                              </small>
                            </div>
                          </td>

                          <td>
                            <span className="admin-audit-action">
                              {formatAction(log.actionKey)}
                            </span>
                          </td>

                          <td>
                            <div className="admin-audit-target">
                              <strong>{log.targetType}</strong>
                              <span>ID: {log.targetId || '—'}</span>
                            </div>
                          </td>

                          <td>
                            <div className="admin-audit-date">
                              {formatDate(log.createdAt)}
                            </div>
                          </td>

                          <td>
                            <button
                              type="button"
                              className="admin-secondary-button admin-audit-details-button"
                              aria-expanded={expandedAuditId === log.id}
                              onClick={() =>
                                setExpandedAuditId((current) =>
                                  current === log.id ? null : log.id,
                                )
                              }
                            >
                              {expandedAuditId === log.id
                                ? 'Hide details'
                                : 'View details'}
                            </button>

                            {expandedAuditId === log.id && (
                              <div className="admin-audit-details">
                                <pre>
                                  {JSON.stringify(log.details ?? {}, null, 2)}
                                </pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="admin-audit-pagination">
                  <span>
                    Showing {auditOffset + 1}–
                    {auditOffset + auditLogs.length} of {auditTotal}
                  </span>

                  <div>
                    <button
                      type="button"
                      className="admin-secondary-button"
                      onClick={() =>
                        goToAuditPage(auditOffset - AUDIT_PAGE_SIZE)
                      }
                      disabled={auditLoading || auditOffset === 0}
                    >
                      ← Previous
                    </button>

                    <button
                      type="button"
                      className="admin-secondary-button"
                      onClick={() =>
                        goToAuditPage(auditOffset + AUDIT_PAGE_SIZE)
                      }
                      disabled={auditLoading || !auditHasMore}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </>
            )}

            {auditGeneratedAt && (
              <p className="admin-audit-generated">
                Records retrieved: {formatDate(auditGeneratedAt)}
              </p>
            )}
          </section>
        )}

        {/* FOOTER */}
        <footer className="admin-footer">
          <span>SMART HELP MARKET BY BIGMAZ</span>

          <span>
            {section === 'users'
              ? 'User directory'
              : section === 'roles'
                ? 'Role and permission directory'
                : section === 'moderation'
                  ? 'Listing moderation workspace'
                  : section === 'categories'
                    ? 'Marketplace category administration'
                    : section === 'settings'
                      ? 'Marketplace configuration'
                      : section === 'reports'
                        ? 'Reports and operational analytics'
                        : section === 'audit'
                          ? 'Administrative audit activity'
                          : section === 'automation'
  ? 'Marketplace automation control'
  : section === 'automation-rules'
    ? 'Marketplace automation rules'
    : section === 'automation-monitoring'
      ? 'Marketplace automation monitoring'
      : 'Last refreshed: ' +
                        (overview
                          ? new Date().toLocaleTimeString('en-NG', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Not available')}
          </span>
        </footer>
      </section>
    </main>
  )
}

export default AdminApp
