
import { Router } from 'express'
import { getDatabasePool } from '../database'
import { requirePermission } from '../auth/requirePermission'

const adminRouter = Router()

// Protected authorization test endpoint.
adminRouter.get(
  '/status',
  requirePermission('dashboard.view'),
  (_req, res) => {
    res.status(200).json({
      status: 'ok',
      message: 'Permission-based authorization successful.',
      access: 'permission_based',
    })
  },
)

// Protected dashboard overview using live database counts.
adminRouter.get(
  '/overview',
  requirePermission('dashboard.view'),
  async (_req, res) => {
    try {
      const db = getDatabasePool()

      const [
        usersResult,
        listingsResult,
        categoriesResult,
        sessionsResult,
      ] = await Promise.all([
        db.query(
          `SELECT
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE account_status = 'active')::text AS active
           FROM public.marketplace_users`,
        ),
        db.query(
          `SELECT
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE status = 'published')::text AS published
           FROM public.marketplace_listings`,
        ),
        db.query(
          `SELECT COUNT(*)::text AS total
           FROM public.marketplace_categories`,
        ),
        db.query(
          `SELECT COUNT(*)::text AS total
           FROM public.marketplace_sessions
           WHERE expires_at > NOW()`,
        ),
      ])

      res.status(200).json({
        status: 'ok',
        overview: {
          users: {
            total: Number(usersResult.rows[0]?.total ?? 0),
            active: Number(usersResult.rows[0]?.active ?? 0),
          },
          listings: {
            total: Number(listingsResult.rows[0]?.total ?? 0),
            published: Number(listingsResult.rows[0]?.published ?? 0),
          },
          categories: {
            total: Number(categoriesResult.rows[0]?.total ?? 0),
          },
          activeSessions: Number(sessionsResult.rows[0]?.total ?? 0),
        },
        generatedAt: new Date().toISOString(),
      })
    } catch (error: unknown) {
      console.error(
        'Admin overview failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      res.status(500).json({
        error: 'Dashboard overview could not be loaded.',
      })
    }
  },
)

// Protected user directory.
adminRouter.get(
  '/users',
  requirePermission('users.view'),
  async (req, res) => {
    try {
      const searchValue =
        typeof req.query.search === 'string'
          ? req.query.search.trim().slice(0, 100)
          : ''

      const allowedStatuses = ['active', 'suspended', 'disabled'] as const
      type AccountStatus = (typeof allowedStatuses)[number]

      const statusValue =
        typeof req.query.status === 'string' ? req.query.status : 'all'

      if (
        statusValue !== 'all' &&
        !allowedStatuses.includes(statusValue as AccountStatus)
      ) {
        res.status(400).json({ error: 'Invalid account status filter.' })
        return
      }

      const parsedLimit = Number(req.query.limit ?? 25)
      const parsedOffset = Number(req.query.offset ?? 0)

      if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > 100 ||
        !Number.isInteger(parsedOffset) ||
        parsedOffset < 0 ||
        parsedOffset > 1_000_000
      ) {
        res.status(400).json({ error: 'Invalid pagination values.' })
        return
      }

      const db = getDatabasePool()
      const values: (string | number)[] = []
      const conditions: string[] = []

      if (searchValue) {
        values.push(`%${searchValue}%`)
        conditions.push(
          `(u.display_name ILIKE $${values.length}
            OR u.email ILIKE $${values.length})`,
        )
      }

      if (statusValue !== 'all') {
        values.push(statusValue)
        conditions.push(`u.account_status = $${values.length}`)
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : ''

      const countResult = await db.query(
        `SELECT COUNT(*)::text AS total
         FROM public.marketplace_users u
         ${whereClause}`,
        values,
      )

      const total = Number(countResult.rows[0]?.total ?? 0)
      const dataValues = [...values, parsedLimit, parsedOffset]

      const usersResult = await db.query(
        `SELECT
           u.user_id::text AS id,
           u.display_name AS "displayName",
           u.email,
           u.account_status AS "accountStatus",
           (u.email_verified_at IS NOT NULL) AS "emailVerified",
           u.last_login_at AS "lastLoginAt",
           u.created_at AS "createdAt",
           COALESCE(
             array_agg(DISTINCT r.role_key)
               FILTER (WHERE r.role_key IS NOT NULL),
             ARRAY[]::text[]
           ) AS roles
         FROM public.marketplace_users u
         LEFT JOIN public.marketplace_user_roles ur
           ON ur.user_id = u.user_id
         LEFT JOIN public.marketplace_roles r
           ON r.role_id = ur.role_id
         ${whereClause}
         GROUP BY
           u.user_id,
           u.display_name,
           u.email,
           u.account_status,
           u.email_verified_at,
           u.last_login_at,
           u.created_at
         ORDER BY u.created_at DESC, u.user_id DESC
         LIMIT $${values.length + 1}
         OFFSET $${values.length + 2}`,
        dataValues,
      )

      res.status(200).json({
        status: 'ok',
        users: usersResult.rows,
        pagination: {
          total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + usersResult.rows.length < total,
        },
      })
    } catch (error: unknown) {
      console.error(
        'Admin user directory failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      res.status(500).json({
        error: 'User directory could not be loaded.',
      })
    }
  },
)

