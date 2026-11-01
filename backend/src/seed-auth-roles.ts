
import { getDatabasePool } from './database'

const roles = [
  {
    key: 'super_admin',
    name: 'Super Administrator',
    description: 'Full administrative access to the marketplace.',
  },
  {
    key: 'listing_manager',
    name: 'Listing Manager',
    description: 'Manage and review marketplace listings.',
  },
  {
    key: 'member',
    name: 'Marketplace Member',
    description: 'Basic access for an ordinary marketplace account.',
  },
] as const

const permissions = [
  {
    key: 'dashboard.view',
    name: 'View Admin Dashboard',
    description: 'Access the administration dashboard.',
  },
  {
    key: 'users.view',
    name: 'View Users',
    description: 'View marketplace user accounts.',
  },
  {
    key: 'users.manage',
    name: 'Manage Users',
    description: 'Change user account status and manage accounts.',
  },
  {
    key: 'roles.view',
    name: 'View Roles',
    description: 'View roles and permission assignments.',
  },
  {
    key: 'roles.manage',
    name: 'Manage Roles',
    description: 'Manage role and permission assignments.',
  },
  {
    key: 'listings.view',
    name: 'View Listings',
    description: 'View marketplace listings.',
  },
  {
    key: 'listings.review',
    name: 'Review Listings',
    description: 'Approve or reject submitted listings.',
  },
  {
    key: 'listings.manage',
    name: 'Manage Listings',
    description: 'Manage marketplace listing records.',
  },
  {
    key: 'categories.view',
    name: 'View Categories',
    description: 'View marketplace categories.',
  },
  {
    key: 'categories.manage',
    name: 'Manage Categories',
    description: 'Create, update, or deactivate categories.',
  },
  {
    key: 'settings.view',
    name: 'View Platform Settings',
    description: 'View platform configuration.',
  },
  {
    key: 'settings.manage',
    name: 'Manage Platform Settings',
    description: 'Change platform configuration.',
  },
  {
    key: 'audit.view',
    name: 'View Audit Logs',
    description: 'Review administrative audit events.',
  },
  {
    key: 'profile.view_own',
    name: 'View Own Profile',
    description: 'View the signed-in user profile.',
  },
  {
    key: 'profile.manage_own',
    name: 'Manage Own Profile',
    description: 'Update permitted details of the signed-in user.',
  },
  {
    key: 'listings.create',
    name: 'Create Listings',
    description: 'Create marketplace listing submissions.',
  },
  {
    key: 'listings.manage_own',
    name: 'Manage Own Listings',
    description: 'Manage listings owned by the signed-in user.',
  },
  {
    key: 'reports.view',
    name: 'View Operational Reports',
    description: 'View marketplace growth, performance trends and analytical reports.',
  },
  {
    key: 'automation.view',
    name: 'View Automation',
    description: 'View automation events, workflow rules and execution history.',
  },
    {
    key: 'automation.manage',
    name: 'Manage Automation',
    description: 'Control automation processing and manage automation operations.',
  },
  {
    key: 'notifications.view',
    name: 'View Notifications',
    description: 'View administrator-wide marketplace notifications.',
  },
  {
    key: 'notifications.manage',
    name: 'Manage Notifications',
    description: 'Create and manage administrator-wide marketplace announcements.',
  },
] as const