// Change a user's account status.
// Protect the last active Super Admin from suspension.
adminRouter.patch(
  '/users/:userId/status',
  requirePermission('users.manage'),
  async (req, res) => {
    const targetUserIdParam = req.params.userId
    const targetUserId =
      typeof targetUserIdParam === 'string' ? targetUserIdParam : ''

    const actorUserId = String(res.locals.authenticatedUserId ?? '')
    const requestedAction = req.body?.action

    if (!/^[1-9]\d*$/.test(targetUserId)) {
      res.status(400).json({ error: 'Invalid user ID.' })
      return
    }

    if (requestedAction !== 'suspend' && requestedAction !== 'reactivate') {
      res.status(400).json({
        error: 'Action must be suspend or reactivate.',
      })
      return
    }

    if (!actorUserId || targetUserId === actorUserId) {
      res.status(400).json({
        error: 'You cannot change your own account status here.',
      })
      return
    }

    const db = getDatabasePool()
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      // Serialize role removal and account suspension.
      await client.query(
        'SELECT pg_advisory_xact_lock($1::bigint)',
        [748291635],
      )

      const userResult = await client.query(
        `SELECT
           u.user_id::text AS id,
           u.account_status AS "accountStatus",
           EXISTS (
             SELECT 1
             FROM public.marketplace_user_roles ur
             JOIN public.marketplace_roles r
               ON r.role_id = ur.role_id
             WHERE ur.user_id = u.user_id
               AND r.role_key = 'super_admin'
           ) AS "isSuperAdmin"
         FROM public.marketplace_users u
         WHERE u.user_id = $1
         FOR UPDATE`,
        [targetUserId],
      )

      const target = userResult.rows[0] as
        | {
            id: string
            accountStatus: string
            isSuperAdmin: boolean
          }
        | undefined

      if (!target) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'User not found.' })
        return
      }

      let newStatus: 'active' | 'suspended'

      if (requestedAction === 'suspend') {
        if (target.accountStatus !== 'active') {
          await client.query('ROLLBACK')
          res.status(409).json({
            error: 'Only active accounts can be suspended.',
          })
          return
        }

        // Never suspend the last active Super Admin.
        if (target.isSuperAdmin) {
          const adminCountResult = await client.query(
            `SELECT COUNT(DISTINCT u.user_id)::text AS total
             FROM public.marketplace_users u
             JOIN public.marketplace_user_roles ur
               ON ur.user_id = u.user_id
             JOIN public.marketplace_roles r
               ON r.role_id = ur.role_id
             WHERE u.account_status = 'active'
               AND r.role_key = 'super_admin'`,
          )

          const activeSuperAdminCount = Number(
            adminCountResult.rows[0]?.total ?? 0,
          )

          if (activeSuperAdminCount <= 1) {
            await client.query('ROLLBACK')
            res.status(409).json({
              error:
                'The last active Super Admin cannot be suspended. Assign another active Super Admin first.',
            })
            return
          }
        }

        newStatus = 'suspended'
      } else {
        if (target.accountStatus !== 'suspended') {
          await client.query('ROLLBACK')
          res.status(409).json({
            error: 'Only suspended accounts can be reactivated.',
          })
          return
        }

        newStatus = 'active'
      }

      await client.query(
        `UPDATE public.marketplace_users
         SET account_status = $1, updated_at = NOW()
         WHERE user_id = $2`,
        [newStatus, targetUserId],
      )

      // Revoke all existing sessions after a status change.
      await client.query(
        `DELETE FROM public.marketplace_sessions
         WHERE user_id = $1`,
        [targetUserId],
      )

      // Record the action in the audit log.
      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          actorUserId,
          requestedAction === 'suspend'
            ? 'user.account_suspended'
            : 'user.account_reactivated',
          'marketplace_user',
          targetUserId,
          JSON.stringify({
            previousStatus: target.accountStatus,
            newStatus,
            targetWasSuperAdmin: target.isSuperAdmin,
          }),
        ],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message:
          newStatus === 'suspended'
            ? 'User account suspended successfully.'
            : 'User account reactivated successfully.',
        user: {
          id: targetUserId,
          accountStatus: newStatus,
        },
      })
    } catch (error: unknown) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original error.
      }

      console.error(
        'Admin account-status change failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Account status could not be changed.',
      })
    } finally {
      client.release()
    }
  },
)

// Protected role directory.
adminRouter.get(
  '/roles',
  requirePermission('roles.view'),
  async (_req, res) => {
    try {
      const db = getDatabasePool()

      const result = await db.query(
        `SELECT
           r.role_id::text AS id,
           r.role_key AS "roleKey",
           r.role_name AS "roleName",
           r.description,
           COUNT(DISTINCT ur.user_id)::text AS "userCount",
           COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'key', p.permission_key,
                 'name', p.permission_name,
                 'description', p.description
               )
               ORDER BY p.permission_key
             ) FILTER (WHERE p.permission_id IS NOT NULL),
             '[]'::jsonb
           ) AS permissions
         FROM public.marketplace_roles r
         LEFT JOIN public.marketplace_user_roles ur
           ON ur.role_id = r.role_id
         LEFT JOIN public.marketplace_role_permissions rp
           ON rp.role_id = r.role_id
         LEFT JOIN public.marketplace_permissions p
           ON p.permission_id = rp.permission_id
         GROUP BY r.role_id, r.role_key, r.role_name, r.description
         ORDER BY
           CASE r.role_key
             WHEN 'super_admin' THEN 1
             WHEN 'listing_manager' THEN 2
             WHEN 'member' THEN 3
             ELSE 4
           END,
           r.role_name`,
      )

      res.status(200).json({
        status: 'ok',
        roles: result.rows.map((role) => ({
          ...role,
          userCount: Number(role.userCount),
        })),
        generatedAt: new Date().toISOString(),
      })
    } catch (error: unknown) {
      console.error(
        'Admin role directory failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      res.status(500).json({
        error: 'Role directory could not be loaded.',
      })
    }
  },
)