async function seedAuthRoles() {
  const db = getDatabasePool()

  try {
    await db.query('BEGIN')

    // Register roles.
    for (const role of roles) {
      await db.query(
        `
          INSERT INTO public.marketplace_roles (
            role_key,
            role_name,
            description
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (role_key) DO NOTHING
        `,
        [role.key, role.name, role.description],
      )
    }

    // Register permissions.
    for (const permission of permissions) {
      await db.query(
        `
          INSERT INTO public.marketplace_permissions (
            permission_key,
            permission_name,
            description
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (permission_key) DO NOTHING
        `,
        [
          permission.key,
          permission.name,
          permission.description,
        ],
      )
    }

    // Give Super Admin every permission in this catalogue.
    await db.query(
      `
        INSERT INTO public.marketplace_role_permissions (
          role_id,
          permission_id
        )
        SELECT r.role_id, p.permission_id
        FROM public.marketplace_roles AS r
        CROSS JOIN public.marketplace_permissions AS p
        WHERE r.role_key = 'super_admin'
        ON CONFLICT (role_id, permission_id) DO NOTHING
      `,
    )

    // Listing Managers retain their existing limited permissions.
    await db.query(
      `
        INSERT INTO public.marketplace_role_permissions (
          role_id,
          permission_id
        )
        SELECT r.role_id, p.permission_id
        FROM public.marketplace_roles AS r
        JOIN public.marketplace_permissions AS p
          ON p.permission_key = ANY($1::text[])
        WHERE r.role_key = 'listing_manager'
        ON CONFLICT (role_id, permission_id) DO NOTHING
      `,
      [[
        'dashboard.view',
        'listings.view',
        'listings.review',
        'listings.manage',
        'categories.view',
      ]],
    )

    // Members retain basic self-service permissions.
    await db.query(
      `
        INSERT INTO public.marketplace_role_permissions (
          role_id,
          permission_id
        )
        SELECT r.role_id, p.permission_id
        FROM public.marketplace_roles AS r
        JOIN public.marketplace_permissions AS p
          ON p.permission_key = ANY($1::text[])
        WHERE r.role_key = 'member'
        ON CONFLICT (role_id, permission_id) DO NOTHING
      `,
      [[
        'profile.view_own',
        'profile.manage_own',
        'listings.view',
        'listings.create',
        'listings.manage_own',
      ]],
    )

    // Verify roles.
    const roleResult = await db.query<{
      role_key: string
      role_name: string
    }>(
      `
        SELECT role_key, role_name
        FROM public.marketplace_roles
        WHERE role_key = ANY($1::text[])
        ORDER BY role_key
      `,
      [roles.map((role) => role.key)],
    )

    // Verify all permissions in the catalogue.
    const permissionResult = await db.query<{
      permission_key: string
    }>(
      `
        SELECT permission_key
        FROM public.marketplace_permissions
        WHERE permission_key = ANY($1::text[])
      `,
      [permissions.map((permission) => permission.key)],
    )

    // Verify Super Admin permission assignments.
    const superAdminResult = await db.query<{
      permission_count: string
    }>(
      `
        SELECT COUNT(*)::text AS permission_count
        FROM public.marketplace_role_permissions AS rp
        JOIN public.marketplace_roles AS r
          ON r.role_id = rp.role_id
        WHERE r.role_key = 'super_admin'
      `,
    )

    // Verify automation permissions are not assigned
    // to Listing Manager or Member by this seed.
    const restrictedRoleResult = await db.query<{
      role_key: string
      permission_key: string
    }>(
      `
        SELECT
          r.role_key,
          p.permission_key
        FROM public.marketplace_role_permissions rp
        JOIN public.marketplace_roles r
          ON r.role_id = rp.role_id
        JOIN public.marketplace_permissions p
          ON p.permission_id = rp.permission_id
        WHERE r.role_key IN ('listing_manager', 'member')
          AND p.permission_key IN (
            'automation.view',
            'automation.manage'
          )
      `,
    )

    if (roleResult.rows.length !== roles.length) {
      throw new Error('Role verification failed.')
    }

    if (permissionResult.rows.length !== permissions.length) {
      throw new Error('Permission verification failed.')
    }

    if (
      Number(superAdminResult.rows[0]?.permission_count) !==
      permissions.length
    ) {
      throw new Error(
        'Super Admin permission assignment verification failed.',
      )
    }

    if (restrictedRoleResult.rows.length > 0) {
      throw new Error(
        'Automation permissions were found on restricted roles.',
      )
    }

    await db.query('COMMIT')

    console.log('AUTHENTICATION ROLES AND PERMISSIONS SEEDED')
    console.log(`Verified roles: ${roleResult.rows.length}`)
    console.log(`Verified permissions: ${permissionResult.rows.length}`)
    console.log(
      `Super Admin permissions: ${superAdminResult.rows[0].permission_count}`,
    )
    console.log('Automation permissions: REGISTERED')
    console.log('Restricted roles: VERIFIED')

    for (const role of roleResult.rows) {
      console.log(`${role.role_key} | ${role.role_name}`)
    }

    console.log('No user account was created.')
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await db.end()
  }
}

seedAuthRoles().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown seed error'

  console.error('AUTHENTICATION ROLE SEED FAILED:', message)
  process.exitCode = 1
})