// Create a custom role. System roles are reserved.
adminRouter.post(
  '/roles',
  requirePermission('roles.manage'),
  async (req, res) => {
    const actorUserId = String(res.locals.authenticatedUserId ?? '')
    const roleName =
      typeof req.body?.roleName === 'string'
        ? req.body.roleName.trim()
        : ''
    const description =
      typeof req.body?.description === 'string'
        ? req.body.description.trim()
        : ''

    if (!actorUserId) {
      res.status(401).json({ error: 'Administrator session is required.' })
      return
    }

    if (roleName.length < 3 || roleName.length > 60) {
      res.status(400).json({
        error: 'Role name must be between 3 and 60 characters.',
      })
      return
    }

    if (description.length > 250) {
      res.status(400).json({
        error: 'Role description must not exceed 250 characters.',
      })
      return
    }

    // Generate a predictable, URL/database-safe key from the role name.
    const roleKey = roleName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    if (!roleKey || roleKey.length > 60) {
      res.status(400).json({
        error: 'Role name cannot be converted into a valid role key.',
      })
      return
    }

    const reservedRoleKeys = [
      'super_admin',
      'listing_manager',
      'member',
    ]

    if (reservedRoleKeys.includes(roleKey)) {
      res.status(409).json({
        error: 'This role key is reserved for a system role.',
      })
      return
    }

    const db = getDatabasePool()
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const existing = await client.query(
        `SELECT role_id
         FROM public.marketplace_roles
         WHERE role_key = $1
         FOR UPDATE`,
        [roleKey],
      )

      if (existing.rows.length > 0) {
        await client.query('ROLLBACK')
        res.status(409).json({
          error: 'A role with this name or role key already exists.',
        })
        return
      }

      const created = await client.query(
        `INSERT INTO public.marketplace_roles
           (role_key, role_name, description)
         VALUES ($1, $2, $3)
         RETURNING
           role_id::text AS id,
           role_key AS "roleKey",
           role_name AS "roleName",
           description`,
        [roleKey, roleName, description],
      )

      const role = created.rows[0]

      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          actorUserId,
          'role.created',
          'marketplace_role',
          role.id,
          JSON.stringify({
            roleKey: role.roleKey,
            roleName: role.roleName,
          }),
        ],
      )

      await client.query('COMMIT')

      res.status(201).json({
        status: 'ok',
        message: 'Custom role created successfully.',
        role: {
          ...role,
          userCount: 0,
          permissions: [],
        },
      })
    } catch (error: unknown) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original error.
      }

      const databaseError = error as { code?: string }

      if (databaseError.code === '23505') {
        res.status(409).json({
          error: 'A role with this name or role key already exists.',
        })
        return
      }

      console.error(
        'Custom role creation failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      res.status(500).json({
        error: 'Custom role could not be created.',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * Return the complete permission catalogue.
 */
adminRouter.get(
  '/permissions',
  requirePermission('roles.view'),
  async (_req, res) => {
    try {
      const db = getDatabasePool()

      const result = await db.query(
        `SELECT
           permission_key AS key,
           permission_name AS name,
           description
         FROM public.marketplace_permissions
         ORDER BY permission_key`,
      )

      res.status(200).json({
        status: 'ok',
        permissions: result.rows,
        total: result.rows.length,
      })
    } catch (error: unknown) {
      console.error(
        'Permission catalogue failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Permission catalogue could not be loaded.',
      })
    }
  },
)

/**
 * Replace the permissions assigned to a role.
 * The Super Administrator role is protected.
 */
adminRouter.put(
  '/roles/:roleId/permissions',
  requirePermission('roles.manage'),
  async (req, res) => {
    const roleIdParam = req.params.roleId
    const roleId =
      typeof roleIdParam === 'string' ? roleIdParam : ''

    const actorUserId = String(res.locals.authenticatedUserId ?? '')
    const requestedKeys: unknown = req.body?.permissionKeys

    if (!/^[1-9]\d*$/.test(roleId)) {
      res.status(400).json({ error: 'Invalid role ID.' })
      return
    }

    if (!actorUserId) {
      res.status(401).json({
        error: 'Administrator session is required.',
      })
      return
    }

    if (
      !Array.isArray(requestedKeys) ||
      requestedKeys.length > 100 ||
      !requestedKeys.every(
        (key): key is string =>
          typeof key === 'string' &&
          /^[a-z0-9_.-]{1,100}$/.test(key),
      )
    ) {
      res.status(400).json({
        error: 'Permission keys must be an array of valid permission keys.',
      })
      return
    }

    if (new Set(requestedKeys).size !== requestedKeys.length) {
      res.status(400).json({
        error: 'Duplicate permission keys are not allowed.',
      })
      return
    }

    const permissionKeys = requestedKeys as string[]
    const db = getDatabasePool()
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      const roleResult = await client.query(
        `SELECT
           role_id::text AS id,
           role_key AS "roleKey",
           role_name AS "roleName"
         FROM public.marketplace_roles
         WHERE role_id = $1
         FOR UPDATE`,
        [roleId],
      )

      const role = roleResult.rows[0] as
        | {
            id: string
            roleKey: string
            roleName: string
          }
        | undefined

      if (!role) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Role not found.' })
        return
      }

      if (role.roleKey === 'super_admin') {
        await client.query('ROLLBACK')
        res.status(403).json({
          error: 'Super Administrator permissions are protected.',
        })
        return
      }

      const permissionResult = await client.query(
        `SELECT permission_id, permission_key
         FROM public.marketplace_permissions
         WHERE permission_key = ANY($1::text[])`,
        [permissionKeys],
      )

      if (permissionResult.rows.length !== permissionKeys.length) {
        await client.query('ROLLBACK')

        const foundKeys = permissionResult.rows.map(
          (permission) => permission.permission_key,
        )

        const invalidKeys = permissionKeys.filter(
          (key) => !foundKeys.includes(key),
        )

        res.status(400).json({
          error: 'One or more permissions do not exist.',
          invalidPermissionKeys: invalidKeys,
        })
        return
      }

      const previousResult = await client.query(
        `SELECT p.permission_key
         FROM public.marketplace_role_permissions rp
         JOIN public.marketplace_permissions p
           ON p.permission_id = rp.permission_id
         WHERE rp.role_id = $1
         ORDER BY p.permission_key`,
        [roleId],
      )

      const previousKeys = previousResult.rows.map(
        (permission) => permission.permission_key as string,
      )

      await client.query(
        `DELETE FROM public.marketplace_role_permissions
         WHERE role_id = $1`,
        [roleId],
      )

      if (permissionKeys.length > 0) {
        await client.query(
          `INSERT INTO public.marketplace_role_permissions
             (role_id, permission_id)
           SELECT $1, permission_id
           FROM public.marketplace_permissions
           WHERE permission_key = ANY($2::text[])`,
          [roleId, permissionKeys],
        )
      }

      const newKeys = [...permissionKeys].sort()

      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          actorUserId,
          'role.permissions_updated',
          'marketplace_role',
          roleId,
          JSON.stringify({
            roleKey: role.roleKey,
            roleName: role.roleName,
            previousPermissionKeys: previousKeys,
            newPermissionKeys: newKeys,
          }),
        ],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: 'Role permissions updated successfully.',
        role: {
          id: role.id,
          roleKey: role.roleKey,
          roleName: role.roleName,
          permissionKeys: newKeys,
          permissionCount: newKeys.length,
        },
      })
    } catch (error: unknown) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original error.
      }

      console.error(
        'Role permission update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'Role permissions could not be updated.',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * Replace the roles assigned to a marketplace user.
 * All changes are transactional and recorded in the audit log.
 */
adminRouter.put(
  '/users/:userId/roles',
  requirePermission('users.manage'),
  async (req, res) => {
    const userIdParam = req.params.userId
    const targetUserId =
      typeof userIdParam === 'string' ? userIdParam : ''

    const actorUserId = String(res.locals.authenticatedUserId ?? '')
    const requestedRoleIds: unknown = req.body?.roleIds

    if (!/^[1-9]\d*$/.test(targetUserId)) {
      res.status(400).json({ error: 'Invalid user ID.' })
      return
    }

    if (!actorUserId) {
      res.status(401).json({
        error: 'Administrator session is required.',
      })
      return
    }

    if (targetUserId === actorUserId) {
      res.status(403).json({
        error: 'You cannot change your own roles here.',
      })
      return
    }

    if (
      !Array.isArray(requestedRoleIds) ||
      requestedRoleIds.length > 50 ||
      !requestedRoleIds.every(
        (id): id is string =>
          typeof id === 'string' && /^[1-9]\d*$/.test(id),
      )
    ) {
      res.status(400).json({
        error: 'Role IDs must be an array of valid role IDs.',
      })
      return
    }

    if (new Set(requestedRoleIds).size !== requestedRoleIds.length) {
      res.status(400).json({
        error: 'Duplicate role assignments are not allowed.',
      })
      return
    }

    const roleIds = requestedRoleIds as string[]
    const db = getDatabasePool()
    const client = await db.connect()

    try {
      await client.query('BEGIN')

      // Serialize role changes to protect the last Super Admin.
      await client.query(
        'SELECT pg_advisory_xact_lock($1::bigint)',
        [748291635],
      )

      const userResult = await client.query(
        `SELECT
           user_id::text AS id,
           display_name AS "displayName",
           account_status AS "accountStatus"
         FROM public.marketplace_users
         WHERE user_id = $1
         FOR UPDATE`,
        [targetUserId],
      )

      const targetUser = userResult.rows[0] as
        | {
            id: string
            displayName: string
            accountStatus: string
          }
        | undefined

      if (!targetUser) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'User not found.' })
        return
      }

      if (targetUser.accountStatus !== 'active') {
        await client.query('ROLLBACK')
        res.status(409).json({
          error: 'Roles can only be changed for active user accounts.',
        })
        return
      }

      const requestedRolesResult = await client.query(
        `SELECT
           role_id::text AS id,
           role_key AS "roleKey",
           role_name AS "roleName"
         FROM public.marketplace_roles
         WHERE role_id = ANY($1::bigint[])
         ORDER BY role_key`,
        [roleIds],
      )

      if (requestedRolesResult.rows.length !== roleIds.length) {
        await client.query('ROLLBACK')

        const foundIds = requestedRolesResult.rows.map(
          (role) => String(role.id),
        )

        const invalidRoleIds = roleIds.filter(
          (id) => !foundIds.includes(id),
        )

        res.status(400).json({
          error: 'One or more selected roles do not exist.',
          invalidRoleIds,
        })
        return
      }

      const previousResult = await client.query(
        `SELECT
           r.role_id::text AS id,
           r.role_key AS "roleKey",
           r.role_name AS "roleName"
         FROM public.marketplace_user_roles ur
         JOIN public.marketplace_roles r
           ON r.role_id = ur.role_id
         WHERE ur.user_id = $1
         ORDER BY r.role_key`,
        [targetUserId],
      )

      const previousRoles = previousResult.rows as {
        id: string
        roleKey: string
        roleName: string
      }[]

      const previousRoleKeys = previousRoles.map(
        (role) => role.roleKey,
      )

      const newRoleKeys = requestedRolesResult.rows.map(
        (role: { roleKey: string }) => role.roleKey,
      )

      // Do not allow the last active Super Admin to lose that role.
      const previouslySuperAdmin =
        previousRoleKeys.includes('super_admin')

      const remainsSuperAdmin =
        newRoleKeys.includes('super_admin')

      if (previouslySuperAdmin && !remainsSuperAdmin) {
        const adminCountResult = await client.query(
          `SELECT COUNT(DISTINCT u.user_id)::text AS total
           FROM public.marketplace_users u
           JOIN public.marketplace_user_roles ur
             ON ur.user_id = u.user_id
           JOIN public.marketplace_roles r
             ON r.role_id = ur.role_id
           WHERE u.account_status = 'active'
             AND r.role_key = 'super_admin'`,
        )

        const activeSuperAdminCount = Number(
          adminCountResult.rows[0]?.total ?? 0,
        )

        if (activeSuperAdminCount <= 1) {
          await client.query('ROLLBACK')
          res.status(409).json({
            error: 'The last active Super Admin cannot lose this role.',
          })
          return
        }
      }

      await client.query(
        `DELETE FROM public.marketplace_user_roles
         WHERE user_id = $1`,
        [targetUserId],
      )

      if (roleIds.length > 0) {
        await client.query(
          `INSERT INTO public.marketplace_user_roles
             (user_id, role_id)
           SELECT $1, role_id
           FROM public.marketplace_roles
           WHERE role_id = ANY($2::bigint[])`,
          [targetUserId, roleIds],
        )
      }

      const sortedPreviousKeys = [...previousRoleKeys].sort()
      const sortedNewKeys = [...newRoleKeys].sort()

      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          actorUserId,
          'user.roles_updated',
          'marketplace_user',
          targetUserId,
          JSON.stringify({
            displayName: targetUser.displayName,
            previousRoleKeys: sortedPreviousKeys,
            newRoleKeys: sortedNewKeys,
          }),
        ],
      )

      await client.query('COMMIT')

      res.status(200).json({
        status: 'ok',
        message: 'User roles updated successfully.',
        user: {
          id: targetUserId,
          displayName: targetUser.displayName,
          roles: requestedRolesResult.rows.map(
            (role: {
              id: string
              roleKey: string
              roleName: string
            }) => ({
              id: role.id,
              roleKey: role.roleKey,
              roleName: role.roleName,
            }),
          ),
        },
      })
    } catch (error: unknown) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original error.
      }

      console.error(
        'User role assignment failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )

      res.status(500).json({
        error: 'User roles could not be updated.',
      })
    } finally {
      client.release()
    }
  },
)

export default adminRouter
